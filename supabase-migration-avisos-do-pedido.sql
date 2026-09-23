-- ============================================================================
--  OS AVISOS DA LINHA DO TEMPO DO PEDIDO  ·  17/09/2026
--
--  Pedido do Marco: "quando chega, avisa que recebemos e vamos iniciar as
--  tratativas; passo seguinte triagem/cadastro; outro nó: análise de crédito;
--  outro nó: subscrição". Com a ordem dele por padrão, e uma chave de envio
--  automático por nó. A validação começa com a equipe interna.
--
--  DE ONDE VEM O GATILHO, e por que NÃO se cria trilha nova: as transições já
--  são gravadas por gatilho no banco. `email_fluxo_eventos` cobre o e-mail, o
--  caso e a fila da análise; `fam_historico` cobre a mudança de status da
--  operação (a subscrição). O aviso é DERIVADO dessas duas trilhas por
--  `lib/avisos/varrer.ts`, e não por um gatilho novo: assim o aviso também
--  nasce do que acontece fora do servidor (o notebook), que é a maior parte.
--
--  A IDEMPOTÊNCIA É A REGRA CENTRAL: `chave` é única. A mesma transição lida
--  duas vezes (e a varredura roda a cada minuto) nunca vira dois e-mails.
--
--  ROLLBACK:
--    drop table if exists public.avisos_pedido;
--    drop table if exists public.aviso_regras;
-- ============================================================================

-- ── a régua: um nó por linha, e a chave do automático mora aqui ─────────────
create table if not exists public.aviso_regras (
  no              text primary key check (no in ('recebido', 'triagem', 'analise_iniciada', 'analise_concluida', 'subscricao')),
  ordem           integer not null,
  titulo          text not null,
  ligado          boolean not null default true,
  -- 'pedir' = nasce esperando a ordem dele. 'automatico' = sai sozinho.
  modo            text not null default 'pedir' check (modo in ('pedir', 'automatico')),
  -- Para quem vai. Lista fixa, editada na tela. Vazia: o aviso nasce e avisa que falta destinatário.
  destinatarios   text[] not null default '{}',
  assunto         text not null,
  texto           text not null,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text
);

-- ── um aviso por transição, com recibo ──────────────────────────────────────
create table if not exists public.avisos_pedido (
  id               uuid primary key default gen_random_uuid(),
  no               text not null references public.aviso_regras(no),
  /* A prova de que esta transição já virou aviso. Ex.: 'analise_concluida:<fila_id>'. */
  chave            text not null unique,
  caso_id          uuid references public.casos(id) on delete set null,
  analise_fila_id  uuid references public.analise_fila(id) on delete set null,
  operacao_id      uuid references public.operacoes(id) on delete set null,
  tomador_id       uuid references public.tomadores(id) on delete set null,
  email_caixa_id   uuid references public.emails_caixa(id) on delete set null,
  empresa          text,
  cnpj             text,
  destinatarios    text[] not null default '{}',
  assunto          text not null,
  corpo            text not null,
  /* a_autorizar -> autorizado -> enviando -> enviado | erro | cancelado */
  estado           text not null default 'a_autorizar'
                   check (estado in ('a_autorizar', 'autorizado', 'enviando', 'enviado', 'cancelado', 'erro')),
  modo             text not null check (modo in ('pedir', 'automatico')),
  /* Como o Outlook entregou: rascunho na pasta dele, ou enviado de verdade. */
  entregue_como    text check (entregue_como in ('rascunho', 'enviado')),
  autorizado_por   text,
  autorizado_em    timestamptz,
  enviado_em       timestamptz,
  erro             text,
  maquina          text,
  ocorrido_em      timestamptz not null,
  criado_em        timestamptz not null default now()
);

create index if not exists avisos_pedido_estado_idx on public.avisos_pedido (estado, criado_em);
create index if not exists avisos_pedido_caso_idx on public.avisos_pedido (caso_id);
create index if not exists avisos_pedido_tomador_idx on public.avisos_pedido (tomador_id);

alter table public.aviso_regras enable row level security;
alter table public.avisos_pedido enable row level security;

-- Ler é de todo mundo que entra no CRM (é trabalho da casa, não e-mail pessoal).
drop policy if exists "Autenticados leem a regua de avisos" on public.aviso_regras;
create policy "Autenticados leem a regua de avisos" on public.aviso_regras
  for select to authenticated using (true);

-- A régua (quem recebe, e o automático) é decisão do proprietário. Ligar envio
-- automático em nome da FAM não é ajuste de tela.
drop policy if exists "So o proprietario muda a regua de avisos" on public.aviso_regras;
create policy "So o proprietario muda a regua de avisos" on public.aviso_regras
  for update to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.proprietario))
  with check (exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.proprietario));

drop policy if exists "Autenticados leem os avisos" on public.avisos_pedido;
create policy "Autenticados leem os avisos" on public.avisos_pedido
  for select to authenticated using (true);

-- Autorizar, editar o texto e cancelar: quem já pode escrever no CRM.
drop policy if exists "Quem escreve autoriza o aviso" on public.avisos_pedido;
create policy "Quem escreve autoriza o aviso" on public.avisos_pedido
  for update to authenticated using (fam_pode_escrever()) with check (fam_pode_escrever());

-- Quem CRIA aviso é a varredura (service role). Ninguém inventa aviso pela tela.

-- ── os cinco nós, com o texto que já tinha sido aprovado ───────────────────
insert into public.aviso_regras (no, ordem, titulo, assunto, texto, modo) values
  ('recebido', 1, 'Recebemos o pedido',
   'Recebemos o pedido de garantia · {empresa}',
   E'Olá, {saudacao}\n\nRecebemos o pedido de {empresa} e já iniciamos as tratativas.\n\nComo funciona daqui em diante:\n\n1. Conferência dos documentos recebidos\n2. Cadastro e triagem\n3. Análise de crédito\n4. Subscrição\n\nVocê recebe um aviso a cada passo. Se faltar documento para seguir, entramos em contato antes.\n\nAtenciosamente,',
   'pedir'),
  ('triagem', 2, 'Triagem e cadastro concluídos',
   'Triagem concluída · {empresa}',
   E'Olá, {saudacao}\n\nA triagem e o cadastro de {empresa} foram concluídos em {data}. Os documentos foram conferidos e o pedido seguiu para a análise de crédito.\n\nAtenciosamente,',
   'pedir'),
  ('analise_iniciada', 3, 'Análise de crédito iniciada',
   'Análise de crédito iniciada · {empresa}',
   E'Olá, {saudacao}\n\nA análise de crédito de {empresa} foi iniciada em {data}.\n\nNesta etapa são lidos os balanços, o Serasa e o contrato social, calculados o Score e o Rating FAM e feito o enquadramento no contrato de resseguro.\n\nAtenciosamente,',
   'pedir'),
  ('analise_concluida', 4, 'Análise de crédito concluída',
   'Análise de crédito concluída · {empresa}',
   E'Olá, {saudacao}\n\nA análise de crédito de {empresa} foi concluída em {data}. O pedido segue para a subscrição.\n\nAtenciosamente,',
   'pedir'),
  ('subscricao', 5, 'Subscrição iniciada',
   'Subscrição iniciada · {empresa}',
   E'Olá, {saudacao}\n\nA operação de {empresa} entrou na mesa de subscrição em {data}.\n\nAtenciosamente,',
   'pedir')
on conflict (no) do nothing;
