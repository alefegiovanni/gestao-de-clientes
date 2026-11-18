const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'consorcios.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
function initDb() {
  db.exec(`
    -- Clientes
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Formas de Pagamento
    CREATE TABLE IF NOT EXISTS pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE
    );

    -- Formas de Captação
    CREATE TABLE IF NOT EXISTS captacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE
    );

    -- Grupos
    CREATE TABLE IF NOT EXISTS grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL UNIQUE
    );

    -- Cotas
    CREATE TABLE IF NOT EXISTS cotas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grupo_id INTEGER NOT NULL,
      numero TEXT NOT NULL,
      FOREIGN KEY (grupo_id) REFERENCES grupos(id),
      UNIQUE(grupo_id, numero)
    );

    -- Contratos
    CREATE TABLE IF NOT EXISTS contratos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL UNIQUE,
      cliente_id INTEGER NOT NULL,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );

    -- Vendas
    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      contrato_id INTEGER NOT NULL UNIQUE,
      cota_id INTEGER NOT NULL,
      pagamento_id INTEGER NOT NULL,
      captacao_id INTEGER NOT NULL,
      valor_credito REAL NOT NULL,
      data_venda TEXT NOT NULL, -- formato YYYY-MM-DD
      mes_ano_competencia TEXT NOT NULL, -- formato YYYY-MM
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (contrato_id) REFERENCES contratos(id),
      FOREIGN KEY (cota_id) REFERENCES cotas(id),
      FOREIGN KEY (pagamento_id) REFERENCES pagamentos(id),
      FOREIGN KEY (captacao_id) REFERENCES captacoes(id)
    );

    -- Configurações / Opções adicionais
    CREATE TABLE IF NOT EXISTS config (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );

    -- Usuários e Acessos da Equipe
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
      senha TEXT NOT NULL,
      perfil TEXT NOT NULL CHECK (perfil IN ('gerente', 'vendedor')),
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Adicionar coluna primeiro_acesso e comissao_padrao_pct na tabela usuarios se ainda não existirem
  const colsUsuarios = db.prepare("PRAGMA table_info(usuarios)").all().map(c => c.name);
  if (!colsUsuarios.includes('primeiro_acesso')) {
    db.exec("ALTER TABLE usuarios ADD COLUMN primeiro_acesso INTEGER DEFAULT 1");
  }
  if (!colsUsuarios.includes('comissao_padrao_pct')) {
    db.exec("ALTER TABLE usuarios ADD COLUMN comissao_padrao_pct REAL DEFAULT 1.0");
  }

  // Adicionar colunas vendedor_id e de comissão na tabela vendas se ainda não existirem
  const colsVendas = db.prepare("PRAGMA table_info(vendas)").all().map(c => c.name);
  if (!colsVendas.includes('vendedor_id')) {
    db.exec("ALTER TABLE vendas ADD COLUMN vendedor_id INTEGER REFERENCES usuarios(id)");
  }
  if (!colsVendas.includes('comissao_vendedor_pct')) {
    db.exec("ALTER TABLE vendas ADD COLUMN comissao_vendedor_pct REAL DEFAULT 0");
  }
  if (!colsVendas.includes('comissao_meses')) {
    db.exec("ALTER TABLE vendas ADD COLUMN comissao_meses INTEGER DEFAULT 1");
  }
  if (!colsVendas.includes('comissao_gerente_pct')) {
    db.exec("ALTER TABLE vendas ADD COLUMN comissao_gerente_pct REAL DEFAULT 0");
  }

  // Seed de usuários padrão se a tabela de usuários estiver vazia
  const countUsers = db.prepare('SELECT count(*) as count FROM usuarios').get().count;
  if (countUsers === 0) {
    const insertUser = db.prepare('INSERT INTO usuarios (nome, usuario, senha, perfil) VALUES (?, ?, ?, ?)');
    insertUser.run('Giovanni', 'giovanni', '3105', 'vendedor');
    insertUser.run('Gerente', 'gerente', '3105', 'gerente');
  }

  // Vincular vendas existentes sem vendedor ao Giovanni
  const userGiovanni = db.prepare("SELECT id FROM usuarios WHERE usuario = 'giovanni'").get();
  if (userGiovanni) {
    db.prepare("UPDATE vendas SET vendedor_id = ? WHERE vendedor_id IS NULL").run(userGiovanni.id);
  }

  // Inserir valores padrão para pagamentos e captações se vazios
  const countPagamentos = db.prepare('SELECT count(*) as count FROM pagamentos').get().count;
  if (countPagamentos === 0) {
    const insertPagamento = db.prepare('INSERT INTO pagamentos (nome) VALUES (?)');
    const defaultPagamentos = [
      'Boleto Bancário',
      'Débito Automático',
      'Cartão de Crédito',
      'Transferência / PIX'
    ];
    for (const p of defaultPagamentos) {
      insertPagamento.run(p);
    }
  }

  const countCaptacoes = db.prepare('SELECT count(*) as count FROM captacoes').get().count;
  if (countCaptacoes === 0) {
    const insertCaptacao = db.prepare('INSERT INTO captacoes (nome) VALUES (?)');
    const defaultCaptacoes = [
      'Indicação',
      'Redes Sociais',
      'Google / Site',
      'Base de Clientes / Renovação',
      'Prospecção Ativa',
      'Parceria',
      'Outros'
    ];
    for (const c of defaultCaptacoes) {
      insertCaptacao.run(c);
    }
  }
}

initDb();

module.exports = db;

