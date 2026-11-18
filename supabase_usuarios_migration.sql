-- =======================================================
-- ATUALIZAÇÃO SUPABASE: MULTIUSUÁRIOS, COMISSÕES E PRIMEIRO ACESSO
-- Execute este script no SQL Editor do Supabase
-- =======================================================

-- 1. Criar tabela de usuários se não existir
CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('gerente', 'vendedor')),
  primeiro_acesso BOOLEAN DEFAULT TRUE,
  comissao_padrao_pct NUMERIC DEFAULT 1.0,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Desativar RLS para permitir acesso via API da aplicação
ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;

-- 2. Garantir colunas primeiro_acesso e comissao_padrao_pct na tabela usuarios
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'usuarios' AND column_name = 'primeiro_acesso'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN primeiro_acesso BOOLEAN DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'usuarios' AND column_name = 'comissao_padrao_pct'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN comissao_padrao_pct NUMERIC DEFAULT 1.0;
  END IF;
END $$;

-- 3. Inserir ou atualizar a equipe padrão (Gerente e Vendedores) com senha padrão 3105
INSERT INTO usuarios (nome, usuario, senha, perfil, primeiro_acesso, comissao_padrao_pct) VALUES
  ('Giovanni', 'giovanni', '3105', 'vendedor', FALSE, 1.0),
  ('Isabela', 'gerente', '3105', 'gerente', FALSE, 1.0),
  ('Guilherme', 'guilherme', '3105', 'vendedor', TRUE, 1.0),
  ('Thales', 'thales', '3105', 'vendedor', TRUE, 1.0),
  ('Leonilda', 'leonilda', '3105', 'vendedor', TRUE, 1.0),
  ('Rafael', 'rafael', '3105', 'vendedor', TRUE, 1.0),
  ('Junior', 'junior', '3105', 'vendedor', TRUE, 1.0)
ON CONFLICT (usuario) DO UPDATE SET
  nome = EXCLUDED.nome,
  perfil = EXCLUDED.perfil;

-- 4. Adicionar colunas de comissão e vendedor na tabela vendas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vendas' AND column_name = 'vendedor_id'
  ) THEN
    ALTER TABLE vendas ADD COLUMN vendedor_id BIGINT REFERENCES usuarios(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vendas' AND column_name = 'comissao_vendedor_pct'
  ) THEN
    ALTER TABLE vendas ADD COLUMN comissao_vendedor_pct NUMERIC DEFAULT 1.0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vendas' AND column_name = 'comissao_meses'
  ) THEN
    ALTER TABLE vendas ADD COLUMN comissao_meses INT DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vendas' AND column_name = 'comissao_gerente_pct'
  ) THEN
    ALTER TABLE vendas ADD COLUMN comissao_gerente_pct NUMERIC DEFAULT 0.5;
  END IF;
END $$;

-- 5. Vincular todas as vendas existentes sem vendedor ao Giovanni
UPDATE vendas 
SET vendedor_id = (SELECT id FROM usuarios WHERE usuario = 'giovanni' LIMIT 1)
WHERE vendedor_id IS NULL;

-- 6. Garantir valores padrão para vendas antigas
UPDATE vendas 
SET 
  comissao_vendedor_pct = COALESCE(comissao_vendedor_pct, 1.0),
  comissao_meses = COALESCE(comissao_meses, 1),
  comissao_gerente_pct = COALESCE(comissao_gerente_pct, 0.5)
WHERE comissao_vendedor_pct IS NULL OR comissao_meses IS NULL OR comissao_gerente_pct IS NULL;
