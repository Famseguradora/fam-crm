-- ============================================================
--  O SERASA DA ANALISE DE CREDITO, em colunas de `analises`
--
--  REGISTRO, NAO ORIGEM: esta migration foi APLICADA em 30/08/2026 pelo MCP do
--  Supabase (nome `analises_serasa`), com o Marco presente. O arquivo existe
--  para o repositorio descrever o proprio schema; rodar de novo nao faz mal
--  (tudo e `if not exists`).
--
--  Por que na propria `analises`, e nao em tabela filha: e um-para-um com a
--  analise, e a lista de consultas e curta, so leitura, nunca filtrada por SQL.
--  Quem preenche e `scripts/carga-serasa.mjs`, lendo as copias de
--  `_sistema/registro/json`. Em 30/08: 130 das 131 analises (a Moura Dubeux
--  nao tem bloco de Serasa na copia).
--
--  A regra que a carga respeita e que a tela repete: campo que a analise NAO
--  registrou fica NULO. "Sem registros" so entra quando a analise escreveu
--  isso; nunca e inventado para preencher um vazio.
-- ============================================================

alter table public.analises
  add column if not exists serasa_score integer,
  add column if not exists serasa_risco text,
  add column if not exists serasa_interpretacao text,
  add column if not exists serasa_prob text,
  add column if not exists serasa_limite_txt text,
  add column if not exists serasa_limite_num numeric,
  add column if not exists serasa_pefin text,
  add column if not exists serasa_protestos text,
  add column if not exists serasa_acoes text,
  add column if not exists serasa_recuperacao text,
  add column if not exists serasa_consultas jsonb,
  add column if not exists serasa_consultas_qtd integer,
  add column if not exists serasa_fonte text;

comment on column public.analises.serasa_score is 'Serasa Score Empresas lido da analise. Nulo quando a analise escreveu tracinho.';
comment on column public.analises.serasa_consultas is 'Lista [{data, empresa, tipo}] das consultas recentes, como a analise registrou.';
comment on column public.analises.serasa_fonte is 'De qual copia veio: revisada (o que o Marco salvou) ou gerada.';
