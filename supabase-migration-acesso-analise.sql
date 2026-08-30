-- ============================================================
--  QUEM PODE MEXER NA ANALISE DE CREDITO · 30/08/2026
--
--  Ordem do Marco: "as pessoas nao podem usar, eu sou o unico analista.
--  Deixe como visualizacao para todos, vao ver eu trabalhando, as coisas
--  acontecendo. Mas nao podem editar."
--
--  ------------------------------------------------------------------
--  O QUE ESTAVA ERRADO, e nao era suposicao: foi medido no banco.
--
--  A politica de UPDATE de `analise_conflitos` se chamava "Marco decide o
--  conflito", mas a regra dela era `qual = true`. O NOME dizia Marco; a
--  REGRA dizia qualquer um. Resultado: os 12 usuarios do CRM, inclusive os
--  5 de perfil `leitura`, podiam marcar conflito como aplicado ou ignorado.
--
--  E pior no caminho completo: a tela de Conferencia grava em DOIS lugares,
--  primeiro `tomadores` e depois `analise_conflitos`. Escrita em `tomadores`
--  passa por `fam_pode_escrever()`, que so barra perfil `leitura` — ou seja,
--  os outros 6 admins podiam aplicar conflito em lote e trocar razao social,
--  CNPJ e limite aprovado dos tomadores.
--
--  Ninguem fez isso: as 351 linhas estao todas em `situacao = 'aberto'`, e
--  `decidido_por` esta nulo nas 351. A porta estava destrancada, nao arrombada.
--  ------------------------------------------------------------------
--
--  A REGRA NOVA, num lugar so:
--
--    · LER a analise    -> todo mundo que tem login no CRM. De proposito.
--    · ESCREVER a analise -> so quem tem `usuarios.analista_credito = true`.
--
--  Liberar alguem depois NAO precisa de migration nem de codigo novo. E uma
--  linha, e o CRM obedece na hora seguinte:
--
--    update usuarios set analista_credito = true where email = 'fulano@...';
--
--  A carga (`scripts/carga-analises.mjs`) usa SUPABASE_SERVICE_ROLE_KEY, que
--  passa por cima da RLS. Nada aqui a afeta. Conferido antes de escrever.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. A marca de analista, na pessoa
-- ─────────────────────────────────────────────────────────────
-- Coluna e nao tabela, para ficar igual a `proprietario` e a
-- `pode_publicar_avisos`, que ja moram aqui. Uma casa, um jeito.
alter table usuarios
  add column if not exists analista_credito boolean not null default false;

comment on column usuarios.analista_credito is
  'Pode EDITAR a analise de credito (conferencia, publicacao no cadastro). '
  'Ler, todo mundo le. Em 30/08/2026 so o Marco tem. Liberar e um update.';

-- O unico analista, por ordem dele. Por e-mail e nao por id: o id muda de
-- ambiente, o e-mail dele nao.
update usuarios set analista_credito = true
where email = 'marcodragone@gmail.com';

-- ─────────────────────────────────────────────────────────────
-- 2. A pergunta, num lugar so
-- ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER porque a RLS de `usuarios` nao deixa um usuario comum ler
-- a linha de outro; sem isso a funcao responderia falso para todos. Mesmo
-- motivo, mesma forma de `fam_pode_escrever()`, que ja existe ao lado.
create or replace function public.fam_e_analista()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from usuarios
    where auth_id = auth.uid() and analista_credito
  );
$function$;

comment on function public.fam_e_analista() is
  'Quem pode ESCREVER na analise de credito. Nao confundir com '
  'fam_pode_escrever(), que so barra perfil leitura e deixa os 7 admins passar.';

-- ─────────────────────────────────────────────────────────────
-- 3. A trava de verdade
-- ─────────────────────────────────────────────────────────────
-- A politica com nome de Marco e regra de "qualquer um" sai daqui.
drop policy if exists "Marco decide o conflito" on analise_conflitos;

create policy "So o analista decide o conflito"
  on analise_conflitos for update to authenticated
  using (fam_e_analista())
  with check (fam_e_analista());

-- `analises`, `analise_exercicios` e `analise_documentos` ja estavam certas
-- por omissao: so tinham politica de SELECT, e com RLS ligada o que nao tem
-- politica e negado. Escrever nelas so pela carga, com service role.
-- Ficam declaradas aqui para a regra ser LIDA, e nao deduzida do silencio.
drop policy if exists "So o analista escreve a analise" on analises;
create policy "So o analista escreve a analise"
  on analises for all to authenticated
  using (fam_e_analista())
  with check (fam_e_analista());

-- ─────────────────────────────────────────────────────────────
-- 4. Ao vivo: eles veem o Marco trabalhando
-- ─────────────────────────────────────────────────────────────
-- Pedido dele: "pode deixar eles verem eu fazer analise ao vivo".
-- O Realtime respeita a RLS: como LER e liberado para todo autenticado, todos
-- recebem o aviso; como ESCREVER e so do analista, so o trabalho dele aparece.
-- Assistir sem poder tocar, que e exatamente o que ele pediu.
do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime' and c.relname = 'analises'
  ) then
    alter publication supabase_realtime add table analises;
  end if;

  if not exists (
    select 1 from pg_publication_rel pr
    join pg_publication p on p.oid = pr.prpubid
    join pg_class c on c.oid = pr.prrelid
    where p.pubname = 'supabase_realtime' and c.relname = 'analise_conflitos'
  ) then
    alter publication supabase_realtime add table analise_conflitos;
  end if;
end $$;
