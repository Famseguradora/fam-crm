-- ============================================================================
--  LEMBRETES DO TOMADOR  ·  30/09/2026
--
--  Pedido do Marco: "quando inserirmos um lembrete dentro de um tomador, faça
--  estilo um lembrete do Outlook ou WhatsApp, onde quem inserir pode chamar
--  novos colegas para seguir esse lembrete, como se fosse uma reunião. [...]
--  assim como o robô do tomador irá acompanhar sempre."
--
--  Respostas dele no mesmo dia:
--    aviso    sino dentro do CRM + notificação no celular (push do PWA)
--    relógio  o do Supabase (pg_cron): avisa com o notebook desligado
--    robô     cria lembrete dos DOCUMENTOS FALTANTES do cadastro, do crédito e
--             da subscrição; todo lembrete tem resolvido total, resolvido
--             parcial e editar, e a pessoa cria os seus
--
--  AS PEÇAS
--    lembretes              o lembrete: um responsável, data/hora do aviso,
--                           categoria, itens (a lista do que falta) e status
--    lembrete_seguidores    quem acompanha (o responsável entra aqui também)
--    lembrete_eventos       a trilha: criado, editado, parcial, resolvido,
--                           comentário, convite. Nunca se apaga
--    notificacoes           o sino. Cada pessoa só vê as suas
--    push_inscricoes        o celular/navegador de cada pessoa, para o push
--
--  O ROBÔ É SQL, e roda no relógio do Supabase: nada depende do notebook.
--  Ele NUNCA desfaz o que uma pessoa decidiu (lembrete resolvido à mão fica
--  resolvido), e fecha sozinho o que ele abriu quando o documento chega.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── 1. o lembrete ───────────────────────────────────────────────────────────
create table if not exists public.lembretes (
  id              uuid primary key default gen_random_uuid(),
  tomador_id      uuid references public.tomadores(id) on delete cascade,
  caso_id         uuid references public.casos(id) on delete set null,
  titulo          text not null check (length(trim(titulo)) between 2 and 200),
  detalhe         text,
  categoria       text not null default 'outro',
  area            text,
  -- quando o aviso toca (instante absoluto; a tela mostra em São Paulo)
  quando          timestamptz not null,
  recorrencia     text check (recorrencia in ('semanal','mensal','trimestral','semestral','anual')),
  -- a lista do que falta: [{ "nome": "...", "ok": false, "em": null }]
  itens           jsonb not null default '[]'::jsonb,
  status          text not null default 'aberto' check (status in ('aberto','parcial','resolvido','cancelado')),
  prioridade      text not null default 'normal' check (prioridade in ('baixa','normal','alta')),
  responsavel_auth_id uuid,
  responsavel_nome    text,
  origem          text not null default 'humano' check (origem in ('humano','robo')),
  -- chave do robô: uma fonte, um lembrete ("robo:credito:<fila>")
  regra           text unique,
  resolucao       text,
  resolvido_em    timestamptz,
  resolvido_por   text,
  avisado_em      timestamptz,
  criado_por_auth_id uuid,
  criado_por_nome text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  check (tomador_id is not null or caso_id is not null)
);
create index if not exists lembretes_tomador_idx on public.lembretes (tomador_id, status);
create index if not exists lembretes_caso_idx on public.lembretes (caso_id) where caso_id is not null;
create index if not exists lembretes_vence_idx on public.lembretes (quando) where status in ('aberto','parcial');

comment on table public.lembretes is
  'Lembrete do tomador (30/09/2026): responsavel + seguidores, aviso no sino e no celular. origem=robo nasce dos documentos faltantes e fecha sozinho.';

create table if not exists public.lembrete_seguidores (
  lembrete_id   uuid not null references public.lembretes(id) on delete cascade,
  auth_id       uuid not null,
  nome          text,
  papel         text not null default 'seguidor' check (papel in ('responsavel','seguidor')),
  convidado_por text,
  convidado_por_auth_id uuid,
  visto_em      timestamptz,
  criado_em     timestamptz not null default now(),
  primary key (lembrete_id, auth_id)
);
create index if not exists lembrete_seguidores_pessoa_idx on public.lembrete_seguidores (auth_id);

create table if not exists public.lembrete_eventos (
  id            uuid primary key default gen_random_uuid(),
  lembrete_id   uuid not null references public.lembretes(id) on delete cascade,
  tipo          text not null check (tipo in ('criado','editado','parcial','resolvido','reaberto','cancelado','comentario','convite','saiu','adiado','avisado')),
  texto         text,
  por_nome      text,
  por_auth_id   uuid,
  criado_em     timestamptz not null default now()
);
create index if not exists lembrete_eventos_idx on public.lembrete_eventos (lembrete_id, criado_em);

-- ── 2. o sino e o celular ───────────────────────────────────────────────────
create table if not exists public.notificacoes (
  id            uuid primary key default gen_random_uuid(),
  para_auth_id  uuid not null,
  titulo        text not null,
  texto         text,
  link          text,
  lembrete_id   uuid references public.lembretes(id) on delete cascade,
  criado_em     timestamptz not null default now(),
  lida_em       timestamptz,
  push_em       timestamptz
);
create index if not exists notificacoes_pessoa_idx on public.notificacoes (para_auth_id, criado_em desc);
create index if not exists notificacoes_push_idx on public.notificacoes (criado_em) where push_em is null;

create table if not exists public.push_inscricoes (
  id            uuid primary key default gen_random_uuid(),
  auth_id       uuid not null,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  aparelho      text,
  criado_em     timestamptz not null default now(),
  falhou_em     timestamptz
);
create index if not exists push_inscricoes_pessoa_idx on public.push_inscricoes (auth_id);

-- ── 3. quem vê e quem escreve ───────────────────────────────────────────────
-- Lembrete de tomador é trabalho: todo usuário do CRM lê; escreve quem escreve.
-- Nada para `anon`, nunca `using (true)` solto.
alter table public.lembretes enable row level security;
alter table public.lembrete_seguidores enable row level security;
alter table public.lembrete_eventos enable row level security;
alter table public.notificacoes enable row level security;
alter table public.push_inscricoes enable row level security;

create or replace function public.fam_e_usuario() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.status = 'ativo')
$$;

drop policy if exists lembretes_leitura on public.lembretes;
create policy lembretes_leitura on public.lembretes for select to authenticated using (public.fam_e_usuario());
drop policy if exists lembretes_cria on public.lembretes;
create policy lembretes_cria on public.lembretes for insert to authenticated
  with check (public.fam_pode_escrever() and origem = 'humano' and criado_por_auth_id = auth.uid());
drop policy if exists lembretes_muda on public.lembretes;
create policy lembretes_muda on public.lembretes for update to authenticated
  using (public.fam_pode_escrever()) with check (public.fam_pode_escrever());

drop policy if exists lembrete_seguidores_leitura on public.lembrete_seguidores;
create policy lembrete_seguidores_leitura on public.lembrete_seguidores for select to authenticated using (public.fam_e_usuario());
drop policy if exists lembrete_seguidores_entra on public.lembrete_seguidores;
create policy lembrete_seguidores_entra on public.lembrete_seguidores for insert to authenticated
  with check (public.fam_pode_escrever());
-- Sair: a própria pessoa, ou quem escreve no CRM tirando alguém.
drop policy if exists lembrete_seguidores_sai on public.lembrete_seguidores;
create policy lembrete_seguidores_sai on public.lembrete_seguidores for delete to authenticated
  using (auth_id = auth.uid() or public.fam_pode_escrever());
drop policy if exists lembrete_seguidores_visto on public.lembrete_seguidores;
create policy lembrete_seguidores_visto on public.lembrete_seguidores for update to authenticated
  using (auth_id = auth.uid() or public.fam_pode_escrever()) with check (auth_id = auth.uid() or public.fam_pode_escrever());

drop policy if exists lembrete_eventos_leitura on public.lembrete_eventos;
create policy lembrete_eventos_leitura on public.lembrete_eventos for select to authenticated using (public.fam_e_usuario());
-- A trilha só cresce: comentário de quem escreve, em nome próprio.
drop policy if exists lembrete_eventos_escreve on public.lembrete_eventos;
create policy lembrete_eventos_escreve on public.lembrete_eventos for insert to authenticated
  with check (public.fam_pode_escrever() and por_auth_id = auth.uid());

drop policy if exists notificacoes_minhas on public.notificacoes;
create policy notificacoes_minhas on public.notificacoes for select to authenticated using (para_auth_id = auth.uid());
drop policy if exists notificacoes_ler on public.notificacoes;
create policy notificacoes_ler on public.notificacoes for update to authenticated
  using (para_auth_id = auth.uid()) with check (para_auth_id = auth.uid());

drop policy if exists push_minhas on public.push_inscricoes;
create policy push_minhas on public.push_inscricoes for all to authenticated
  using (auth_id = auth.uid()) with check (auth_id = auth.uid());

-- ── 4. convite vira notificação na hora ─────────────────────────────────────
create or replace function public.lembrete_convite_notifica() returns trigger
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if new.convidado_por_auth_id is null or new.convidado_por_auth_id = new.auth_id then return new; end if;
  select id, titulo, tomador_id, caso_id into l from public.lembretes where id = new.lembrete_id;
  insert into public.notificacoes (para_auth_id, titulo, texto, link, lembrete_id)
  values (new.auth_id,
          coalesce(new.convidado_por, 'Um colega') || ' te chamou para acompanhar um lembrete',
          l.titulo,
          case when l.tomador_id is not null then '/tomadores/' || l.tomador_id || '?g=lembretes' else '/comercial/' || l.caso_id end,
          l.id);
  return new;
end $$;
drop trigger if exists lembrete_convite on public.lembrete_seguidores;
create trigger lembrete_convite after insert on public.lembrete_seguidores
  for each row execute function public.lembrete_convite_notifica();

create or replace function public.lembretes_toca_atualizado() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists lembretes_atualizado on public.lembretes;
create trigger lembretes_atualizado before update on public.lembretes
  for each row execute function public.lembretes_toca_atualizado();

-- ── 5. o relógio: o aviso toca na hora marcada ──────────────────────────────
create or replace function public.lembretes_disparar() returns integer
language plpgsql security definer set search_path = public as $$
declare
  l record;
  n integer := 0;
begin
  for l in
    select * from public.lembretes
    where status in ('aberto','parcial') and quando <= now()
      and (avisado_em is null or avisado_em < quando)
    order by quando
    limit 200
    for update skip locked
  loop
    insert into public.notificacoes (para_auth_id, titulo, texto, link, lembrete_id)
    select s.auth_id,
           case when l.origem = 'robo' then 'Robô do tomador: ' else 'Lembrete: ' end || l.titulo,
           nullif(concat_ws(' · ',
             case when jsonb_array_length(l.itens) > 0 then
               'Falta: ' || (select string_agg(i->>'nome', ', ') from jsonb_array_elements(l.itens) i where not coalesce((i->>'ok')::boolean, false))
             end,
             left(l.detalhe, 160)), ''),
           case when l.tomador_id is not null then '/tomadores/' || l.tomador_id || '?g=lembretes' else '/comercial/' || l.caso_id end,
           l.id
    from public.lembrete_seguidores s where s.lembrete_id = l.id;
    update public.lembretes set avisado_em = now() where id = l.id;
    insert into public.lembrete_eventos (lembrete_id, tipo, texto, por_nome)
    values (l.id, 'avisado', 'O aviso tocou para quem acompanha.', 'Relógio');
    n := n + 1;
  end loop;
  return n;
end $$;

/* O push sai do servidor do CRM (a criptografia do push mora lá). O relógio
   só cutuca a rota quando há notificação sem push, com o segredo do cofre. */
create or replace function public.lembretes_cutucar_push() returns void
language plpgsql security definer set search_path = public as $$
declare url text; segredo text;
begin
  if not exists (select 1 from public.notificacoes where push_em is null and criado_em > now() - interval '1 day') then return; end if;
  select decrypted_secret into url from vault.decrypted_secrets where name = 'crm_url';
  select decrypted_secret into segredo from vault.decrypted_secrets where name = 'lembretes_token';
  if url is null or segredo is null then return; end if;
  perform net.http_post(
    url := url || '/api/lembretes/push',
    headers := jsonb_build_object('content-type', 'application/json', 'x-lembretes-token', segredo),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000);
end $$;

-- ── 6. o robô do tomador: documentos faltantes ──────────────────────────────
/* Três fontes, uma por área, e nenhuma inventada:
     cadastro    caso_itens do caso ainda em triagem
     credito     analise_fila.documentos_faltando (a esteira acusou)
     secao       card_secoes.pendencia_texto de cadastro/credito/subscricao
   Uma fonte, um lembrete (`regra`). Chegou parte: 'parcial'. Chegou tudo, ou a
   fonte sumiu: 'resolvido' pelo robô. Decisão humana nunca é desfeita. */
create or replace function public.lembretes_robo(p_silencioso boolean default false) returns integer
language plpgsql security definer set search_path = public as $$
declare
  f record;
  l record;
  novos jsonb;
  pend int;
  ok int;
  mexidos int := 0;
  lid uuid;
  area_resp record;
begin
  create temporary table if not exists _fonte (regra text primary key, area text, tomador_id uuid, caso_id uuid, titulo text, itens text[]) on commit drop;
  truncate _fonte;

  insert into _fonte
  select 'robo:cadastro:' || c.id, 'cadastro', c.tomador_id, c.id,
         'Documentos faltantes no cadastro · ' || coalesce(nullif(c.razao_social, ''), c.assunto),
         array_agg(cat.nome order by cat.ordem)
  from public.casos c
  join public.caso_itens ci on ci.caso_id = c.id and ci.situacao in ('faltando','a_caminho','duvida')
  join public.caso_item_catalogo cat on cat.id = ci.item
  where c.etapa = 'triagem'
  group by c.id;

  insert into _fonte
  select 'robo:credito:' || af.id, 'credito', coalesce(af.tomador_id, c.tomador_id), af.caso_id,
         'Documentos faltantes na análise de crédito · ' || coalesce(nullif(af.razao_social, ''), af.pasta),
         af.documentos_faltando
  from public.analise_fila af
  left join public.casos c on c.id = af.caso_id
  where not coalesce(af.arquivada, false)
    and af.situacao not in ('concluida','em_andamento')
    and coalesce(array_length(af.documentos_faltando, 1), 0) > 0
    and (af.tomador_id is not null or af.caso_id is not null)
  on conflict do nothing;

  insert into _fonte
  select 'robo:secao:' || s.area || ':' || s.id, s.area, s.tomador_id, null,
         'Pendência da ' || case s.area when 'subscricao' then 'Subscrição' when 'credito' then 'análise de crédito' else 'área de ' || s.area end
           || ' · ' || coalesce(t.razao_social, ''),
         array[left(s.pendencia_texto, 300)]
  from public.card_secoes s
  join public.tomadores t on t.id = s.tomador_id
  where s.area in ('cadastro','credito','subscricao') and s.estado <> 'concluida'
    and coalesce(trim(s.pendencia_texto), '') <> ''
  on conflict do nothing;

  -- a) fonte com lembrete aberto: acerta os itens
  for f in select * from _fonte loop
    select * into l from public.lembretes where regra = f.regra;

    if not found then
      select u.auth_id, u.nome into area_resp from public.usuarios u
       where u.status = 'ativo' and u.perfil <> 'leitura' and f.area = any(u.areas) order by u.nome limit 1;
      insert into public.lembretes (tomador_id, caso_id, titulo, categoria, area, quando, itens, origem, regra,
                                    responsavel_auth_id, responsavel_nome, criado_por_nome, avisado_em)
      values (f.tomador_id, f.caso_id, left(f.titulo, 200), 'documento', f.area, now(),
              (select coalesce(jsonb_agg(jsonb_build_object('nome', x, 'ok', false, 'em', null)), '[]'::jsonb) from unnest(f.itens) x),
              'robo', f.regra, area_resp.auth_id, area_resp.nome, 'Robô do tomador',
              case when p_silencioso then now() else null end)
      returning id into lid;
      insert into public.lembrete_seguidores (lembrete_id, auth_id, nome, papel)
      select lid, u.auth_id, u.nome, case when u.auth_id = area_resp.auth_id then 'responsavel' else 'seguidor' end
      from public.usuarios u
      where u.status = 'ativo' and u.perfil <> 'leitura' and u.auth_id is not null and f.area = any(u.areas)
      on conflict do nothing;
      insert into public.lembrete_eventos (lembrete_id, tipo, texto, por_nome)
      values (lid, 'criado', 'Aberto pelo robô: falta ' || array_to_string(f.itens, ', ') || '.', 'Robô do tomador');
      mexidos := mexidos + 1;
      continue;
    end if;

    -- resolvido à mão fica resolvido; cancelado também
    if l.status in ('resolvido','cancelado') and coalesce(l.resolvido_por, '') <> 'Robô do tomador' then continue; end if;

    -- os itens que chegaram (não estão mais na fonte) viram ok; os novos entram
    select coalesce(jsonb_agg(
             -- ainda na fonte: o que o ROBÔ tinha dado por recebido volta a faltar;
             -- o que uma PESSOA marcou fica como ela deixou (item.por = nome dela)
             case when (i->>'nome') = any(f.itens) then
                    case when coalesce((i->>'ok')::boolean, false) and coalesce(i->>'por', 'robo') = 'robo'
                         then i || jsonb_build_object('ok', false, 'em', null) else i end
                  when coalesce((i->>'ok')::boolean, false) then i
                  else i || jsonb_build_object('ok', true, 'em', now(), 'por', 'robo') end), '[]'::jsonb)
      into novos
      from jsonb_array_elements(l.itens) i;
    select novos || coalesce(jsonb_agg(jsonb_build_object('nome', x, 'ok', false, 'em', null)), '[]'::jsonb)
      into novos
      from unnest(f.itens) x
      where not exists (select 1 from jsonb_array_elements(l.itens) i where i->>'nome' = x);

    select count(*) filter (where not coalesce((i->>'ok')::boolean, false)), count(*) filter (where coalesce((i->>'ok')::boolean, false))
      into pend, ok from jsonb_array_elements(novos) i;

    if novos is distinct from l.itens or (l.status = 'resolvido') then
      update public.lembretes
         set itens = novos,
             status = case when ok > 0 then 'parcial' else 'aberto' end,
             resolvido_em = null, resolvido_por = null
       where id = l.id;
      insert into public.lembrete_eventos (lembrete_id, tipo, texto, por_nome)
      values (l.id, case when l.status = 'resolvido' then 'reaberto' when ok > 0 then 'parcial' else 'editado' end,
              case when l.status = 'resolvido' then 'Reaberto pelo robô: voltou a faltar ' || array_to_string(f.itens, ', ') || '.'
                   else 'Robô: ainda falta ' || array_to_string(f.itens, ', ') || '.' end,
              'Robô do tomador');
      mexidos := mexidos + 1;
    end if;
  end loop;

  -- b) lembrete do robô cuja fonte sumiu: tudo chegou (ou o caso andou)
  for l in
    select * from public.lembretes
    where origem = 'robo' and status in ('aberto','parcial')
      and regra is not null and not exists (select 1 from _fonte where _fonte.regra = lembretes.regra)
  loop
    update public.lembretes
       set status = 'resolvido', resolvido_em = now(), resolvido_por = 'Robô do tomador',
           resolucao = 'Os documentos chegaram (ou a etapa andou) e o robô fechou sozinho.',
           itens = (select coalesce(jsonb_agg(case when coalesce((i->>'ok')::boolean, false) then i else i || jsonb_build_object('ok', true, 'em', now(), 'por', 'robo') end), '[]'::jsonb)
                    from jsonb_array_elements(l.itens) i)
     where id = l.id;
    insert into public.lembrete_eventos (lembrete_id, tipo, texto, por_nome)
    values (l.id, 'resolvido', 'Resolvido pelo robô: nada mais falta.', 'Robô do tomador');
    mexidos := mexidos + 1;
  end loop;

  return mexidos;
end $$;

revoke all on function public.lembretes_robo(boolean) from public, anon, authenticated;
revoke all on function public.lembretes_disparar() from public, anon, authenticated;
revoke all on function public.lembretes_cutucar_push() from public, anon, authenticated;

-- ── 7. ao vivo ──────────────────────────────────────────────────────────────
do $$ begin
  begin alter publication supabase_realtime add table public.notificacoes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.lembretes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.lembrete_eventos; exception when duplicate_object then null; end;
end $$;

-- ── 8. o relógio ────────────────────────────────────────────────────────────
-- A carga inicial é SILENCIOSA: os faltantes que já existem viram lembrete
-- sem disparar dezenas de avisos de uma vez.
select public.lembretes_robo(true);

select cron.unschedule(jobid) from cron.job where jobname in ('lembretes-robo', 'lembretes-aviso');
select cron.schedule('lembretes-robo', '*/5 * * * *', $$select public.lembretes_robo(false)$$);
select cron.schedule('lembretes-aviso', '* * * * *', $$select public.lembretes_disparar(); select public.lembretes_cutucar_push();$$);

-- ROLLBACK
-- select cron.unschedule('lembretes-robo'); select cron.unschedule('lembretes-aviso');
-- drop function if exists public.lembretes_robo(boolean), public.lembretes_disparar(), public.lembretes_cutucar_push(),
--   public.lembrete_convite_notifica(), public.lembretes_toca_atualizado(), public.fam_e_usuario();
-- drop table if exists public.push_inscricoes, public.notificacoes, public.lembrete_eventos, public.lembrete_seguidores, public.lembretes;
