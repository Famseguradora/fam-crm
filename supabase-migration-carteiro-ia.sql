-- ============================================================================
--  O CARTEIRO GERENCIAL, FASE 2 · a IA também pode dizer "não sei"
--  (11/09/2026, aplicada como `carteiro_gerencial_ia_indefinido`)
--
--  A IA classifica o que a régua não soube dizer. Quando nem ela sabe, a
--  resposta "indefinido" fica GRAVADA, e não jogada fora, por dois motivos:
--  o recibo mostra que a IA leu e não soube, e o mesmo e-mail não é mandado
--  (e pago) de novo a cada clique.
--
--  "indefinido" é só da IA: a pessoa decide ou não decide, e a política de
--  escrita do `humano` não muda.
--
--  ADITIVO: troca uma restrição, não toca em linha nenhuma.
-- ============================================================================

alter table public.email_classificacao drop constraint if exists email_classificacao_tipo_check;
alter table public.email_classificacao add constraint email_classificacao_tipo_check
  check (tipo in ('operacao', 'so_credito', 'nao_demanda', 'sem_apetite', 'indefinido'));

alter table public.email_classificacao drop constraint if exists email_classificacao_indefinido_so_ia;
alter table public.email_classificacao add constraint email_classificacao_indefinido_so_ia
  check (tipo <> 'indefinido' or origem = 'ia');
