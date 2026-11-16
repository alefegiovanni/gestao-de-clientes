const { neon } = require('@neondatabase/serverless');

function extrairCompetencia(dataStr) {
  if (!dataStr || dataStr.length < 7) return '';
  return dataStr.substring(0, 7);
}

module.exports = async (req, res) => {
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

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return res.status(500).json({ 
      error: 'Variável de ambiente DATABASE_URL não configurada na Vercel.' 
    });
  }

  const sql = neon(databaseUrl);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname.replace(/^\/api/, '');
  const method = req.method;

  try {
    // 1. GET /api/opcoes
    if (pathname === '/opcoes' && method === 'GET') {
      const pagamentos = await sql`SELECT id, nome FROM pagamentos ORDER BY nome ASC`;
      const captacoes = await sql`SELECT id, nome FROM captacoes ORDER BY nome ASC`;
      return res.json({ pagamentos, captacoes });
    }

    // POST /api/opcoes/pagamentos
    if (pathname === '/opcoes/pagamentos' && method === 'POST') {
      const { nome } = req.body || {};
      if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
      const resultado = await sql`INSERT INTO pagamentos (nome) VALUES (${nome.trim()}) RETURNING id, nome`;
      return res.json(resultado[0]);
    }

    // POST /api/opcoes/captacoes
    if (pathname === '/opcoes/captacoes' && method === 'POST') {
      const { nome } = req.body || {};
      if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
      const resultado = await sql`INSERT INTO captacoes (nome) VALUES (${nome.trim()}) RETURNING id, nome`;
      return res.json(resultado[0]);
    }

    // 2. GET /api/dashboard
    if (pathname === '/dashboard' && method === 'GET') {
      const agora = new Date();
      const anoAtual = agora.getFullYear();
      const mesAtual = String(agora.getMonth() + 1).padStart(2, '0');
      const competenciaAtual = `${anoAtual}-${mesAtual}`;

      // Card 1: Vendas no mês
      const resMes = await sql`
        SELECT COALESCE(SUM(valor_credito), 0)::float as total_mes
        FROM vendas
        WHERE mes_ano_competencia = ${competenciaAtual}
      `;

      // Card 2: Quantidade de vendas
      const resQtd = await sql`
        SELECT COUNT(*)::int as qtd_vendas
        FROM vendas
      `;

      // Card 3: Ticket médio
      const resTicket = await sql`
        SELECT COALESCE(AVG(valor_credito), 0)::float as ticket_medio
        FROM vendas
      `;

      // Card 4: Clientes cadastrados
      const resCli = await sql`
        SELECT COUNT(*)::int as qtd_clientes
        FROM clientes
      `;

      return res.json({
        competenciaAtual,
        vendasNoMes: resMes[0]?.total_mes || 0,
        quantidadeVendas: resQtd[0]?.qtd_vendas || 0,
        ticketMedio: resTicket[0]?.ticket_medio || 0,
        clientesCadastrados: resCli[0]?.qtd_clientes || 0
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
      const ctExistente = await sql`SELECT id FROM contratos WHERE numero = ${contratoNorm} LIMIT 1`;
      if (ctExistente.length > 0) {
        return res.status(400).json({ 
          error: `O contrato número "${contratoNorm}" já está cadastrado no sistema. Não é permitida a duplicidade de contratos.` 
        });
      }

      // 1. Cliente
      let cliente = await sql`SELECT id FROM clientes WHERE LOWER(nome) = LOWER(${clienteNorm}) LIMIT 1`;
      let clienteId;
      if (cliente.length > 0) {
        clienteId = cliente[0].id;
      } else {
        const novoCli = await sql`INSERT INTO clientes (nome) VALUES (${clienteNorm}) RETURNING id`;
        clienteId = novoCli[0].id;
      }

      // 2. Grupo
      let grupo = await sql`SELECT id FROM grupos WHERE numero = ${grupoNorm} LIMIT 1`;
      let grupoId;
      if (grupo.length > 0) {
        grupoId = grupo[0].id;
      } else {
        const novoGrp = await sql`INSERT INTO grupos (numero) VALUES (${grupoNorm}) RETURNING id`;
        grupoId = novoGrp[0].id;
      }

      // 3. Cota
      let cota = await sql`SELECT id FROM cotas WHERE grupo_id = ${grupoId} AND numero = ${cotaNorm} LIMIT 1`;
      let cotaId;
      if (cota.length > 0) {
        cotaId = cota[0].id;
      } else {
        const novaCota = await sql`INSERT INTO cotas (grupo_id, numero) VALUES (${grupoId}, ${cotaNorm}) RETURNING id`;
        cotaId = novaCota[0].id;
      }

      // 4. Contrato
      const novoCt = await sql`INSERT INTO contratos (numero, cliente_id) VALUES (${contratoNorm}, ${clienteId}) RETURNING id`;
      const contratoId = novoCt[0].id;

      // 5. Venda
      const novaVenda = await sql`
        INSERT INTO vendas (
          cliente_id,
          contrato_id,
          cota_id,
          pagamento_id,
          captacao_id,
          valor_credito,
          data_venda,
          mes_ano_competencia
        ) VALUES (
          ${clienteId},
          ${contratoId},
          ${cotaId},
          ${formaPagamentoId},
          ${formaCaptacaoId},
          ${valCreditoNum},
          ${dataVenda},
          ${mesAnoCompetencia}
        ) RETURNING id
      `;

      return res.status(201).json({
        success: true,
        vendaId: novaVenda[0].id,
        message: 'Venda cadastrada com sucesso!'
      });
    }

    // 4. GET /api/clientes
    if (pathname === '/clientes' && method === 'GET') {
      const busca = url.searchParams.get('busca') || '';
      let formatados;

      if (busca && busca.trim()) {
        const termo = `%${busca.trim()}%`;
        formatados = await sql`
          SELECT 
            v.id as venda_id,
            c.nome as cliente_nome,
            ct.numero as contrato_numero,
            cot.numero as cota_numero,
            g.numero as grupo_numero,
            v.valor_credito::float,
            TO_CHAR(v.data_venda, 'YYYY-MM-DD') as data_venda
          FROM vendas v
          JOIN clientes c ON v.cliente_id = c.id
          JOIN contratos ct ON v.contrato_id = ct.id
          JOIN cotas cot ON v.cota_id = cot.id
          JOIN grupos g ON cot.grupo_id = g.id
          WHERE c.nome ILIKE ${termo} OR ct.numero ILIKE ${termo}
          ORDER BY v.data_venda DESC, v.id DESC
        `;
      } else {
        formatados = await sql`
          SELECT 
            v.id as venda_id,
            c.nome as cliente_nome,
            ct.numero as contrato_numero,
            cot.numero as cota_numero,
            g.numero as grupo_numero,
            v.valor_credito::float,
            TO_CHAR(v.data_venda, 'YYYY-MM-DD') as data_venda
          FROM vendas v
          JOIN clientes c ON v.cliente_id = c.id
          JOIN contratos ct ON v.contrato_id = ct.id
          JOIN cotas cot ON v.cota_id = cot.id
          JOIN grupos g ON cot.grupo_id = g.id
          ORDER BY v.data_venda DESC, v.id DESC
        `;
      }

      return res.json(formatados);
    }

    // 5. GET /api/contratos
    if (pathname === '/contratos' && method === 'GET') {
      const busca = url.searchParams.get('busca') || '';
      let formatados;

      if (busca && busca.trim()) {
        const termo = `%${busca.trim()}%`;
        formatados = await sql`
          SELECT 
            ct.numero as contrato_numero,
            c.nome as cliente_nome,
            v.valor_credito::float,
            cot.numero as cota_numero,
            g.numero as grupo_numero,
            TO_CHAR(v.data_venda, 'YYYY-MM-DD') as data_venda,
            p.nome as forma_pagamento
          FROM vendas v
          JOIN clientes c ON v.cliente_id = c.id
          JOIN contratos ct ON v.contrato_id = ct.id
          JOIN cotas cot ON v.cota_id = cot.id
          JOIN grupos g ON cot.grupo_id = g.id
          JOIN pagamentos p ON v.pagamento_id = p.id
          WHERE ct.numero ILIKE ${termo} OR c.nome ILIKE ${termo}
          ORDER BY v.data_venda DESC, ct.numero ASC
        `;
      } else {
        formatados = await sql`
          SELECT 
            ct.numero as contrato_numero,
            c.nome as cliente_nome,
            v.valor_credito::float,
            cot.numero as cota_numero,
            g.numero as grupo_numero,
            TO_CHAR(v.data_venda, 'YYYY-MM-DD') as data_venda,
            p.nome as forma_pagamento
          FROM vendas v
          JOIN clientes c ON v.cliente_id = c.id
          JOIN contratos ct ON v.contrato_id = ct.id
          JOIN cotas cot ON v.cota_id = cot.id
          JOIN grupos g ON cot.grupo_id = g.id
          JOIN pagamentos p ON v.pagamento_id = p.id
          ORDER BY v.data_venda DESC, ct.numero ASC
        `;
      }

      return res.json(formatados);
    }

    // 6. GET /api/relatorios
    if (pathname === '/relatorios' && method === 'GET') {
      const mesAno = url.searchParams.get('mesAno');

      const resGeral = await sql`
        SELECT COALESCE(SUM(valor_credito), 0)::float as total_geral
        FROM vendas
      `;
      const totalGeral = resGeral[0]?.total_geral || 0;

      let totalMesSelecionado = 0;
      if (mesAno && /^\d{4}-\d{2}$/.test(mesAno)) {
        const resMes = await sql`
          SELECT COALESCE(SUM(valor_credito), 0)::float as total_mes
          FROM vendas
          WHERE mes_ano_competencia = ${mesAno}
        `;
        totalMesSelecionado = resMes[0]?.total_mes || 0;
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

      const vendas = await sql`
        SELECT 
          v.id as venda_id,
          c.nome as cliente_nome,
          v.valor_credito::float,
          p.nome as forma_pagamento,
          cot.numero as cota_numero,
          g.numero as grupo_numero,
          TO_CHAR(v.data_venda, 'YYYY-MM-DD') as data_venda,
          ct.numero as contrato_numero,
          cap.nome as forma_captacao
        FROM vendas v
        JOIN clientes c ON v.cliente_id = c.id
        JOIN contratos ct ON v.contrato_id = ct.id
        JOIN cotas cot ON v.cota_id = cot.id
        JOIN grupos g ON cot.grupo_id = g.id
        JOIN pagamentos p ON v.pagamento_id = p.id
        JOIN captacoes cap ON v.captacao_id = cap.id
        WHERE v.mes_ano_competencia = ${mesAno}
        ORDER BY v.data_venda DESC, v.id DESC
      `;

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
