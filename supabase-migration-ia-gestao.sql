-- ============================================================================
--  A IA DE GESTÃO DENTRO DO CRM  (08/09/2026)
--
--  Porta para o CRM o `gestao.mjs` do Sistema de Análise: a IA que olha o
--  ACERVO INTEIRO (e não uma análise), compara e responde sobre o conjunto.
--
--  DOIS MOTORES, ordem dele em 08/09/2026 ("no meu notebook e no servidor
--  posteriormente; programa assim, mas agora usaremos via o Notebook"):
--
--    notebook  o CRM guarda a pergunta, o agente da máquina dele responde com o
--              claude.exe da assinatura. Gasto de IA: zero. É o que vale HOJE.
--    servidor  a mesma pergunta respondida pela API, para funcionar no celular
--              e para a equipe. Fica programado e DESLIGADO até ele mandar.
--
--  Uma tabela só, com a coluna `motor` dizendo quem respondeu. Trocar de motor
--  é mudar essa palavra, e não reescrever a tela.
--
--  ADITIVO: não altera nem apaga nada.
-- ============================================================================

begin;

create table if not exists public.ia_pedidos (
  id                  uuid primary key default gen_random_uuid(),

  -- o que foi perguntado, e sobre o quê
  pergunta            text not null,
  assunto             text,
  -- 'gestao' é a IA do acervo. O campo existe porque o auditor de UMA análise
  -- (o `ia.mjs` dele) é outro bicho, e um dia vai passar por aqui também.
  escopo              text not null default 'gestao'
                      check (escopo in ('gestao', 'analise')),
  analise_id          uuid references public.analises(id) on delete set null,

  -- quem responde
  motor               text not null default 'notebook'
                      check (motor in ('notebook', 'servidor')),
  estado              text not null default 'pendente'
                      check (estado in ('pendente', 'respondendo', 'pronta', 'erro', 'cancelada')),
  maquina             text,

  resposta            text,
  erro                text,
  -- o que custou, quando for pela API. No notebook fica nulo, e é essa a graça.
  tokens_entrada      integer,
  tokens_saida        integer,

  criado_por_auth_id  uuid,
  criado_por_nome     text,
  criado_em           timestamptz not null default now(),
  pegue_em            timestamptz,
  respondido_em       timestamptz
);

comment on table public.ia_pedidos is
  'Perguntas feitas à IA de Gestão pelo CRM. O agente do notebook busca as pendentes e responde com o claude.exe da assinatura; quando o motor for "servidor", quem responde é a API.';
comment on column public.ia_pedidos.motor is
  'Quem responde: "notebook" (claude.exe da máquina dele, custo zero) ou "servidor" (API, custo por token). Trocar aqui não muda a tela.';

create index if not exists ia_pedidos_pendentes_idx
  on public.ia_pedidos (criado_em) where estado in ('pendente', 'respondendo');
create index if not exists ia_pedidos_recentes_idx
  on public.ia_pedidos (criado_em desc);

alter table public.ia_pedidos enable row level security;

-- Ler é de todo mundo que entra: a resposta da IA sobre o acervo é informação
-- da equipe, não do dono da pergunta.
drop policy if exists ia_pedidos_select on public.ia_pedidos;
create policy ia_pedidos_select on public.ia_pedidos
  for select to authenticated using (true);

-- Perguntar é de quem escreve no CRM. Quem RESPONDE é o agente, com a chave de
-- serviço, e por isso não precisa de policy de update para ninguém.
drop policy if exists ia_pedidos_insert on public.ia_pedidos;
create policy ia_pedidos_insert on public.ia_pedidos
  for insert to authenticated with check (public.fam_pode_escrever());

commit;
