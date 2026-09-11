-- ============================================================================
--  A IA PARA A EQUIPE INTEIRA  ·  11/09/2026
--
--  Pedido do Marco: "revise todo o CRM, confira se em todos os lugares que tem
--  IA integrada está com API ligada, para que funcione nos notebooks de geral".
--  A revisão achou três coisas no banco, e esta migration corrige as três.
--
--  1. A PERGUNTA DA IA GESTOR VAZAVA PARA TODOS. A migration da IA de Gestão
--     (supabase-migration-ia-gestao.sql) criou `ia_pedidos_select` com
--     `using (true)`, pensando no acervo ("a resposta sobre o acervo é da
--     equipe"). Policies de leitura se somam, então esse `true` também abriu
--     as perguntas da IA Gestor (escopo 'crm'), que a migration
--     ia-servidor prometeu serem só de quem perguntou. Sai o `true`; fica a
--     `ia_pedidos_leitura`, que já dá à equipe o que é da equipe (gestao e
--     analise) e a cada pessoa as próprias perguntas do CRM.
--
--  2. O TETO DO DIA PASSA A SER DA EMPRESA. Com a pergunta fechada, a soma do
--     gasto pela sessão viraria soma de cada pessoa, e o teto de US$ 5 valeria
--     US$ 5 por pessoa. `ia_gasto_24h()` soma tudo, sem devolver pergunta
--     nenhuma, e é o que toda rota de IA consulta.
--
--  3. NINGUÉM GRAVA GASTO INFLADO PELA SESSÃO. Qualquer pessoa com login podia
--     inserir uma linha própria de IA Gestor com custo de US$ 1.000 e travar a
--     IA da empresa pelo resto do dia. Pela sessão, cada linha fica limitada a
--     US$ 5 (uma pergunta real custa centavos; o pior caso medido do laço de 8
--     voltas fica abaixo de US$ 3). O servidor, que reserva o lote do Carteiro,
--     continua livre. E o insert de escopo 'crm' só passa pela policy que exige
--     `criado_por_auth_id = auth.uid()`: ninguém pergunta em nome de outro.
--
--  ADITIVO: nenhuma linha muda. Ensaiada numa transação com rollback antes.
-- ============================================================================
begin;

-- ── 1. a pergunta da IA Gestor é de quem perguntou ─────────────────────────
drop policy if exists ia_pedidos_select on public.ia_pedidos;

drop policy if exists ia_pedidos_insert on public.ia_pedidos;
create policy ia_pedidos_insert on public.ia_pedidos
  for insert to authenticated
  with check (escopo <> 'crm' and public.fam_pode_escrever());

-- ── 2. o gasto do dia, da FAM inteira ──────────────────────────────────────
create or replace function public.ia_gasto_24h()
returns table (usd numeric, perguntas integer, com_cache integer)
language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce(sum(p.custo_usd), 0)::numeric,
         count(*)::integer,
         (count(*) filter (where coalesce(p.cache_leitura, 0) > 0))::integer
    from public.ia_pedidos p
   where p.criado_em >= now() - interval '24 hours'
     and p.custo_usd is not null
$$;
revoke all on function public.ia_gasto_24h() from public;
revoke all on function public.ia_gasto_24h() from anon;
grant execute on function public.ia_gasto_24h() to authenticated;

-- ── 3. gasto registrado: não some, não diminui, não infla pela sessão ──────
create or replace function public.ia_pedidos_protege_gasto()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare v_auth uuid;
begin
  begin v_auth := auth.uid(); exception when others then v_auth := null; end;
  -- Servidor e agentes (sem sessão) seguem: são eles que reservam e acertam o gasto.
  if v_auth is null then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;
  if TG_OP = 'DELETE' then
    raise exception 'Registro de gasto da IA não se apaga.' using errcode = '42501';
  end if;
  if TG_OP = 'UPDATE' and OLD.custo_usd is not null and (NEW.custo_usd is null or NEW.custo_usd < OLD.custo_usd) then
    raise exception 'O gasto registrado da IA não diminui.' using errcode = '42501';
  end if;
  if NEW.custo_usd is not null and NEW.custo_usd > 5 then
    raise exception 'Gasto de IA acima de US$ 5 numa pergunta só não é gravado pela sessão.' using errcode = '42501';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_ia_pedidos_protege_gasto on public.ia_pedidos;
create trigger trg_ia_pedidos_protege_gasto before insert or update or delete on public.ia_pedidos
  for each row execute function public.ia_pedidos_protege_gasto();

commit;
