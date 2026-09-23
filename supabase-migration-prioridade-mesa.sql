-- ============================================================================
--  A PRIORIDADE DO CARD NA MESA  ·  23/09/2026
--
--  Pedido do Marco: "Abenaias subiu um e-mail da empresa XPTO, criando um card;
--  o Ivan subiu um e-mail depois, mas ele quer urgência no caso: ele arrasta o
--  card, igual o Trello, onde é possível alterar a classificação (1, 2, 3...)".
--
--  ATÉ AQUI a coluna da Mesa era ordenada por UMA regra só, e ela não era
--  escolha de ninguém: o mais parado primeiro (`parado_desde`). Não havia onde
--  guardar "este aqui na frente", e o pedido urgente do Ivan ficava no fim da
--  coluna só porque chegou depois.
--
--  O QUE O NÚMERO É, e o que ele não é:
--    · é a POSIÇÃO do card DENTRO da coluna em que ele está: 1 é o primeiro.
--      Não é gravidade ("alta/média/baixa"), é fila.
--    · `null` = ninguém mexeu. Esses ficam DEPOIS dos priorizados, na ordem de
--      sempre (o mais parado primeiro). Card novo não cai na frente do que
--      alguém colocou lá à mão.
--
--  A MESMA EMPRESA, O MESMO NÚMERO. O quadro desenha uma EMPRESA por card
--  (`agruparPorEmpresa`, 09/09/2026) e uma empresa pode ter três pastas. A
--  prioridade é gravada em TODAS as pastas do grupo: assim a ordem sobrevive
--  à troca da pasta principal, que muda quando a análise anda.
--
--  ELA É DO LADO DO CRM, como `coluna_id`. A sincronização do notebook
--  (/api/esteira, `sincronizar`) só grava os campos que ela lista, e estes não
--  estão entre eles: o agente nunca reordena a fila de uma pessoa.
--
--  ROLLBACK:
--    alter table public.analise_fila
--      drop column if exists prioridade,
--      drop column if exists prioridade_por,
--      drop column if exists prioridade_em;
-- ============================================================================

begin;

alter table public.analise_fila
  add column if not exists prioridade     integer,
  add column if not exists prioridade_por text,
  add column if not exists prioridade_em  timestamptz;

comment on column public.analise_fila.prioridade is
  'Posição escolhida à mão dentro da coluna da Mesa (1 = primeiro). Nula = sem escolha: entra depois dos priorizados, na ordem automática (mais parado primeiro).';
comment on column public.analise_fila.prioridade_por is
  'Quem arrastou o card pela última vez.';

-- Positivo ou nulo. Zero e negativo não significam nada numa fila, e um número
-- sem significado na tela é um número que alguém vai interpretar errado.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'analise_fila_prioridade_positiva'
  ) then
    alter table public.analise_fila
      add constraint analise_fila_prioridade_positiva
      check (prioridade is null or prioridade > 0);
  end if;
end $$;

-- A coluna é lida sempre junto da coluna do quadro; o índice é o que evita
-- varrer a fila inteira para desenhar uma coluna.
create index if not exists analise_fila_prioridade_idx
  on public.analise_fila (prioridade)
  where prioridade is not null;

commit;
