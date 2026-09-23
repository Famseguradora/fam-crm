-- ============================================================================
--  VÍNCULO DE GRUPO ECONÔMICO: A SPE APONTA PARA A HOLDING
--  Pedido do Marco em 18/09/2026, caso real: Yuny Stan Projeto Imobiliário I
--  S.A. (SPE) tem CNPJ e razão social próprios, mas os demonstrativos
--  financeiros são os da Yuny Incorporadora Holding S.A., já cadastrada e
--  analisada. Hoje `tomadores.cnpj` é UNIQUE e não existe nenhum jeito de
--  dizer "este tomador é o mesmo grupo daquele" — cada CNPJ é uma ilha.
--
--  A SOLUÇÃO É SIMPLES DE PROPÓSITO ("por ora, será simples"): uma
--  auto-referência em `tomadores`, travada em UM nível (a SPE aponta direto
--  para a holding; a holding nunca aponta para outra). Isso já cobre o caso
--  real e é o suficiente para a Mesa do Tomador mostrar, na SPE sem análise
--  própria, a análise vigente da holding vinculada.
--
--  O QUE NÃO ENTRA AQUI, DE PROPÓSITO: uma tabela `grupos_economicos`
--  separada. Só vale a complexidade dela no dia em que aparecer um grupo sem
--  hierarquia clara (duas holdings do mesmo grupo, ou vínculo lateral entre
--  irmãs) — o caso de hoje é sempre "SPE → holding".
-- ============================================================================

begin;

alter table public.tomadores
  add column if not exists holding_id uuid references public.tomadores(id) on delete set null;

alter table public.tomadores drop constraint if exists tomadores_holding_nao_e_ela_mesma;
alter table public.tomadores add constraint tomadores_holding_nao_e_ela_mesma
  check (holding_id is null or holding_id <> id);

create index if not exists idx_tomadores_holding_id on public.tomadores(holding_id);

comment on column public.tomadores.holding_id is
  'A holding deste tomador, quando ele é uma SPE (ou outra empresa) do mesmo grupo econômico. Vínculo de UM nível só: quem tem holding_id não pode ser holding de outro. Vinculado pelo botão "Vincular à holding" na aba Grupo da Mesa do Tomador. Quando a análise própria não existe, a Mesa cai para a análise vigente da holding — ver lib/analise/ficha.ts.';

commit;
