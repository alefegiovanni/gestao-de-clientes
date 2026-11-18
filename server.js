const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Funções auxiliares para formatação e competência (ciclo de consórcio: 16 a 15)
// Do dia 16 em diante, já conta para o mês seguinte (ex: 16 de Novembro -> Dezembro)
function extrairCompetencia(dataStr) {
  if (!dataStr) return '';
  const partes = dataStr.split('-');
  if (partes.length !== 3) return dataStr.substring(0, 7);

  let ano = parseInt(partes[0], 10);
  let mes = parseInt(partes[1], 10);
  const dia = parseInt(partes[2], 10);

  if (dia >= 16) {
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }

  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function obterCompetenciaAtual() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return extrairCompetencia(`${ano}-${mes}-${dia}`);
}

function obterUsuarioAuth(req) {
  const authId = req.headers['x-usuario-id'] || req.query.usuarioAuthId;
  if (!authId) return null;
  try {
    return db.prepare('SELECT id, nome, usuario, perfil FROM usuarios WHERE id = ?').get(authId);
  } catch (e) {
    return null;
  }
}

function obterFiltroVendedor(req) {
  const user = obterUsuarioAuth(req);
  if (!user) return { vendedorId: null, isVendedor: false, isGerente: false, user: null };
  if (user.perfil === 'vendedor') {
    return { vendedorId: user.id, isVendedor: true, isGerente: false, user };
  }
  // Gerente
  const f = req.query.vendedorId;
  const vId = (f && f !== 'todos' && !isNaN(f)) ? Number(f) : null;
  return { vendedorId: vId, isVendedor: false, isGerente: true, user };
}

// 0. Autenticação por Usuário e Senha de 4 dígitos
app.post('/api/login', (req, res) => {
  try {
    const { usuario, senha } = req.body;
    const userLimpo = (usuario || '').trim().toLowerCase();
    const passLimpo = String(senha || '').trim();

    let u = null;
    try {
      u = db.prepare('SELECT id, nome, usuario, senha, perfil, primeiro_acesso FROM usuarios WHERE usuario = ? COLLATE NOCASE').get(userLimpo);
    } catch (e) {}

    if (u) {
      if (String(u.senha).trim() === passLimpo) {
        return res.json({
          success: true,
          message: 'Acesso autorizado!',
          usuario: {
            id: u.id,
            nome: u.nome,
            usuario: u.usuario,
            perfil: u.perfil,
            primeiroAcesso: u.primeiro_acesso === 1
          }
        });
      } else {
        return res.status(401).json({ error: 'Senha incorreta.' });
      }
    }

    // Fallback caso usuário ainda não conste na tabela
    const conf = db.prepare('SELECT valor FROM config WHERE chave = ?').get('senha_acesso');
    const senhaValida = conf ? conf.valor : '3105';
    if (userLimpo === 'giovanni' && passLimpo === senhaValida) {
      return res.json({
        success: true,
        message: 'Acesso autorizado!',
        usuario: { id: 1, nome: 'Giovanni', usuario: 'giovanni', perfil: 'vendedor' }
      });
    }
    if (userLimpo === 'gerente' && passLimpo === senhaValida) {
      return res.json({
        success: true,
        message: 'Acesso autorizado!',
        usuario: { id: 2, nome: 'Gerente', usuario: 'gerente', perfil: 'gerente' }
      });
    }

    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LISTAR VENDEDORES (Para filtros e seleção)
app.get('/api/vendedores', (req, res) => {
  try {
    const vendedores = db.prepare(`
      SELECT id, nome, usuario, comissao_padrao_pct 
      FROM usuarios 
      WHERE perfil = 'vendedor' 
      ORDER BY nome ASC
    `).all();
    res.json(vendedores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GERENCIAMENTO DE USUÁRIOS (Exclusivo da Gerente)
app.get('/api/usuarios', (req, res) => {
  try {
    const userAuth = obterUsuarioAuth(req);
    if (!userAuth || userAuth.perfil !== 'gerente') {
      return res.status(403).json({ error: 'Acesso restrito à Gerente.' });
    }
    const usuarios = db.prepare(`
      SELECT id, nome, usuario, perfil, criado_em, primeiro_acesso, comissao_padrao_pct 
      FROM usuarios 
      ORDER BY id ASC
    `).all();
    res.json(usuarios);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usuarios', (req, res) => {
  try {
    const userAuth = obterUsuarioAuth(req);
    if (!userAuth || userAuth.perfil !== 'gerente') {
      return res.status(403).json({ error: 'Acesso restrito à Gerente.' });
    }
    const { nome, usuario, senha, perfil, comissaoPadraoPct } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'O nome é obrigatório.' });
    if (!usuario || !usuario.trim()) return res.status(400).json({ error: 'O usuário de login é obrigatório.' });
    if (!senha || !/^\d{4}$/.test(String(senha).trim())) {
      return res.status(400).json({ error: 'A senha deve conter exatamente 4 números.' });
    }
    const perfilValido = perfil === 'gerente' ? 'gerente' : 'vendedor';
    const userNorm = usuario.trim().toLowerCase();
    const comPadrao = comissaoPadraoPct !== undefined && comissaoPadraoPct !== '' ? parseFloat(comissaoPadraoPct) : 1.0;

    const existe = db.prepare('SELECT id FROM usuarios WHERE usuario = ? COLLATE NOCASE').get(userNorm);
    if (existe) return res.status(400).json({ error: 'Este nome de usuário já está cadastrado.' });

    const insert = db.prepare('INSERT INTO usuarios (nome, usuario, senha, perfil, comissao_padrao_pct) VALUES (?, ?, ?, ?, ?)');
    const result = insert.run(nome.trim(), userNorm, String(senha).trim(), perfilValido, comPadrao);

    res.status(201).json({
      success: true,
      message: 'Usuário cadastrado com sucesso!',
      usuario: { id: result.lastInsertRowid, nome: nome.trim(), usuario: userNorm, perfil: perfilValido, comissao_padrao_pct: comPadrao }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/usuarios/:id', (req, res) => {
  try {
    const userAuth = obterUsuarioAuth(req);
    if (!userAuth || userAuth.perfil !== 'gerente') {
      return res.status(403).json({ error: 'Acesso restrito à Gerente.' });
    }
    const userId = req.params.id;
    const { nome, usuario, senha, perfil, comissaoPadraoPct } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'O nome é obrigatório.' });
    if (!usuario || !usuario.trim()) return res.status(400).json({ error: 'O usuário de login é obrigatório.' });
    const userNorm = usuario.trim().toLowerCase();

    const outro = db.prepare('SELECT id FROM usuarios WHERE usuario = ? COLLATE NOCASE AND id != ?').get(userNorm, userId);
    if (outro) return res.status(400).json({ error: 'Este nome de usuário já pertence a outro membro.' });

    const perfilValido = perfil === 'gerente' ? 'gerente' : 'vendedor';
    const comPadrao = comissaoPadraoPct !== undefined && comissaoPadraoPct !== '' ? parseFloat(comissaoPadraoPct) : 1.0;

    if (senha && String(senha).trim()) {
      if (!/^\d{4}$/.test(String(senha).trim())) {
        return res.status(400).json({ error: 'A nova senha deve conter exatamente 4 números.' });
      }
      db.prepare('UPDATE usuarios SET nome = ?, usuario = ?, senha = ?, perfil = ?, comissao_padrao_pct = ? WHERE id = ?')
        .run(nome.trim(), userNorm, String(senha).trim(), perfilValido, comPadrao, userId);
    } else {
      db.prepare('UPDATE usuarios SET nome = ?, usuario = ?, perfil = ?, comissao_padrao_pct = ? WHERE id = ?')
        .run(nome.trim(), userNorm, perfilValido, comPadrao, userId);
    }

    // Se for vendedor e comissão padrão foi alterada, atualiza as vendas do vendedor
    if (perfilValido === 'vendedor') {
      db.prepare('UPDATE vendas SET comissao_vendedor_pct = ? WHERE vendedor_id = ?')
        .run(comPadrao, userId);
    }

    res.json({ success: true, message: 'Usuário atualizado com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/usuarios/:id', (req, res) => {
  try {
    const userAuth = obterUsuarioAuth(req);
    if (!userAuth || userAuth.perfil !== 'gerente') {
      return res.status(403).json({ error: 'Acesso restrito à Gerente.' });
    }
    const userId = req.params.id;

    // Verificar se usuário existe
    const usuarioAlvo = db.prepare('SELECT id, nome, perfil FROM usuarios WHERE id = ?').get(userId);
    if (!usuarioAlvo) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const totalVendas = db.prepare('SELECT count(*) as count FROM vendas WHERE vendedor_id = ?').get(userId).count;
    if (totalVendas > 0) {
      return res.status(400).json({ 
        error: `Não é possível excluir este usuário pois ele possui ${totalVendas} venda(s) registrada(s). Você pode alterar a senha dele para impedir o acesso.` 
      });
    }

    db.prepare('DELETE FROM usuarios WHERE id = ?').run(userId);
    res.json({ success: true, message: 'Usuário excluído com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rota para troca de senha no primeiro acesso
app.post('/api/alterar-senha-primeiro-acesso', (req, res) => {
  try {
    const userAuth = obterUsuarioAuth(req);
    if (!userAuth) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }
    const { novaSenha } = req.body;
    if (!novaSenha || !/^\d{4}$/.test(String(novaSenha).trim())) {
      return res.status(400).json({ error: 'A nova senha deve conter exatamente 4 números.' });
    }

    db.prepare('UPDATE usuarios SET senha = ?, primeiro_acesso = 0 WHERE id = ?')
      .run(String(novaSenha).trim(), userAuth.id);

    res.json({ success: true, message: 'Senha atualizada com sucesso! Bem-vindo(a) ao sistema.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/alterar-pin', (req, res) => {
  try {
    const { pinAtual, novoPin } = req.body;
    if (!novoPin || !/^\d{4}$/.test(String(novoPin))) {
      return res.status(400).json({ error: 'A nova senha deve conter exatamente 4 números.' });
    }
    const conf = db.prepare('SELECT valor FROM config WHERE chave = ?').get('senha_acesso');
    const senhaValida = conf ? conf.valor : '3105';

    if (String(pinAtual) !== String(senhaValida)) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }

    db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
      .run('senha_acesso', String(novoPin));
    res.json({ success: true, message: 'Senha alterada com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Obter opções auxiliares (Formas de pagamento e Formas de captação)
app.get('/api/opcoes', (req, res) => {
  try {
    const pagamentos = db.prepare('SELECT id, nome FROM pagamentos ORDER BY nome').all();
    const captacoes = db.prepare('SELECT id, nome FROM captacoes ORDER BY nome').all();
    res.json({ pagamentos, captacoes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar nova opção de pagamento
app.post('/api/opcoes/pagamentos', (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const insert = db.prepare('INSERT INTO pagamentos (nome) VALUES (?)');
    const result = insert.run(nome.trim());
    res.json({ id: result.lastInsertRowid, nome: nome.trim() });
  } catch (err) {
    res.status(400).json({ error: 'Forma de pagamento já existe ou inválida' });
  }
});

// Excluir opção de pagamento
app.delete('/api/opcoes/pagamentos/:id', (req, res) => {
  try {
    const id = req.params.id;
    const emUso = db.prepare('SELECT count(*) as count FROM vendas WHERE pagamento_id = ?').get(id).count;
    if (emUso > 0) {
      return res.status(400).json({
        error: `Não é possível excluir esta forma de pagamento pois ela está vinculada a ${emUso} venda(s) cadastrada(s).`
      });
    }
    db.prepare('DELETE FROM pagamentos WHERE id = ?').run(id);
    res.json({ success: true, message: 'Forma de pagamento excluída com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar nova opção de captação
app.post('/api/opcoes/captacoes', (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    const insert = db.prepare('INSERT INTO captacoes (nome) VALUES (?)');
    const result = insert.run(nome.trim());
    res.json({ id: result.lastInsertRowid, nome: nome.trim() });
  } catch (err) {
    res.status(400).json({ error: 'Forma de captação já existe ou inválida' });
  }
});

// Excluir opção de captação
app.delete('/api/opcoes/captacoes/:id', (req, res) => {
  try {
    const id = req.params.id;
    const emUso = db.prepare('SELECT count(*) as count FROM vendas WHERE captacao_id = ?').get(id).count;
    if (emUso > 0) {
      return res.status(400).json({
        error: `Não é possível excluir este canal de captação pois ele está vinculado a ${emUso} venda(s) cadastrada(s).`
      });
    }
    db.prepare('DELETE FROM captacoes WHERE id = ?').run(id);
    res.json({ success: true, message: 'Forma de captação excluída com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. DASHBOARD - Indicadores e Resumo de Comissões
app.get('/api/dashboard', (req, res) => {
  try {
    const { vendedorId, isGerente, user } = obterFiltroVendedor(req);
    const competenciaAtual = obterCompetenciaAtual();

    let sqlVendasQuery = 'SELECT COALESCE(SUM(valor_credito), 0) as total_mes FROM vendas WHERE mes_ano_competencia = ?';
    let sqlQtdQuery = 'SELECT COUNT(*) as qtd_vendas FROM vendas';
    let sqlTicketQuery = 'SELECT COALESCE(AVG(valor_credito), 0) as ticket_medio FROM vendas';
    let sqlClientesQuery = 'SELECT COUNT(DISTINCT cliente_id) as qtd_clientes FROM vendas';

    const pVendas = [competenciaAtual];
    const pQtd = [];
    const pTicket = [];
    const pClientes = [];

    if (vendedorId) {
      sqlVendasQuery += ' AND vendedor_id = ?';
      pVendas.push(vendedorId);
      sqlQtdQuery += ' WHERE vendedor_id = ?';
      pQtd.push(vendedorId);
      sqlTicketQuery += ' WHERE vendedor_id = ?';
      pTicket.push(vendedorId);
      sqlClientesQuery += ' WHERE vendedor_id = ?';
      pClientes.push(vendedorId);
    }

    const sqlVendasMes = db.prepare(sqlVendasQuery).get(...pVendas);
    const sqlQtdVendas = db.prepare(sqlQtdQuery).get(...pQtd);
    const sqlTicketMedio = db.prepare(sqlTicketQuery).get(...pTicket);
    const sqlClientes = db.prepare(sqlClientesQuery).get(...pClientes);

    // Cálculos de Comissão
    let totalComissaoVendedor = 0;
    let totalComissaoGerente = 0;

    if (isGerente) {
      // Gerente vê sua comissão geral ou do vendedor filtrado
      let sqlComissaoGerente = 'SELECT COALESCE(SUM(valor_credito * (comissao_gerente_pct / 100.0)), 0) as total FROM vendas WHERE 1=1';
      const pCG = [];
      if (vendedorId) {
        sqlComissaoGerente += ' AND vendedor_id = ?';
        pCG.push(vendedorId);
      }
      totalComissaoGerente = db.prepare(sqlComissaoGerente).get(...pCG).total;

      // Também calcula comissão dos vendedores
      let sqlComissaoVend = 'SELECT COALESCE(SUM(valor_credito * (comissao_vendedor_pct / 100.0)), 0) as total FROM vendas WHERE 1=1';
      const pCV = [];
      if (vendedorId) {
        sqlComissaoVend += ' AND vendedor_id = ?';
        pCV.push(vendedorId);
      }
      totalComissaoVendedor = db.prepare(sqlComissaoVend).get(...pCV).total;
    } else if (user) {
      // Vendedor comum vê apenas a sua comissão
      const sqlComissaoVend = db.prepare('SELECT COALESCE(SUM(valor_credito * (comissao_vendedor_pct / 100.0)), 0) as total FROM vendas WHERE vendedor_id = ?').get(user.id);
      totalComissaoVendedor = sqlComissaoVend ? sqlComissaoVend.total : 0;
    }

    res.json({
      competenciaAtual,
      vendasNoMes: sqlVendasMes.total_mes,
      quantidadeVendas: sqlQtdVendas.qtd_vendas,
      ticketMedio: sqlTicketMedio.ticket_medio,
      clientesCadastrados: sqlClientes.qtd_clientes,
      totalComissaoVendedor,
      totalComissaoGerente,
      isGerente
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CADASTRAR NOVA VENDA
app.post('/api/vendas', (req, res) => {
  try {
    const userAuth = obterUsuarioAuth(req);
    const {
      nomeCliente,
      valorCredito,
      formaPagamentoId,
      numeroCota,
      numeroGrupo,
      dataVenda,
      numeroContrato,
      formaCaptacaoId,
      mesAnoCompetencia: mesCompetenciaInformado,
      vendedorId: vendedorEscolhido,
      comissaoVendedorPct,
      comissaoMeses,
      comissaoGerentePct
    } = req.body;

    // Se for vendedor, obrigatoriamente vincula a si mesmo. Se for gerente, pode escolher ou assume o seu id.
    let vendedorIdFinal = userAuth ? userAuth.id : 1;
    if (userAuth && userAuth.perfil === 'gerente' && vendedorEscolhido) {
      vendedorIdFinal = Number(vendedorEscolhido);
    }

    // Porcentagens de comissão (autonomia da gerente)
    let comVendPct = 0;
    let comMesesQtd = 1;
    let comGerPct = 0;

    if (userAuth && userAuth.perfil === 'gerente') {
      comVendPct = comissaoVendedorPct !== undefined && comissaoVendedorPct !== '' ? parseFloat(comissaoVendedorPct) : 1.0;
      comMesesQtd = comissaoMeses ? parseInt(comissaoMeses, 10) : 1;
      comGerPct = comissaoGerentePct !== undefined && comissaoGerentePct !== '' ? parseFloat(comissaoGerentePct) : 0.5;
    } else {
      // Se for vendedor cadastrando, herda a comissão padrão definida para ele
      const vendData = db.prepare('SELECT comissao_padrao_pct FROM usuarios WHERE id = ?').get(vendedorIdFinal);
      comVendPct = vendData ? vendData.comissao_padrao_pct : 1.0;
      comMesesQtd = 1;
      comGerPct = 0.5;
    }

    // Validações obrigatórias
    if (!nomeCliente || !nomeCliente.trim()) {
      return res.status(400).json({ error: 'O nome do cliente é obrigatório.' });
    }
    const valCreditoNum = parseFloat(valorCredito);
    if (isNaN(valCreditoNum) || valCreditoNum <= 0) {
      return res.status(400).json({ error: 'O valor do crédito deve ser um número positivo.' });
    }
    if (!formaPagamentoId) {
      return res.status(400).json({ error: 'Selecione a forma de pagamento.' });
    }
    if (!numeroCota || !numeroCota.trim()) {
      return res.status(400).json({ error: 'O número da cota é obrigatório.' });
    }
    if (!numeroGrupo || !numeroGrupo.trim()) {
      return res.status(400).json({ error: 'O número do grupo é obrigatório.' });
    }
    if (!dataVenda || !/^\d{4}-\d{2}-\d{2}$/.test(dataVenda)) {
      return res.status(400).json({ error: 'Data de venda inválida. Utilize o formato correto.' });
    }
    if (!numeroContrato || !numeroContrato.trim()) {
      return res.status(400).json({ error: 'O número do contrato é obrigatório.' });
    }
    if (!formaCaptacaoId) {
      return res.status(400).json({ error: 'Selecione a forma de captação.' });
    }

    const contratoNormalizado = numeroContrato.trim();
    const cotaNormalizada = numeroCota.trim();
    const grupoNormalizado = numeroGrupo.trim();
    const clienteNormalizado = nomeCliente.trim();
    let mesAnoCompetencia = mesCompetenciaInformado;
    if (!mesAnoCompetencia || !/^\d{4}-\d{2}$/.test(mesAnoCompetencia)) {
      mesAnoCompetencia = extrairCompetencia(dataVenda);
    }

    // Transação para consistência
    const insertTransaction = db.transaction(() => {
      // 1. Verificar duplicidade de contrato
      const contratoExistente = db.prepare('SELECT id FROM contratos WHERE numero = ?').get(contratoNormalizado);
      if (contratoExistente) {
        throw new Error(`O contrato número "${contratoNormalizado}" já está cadastrado no sistema. Não é permitida a duplicidade de contratos.`);
      }

      // 2. Cliente: buscar existente ou inserir
      let cliente = db.prepare('SELECT id FROM clientes WHERE nome = ? COLLATE NOCASE').get(clienteNormalizado);
      if (!cliente) {
        const resCliente = db.prepare('INSERT INTO clientes (nome) VALUES (?)').run(clienteNormalizado);
        cliente = { id: resCliente.lastInsertRowid };
      }

      // 3. Grupo: buscar existente ou inserir
      let grupo = db.prepare('SELECT id FROM grupos WHERE numero = ?').get(grupoNormalizado);
      if (!grupo) {
        const resGrupo = db.prepare('INSERT INTO grupos (numero) VALUES (?)').run(grupoNormalizado);
        grupo = { id: resGrupo.lastInsertRowid };
      }

      // 4. Cota: buscar existente no grupo ou inserir
      let cota = db.prepare('SELECT id FROM cotas WHERE grupo_id = ? AND numero = ?').get(grupo.id, cotaNormalizada);
      if (!cota) {
        const resCota = db.prepare('INSERT INTO cotas (grupo_id, numero) VALUES (?, ?)').run(grupo.id, cotaNormalizada);
        cota = { id: resCota.lastInsertRowid };
      }

      // 5. Contrato: inserir
      const resContrato = db.prepare('INSERT INTO contratos (numero, cliente_id) VALUES (?, ?)').run(contratoNormalizado, cliente.id);
      const contratoId = resContrato.lastInsertRowid;

      // 6. Venda: inserir com vendedor_id e comissões
      const resVenda = db.prepare(`
        INSERT INTO vendas (
          cliente_id,
          contrato_id,
          cota_id,
          pagamento_id,
          captacao_id,
          valor_credito,
          data_venda,
          mes_ano_competencia,
          vendedor_id,
          comissao_vendedor_pct,
          comissao_meses,
          comissao_gerente_pct
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cliente.id,
        contratoId,
        cota.id,
        formaPagamentoId,
        formaCaptacaoId,
        valCreditoNum,
        dataVenda,
        mesAnoCompetencia,
        vendedorIdFinal,
        comVendPct,
        comMesesQtd,
        comGerPct
      );

      return resVenda.lastInsertRowid;
    });

    const novaVendaId = insertTransaction();
    res.status(201).json({
      success: true,
      vendaId: novaVendaId,
      message: 'Venda cadastrada com sucesso!'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ATUALIZAR/EDITAR VENDA
app.put('/api/vendas/:id', (req, res) => {
  try {
    const userAuth = obterUsuarioAuth(req);
    const vendaId = req.params.id;
    const {
      nomeCliente,
      valorCredito,
      formaPagamentoId,
      numeroCota,
      numeroGrupo,
      dataVenda,
      numeroContrato,
      formaCaptacaoId,
      mesAnoCompetencia: mesCompetenciaInformado,
      vendedorId: vendedorEscolhido
    } = req.body;

    if (!nomeCliente || !nomeCliente.trim()) return res.status(400).json({ error: 'O nome do cliente é obrigatório.' });
    const valCreditoNum = parseFloat(valorCredito);
    if (isNaN(valCreditoNum) || valCreditoNum <= 0) return res.status(400).json({ error: 'O valor do crédito deve ser positivo.' });
    if (!formaPagamentoId) return res.status(400).json({ error: 'Selecione a forma de pagamento.' });
    if (!numeroCota || !numeroCota.trim()) return res.status(400).json({ error: 'O número da cota é obrigatório.' });
    if (!numeroGrupo || !numeroGrupo.trim()) return res.status(400).json({ error: 'O número do grupo é obrigatório.' });
    if (!dataVenda || !/^\d{4}-\d{2}-\d{2}$/.test(dataVenda)) return res.status(400).json({ error: 'Data de venda inválida.' });
    if (!numeroContrato || !numeroContrato.trim()) return res.status(400).json({ error: 'O número do contrato é obrigatório.' });
    if (!formaCaptacaoId) return res.status(400).json({ error: 'Selecione a forma de captação.' });

    const contratoNormalizado = numeroContrato.trim();
    const cotaNormalizada = numeroCota.trim();
    const grupoNormalizado = numeroGrupo.trim();
    const clienteNormalizado = nomeCliente.trim();
    let mesAnoCompetencia = mesCompetenciaInformado;
    if (!mesAnoCompetencia || !/^\d{4}-\d{2}$/.test(mesAnoCompetencia)) {
      mesAnoCompetencia = extrairCompetencia(dataVenda);
    }

    const updateTransaction = db.transaction(() => {
      const vendaAtual = db.prepare('SELECT id, contrato_id, vendedor_id FROM vendas WHERE id = ?').get(vendaId);
      if (!vendaAtual) throw new Error('Venda não encontrada.');

      // Se vendedor comum, só edita a sua
      if (userAuth && userAuth.perfil === 'vendedor' && vendaAtual.vendedor_id !== userAuth.id) {
        throw new Error('Você só pode editar as suas próprias vendas.');
      }

      // Checar se contrato colide com OUTRO contrato
      const contratoExistente = db.prepare('SELECT id FROM contratos WHERE numero = ? AND id != ?').get(contratoNormalizado, vendaAtual.contrato_id);
      if (contratoExistente) {
        throw new Error(`O contrato "${contratoNormalizado}" já pertence a outro registro.`);
      }

      // Cliente
      let cliente = db.prepare('SELECT id FROM clientes WHERE nome = ? COLLATE NOCASE').get(clienteNormalizado);
      if (!cliente) {
        const resCliente = db.prepare('INSERT INTO clientes (nome) VALUES (?)').run(clienteNormalizado);
        cliente = { id: resCliente.lastInsertRowid };
      }

      // Grupo
      let grupo = db.prepare('SELECT id FROM grupos WHERE numero = ?').get(grupoNormalizado);
      if (!grupo) {
        const resGrupo = db.prepare('INSERT INTO grupos (numero) VALUES (?)').run(grupoNormalizado);
        grupo = { id: resGrupo.lastInsertRowid };
      }

      // Cota
      let cota = db.prepare('SELECT id FROM cotas WHERE grupo_id = ? AND numero = ?').get(grupo.id, cotaNormalizada);
      if (!cota) {
        const resCota = db.prepare('INSERT INTO cotas (grupo_id, numero) VALUES (?, ?)').run(grupo.id, cotaNormalizada);
        cota = { id: resCota.lastInsertRowid };
      }

      // Atualizar Contrato
      db.prepare('UPDATE contratos SET numero = ?, cliente_id = ? WHERE id = ?').run(contratoNormalizado, cliente.id, vendaAtual.contrato_id);

      // Atualizar Venda
      let novoVendedorId = vendaAtual.vendedor_id;
      if (userAuth && userAuth.perfil === 'gerente' && vendedorEscolhido) {
        novoVendedorId = Number(vendedorEscolhido);
      }

      // Atualizar comissões se gerente enviou
      let comVendPct = vendaAtual.comissao_vendedor_pct || 0;
      let comMesesQtd = vendaAtual.comissao_meses || 1;
      let comGerPct = vendaAtual.comissao_gerente_pct || 0;

      if (userAuth && userAuth.perfil === 'gerente') {
        const { comissaoVendedorPct, comissaoMeses, comissaoGerentePct } = req.body;
        if (comissaoVendedorPct !== undefined && comissaoVendedorPct !== '') comVendPct = parseFloat(comissaoVendedorPct);
        if (comissaoMeses !== undefined && comissaoMeses !== '') comMesesQtd = parseInt(comissaoMeses, 10);
        if (comissaoGerentePct !== undefined && comissaoGerentePct !== '') comGerPct = parseFloat(comissaoGerentePct);
      }

      db.prepare(`
        UPDATE vendas SET
          cliente_id = ?,
          cota_id = ?,
          pagamento_id = ?,
          captacao_id = ?,
          valor_credito = ?,
          data_venda = ?,
          mes_ano_competencia = ?,
          vendedor_id = ?,
          comissao_vendedor_pct = ?,
          comissao_meses = ?,
          comissao_gerente_pct = ?
        WHERE id = ?
      `).run(
        cliente.id,
        cota.id,
        formaPagamentoId,
        formaCaptacaoId,
        valCreditoNum,
        dataVenda,
        mesAnoCompetencia,
        novoVendedorId,
        comVendPct,
        comMesesQtd,
        comGerPct,
        vendaId
      );
    });

    updateTransaction();
    res.json({ success: true, message: 'Venda atualizada com sucesso!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// EXCLUIR VENDA
app.delete('/api/vendas/:id', (req, res) => {
  try {
    const userAuth = obterUsuarioAuth(req);
    const vendaId = req.params.id;
    const venda = db.prepare('SELECT contrato_id, vendedor_id FROM vendas WHERE id = ?').get(vendaId);
    if (!venda) return res.status(404).json({ error: 'Venda não encontrada' });

    if (userAuth && userAuth.perfil === 'vendedor' && venda.vendedor_id !== userAuth.id) {
      return res.status(403).json({ error: 'Você só pode excluir as suas próprias vendas.' });
    }

    db.prepare('DELETE FROM vendas WHERE id = ?').run(vendaId);
    if (venda.contrato_id) {
      db.prepare('DELETE FROM contratos WHERE id = ?').run(venda.contrato_id);
    }
    res.json({ success: true, message: 'Venda excluída com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. CLIENTES - Listagem com busca por nome do cliente ou número do contrato
app.get('/api/clientes', (req, res) => {
  try {
    const { busca } = req.query;
    const { vendedorId } = obterFiltroVendedor(req);

    let query = `
      SELECT 
        v.id as venda_id,
        c.nome as cliente_nome,
        ct.numero as contrato_numero,
        cot.numero as cota_numero,
        g.numero as grupo_numero,
        v.valor_credito,
        v.data_venda,
        v.mes_ano_competencia,
        v.pagamento_id,
        v.captacao_id,
        v.vendedor_id,
        u.nome as vendedor_nome
      FROM vendas v
      JOIN clientes c ON v.cliente_id = c.id
      JOIN contratos ct ON v.contrato_id = ct.id
      JOIN cotas cot ON v.cota_id = cot.id
      JOIN grupos g ON cot.grupo_id = g.id
      LEFT JOIN usuarios u ON v.vendedor_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (vendedorId) {
      query += ` AND v.vendedor_id = ? `;
      params.push(vendedorId);
    }

    if (busca && busca.trim()) {
      query += ` AND (c.nome LIKE ? OR ct.numero LIKE ?) `;
      params.push(`%${busca.trim()}%`, `%${busca.trim()}%`);
    }

    query += ` ORDER BY v.data_venda DESC, v.id DESC `;

    const registros = db.prepare(query).all(...params);
    res.json(registros);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. CONTRATOS - Consulta com busca por nome ou número do contrato
app.get('/api/contratos', (req, res) => {
  try {
    const { busca } = req.query;
    const { vendedorId } = obterFiltroVendedor(req);

    let query = `
      SELECT 
        v.id as venda_id,
        ct.numero as contrato_numero,
        c.nome as cliente_nome,
        v.valor_credito,
        cot.numero as cota_numero,
        g.numero as grupo_numero,
        v.data_venda,
        p.nome as forma_pagamento,
        v.mes_ano_competencia,
        v.pagamento_id,
        v.captacao_id,
        v.vendedor_id,
        u.nome as vendedor_nome
      FROM vendas v
      JOIN clientes c ON v.cliente_id = c.id
      JOIN contratos ct ON v.contrato_id = ct.id
      JOIN cotas cot ON v.cota_id = cot.id
      JOIN grupos g ON cot.grupo_id = g.id
      JOIN pagamentos p ON v.pagamento_id = p.id
      LEFT JOIN usuarios u ON v.vendedor_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (vendedorId) {
      query += ` AND v.vendedor_id = ? `;
      params.push(vendedorId);
    }

    if (busca && busca.trim()) {
      query += ` AND (ct.numero LIKE ? OR c.nome LIKE ?) `;
      params.push(`%${busca.trim()}%`, `%${busca.trim()}%`);
    }

    query += ` ORDER BY v.data_venda DESC, ct.numero ASC `;

    const registros = db.prepare(query).all(...params);
    res.json(registros);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. RELATÓRIOS - SOMENTE DOIS INDICADORES:
// 1. Total vendido no mês (mês e ano selecionados)
// 2. Total geral vendido (todos os registros)
app.get('/api/relatorios', (req, res) => {
  try {
    const { mesAno } = req.query;
    const { vendedorId } = obterFiltroVendedor(req);

    let sqlGeralQuery = 'SELECT COALESCE(SUM(valor_credito), 0) as total_geral FROM vendas WHERE 1=1';
    const paramsGeral = [];
    if (vendedorId) {
      sqlGeralQuery += ' AND vendedor_id = ?';
      paramsGeral.push(vendedorId);
    }
    const sqlTotalGeral = db.prepare(sqlGeralQuery).get(...paramsGeral);

    let totalMesSelecionado = 0;
    if (mesAno && /^\d{4}-\d{2}$/.test(mesAno)) {
      let sqlMesQuery = 'SELECT COALESCE(SUM(valor_credito), 0) as total_mes FROM vendas WHERE mes_ano_competencia = ?';
      const paramsMes = [mesAno];
      if (vendedorId) {
        sqlMesQuery += ' AND vendedor_id = ?';
        paramsMes.push(vendedorId);
      }
      const sqlTotalMes = db.prepare(sqlMesQuery).get(...paramsMes);
      totalMesSelecionado = sqlTotalMes.total_mes;
    }

    res.json({
      mesAnoSelecionado: mesAno || null,
      totalMesSelecionado,
      totalGeral: sqlTotalGeral.total_geral
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. VENDAS POR MÊS (Permite ver todas as vendas ou filtrar por período)
app.get('/api/vendas-por-mes', (req, res) => {
  try {
    const { mesAno } = req.query;
    const { vendedorId } = obterFiltroVendedor(req);
    
    let mesesSql = 'SELECT DISTINCT mes_ano_competencia FROM vendas WHERE 1=1';
    const paramsMeses = [];
    if (vendedorId) {
      mesesSql += ' AND vendedor_id = ?';
      paramsMeses.push(vendedorId);
    }
    mesesSql += ' ORDER BY mes_ano_competencia DESC';
    const mesesDisponiveis = db.prepare(mesesSql).all(...paramsMeses).map(r => r.mes_ano_competencia);

    let query = `
      SELECT 
        v.id as venda_id,
        c.nome as cliente_nome,
        v.valor_credito,
        p.nome as forma_pagamento,
        cot.numero as cota_numero,
        g.numero as grupo_numero,
        v.data_venda,
        ct.numero as contrato_numero,
        cap.nome as forma_captacao,
        v.mes_ano_competencia,
        v.vendedor_id,
        u.nome as vendedor_nome,
        COALESCE(v.comissao_vendedor_pct, 0) as comissao_vendedor_pct,
        COALESCE(v.comissao_meses, 1) as comissao_meses,
        COALESCE(v.comissao_gerente_pct, 0) as comissao_gerente_pct
      FROM vendas v
      JOIN clientes c ON v.cliente_id = c.id
      JOIN contratos ct ON v.contrato_id = ct.id
      JOIN cotas cot ON v.cota_id = cot.id
      JOIN grupos g ON cot.grupo_id = g.id
      JOIN pagamentos p ON v.pagamento_id = p.id
      JOIN captacoes cap ON v.captacao_id = cap.id
      LEFT JOIN usuarios u ON v.vendedor_id = u.id
      WHERE 1=1
    `;

    const params = [];
    if (vendedorId) {
      query += ` AND v.vendedor_id = ? `;
      params.push(vendedorId);
    }

    if (mesAno && mesAno !== 'todas') {
      query += ` AND v.mes_ano_competencia = ? `;
      params.push(mesAno);
    }

    query += ` ORDER BY v.data_venda DESC, v.id DESC `;

    const vendas = db.prepare(query).all(...params);

    res.json({
      mesSelecionado: mesAno || 'todas',
      mesesDisponiveis,
      vendas
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Servir frontend para qualquer outra rota (SPA fallback)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Sistema de Gestão de Vendas de Consórcios rodando na porta ${PORT}`);
});
