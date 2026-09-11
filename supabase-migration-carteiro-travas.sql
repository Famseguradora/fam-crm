-- ============================================================================
--  AS TRAVAS DE FORA DO CARTEIRO · o que a revisão de segurança das fases 2 a 4
--  achou em tabelas que já existiam (11/09/2026, `carteiro_gerencial_travas`)
--
--  Nenhum dos três buracos nasceu no Carteiro gerencial, mas os três anulavam
--  travas que ele usa. Provados em ensaio, com usuário real, dentro de
--  transação desfeita:
--
--  1. PASTA VIRAVA CAMINHO. Qualquer perfil que escreve podia gravar em
--     `analise_fila.pasta` algo como "..\..\AppData\...\Startup", e o agente
--     Esteira baixaria os anexos do caso para lá (pasta de Inicializar do
--     Windows do Marco). Agora `pasta` só aceita NOME de pasta. O agente ganhou
--     a mesma trava do lado dele (scripts/esteira.mjs, `pastaDentroDaRaiz`).
--  2. ADMIN SE FAZIA PROPRIETÁRIO. `usuarios_escrita_gestao` deixa todo admin
--     escrever qualquer coluna, inclusive `proprietario` no próprio registro,
--     e "só o proprietário" (régua, IA, abrir pasta, caixas) caía. Agora a
--     marca de proprietário, e o registro de quem é proprietário, só o próprio
--     proprietário altera (ou o servidor).
--  3. O GASTO DA IA SE APAGAVA. Qualquer um apagava ou zerava a própria linha
--     de `ia_pedidos` e ganhava teto de novo. Agora gasto registrado não se
--     apaga nem diminui pela sessão (o servidor, que acerta a reserva, pode).
--
--  ADITIVO: nenhuma linha existente muda. As 12 pastas atuais já são nomes.
-- ============================================================================

-- ── 1. pasta é nome, nunca caminho ──────────────────────────────────────────
alter table public.analise_fila drop constraint if exists analise_fila_pasta_e_nome;
alter table public.analise_fila add constraint analise_fila_pasta_e_nome
  check (pasta is null or (pasta !~ '[\\/:*?"<>|]' and btrim(pasta) not in ('', '.', '..')));

-- ── 2. a marca de proprietário ──────────────────────────────────────────────
create or replace function public.usuarios_protege_proprietario()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_auth uuid;
  v_dono boolean;
begin
  begin v_auth := auth.uid(); exception when others then v_auth := null; end;
  -- Servidor e scripts (sem sessão) seguem: é por onde o próprio CRM administra.
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
  return NEW;
end $$;

drop trigger if exists trg_usuarios_protege_proprietario on public.usuarios;
create trigger trg_usuarios_protege_proprietario before insert or update or delete on public.usuarios
  for each row execute function public.usuarios_protege_proprietario();

-- ── 3. o gasto da IA não se apaga nem diminui pela sessão ───────────────────
create or replace function public.ia_pedidos_protege_gasto()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare v_auth uuid;
begin
  begin v_auth := auth.uid(); exception when others then v_auth := null; end;
  if v_auth is null then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;
  if TG_OP = 'DELETE' then
    raise exception 'Registro de gasto da IA não se apaga.' using errcode = '42501';
  end if;
  if OLD.custo_usd is not null and (NEW.custo_usd is null or NEW.custo_usd < OLD.custo_usd) then
    raise exception 'O gasto registrado da IA não diminui.' using errcode = '42501';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_ia_pedidos_protege_gasto on public.ia_pedidos;
create trigger trg_ia_pedidos_protege_gasto before update or delete on public.ia_pedidos
  for each row execute function public.ia_pedidos_protege_gasto();
