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

  // 0. Autenticação por PIN
  configurarLogin() {
    const loginScreen = document.getElementById('loginScreen');
    const formLogin = document.getElementById('formLogin');
    const digits = document.querySelectorAll('.pin-digit');
    const erroMsg = document.getElementById('loginErro');
    const btnSair = document.getElementById('btnSair');

    // Movimentação automática de foco entre os 4 dígitos
    digits.forEach((digit, index) => {
      digit.addEventListener('input', (e) => {
        digit.value = digit.value.replace(/\D/g, '');
        if (digit.value && index < digits.length - 1) {
          digits[index + 1].focus();
        }
        if (erroMsg) erroMsg.style.display = 'none';
      });

      digit.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !digit.value && index > 0) {
          digits[index - 1].focus();
        }
      });
    });

    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      let pin = '';
      digits.forEach(d => pin += d.value);

      if (pin.length !== 4) {
        if (erroMsg) {
          erroMsg.textContent = 'Digite os 4 números da senha.';
          erroMsg.style.display = 'block';
        }
        return;
      }

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Senha incorreta.');
        }

        // Sucesso
        sessionStorage.setItem('gestao_logado', 'true');
        loginScreen.style.display = 'none';
        this.mostrarToast('Acesso liberado com sucesso!');
        this.carregarOpcoes().then(() => {
          this.carregarDashboard();
        });
      } catch (err) {
        if (erroMsg) {
          erroMsg.textContent = err.message;
          erroMsg.style.display = 'block';
        }
        digits.forEach(d => d.value = '');
        if (digits[0]) digits[0].focus();
      }
    });

    // Botão Sair do Sistema
    if (btnSair) {
      btnSair.addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.removeItem('gestao_logado');
        digits.forEach(d => d.value = '');
        if (loginScreen) loginScreen.style.display = 'flex';
        if (digits[0]) digits[0].focus();
        this.mostrarToast('Você saiu do sistema.');
      });
    }

    // Formulário de Alteração de PIN
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

  // Mês da venda identificado automaticamente a partir da data da venda
  configurarDataAutomatica() {
    const inputData = document.getElementById('campoDataVenda');
    const inputMes = document.getElementById('campoMesVenda');

    // Preenche com a data atual por padrão
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    inputData.value = `${ano}-${mes}-${dia}`;
    this.atualizarCompetenciaAutomatico(inputData.value);

    inputData.addEventListener('change', () => {
      this.atualizarCompetenciaAutomatico(inputData.value);
    });
  },

  atualizarCompetenciaAutomatico(dataStr) {
    const inputMes = document.getElementById('campoMesVenda');
    if (!dataStr) {
      inputMes.value = '';
      return;
    }
    const partes = dataStr.split('-');
    if (partes.length >= 2) {
      const competencia = `${partes[0]}-${partes[1]}`;
      inputMes.value = this.formatarCompetenciaBR(competencia);
    }
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

      const dataVenda = document.getElementById('campoDataVenda').value;
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
        
        // Restaurar data de hoje
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        document.getElementById('campoDataVenda').value = `${ano}-${mes}-${dia}`;
        this.atualizarCompetenciaAutomatico(`${ano}-${mes}-${dia}`);

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
        `;
        tbody.appendChild(tr);
      });
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
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Erro ao carregar contratos:', err);
    }
  },

  // 4. RELATÓRIOS (SOMENTE OS DOIS INDICADORES)
  async carregarRelatorios() {
    try {
      const mesInput = document.getElementById('relatorioMesAno');
      if (!mesInput.value) {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        mesInput.value = `${ano}-${mes}`;
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

  // 5. VENDAS POR MÊS
  async carregarVendasMes() {
    try {
      const mesInput = document.getElementById('filtroVendasMes');
      if (!mesInput.value) {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        mesInput.value = `${ano}-${mes}`;
      }

      const mesAno = mesInput.value;
      const res = await fetch(`/api/vendas-por-mes?mesAno=${encodeURIComponent(mesAno)}`);
      const data = await res.json();

      const tbody = document.getElementById('tabelaVendasMesCorpo');
      const empty = document.getElementById('emptyVendasMes');
      tbody.innerHTML = '';

      let totalPeriodo = 0;

      if (!data.vendas || data.vendas.length === 0) {
        empty.style.display = 'block';
        document.getElementById('vendasMesResumoTotal').textContent = `Total no Período: ${this.formatarMoeda(0)}`;
        return;
      }
      empty.style.display = 'none';

      data.vendas.forEach(item => {
        totalPeriodo += Number(item.valor_credito);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${item.cliente_nome}</strong></td>
          <td><span class="badge-money">${this.formatarMoeda(item.valor_credito)}</span></td>
          <td><span class="badge-tag">${item.forma_pagamento}</span></td>
          <td>${item.cota_numero}</td>
          <td>${item.grupo_numero}</td>
          <td>${this.formatarDataBR(item.data_venda)}</td>
          <td><span class="badge-tag">${item.contrato_numero}</span></td>
          <td><span class="badge-tag">${item.forma_captacao}</span></td>
        `;
        tbody.appendChild(tr);
      });

      document.getElementById('vendasMesResumoTotal').textContent = `Total no Período: ${this.formatarMoeda(totalPeriodo)}`;
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
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

