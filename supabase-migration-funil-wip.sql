-- ============================================================================
--  O FUNIL GANHA LIMITE DE FILA (WIP)  ·  09/09/2026
--
--  Vem da pesquisa de kanban que ele pediu, e e a unica regra do metodo que o
--  funil da FAM ainda nao tinha: CADA COLUNA TEM UM TETO. O ponto original do
--  kanban, na fabrica, e esse: limitar trabalho em curso. Sem teto, a coluna
--  "Em analise" cresce ate ninguem dar conta, e o gargalo so aparece quando ja
--  virou atraso com o corretor.
--
--  O TETO NAO BLOQUEIA NADA. Ele pinta a coluna quando estoura, e escreve
--  quantos estao acima. Travar o arrastar empurraria o trabalho para fora do
--  sistema, que e exatamente o que a FAM esta desfazendo.
--
--  E TABELA, e nao codigo: o teto de uma etapa muda com o tamanho da equipe, e
--  isso nao pode pedir deploy. Mesma regra do resto de `status_fluxo_operacao`.
--
--  ADITIVO: so soma coluna, roda duas vezes sem estragar.
-- ============================================================================

alter table public.status_fluxo_operacao
  add column if not exists wip_limite integer;

comment on column public.status_fluxo_operacao.wip_limite is
  'Teto de operacoes simultaneas nesta etapa (limite de WIP). Nulo = sem teto. Nao bloqueia o arrastar: pinta a coluna e diz quantas estao acima, para o gargalo aparecer antes de virar atraso.';

-- Um ponto de partida para as etapas onde a fila realmente se forma. Nao mexe
-- em etapa que ja tenha teto definido a mao, e nao inventa teto para as etapas
-- de fim de linha (Emitido, Recusado): ali a fila nao e gargalo, e historico.
update public.status_fluxo_operacao set wip_limite = 12
  where wip_limite is null and nome ilike '%anális%';
update public.status_fluxo_operacao set wip_limite = 8
  where wip_limite is null and (nome ilike '%subscri%' or nome ilike '%cotaç%' or nome ilike '%cotac%');
