-- ============================================================================
--  JÁ ANALISADO POR FORA  (10/09/2026, aplicada como `email_ja_analisado`)
--
--  Pedido do Marco: "tem e-mail que eu já analisei, mas de outra forma. Inclua
--  mais um botão, de Já analisado, o que você acha? Porque dessa forma entra na
--  estatística."
--
--  Sem isto, o e-mail analisado por fora só tinha duas saídas, e as duas
--  mentiam: "não é pedido" apagava da estatística uma análise que existiu, e
--  deixar parado cobrava para sempre um trabalho já feito.
--
--  DUAS DECISÕES DE CONTA (moram em lib/email/metricas.ts):
--  · conta como RESOLVIDO, mas NUNCA entra em mediana, média nem "no prazo":
--    a hora do clique não é a hora da análise, e um e-mail de 47 dias marcado
--    hoje diria "levou 47 dias";
--  · entra no período em que o e-mail CHEGOU, e não no do clique: limpar hoje
--    o passivo de agosto não pode fazer o cartão dizer "40 resolvidos hoje".
--
--  ADITIVO. Recria a função da trilha (acrescenta `analisado_fora` e
--  `aguardando`) e a view `painel_pedidos` (duas colunas no FIM, que é a única
--  forma aceita pelo CREATE OR REPLACE VIEW).
-- ============================================================================

alter table public.emails_caixa
  add column if not exists analisado_fora_em  timestamptz,
  add column if not exists analisado_fora_por text;

comment on column public.emails_caixa.analisado_fora_em is
  'Quando alguém marcou que este pedido JÁ FOI ANALISADO por fora do sistema. Conta como resolvido, mas NÃO entra na mediana de tempo: o clique não é a data da análise.';

create or replace function public.email_fluxo_registra()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_auth uuid;
  v_nome text;
begin
  begin
    begin v_auth := auth.uid(); exception when others then v_auth := null; end;
    if v_auth is not null then
      select u.nome into v_nome from public.usuarios u where u.auth_id = v_auth;
    end if;

    if TG_TABLE_NAME = 'emails_caixa' then
      if TG_OP = 'INSERT' then
        insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
        values ('email', NEW.id, NEW.conta_id, 'chegou', null, NEW.estado, v_auth, coalesce(v_nome, 'Carteiro'));
      else
        if NEW.estado is distinct from OLD.estado then
          insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
          values ('email', NEW.id, NEW.conta_id, 'estado', OLD.estado, NEW.estado, v_auth, coalesce(v_nome, NEW.estado_por));
        end if;
        if NEW.dono_auth_id is distinct from OLD.dono_auth_id then
          insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
          values ('email', NEW.id, NEW.conta_id, 'dono', OLD.dono_nome, NEW.dono_nome, v_auth, v_nome);
        end if;
        if NEW.eh_pedido is distinct from OLD.eh_pedido then
          insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
          values ('email', NEW.id, NEW.conta_id, 'eh_pedido', OLD.eh_pedido::text, NEW.eh_pedido::text, v_auth, coalesce(v_nome, NEW.classificado_por));
        end if;
        if NEW.analisado_fora_em is distinct from OLD.analisado_fora_em then
          insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
          values ('email', NEW.id, NEW.conta_id, 'analisado_fora',
                  case when OLD.analisado_fora_em is null then null else 'sim' end,
                  case when NEW.analisado_fora_em is null then null else 'sim' end,
                  v_auth, coalesce(v_nome, NEW.analisado_fora_por));
        end if;
        if NEW.aguardando_desde is distinct from OLD.aguardando_desde then
          insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
          values ('email', NEW.id, NEW.conta_id, 'aguardando',
                  case when OLD.aguardando_desde is null then null else 'sim' end,
                  case when NEW.aguardando_desde is null then null else 'sim' end,
                  v_auth, v_nome);
        end if;
      end if;

    elsif TG_TABLE_NAME = 'casos' then
      if TG_OP = 'INSERT' then
        insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
        values ('caso', NEW.id, 'nasceu', null, NEW.etapa, v_auth, coalesce(v_nome, NEW.criado_por_nome));
      elsif NEW.etapa is distinct from OLD.etapa then
        insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
        values ('caso', NEW.id, 'etapa', OLD.etapa, NEW.etapa, v_auth, v_nome);
      end if;

    elsif TG_TABLE_NAME = 'analise_fila' then
      if TG_OP = 'INSERT' then
        insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
        values ('fila', NEW.id, 'entrou', null, NEW.situacao, v_auth, v_nome);
      elsif TG_OP = 'DELETE' then
        insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
        values ('fila', OLD.id, 'saiu', OLD.situacao, null, v_auth, v_nome);
      elsif NEW.situacao is distinct from OLD.situacao then
        insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
        values ('fila', NEW.id, 'situacao', OLD.situacao, NEW.situacao, v_auth, v_nome);
      end if;
    end if;
  exception when others then
    raise warning 'email_fluxo_registra (% %): %', TG_TABLE_NAME, TG_OP, sqlerrm;
  end;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end $$;

create or replace view public.painel_pedidos with (security_invoker = true) as
select
  e.id,
  e.conta_id,
  e.conta,
  e.assunto,
  e.de,
  e.email_de,
  e.recebido_em,
  e.anexos_uteis,
  e.estado,
  e.serve,
  e.motivo,
  e.eh_pedido,
  e.dono_auth_id,
  e.dono_nome,
  e.assumido_em,
  e.aguardando_desde,
  e.aguardando_motivo,
  e.cobrado_em,
  e.caso_id,
  c.numero        as caso_numero,
  c.etapa         as caso_etapa,
  c.criado_em     as caso_criado_em,
  c.concluido_em  as caso_concluido_em,
  c.cnpj,
  c.razao_social,
  coalesce(c.corretora_texto, co.nome_fantasia, co.razao_social) as corretora,
  f.situacao      as fila_situacao,
  coalesce(f.concluido_em_crm, f.concluido_em) as fila_concluido_em,
  greatest(
    e.recebido_em,
    e.estado_em,
    e.assumido_em,
    e.classificado_em,
    e.analisado_fora_em,
    c.criado_em,
    c.enviado_analise_em,
    f.criado_em,
    f.concluido_em_crm
  ) as ultimo_movimento,
  e.analisado_fora_em,
  e.analisado_fora_por
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
