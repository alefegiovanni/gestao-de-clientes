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
  `);

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

