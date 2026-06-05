-- ============================================================================
--  MIGRAÇÃO: aplicar o teto de R$ 80 milhões TAMBÉM no cálculo do prêmio.
--
--  Regra FAM: o LMG é limitado a R$ 80.000.000 por operação. O prêmio previsto
--  deve ser calculado sobre o LMG LIMITADO, nunca sobre o LMG cheio.
--
--  ANTES (coluna GENERATED no banco): usa o LMG cheio →
--      premio_previsto = ROUND(lmg * taxa * vigencia_anos / 100, 2)
--  DEPOIS: usa o LMG limitado a 80M →
--      premio_previsto = ROUND(LEAST(lmg, 80000000) * taxa * vigencia_anos / 100, 2)
--
--  OBS.: `taxa` está em pontos percentuais (ex.: 0,5 = 0,5%), por isso o ÷100.
--  Como é coluna STORED, recriá-la recalcula TODAS as linhas existentes.
--
--  Como aplicar: Supabase → SQL Editor → cole e rode. Faça backup antes
--  (scripts/backup-db.mjs). Idempotente: pode rodar mais de uma vez.
-- ============================================================================

ALTER TABLE public.operacoes DROP COLUMN IF EXISTS premio_previsto;

ALTER TABLE public.operacoes
  ADD COLUMN premio_previsto NUMERIC(18,2) GENERATED ALWAYS AS
    (ROUND(LEAST(lmg, 80000000) * taxa * vigencia_anos / 100, 2)) STORED;

-- Conferência rápida: deve retornar 0 linhas se o teto estiver correto.
-- SELECT id, lmg, taxa, vigencia_anos, premio_previsto
-- FROM public.operacoes
-- WHERE lmg > 80000000
--   AND premio_previsto <> ROUND(80000000 * taxa * vigencia_anos / 100, 2);
