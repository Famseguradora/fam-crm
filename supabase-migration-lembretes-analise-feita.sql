-- ============================================================================
--  ANÁLISE FEITA NÃO COBRA DOCUMENTO  ·  01/10/2026
--
--  Queixa do Marco (Celog Guarulhos, 09.225.193/0001-53): análise concluída e
--  pasta já retirada, e o sino seguia cobrando "documentos faltantes" no
--  cadastro e na análise. Duas portas no robô dos lembretes:
--
--  1. Fonte do CADASTRO: caso em 'triagem' cuja linha da esteira já está
--     concluída. Nascia assim quando alguém abria a bancada de triagem num
--     card de análise pronta (/api/casos/da-fila criava o caso em 'triagem'
--     com o checklist todo 'faltando'). Agora fica de fora.
--  2. Fonte do CRÉDITO: card fantasma (pasta antiga, ainda 'pendente') de um
--     tomador cuja análise concluiu DEPOIS que o card nasceu. A análise feita
--     vence o card velho.
--
--  Rollback: rodar de novo a versão de supabase-migration-lembretes-ressalva.sql.
-- ============================================================================

create or replace function public.lembretes_robo(p_silencioso boolean default false)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  -- quando/categoria/detalhe: nulos nas fontes antigas, que seguem como eram.
  create temporary table if not exists _fonte (regra text primary key, area text, tomador_id uuid, caso_id uuid, titulo text, itens text[],
                                               quando timestamptz, categoria text, detalhe text) on commit drop;
  truncate _fonte;

  insert into _fonte (regra, area, tomador_id, caso_id, titulo, itens)
  select 'robo:cadastro:' || c.id, 'cadastro', c.tomador_id, c.id,
         'Documentos faltantes no cadastro · ' || coalesce(nullif(trim(c.razao_social), ''), nullif(trim(c.assunto), ''), 'caso #' || c.numero),
         array_agg(cat.nome order by cat.ordem)
  from public.casos c
  join public.caso_itens ci on ci.caso_id = c.id and ci.situacao in ('faltando','a_caminho','duvida')
  join public.caso_item_catalogo cat on cat.id = ci.item
  where c.etapa = 'triagem'
    -- 01/10: a análise do caso já concluiu, não há o que cobrar.
    and not exists (select 1 from public.analise_fila fc
                    where fc.id = c.analise_fila_id and fc.situacao = 'concluida')
  group by c.id;

  insert into _fonte (regra, area, tomador_id, caso_id, titulo, itens)
  select 'robo:credito:' || af.id, 'credito', coalesce(af.tomador_id, c.tomador_id), af.caso_id,
         'Documentos faltantes na análise de crédito · ' || coalesce(nullif(trim(af.razao_social), ''), af.pasta, 'sem nome'),
         array(select trim(x) from unnest(af.documentos_faltando) x where coalesce(trim(x), '') <> '')
  from public.analise_fila af
  left join public.casos c on c.id = af.caso_id
  where not coalesce(af.arquivada, false)
    and af.situacao not in ('concluida','em_andamento')
    and exists (select 1 from unnest(af.documentos_faltando) x where coalesce(trim(x), '') <> '')
    and (af.tomador_id is not null or af.caso_id is not null)
    -- 01/10: card velho do tomador cuja análise concluiu depois dele nascer.
    and not exists (select 1 from public.analise_fila fc
                    where fc.id <> af.id and fc.situacao = 'concluida'
                      and fc.tomador_id = coalesce(af.tomador_id, c.tomador_id)
                      and fc.concluido_em >= af.criado_em)
  on conflict do nothing;

  insert into _fonte (regra, area, tomador_id, caso_id, titulo, itens)
  select 'robo:secao:' || s.area || ':' || s.id, s.area, s.tomador_id, null,
         'Pendência da ' || case s.area when 'subscricao' then 'Subscrição' when 'credito' then 'análise de crédito' else 'área de ' || s.area end
           || ' · ' || coalesce(t.razao_social, 'tomador'),
         array[left(trim(s.pendencia_texto), 300)]
  from public.card_secoes s
  join public.tomadores t on t.id = s.tomador_id
  where s.area in ('cadastro','credito','subscricao') and s.estado <> 'concluida'
    and coalesce(trim(s.pendencia_texto), '') <> ''
  on conflict do nothing;

  -- 4ª FONTE (01/10/2026): a ressalva da análise vigente.
  insert into _fonte (regra, area, tomador_id, caso_id, titulo, itens, quando, categoria, detalhe)
  select 'robo:ressalva:' || a.id, 'credito', x.tomador_id, x.caso_id,
         'Ressalva da análise de crédito · ' || coalesce(nullif(trim(a.razao_social), ''), 'tomador'),
         public.ressalva_itens(a.condicoes),
         ((coalesce(a.data_analise, current_date) + 30)::timestamp + time '09:00') at time zone 'America/Sao_Paulo',
         'ressalva',
         left(trim(a.condicoes), 2000)
  from public.analises a
  cross join lateral (
    select coalesce(a.tomador_id, af.tomador_id,
                    (select t.id from public.tomadores t where a.cnpj is not null and t.cnpj = a.cnpj limit 1)) as tomador_id,
           af.caso_id
    from (select null) z
    left join lateral (select f2.tomador_id, f2.caso_id from public.analise_fila f2 where f2.analise_id = a.id
                       order by f2.tomador_id is null, f2.caso_id is null limit 1) af on true
  ) x
  where a.vigente
    and a.decisao_cod = 'Aprovar com ressalvas'
    and a.aprovado_definitivo_em is null
    and coalesce(trim(a.condicoes), '') <> ''
    and (x.tomador_id is not null or x.caso_id is not null)
    and cardinality(public.ressalva_itens(a.condicoes)) > 0
  on conflict do nothing;

  for f in select * from _fonte loop
    select * into l from public.lembretes where regra = f.regra;

    if not found then
      select u.auth_id, u.nome into area_resp from public.usuarios u
       where u.status = 'ativo' and u.perfil <> 'leitura' and f.area = any(u.areas) order by u.nome limit 1;
      insert into public.lembretes (tomador_id, caso_id, titulo, detalhe, categoria, area, quando, itens, origem, regra,
                                    responsavel_auth_id, responsavel_nome, criado_por_nome, avisado_em)
      values (f.tomador_id, f.caso_id, left(f.titulo, 200), f.detalhe, coalesce(f.categoria, 'documento'), f.area, coalesce(f.quando, now()),
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
      values (lid, 'criado',
              case when f.categoria = 'ressalva'
                   then 'Aberto pelo robô a partir da ressalva da análise: ' || array_to_string(f.itens, '; ') || '.'
                   else 'Aberto pelo robô: falta ' || array_to_string(f.itens, ', ') || '.' end,
              'Robô do tomador');
      mexidos := mexidos + 1;
      continue;
    end if;

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
             detalhe = coalesce(f.detalhe, detalhe),
             status = case when ok > 0 then 'parcial' else 'aberto' end,
             resolvido_em = null, resolvido_por = null,
             quando = case when l.status = 'resolvido' or entrou then coalesce(f.quando, now()) else quando end
       where id = l.id;
      insert into public.lembrete_eventos (lembrete_id, tipo, texto, por_nome)
      values (l.id, case when l.status = 'resolvido' then 'reaberto' when ok > 0 then 'parcial' else 'editado' end,
              case when l.status = 'resolvido' then 'Reaberto pelo robô: voltou a faltar ' || array_to_string(f.itens, ', ') || '.'
                   when f.categoria = 'ressalva' then 'Robô: a ressalva da análise mudou. Condições: ' || array_to_string(f.itens, '; ') || '.'
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
           resolucao = case when l.regra like 'robo:ressalva:%'
                            then 'A análise saiu da ressalva (aprovada em definitivo, refeita ou com outra decisão) e o robô fechou sozinho.'
                            else 'Os documentos chegaram (ou a etapa andou) e o robô fechou sozinho.' end,
           itens = (select coalesce(jsonb_agg(case when coalesce((i->>'ok')::boolean, false) then i else i || jsonb_build_object('ok', true, 'em', now(), 'por', 'robo') end), '[]'::jsonb)
                    from jsonb_array_elements(l.itens) i)
     where id = l.id;
    insert into public.lembrete_eventos (lembrete_id, tipo, texto, por_nome)
    values (l.id, 'resolvido',
            case when l.regra like 'robo:ressalva:%' then 'Resolvido pelo robô: a análise saiu da ressalva.'
                 else 'Resolvido pelo robô: nada mais falta.' end,
            'Robô do tomador');
    mexidos := mexidos + 1;
  end loop;

  return mexidos;
end $function$;
