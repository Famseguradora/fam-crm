-- ============================================================================
--  E-MAIL VIVO  ·  o pedido de análise vira uma coisa medível  (10/09/2026)
--
--  Ordem do Marco: "Eu preciso do e-mail inteligente. Deve fazer uma análise
--  dos e-mails recebidos, um dashboard visual simples, mas que mostra quantos
--  e-mails recebi com pedido de análise, quantos eu analisei, quantos estão
--  paralisados. (...) não quero mais uma tela de outlook, se fosse isso eu
--  usaria o outlook."
--
--  ---------------------------------------------------------------------------
--  POR QUE NÃO DAVA PARA MEDIR NADA ATÉ AQUI
--  ---------------------------------------------------------------------------
--  A caixa tem 272 e-mails e a régua marcou 111 como "serve". Só 10 viraram
--  caso. Os outros 101 não estão em lugar nenhum: `estado` continua 'novo',
--  ninguém é dono, e não há relógio. Era esse o buraco: a tela mostrava a
--  caixa, e caixa não é fila de trabalho.
--
--  E o pior: `estado` é UMA coluna, sobrescrita. Um e-mail que andou
--  novo -> a_trazer -> erro -> trazido guarda só a hora do último passo. Sem
--  histórico, "quanto tempo cada etapa demora" é impossível.
--
--  ---------------------------------------------------------------------------
--  O QUE ESTA MIGRATION FAZ, E O QUE ELA DE PROPÓSITO NÃO FAZ
--  ---------------------------------------------------------------------------
--  Faz: dá DONO, RELÓGIO e TRILHA ao pedido de análise.
--  Não faz: não cria estado novo em `emails_caixa` (os cinco continuam valendo)
--  e não move nada de lugar. É aditiva. Nenhuma linha existente muda de sentido.
--
--  POR QUE UMA TRILHA PRÓPRIA, e não o `fam_historico` que já existe:
--  o `fam_historico` grava o registro INTEIRO no insert (`snapshot`) e tem RLS
--  `select to authenticated using (true)`. Ligá-lo em `emails_caixa` copiaria
--  assunto, remetente e corpo de e-mail pessoal para uma tabela que os 12
--  usuários do CRM leem. Caixa de e-mail tem RH, médico e família dentro
--  (é a mesma razão de `emails_caixa` já ter RLS por caixa). Então aqui a
--  trilha guarda SÓ a transição: de onde, para onde, quando, por quem. Nada
--  de conteúdo. E a RLS dela é a mesma da caixa de origem.
-- ============================================================================

-- ── 1. O pedido ganha DONO ──────────────────────────────────────────────────
-- "Sem dono" é o critério nº 1 de parado em Front, Intercom e Hiver, e é o
-- mais barato de todos: se ninguém assumiu, ninguém está fazendo. Hoje o CRM
-- não tem essa coluna, e por isso não sabe dizer de quem é cada pedido.
alter table public.emails_caixa
  add column if not exists dono_auth_id uuid,
  add column if not exists dono_nome    text,
  add column if not exists assumido_em  timestamptz;

comment on column public.emails_caixa.dono_auth_id is
  'Quem assumiu este pedido. NULO é "sem dono", que o painel conta como parado.';

-- ── 2. O pedido ganha CLASSIFICAÇÃO ─────────────────────────────────────────
-- `serve` responde "passou na régua da caixa" (tem anexo, remetente interno).
-- NÃO responde "é um pedido de análise". A prova está no banco: 111 servem, 10
-- viraram caso. Sem separar as duas perguntas, o painel contaria 111 pedidos e
-- estaria mentindo.
--
-- Três valores, e o NULO é o que importa: NULO = ninguém decidiu ainda, e é
-- justamente essa a fila que precisa aparecer na tela.
alter table public.emails_caixa
  add column if not exists eh_pedido        boolean,
  add column if not exists classificado_por text,
  add column if not exists classificado_em  timestamptz;

comment on column public.emails_caixa.eh_pedido is
  'É pedido de análise de crédito? NULO = ninguém decidiu (a fila de triagem). Diferente de `serve`, que é só a régua da caixa.';

-- ── 3. O pedido ganha o estado AGUARDANDO ───────────────────────────────────
-- A ideia é do Front e do Zendesk, e é a que separa culpa: "requester wait
-- time" (a bola é nossa) contra "agent wait time" (a bola é do cliente). Um
-- pedido esperando o balanço do tomador há 6 dias está parado, mas a ação é
-- COBRAR, não trabalhar. Pintar os dois de vermelho igual faz o painel acusar
-- a equipe por atraso de terceiro, e aí ninguém confia mais no vermelho.
alter table public.emails_caixa
  add column if not exists aguardando_desde  timestamptz,
  add column if not exists aguardando_motivo text,
  add column if not exists cobrado_em        timestamptz;

comment on column public.emails_caixa.aguardando_desde is
  'Desde quando este pedido espera algo de FORA (documento do tomador, resposta da corretora). Conta como parado, mas com cor e ação diferentes: cobrar.';

-- ── 4. A hora de chegada que não se mexe ────────────────────────────────────
-- `visto_em` é reescrito a CADA varredura (é o "ainda está na caixa"), e
-- `criado_em` depende de o Carteiro não recriar a linha. Para relógio, é
-- preciso um instante que ninguém sobrescreve.
alter table public.emails_caixa
  add column if not exists primeiro_visto_em timestamptz;

update public.emails_caixa
   set primeiro_visto_em = coalesce(recebido_em, criado_em)
 where primeiro_visto_em is null;

alter table public.emails_caixa
  alter column primeiro_visto_em set default now();

-- ── 5. Os instantes que faltavam nas outras duas tabelas ────────────────────
-- `casos.triado_em` JÁ EXISTE e está morta: nenhuma linha de código escreve
-- nela (conferido, 0 de 10 preenchidas). Fica como está, e quem passa a
-- preenchê-la é `lib/casos/concluir.ts`.
--
-- `concluido_em` de `analise_fila` vem do `_status.json` do notebook, ou seja,
-- do relógio de OUTRA máquina: medido, há 4 linhas com conclusão ANTES da
-- criação. Duração calculada com ele dá negativa. Então o CRM passa a carimbar
-- a própria hora, e a do disco continua lá, para conferência.
alter table public.analise_fila
  add column if not exists concluido_em_crm timestamptz;

comment on column public.analise_fila.concluido_em_crm is
  'A hora do SERVIDOR na conclusão. `concluido_em` vem do relógio do notebook e já produziu duração negativa; para métrica, use esta.';

-- `casos.encerrado_em` só é preenchida no DESCARTE. Concluir a análise põe
-- `etapa = encerrado` sem hora nenhuma, e aí "quantos concluí este mês" não
-- tem como ser respondido.
alter table public.casos
  add column if not exists concluido_em timestamptz;

comment on column public.casos.concluido_em is
  'Quando o caso terminou por CONCLUSÃO (não por descarte, que é `encerrado_em`).';

-- ── 6. A trilha ─────────────────────────────────────────────────────────────
-- Uma linha por transição, e SÓ a transição. Sem assunto, sem corpo, sem
-- remetente: ver o cabeçalho para o motivo. É o que torna possível responder
-- "quanto tempo ficou em cada etapa" daqui para a frente.
--
-- Nada é reconstruível para trás: os 272 e-mails que já estão lá começam a
-- contar a partir de hoje. Isso é honesto e está dito na tela.
create table if not exists public.email_fluxo_eventos (
  id          bigint generated always as identity primary key,

  -- De qual das três tabelas do ciclo veio: o e-mail, o caso ou a fila.
  entidade    text not null check (entidade in ('email','caso','fila')),
  entidade_id uuid not null,

  -- A caixa, para a RLS conseguir decidir quem lê. Nulo para caso e fila, que
  -- não são privados de ninguém (o caso já é trabalho da FAM inteira).
  conta_id    uuid references public.email_contas(id) on delete cascade,

  campo       text not null,   -- 'estado', 'etapa', 'situacao', 'dono', 'eh_pedido'
  de          text,
  para        text,

  quem_auth_id uuid,
  quem_nome    text,           -- 'Carteiro', 'Agente de Cadastro' ou a pessoa

  em          timestamptz not null default now()
);

comment on table public.email_fluxo_eventos is
  'A trilha do pedido de análise: só de/para/quando/quem, nunca conteúdo de e-mail. Existe porque `estado` é uma coluna sobrescrita e sem isto nenhuma métrica de tempo é calculável.';

create index if not exists email_fluxo_eventos_entidade_idx
  on public.email_fluxo_eventos (entidade, entidade_id, em);
create index if not exists email_fluxo_eventos_em_idx
  on public.email_fluxo_eventos (em desc);
create index if not exists email_fluxo_eventos_campo_idx
  on public.email_fluxo_eventos (campo, em desc);

-- ── 7. Quem grava a trilha: o banco, não a tela ─────────────────────────────
-- Trigger, e não código de rota, pelo mesmo motivo do `fam_historico`: o
-- Carteiro escreve por service role, a esteira escreve por script, e a tela
-- escreve por PostgREST. Regra que mora em UM dos três escapa nos outros dois.
--
-- O `when` é o que impede a explosão: `emails_caixa` recebe UPDATE a cada
-- varredura (o `visto_em` muda sempre). Sem a condição, seriam 272 linhas de
-- lixo a cada 5 minutos.
create or replace function public.email_fluxo_registra()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_auth uuid;
  v_nome text;
begin
  begin v_auth := auth.uid(); exception when others then v_auth := null; end;
  if v_auth is not null then
    select u.nome into v_nome from public.usuarios u where u.auth_id = v_auth;
  end if;

  if TG_TABLE_NAME = 'emails_caixa' then
    if TG_OP = 'INSERT' then
      insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
      values ('email', NEW.id, NEW.conta_id, 'chegou', null, NEW.estado, v_auth, coalesce(v_nome, 'Carteiro'));
      return NEW;
    end if;
    if NEW.estado is distinct from OLD.estado then
      insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
      values ('email', NEW.id, NEW.conta_id, 'estado', OLD.estado, NEW.estado, v_auth, coalesce(v_nome, NEW.estado_por));
    end if;
    if NEW.dono_auth_id is distinct from OLD.dono_auth_id then
      insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
      values ('email', NEW.id, NEW.conta_id, 'dono', OLD.dono_nome, NEW.dono_nome, v_auth, v_nome);
    end if;
    if NEW.eh_pedido is distinct from OLD.eh_pedido then
      insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
      values ('email', NEW.id, NEW.conta_id, 'eh_pedido', OLD.eh_pedido::text, NEW.eh_pedido::text, v_auth, coalesce(v_nome, NEW.classificado_por));
    end if;
    return NEW;
  end if;

  if TG_TABLE_NAME = 'casos' then
    if TG_OP = 'INSERT' then
      insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
      values ('caso', NEW.id, 'nasceu', null, NEW.etapa, v_auth, coalesce(v_nome, NEW.criado_por_nome));
    elsif NEW.etapa is distinct from OLD.etapa then
      insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
      values ('caso', NEW.id, 'etapa', OLD.etapa, NEW.etapa, v_auth, v_nome);
    end if;
    return NEW;
  end if;

  if TG_TABLE_NAME = 'analise_fila' then
    if TG_OP = 'INSERT' then
      insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
      values ('fila', NEW.id, 'entrou', null, NEW.situacao, v_auth, v_nome);
    elsif TG_OP = 'DELETE' then
      -- A linha da fila é APAGADA quando a pasta é rebatizada. Hoje isso some
      -- sem rastro, e com ele some a única prova de quanto durou a análise.
      insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
      values ('fila', OLD.id, 'saiu', OLD.situacao, null, v_auth, v_nome);
      return OLD;
    elsif NEW.situacao is distinct from OLD.situacao then
      insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
      values ('fila', NEW.id, 'situacao', OLD.situacao, NEW.situacao, v_auth, v_nome);
    end if;
    return NEW;
  end if;

  return NEW;
end $$;

drop trigger if exists trg_email_fluxo on public.emails_caixa;
create trigger trg_email_fluxo
  after insert or update on public.emails_caixa
  for each row execute function public.email_fluxo_registra();

drop trigger if exists trg_caso_fluxo on public.casos;
create trigger trg_caso_fluxo
  after insert or update on public.casos
  for each row execute function public.email_fluxo_registra();

drop trigger if exists trg_fila_fluxo on public.analise_fila;
create trigger trg_fila_fluxo
  after insert or update or delete on public.analise_fila
  for each row execute function public.email_fluxo_registra();

-- ── 8. RLS da trilha: a mesma da caixa de origem ────────────────────────────
-- Evento de e-mail segue `fam_ve_caixa`, exatamente como `emails_caixa`.
-- Evento de caso e de fila é trabalho da FAM e todo mundo com login enxerga.
-- Escrita: ninguém. Só o trigger, que é SECURITY DEFINER.
alter table public.email_fluxo_eventos enable row level security;

drop policy if exists email_fluxo_eventos_leitura on public.email_fluxo_eventos;
create policy email_fluxo_eventos_leitura on public.email_fluxo_eventos
  for select to authenticated
  using (
    entidade in ('caso','fila')
    or conta_id is null
    or public.fam_ve_caixa(conta_id)
  );

-- ── 9. As metas de tempo ────────────────────────────────────────────────────
-- Uma linha só, editável pela tela. Fica no banco e não no código pelo mesmo
-- motivo dos textos do Carteiro: meta que só muda com deploy é meta que nunca
-- muda. Os valores de fábrica são os que o Marco aprovou em 10/09/2026.
--
-- HORÁRIO COMERCIAL, e isto não é detalhe: um pedido que chega sexta 17h não
-- pode amanhecer vermelho na segunda. É a mesma decisão que o Front expõe como
-- opção em cada regra de meta.
create table if not exists public.email_metas (
  id boolean primary key default true check (id),

  horas_primeira_resposta integer not null default 4
    check (horas_primeira_resposta between 1 and 240),
  dias_uteis_conclusao    integer not null default 5
    check (dias_uteis_conclusao between 1 and 90),

  -- Em que percentual do prazo o painel começa a avisar (o "at risk" do Front).
  aviso_em_percent integer not null default 75 check (aviso_em_percent between 10 and 99),

  -- A janela de trabalho, para o relógio não correr de madrugada.
  hora_inicio integer not null default 9  check (hora_inicio between 0 and 23),
  hora_fim    integer not null default 18 check (hora_fim between 1 and 24),
  conta_fim_de_semana boolean not null default false,

  -- Quantos dias sem NENHUM movimento até o pedido contar como abandonado.
  dias_sem_movimento integer not null default 2 check (dias_sem_movimento between 1 and 60),

  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

insert into public.email_metas (id) values (true) on conflict (id) do nothing;

alter table public.email_metas enable row level security;
drop policy if exists email_metas_leitura on public.email_metas;
create policy email_metas_leitura on public.email_metas
  for select to authenticated using (true);
drop policy if exists email_metas_escrita on public.email_metas;
create policy email_metas_escrita on public.email_metas
  for all to authenticated using (fam_pode_escrever()) with check (fam_pode_escrever());

drop trigger if exists email_metas_atualizado_em on public.email_metas;
create trigger email_metas_atualizado_em before update on public.email_metas
  for each row execute function public.emails_caixa_toca_atualizado_em();

-- ============================================================================
--  10. CONSERTO DA REVISÃO (10/09/2026, mesmo dia, aplicado como
--      `email_vivo_conserto_revisao`)
--
--  Três defeitos achados ao testar contra o banco de verdade:
--
--  a) A trilha podia DERRUBAR a escrita de quem a disparou. O gatilho é AFTER,
--     mas na mesma transação: um erro no insert da trilha voltaria atrás a
--     sincronização do Carteiro. Agora o corpo inteiro está num bloco que
--     engole o erro com `raise warning`. Métrica não para a entrada de e-mail.
--
--  b) Ninguém carimbava a hora da conclusão no CRM. `app/api/esteira/route.ts`
--     põe `situacao = concluida` e `etapa = encerrado` sem hora. Em vez de
--     mexer nesse arquivo (é de outra frente), o banco carimba na TRANSIÇÃO de
--     um UPDATE. Nunca no INSERT: a fila nasce da sincronização do notebook já
--     concluída, e carimbar "agora" nela mentiria a data.
--
--  c) O "ao vivo" não estava ao vivo: das três tabelas assinadas pela tela, só
--     `analise_fila` estava no Realtime. Pôr `emails_caixa` seria pior (o
--     Carteiro reescreve `visto_em` em ~200 linhas por varredura, e a tela
--     recarregaria 200 vezes). A tela passou a escutar a TRILHA, que só ganha
--     linha quando algo de verdade muda.
-- ============================================================================

create or replace function public.email_fluxo_registra()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_auth uuid;
  v_nome text;
begin
  begin
    begin v_auth := auth.uid(); exception when others then v_auth := null; end;
    if v_auth is not null then
      select u.nome into v_nome from public.usuarios u where u.auth_id = v_auth;
    end if;

    if TG_TABLE_NAME = 'emails_caixa' then
      if TG_OP = 'INSERT' then
        insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
        values ('email', NEW.id, NEW.conta_id, 'chegou', null, NEW.estado, v_auth, coalesce(v_nome, 'Carteiro'));
      else
        if NEW.estado is distinct from OLD.estado then
          insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
          values ('email', NEW.id, NEW.conta_id, 'estado', OLD.estado, NEW.estado, v_auth, coalesce(v_nome, NEW.estado_por));
        end if;
        if NEW.dono_auth_id is distinct from OLD.dono_auth_id then
          insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
          values ('email', NEW.id, NEW.conta_id, 'dono', OLD.dono_nome, NEW.dono_nome, v_auth, v_nome);
        end if;
        if NEW.eh_pedido is distinct from OLD.eh_pedido then
          insert into public.email_fluxo_eventos (entidade, entidade_id, conta_id, campo, de, para, quem_auth_id, quem_nome)
          values ('email', NEW.id, NEW.conta_id, 'eh_pedido', OLD.eh_pedido::text, NEW.eh_pedido::text, v_auth, coalesce(v_nome, NEW.classificado_por));
        end if;
      end if;

    elsif TG_TABLE_NAME = 'casos' then
      if TG_OP = 'INSERT' then
        insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
        values ('caso', NEW.id, 'nasceu', null, NEW.etapa, v_auth, coalesce(v_nome, NEW.criado_por_nome));
      elsif NEW.etapa is distinct from OLD.etapa then
        insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
        values ('caso', NEW.id, 'etapa', OLD.etapa, NEW.etapa, v_auth, v_nome);
      end if;

    elsif TG_TABLE_NAME = 'analise_fila' then
      if TG_OP = 'INSERT' then
        insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
        values ('fila', NEW.id, 'entrou', null, NEW.situacao, v_auth, v_nome);
      elsif TG_OP = 'DELETE' then
        insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
        values ('fila', OLD.id, 'saiu', OLD.situacao, null, v_auth, v_nome);
      elsif NEW.situacao is distinct from OLD.situacao then
        insert into public.email_fluxo_eventos (entidade, entidade_id, campo, de, para, quem_auth_id, quem_nome)
        values ('fila', NEW.id, 'situacao', OLD.situacao, NEW.situacao, v_auth, v_nome);
      end if;
    end if;
  exception when others then
    raise warning 'email_fluxo_registra (% %): %', TG_TABLE_NAME, TG_OP, sqlerrm;
  end;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end $$;

create or replace function public.email_fluxo_carimba()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if TG_TABLE_NAME = 'analise_fila' then
    if NEW.situacao = 'concluida' and OLD.situacao is distinct from 'concluida' then
      NEW.concluido_em_crm := now();
    elsif NEW.situacao is distinct from 'concluida' then
      NEW.concluido_em_crm := null;
    end if;
  elsif TG_TABLE_NAME = 'casos' then
    if NEW.etapa = 'encerrado' and OLD.etapa is distinct from 'encerrado' then
      NEW.concluido_em := now();
    elsif NEW.etapa is distinct from 'encerrado' then
      NEW.concluido_em := null;
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_fila_carimba on public.analise_fila;
create trigger trg_fila_carimba before update on public.analise_fila
  for each row execute function public.email_fluxo_carimba();

drop trigger if exists trg_caso_carimba on public.casos;
create trigger trg_caso_carimba before update on public.casos
  for each row execute function public.email_fluxo_carimba();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'email_fluxo_eventos'
  ) then
    alter publication supabase_realtime add table public.email_fluxo_eventos;
  end if;
end $$;
