-- ============================================================================
--  A MESA SEM PASTA  ·  28/09/2026
--
--  Pedido dele: a coluna "Aprovar com Ressalvas" guarda os tomadores aprovados
--  com ressalva até virarem aprovação definitiva, "sem eu ter que trazer a
--  pasta do tomador para dentro do meu notebook". Das 67 análises vigentes com
--  ressalva, só 10 tinham pasta no disco.
--
--  Três peças, todas opcionais (nulo = comportamento de antes):
--
--  1. analise_colunas.regra  ·  a coluna puxa cards do ACERVO sozinha.
--     Formato: {"recomendacao_contem": "ressalva"}. Sem acento e sem caixa,
--     porque o acervo escreve a mesma coisa de 4 jeitos.
--  2. analises.mesa_coluna_id  ·  a análise sem pasta posta numa coluna à mão
--     ("Mudar o substatus"). É a escolha dele que a segura na Mesa.
--  3. analises.fora_da_mesa_*  e  analises.aprovado_definitivo_*  ·  os dois
--     jeitos de o card sair: "Tirar da Mesa" (vai para o Acervo) e "Aprovar
--     definitivo" (grava quem e quando, e vai para o Acervo). A recomendação
--     da análise NÃO é reescrita: o relatório é a foto do dia, e a decisão
--     posterior mora ao lado dele.
--
--  As policies de `analises` e `analise_colunas` já cobrem as colunas novas.
--
--  ROLLBACK:
--    alter table public.analise_colunas drop column if exists regra;
--    alter table public.analises
--      drop column if exists mesa_coluna_id, drop column if exists mesa_por, drop column if exists mesa_em,
--      drop column if exists fora_da_mesa_em, drop column if exists fora_da_mesa_por,
--      drop column if exists aprovado_definitivo_em, drop column if exists aprovado_definitivo_por;
-- ============================================================================

alter table public.analise_colunas add column if not exists regra jsonb;

alter table public.analises
  add column if not exists mesa_coluna_id uuid references public.analise_colunas(id) on delete set null,
  add column if not exists mesa_por text,
  add column if not exists mesa_em timestamptz,
  add column if not exists fora_da_mesa_em timestamptz,
  add column if not exists fora_da_mesa_por text,
  add column if not exists aprovado_definitivo_em timestamptz,
  add column if not exists aprovado_definitivo_por text;

comment on column public.analise_colunas.regra is
  'Regra que puxa análises do acervo para a coluna. Ex.: {"recomendacao_contem":"ressalva"}. Nulo = coluna manual.';
comment on column public.analises.aprovado_definitivo_em is
  'Quando a ressalva virou aprovação definitiva (botão "Aprovar definitivo" do card). A recomendação original não muda.';

-- A coluna que ele criou em 28/09/2026 nasce com a regra dela.
update public.analise_colunas
   set regra = '{"recomendacao_contem":"ressalva"}'::jsonb
 where titulo = 'Aprovar com Ressalvas' and fase is null and regra is null;
