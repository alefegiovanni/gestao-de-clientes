const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Funções auxiliares para formatação e competência
function extrairCompetencia(dataStr) {
  // dataStr formato YYYY-MM-DD
  if (!dataStr || dataStr.length < 7) return '';
  return dataStr.substring(0, 7); // 'YYYY-MM'
}

// 0. Autenticação por Usuário e Senha de 4 dígitos
app.post('/api/login', (req, res) => {
  try {
    const { usuario, senha } = req.body;
    const userLimpo = (usuario || '').trim().toLowerCase();
    const passLimpo = String(senha || '').trim();

    const conf = db.prepare('SELECT valor FROM config WHERE chave = ?').get('senha_acesso');
    const senhaValida = conf ? conf.valor : '3105';

    if (userLimpo === 'giovanni' && passLimpo === senhaValida) {
      return res.json({ success: true, message: 'Acesso autorizado!' });
    } else {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }
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

// 2. DASHBOARD - 4 Indicadores
app.get('/api/dashboard', (req, res) => {
  try {
    // Competência atual baseada no mês e ano atuais
    const agora = new Date();
    const anoAtual = agora.getFullYear();
    const mesAtual = String(agora.getMonth() + 1).padStart(2, '0');
    const competenciaAtual = `${anoAtual}-${mesAtual}`;

    // Card 1: Vendas no mês (soma valor dos créditos no mês atual)
    const sqlVendasMes = db.prepare(`
      SELECT COALESCE(SUM(valor_credito), 0) as total_mes
      FROM vendas
      WHERE mes_ano_competencia = ?
    `).get(competenciaAtual);

    // Card 2: Quantidade de vendas cadastradas no sistema
    const sqlQtdVendas = db.prepare(`
      SELECT COUNT(*) as qtd_vendas
      FROM vendas
    `).get();

    // Card 3: Ticket médio (calcular automaticamente o valor médio dos créditos)
    const sqlTicketMedio = db.prepare(`
      SELECT COALESCE(AVG(valor_credito), 0) as ticket_medio
      FROM vendas
    `).get();

    // Card 4: Clientes cadastrados (quantidade total de clientes registrados)
    const sqlClientes = db.prepare(`
      SELECT COUNT(*) as qtd_clientes
      FROM clientes
    `).get();

    res.json({
      competenciaAtual,
      vendasNoMes: sqlVendasMes.total_mes,
      quantidadeVendas: sqlQtdVendas.qtd_vendas,
      ticketMedio: sqlTicketMedio.ticket_medio,
      clientesCadastrados: sqlClientes.qtd_clientes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CADASTRAR NOVA VENDA
app.post('/api/vendas', (req, res) => {
  try {
    const {
      nomeCliente,
      valorCredito,
      formaPagamentoId,
      numeroCota,
      numeroGrupo,
      dataVenda,
      numeroContrato,
      formaCaptacaoId
    } = req.body;

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
    const mesAnoCompetencia = extrairCompetencia(dataVenda);

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

      // 6. Venda: inserir
      const resVenda = db.prepare(`
        INSERT INTO vendas (
          cliente_id,
          contrato_id,
          cota_id,
          pagamento_id,
          captacao_id,
          valor_credito,
          data_venda,
          mes_ano_competencia
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cliente.id,
        contratoId,
        cota.id,
        formaPagamentoId,
        formaCaptacaoId,
        valCreditoNum,
        dataVenda,
        mesAnoCompetencia
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

// 4. CLIENTES - Listagem com busca por nome do cliente ou número do contrato
app.get('/api/clientes', (req, res) => {
  try {
    const { busca } = req.query;
    let query = `
      SELECT 
        v.id as venda_id,
        c.nome as cliente_nome,
        ct.numero as contrato_numero,
        cot.numero as cota_numero,
        g.numero as grupo_numero,
        v.valor_credito,
        v.data_venda
      FROM vendas v
      JOIN clientes c ON v.cliente_id = c.id
      JOIN contratos ct ON v.contrato_id = ct.id
      JOIN cotas cot ON v.cota_id = cot.id
      JOIN grupos g ON cot.grupo_id = g.id
    `;
    const params = [];

    if (busca && busca.trim()) {
      query += ` WHERE (c.nome LIKE ? OR ct.numero LIKE ?) `;
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
    let query = `
      SELECT 
        ct.numero as contrato_numero,
        c.nome as cliente_nome,
        v.valor_credito,
        cot.numero as cota_numero,
        g.numero as grupo_numero,
        v.data_venda,
        p.nome as forma_pagamento
      FROM vendas v
      JOIN clientes c ON v.cliente_id = c.id
      JOIN contratos ct ON v.contrato_id = ct.id
      JOIN cotas cot ON v.cota_id = cot.id
      JOIN grupos g ON cot.grupo_id = g.id
      JOIN pagamentos p ON v.pagamento_id = p.id
    `;
    const params = [];

    if (busca && busca.trim()) {
      query += ` WHERE (ct.numero LIKE ? OR c.nome LIKE ?) `;
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
    const { mesAno } = req.query; // Espera formato 'YYYY-MM'

    // Total geral vendido
    const sqlTotalGeral = db.prepare(`
      SELECT COALESCE(SUM(valor_credito), 0) as total_geral
      FROM vendas
    `).get();

    // Total vendido no mês selecionado
    let totalMesSelecionado = 0;
    if (mesAno && /^\d{4}-\d{2}$/.test(mesAno)) {
      const sqlTotalMes = db.prepare(`
        SELECT COALESCE(SUM(valor_credito), 0) as total_mes
        FROM vendas
        WHERE mes_ano_competencia = ?
      `).get(mesAno);
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

// 7. VENDAS POR MÊS
app.get('/api/vendas-por-mes', (req, res) => {
  try {
    const { mesAno } = req.query; // Formato 'YYYY-MM'
    
    // Obter lista de meses disponíveis com vendas cadastradas
    const mesesDisponiveis = db.prepare(`
      SELECT DISTINCT mes_ano_competencia
      FROM vendas
      ORDER BY mes_ano_competencia DESC
    `).all().map(r => r.mes_ano_competencia);

    // Se nenhum mês foi passado, usar o mais recente ou o mês atual
    let mesAlvo = mesAno;
    if (!mesAlvo) {
      const agora = new Date();
      mesAlvo = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    }

    const query = `
      SELECT 
        v.id as venda_id,
        c.nome as cliente_nome,
        v.valor_credito,
        p.nome as forma_pagamento,
        cot.numero as cota_numero,
        g.numero as grupo_numero,
        v.data_venda,
        ct.numero as contrato_numero,
        cap.nome as forma_captacao
      FROM vendas v
      JOIN clientes c ON v.cliente_id = c.id
      JOIN contratos ct ON v.contrato_id = ct.id
      JOIN cotas cot ON v.cota_id = cot.id
      JOIN grupos g ON cot.grupo_id = g.id
      JOIN pagamentos p ON v.pagamento_id = p.id
      JOIN captacoes cap ON v.captacao_id = cap.id
      WHERE v.mes_ano_competencia = ?
      ORDER BY v.data_venda DESC, v.id DESC
    `;

    const vendas = db.prepare(query).all(mesAlvo);

    res.json({
      mesSelecionado: mesAlvo,
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
