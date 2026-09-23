-- ============================================================================
--  A ORDEM DA COLUNA GRAVA DE UMA VEZ SÓ  ·  23/09/2026
--
--  Achado da revisão da própria entrega de hoje: a rota gravava a coluna com um
--  UPDATE por posição, em laço. Se o terceiro falhasse (rede, timeout), os dois
--  primeiros já estavam no banco e o resto não — e a coluna ficava com uma
--  ordem que ninguém pediu. São quatro pessoas mexendo no mesmo quadro agora;
--  "arraste de novo" não é resposta boa o bastante.
--
--  Esta função grava a coluna inteira numa transação: ou entra tudo, ou não
--  entra nada.
--
--  SECURITY INVOKER (o padrão, escrito aqui para não haver dúvida): ela roda
--  COM a permissão de quem chamou, então a RLS de `analise_fila`
--  (`fam_pode_escrever()`) continua valendo igualzinho. Uma função
--  SECURITY DEFINER aqui seria uma porta dos fundos para quem só lê reordenar
--  a fila de todo mundo.
--
--  O FORMATO da entrada é o mesmo que a tela já monta (`renumerar()`, em
--  lib/analise/mesa.ts):
--     [{"ids": ["<uuid>", ...], "prioridade": 1}, {"ids": [...], "prioridade": 2}]
--  Uma lista de ids por posição porque o quadro desenha uma EMPRESA por card, e
--  uma empresa pode ter várias pastas: todas levam o mesmo número.
--
--  ROLLBACK:
--    drop function if exists public.analise_fila_reordenar(jsonb, text);
-- ============================================================================

begin;

create or replace function public.analise_fila_reordenar(p_ordem jsonb, p_quem text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_linhas integer;
begin
  if p_ordem is null or jsonb_typeof(p_ordem) <> 'array' or jsonb_array_length(p_ordem) = 0 then
    raise exception 'A ordem da coluna veio vazia.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_ordem) > 200 then
    raise exception 'Coluna com mais de 200 cards.' using errcode = '22023';
  end if;

  with pedido as (
    select
      (x->>'prioridade')::integer as prioridade,
      (select array_agg(value::text::uuid) from jsonb_array_elements_text(x->'ids') as t(value)) as ids
    from jsonb_array_elements(p_ordem) as x
  ),
  espalhado as (
    select unnest(ids) as id, prioridade from pedido
  ),
  gravou as (
    update public.analise_fila f
       set prioridade     = e.prioridade,
           prioridade_por = p_quem,
           prioridade_em  = now()
      from espalhado e
     where f.id = e.id
    returning f.id
  )
  select count(*) into v_linhas from gravou;

  return v_linhas;
end $$;

comment on function public.analise_fila_reordenar(jsonb, text) is
  'Grava a ordem inteira de uma coluna da Mesa numa transação só. Roda com a permissão de quem chamou (RLS de analise_fila).';

revoke all on function public.analise_fila_reordenar(jsonb, text) from public;
grant execute on function public.analise_fila_reordenar(jsonb, text) to authenticated;

commit;
