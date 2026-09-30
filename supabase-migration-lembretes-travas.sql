-- ============================================================================
--  LEMBRETES: AS TRAVAS QUE A REVISÃO PEDIU  ·  30/09/2026
--
--  A revisão adversarial da entrega dos lembretes achou, antes de alguém usar:
--
--  1. push_inscricoes aceitava INSERT direto do navegador: dava para gravar um
--     endereço qualquer (o servidor faria POST nele) ou uma chave quebrada (que
--     derrubava o envio de todo mundo). Agora o navegador só lê e apaga as
--     suas; quem grava é a rota, depois de validar, com a chave de serviço.
--  2. O convite dizia "Fulano te chamou" com o nome que VIESSE no insert.
--     Agora quem convida tem que ser quem está logado, e o nome sai do banco.
--  3. Pelo navegador dava para trocar origem/regra/autor/tomador de um lembrete
--     e forjar "Robô do tomador". Um gatilho segura esses campos.
--  4. A trilha aceitava qualquer `por_nome`. O nome agora sai do banco.
--  5. O robô: caso sem nome derrubava a função inteira (título nulo), item
--     vazio em documentos_faltando virava item sem nome, e o que o robô
--     REABRE ou ACRESCENTA agora toca o aviso de novo.
-- ============================================================================

-- ── 1. push_inscricoes: o navegador lê e apaga, não grava ───────────────────
drop policy if exists push_minhas on public.push_inscricoes;
drop policy if exists push_minhas_le on public.push_inscricoes;
create policy push_minhas_le on public.push_inscricoes for select to authenticated using (auth_id = auth.uid());
drop policy if exists push_minhas_apaga on public.push_inscricoes;
create policy push_minhas_apaga on public.push_inscricoes for delete to authenticated using (auth_id = auth.uid());

-- ── 2. convite: só em nome próprio ──────────────────────────────────────────
drop policy if exists lembrete_seguidores_entra on public.lembrete_seguidores;
create policy lembrete_seguidores_entra on public.lembrete_seguidores for insert to authenticated
  with check (
    public.fam_pode_escrever()
    and (
      (convidado_por_auth_id is null and auth_id = auth.uid())   -- eu passo a acompanhar
      or convidado_por_auth_id = auth.uid()                       -- eu chamo alguém
    )
  );

create or replace function public.lembrete_seguidor_nomes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.nome := (select nome from public.usuarios where auth_id = new.auth_id);
    if new.convidado_por_auth_id is not null then
      new.convidado_por := (select nome from public.usuarios where auth_id = new.convidado_por_auth_id);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists lembrete_seguidor_nomes on public.lembrete_seguidores;
create trigger lembrete_seguidor_nomes before insert on public.lembrete_seguidores
  for each row execute function public.lembrete_seguidor_nomes();

-- ── 3. o que o navegador não muda num lembrete ──────────────────────────────
create or replace function public.lembretes_campos_fixos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- robô e relógio (pg_cron)
  new.origem := old.origem;
  new.regra := old.regra;
  new.criado_por_auth_id := old.criado_por_auth_id;
  new.criado_por_nome := old.criado_por_nome;
  new.criado_em := old.criado_em;
  new.tomador_id := old.tomador_id;
  new.caso_id := old.caso_id;
  if new.resolvido_por is distinct from old.resolvido_por and new.resolvido_por is not null then
    new.resolvido_por := coalesce((select nome from public.usuarios where auth_id = auth.uid()), 'alguém');
  end if;
  if new.responsavel_auth_id is distinct from old.responsavel_auth_id then
    new.responsavel_nome := (select nome from public.usuarios where auth_id = new.responsavel_auth_id);
  end if;
  return new;
end $$;
drop trigger if exists lembretes_campos_fixos on public.lembretes;
create trigger lembretes_campos_fixos before update on public.lembretes
  for each row execute function public.lembretes_campos_fixos();

-- ── 4. a trilha assina com o nome do banco ──────────────────────────────────
create or replace function public.lembrete_evento_assina() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.por_nome := (select nome from public.usuarios where auth_id = auth.uid());
    new.criado_em := now();
  end if;
  return new;
end $$;
drop trigger if exists lembrete_evento_assina on public.lembrete_eventos;
create trigger lembrete_evento_assina before insert on public.lembrete_eventos
  for each row execute function public.lembrete_evento_assina();

-- ── 5. o robô, mais firme ───────────────────────────────────────────────────
create or replace function public.lembretes_robo(p_silencioso boolean default false) returns integer
language plpgsql security definer set search_path = public as $$
declare
  f record;
  l record;
  novos jsonb;
  pend int;
  ok int;
  entrou boolean;
  mexidos int := 0;
  lid uuid;
  area_resp record;
begin
  create temporary table if not exists _fonte (regra text primary key, area text, tomador_id uuid, caso_id uuid, titulo text, itens text[]) on commit drop;
  truncate _fonte;

  insert into _fonte
  select 'robo:cadastro:' || c.id, 'cadastro', c.tomador_id, c.id,
         'Documentos faltantes no cadastro · ' || coalesce(nullif(trim(c.razao_social), ''), nullif(trim(c.assunto), ''), 'caso #' || c.numero),
         array_agg(cat.nome order by cat.ordem)
  from public.casos c
  join public.caso_itens ci on ci.caso_id = c.id and ci.situacao in ('faltando','a_caminho','duvida')
  join public.caso_item_catalogo cat on cat.id = ci.item
  where c.etapa = 'triagem'
  group by c.id;

  insert into _fonte
  select 'robo:credito:' || af.id, 'credito', coalesce(af.tomador_id, c.tomador_id), af.caso_id,
         'Documentos faltantes na análise de crédito · ' || coalesce(nullif(trim(af.razao_social), ''), af.pasta, 'sem nome'),
         array(select trim(x) from unnest(af.documentos_faltando) x where coalesce(trim(x), '') <> '')
  from public.analise_fila af
  left join public.casos c on c.id = af.caso_id
  where not coalesce(af.arquivada, false)
    and af.situacao not in ('concluida','em_andamento')
    and exists (select 1 from unnest(af.documentos_faltando) x where coalesce(trim(x), '') <> '')
    and (af.tomador_id is not null or af.caso_id is not null)
  on conflict do nothing;

  insert into _fonte
  select 'robo:secao:' || s.area || ':' || s.id, s.area, s.tomador_id, null,
         'Pendência da ' || case s.area when 'subscricao' then 'Subscrição' when 'credito' then 'análise de crédito' else 'área de ' || s.area end
           || ' · ' || coalesce(t.razao_social, 'tomador'),
         array[left(trim(s.pendencia_texto), 300)]
  from public.card_secoes s
  join public.tomadores t on t.id = s.tomador_id
  where s.area in ('cadastro','credito','subscricao') and s.estado <> 'concluida'
    and coalesce(trim(s.pendencia_texto), '') <> ''
  on conflict do nothing;

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

    -- Decisão humana não se desfaz: resolvido ou cancelado à mão fica assim.
    if l.status in ('resolvido','cancelado') and coalesce(l.resolvido_por, '') <> 'Robô do tomador' then continue; end if;

    select coalesce(jsonb_agg(
             case when (i->>'nome') = any(f.itens) then
                    case when coalesce((i->>'ok')::boolean, false) and coalesce(i->>'por', 'robo') = 'robo'
                         then i || jsonb_build_object('ok', false, 'em', null) else i end
                  when coalesce((i->>'ok')::boolean, false) then i
                  else i || jsonb_build_object('ok', true, 'em', now(), 'por', 'robo') end), '[]'::jsonb)
      into novos
      from jsonb_array_elements(l.itens) i;
    select exists (select 1 from unnest(f.itens) x where not exists (select 1 from jsonb_array_elements(l.itens) i where i->>'nome' = x))
      into entrou;
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
             resolvido_em = null, resolvido_por = null,
             -- reabriu ou passou a faltar documento NOVO: o aviso toca de novo
             quando = case when l.status = 'resolvido' or entrou then now() else quando end
       where id = l.id;
      insert into public.lembrete_eventos (lembrete_id, tipo, texto, por_nome)
      values (l.id, case when l.status = 'resolvido' then 'reaberto' when ok > 0 then 'parcial' else 'editado' end,
              case when l.status = 'resolvido' then 'Reaberto pelo robô: voltou a faltar ' || array_to_string(f.itens, ', ') || '.'
                   else 'Robô: ainda falta ' || array_to_string(f.itens, ', ') || '.' end,
              'Robô do tomador');
      mexidos := mexidos + 1;
    end if;
  end loop;

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

-- ROLLBACK: voltar a policy push_minhas `for all` e remover os três gatilhos
-- (lembrete_seguidor_nomes, lembretes_campos_fixos, lembrete_evento_assina).

-- ── 6. a recorrência mora no banco ──────────────────────────────────────────
/* O próximo de um lembrete que repete. No banco, e não na rota, por três
   motivos que a revisão achou: (a) copiar os seguidores pelo navegador
   exigiria "convidar" cada um de novo (e tocaria o sino de todos com um
   convite falso); (b) dois cliques em "resolvido" criavam dois próximos: o
   índice único em `anterior_id` impede; (c) a conta do mês é feita no
   calendário de São Paulo, e não em UTC (lembrete às 22h caía no dia errado). */
alter table public.lembretes add column if not exists anterior_id uuid references public.lembretes(id) on delete set null;
create unique index if not exists lembretes_anterior_unico on public.lembretes (anterior_id) where anterior_id is not null;

create or replace function public.lembrete_repetir(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare l record; novo uuid; passo interval; quem text;
begin
  if not public.fam_pode_escrever() then raise exception 'sem permissão'; end if;
  select * into l from public.lembretes where id = p_id and status = 'resolvido' and recorrencia is not null;
  if not found then return null; end if;
  passo := case l.recorrencia when 'semanal' then interval '7 days' when 'mensal' then interval '1 month'
                              when 'trimestral' then interval '3 months' when 'semestral' then interval '6 months'
                              when 'anual' then interval '1 year' end;
  quem := (select nome from public.usuarios where auth_id = auth.uid());
  insert into public.lembretes (tomador_id, caso_id, titulo, detalhe, categoria, area, quando, recorrencia, prioridade, itens,
                                responsavel_auth_id, responsavel_nome, origem, criado_por_auth_id, criado_por_nome, anterior_id)
  values (l.tomador_id, l.caso_id, l.titulo, l.detalhe, l.categoria, l.area,
          ((l.quando at time zone 'America/Sao_Paulo') + passo) at time zone 'America/Sao_Paulo',
          l.recorrencia, l.prioridade,
          (select coalesce(jsonb_agg(jsonb_build_object('nome', i->>'nome', 'ok', false, 'em', null)), '[]'::jsonb) from jsonb_array_elements(l.itens) i),
          l.responsavel_auth_id, l.responsavel_nome, 'humano', auth.uid(), quem, l.id)
  on conflict (anterior_id) where anterior_id is not null do nothing
  returning id into novo;
  if novo is null then return null; end if;
  insert into public.lembrete_seguidores (lembrete_id, auth_id, nome, papel)
  select novo, s.auth_id, s.nome, s.papel from public.lembrete_seguidores s where s.lembrete_id = l.id;
  insert into public.lembrete_eventos (lembrete_id, tipo, texto, por_nome, por_auth_id)
  values (novo, 'criado', 'Próxima vez de um lembrete que repete.', quem, auth.uid());
  return novo;
end $$;
revoke all on function public.lembrete_repetir(uuid) from public, anon;
grant execute on function public.lembrete_repetir(uuid) to authenticated;

-- ── 7. o lembrete da operação (01/10/2026, aplicada como lembretes_da_operacao) ──
-- Pedido de 30/09: "sempre deve ter o lembrete", inclusive ao criar a operação.
-- A coluna operacao_id entra nos campos fixos e na recorrência.
alter table public.lembretes add column if not exists operacao_id uuid references public.operacoes(id) on delete set null;
create index if not exists lembretes_operacao_idx on public.lembretes (operacao_id) where operacao_id is not null;
-- (lembretes_campos_fixos e lembrete_repetir foram recriados com operacao_id: ver o banco)

-- ── 8. lembrete para todos (01/10/2026, aplicada como lembretes_para_todos) ──
-- "Liberar o lembrete para todos, principalmente a interação com os colegas."
-- Nas policies de lembretes, lembrete_seguidores e lembrete_eventos, e na
-- lembrete_repetir(), `fam_pode_escrever()` virou `fam_e_usuario()`: todo usuário
-- ATIVO cria, comenta, acompanha, é chamado e resolve, inclusive o "Só leitura".
