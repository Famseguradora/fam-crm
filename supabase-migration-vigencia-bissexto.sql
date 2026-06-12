-- ============================================================================
--  MIGRAÇÃO: vigência precisa com ano bissexto (29/fev).
--
--  PROBLEMA: o prêmio era calculado por `vigencia_anos` tratado como ANOS, sem
--  considerar a duração real em dias. Um período que cruza um 29/fev tem 366
--  dias e o prêmio ficava levemente errado. Além disso, operações em MESES
--  guardavam o nº de meses em `vigencia_anos`, o que distorcia o prêmio.
--
--  SOLUÇÃO:
--    • nova coluna `vigencia_dias` (INTEGER) = nº EXATO de dias de cobertura.
--    • `vigencia_anos` continua guardando o valor digitado na unidade escolhida
--      (anos, meses ou dias) — só para reexibir no formulário/relatórios.
--    • `premio_previsto` (coluna GERADA) passa a ser pró-rata por dias:
--          ROUND( LEAST(lmg, 80.000.000) * taxa / 100 * vigencia_dias / 365 , 2 )
--      O teto FAM de R$ 80M sobre o LMG é mantido.
--
--  IMPORTANTE:
--    • Faça BACKUP antes:  node scripts/backup-db.mjs
--    • Operações em MESES terão o prêmio CORRIGIDO (antes estavam inflados).
--      Operações em ANOS não mudam de valor.
--    • Rode no Supabase → SQL Editor. Idempotente (pode rodar mais de uma vez).
--    • Rode ANTES de publicar o novo código (o app passa a enviar vigencia_dias).
-- ============================================================================

-- 1) Coluna canônica de dias (o Postgres/JS já tratam 29/fev nativamente).
ALTER TABLE public.operacoes ADD COLUMN IF NOT EXISTS vigencia_dias INTEGER;

-- 2) Backfill dos dados existentes a partir do que está gravado hoje.
UPDATE public.operacoes SET vigencia_dias = GREATEST(1, CASE
  WHEN periodicidade_vigencia = 'Meses'            THEN ROUND(vigencia_anos * 365.0 / 12.0)
  WHEN periodicidade_vigencia IN ('Dias', 'Data')  THEN ROUND(vigencia_anos)
  ELSE                                                  ROUND(vigencia_anos * 365.0)
END)
WHERE vigencia_dias IS NULL;

-- 3) Recria o prêmio (coluna GERADA) usando os dias. Mantém o teto de R$ 80M.
--    Como é STORED, recriá-la recalcula TODAS as linhas.
ALTER TABLE public.operacoes DROP COLUMN IF EXISTS premio_previsto;

-- 3b) Amplia a precisão de vigencia_anos para comportar contagens em DIAS
--     (ex.: 1.095 dias) sem estourar o NUMERIC(5,2) antigo.
ALTER TABLE public.operacoes ALTER COLUMN vigencia_anos TYPE NUMERIC(10,2);

ALTER TABLE public.operacoes ADD COLUMN premio_previsto NUMERIC(18,2) GENERATED ALWAYS AS (
  ROUND(
    LEAST(lmg, 80000000) * taxa / 100
    * COALESCE(vigencia_dias, ROUND(vigencia_anos * 365.0)) / 365.0,
    2
  )
) STORED;

-- Conferência rápida (opcional): linhas sem dias definidos devem retornar 0.
-- SELECT COUNT(*) FROM public.operacoes WHERE vigencia_dias IS NULL;
