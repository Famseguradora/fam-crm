-- ============================================================================
--  A ESTEIRA DA ANALISE DE CREDITO, DENTRO DO CRM  (07/09/2026)
--
--  Ordem do Marco: "a analise de credito sera feita atraves do meu notebook, eu
--  so quero que seja dentro do CRM FAM e nao no sistema analise de credito".
--
--  A DIVISAO, que e a mesma do Carteiro que ficou de pe hoje:
--    o NOTEBOOK roda o motor (claude.exe pela assinatura, OCR, PDF do OneDrive);
--    o CRM tem a TELA, o BANCO e a DECISAO.
--  Nenhuma chave de API entra no servidor. O gasto de IA continua zero: quem
--  responde e o binario do Claude Code na maquina dele, sem servico contratado.
--
--  O QUE ESTA TABELA E, E O QUE ELA NAO E
--  ---------------------------------------------------------------------------
--  `analises` (65 colunas, 146 linhas) e o RESULTADO de uma analise: score,
--  rating, limite, 3 C's, Serasa. Ela nao tem, e nao vai ter, estado de esteira.
--
--  `analise_fila` e o ANDAMENTO: uma linha por analise em curso, com a situacao,
--  o hash dos documentos, a trava e a etapa. E o `_status.json` do motor, que
--  vivia como arquivo no disco de uma maquina so.
--
--  Separar as duas nao e preciosismo: analise concluida vira historico e nunca
--  mais muda; andamento muda a cada minuto. Juntas, a tabela de historico ficaria
--  sendo reescrita o dia inteiro.
--
--  A CHAVE E A PASTA, e nao o CNPJ nem a razao social. Motivo medido: quem
--  batiza a pasta e a ANALISE, nao a triagem, entao a razao social so aparece
--  depois. O CNPJ falta em 5 das 146 analises e em 211 dos 558 tomadores. A
--  pasta e o unico identificador que existe desde o primeiro segundo.
--  Quando a analise renomeia a pasta, quem atualiza esta coluna e o agente, que
--  e quem sabe o nome velho e o novo.
--
--  ADITIVO: nao altera nenhuma tabela existente, nao apaga nada.
-- ============================================================================

create table if not exists public.analise_fila (
  id             uuid primary key default gen_random_uuid(),

  -- ── de onde veio ─────────────────────────────────────────────────────────
  -- O caso da Triagem que virou esta analise. Nulo quando a analise nasceu
  -- direto de uma pasta do acervo (refazer uma antiga, por exemplo).
  caso_id        uuid references public.casos(id) on delete set null,

  -- O resultado, quando existir. Ate concluir, e nulo.
  analise_id     uuid references public.analises(id) on delete set null,

  -- Preenchidos QUANDO HOUVER, e nunca exigidos: as 146 analises de hoje estao
  -- com tomador_id nulo e quem amarra e a `chave_local`. Consertar aquilo e
  -- frente propria; esta tabela nao depende disso para funcionar.
  tomador_id     uuid references public.tomadores(id) on delete set null,
  cnpj           text,
  razao_social   text,
  chave_local    text,

  -- A CHAVE DE VERDADE. Ver o cabecalho.
  pasta          text not null unique,

  -- ── o andamento ──────────────────────────────────────────────────────────
  situacao       text not null default 'pendente'
                 check (situacao in ('aguardando_documentos','bloqueada_documentos',
                                     'pendente','em_andamento','aguardando_resposta',
                                     'pausada','concluida','erro')),
  -- A frase que a tela mostra. Vem pronta do `avaliar()`, porque quem sabe por
  -- que a analise esta parada e quem olhou a pasta, nao quem desenha a tela.
  motivo         text,

  etapa          text,
  etapa_texto    text,
  etapa_em       timestamptz,

  -- O HASH DO CONJUNTO de documentos. E ele que decide refazer ou nao: analise
  -- concluida com hash igual nunca volta atras. `analise_documentos.hash16` e
  -- por ARQUIVO e serve para outra coisa (e esta com zero linhas ate hoje).
  hash_documentos text,
  documentos     integer not null default 0,
  documentos_faltando text[] not null default '{}',

  -- ── a trava ──────────────────────────────────────────────────────────────
  -- No motor e um arquivo com o PID. Aqui e a maquina dizendo que continua viva
  -- (`trava_em` e renovado a cada progresso). O teste pelo relogio sozinho
  -- errava para os dois lados: execucao morta segurava a pasta por 45 minutos, e
  -- execucao viva que passasse disso podia rodar duas vezes.
  trava_maquina  text,
  trava_pid      integer,
  trava_em       timestamptz,

  -- ── a ordem que uma PESSOA deu ───────────────────────────────────────────
  -- Intencao, nao execucao: o CRM nunca fala com a maquina de ninguem. A ordem
  -- fica aqui e o agente do notebook vem busca-la. Mesmo desenho do Carteiro.
  ordem          text check (ordem is null or ordem in ('iniciar','pausar','retomar','parar')),
  ordem_em       timestamptz,
  ordem_por      text,

  erro           text,
  pausada_motivo text,

  -- A pergunta que o motor fez e que trava a analise ate alguem responder.
  pedido_id      uuid references public.analise_pedidos(id) on delete set null,

  criado_em      timestamptz not null default now(),
  criado_por     text,
  atualizado_em  timestamptz not null default now(),
  concluido_em   timestamptz
);

comment on table public.analise_fila is
  'O ANDAMENTO de uma analise de credito (o _status.json do motor, agora no banco). O RESULTADO fica em `analises`. A chave e a pasta, porque o CNPJ e a razao social so aparecem depois que a analise identifica a empresa.';

comment on column public.analise_fila.hash_documentos is
  'Hash do CONJUNTO de documentos da pasta. Concluida com hash igual nunca e refeita: e a trava contra rodar de novo a mesma coisa.';

comment on column public.analise_fila.ordem is
  'O que uma PESSOA pediu, esperando o agente do notebook executar. Intencao, nao execucao.';

create index if not exists analise_fila_situacao_idx on public.analise_fila (situacao, atualizado_em desc);
create index if not exists analise_fila_ordem_idx on public.analise_fila (ordem) where ordem is not null;
create index if not exists analise_fila_caso_idx on public.analise_fila (caso_id) where caso_id is not null;
create index if not exists analise_fila_tomador_idx on public.analise_fila (tomador_id) where tomador_id is not null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Leitura: todo mundo autenticado. A esteira e trabalho da empresa, e ver o
-- trabalho acontecer e o ponto da tela.
-- Escrita: `fam_pode_escrever()`, a mesma trava de `casos` e `anexos`. O agente
-- do notebook nao entra por aqui: escreve por rota server-side com segredo e
-- service role, como o Carteiro e o /api/analise/evento.
alter table public.analise_fila enable row level security;

drop policy if exists analise_fila_leitura on public.analise_fila;
create policy analise_fila_leitura on public.analise_fila
  for select to authenticated using (true);

drop policy if exists analise_fila_escrita on public.analise_fila;
create policy analise_fila_escrita on public.analise_fila
  for all to authenticated
  using (fam_pode_escrever()) with check (fam_pode_escrever());

drop trigger if exists analise_fila_atualizado_em on public.analise_fila;
create trigger analise_fila_atualizado_em before update on public.analise_fila
  for each row execute function public.emails_caixa_toca_atualizado_em();

-- ── O caso sabe que virou analise ───────────────────────────────────────────
-- Os dois lados se apontam, como `casos` e `emails_caixa` ja fazem. Sem isto,
-- abrir um caso e perguntar "e a analise dele?" obrigaria a varrer a fila.
alter table public.casos add column if not exists analise_fila_id uuid
  references public.analise_fila(id) on delete set null;
create index if not exists casos_analise_fila_idx
  on public.casos (analise_fila_id) where analise_fila_id is not null;
