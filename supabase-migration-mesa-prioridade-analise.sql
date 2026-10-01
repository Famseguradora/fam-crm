-- ============================================================================
--  A ORDEM DA MESA TAMBÉM PARA O CARD SEM PASTA  ·  01/10/2026
--
--  Achado no ensaio do arrastar (pedido do Marco no mesmo dia: arrastar em
--  qualquer ordenação). A coluna "Pronta" tinha 7 cards e a rota gravou 4: os
--  outros 3 eram ANÁLISES SEM PASTA na esteira (o card nasce de `analises`,
--  ver `analiseVirandoFicha` em lib/analise/mesa.ts), e a ordem só existia em
--  `analise_fila.prioridade`. O card arrastado voltava para o fim, calado.
--
--  Agora `analises` tem a própria posição na Mesa (só estas três colunas) e a
--  mesma função grava as duas tabelas, numa transação só.
--
--  POR QUE SECURITY DEFINER: `analises` só aceita escrita do analista
--  (`fam_e_analista()`), e ordenar a Mesa é de quem AJUDA na análise
--  (`fam_ajuda_analise()`, a mesma regra da RLS de `analise_fila`). A função
--  confere essa regra antes e só toca as colunas de posição.
--
--  ROLLBACK:
--    rodar de novo supabase-migration-prioridade-atomica.sql;
--    drop function if exists public.analise_mesa_limpar_prioridade(uuid[]);
--    alter table public.analises drop column mesa_prioridade, drop column mesa_prioridade_por, drop column mesa_prioridade_em;
-- ============================================================================

begin;

alter table public.analises
  add column if not exists mesa_prioridade integer,
  add column if not exists mesa_prioridade_por text,
  add column if not exists mesa_prioridade_em timestamptz;

comment on column public.analises.mesa_prioridade is
  'Posição do card na coluna da Mesa, quando a análise está lá SEM pasta na esteira. Com pasta, vale analise_fila.prioridade.';

create or replace function public.analise_fila_reordenar(p_ordem jsonb, p_quem text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila integer;
  v_analises integer;
begin
  if not public.fam_ajuda_analise() then
    return 0;  -- a mesma resposta que a RLS dava: nenhuma linha gravada
  end if;
  if p_ordem is null or jsonb_typeof(p_ordem) <> 'array' or jsonb_array_length(p_ordem) = 0 then
    raise exception 'A ordem da coluna veio vazia.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_ordem) > 200 then
    raise exception 'Coluna com mais de 200 cards.' using errcode = '22023';
  end if;

  create temporary table if not exists _espalhado (id uuid, prioridade integer) on commit drop;
  truncate _espalhado;
  insert into _espalhado
  select unnest(ids), prioridade from (
    select (x->>'prioridade')::integer as prioridade,
           (select array_agg(value::text::uuid) from jsonb_array_elements_text(x->'ids') as t(value)) as ids
    from jsonb_array_elements(p_ordem) as x
  ) p;

  update public.analise_fila f
     set prioridade = e.prioridade, prioridade_por = p_quem, prioridade_em = now()
    from _espalhado e
   where f.id = e.id;
  get diagnostics v_fila = row_count;

  -- O card sem pasta: o id da ficha é o da análise.
  update public.analises a
     set mesa_prioridade = e.prioridade, mesa_prioridade_por = p_quem, mesa_prioridade_em = now()
    from _espalhado e
   where a.id = e.id
     and not exists (select 1 from public.analise_fila f where f.id = e.id);
  get diagnostics v_analises = row_count;

  return v_fila + v_analises;
end $$;

comment on function public.analise_fila_reordenar(jsonb, text) is
  'Grava a ordem inteira de uma coluna da Mesa numa transação só: pastas (analise_fila) e cards sem pasta (analises). Só quem ajuda na análise.';

revoke all on function public.analise_fila_reordenar(jsonb, text) from public;
grant execute on function public.analise_fila_reordenar(jsonb, text) to authenticated;

-- O "↺ devolver ao automático" para o card sem pasta.
create or replace function public.analise_mesa_limpar_prioridade(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  if not public.fam_ajuda_analise() then return 0; end if;
  update public.analises set mesa_prioridade = null, mesa_prioridade_por = null, mesa_prioridade_em = null
   where id = any(p_ids) and mesa_prioridade is not null;
  get diagnostics v = row_count;
  return v;
end $$;

revoke all on function public.analise_mesa_limpar_prioridade(uuid[]) from public;
grant execute on function public.analise_mesa_limpar_prioridade(uuid[]) to authenticated;

-- O Supabase dá execute ao anon por padrão; sem sessão a função já devolve 0,
-- mas fica fechado como nas outras (achado da revisão de 01/10/2026).
revoke execute on function public.analise_fila_reordenar(jsonb, text) from anon;
revoke execute on function public.analise_mesa_limpar_prioridade(uuid[]) from anon;

commit;
