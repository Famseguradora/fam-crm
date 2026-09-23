-- ============================================================================
--  O REGISTRO DO CRM NO MICROSOFT 365, FEITO PELA TELA  ·  23/09/2026
--  (JÁ APLICADA em produção nesta data, pelo nome `ms_app_registro`)
--
--  Ordem do Marco: "não sou o admin dessa conta de e-mails... isso tem que ser
--  feito para todos os usuários, vão acessar somente o CRM e pronto".
--
--  O QUE ISTO DESMONTA: antes, o registro era um `.cmd` na máquina dele, que
--  escrevia variáveis de ambiente num arquivo. A equipe usa o CRM PUBLICADO,
--  que não lê arquivo de máquina nenhuma — aquilo nunca serviria para eles.
--  Agora o registro mora no banco, e vale para os dois no mesmo instante.
--
--  AS VARIÁVEIS DE AMBIENTE CONTINUAM VALENDO como plano B (`configMS`, em
--  lib/ms/graph.ts): quem já as tinha não perde nada.
--
--  NENHUMA DAS DUAS TABELAS TEM POLICY, e isso é a trava, não esquecimento:
--  com RLS ligada e sem policy, nenhuma sessão de navegador lê nem escreve —
--  nem a do dono da linha. Só o servidor, com a chave de serviço, nas rotas
--  /api/ms/*. Segredo de aplicativo não é dado de tela.
--
--  ROLLBACK:
--    drop table if exists public.ms_registro_pendente;
--    drop table if exists public.ms_app;
-- ============================================================================

begin;

create table if not exists public.ms_app (
  -- Uma linha só: um CRM, um aplicativo.
  id              text primary key default 'fam' check (id = 'fam'),
  tenant_id       text not null,
  client_id       text not null,
  -- O segredo do aplicativo, cifrado em AES-256-GCM (lib/ms/graph.ts).
  secret_cifrado  text not null,
  -- Até quando o segredo vale: a tela avisa antes de vencer.
  secret_expira   timestamptz,
  -- O administrador aprovou para a empresa inteira? Sem isso, cada pessoa
  -- autoriza a própria caixa (quando o inquilino permite).
  consentido      boolean not null default false,
  registrado_por  text,
  registrado_em   timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

comment on table public.ms_app is
  'O aplicativo do CRM no Entra ID da FAM (client id + segredo cifrado). Escrito pela tela de configuração; lido só pelo servidor.';

/* O login da Microsoft acontece em duas etapas — o código aparece na tela e o
   servidor pergunta de cinco em cinco segundos se a pessoa já terminou. Entre
   uma requisição e outra não há memória que sobreviva em produção, então o
   código em andamento precisa morar aqui. A linha some assim que termina. */
create table if not exists public.ms_registro_pendente (
  id           text primary key default 'fam' check (id = 'fam'),
  device_code  text not null,
  user_code    text not null,
  verificacao  text not null,
  intervalo    integer not null default 5,
  expira_em    timestamptz not null,
  pedido_por   text,
  pedido_auth  uuid,
  criado_em    timestamptz not null default now()
);

comment on table public.ms_registro_pendente is
  'O login da Microsoft em andamento, enquanto a pessoa digita o código. Some assim que o registro termina.';

alter table public.ms_app enable row level security;
alter table public.ms_registro_pendente enable row level security;

-- Nenhuma policy, de propósito. Ver o cabeçalho.
revoke all on public.ms_app from anon, authenticated;
revoke all on public.ms_registro_pendente from anon, authenticated;

commit;
