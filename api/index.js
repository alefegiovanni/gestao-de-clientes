const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('SUPABASE_URL ou SUPABASE_KEY não configuradas!');
}

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

function extrairCompetencia(dataStr) {
  if (!dataStr || dataStr.length < 7) return '';
  return dataStr.substring(0, 7);
}

module.exports = async (req, res) => {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!supabase) {
    return res.status(500).json({ 
      error: 'Variáveis de ambiente do Supabase (SUPABASE_URL / SUPABASE_KEY) não estão configuradas na Vercel.' 
    });
  }

  // Parse path da URL: e.g. /api/dashboard, /api/vendas
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname.replace(/^\/api/, '');
  const method = req.method;

  try {
    // 0. POST /api/login - Validação de Usuário e Senha de 4 dígitos
    if (pathname === '/login' && method === 'POST') {
      const { usuario, senha } = req.body || {};
      const userLimpo = (usuario || '').trim().toLowerCase();
      const passLimpo = String(senha || '').trim();

      // Credencial fixa definida pelo usuário ou gravada em config
      const usuarioValido = 'giovanni';
      let senhaValida = '3105';

      try {
        const { data: conf } = await supabase.from('config').select('valor').eq('chave', 'senha_acesso').maybeSingle();
        if (conf && conf.valor) senhaValida = conf.valor;
      } catch (e) {}

      if (userLimpo === usuarioValido && passLimpo === senhaValida) {
        return res.json({ success: true, message: 'Acesso autorizado!' });
      } else {
        return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
      }
    }

    // POST /api/alterar-pin - Alterar Senha de 4 dígitos
    if (pathname === '/alterar-pin' && method === 'POST') {
      const { pinAtual, novoPin } = req.body || {};
      if (!novoPin || !/^\d{4}$/.test(String(novoPin))) {
        return res.status(400).json({ error: 'A nova senha deve conter exatamente 4 números.' });
      }

      let senhaValida = '3105';
      try {
        const { data: conf } = await supabase.from('config').select('valor').eq('chave', 'senha_acesso').maybeSingle();
        if (conf && conf.valor) senhaValida = conf.valor;
      } catch (e) {}

      if (String(pinAtual) !== String(senhaValida)) {
        return res.status(401).json({ error: 'Senha atual incorreta.' });
      }

      await supabase.from('config').upsert([{ chave: 'senha_acesso', valor: String(novoPin) }]);
      return res.json({ success: true, message: 'Senha alterada com sucesso!' });
    }

    // 1. GET /api/opcoes
    if (pathname === '/opcoes' && method === 'GET') {
      const { data: pagamentos, error: errPag } = await supabase.from('pagamentos').select('id, nome').order('nome');
      if (errPag) throw errPag;

      const { data: captacoes, error: errCap } = await supabase.from('captacoes').select('id, nome').order('nome');
      if (errCap) throw errCap;

      return res.json({ pagamentos: pagamentos || [], captacoes: captacoes || [] });
    }

    // POST /api/opcoes/pagamentos
    if (pathname === '/opcoes/pagamentos' && method === 'POST') {
      const { nome } = req.body || {};
      if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
      const { data, error } = await supabase.from('pagamentos').insert([{ nome: nome.trim() }]).select().single();
      if (error) return res.status(400).json({ error: 'Forma de pagamento já existe ou inválida' });
      return res.json(data);
    }

    // POST /api/opcoes/captacoes
    if (pathname === '/opcoes/captacoes' && method === 'POST') {
      const { nome } = req.body || {};
      if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
      const { data, error } = await supabase.from('captacoes').insert([{ nome: nome.trim() }]).select().single();
      if (error) return res.status(400).json({ error: 'Forma de captação já existe ou inválida' });
      return res.json(data);
    }

    // 2. GET /api/dashboard
    if (pathname === '/dashboard' && method === 'GET') {
      const agora = new Date();
      const anoAtual = agora.getFullYear();
      const mesAtual = String(agora.getMonth() + 1).padStart(2, '0');
      const competenciaAtual = `${anoAtual}-${mesAtual}`;

      // Card 1: Vendas no mês
      const { data: vendasMes, error: errMes } = await supabase
        .from('vendas')
        .select('valor_credito')
        .eq('mes_ano_competencia', competenciaAtual);
      if (errMes) throw errMes;
      const totalMes = (vendasMes || []).reduce((acc, curr) => acc + Number(curr.valor_credito), 0);

      // Card 2: Quantidade de vendas
      const { count: qtdVendas, error: errQtd } = await supabase
        .from('vendas')
        .select('*', { count: 'exact', head: true });
      if (errQtd) throw errQtd;

      // Card 3: Ticket médio
      const { data: todasVendas, error: errTodas } = await supabase
        .from('vendas')
        .select('valor_credito');
      if (errTodas) throw errTodas;
      const somaGeral = (todasVendas || []).reduce((acc, curr) => acc + Number(curr.valor_credito), 0);
      const ticketMedio = (todasVendas && todasVendas.length > 0) ? (somaGeral / todasVendas.length) : 0;

      // Card 4: Clientes cadastrados
      const { count: qtdClientes, error: errCli } = await supabase
        .from('clientes')
        .select('*', { count: 'exact', head: true });
      if (errCli) throw errCli;

      return res.json({
        competenciaAtual,
        vendasNoMes: totalMes,
        quantidadeVendas: qtdVendas || 0,
        ticketMedio,
        clientesCadastrados: qtdClientes || 0
      });
    }

    // 3. POST /api/vendas
    if (pathname === '/vendas' && method === 'POST') {
      const {
        nomeCliente,
        valorCredito,
        formaPagamentoId,
        numeroCota,
        numeroGrupo,
        dataVenda,
        numeroContrato,
        formaCaptacaoId
      } = req.body || {};

      if (!nomeCliente || !nomeCliente.trim()) return res.status(400).json({ error: 'O nome do cliente é obrigatório.' });
      const valCreditoNum = parseFloat(valorCredito);
      if (isNaN(valCreditoNum) || valCreditoNum <= 0) return res.status(400).json({ error: 'O valor do crédito deve ser positivo.' });
      if (!formaPagamentoId) return res.status(400).json({ error: 'Selecione a forma de pagamento.' });
      if (!numeroCota || !numeroCota.trim()) return res.status(400).json({ error: 'O número da cota é obrigatório.' });
      if (!numeroGrupo || !numeroGrupo.trim()) return res.status(400).json({ error: 'O número do grupo é obrigatório.' });
      if (!dataVenda || !/^\d{4}-\d{2}-\d{2}$/.test(dataVenda)) return res.status(400).json({ error: 'Data de venda inválida.' });
      if (!numeroContrato || !numeroContrato.trim()) return res.status(400).json({ error: 'O número do contrato é obrigatório.' });
      if (!formaCaptacaoId) return res.status(400).json({ error: 'Selecione a forma de captação.' });

      const contratoNorm = numeroContrato.trim();
      const cotaNorm = numeroCota.trim();
      const grupoNorm = numeroGrupo.trim();
      const clienteNorm = nomeCliente.trim();
      const mesAnoCompetencia = extrairCompetencia(dataVenda);

      // Verificar duplicidade de contrato
      const { data: ctExistente } = await supabase
        .from('contratos')
        .select('id')
        .eq('numero', contratoNorm)
        .maybeSingle();

      if (ctExistente) {
        return res.status(400).json({ 
          error: `O contrato número "${contratoNorm}" já está cadastrado no sistema. Não é permitida a duplicidade de contratos.` 
        });
      }

      // Cliente
      let clienteId;
      const { data: cliExistente } = await supabase
        .from('clientes')
        .select('id')
        .ilike('nome', clienteNorm)
        .maybeSingle();

      if (cliExistente) {
        clienteId = cliExistente.id;
      } else {
        const { data: novoCli, error: errCli } = await supabase
          .from('clientes')
          .insert([{ nome: clienteNorm }])
          .select('id')
          .single();
        if (errCli) throw errCli;
        clienteId = novoCli.id;
      }

      // Grupo
      let grupoId;
      const { data: grpExistente } = await supabase
        .from('grupos')
        .select('id')
        .eq('numero', grupoNorm)
        .maybeSingle();

      if (grpExistente) {
        grupoId = grpExistente.id;
      } else {
        const { data: novoGrp, error: errGrp } = await supabase
          .from('grupos')
          .insert([{ numero: grupoNorm }])
          .select('id')
          .single();
        if (errGrp) throw errGrp;
        grupoId = novoGrp.id;
      }

      // Cota
      let cotaId;
      const { data: cotaExistente } = await supabase
        .from('cotas')
        .select('id')
        .eq('grupo_id', grupoId)
        .eq('numero', cotaNorm)
        .maybeSingle();

      if (cotaExistente) {
        cotaId = cotaExistente.id;
      } else {
        const { data: novaCota, error: errCota } = await supabase
          .from('cotas')
          .insert([{ grupo_id: grupoId, numero: cotaNorm }])
          .select('id')
          .single();
        if (errCota) throw errCota;
        cotaId = novaCota.id;
      }

      // Contrato
      const { data: novoCt, error: errCt } = await supabase
        .from('contratos')
        .insert([{ numero: contratoNorm, cliente_id: clienteId }])
        .select('id')
        .single();
      if (errCt) throw errCt;

      // Venda
      const { data: novaVenda, error: errVenda } = await supabase
        .from('vendas')
        .insert([{
          cliente_id: clienteId,
          contrato_id: novoCt.id,
          cota_id: cotaId,
          pagamento_id: formaPagamentoId,
          captacao_id: formaCaptacaoId,
          valor_credito: valCreditoNum,
          data_venda: dataVenda,
          mes_ano_competencia: mesAnoCompetencia
        }])
        .select('id')
        .single();
      if (errVenda) throw errVenda;

      return res.status(201).json({
        success: true,
        vendaId: novaVenda.id,
        message: 'Venda cadastrada com sucesso!'
      });
    }

    // PUT /api/vendas/:id - Atualizar/Editar uma venda existente
    const matchPutVenda = pathname.match(/^\/vendas\/(\d+)$/);
    if (matchPutVenda && method === 'PUT') {
      const vendaId = parseInt(matchPutVenda[1], 10);
      const {
        nomeCliente,
        valorCredito,
        formaPagamentoId,
        numeroCota,
        numeroGrupo,
        dataVenda,
        numeroContrato,
        formaCaptacaoId
      } = req.body || {};

      if (!nomeCliente || !nomeCliente.trim()) return res.status(400).json({ error: 'O nome do cliente é obrigatório.' });
      const valCreditoNum = parseFloat(valorCredito);
      if (isNaN(valCreditoNum) || valCreditoNum <= 0) return res.status(400).json({ error: 'O valor do crédito deve ser positivo.' });
      if (!formaPagamentoId) return res.status(400).json({ error: 'Selecione a forma de pagamento.' });
      if (!numeroCota || !numeroCota.trim()) return res.status(400).json({ error: 'O número da cota é obrigatório.' });
      if (!numeroGrupo || !numeroGrupo.trim()) return res.status(400).json({ error: 'O número do grupo é obrigatório.' });
      if (!dataVenda || !/^\d{4}-\d{2}-\d{2}$/.test(dataVenda)) return res.status(400).json({ error: 'Data de venda inválida.' });
      if (!numeroContrato || !numeroContrato.trim()) return res.status(400).json({ error: 'O número do contrato é obrigatório.' });
      if (!formaCaptacaoId) return res.status(400).json({ error: 'Selecione a forma de captação.' });

      const contratoNorm = numeroContrato.trim();
      const cotaNorm = numeroCota.trim();
      const grupoNorm = numeroGrupo.trim();
      const clienteNorm = nomeCliente.trim();
      const mesAnoCompetencia = extrairCompetencia(dataVenda);

      // Obter venda atual
      const { data: vendaAtual, error: errVendaAtual } = await supabase
        .from('vendas')
        .select('id, contrato_id, cliente_id, cota_id')
        .eq('id', vendaId)
        .maybeSingle();

      if (errVendaAtual || !vendaAtual) {
        return res.status(404).json({ error: 'Venda não encontrada.' });
      }

      // Verificar se número de contrato colide com OUTRO contrato
      const { data: ctExistente } = await supabase
        .from('contratos')
        .select('id')
        .eq('numero', contratoNorm)
        .neq('id', vendaAtual.contrato_id)
        .maybeSingle();

      if (ctExistente) {
        return res.status(400).json({ 
          error: `O contrato número "${contratoNorm}" já pertence a outro registro.` 
        });
      }

      // 1. Cliente
      let clienteId;
      const { data: cliExistente } = await supabase
        .from('clientes')
        .select('id')
        .ilike('nome', clienteNorm)
        .maybeSingle();

      if (cliExistente) {
        clienteId = cliExistente.id;
      } else {
        const { data: novoCli, error: errCli } = await supabase
          .from('clientes')
          .insert([{ nome: clienteNorm }])
          .select('id')
          .single();
        if (errCli) throw errCli;
        clienteId = novoCli.id;
      }

      // 2. Grupo
      let grupoId;
      const { data: grpExistente } = await supabase
        .from('grupos')
        .select('id')
        .eq('numero', grupoNorm)
        .maybeSingle();

      if (grpExistente) {
        grupoId = grpExistente.id;
      } else {
        const { data: novoGrp, error: errGrp } = await supabase
          .from('grupos')
          .insert([{ numero: grupoNorm }])
          .select('id')
          .single();
        if (errGrp) throw errGrp;
        grupoId = novoGrp.id;
      }

      // 3. Cota
      let cotaId;
      const { data: cotaExistente } = await supabase
        .from('cotas')
        .select('id')
        .eq('grupo_id', grupoId)
        .eq('numero', cotaNorm)
        .maybeSingle();

      if (cotaExistente) {
        cotaId = cotaExistente.id;
      } else {
        const { data: novaCota, error: errCota } = await supabase
          .from('cotas')
          .insert([{ grupo_id: grupoId, numero: cotaNorm }])
          .select('id')
          .single();
        if (errCota) throw errCota;
        cotaId = novaCota.id;
      }

      // 4. Atualizar Contrato
      const { error: errUpdCt } = await supabase
        .from('contratos')
        .update({ numero: contratoNorm, cliente_id: clienteId })
        .eq('id', vendaAtual.contrato_id);
      if (errUpdCt) throw errUpdCt;

      // 5. Atualizar Venda
      const { error: errUpdVenda } = await supabase
        .from('vendas')
        .update({
          cliente_id: clienteId,
          cota_id: cotaId,
          pagamento_id: formaPagamentoId,
          captacao_id: formaCaptacaoId,
          valor_credito: valCreditoNum,
          data_venda: dataVenda,
          mes_ano_competencia: mesAnoCompetencia
        })
        .eq('id', vendaId);
      if (errUpdVenda) throw errUpdVenda;

      return res.json({ success: true, message: 'Venda atualizada com sucesso!' });
    }

    // DELETE /api/vendas/:id - Excluir venda
    const matchDelVenda = pathname.match(/^\/vendas\/(\d+)$/);
    if (matchDelVenda && method === 'DELETE') {
      const vendaId = parseInt(matchDelVenda[1], 10);
      const { data: vendaAtual } = await supabase.from('vendas').select('contrato_id').eq('id', vendaId).maybeSingle();
      
      const { error: errDelVenda } = await supabase.from('vendas').delete().eq('id', vendaId);
      if (errDelVenda) throw errDelVenda;

      if (vendaAtual && vendaAtual.contrato_id) {
        await supabase.from('contratos').delete().eq('id', vendaAtual.contrato_id);
      }

      return res.json({ success: true, message: 'Venda excluída com sucesso!' });
    }

    // 4. GET /api/clientes
    if (pathname === '/clientes' && method === 'GET') {
      const busca = url.searchParams.get('busca') || '';
      const { data, error } = await supabase
        .from('vendas')
        .select(`
          id,
          valor_credito,
          data_venda,
          pagamento_id,
          captacao_id,
          clientes!inner (nome),
          contratos!inner (numero),
          cotas!inner (numero, grupos!inner (numero))
        `)
        .order('data_venda', { ascending: false });

      if (error) throw error;

      let formatados = (data || []).map(v => ({
        venda_id: v.id,
        cliente_nome: v.clientes?.nome,
        contrato_numero: v.contratos?.numero,
        cota_numero: v.cotas?.numero,
        grupo_numero: v.cotas?.grupos?.numero,
        valor_credito: v.valor_credito,
        data_venda: v.data_venda,
        pagamento_id: v.pagamento_id,
        captacao_id: v.captacao_id
      }));

      if (busca && busca.trim()) {
        const term = busca.trim().toLowerCase();
        formatados = formatados.filter(item => 
          (item.cliente_nome && item.cliente_nome.toLowerCase().includes(term)) ||
          (item.contrato_numero && item.contrato_numero.toLowerCase().includes(term))
        );
      }

      return res.json(formatados);
    }

    // 5. GET /api/contratos
    if (pathname === '/contratos' && method === 'GET') {
      const busca = url.searchParams.get('busca') || '';
      const { data, error } = await supabase
        .from('vendas')
        .select(`
          id,
          valor_credito,
          data_venda,
          pagamento_id,
          captacao_id,
          contratos!inner (numero),
          clientes!inner (nome),
          cotas!inner (numero, grupos!inner (numero)),
          pagamentos!inner (nome)
        `)
        .order('data_venda', { ascending: false });

      if (error) throw error;

      let formatados = (data || []).map(v => ({
        venda_id: v.id,
        contrato_numero: v.contratos?.numero,
        cliente_nome: v.clientes?.nome,
        valor_credito: v.valor_credito,
        cota_numero: v.cotas?.numero,
        grupo_numero: v.cotas?.grupos?.numero,
        data_venda: v.data_venda,
        forma_pagamento: v.pagamentos?.nome,
        pagamento_id: v.pagamento_id,
        captacao_id: v.captacao_id
      }));

      if (busca && busca.trim()) {
        const term = busca.trim().toLowerCase();
        formatados = formatados.filter(item => 
          (item.contrato_numero && item.contrato_numero.toLowerCase().includes(term)) ||
          (item.cliente_nome && item.cliente_nome.toLowerCase().includes(term))
        );
      }

      return res.json(formatados);
    }

    // 6. GET /api/relatorios
    if (pathname === '/relatorios' && method === 'GET') {
      const mesAno = url.searchParams.get('mesAno');

      const { data: todas, error: errTodas } = await supabase
        .from('vendas')
        .select('valor_credito, mes_ano_competencia');
      if (errTodas) throw errTodas;

      const totalGeral = (todas || []).reduce((acc, curr) => acc + Number(curr.valor_credito), 0);
      let totalMesSelecionado = 0;

      if (mesAno && /^\d{4}-\d{2}$/.test(mesAno)) {
        totalMesSelecionado = (todas || [])
          .filter(v => v.mes_ano_competencia === mesAno)
          .reduce((acc, curr) => acc + Number(curr.valor_credito), 0);
      }

      return res.json({
        mesAnoSelecionado: mesAno || null,
        totalMesSelecionado,
        totalGeral
      });
    }

    // 7. GET /api/vendas-por-mes
    if (pathname === '/vendas-por-mes' && method === 'GET') {
      let mesAno = url.searchParams.get('mesAno');
      if (!mesAno) {
        const agora = new Date();
        mesAno = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
      }

      const { data, error } = await supabase
        .from('vendas')
        .select(`
          id,
          valor_credito,
          data_venda,
          mes_ano_competencia,
          pagamento_id,
          captacao_id,
          clientes!inner (nome),
          contratos!inner (numero),
          cotas!inner (numero, grupos!inner (numero)),
          pagamentos!inner (nome),
          captacoes!inner (nome)
        `)
        .eq('mes_ano_competencia', mesAno)
        .order('data_venda', { ascending: false });

      if (error) throw error;

      const vendas = (data || []).map(v => ({
        venda_id: v.id,
        cliente_nome: v.clientes?.nome,
        valor_credito: v.valor_credito,
        forma_pagamento: v.pagamentos?.nome,
        cota_numero: v.cotas?.numero,
        grupo_numero: v.cotas?.grupos?.numero,
        data_venda: v.data_venda,
        contrato_numero: v.contratos?.numero,
        forma_captacao: v.captacoes?.nome,
        pagamento_id: v.pagamento_id,
        captacao_id: v.captacao_id
      }));

      return res.json({
        mesSelecionado: mesAno,
        vendas
      });
    }

    return res.status(404).json({ error: 'Rota não encontrada' });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: err.message || 'Erro interno no servidor' });
  }
};
