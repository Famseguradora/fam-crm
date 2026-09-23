-- ============================================================================
--  A LISTA DA FILA DO DIA  ·  de quem eu quero VER, e não do que a FAM aceita
--  17/09/2026
--
--  A Fila do dia (a primeira aba do Comercial) mostra o que chegou dos
--  remetentes que a pessoa escolheu, até o último dia útil anterior. A
--  primeira versão dela reaproveitou `email_contas.remetentes` para isso, e
--  estava errado — o revisor apontou no mesmo dia:
--
--    `remetentes` é a RÉGUA DO CARTEIRO. É com ela que `/api/carteiro` decide
--    e grava `emails_caixa.serve`, que por sua vez alimenta a aba "Para
--    análise" da caixa e a view `painel_pedidos` do relatório gerencial.
--    Montar a lista da minha fila mudaria, calada, o que a FAM inteira conta
--    como pedido de análise naquela caixa.
--
--  São duas perguntas diferentes, e agora são dois campos:
--
--    remetentes        de quem a FAM aceita pedido de análise (régua, grava `serve`)
--    fila_remetentes   de quem EU quero ver na minha fila do dia (só a tela)
--
--  A lista da fila aceita remetente de fora da FAM sem mexer em regra nenhuma:
--  ela não decide o que é pedido, só o que aparece na minha mesa. É o que o
--  colega que vai cuidar de `comercial@` precisa.
--
--  ADITIVO: não apaga nada, não muda comportamento de quem já existe. Caixa
--  com a lista vazia mostra todo mundo na fila, que é como estava antes.
--
--  Rollback:
--    alter table public.email_contas drop column if exists fila_remetentes;
-- ============================================================================

alter table public.email_contas
  add column if not exists fila_remetentes text[] not null default '{}';

comment on column public.email_contas.fila_remetentes is
  'De quem o dono da caixa quer ver na Fila do dia (aba Comercial). Aceita o endereço '
  'inteiro ou o domínio com @ na frente. NÃO é régua: não decide `serve` nem o que vira '
  'pedido de análise — para isso é `remetentes`. Vazia = a fila mostra todo mundo.';
