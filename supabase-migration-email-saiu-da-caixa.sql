-- ============================================================================
--  O E-MAIL QUE SAIU DA CAIXA DE ENTRADA
--  17/09/2026
--
--  Ordem do Marco: "eu já tirei e-mails da caixa de entrada e o sistema
--  continua lendo os e-mails. Tem que ser somente o que está na caixa de
--  entrada, porque eu retiro alguns e-mails para outras caixas."
--
--  O QUE ACONTECIA: o Carteiro sempre leu SÓ a Caixa de Entrada (`outlook.ps1`,
--  GetDefaultFolder(6), sem subpasta). O problema não era a leitura, era a
--  memória: o e-mail que entrou uma vez ficava gravado aqui para sempre, e
--  mover a mensagem no Outlook não dizia nada ao CRM. A caixa do CRM ia ficando
--  diferente da caixa real, e a diferença só crescia.
--
--  O QUE PASSA A ACONTECER: na varredura COMPLETA de uma janela (não na olhada
--  rápida no topo), o Carteiro manda o começo da janela e avisa que trouxe tudo
--  o que havia. O CRM então marca `saiu_em` em quem está guardado naquela
--  janela e não apareceu — ou seja, não está mais na Caixa de Entrada. Se a
--  mensagem voltar para a caixa, a varredura seguinte zera o campo.
--
--  NÃO APAGA NADA. O e-mail que saiu continua no banco, com a data em que
--  sumiu: o caso que ele abriu, os documentos e a trilha continuam de pé. O que
--  muda é que ele deixa de aparecer na caixa e na fila do CRM, que era o pedido.
--
--  Rollback:
--    alter table public.emails_caixa drop column if exists saiu_em;
--    (a view volta com: supabase-migration-email-ja-analisado.sql)
-- ============================================================================

alter table public.emails_caixa
  add column if not exists saiu_em timestamptz;

comment on column public.emails_caixa.saiu_em is
  'Quando o e-mail deixou de estar na Caixa de Entrada do Outlook (movido para outra pasta '
  'ou apagado). Preenchido pela varredura completa do Carteiro, e zerado se a mensagem '
  'voltar. Nulo = está na caixa. As telas mostram só os nulos.';

-- A varredura pergunta "quem desta conta, nesta janela, ainda não saiu?".
create index if not exists emails_caixa_na_caixa_idx
  on public.emails_caixa (conta_id, recebido_em desc)
  where saiu_em is null;

-- ── a view do painel, com a coluna nova ────────────────────────────────────
-- Recriada igual à de supabase-migration-email-ja-analisado.sql, mais `saiu_em`:
-- sem ela, o boletim do dia contaria como pendente um e-mail que não está mais
-- na caixa de ninguém.
drop view if exists public.painel_pedidos;

-- A definição abaixo é a que estava no banco em 17/09/2026 (lida com
-- pg_get_viewdef), com UMA linha nova: `e.saiu_em`. Nada mais muda — view
-- reescrita de memória é como uma coluna vira outra sem ninguém notar.
create view public.painel_pedidos
with (security_invoker = true) as
select
  e.id, e.conta_id, e.conta, e.assunto, e.de, e.email_de, e.recebido_em,
  e.anexos_uteis, e.estado, e.serve, e.motivo, e.eh_pedido,
  e.dono_auth_id, e.dono_nome, e.assumido_em,
  e.aguardando_desde, e.aguardando_motivo, e.cobrado_em,
  e.caso_id, c.numero as caso_numero, c.etapa as caso_etapa,
  c.criado_em as caso_criado_em, c.concluido_em as caso_concluido_em,
  c.cnpj, c.razao_social,
  coalesce(c.corretora_texto, co.nome_fantasia, co.razao_social) as corretora,
  f.situacao as fila_situacao,
  coalesce(f.concluido_em_crm, f.concluido_em) as fila_concluido_em,
  greatest(
    e.recebido_em, e.estado_em, e.assumido_em, e.classificado_em,
    e.analisado_fora_em, c.criado_em, c.enviado_analise_em,
    f.criado_em, f.concluido_em_crm
  ) as ultimo_movimento,
  e.analisado_fora_em, e.analisado_fora_por,
  e.saiu_em,
  e.previa, e.anexos, e.classificado_por
from public.emails_caixa e
  left join public.casos c on c.id = e.caso_id
  left join public.corretoras co on co.id = c.corretora_id
  left join lateral (
    select af.situacao, af.concluido_em, af.concluido_em_crm, af.criado_em
    from public.analise_fila af
    where af.caso_id = c.id
    order by af.criado_em desc
    limit 1
  ) f on true;

grant select on public.painel_pedidos to authenticated;
