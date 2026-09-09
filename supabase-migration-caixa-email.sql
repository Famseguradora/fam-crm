-- ============================================================================
--  A CAIXA DE ENTRADA DENTRO DO CRM  (07/09/2026)
--
--  Porta a tela "Caixa de entrada" do Sistema de Analise de Credito (o Carteiro,
--  _sistema/cockpit/outlook.html) para dentro do CRM, com UM banco so.
--
--  A REGRA DE DESENHO, e ela e a razao desta tabela existir:
--  a TELA le UMA tabela. Quem ENCHE a tabela e substituivel:
--
--     cano A (principal)  o Carteiro local le o Outlook classico por COM e
--                         empurra os cabecalhos para ca (origem='outlook')
--     cano B (redundante) o upload de .msg/.eml que ja existe no Comercial,
--                         que nao depende de maquina nenhuma (origem='upload')
--     cano C (futuro)     Microsoft Graph, sem mexer numa linha da tela
--                         (origem='graph')
--
--  Ordem do Marco em 07/09/2026: "sempre temos que ter a estrada principal e a
--  redundante, ou seja, caso a opcao 1 de problema, a opcao 2 nao deixa a
--  empresa parar". Por isso `origem` nasce na tabela, e nao no codigo.
--
--  O QUE SOBE E O QUE NAO SOBE (decisao dele, 07/09/2026):
--  sobe o CABECALHO e a PREVIA. O corpo inteiro e os anexos ficam na maquina
--  ate ele ABRIR o e-mail (corpo) ou clicar em TRAZER (anexos). O Supabase nao
--  vira copia da caixa de entrada dele.
--
--  ADITIVO: nao altera nenhuma tabela existente, nao apaga nada.
-- ============================================================================

-- ── 1. A caixa ──────────────────────────────────────────────────────────────
create table if not exists public.emails_caixa (
  id             uuid primary key default gen_random_uuid(),

  -- de qual cano veio. Ver o cabecalho: a tela nao pergunta, mas a auditoria sim.
  origem         text not null default 'outlook'
                 check (origem in ('outlook','upload','graph')),

  -- IDENTIDADE, e ela e dupla de proposito.
  -- `entry_id` e a identidade DENTRO do Outlook (assunto repete, data repete,
  -- EntryID nao). Mas ele so existe naquela caixa daquela maquina: mover o
  -- e-mail de pasta ja o troca. `message_id` e a identidade do e-mail no mundo,
  -- a mesma no .msg baixado e no Graph, e e ela que impede o mesmo e-mail de
  -- entrar duas vezes por dois canos diferentes.
  entry_id       text,
  message_id     text,

  conta          text,
  pasta          text,

  -- cabecalho (o que a lista mostra)
  assunto        text not null default '(sem assunto)',
  de             text,
  email_de       text,
  para           text,
  copia          text,
  recebido_em    timestamptz,
  nao_lido       boolean not null default false,
  tamanho_kb     integer,

  -- PREVIA, nao o corpo. As primeiras linhas, o suficiente para a lista.
  previa         text,

  -- O CORPO chega depois, quando ele abre o e-mail, e fica em cache aqui para
  -- o segundo clique nao custar outra viagem ate a maquina dele.
  --   corpo_pedido_em  a tela pediu, o Carteiro ainda nao trouxe (e o que a
  --                    tela mostra como "buscando na maquina do Comercial")
  --   corpo_em         chegou
  -- Sao duas colunas e nao uma porque sem separar as duas nao ha como a tela
  -- distinguir "ninguem abriu ainda" de "pedi e estou esperando".
  corpo_pedido_em timestamptz,
  corpo          text,
  corpo_html     text,
  corpo_em       timestamptz,

  -- Os anexos como METADADO: nome, kb e tipo. O arquivo em si so vem no Trazer,
  -- e ai ele vai para `anexos` + Storage, que e a fonte unica de arquivo do CRM.
  anexos         jsonb not null default '[]'::jsonb,
  anexos_uteis   integer not null default 0,

  -- AS REGRAS, ja avaliadas por quem leu a caixa. `motivo` viaja SEMPRE, inclusive
  -- para quem passou: sem ele a tela diria "3 de 27" e ninguem saberia se os
  -- outros 24 eram propaganda ou a analise que ele espera. Regra que nao se
  -- explica vira suspeita.
  serve          boolean not null default true,
  motivo         text,

  -- O ESTADO na tela. As tres abas do sistema atual saem daqui:
  --   Para analise = serve and estado='novo'
  --   Tudo         = tudo
  --   Trazidos     = estado='trazido'
  -- 'a_trazer' e o pedido dele esperando o Carteiro subir o .msg: e o unico
  -- jeito de o botao funcionar sem o CRM falar com 127.0.0.1.
  estado         text not null default 'novo'
                 check (estado in ('novo','tratado','a_trazer','trazido','erro')),
  estado_em      timestamptz,
  estado_por     text,
  estado_erro    text,

  -- O caso que nasceu deste e-mail. Substitui o `_outlook-vistos.json`, e aqui
  -- ele nao expira: no motor o rastro era o CAMINHO da pasta, e a pasta anda.
  caso_id        uuid references public.casos(id) on delete set null,

  -- O rastro do "Pedir o que falta a corretora": quando e como, para nao pedir
  -- duas vezes sem saber.
  pedido_em      timestamptz,
  pedido_modo    text check (pedido_modo is null or pedido_modo in ('rascunho','enviar')),
  pedido_faltam  text[],

  visto_em       timestamptz not null default now(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on table public.emails_caixa is
  'A caixa de entrada do CRM. Guarda CABECALHO e PREVIA; corpo e anexo chegam sob demanda. Enchida por tres canos (Carteiro local, upload, Graph) e lida por uma tela so.';

-- O MESMO E-MAIL NAO ENTRA DUAS VEZES. Dois indices porque as duas identidades
-- podem faltar: e-mail sem Message-ID no cabecalho existe (raro, mas existe), e
-- o que vem por upload nao tem EntryID.
create unique index if not exists emails_caixa_entry_uk
  on public.emails_caixa (entry_id) where entry_id is not null;
create unique index if not exists emails_caixa_message_uk
  on public.emails_caixa (message_id) where message_id is not null;

create index if not exists emails_caixa_lista_idx
  on public.emails_caixa (estado, recebido_em desc);
create index if not exists emails_caixa_serve_idx
  on public.emails_caixa (serve, estado, recebido_em desc);
create index if not exists emails_caixa_caso_idx
  on public.emails_caixa (caso_id) where caso_id is not null;

-- ── 2. As regras do Carteiro ────────────────────────────────────────────────
-- No motor isto era `estado/_outlook.json` no disco. Aqui e uma linha so: o
-- Marco mexe pela tela, e o Carteiro le do banco. Nao existe mais "o JSON e a
-- verdade e o banco e copia".
create table if not exists public.email_regras (
  id                 boolean primary key default true check (id),

  ligado             boolean not null default false,
  pasta              text not null default '',
  so_com_anexo       boolean not null default true,
  so_nao_lidos       boolean not null default false,
  dias_para_tras     integer not null default 3 check (dias_para_tras between 1 and 365),
  max_por_rodada     integer not null default 40 check (max_por_rodada between 1 and 400),
  remetentes         text[] not null default '{}',
  assunto_contem     text[] not null default '{}',
  assunto_ignora     text[] not null default
                     '{"fora do escritório","out of office","automatic reply","entrega falhou","undeliverable"}',

  -- DESLIGADO de fabrica, e continua sendo decisao dele ligar. A diferenca entre
  -- um funcionario que mexe na sua caixa sem avisar e um que bate na porta com
  -- os papeis na mao.
  acolher_sozinho    boolean not null default false,

  -- Isto e SO A SUGESTAO da caixinha, e nunca o que decide o envio. Quem decide
  -- e o clique, que viaja junto do pedido. Ordem dele em 29/08/2026: "a mensagem
  -- so pode ser enviada com a minha autorizacao... isso e PRIORIDADE".
  -- Configuracao e um estado que alguem ligou um dia e ninguem mais olhou.
  responder_ao_trazer text not null default 'nao'
                      check (responder_ao_trazer in ('nao','rascunho','enviar')),
  resposta_assunto   text not null default '',
  resposta_texto     text not null default '',
  pedido_texto       text not null default '',

  atualizado_em      timestamptz not null default now(),
  atualizado_por     text
);

comment on table public.email_regras is
  'Uma linha so. As regras do Carteiro, que no motor viviam em estado/_outlook.json. responder_ao_trazer e sugestao da caixinha, nunca autorizacao.';

insert into public.email_regras (id) values (true) on conflict (id) do nothing;

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
-- Leitura: todo mundo autenticado (a equipe acompanha o trabalho acontecer).
-- Escrita: `fam_pode_escrever()`, a mesma trava de `anexos` e `casos`.
-- Nunca `USING (true)` para `public`: `public` inclui `anon`, e a chave publica
-- do bundle passaria. O Carteiro nao entra por aqui: ele escreve por rota
-- server-side com service role e segredo, como o /api/analise/evento.
alter table public.emails_caixa enable row level security;
alter table public.email_regras enable row level security;

drop policy if exists emails_caixa_leitura on public.emails_caixa;
create policy emails_caixa_leitura on public.emails_caixa
  for select to authenticated using (true);
drop policy if exists emails_caixa_escrita on public.emails_caixa;
create policy emails_caixa_escrita on public.emails_caixa
  for all to authenticated using (fam_pode_escrever()) with check (fam_pode_escrever());

drop policy if exists email_regras_leitura on public.email_regras;
create policy email_regras_leitura on public.email_regras
  for select to authenticated using (true);
drop policy if exists email_regras_escrita on public.email_regras;
create policy email_regras_escrita on public.email_regras
  for all to authenticated using (fam_pode_escrever()) with check (fam_pode_escrever());

-- ── 4. atualizado_em ────────────────────────────────────────────────────────
create or replace function public.emails_caixa_toca_atualizado_em()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists emails_caixa_atualizado_em on public.emails_caixa;
create trigger emails_caixa_atualizado_em before update on public.emails_caixa
  for each row execute function public.emails_caixa_toca_atualizado_em();

drop trigger if exists email_regras_atualizado_em on public.email_regras;
create trigger email_regras_atualizado_em before update on public.email_regras
  for each row execute function public.emails_caixa_toca_atualizado_em();

-- ── 5. O catalogo passa a saber se reconhecer pelo nome do arquivo ──────────
-- No motor isso era uma SEGUNDA lista, em codigo, dentro do cockpit/outlook.html
-- (a constante DOCS, com 6 documentos e uma expressao regular cada). O catalogo
-- do CRM ja dizia O QUE a politica exige; faltava dizer COMO reconhecer aquilo
-- num anexo. Com as duas listas separadas, a caixa cobrava um documento e a
-- triagem cobrava outro.
--
-- Fica na TABELA, e nao no codigo, pelo mesmo motivo que o resto do catalogo:
-- a politica de credito muda sem deploy. Sao PEDACOS DE TEXTO, e nao expressao
-- regular, de proposito: quem edita isso e a area de credito, e uma regex mal
-- escrita numa tela derruba o casamento de todos os documentos.
alter table public.caso_item_catalogo
  add column if not exists padroes_nome text[] not null default '{}';

comment on column public.caso_item_catalogo.padroes_nome is
  'Pedacos de texto que, achados no NOME do anexo (minusculo e sem acento), contam como este documento. Vazio = so o humano marca.';

update public.caso_item_catalogo set padroes_nome =
  '{balanco,balanço,demonstra,dre,sped,ecd,contabil,contábil}'
  where id = 'demonstracoes_2_exercicios' and padroes_nome = '{}';
update public.caso_item_catalogo set padroes_nome =
  '{serasa,score,boa vista,boavista,concentre}'
  where id = 'serasa_pj' and padroes_nome = '{}';
update public.caso_item_catalogo set padroes_nome =
  '{contrato social,contrato_social,estatuto,consolida,alteracao contratual}'
  where id = 'contrato_social' and padroes_nome = '{}';
update public.caso_item_catalogo set padroes_nome =
  '{balancete,faturamento,receita}'
  where id = 'demonstracao_ano_corrente' and padroes_nome = '{}';

-- ── 6. O caso passa a saber de qual e-mail nasceu ───────────────────────────
-- Os dois lados se apontam: da caixa para o caso (`emails_caixa.caso_id`) e do
-- caso para a caixa. Sem isto, abrir um caso e perguntar "de onde isso veio"
-- obrigaria a varrer a caixa inteira.
alter table public.casos add column if not exists email_caixa_id uuid
  references public.emails_caixa(id) on delete set null;
create index if not exists casos_email_caixa_idx
  on public.casos (email_caixa_id) where email_caixa_id is not null;
