-- =======================================================
-- SCHEMA SQL PARA O SUPABASE (PostgreSQL)
-- Sistema de Gestão de Vendas de Consórcios
-- Execute este script no SQL Editor do seu projeto Supabase
-- =======================================================

-- 1. Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Formas de Pagamento
CREATE TABLE IF NOT EXISTS pagamentos (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE
);

-- 3. Formas de Captação
CREATE TABLE IF NOT EXISTS captacoes (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE
);

-- 4. Grupos
CREATE TABLE IF NOT EXISTS grupos (
  id BIGSERIAL PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE
);

-- 5. Cotas
CREATE TABLE IF NOT EXISTS cotas (
  id BIGSERIAL PRIMARY KEY,
  grupo_id BIGINT NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  UNIQUE(grupo_id, numero)
);

-- 6. Contratos
CREATE TABLE IF NOT EXISTS contratos (
  id BIGSERIAL PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  cliente_id BIGINT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT
);

-- 7. Vendas
CREATE TABLE IF NOT EXISTS vendas (
  id BIGSERIAL PRIMARY KEY,
  cliente_id BIGINT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  contrato_id BIGINT NOT NULL UNIQUE REFERENCES contratos(id) ON DELETE RESTRICT,
  cota_id BIGINT NOT NULL REFERENCES cotas(id) ON DELETE RESTRICT,
  pagamento_id BIGINT NOT NULL REFERENCES pagamentos(id) ON DELETE RESTRICT,
  captacao_id BIGINT NOT NULL REFERENCES captacoes(id) ON DELETE RESTRICT,
  valor_credito NUMERIC(15, 2) NOT NULL,
  data_venda DATE NOT NULL,
  mes_ano_competencia TEXT NOT NULL, -- formato YYYY-MM
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para otimização de busca rápida
CREATE INDEX IF NOT EXISTS idx_vendas_competencia ON vendas(mes_ano_competencia);
CREATE INDEX IF NOT EXISTS idx_contratos_numero ON contratos(numero);
CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome);

-- Inserir opções padrão de pagamentos se não existirem
INSERT INTO pagamentos (nome) VALUES 
  ('Boleto Bancário'),
  ('Débito Automático'),
  ('Cartão de Crédito'),
  ('Transferência / PIX')
ON CONFLICT (nome) DO NOTHING;

-- Inserir opções padrão de captação se não existirem
INSERT INTO captacoes (nome) VALUES 
  ('Indicação'),
  ('Redes Sociais'),
  ('Google / Site'),
  ('Base de Clientes / Renovação'),
  ('Prospecção Ativa'),
  ('Parceria'),
  ('Outros')
ON CONFLICT (nome) DO NOTHING;

