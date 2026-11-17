-- =======================================================
-- ATUALIZAÇÃO SUPABASE: MULTIUSUÁRIOS (VENDEDORES & GERENTE)
-- Execute este script no SQL Editor do Supabase
-- =======================================================

-- 1. Criar tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('gerente', 'vendedor')),
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Desativar RLS para permitir acesso via API da aplicação
ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;

-- 2. Inserir acessos iniciais: Giovanni (Vendedor) e Gerente
INSERT INTO usuarios (nome, usuario, senha, perfil) VALUES
  ('Giovanni', 'giovanni', '3105', 'vendedor'),
  ('Gerente', 'gerente', '3105', 'gerente')
ON CONFLICT (usuario) DO NOTHING;

-- 3. Adicionar coluna vendedor_id na tabela vendas (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vendas' AND column_name = 'vendedor_id'
  ) THEN
    ALTER TABLE vendas ADD COLUMN vendedor_id BIGINT REFERENCES usuarios(id);
  END IF;
END $$;

-- 4. Vincular todas as vendas existentes da base ao Giovanni
UPDATE vendas 
SET vendedor_id = (SELECT id FROM usuarios WHERE usuario = 'giovanni' LIMIT 1)
WHERE vendedor_id IS NULL;
