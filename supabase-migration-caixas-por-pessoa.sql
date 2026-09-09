-- ============================================================================
--  MUITAS CAIXAS, UMA ESTEIRA  (07/09/2026)
--
--  Ordem do Marco: "teremos todas as caixas de e-mails de todos os profissionais
--  da FAM usando o e-mail do sistema".
--
--  O QUE MUDA NO DESENHO
--  ---------------------------------------------------------------------------
--  A regua deixa de ser UMA (`email_regras`, uma linha so) e passa a ser POR
--  CAIXA. Cada profissional tem a sua, com o seu dono, o seu liga-desliga e a
--  sua janela. `email_regras` continua existindo, mas com outro papel: e o
--  valor DE FABRICA que uma caixa nova herda ao nascer.
--
--  E POR QUE CADA CAIXA NASCE DESLIGADA
--  ---------------------------------------------------------------------------
--  Caixa de e-mail de uma pessoa nao contem so trabalho: contem RH, salario,
--  medico, familia. Ligar a caixa de alguem sem essa pessoa ter ligado seria
--  o sistema decidir sozinho varrer a vida particular de um colega. Entao a
--  caixa nasce DESLIGADA e quem liga e o dono dela.
--
--  E QUEM ENXERGA O QUE
--  ---------------------------------------------------------------------------
--  A leitura de `emails_caixa` deixa de ser "todo mundo ve tudo":
--
--    o que a regua APROVOU (serve = true)  todo mundo da FAM ve, porque isso e
--                                          o trabalho: e o pedido de analise
--                                          que vai virar caso.
--    o que a regua RECUSOU                 SO O DONO DA CAIXA. Nem admin. E ai
--                                          que mora o que nao e trabalho, e
--                                          ninguem precisa ver o assunto do
--                                          e-mail do medico de um colega para
--                                          tocar a esteira.
--
--  E O RISCO QUE SOBRA, escrito para nao ser esquecido: e-mail de RH com anexo
--  PASSA na regua e, portanto, aparece para a FAM inteira. Quem fecha isso e a
--  lista de remetentes daquela caixa (so as corretoras, so de fora da FAM), e a
--  tela avisa quando a lista esta vazia. Nao da para o sistema adivinhar sozinho
--  o que e trabalho e o que nao e; da para ele avisar.
--
--  ADITIVO: nao apaga nada. As linhas que ja existirem em `emails_caixa` ficam
--  sem conta, e sem conta ninguem alcanca o que a regua recusou.
-- ============================================================================

-- ── 1. A caixa de cada um ───────────────────────────────────────────────────
create table if not exists public.email_contas (
  id             uuid primary key default gen_random_uuid(),

  -- O endereco, sempre minusculo: e a chave que o Carteiro manda em toda rodada.
  conta          text not null unique,
  apelido        text,

  -- O DONO. Casado por e-mail com `usuarios` quando a conta aparece pela
  -- primeira vez. Sem dono casado, so quem administra o CRM mexe nela.
  dono_auth_id   uuid,
  dono_nome      text,

  -- DESLIGADA de fabrica. Ver o cabecalho: nao e cautela, e o desenho.
  ligado         boolean not null default false,

  -- A regua desta caixa. Nasce com os valores de `email_regras`.
  pasta          text not null default '',
  so_com_anexo   boolean not null default true,
  so_nao_lidos   boolean not null default false,
  dias_para_tras integer not null default 3 check (dias_para_tras between 1 and 365),
  max_por_rodada integer not null default 40 check (max_por_rodada between 1 and 400),
  remetentes     text[] not null default '{}',
  assunto_contem text[] not null default '{}',
  assunto_ignora text[] not null default
                 '{"fora do escritório","out of office","automatic reply","entrega falhou","undeliverable"}',
  acolher_sozinho boolean not null default false,
  responder_ao_trazer text not null default 'nao'
                      check (responder_ao_trazer in ('nao','rascunho','enviar')),

  -- Quem esta lendo esta caixa e quando leu pela ultima vez. Isto substitui
  -- adivinhar o batimento pelo `max(visto_em)` dos e-mails: caixa que existe e
  -- nao tem nenhum e-mail parecia "parada" mesmo estando de pe.
  -- O BATIMENTO e a VARREDURA sao coisas diferentes, e confundi-las mente na
  -- tela: o Carteiro pode estar de pe com a caixa DESLIGADA (bate a cada 5s e
  -- nao varre nada), e a caixa pode estar ligada com o Carteiro morto (a ultima
  -- varredura fica velha). Uma coluna para cada.
  maquina        text,
  ultimo_contato timestamptz,
  ultima_varredura timestamptz,
  ultimo_erro    text,

  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on table public.email_contas is
  'Uma linha por caixa de e-mail de profissional da FAM. Carrega a regua daquela caixa e o liga-desliga, que e do dono. `email_regras` virou o valor de fabrica que a caixa nova herda.';

comment on column public.email_contas.ligado is
  'Caixa nasce DESLIGADA e quem liga e o dono. Varrer a caixa de alguem sem essa pessoa ter ligado seria varrer a vida particular de um colega.';

create index if not exists email_contas_dono_idx on public.email_contas (dono_auth_id);

-- ── 2. Cada e-mail sabe de qual caixa veio ──────────────────────────────────
alter table public.emails_caixa add column if not exists conta_id uuid
  references public.email_contas(id) on delete cascade;
create index if not exists emails_caixa_conta_idx on public.emails_caixa (conta_id);

-- ── 3. Quem enxerga o que ───────────────────────────────────────────────────
alter table public.email_contas enable row level security;

-- Ver QUE caixas existem, o dono e se estao ligadas: todo mundo. E so o rotulo,
-- e sem isso ninguem entende de onde vem o e-mail que aparece na esteira.
drop policy if exists email_contas_leitura on public.email_contas;
create policy email_contas_leitura on public.email_contas
  for select to authenticated using (true);

-- MEXER na caixa (ligar, mudar a regua) e do DONO, ou de quem administra o CRM.
-- `fam_pode_escrever()` nao serve aqui: ele diz que a pessoa escreve no CRM, e
-- nao que a caixa e dela. Com ele, qualquer um ligaria a caixa de qualquer um.
drop policy if exists email_contas_escrita on public.email_contas;
create policy email_contas_escrita on public.email_contas
  for all to authenticated
  using (dono_auth_id = auth.uid() or fam_gerencia_usuarios())
  with check (dono_auth_id = auth.uid() or fam_gerencia_usuarios());

-- A leitura dos E-MAILS passa a separar trabalho de vida particular.
--
-- SEM ATALHO PARA ADMIN, e isso e conserto de um erro meu do mesmo dia: a
-- primeira versao tinha `or fam_gerencia_usuarios()`, que parecia razoavel ate
-- medir quem e. 8 das 12 pessoas do CRM tem perfil 'admin'. Aqui 'admin' quer
-- dizer "pode alterar cadastro", e nunca quis dizer "pode ler a caixa de e-mail
-- dos colegas". Quem precisar depurar usa a chave de servico.
drop policy if exists emails_caixa_leitura on public.emails_caixa;
create policy emails_caixa_leitura on public.emails_caixa
  for select to authenticated
  using (
    serve
    or exists (
      select 1 from public.email_contas c
      where c.id = emails_caixa.conta_id and c.dono_auth_id = auth.uid()
    )
  );

-- Escrever num e-mail (trazer, tratar, pedir o corpo) continua sendo de quem
-- escreve no CRM: e ato de esteira, e a esteira e de todos.
drop policy if exists emails_caixa_escrita on public.emails_caixa;
create policy emails_caixa_escrita on public.emails_caixa
  for all to authenticated
  using (fam_pode_escrever()) with check (fam_pode_escrever());

-- ── 4. atualizado_em ────────────────────────────────────────────────────────
drop trigger if exists email_contas_atualizado_em on public.email_contas;
create trigger email_contas_atualizado_em before update on public.email_contas
  for each row execute function public.emails_caixa_toca_atualizado_em();

-- ── 5. `email_regras` muda de papel, e o comentario diz isso ────────────────
comment on table public.email_regras is
  'O valor DE FABRICA de uma caixa nova. Deixou de ser a regua em uso quando as caixas passaram a ser uma por profissional (07/09/2026): a regua que vale e a de `email_contas`.';
