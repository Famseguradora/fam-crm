-- ============================================================================
--  O PARECER COMPLEMENTAR EDITADO  ·  28/09/2026
--
--  O parecer da determinação sai gerado do bloco do analista, mas quem assina é
--  o Marco: ele precisa acrescentar as próprias ressalvas ("análise
--  especulativa, não confere aprovação tácita ou real") e imagens antes de
--  mandar à Subscrição. O documento editado mora aqui, e NÃO em `determinacao`,
--  porque a carga do notebook reescreve `determinacao` e apagaria o que ele
--  escreveu. Formato: { html, por, em }. Nulo = vale o parecer gerado.
--
--  Lê quem vê análise e grava só o analista: as policies de `analises` já
--  cobrem a coluna nova.
--
--  ROLLBACK:
--    alter table public.analises drop column if exists parecer_editado;
-- ============================================================================

alter table public.analises add column if not exists parecer_editado jsonb;

comment on column public.analises.parecer_editado is
  'O parecer complementar como o analista o deixou ({html, por, em}). Nulo = vale o gerado de `determinacao`. A carga nao toca.';
