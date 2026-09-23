-- ============================================================================
--  O RELATORIO COMPLETO, PARA LER NO CRM PUBLICADO  ·  23/09/2026
--
--  O relatorio de verdade (template v13) so abre no notebook do Marco, porque
--  quem o serve e o motor local. Para a equipe le-lo no CRM do ar, a carga
--  guarda aqui uma copia em modo somente leitura:
--
--    id = 'modelo'         o documento v13 com o auditor.js dentro (um so)
--    id = <chave_local>    o que e proprio de uma analise: contexto + dados
--
--  A tela junta as duas pecas e mostra num quadro isolado (sandbox, sem
--  acesso a sessao do CRM). Quem le e quem tem `fam_ve_analise()`, a mesma
--  regra das tabelas `analise*`. Ninguem escreve por aqui: a carga usa a
--  service role, que passa por cima da RLS, e por isso NAO ha policy de
--  insert/update/delete.
--
--  ROLLBACK:  drop table if exists analise_relatorio_leitura;
-- ============================================================================

create table if not exists analise_relatorio_leitura (
  id            text primary key,
  html          text not null,
  hash          text,
  atualizado_em timestamptz not null default now()
);

alter table analise_relatorio_leitura enable row level security;

drop policy if exists analise_relatorio_leitura_le on analise_relatorio_leitura;
create policy analise_relatorio_leitura_le on analise_relatorio_leitura
  for select to authenticated
  using (fam_ve_analise());

comment on table analise_relatorio_leitura is
  'Copia somente leitura do relatorio v13 para o CRM do ar. Escrita so pela carga (service role).';
