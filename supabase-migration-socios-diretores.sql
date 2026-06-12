-- ============================================================================
--  MIGRAÇÃO: Diretores no Organograma Societário
--  Adiciona à tabela public.socios:
--    • categoria  → 'socio' (padrão) ou 'diretor'
--                   Diretores são opcionais e "assinam como responsáveis";
--                   ficam num grupo à parte (não entram na árvore de %).
--    • cargo      → cargo do diretor (ex.: 'Diretor Presidente'). NULL p/ sócios.
--  Idempotente. Supabase → SQL Editor → cole e rode.
-- ============================================================================

ALTER TABLE public.socios
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'socio',
  ADD COLUMN IF NOT EXISTS cargo TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'socios_categoria_check') THEN
    ALTER TABLE public.socios ADD CONSTRAINT socios_categoria_check CHECK (categoria IN ('socio','diretor'));
  END IF;
END $$;
