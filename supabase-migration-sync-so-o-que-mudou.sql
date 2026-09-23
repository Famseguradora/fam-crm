-- ============================================================================
--  SÓ GRAVAR O QUE MUDOU  ·  a impressão digital de cada linha sincronizada
--  17/09/2026
--
--  MEDIDO ANTES DE MEXER, no banco de produção:
--
--    tabela              linhas    UPDATEs feitos
--    ia_mensagens           179           495.782
--    analise_recados        197           490.492
--    ia_conversas            48           123.736
--
--  São 2.700 reescritas por linha. A esteira manda o mural e as conversas
--  inteiros a cada rodada (10 s) e o CRM fazia `upsert` de tudo, igual ou não.
--
--  O PEDÁGIO NÃO ERA O UPDATE, era o que vem depois: essas três tabelas estão
--  publicadas no Realtime, então cada reescrita virava um evento para o
--  Supabase decodificar. A conta, em pg_stat_statements:
--
--    SELECT wal->>...   3.233.570 chamadas   5 h 31 min de CPU do banco
--
--  Isto é 90% do tempo de processamento do banco, gasto avisando telas sobre
--  mudanças que não mudaram nada.
--
--  A CORREÇÃO é a mesma que o Carteiro já usa desde 08/09/2026: comparar antes
--  de escrever. Só faltava um jeito barato de comparar — trazer o texto de 200
--  recados a cada 10 s para comparar seria trocar um custo por outro. Daí a
--  coluna: o servidor calcula um resumo de 16 caracteres do conteúdo, lê só
--  esse resumo na rodada seguinte e grava apenas as linhas cujo resumo mudou.
--
--  ADITIVO E SEM RISCO: nenhuma linha é apagada ou alterada por esta migration.
--  A coluna nasce nula, a primeira sincronização preenche, e daí em diante a
--  escrita cai para o que realmente mudou. Se a coluna sumir, o código volta a
--  gravar tudo: degrada, não quebra.
--
--  Rollback:
--    alter table public.analise_recados drop column if exists hash_sync;
--    alter table public.ia_conversas   drop column if exists hash_sync;
--    alter table public.ia_mensagens   drop column if exists hash_sync;
-- ============================================================================

alter table public.analise_recados add column if not exists hash_sync text;
alter table public.ia_conversas    add column if not exists hash_sync text;
alter table public.ia_mensagens    add column if not exists hash_sync text;

comment on column public.analise_recados.hash_sync is
  'Resumo do conteúdo que veio do motor, para a sincronização gravar só o que mudou. '
  'Calculado no servidor (lib/sync/hash.ts). Nulo = ainda não sincronizado desde 17/09/2026.';
comment on column public.ia_conversas.hash_sync is 'Ver analise_recados.hash_sync.';
comment on column public.ia_mensagens.hash_sync is 'Ver analise_recados.hash_sync.';
