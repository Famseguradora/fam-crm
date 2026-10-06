-- ============================================================================
--  O RETORNO DA ANÁLISE  ·  06/10/2026
--
--  Pedido do Marco: a linha do raciocínio é ENTRADA (o e-mail que abriu o
--  caso) -> PROCESSAMENTO (cadastro e análise de crédito) -> RESPOSTA. A
--  resposta é um texto pronto, gravado no caso e no tomador, que os colegas
--  veem no sistema e que ele COPIA para responder pelo Outlook.
--
--  O SISTEMA SÓ LÊ E-MAIL (ordem de 06/10/2026, até segunda ordem dele): nada
--  aqui responde, rascunha ou envia. O "respondido" é anotado à mão, ou
--  percebido pelo Carteiro LENDO os Itens Enviados da caixa.
--
--  Uma linha por (análise, caso): a mesma análise pode responder a dois
--  casos (IDU 32 tem dois), e cada e-mail de entrada tem a sua resposta.
--  Análise sem caso (acervo) tem uma linha com caso nulo.
--
--  Dois textos: o da CORRETORA (o que pode sair da FAM: decisão, limite,
--  taxas, condições, o que falta) e o da EQUIPE (mais score, rating, Serasa,
--  pontos de atenção e a conclusão inteira).
--
--  Rollback: drop table public.analise_retornos;
-- ============================================================================

create table if not exists public.analise_retornos (
  id               uuid primary key default gen_random_uuid(),
  analise_id       uuid not null references public.analises(id) on delete cascade,
  caso_id          uuid references public.casos(id) on delete set null,
  analise_fila_id  uuid references public.analise_fila(id) on delete set null,
  tomador_id       uuid references public.tomadores(id) on delete set null,
  email_caixa_id   uuid references public.emails_caixa(id) on delete set null,

  texto_corretora  text not null,
  texto_equipe     text not null,
  pendencias       text[] not null default '{}',

  gerado_em        timestamptz not null default now(),
  gerado_por       text not null,
  editado_em       timestamptz,
  editado_por      text,

  avisados         integer not null default 0,

  respondido_em    timestamptz,
  respondido_por   text,
  respondido_como  text check (respondido_como in ('manual', 'detectado')),
  resposta_conferida_em timestamptz,

  criado_em        timestamptz not null default now()
);

create unique index if not exists analise_retornos_por_caso
  on public.analise_retornos (analise_id, caso_id) where caso_id is not null;
create unique index if not exists analise_retornos_sem_caso
  on public.analise_retornos (analise_id) where caso_id is null;
create index if not exists analise_retornos_caso_idx on public.analise_retornos (caso_id);
create index if not exists analise_retornos_tomador_idx on public.analise_retornos (tomador_id);

alter table public.analise_retornos enable row level security;

-- Lê quem lê a análise: o texto é a análise resumida.
drop policy if exists analise_retornos_leitura on public.analise_retornos;
create policy analise_retornos_leitura on public.analise_retornos
  for select to authenticated using (fam_ve_analise());

-- Sem policy de escrita: gerar, editar e marcar respondido passam pela rota
-- /api/retornos, que confere quem é antes de gravar com a chave de serviço.

-- 06/10/2026, depois da revisão: "Desfazer o respondido" à mão para de
-- perguntar ao Outlook. Sem isto o Carteiro marcaria de novo em 20 minutos.
alter table public.analise_retornos add column if not exists nao_conferir boolean not null default false;
