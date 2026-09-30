-- ============================================================================
--  QUEM É ANALISTA, SÓ O PROPRIETÁRIO DECIDE  ·  30/09/2026
--
--  Ordem do Marco: "as análises de crédito somente eu (executivo de Crédito) ou
--  alguém que eu libere pode editar". A análise já está trancada em
--  `fam_e_analista()` (RLS de `analises`, `analise_pedidos`, `agente_pedidos`,
--  `analise_conflitos`, e a esteira em lib/analise/dar-ordem.ts).
--
--  O BURACO: a marca que faz alguém analista mora em `usuarios.analista_credito`,
--  e a política de escrita de `usuarios` é `fam_gerencia_usuarios()`, que vale
--  para TODO admin. Conferido em 30/09: 8 admins com acesso à Análise, 1
--  analista. Qualquer um dos outros 7 conseguia, pelo navegador, gravar
--  `analista_credito = true` em si mesmo e passar a editar, refazer e aprovar
--  análise. A tela /usuarios só mostra o botão ao proprietário; o banco não
--  conferia.
--
--  A CORREÇÃO vai no gatilho que já protege o registro do proprietário
--  (`usuarios_protege_proprietario`): quem não é proprietário não muda
--  `analista_credito` nem `acesso_analise`, nem cria usuário já com elas.
--  O resto do gatilho fica como estava. A carga e os scripts do servidor rodam
--  sem `auth.uid()` e continuam passando.
--
--  ROLLBACK: rodar de novo a versão anterior da função (no fim deste arquivo).
-- ============================================================================

create or replace function public.usuarios_protege_proprietario()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_auth uuid;
  v_dono boolean;
begin
  begin v_auth := auth.uid(); exception when others then v_auth := null; end;
  if v_auth is null then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;
  select exists (select 1 from public.usuarios u where u.auth_id = v_auth and u.proprietario = true) into v_dono;
  if v_dono then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;
  if TG_OP = 'INSERT' then
    if coalesce(NEW.proprietario, false) then
      raise exception 'Só o proprietário marca alguém como proprietário.' using errcode = '42501';
    end if;
    -- NOVO: usuário criado por admin nasce sem análise e sem analista.
    if coalesce(NEW.analista_credito, false) or coalesce(NEW.acesso_analise, false) then
      raise exception 'Só o proprietário libera a Análise de crédito ou o analista.' using errcode = '42501';
    end if;
    return NEW;
  end if;
  if TG_OP = 'DELETE' then
    if coalesce(OLD.proprietario, false) then
      raise exception 'O registro do proprietário só ele mesmo altera.' using errcode = '42501';
    end if;
    return OLD;
  end if;
  if coalesce(OLD.proprietario, false) or coalesce(NEW.proprietario, false) is distinct from coalesce(OLD.proprietario, false) then
    raise exception 'O registro do proprietário, e a marca de proprietário, só ele mesmo altera.' using errcode = '42501';
  end if;
  -- NOVO: a marca de analista e o acesso à Análise são do proprietário.
  if coalesce(NEW.analista_credito, false) is distinct from coalesce(OLD.analista_credito, false)
     or coalesce(NEW.acesso_analise, false) is distinct from coalesce(OLD.acesso_analise, false) then
    raise exception 'Só o proprietário libera a Análise de crédito ou o analista.' using errcode = '42501';
  end if;
  return NEW;
end $function$;

-- ============================================================================
--  ROLLBACK (a versão de antes, copiada do banco em 30/09/2026)
-- ============================================================================
-- create or replace function public.usuarios_protege_proprietario()
-- returns trigger language plpgsql security definer set search_path to 'public', 'pg_catalog'
-- as $function$
-- declare v_auth uuid; v_dono boolean;
-- begin
--   begin v_auth := auth.uid(); exception when others then v_auth := null; end;
--   if v_auth is null then if TG_OP = 'DELETE' then return OLD; end if; return NEW; end if;
--   select exists (select 1 from public.usuarios u where u.auth_id = v_auth and u.proprietario = true) into v_dono;
--   if v_dono then if TG_OP = 'DELETE' then return OLD; end if; return NEW; end if;
--   if TG_OP = 'INSERT' then
--     if coalesce(NEW.proprietario, false) then raise exception 'Só o proprietário marca alguém como proprietário.' using errcode = '42501'; end if;
--     return NEW;
--   end if;
--   if TG_OP = 'DELETE' then
--     if coalesce(OLD.proprietario, false) then raise exception 'O registro do proprietário só ele mesmo altera.' using errcode = '42501'; end if;
--     return OLD;
--   end if;
--   if coalesce(OLD.proprietario, false) or coalesce(NEW.proprietario, false) is distinct from coalesce(OLD.proprietario, false) then
--     raise exception 'O registro do proprietário, e a marca de proprietário, só ele mesmo altera.' using errcode = '42501';
--   end if;
--   return NEW;
-- end $function$;
