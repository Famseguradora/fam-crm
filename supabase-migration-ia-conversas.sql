-- ============================================================================
--  AS CONVERSAS DA IA DE GESTÃO, DENTRO DO CRM  (09/09/2026)
--
--  Pedido dele: "a IA de Gestão veio sem as conversas salvas no sistema de
--  análise de crédito anterior. Consegue trazer tudo? Também preciso que essa
--  IA de Gestão armazene e mostre as conversas feitas e trocadas com ele."
--
--  São 37 conversas e ~160 mensagens no `_sistema/registro/aprendizado/
--  conversas/<id>/`, separadas por assunto desde 12/08/2026 — a razão dele na
--  época: "para separar a memória e não confundir o conteúdo".
--
--  ── A DECISÃO QUE ORGANIZA ESTA MIGRATION ──────────────────────────────────
--
--  `ia_pedidos` é o PEDIDO (o trabalho em voo: quem perguntou, qual motor
--  pegou, se já respondeu). `ia_mensagens` é o FIO DA CONVERSA. Não são a
--  mesma coisa, e juntá-las seria o defeito de sempre: um pedido que falhou
--  não é uma fala, e uma fala do disco não tem pedido nenhum atrás.
--
--  A FONTE DE HOJE É O DISCO. O agente do notebook espelha as conversas para
--  cá; a pergunta feita no CRM vira pedido, o `gestao.mjs` grava no jsonl, e a
--  sincronização seguinte traz as duas falas. Uma verdade só.
--
--  E AMANHÃ, NA NUVEM: quando a resposta vier da API (os colegas novos, o
--  acesso por API que ele já descreveu), a mensagem entra com `origem='crm'` e
--  a tela não muda uma linha — ela nunca soube quem respondeu. É por isso que
--  `origem` existe desde agora.
--
--  ADITIVO. Não altera nem apaga nada.
-- ============================================================================

begin;

-- ── 1. AS CONVERSAS, uma por assunto ────────────────────────────────────────
create table if not exists public.ia_conversas (
  -- O id do motor (`c` + base36), quando veio do disco; um uuid em texto
  -- quando nasce aqui. Mesma coluna, para o fio não ter duas chaves.
  id               text primary key,
  titulo           text not null default '',
  -- Ele renomeou à mão: o título automático não volta a mandar.
  titulo_dele      boolean not null default false,
  escopo           text not null default 'gestao' check (escopo in ('gestao', 'analise')),
  origem           text not null default 'crm' check (origem in ('crm', 'motor')),
  criada           timestamptz not null default now(),
  ultima           timestamptz not null default now(),
  trocas           integer not null default 0,
  criado_por_nome  text,
  criado_por_auth_id uuid,
  arquivada        boolean not null default false,
  sincronizado_em  timestamptz
);
comment on table public.ia_conversas is
  'Uma conversa por assunto com a IA de Gestão (o conversas.mjs do Sistema de Análise). Separar assunto é separar a MEMÓRIA: cada conversa carrega a própria sessão do lado do motor.';
comment on column public.ia_conversas.origem is
  'De onde a conversa nasceu: "motor" (o disco do notebook, espelhada pelo agente) ou "crm".';

create index if not exists ia_conversas_ultima_idx on public.ia_conversas (ultima desc);

alter table public.ia_conversas enable row level security;
-- Ler é de todo mundo que entra: a resposta da IA sobre o acervo é informação
-- da equipe, e é isso que ele quer ao pôr os colegas no CRM.
drop policy if exists ia_conversas_leitura on public.ia_conversas;
create policy ia_conversas_leitura on public.ia_conversas for select to authenticated using (true);
drop policy if exists ia_conversas_escrita on public.ia_conversas;
create policy ia_conversas_escrita on public.ia_conversas for all to authenticated
  using (public.fam_pode_escrever()) with check (public.fam_pode_escrever());

-- ── 2. AS MENSAGENS ─────────────────────────────────────────────────────────
create table if not exists public.ia_mensagens (
  -- Do disco: "motor:<conversa>:<índice>". O jsonl é append-only, então o
  -- índice não muda e o upsert nunca duplica uma fala já espelhada.
  id           text primary key,
  conversa_id  text not null references public.ia_conversas(id) on delete cascade,
  quem         text not null check (quem in ('marco', 'ia', 'pessoa')),
  texto        text not null,
  em           timestamptz not null,
  segundos     integer,
  -- quem escreveu, quando a fala nasce no CRM e não no notebook dele
  autor_nome   text,
  origem       text not null default 'motor' check (origem in ('crm', 'motor')),
  pedido_id    uuid references public.ia_pedidos(id) on delete set null
);
comment on table public.ia_mensagens is
  'O fio de cada conversa com a IA de Gestão. Espelho do conversa.jsonl do notebook; quando a resposta passar a vir da API, entra aqui com origem=crm e a tela não muda.';

create index if not exists ia_mensagens_fio_idx on public.ia_mensagens (conversa_id, em);

alter table public.ia_mensagens enable row level security;
drop policy if exists ia_mensagens_leitura on public.ia_mensagens;
create policy ia_mensagens_leitura on public.ia_mensagens for select to authenticated using (true);
drop policy if exists ia_mensagens_escrita on public.ia_mensagens;
create policy ia_mensagens_escrita on public.ia_mensagens for all to authenticated
  using (public.fam_pode_escrever()) with check (public.fam_pode_escrever());

-- ── 3. O PEDIDO SABE EM QUE CONVERSA CAIU ───────────────────────────────────
alter table public.ia_pedidos
  add column if not exists conversa_id text references public.ia_conversas(id) on delete set null;
create index if not exists ia_pedidos_conversa_idx
  on public.ia_pedidos (conversa_id, criado_em) where conversa_id is not null;

-- ── 4. AO VIVO ──────────────────────────────────────────────────────────────
-- A resposta chega sozinha na tela de quem perguntou, e na de quem está olhando.
do $$
declare t text;
begin
  foreach t in array array['ia_conversas','ia_mensagens'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;
