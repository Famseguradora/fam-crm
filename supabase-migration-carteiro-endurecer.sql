-- ============================================================================
--  O CARTEIRO GERENCIAL · as travas que a revisão adversarial pediu
--  (11/09/2026, aplicada como `carteiro_gerencial_endurecer`)
--
--  Cinco achados reais da revisão de segurança, provados em ensaio:
--
--  1. A TRILHA VAZAVA EM APAGAMENTO. Quando um e-mail é apagado, o cascade
--     apaga a classificação e o gatilho gravava um evento com `conta_id` nulo,
--     que a política da trilha deixa QUALQUER pessoa logada ler. Agora e-mail
--     que já sumiu não gera evento.
--  2. RÉGUA MALFORMADA DERRUBAVA A TELA DE TODOS, e versão não se apaga. O
--     banco passa a exigir a forma: as seis listas, de texto, e sinônimos com
--     termo e modalidades. E o nome de quem gravou vem de `usuarios`.
--  3. TRUNCATE PASSAVA POR CIMA DA IMUTABILIDADE. Revogado, e barrado por
--     gatilho também.
--  4. O CARIMBO DA DECISÃO ERA FORJÁVEL (nome, data, custo). Agora quem
--     carimba a decisão da pessoa é o banco.
--  5. `painel_pedidos` tinha privilégio para anon (sem linha, por causa da
--     RLS de baixo, mas não precisa ter).
--
--  ADITIVO: nenhuma linha existente muda.
-- ============================================================================

-- ── 1. a trilha não fala de e-mail que já sumiu ─────────────────────────────
create or replace function public.email_classificacao_trilha()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_auth uuid;
  v_nome text;
  v_email uuid := coalesce(NEW.email_id, OLD.email_id);
  v_conta uuid;
begin
  begin
    select e.conta_id into v_conta from public.emails_caixa e where e.id = v_email;
    /* Sem a caixa não há quem possa ler o evento com segurança: a política da
       trilha libera `conta_id` nulo para todos. É o apagamento em cascata do
       próprio e-mail, e ele não precisa de trilha. */
    if v_conta is null then
      if TG_OP = 'DELETE' then return OLD; end if;
      return NEW;
    end if;
    begin v_auth := auth.uid(); exception when others then v_auth := null; end;
    if v_auth is not null then
      select u.nome into v_nome from public.usuarios u where u.auth_id = v_auth;
    end if;
    insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
    values (
      'email', v_email, v_conta,
      'classificacao_' || coalesce(NEW.origem, OLD.origem),
      case when TG_OP = 'INSERT' then null else OLD.tipo end,
      case when TG_OP = 'DELETE' then null else NEW.tipo end,
      v_auth,
      coalesce(v_nome, case when TG_OP = 'DELETE' then OLD.classificado_por else NEW.classificado_por end)
    );
  exception when others then
    raise warning 'email_classificacao_trilha (%): %', TG_OP, sqlerrm;
  end;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end $$;

-- ── 2. a régua tem forma, e o autor vem do banco ────────────────────────────
create or replace function public.email_regua_forma_valida(p jsonb)
returns boolean language sql immutable set search_path = public, pg_catalog as $$
  select jsonb_typeof(p) = 'object'
     and (select bool_and(
            jsonb_typeof(p -> k) = 'array'
            and not exists (select 1 from jsonb_array_elements(p -> k) x where jsonb_typeof(x) <> 'string'))
          from unnest(array['excluidas','termos_operacao','termos_so_credito','nao_demanda_assunto','nao_demanda_remetentes']) k)
     and jsonb_typeof(p -> 'sinonimos') = 'array'
     and not exists (
       select 1 from jsonb_array_elements(p -> 'sinonimos') s
        where jsonb_typeof(s) <> 'object'
           or jsonb_typeof(s -> 'termo') <> 'string'
           or jsonb_typeof(s -> 'modalidades') <> 'array'
           or jsonb_array_length(s -> 'modalidades') = 0
           or exists (select 1 from jsonb_array_elements(s -> 'modalidades') m where jsonb_typeof(m) <> 'string'))
     and octet_length(p::text) <= 200000
$$;

create or replace function public.email_regua_proxima()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare
  v_max integer;
  v_auth uuid;
begin
  if not public.email_regua_forma_valida(NEW.parametros) then
    raise exception 'A régua não tem a forma combinada (seis listas de texto e sinônimos com termo e modalidades). Grave pela tela da régua.'
      using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.email_regua'));
  select coalesce(max(versao), 0) into v_max from public.email_regua;
  if NEW.versao is distinct from v_max + 1 then
    raise exception 'A régua já está na versão %. Recarregue a tela e salve de novo.', v_max
      using errcode = '40001';
  end if;
  NEW.criada_em := now();
  begin v_auth := auth.uid(); exception when others then v_auth := null; end;
  if v_auth is not null then
    NEW.criada_por_auth_id := v_auth;
    NEW.criada_por_nome := coalesce((select u.nome from public.usuarios u where u.auth_id = v_auth), NEW.criada_por_nome);
  end if;
  return NEW;
end $$;

-- ── 3. truncate não passa ───────────────────────────────────────────────────
revoke truncate on public.email_regua, public.email_classificacao from anon, authenticated;

drop trigger if exists trg_email_regua_sem_truncate on public.email_regua;
create trigger trg_email_regua_sem_truncate before truncate on public.email_regua
  for each statement execute function public.email_regua_imutavel();

-- ── 4. quem carimba a decisão da pessoa é o banco ───────────────────────────
create or replace function public.email_classificacao_carimbo()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_auth uuid;
begin
  if NEW.origem = 'humano' then
    begin v_auth := auth.uid(); exception when others then v_auth := null; end;
    if v_auth is not null then
      NEW.classificado_por_auth_id := v_auth;
      NEW.classificado_por := coalesce((select u.nome from public.usuarios u where u.auth_id = v_auth), NEW.classificado_por);
    end if;
    NEW.classificado_em := now();
    -- Decisão de pessoa não tem modelo, custo nem recibo de IA.
    NEW.modelo := null;
    NEW.custo_usd := null;
    NEW.recibo := null;
    NEW.confianca := 'seguro';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_email_classificacao_carimbo on public.email_classificacao;
create trigger trg_email_classificacao_carimbo before insert or update on public.email_classificacao
  for each row execute function public.email_classificacao_carimbo();

-- ── 5. a view não é de anon ─────────────────────────────────────────────────
revoke all on public.painel_pedidos from anon;
