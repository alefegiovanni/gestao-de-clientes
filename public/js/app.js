// Sistema de Gestão de Vendas de Consórcios
const app = {
  secaoAtual: 'dashboard',
  opcoes: { pagamentos: [], captacoes: [] },

  init() {
    this.configurarLogin();
    this.configurarNavegacao();
    this.configurarMascaraMoeda();
    this.configurarDataAutomatica();
    this.configurarFormulario();
    this.configurarModalEdicao();
    this.configurarPesquisas();
    this.configurarFiltrosPeriodo();
    this.configurarConfiguracoes();

    // Se já estiver logado na sessão atual
    if (sessionStorage.getItem('gestao_logado') === 'true') {
      const loginScreen = document.getElementById('loginScreen');
      if (loginScreen) loginScreen.style.display = 'none';
      this.carregarOpcoes().then(() => {
        this.carregarDashboard();
      });
    }
  },

  // 0. Autenticação por Usuário e Senha de 4 dígitos
  configurarLogin() {
    const loginScreen = document.getElementById('loginScreen');
    const formLogin = document.getElementById('formLogin');
    const inputUser = document.getElementById('loginUsuario');
    const inputSenha = document.getElementById('loginSenha');
    const erroMsg = document.getElementById('loginErro');
    const btnSair = document.getElementById('btnSair');

    // Aceitar apenas números na senha
    if (inputSenha) {
      inputSenha.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
        if (erroMsg) erroMsg.style.display = 'none';
      });
    }

    if (inputUser) {
      inputUser.addEventListener('input', () => {
        if (erroMsg) erroMsg.style.display = 'none';
      });
    }

    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usuario = inputUser.value.trim();
      const senha = inputSenha.value.trim();

      if (senha.length !== 4) {
        if (erroMsg) {
          erroMsg.textContent = 'A senha deve conter 4 dígitos.';
          erroMsg.style.display = 'block';
        }
        return;
      }

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario, senha })
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Usuário ou senha incorretos.');
        }

        // Sucesso
        sessionStorage.setItem('gestao_logado', 'true');
        loginScreen.style.display = 'none';
        this.mostrarToast('Bem-vindo ao sistema!');
        this.carregarOpcoes().then(() => {
          this.carregarDashboard();
        });
      } catch (err) {
        if (erroMsg) {
          erroMsg.textContent = err.message;
          erroMsg.style.display = 'block';
        }
        inputSenha.value = '';
        inputSenha.focus();
      }
    });

    // Botão Sair do Sistema
    if (btnSair) {
      btnSair.addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.removeItem('gestao_logado');
        if (inputSenha) inputSenha.value = '';
        if (loginScreen) loginScreen.style.display = 'flex';
        if (inputUser) inputUser.focus();
        this.mostrarToast('Você saiu do sistema.');
      });
    }

    // Formulário de Alteração de Senha
    const formAlterarPin = document.getElementById('formAlterarPin');
    if (formAlterarPin) {
      formAlterarPin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pinAtual = document.getElementById('pinAtual').value;
        const novoPin = document.getElementById('novoPin').value;

        try {
          const res = await fetch('/api/alterar-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pinAtual, novoPin })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          this.mostrarToast('Senha atualizada com sucesso!');
          formAlterarPin.reset();
        } catch (err) {
          this.mostrarToast(err.message, 'erro');
        }
      });
    }
  },

  // Formatação de Moeda Brasileira R$
  formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  // Formatação de Data Brasileira (DD/MM/AAAA) a partir de YYYY-MM-DD
  formatarDataBR(dataISO) {
    if (!dataISO) return '-';
    const partes = dataISO.split('-');
    if (partes.length !== 3) return dataISO;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  },

  // Formatação de Competência (Mês/Ano por extenso ou MM/AAAA)
  formatarCompetenciaBR(competencia) {
    if (!competencia) return '-';
    const partes = competencia.split('-');
    if (partes.length !== 2) return competencia;
    const meses = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const mesIndex = parseInt(partes[1], 10) - 1;
    return `${meses[mesIndex] || partes[1]} de ${partes[0]}`;
  },

  // Cálculo da Competência pelo ciclo de consórcio (16 a 15)
  // A partir do dia 16 conta para o mês seguinte (ex: 16 de Novembro -> Dezembro)
  calcularCompetenciaCiclo(dataStr) {
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
  },

  obterCompetenciaAtual() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return this.calcularCompetenciaCiclo(`${ano}-${mes}-${dia}`);
  },

  // Notificações Toast
  mostrarToast(mensagem, tipo = 'sucesso') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${tipo === 'erro' ? 'toast-error' : ''}`;
    toast.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${tipo === 'erro' ? '#ef4444' : '#15803d'}" stroke-width="2">
        ${tipo === 'erro' 
          ? '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>' 
          : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'}
      </svg>
      <span>${mensagem}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  // Navegação entre Telas
  configurarNavegacao() {
    const links = document.querySelectorAll('.nav-link');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const toggle = document.getElementById('mobileMenuToggle');

    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });

    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const sectionId = link.getAttribute('data-section');
        this.navegarPara(sectionId);

        // Fechar mobile sidebar se aberto
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    });
  },

  navegarPara(sectionId) {
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.getAttribute('data-section') === sectionId);
    });

    document.querySelectorAll('.app-section').forEach(sec => {
      sec.classList.remove('active');
    });

    const target = document.getElementById(`section-${sectionId}`);
    if (target) {
      target.classList.add('active');
      this.secaoAtual = sectionId;

      // Executa carregamento sob demanda
      if (sectionId === 'dashboard') this.carregarDashboard();
      if (sectionId === 'clientes') this.carregarClientes();
      if (sectionId === 'contratos') this.carregarContratos();
      if (sectionId === 'relatorios') this.carregarRelatorios();
      if (sectionId === 'vendas-mes') this.carregarVendasMes();
      if (sectionId === 'configuracoes') this.renderizarConfiguracoes();
    }
  },

  // Máscara monetária brasileira para o formulário
  configurarMascaraMoeda() {
    const input = document.getElementById('campoValorCredito');
    input.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      if (!value) {
        e.target.value = '';
        return;
      }
      const valorNum = (parseInt(value, 10) / 100).toFixed(2);
      e.target.value = Number(valorNum).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    });
  },

  converterDataBRparaISO(dataBR) {
    if (!dataBR) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataBR)) return dataBR;
    const partes = dataBR.trim().split('/');
    if (partes.length === 3) {
      const dia = partes[0].padStart(2, '0');
      const mes = partes[1].padStart(2, '0');
      const ano = partes[2];
      if (dia && mes && ano && ano.length === 4) {
        return `${ano}-${mes}-${dia}`;
      }
    }
    return '';
  },

  converterDataISOparaBR(dataISO) {
    if (!dataISO) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataISO)) return dataISO;
    const partes = dataISO.trim().split('-');
    if (partes.length === 3) {
      const [ano, mes, dia] = partes;
      return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
    }
    return dataISO;
  },

  // Máscara com pulo automático de Dia -> Mês -> Ano
  aplicarMascaraData(input, onDataCompleta) {
    if (!input) return;

    input.addEventListener('keydown', (e) => {
      // Se digitar '/', autocompleta dígito único de dia ou mês (ex: 5/ -> 05/)
      if (e.key === '/') {
        const raw = input.value.replace(/\D/g, '');
        if (raw.length === 1) {
          e.preventDefault();
          input.value = `0${raw}/`;
          return;
        }
        if (raw.length === 3) {
          e.preventDefault();
          input.value = `${raw.substring(0, 2)}/0${raw.substring(2)}/`;
          return;
        }
      }
    });

    input.addEventListener('input', (e) => {
      let v = input.value.replace(/\D/g, '');
      if (v.length > 8) v = v.substring(0, 8);

      if (e.inputType === 'deleteContentBackward') {
        if (v.length <= 2) {
          input.value = v;
        } else if (v.length <= 4) {
          input.value = v.substring(0, 2) + '/' + v.substring(2);
        } else {
          input.value = v.substring(0, 2) + '/' + v.substring(2, 4) + '/' + v.substring(4);
        }
        return;
      }

      let formatado = '';
      if (v.length > 0) formatado = v.substring(0, 2);
      if (v.length >= 2) {
        formatado += '/';
        if (v.length > 2) formatado += v.substring(2, 4);
      }
      if (v.length >= 4) {
        formatado += '/';
        if (v.length > 4) formatado += v.substring(4, 8);
      }

      input.value = formatado;

      if (v.length === 8) {
        const dia = v.substring(0, 2);
        const mes = v.substring(2, 4);
        const ano = v.substring(4, 8);
        const diaNum = parseInt(dia, 10);
        const mesNum = parseInt(mes, 10);
        const anoNum = parseInt(ano, 10);

        if (diaNum >= 1 && diaNum <= 31 && mesNum >= 1 && mesNum <= 12 && anoNum >= 1900 && anoNum <= 2100) {
          const iso = `${ano}-${mes}-${dia}`;
          if (onDataCompleta) onDataCompleta(iso);
        }
      }
    });
  },

  // Data da venda com preenchimento inicial padrão e salto automático
  configurarDataAutomatica() {
    const inputData = document.getElementById('campoDataVenda');
    const inputMes = document.getElementById('campoMesVenda');

    // Preenche com a data atual por padrão no formato BR
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    inputData.value = `${dia}/${mes}/${ano}`;
    inputMes.value = this.calcularCompetenciaCiclo(`${ano}-${mes}-${dia}`);

    // Aplicar máscara inteligente com salto automático de dia para mês e ano
    this.aplicarMascaraData(inputData, (iso) => {
      inputMes.value = this.calcularCompetenciaCiclo(iso);
    });
  },

  atualizarCompetenciaAutomatico(dataStr) {
    const inputMes = document.getElementById('campoMesVenda');
    if (!dataStr) {
      inputMes.value = '';
      return;
    }
    const competencia = this.calcularCompetenciaCiclo(dataStr);
    inputMes.value = competencia;
  },

  // Carregar opções (Pagamentos e Captações)
  async carregarOpcoes() {
    try {
      const res = await fetch('/api/opcoes');
      const data = await res.json();
      this.opcoes = data;

      const selPagamento = document.getElementById('campoFormaPagamento');
      selPagamento.innerHTML = '<option value="">Selecione...</option>';
      data.pagamentos.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nome;
        selPagamento.appendChild(opt);
      });

      const selCaptacao = document.getElementById('campoFormaCaptacao');
      selCaptacao.innerHTML = '<option value="">Selecione...</option>';
      data.captacoes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nome;
        selCaptacao.appendChild(opt);
      });

      this.renderizarConfiguracoes();
    } catch (err) {
      console.error('Erro ao carregar opções:', err);
    }
  },

  // Configurar e submeter formulário de Nova Venda
  configurarFormulario() {
    const form = document.getElementById('formVenda');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const dataVendaBR = document.getElementById('campoDataVenda').value;
      const dataVenda = this.converterDataBRparaISO(dataVendaBR);
      if (!dataVenda || !/^\d{4}-\d{2}-\d{2}$/.test(dataVenda)) {
        this.mostrarToast('Por favor, informe uma data válida no formato DD/MM/AAAA.', 'erro');
        return;
      }
      const mesAnoCompetencia = document.getElementById('campoMesVenda').value;
      const nomeCliente = document.getElementById('campoNomeCliente').value.trim();
      const valorStr = document.getElementById('campoValorCredito').value;
      const numeroContrato = document.getElementById('campoNumeroContrato').value.trim();
      const numeroGrupo = document.getElementById('campoNumeroGrupo').value.trim();
      const numeroCota = document.getElementById('campoNumeroCota').value.trim();
      const formaPagamentoId = document.getElementById('campoFormaPagamento').value;
      const formaCaptacaoId = document.getElementById('campoFormaCaptacao').value;

      // Converter moeda formatada R$ 1.500,00 -> 1500.00
      let valorLimpo = valorStr.replace(/[^\d]/g, '');
      const valorCredito = parseFloat(valorLimpo) / 100;

      if (!valorCredito || isNaN(valorCredito) || valorCredito <= 0) {
        this.mostrarToast('Por favor, informe um valor de crédito válido.', 'erro');
        return;
      }

      const payload = {
        dataVenda,
        mesAnoCompetencia,
        nomeCliente,
        valorCredito,
        numeroContrato,
        numeroGrupo,
        numeroCota,
        formaPagamentoId: Number(formaPagamentoId),
        formaCaptacaoId: Number(formaCaptacaoId)
      };

      try {
        const res = await fetch('/api/vendas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erro ao cadastrar venda.');
        }

        this.mostrarToast('Venda cadastrada com sucesso!');
        form.reset();
        
        // Restaurar data de hoje no formato BR
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        document.getElementById('campoDataVenda').value = `${dia}/${mes}/${ano}`;
        document.getElementById('campoMesVenda').value = this.calcularCompetenciaCiclo(`${ano}-${mes}-${dia}`);

        // Atualizar indicadores e redirecionar para o dashboard
        this.carregarDashboard();
        this.navegarPara('dashboard');

      } catch (err) {
        this.mostrarToast(err.message, 'erro');
      }
    });
  },

  // 1. DASHBOARD
  async carregarDashboard() {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();

      document.getElementById('cardVendasMes').textContent = this.formatarMoeda(data.vendasNoMes);
      document.getElementById('cardQtdVendas').textContent = data.quantidadeVendas;
      document.getElementById('cardTicketMedio').textContent = this.formatarMoeda(data.ticketMedio);
      document.getElementById('cardQtdClientes').textContent = data.clientesCadastrados;
      
      const compTexto = this.formatarCompetenciaBR(data.competenciaAtual);
      document.getElementById('cardMesReferencia').textContent = `Mês atual: ${compTexto}`;
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
    }
  },

  // 2. CLIENTES (com busca por nome do cliente ou número do contrato)
  async carregarClientes(busca = '') {
    try {
      const url = busca ? `/api/clientes?busca=${encodeURIComponent(busca)}` : '/api/clientes';
      const res = await fetch(url);
      const lista = await res.json();

      const tbody = document.getElementById('tabelaClientesCorpo');
      const empty = document.getElementById('emptyClientes');
      tbody.innerHTML = '';

      if (lista.length === 0) {
        empty.style.display = 'block';
        return;
      }
      empty.style.display = 'none';

      lista.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${item.cliente_nome}</strong></td>
          <td><span class="badge-tag">${item.contrato_numero}</span></td>
          <td>${item.cota_numero}</td>
          <td>${item.grupo_numero}</td>
          <td><span class="badge-money">${this.formatarMoeda(item.valor_credito)}</span></td>
          <td>${this.formatarDataBR(item.data_venda)}</td>
          <td style="text-align: center;">
            <button class="btn-action" onclick="app.abrirModalEdicao(${JSON.stringify(item).replace(/"/g, '&quot;')})">
              ✏️ Editar
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      const tableCard = document.querySelector('#section-clientes .table-card');
      const tableWrapper = document.querySelector('#section-clientes .table-responsive');
      const barraExistente = tableCard.querySelector('.custom-scrollbar-bar');
      if (barraExistente) barraExistente.remove();
      if (lista.length > 0) {
        tableCard.appendChild(this.criarBarraRolagemFisica(tableWrapper));
      }
    } catch (err) {
      console.error('Erro ao carregar clientes:', err);
    }
  },

  // 3. CONTRATOS (com busca por número do contrato ou nome do cliente)
  async carregarContratos(busca = '') {
    try {
      const url = busca ? `/api/contratos?busca=${encodeURIComponent(busca)}` : '/api/contratos';
      const res = await fetch(url);
      const lista = await res.json();

      const tbody = document.getElementById('tabelaContratosCorpo');
      const empty = document.getElementById('emptyContratos');
      tbody.innerHTML = '';

      if (lista.length === 0) {
        empty.style.display = 'block';
        return;
      }
      empty.style.display = 'none';

      lista.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${item.contrato_numero}</strong></td>
          <td>${item.cliente_nome}</td>
          <td><span class="badge-money">${this.formatarMoeda(item.valor_credito)}</span></td>
          <td>${item.cota_numero}</td>
          <td>${item.grupo_numero}</td>
          <td>${this.formatarDataBR(item.data_venda)}</td>
          <td><span class="badge-tag">${item.forma_pagamento}</span></td>
          <td style="text-align: center;">
            <button class="btn-action" onclick="app.abrirModalEdicao(${JSON.stringify(item).replace(/"/g, '&quot;')})">
              ✏️ Editar
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      const tableCard = document.querySelector('#section-contratos .table-card');
      const tableWrapper = document.querySelector('#section-contratos .table-responsive');
      const barraExistente = tableCard.querySelector('.custom-scrollbar-bar');
      if (barraExistente) barraExistente.remove();
      if (lista.length > 0) {
        tableCard.appendChild(this.criarBarraRolagemFisica(tableWrapper));
      }
    } catch (err) {
      console.error('Erro ao carregar contratos:', err);
    }
  },

  // 4. RELATÓRIOS (SOMENTE OS DOIS INDICADORES)
  async carregarRelatorios() {
    try {
      const mesInput = document.getElementById('relatorioMesAno');
      if (!mesInput.value) {
        mesInput.value = this.obterCompetenciaAtual();
      }

      const mesAno = mesInput.value;
      const res = await fetch(`/api/relatorios?mesAno=${encodeURIComponent(mesAno)}`);
      const data = await res.json();

      document.getElementById('relatorioTotalMes').textContent = this.formatarMoeda(data.totalMesSelecionado);
      document.getElementById('relatorioTotalGeral').textContent = this.formatarMoeda(data.totalGeral);
      document.getElementById('relatorioPeriodoTexto').textContent = `Competência: ${this.formatarCompetenciaBR(mesAno)}`;
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
    }
  },

  // 5. VENDAS POR MÊS (Organizadas em blocos por mês, um embaixo do outro)
  async carregarVendasMes(forcarTodas = false) {
    try {
      const mesInput = document.getElementById('filtroVendasMes');
      if (forcarTodas) {
        mesInput.value = '';
      }

      const mesAno = mesInput.value || 'todas';
      const res = await fetch(`/api/vendas-por-mes?mesAno=${encodeURIComponent(mesAno)}`);
      const data = await res.json();

      const container = document.getElementById('containerVendasPorMes');
      const empty = document.getElementById('emptyVendasMes');
      container.innerHTML = '';

      if (!data.vendas || data.vendas.length === 0) {
        empty.style.display = 'block';
        document.getElementById('vendasMesResumoTotal').textContent = `Total: ${this.formatarMoeda(0)}`;
        return;
      }
      empty.style.display = 'none';

      let totalGeral = 0;

      // Agrupar as vendas por mês_ano_competencia
      const gruposPorMes = {};
      data.vendas.forEach(item => {
        const comp = item.mes_ano_competencia || this.calcularCompetenciaCiclo(item.data_venda);
        if (!gruposPorMes[comp]) {
          gruposPorMes[comp] = [];
        }
        gruposPorMes[comp].push(item);
        totalGeral += Number(item.valor_credito);
      });

      // Ordenar meses de forma decrescente (mais recentes primeiro)
      const mesesOrdenados = Object.keys(gruposPorMes).sort().reverse();

      mesesOrdenados.forEach((mesChave, idx) => {
        const listaVendas = gruposPorMes[mesChave];
        const totalDoMes = listaVendas.reduce((acc, curr) => acc + Number(curr.valor_credito), 0);
        const nomeMesFormatado = this.formatarCompetenciaBR(mesChave);
        const wrapperId = `wrapVendasMes_${idx}`;

        // Criar card de seção para cada mês
        const cardMes = document.createElement('div');
        cardMes.className = 'table-card';
        cardMes.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';

        // Header com nome do mês e total do mês
        const headerMes = document.createElement('div');
        headerMes.style.display = 'flex';
        headerMes.style.justifyContent = 'space-between';
        headerMes.style.alignItems = 'center';
        headerMes.style.padding = '16px 20px';
        headerMes.style.backgroundColor = '#f8fafc';
        headerMes.style.borderBottom = '1px solid var(--border-color)';
        headerMes.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 10px; height: 10px; border-radius: 50%; background-color: var(--primary);"></div>
            <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-main);">${nomeMesFormatado}</h3>
            <span class="badge-tag" style="background-color: #e2e8f0; font-weight: 600;">${listaVendas.length} ${listaVendas.length === 1 ? 'venda' : 'vendas'}</span>
          </div>
          <div style="font-size: 0.95rem; font-weight: 700; color: var(--primary-dark);">
            Total do Mês: <span style="font-size: 1.05rem;">${this.formatarMoeda(totalDoMes)}</span>
          </div>
        `;
        cardMes.appendChild(headerMes);

        // Tabela de vendas do mês
        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-responsive';
        tableWrapper.id = wrapperId;
        
        let linhasHtml = '';
        listaVendas.forEach(item => {
          linhasHtml += `
            <tr>
              <td><strong>${item.cliente_nome}</strong></td>
              <td><span class="badge-money">${this.formatarMoeda(item.valor_credito)}</span></td>
              <td><span class="badge-tag">${item.forma_pagamento}</span></td>
              <td>${item.cota_numero}</td>
              <td>${item.grupo_numero}</td>
              <td>${this.formatarDataBR(item.data_venda)}</td>
              <td><span class="badge-tag">${item.contrato_numero}</span></td>
              <td><span class="badge-tag">${item.forma_captacao}</span></td>
              <td style="text-align: center;">
                <button class="btn-action" onclick="app.abrirModalEdicao(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                  ✏️ Editar
                </button>
              </td>
            </tr>
          `;
        });

        tableWrapper.innerHTML = `
          <table class="custom-table">
            <thead>
              <tr>
                <th>Nome do Cliente</th>
                <th>Valor do Crédito</th>
                <th>Forma de Pagamento</th>
                <th>Número da Cota</th>
                <th>Número do Grupo</th>
                <th>Data da Venda</th>
                <th>Número do Contrato</th>
                <th>Forma de Captação</th>
                <th style="text-align: center;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${linhasHtml}
            </tbody>
          </table>
        `;
        cardMes.appendChild(tableWrapper);

        // Barra de rolagem HTML física sempre visível para mouse externo
        const scrollBarEl = this.criarBarraRolagemFisica(tableWrapper);
        cardMes.appendChild(scrollBarEl);

        container.appendChild(cardMes);
      });

      const textoPrefixo = mesAno === 'todas' ? 'Total Geral Acumulado' : 'Total no Período';
      document.getElementById('vendasMesResumoTotal').textContent = `${textoPrefixo}: ${this.formatarMoeda(totalGeral)}`;
    } catch (err) {
      console.error('Erro ao carregar vendas por mês:', err);
    }
  },

  // Pesquisas estritas (Nome do cliente ou Número do contrato)
  configurarPesquisas() {
    let timeoutClientes = null;
    document.getElementById('buscaClientes').addEventListener('input', (e) => {
      clearTimeout(timeoutClientes);
      timeoutClientes = setTimeout(() => {
        this.carregarClientes(e.target.value);
      }, 250);
    });

    let timeoutContratos = null;
    document.getElementById('buscaContratos').addEventListener('input', (e) => {
      clearTimeout(timeoutContratos);
      timeoutContratos = setTimeout(() => {
        this.carregarContratos(e.target.value);
      }, 250);
    });
  },

  // Filtros de seleção de mês/ano
  configurarFiltrosPeriodo() {
    document.getElementById('relatorioMesAno').addEventListener('change', () => {
      this.carregarRelatorios();
    });

    document.getElementById('filtroVendasMes').addEventListener('change', () => {
      this.carregarVendasMes();
    });

    const btnTodas = document.getElementById('btnTodasVendasMes');
    if (btnTodas) {
      btnTodas.addEventListener('click', () => {
        this.carregarVendasMes(true);
      });
    }
  },

  // Seção Configurações
  configurarConfiguracoes() {
    document.getElementById('btnAdicionarPagamento').addEventListener('click', async () => {
      const input = document.getElementById('novoPagamentoInput');
      const nome = input.value.trim();
      if (!nome) return;

      try {
        const res = await fetch('/api/opcoes/pagamentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        input.value = '';
        this.mostrarToast('Forma de pagamento adicionada!');
        await this.carregarOpcoes();
      } catch (err) {
        this.mostrarToast(err.message, 'erro');
      }
    });

    document.getElementById('btnAdicionarCaptacao').addEventListener('click', async () => {
      const input = document.getElementById('novaCaptacaoInput');
      const nome = input.value.trim();
      if (!nome) return;

      try {
        const res = await fetch('/api/opcoes/captacoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        input.value = '';
        this.mostrarToast('Forma de captação adicionada!');
        await this.carregarOpcoes();
      } catch (err) {
        this.mostrarToast(err.message, 'erro');
      }
    });
  },

  renderizarConfiguracoes() {
    const listaPag = document.getElementById('listaPagamentos');
    const listaCap = document.getElementById('listaCaptacoes');
    if (!listaPag || !listaCap) return;

    listaPag.innerHTML = '';
    this.opcoes.pagamentos.forEach(p => {
      const li = document.createElement('li');
      li.style.padding = '8px 12px';
      li.style.background = '#f8fafc';
      li.style.borderRadius = '6px';
      li.style.fontSize = '0.88rem';
      li.textContent = `• ${p.nome}`;
      listaPag.appendChild(li);
    });

    listaCap.innerHTML = '';
    this.opcoes.captacoes.forEach(c => {
      const li = document.createElement('li');
      li.style.padding = '8px 12px';
      li.style.background = '#f8fafc';
      li.style.borderRadius = '6px';
      li.style.fontSize = '0.88rem';
      li.textContent = `• ${c.nome}`;
      listaCap.appendChild(li);
    });
  },

  // MODAL DE EDIÇÃO DE VENDAS
  configurarModalEdicao() {
    const modal = document.getElementById('modalEdicao');
    const form = document.getElementById('formEdicaoVenda');
    const btnFechar = document.getElementById('btnFecharModal');
    const btnCancelar = document.getElementById('btnCancelarEdicao');
    const btnExcluir = document.getElementById('btnExcluirVenda');
    const inputData = document.getElementById('editDataVenda');
    const inputMes = document.getElementById('editMesVenda');
    const inputValor = document.getElementById('editValorCredito');

    const fechar = () => { modal.style.display = 'none'; };
    btnFechar.addEventListener('click', fechar);
    btnCancelar.addEventListener('click', fechar);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) fechar();
    });

    // Aplicar máscara inteligente com salto automático no modal
    this.aplicarMascaraData(inputData, (iso) => {
      inputMes.value = this.calcularCompetenciaCiclo(iso);
    });

    // Máscara monetária no edit
    inputValor.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      if (!value) {
        e.target.value = '';
        return;
      }
      const valorNum = (parseInt(value, 10) / 100).toFixed(2);
      e.target.value = Number(valorNum).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    });

    // Submeter edição
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const vendaId = document.getElementById('editVendaId').value;
      const dataVendaBR = inputData.value;
      const dataVenda = this.converterDataBRparaISO(dataVendaBR);
      if (!dataVenda || !/^\d{4}-\d{2}-\d{2}$/.test(dataVenda)) {
        this.mostrarToast('Por favor, informe uma data válida no formato DD/MM/AAAA.', 'erro');
        return;
      }
      const mesAnoCompetencia = inputMes.value;
      const nomeCliente = document.getElementById('editNomeCliente').value.trim();
      const valorStr = inputValor.value;
      const numeroContrato = document.getElementById('editNumeroContrato').value.trim();
      const numeroGrupo = document.getElementById('editNumeroGrupo').value.trim();
      const numeroCota = document.getElementById('editNumeroCota').value.trim();
      const formaPagamentoId = document.getElementById('editFormaPagamento').value;
      const formaCaptacaoId = document.getElementById('editFormaCaptacao').value;

      let valorLimpo = valorStr.replace(/[^\d]/g, '');
      const valorCredito = parseFloat(valorLimpo) / 100;

      if (!valorCredito || isNaN(valorCredito) || valorCredito <= 0) {
        this.mostrarToast('Por favor, informe um valor de crédito válido.', 'erro');
        return;
      }

      try {
        const res = await fetch(`/api/vendas/${vendaId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataVenda,
            mesAnoCompetencia,
            nomeCliente,
            valorCredito,
            numeroContrato,
            numeroGrupo,
            numeroCota,
            formaPagamentoId: Number(formaPagamentoId),
            formaCaptacaoId: Number(formaCaptacaoId)
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao atualizar.');

        this.mostrarToast('Registro atualizado com sucesso!');
        fechar();

        // Recarregar tela atual
        if (this.secaoAtual === 'clientes') this.carregarClientes();
        if (this.secaoAtual === 'contratos') this.carregarContratos();
        if (this.secaoAtual === 'vendas-mes') this.carregarVendasMes();
        this.carregarDashboard();
      } catch (err) {
        this.mostrarToast(err.message, 'erro');
      }
    });

    // Excluir registro
    btnExcluir.addEventListener('click', async () => {
      const vendaId = document.getElementById('editVendaId').value;
      if (!confirm('Tem certeza que deseja excluir esta venda do sistema?')) return;

      try {
        const res = await fetch(`/api/vendas/${vendaId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao excluir.');

        this.mostrarToast('Registro excluído com sucesso!');
        fechar();

        if (this.secaoAtual === 'clientes') this.carregarClientes();
        if (this.secaoAtual === 'contratos') this.carregarContratos();
        if (this.secaoAtual === 'vendas-mes') this.carregarVendasMes();
        this.carregarDashboard();
      } catch (err) {
        this.mostrarToast(err.message, 'erro');
      }
    });
  },

  abrirModalEdicao(item) {
    const modal = document.getElementById('modalEdicao');
    document.getElementById('editVendaId').value = item.venda_id;
    document.getElementById('editDataVenda').value = this.converterDataISOparaBR(item.data_venda);
    
    const comp = item.mes_ano_competencia || (item.data_venda ? this.calcularCompetenciaCiclo(item.data_venda) : '');
    document.getElementById('editMesVenda').value = comp;

    document.getElementById('editNomeCliente').value = item.cliente_nome || '';
    document.getElementById('editValorCredito').value = Number(item.valor_credito || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
    document.getElementById('editNumeroContrato').value = item.contrato_numero || '';
    document.getElementById('editNumeroGrupo').value = item.grupo_numero || '';
    document.getElementById('editNumeroCota').value = item.cota_numero || '';

    // Preencher selects do modal
    const selPag = document.getElementById('editFormaPagamento');
    selPag.innerHTML = '';
    this.opcoes.pagamentos.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nome;
      if (item.pagamento_id == p.id || item.forma_pagamento == p.nome) opt.selected = true;
      selPag.appendChild(opt);
    });

    const selCap = document.getElementById('editFormaCaptacao');
    selCap.innerHTML = '';
    this.opcoes.captacoes.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nome;
      if (item.captacao_id == c.id || item.forma_captacao == c.nome) opt.selected = true;
      selCap.appendChild(opt);
    });

    modal.style.display = 'flex';
  },

  // MÉTODOS PARA ROLAGEM HORIZONTAL DAS TABELAS
  criarBarraRolagemFisica(tableWrapper) {
    const bar = document.createElement('div');
    bar.className = 'custom-scrollbar-bar';

    const btnLeft = document.createElement('button');
    btnLeft.type = 'button';
    btnLeft.className = 'btn-scroll-arrow';
    btnLeft.innerHTML = '&#9664; Rolar';
    btnLeft.title = 'Rolar para a esquerda';

    const btnRight = document.createElement('button');
    btnRight.type = 'button';
    btnRight.className = 'btn-scroll-arrow';
    btnRight.innerHTML = 'Rolar &#9654;';
    btnRight.title = 'Rolar para a direita';

    const track = document.createElement('div');
    track.className = 'custom-scrollbar-track';

    const thumb = document.createElement('div');
    thumb.className = 'custom-scrollbar-thumb';
    track.appendChild(thumb);

    bar.appendChild(btnLeft);
    bar.appendChild(track);
    bar.appendChild(btnRight);

    const atualizarPolegar = () => {
      const maxScroll = tableWrapper.scrollWidth - tableWrapper.clientWidth;
      if (maxScroll <= 0) {
        bar.style.display = 'none';
        return;
      }
      bar.style.display = 'flex';
      const trackWidth = track.clientWidth || 300;
      const thumbWidth = Math.max(50, (tableWrapper.clientWidth / tableWrapper.scrollWidth) * trackWidth);
      thumb.style.width = `${thumbWidth}px`;
      const maxThumbLeft = trackWidth - thumbWidth;
      const thumbLeft = (tableWrapper.scrollLeft / maxScroll) * maxThumbLeft;
      thumb.style.transform = `translateX(${thumbLeft}px)`;
    };

    tableWrapper.addEventListener('scroll', atualizarPolegar);
    window.addEventListener('resize', atualizarPolegar);
    setTimeout(atualizarPolegar, 100);

    btnLeft.addEventListener('click', () => {
      tableWrapper.scrollBy({ left: -250, behavior: 'smooth' });
    });
    btnRight.addEventListener('click', () => {
      tableWrapper.scrollBy({ left: 250, behavior: 'smooth' });
    });

    let isDragging = false;
    let startX = 0;
    let startScrollLeft = 0;

    thumb.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startScrollLeft = tableWrapper.scrollLeft;
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const trackWidth = track.clientWidth;
      const thumbWidth = thumb.clientWidth;
      const maxThumbLeft = trackWidth - thumbWidth;
      const maxScroll = tableWrapper.scrollWidth - tableWrapper.clientWidth;
      if (maxThumbLeft > 0) {
        tableWrapper.scrollLeft = startScrollLeft + (dx / maxThumbLeft) * maxScroll;
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = '';
      }
    });

    track.addEventListener('click', (e) => {
      if (e.target === thumb) return;
      const rect = track.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percent = clickX / rect.width;
      const maxScroll = tableWrapper.scrollWidth - tableWrapper.clientWidth;
      tableWrapper.scrollTo({ left: percent * maxScroll, behavior: 'smooth' });
    });

    return bar;
  },

  rolarTabela(wrapperId, delta) {
    const el = document.getElementById(wrapperId);
    if (el) {
      el.scrollBy({ left: delta, behavior: 'smooth' });
    }
  },

  sincronizarScrollSlider(wrapperId, percentual) {
    const el = document.getElementById(wrapperId);
    if (el) {
      const maxScroll = el.scrollWidth - el.clientWidth;
      el.scrollLeft = (percentual / 100) * maxScroll;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

