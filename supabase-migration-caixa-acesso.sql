-- ============================================================================
--  QUEM VÊ CADA CAIXA DE E-MAIL  ·  09/09/2026
--
--  Pedido dele, com o deploy à vista: a caixa do Comercial
--  (comercial@famseguradora.com.br) é lida pela máquina dele, mas a ORDEM
--  ("trazer para a esteira", "tratar", "abrir o e-mail") passa a ser dada por
--  outras pessoas, de outras máquinas. E só por três: Abenaias, Ivan e Isabela.
--  A caixa pessoal dele continua sendo só dele.
--
--  O QUE ESTAVA ERRADO ANTES
--
--    email_contas  SELECT: `true`  — toda a lista de caixas, para todo mundo
--    emails_caixa  SELECT: `serve OR dono` — TODO e-mail marcado como "serve"
--                  era legível por qualquer usuário do CRM, de qualquer perfil
--
--  O segundo é o grave: "serve" quer dizer "interessa ao CRM", e não "pode ser
--  lido por todos". Com o sistema publicado e doze usuários, isso seria a caixa
--  do Comercial aberta para quem entrasse.
--
--  POR QUE NÃO USAR `perfil = 'admin'` COMO CRITÉRIO
--
--  Porque HOJE há oito admins, e ele quer três pessoas. Perfil diz o que a
--  pessoa pode fazer no CRM; não diz de quem é o e-mail. Já foi anotado uma vez
--  que "admin" não serve como critério de privacidade, e aqui é o mesmo caso.
--  Por isso a permissão é uma LISTA, nome a nome.
--
--  QUEM DÁ E TIRA ACESSO: o dono da caixa, ou o proprietário do CRM (que hoje é
--  só o Marco). Um admin qualquer NÃO consegue se dar acesso à caixa de outro.
--
--  ROLLBACK no fim do arquivo.
-- ============================================================================

-- ── 1. a lista ──────────────────────────────────────────────────────────────
create table if not exists public.email_conta_acesso (
  id          uuid primary key default gen_random_uuid(),
  conta_id    uuid not null references public.email_contas(id) on delete cascade,
  auth_id     uuid not null,
  criado_em   timestamptz not null default now(),
  criado_por  text,
  unique (conta_id, auth_id)
);
create index if not exists email_conta_acesso_auth_idx on public.email_conta_acesso (auth_id);

comment on table public.email_conta_acesso is
  'Quem, alem do dono, ve e opera uma caixa de e-mail. Lista nome a nome: perfil de admin NAO da acesso a caixa de ninguem.';

-- ── 2. as duas perguntas ────────────────────────────────────────────────────
-- SECURITY DEFINER porque elas mesmas leem tabelas com RLS: sem isso, a
-- politica se olharia no espelho e ninguem veria nada.

create or replace function public.fam_ve_caixa(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from email_contas c
    where c.id = p_conta and c.dono_auth_id = auth.uid()
  )
  or exists (
    select 1 from email_conta_acesso a
    where a.conta_id = p_conta and a.auth_id = auth.uid()
  )
  or exists (
    select 1 from usuarios u
    where u.auth_id = auth.uid() and u.proprietario
  );
$$;

comment on function public.fam_ve_caixa(uuid) is
  'A pessoa ve esta caixa? Dono, ou esta na lista de acesso, ou e o proprietario do CRM.';

create or replace function public.fam_manda_na_caixa(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from email_contas c
    where c.id = p_conta and c.dono_auth_id = auth.uid()
  )
  or exists (
    select 1 from usuarios u
    where u.auth_id = auth.uid() and u.proprietario
  );
$$;

comment on function public.fam_manda_na_caixa(uuid) is
  'Quem liga/desliga a caixa e decide quem entra na lista: o dono, ou o proprietario do CRM.';

-- ── 3. as travas ────────────────────────────────────────────────────────────
alter table public.email_conta_acesso enable row level security;

drop policy if exists email_conta_acesso_leitura on public.email_conta_acesso;
create policy email_conta_acesso_leitura on public.email_conta_acesso
  for select using (public.fam_ve_caixa(conta_id));

drop policy if exists email_conta_acesso_escrita on public.email_conta_acesso;
create policy email_conta_acesso_escrita on public.email_conta_acesso
  for all using (public.fam_manda_na_caixa(conta_id))
  with check (public.fam_manda_na_caixa(conta_id));

-- A LISTA DE CAIXAS deixa de ser publica. Ver o endereco de uma caixa e a
-- maquina que a le ja e informacao de quem trabalha nela.
drop policy if exists email_contas_leitura on public.email_contas;
create policy email_contas_leitura on public.email_contas
  for select using (public.fam_ve_caixa(id));

drop policy if exists email_contas_escrita on public.email_contas;
create policy email_contas_escrita on public.email_contas
  for all using (public.fam_manda_na_caixa(id))
  with check (public.fam_manda_na_caixa(id));

-- O E-MAIL EM SI. Aqui estava o buraco: `serve` liberava para todo mundo.
drop policy if exists emails_caixa_leitura on public.emails_caixa;
create policy emails_caixa_leitura on public.emails_caixa
  for select using (public.fam_ve_caixa(conta_id));

-- Escrever (trazer, tratar) exige as DUAS coisas: poder escrever no CRM e ver
-- aquela caixa. Perfil de leitura continua so lendo.
drop policy if exists emails_caixa_escrita on public.emails_caixa;
create policy emails_caixa_escrita on public.emails_caixa
  for all using (public.fam_pode_escrever() and public.fam_ve_caixa(conta_id))
  with check (public.fam_pode_escrever() and public.fam_ve_caixa(conta_id));

-- ============================================================================
--  ROLLBACK  (colar inteiro para desfazer)
--
--  drop policy if exists emails_caixa_leitura on public.emails_caixa;
--  create policy emails_caixa_leitura on public.emails_caixa for select
--    using (serve or exists (select 1 from email_contas c
--                            where c.id = emails_caixa.conta_id and c.dono_auth_id = auth.uid()));
--  drop policy if exists emails_caixa_escrita on public.emails_caixa;
--  create policy emails_caixa_escrita on public.emails_caixa for all
--    using (public.fam_pode_escrever()) with check (public.fam_pode_escrever());
--  drop policy if exists email_contas_leitura on public.email_contas;
--  create policy email_contas_leitura on public.email_contas for select using (true);
--  drop policy if exists email_contas_escrita on public.email_contas;
--  create policy email_contas_escrita on public.email_contas for all
--    using (dono_auth_id = auth.uid() or public.fam_gerencia_usuarios())
--    with check (dono_auth_id = auth.uid() or public.fam_gerencia_usuarios());
--  drop table if exists public.email_conta_acesso;
--  drop function if exists public.fam_ve_caixa(uuid);
--  drop function if exists public.fam_manda_na_caixa(uuid);
-- ============================================================================
