-- ============================================================================
--  A ESTEIRA AUTOMÁTICA  ·  10/09/2026
--
--  Ordem do Marco: "Trazer para a esteira" e o resto anda sozinho, fase por
--  fase, cada fase um agente: pasta, triagem, cadastro, análise de crédito.
--  Ele só é chamado quando uma fase não tem como seguir.
--
--  SÓ ACRESCENTA. Nenhuma coluna existente muda de tipo, nenhuma linha é
--  apagada, e as análises que já estavam na fila continuam manuais
--  (`automatica` nasce false para elas).
-- ============================================================================

-- 1. A fila sabe quais análises andam sozinhas e o que o agente de Cadastro achou.
alter table public.analise_fila
  add column if not exists automatica boolean not null default false,
  add column if not exists cadastro_agente jsonb,
  add column if not exists cadastro_agente_em timestamptz,
  -- Documento que chega DEPOIS de a pasta existir (subido na tela do caso)
  -- precisa descer para o notebook: `anexos_em` > `materializado_em` = baixar.
  add column if not exists anexos_em timestamptz,
  add column if not exists materializado_em timestamptz;

-- 2. As ordens novas. `publicar` já existia no código e o banco recusava.
alter table public.analise_fila drop constraint if exists analise_fila_ordem_check;
alter table public.analise_fila add constraint analise_fila_ordem_check check (
  ordem is null or ordem = any (array[
    'iniciar','pausar','retomar','parar','reconferir','forcar','ler_pasta','refazer',
    'publicar','liberar_triagem','excluir'
  ])
);
-- `excluir` entrou no mesmo dia (10/09/2026): o botão Excluir do caso em triagem
-- manda o agente tirar a pasta da raiz (vai para _excluidas, nada é apagado).

-- 3. Os dados da Receita que o cadastro jogava fora.
alter table public.tomadores
  add column if not exists cnae text,
  add column if not exists capital_social numeric,
  add column if not exists situacao_receita text,
  add column if not exists data_abertura date,
  add column if not exists receita_em timestamptz,
  -- 'receita' ou 'serasa': de onde veio o cadastro básico. Serasa quer dizer
  -- que a Receita estava fora do ar e o endereço precisa ser conferido.
  add column if not exists cadastro_fonte text;
