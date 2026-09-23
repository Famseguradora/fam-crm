-- ============================================================================
--  A CAIXA DO OUTLOOK LIGADA AO CRM, uma pessoa por vez  ·  23/09/2026
--
--  Pedido do Marco: "quando algum colega for enviar alguma análise para eu
--  fazer, basta ele arrastar o e-mail para dentro do sistema".
--
--  O Novo Outlook não entrega o ARQUIVO do e-mail para o navegador — entrega o
--  identificador dele. Com o identificador, o Microsoft Graph devolve o e-mail
--  inteiro. Para isso o CRM precisa de permissão, e a permissão é de CADA UM
--  sobre a PRÓPRIA caixa: a pessoa faz o login da Microsoft, vê o que está
--  autorizando, e o consentimento dela fica guardado aqui.
--
--  NÃO HÁ AQUI UMA CHAVE QUE LEIA A CAIXA DE TODO MUNDO. Seria mais fácil de
--  programar (uma permissão de aplicativo, um segredo só) e seria exatamente a
--  porta dos fundos que a varredura de segurança de 22/09 fechou em outro
--  canto. Mesmo princípio de "quem liga a caixa é o dono".
--
--  O QUE ESTA TABELA GUARDA é o `refresh_token` CIFRADO (AES-256-GCM, ver
--  lib/ms/graph.ts). O token de acesso, que vale uma hora, nunca é gravado.
--
--  ELA NÃO TEM POLICY NENHUMA, e isso é a trava, não um esquecimento: com RLS
--  ligada e sem policy, nenhuma sessão de navegador lê ou escreve aqui, nem a
--  do dono da linha. Só o servidor chega, com a chave de serviço, nas rotas
--  /api/ms/*. Token de e-mail não é dado de tela.
--
--  ROLLBACK:
--    drop table if exists public.ms_conexoes;
-- ============================================================================

begin;

create table if not exists public.ms_conexoes (
  -- Uma conexão por pessoa do CRM. Reconectar substitui a anterior.
  auth_id         uuid primary key references auth.users(id) on delete cascade,
  -- A caixa que foi conectada, em minúsculas. É a trava da busca: só busco
  -- e-mail cuja caixa de origem seja esta.
  conta           text not null,
  nome            text,
  -- O refresh_token, cifrado. Nunca em texto puro, nunca no navegador.
  refresh_cifrado text not null,
  escopo          text,
  conectado_em    timestamptz not null default now(),
  usado_em        timestamptz,
  -- A última falha, para a tela dizer "reconecte" em vez de um erro cru.
  falha           text
);

comment on table public.ms_conexoes is
  'Consentimento de cada pessoa para o CRM ler a PRÓPRIA caixa do Outlook (Microsoft Graph, permissão delegada). Sem policy de propósito: só o servidor acessa.';
comment on column public.ms_conexoes.refresh_cifrado is
  'refresh_token cifrado em AES-256-GCM (lib/ms/graph.ts). Nunca sai do servidor.';

alter table public.ms_conexoes enable row level security;

-- Nenhuma policy. Ver o cabeçalho: é intencional.
revoke all on public.ms_conexoes from anon, authenticated;

commit;
