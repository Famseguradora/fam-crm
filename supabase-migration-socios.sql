-- ============================================================================
--  MIGRAÇÃO: Organograma Societário (sócios em árvore de profundidade livre)
--  FAM SEGURADORA — CRM
--
--  - Tabela auto-referenciante (adjacency list).
--  - tomador_id  → SEMPRE aponta para a RAIZ (o tomador dono da árvore).
--                  Permite buscar a árvore inteira em UMA query:
--                  .eq('tomador_id', <id>)
--  - parent_socio_id → NULL  = sócio direto do tomador (nível 1)
--                      não-nulo = sócio de outro sócio (qualquer nível)
--
--  Idempotente. Supabase → SQL Editor → cole e rode.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.socios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tomador_id          UUID NOT NULL REFERENCES public.tomadores(id) ON DELETE CASCADE,
  parent_socio_id     UUID REFERENCES public.socios(id) ON DELETE CASCADE,
  nome_razao_social   TEXT NOT NULL,
  documento           TEXT,                       -- CPF (11) ou CNPJ (14), só dígitos
  tipo_pessoa         TEXT CHECK (tipo_pessoa IN ('PF', 'PJ')),
  percentual          NUMERIC(5,2),               -- 0.00 a 100.00, relativo ao pai
  ordem               INTEGER NOT NULL DEFAULT 0, -- ordem entre irmãos
  ativo               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_socios_tomador ON public.socios(tomador_id);
CREATE INDEX IF NOT EXISTS idx_socios_parent  ON public.socios(parent_socio_id);

-- Trigger de updated_at (reusa a função update_updated_at() já existente no schema)
DROP TRIGGER IF EXISTS socios_updated_at ON public.socios;
CREATE TRIGGER socios_updated_at
  BEFORE UPDATE ON public.socios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados — leitura" ON public.socios;
CREATE POLICY "Autenticados — leitura" ON public.socios
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Autenticados — escrita" ON public.socios;
CREATE POLICY "Autenticados — escrita" ON public.socios
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- ============================================================================
--  Observações:
--  • ON DELETE CASCADE nas duas FKs:
--      - excluir um tomador apaga todo o seu organograma;
--      - excluir um sócio apaga automaticamente toda a sua sub-árvore.
--  • A validação "sócios de um mesmo pai somam 100%" é apenas um AVISO na UI
--    (não há constraint no banco — cap tables reais nem sempre fecham em 100%).
-- ============================================================================
