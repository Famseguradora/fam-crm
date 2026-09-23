-- ============================================================================
--  A ANALISE DE CREDITO ABRE PARA A EQUIPE  ·  23/09/2026
--
--  Ordem do Marco: "disponibilize essa tela para outros usuarios. Eles nao vao
--  fazer a analise, a ideia e visualizar os documentos, os cards, poderem
--  ordenar os cards dentro das colunas. O acervo. Podem ver tudo, ate inserir
--  alguns dados dentro do card ('O que eu sei deste tomador'). Mas tem que
--  registrar o que cada um fez: no historico de cada card tem que ter a
--  informacao do que cada um acessou."
--
--  ------------------------------------------------------------------------
--  O QUE FOI MEDIDO NO BANCO ANTES DE ESCREVER ISTO, e mudou o desenho:
--
--  1. Os 12 logins do CRM sao 8 `admin` e 4 `leitura`. NAO EXISTE NENHUM de
--     perfil `usuario`. Como arrastar card e escrever nota passam por
--     `fam_pode_escrever()`, que so barra `leitura`, as 8 pessoas da FAM JA
--     faziam as duas coisas antes desta migration. Nada de novo lhes e dado
--     aqui: o que muda e que agora ha uma marca explicita, e um registro.
--
--  2. Dois dos quatro `leitura` sao de FORA da FAM:
--         marcelo@bulhoesadvogados.com   (escritorio de advocacia)
--         marcelo.fonseca@stonepart.com  (Stonepart)
--     Pela regra de 30/08 ("ler a analise e de todo mundo que tem login"),
--     esses dois enxergavam a Mesa inteira, o Acervo e as 195 analises, com
--     balanco, Serasa e limite de 634 tomadores. Nao era intencao de ninguem:
--     em 30/08 os logins de fora ainda nao existiam, e a regra envelheceu.
--     Decisao dele em 23/09: a marca passa a controlar VER, e nao so mexer.
--  ------------------------------------------------------------------------
--
--  A REGRA NOVA, em tres andares e num lugar so:
--
--    · VER a analise ....... `usuarios.acesso_analise = true`  -> fam_ve_analise()
--    · AJUDAR na analise ... ver + perfil <> 'leitura'         -> fam_ajuda_analise()
--        (arrastar card na coluna, escrever nota, encaminhar, pedir varredura)
--    · SER O ANALISTA ...... `usuarios.analista_credito`       -> fam_e_analista()
--        (decidir conflito, publicar no cadastro, mexer na analise em si)
--        Continua so do Marco. Esta migration nao encosta nisso.
--
--  Quem e `leitura` E marcado VE e nao arrasta, que foi o pedido literal dele:
--  "os que sao somente leitura nao podem arrastar cards, so visualizar".
--
--  LIBERAR E TIRAR ACESSO NAO PRECISA MAIS DE SQL. Virou um interruptor na
--  tela /usuarios, que so o proprietario enxerga, igual ao de publicar avisos.
--
--  A SEMEADURA: os 8 `admin` ativos entram marcados, porque eles ja viam e ja
--  mexiam antes desta migration e tirar isso seria uma regressao silenciosa.
--  Os 4 `leitura` entram desmarcados, inclusive os dois da FAM (Francisco e
--  Gilda): e mais facil ele ligar dois interruptores do que descobrir meses
--  depois que um balanco vazou.
--
--  A CARGA (`scripts/carga-analises.mjs`), o agente do notebook (`esteira.mjs`)
--  e as rotas de evento usam SUPABASE_SERVICE_ROLE_KEY, que passa por cima da
--  RLS. Conferido rota a rota antes de escrever: nada aqui os afeta.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────
-- 1. A marca, na pessoa
-- ─────────────────────────────────────────────────────────────
-- Coluna e nao tabela, para ficar igual a `analista_credito`, `proprietario` e
-- `pode_publicar_avisos`, que ja moram aqui. Uma casa, um jeito. (O Financeiro
-- usa tabela propria porque la a concessao tem dono, convite e revogacao
-- datada; aqui e um interruptor, e tabela seria cerimonia sem uso.)
alter table public.usuarios
  add column if not exists acesso_analise boolean not null default false;

comment on column public.usuarios.acesso_analise is
  'Entra na tela de Analise de credito (/analises) e le a Mesa, o Acervo e os '
  'relatorios. Marcado no proprio /usuarios pelo proprietario. Nao confundir '
  'com analista_credito, que e quem EDITA a analise.';

-- Os 8 admins ativos, que ja viam e ja mexiam antes desta migration.
update public.usuarios
   set acesso_analise = true
 where perfil = 'admin' and status = 'ativo';

-- ─────────────────────────────────────────────────────────────
-- 2. As duas perguntas, num lugar so
-- ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER pelo mesmo motivo de `fam_e_analista()`: a RLS de `usuarios`
-- nao deixa um usuario comum ler a linha de outro, e sem isto a funcao
-- responderia falso para todos.
create or replace function public.fam_ve_analise()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from usuarios
    where auth_id = auth.uid()
      and acesso_analise
      and status = 'ativo'
  );
$function$;

comment on function public.fam_ve_analise() is
  'Quem ENTRA na Analise de credito. Marcado em usuarios.acesso_analise.';

create or replace function public.fam_ajuda_analise()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from usuarios
    where auth_id = auth.uid()
      and acesso_analise
      and status = 'ativo'
      and perfil <> 'leitura'
  );
$function$;

comment on function public.fam_ajuda_analise() is
  'Quem AJUDA na Analise: arrasta card na coluna, escreve nota, encaminha. '
  'Ver mais perfil que nao e leitura. Nao decide conflito nem publica: isso e '
  'fam_e_analista(), e continua so do Marco.';

-- ─────────────────────────────────────────────────────────────
-- 3. LER: sai o `using (true)`, entra a marca
-- ─────────────────────────────────────────────────────────────
-- Uma tabela por vez e com o nome da politica antiga, porque os nomes nao
-- seguem um padrao so (umas sao "Autenticados leem", outras `<tabela>_leitura`)
-- e um `drop` generico deixaria politica velha viva embaixo da nova. Politica
-- de leitura esquecida e porta aberta: e exatamente o que esta sendo fechado.
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'analises', 'analise_fila', 'analise_notas', 'analise_colunas',
    'analise_recados', 'analise_encaminhamentos', 'analise_estado',
    'analise_comandos', 'analise_eventos', 'analise_documentos',
    'analise_exercicios', 'analise_conflitos', 'analise_edicoes',
    'analise_complementos', 'analise_pedidos'
  ] loop
    -- Derruba TODA politica de SELECT que exista hoje nesta tabela.
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'SELECT'
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.fam_ve_analise())',
      t || '_le_quem_tem_acesso', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. AJUDAR: quem mexe no card passa a ser fam_ajuda_analise()
-- ─────────────────────────────────────────────────────────────
-- Para as 8 pessoas da FAM isto nao muda NADA hoje (todas sao admin e todas
-- entram marcadas). O que muda e o dia em que ele desmarcar alguem: hoje a
-- pessoa continuaria arrastando card, porque a trava olhava so o perfil.

drop policy if exists analise_fila_escrita on public.analise_fila;
create policy analise_fila_escrita on public.analise_fila for all to authenticated
  using (public.fam_ajuda_analise()) with check (public.fam_ajuda_analise());

drop policy if exists analise_notas_escrita on public.analise_notas;
create policy analise_notas_escrita on public.analise_notas for all to authenticated
  using (public.fam_ajuda_analise()) with check (public.fam_ajuda_analise());

drop policy if exists analise_encaminhamentos_escrita on public.analise_encaminhamentos;
create policy analise_encaminhamentos_escrita on public.analise_encaminhamentos for all to authenticated
  using (public.fam_ajuda_analise()) with check (public.fam_ajuda_analise());

drop policy if exists analise_recados_marcar on public.analise_recados;
create policy analise_recados_marcar on public.analise_recados for update to authenticated
  using (public.fam_ajuda_analise()) with check (public.fam_ajuda_analise());

drop policy if exists analise_comandos_pedir on public.analise_comandos;
create policy analise_comandos_pedir on public.analise_comandos for insert to authenticated
  with check (public.fam_ajuda_analise());

drop policy if exists "Quem escreve cria coluna na Mesa" on public.analise_colunas;
create policy "Quem ajuda cria coluna na Mesa" on public.analise_colunas for insert to authenticated
  with check (public.fam_ajuda_analise());

drop policy if exists "Quem escreve muda coluna na Mesa" on public.analise_colunas;
create policy "Quem ajuda muda coluna na Mesa" on public.analise_colunas for update to authenticated
  using (public.fam_ajuda_analise()) with check (public.fam_ajuda_analise());

-- ─────────────────────────────────────────────────────────────
-- 5. O REGISTRO: quem abriu qual card, e quando
-- ─────────────────────────────────────────────────────────────
-- "No historico de cada card tem que ter a informacao do que cada um acessou."
--
-- UMA LINHA POR PESSOA, POR CARD, POR JANELA DE 30 MINUTOS. Nao e economia de
-- espaco: e legibilidade. A aba Atividades e uma linha de HISTORIA, e quem
-- abre o card, rola, volta para a Mesa e entra de novo produziria oito linhas
-- iguais que afogam o encaminhamento e a nota no meio. Trinta minutos e uma
-- sessao de trabalho; `vezes` guarda quantas voltas ela teve.
create table if not exists public.analise_acessos (
  id           bigserial primary key,
  fila_id      uuid not null references public.analise_fila(id) on delete cascade,
  quem         uuid not null,          -- auth.uid(), nunca o que o navegador mandou
  quem_nome    text not null,          -- lido de `usuarios` pela funcao, pelo mesmo motivo
  janela       timestamptz not null,   -- inicio da janela de 30 min
  primeiro_em  timestamptz not null default now(),
  ultimo_em    timestamptz not null default now(),
  vezes        integer not null default 1,
  unique (fila_id, quem, janela)
);

comment on table public.analise_acessos is
  'Quem abriu qual card da Analise, e quando. Uma linha por pessoa/card/janela '
  'de 30 min. Escrita SO pela funcao registrar_visita_analise(): a tabela nao '
  'tem politica de insert, entao ninguem forja acesso em nome de outro.';

create index if not exists analise_acessos_fila_idx
  on public.analise_acessos (fila_id, ultimo_em desc);
create index if not exists analise_acessos_quem_idx
  on public.analise_acessos (quem, ultimo_em desc);

alter table public.analise_acessos enable row level security;

-- LER o registro: quem tem acesso a analise. Ele quis a equipe trabalhando em
-- fluxo, e fluxo e todo mundo vendo quem passou por onde.
drop policy if exists analise_acessos_leitura on public.analise_acessos;
create policy analise_acessos_leitura on public.analise_acessos
  for select to authenticated using (public.fam_ve_analise());

-- ESCREVER: nenhuma politica, de proposito. Com RLS ligada, o que nao tem
-- politica e negado. A unica porta e a funcao abaixo.

create or replace function public.registrar_visita_analise(p_fila uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_nome   text;
  v_janela timestamptz;
begin
  if p_fila is null or auth.uid() is null then return; end if;
  if not public.fam_ve_analise() then return; end if;

  select coalesce(nullif(nome, ''), email) into v_nome
    from usuarios where auth_id = auth.uid();
  if v_nome is null then return; end if;

  -- O card tem que existir. Sem isto, um `fila_id` inventado viraria linha
  -- orfa (a FK pegaria, mas com erro na cara de quem so abriu uma tela).
  if not exists (select 1 from analise_fila where id = p_fila) then return; end if;

  -- Janela de 30 min, ancorada na hora cheia: 10:00 e 10:30, nunca 10:07.
  v_janela := date_trunc('hour', now())
            + (floor(extract(minute from now()) / 30) * interval '30 minutes');

  insert into analise_acessos (fila_id, quem, quem_nome, janela)
  values (p_fila, auth.uid(), v_nome, v_janela)
  on conflict (fila_id, quem, janela) do update
    set ultimo_em = now(),
        vezes     = analise_acessos.vezes + 1,
        quem_nome = excluded.quem_nome;
end $function$;

comment on function public.registrar_visita_analise(uuid) is
  'Registra que quem esta logado abriu o card. O nome e o auth.uid() saem da '
  'sessao e do banco, nunca do navegador: por isso a tela pode chamar direto.';

revoke all on function public.registrar_visita_analise(uuid) from public;
grant execute on function public.registrar_visita_analise(uuid) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────
-- 6. Analista tem que enxergar a propria analise
-- ─────────────────────────────────────────────────────────────
-- Sem isto, desmarcar o analista deixaria o banco num estado incoerente: a RLS
-- o deixaria ESCREVER (`fam_e_analista()`) e o proibiria de LER
-- (`fam_ve_analise()`). O banco recusa a combinacao, em vez de deixar a tela
-- descobrir. O interruptor do /usuarios tambem se recusa, mas a trava e esta.
alter table public.usuarios
  add constraint usuarios_analista_ve_analise
  check (not analista_credito or acesso_analise) not valid;
alter table public.usuarios validate constraint usuarios_analista_ve_analise;

comment on constraint usuarios_analista_ve_analise on public.usuarios is
  'Analista que nao enxerga a analise seria incoerente: a RLS o deixaria '
  'ESCREVER (fam_e_analista) e o proibiria de LER (fam_ve_analise).';
