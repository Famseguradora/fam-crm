-- ============================================================================
--  A DETERMINAÇÃO DA DIRETORIA  ·  28/09/2026
--
--  Alphaville S.A.: o Ivan (Subscrição) mandou considerar a conversão da dívida
--  em ações. O analista fez a conta, mas a escondeu na memória de cálculo como
--  "cenário, não oficial", e a análise saiu igual à anterior. Ordem do Marco:
--  a análise oficial segue a metodologia, e o que ele pede fora dela vem
--  DESTACADO, com as duas visões lado a lado e o motivo, num parecer que vai
--  por e-mail para a Subscrição.
--
--  Esta coluna guarda o bloco `determinacao` que o analista passa a escrever no
--  JSON da análise. Nula para toda análise que não teve determinação.
--
--  ROLLBACK:
--    alter table public.analises drop column if exists determinacao;
-- ============================================================================

alter table public.analises add column if not exists determinacao jsonb;

comment on column public.analises.determinacao is
  'Parecer complementar: o resultado com a determinacao da Diretoria, fora da '
  'metodologia padrao, ao lado do oficial. Nulo quando nao houve determinacao.';
