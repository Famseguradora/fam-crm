-- ============================================================================
--  O CARD DO TOMADOR COM UMA SEÇÃO POR ÁREA
--  Fluxo operacional de verdade dentro do CRM (08/09/2026)
--
--  Porta para o banco o que o protótipo (`prototipo/prototipo-crm-fam.html`,
--  tela "mesa") já mostra funcionando: as cinco seções nascendo juntas em todo
--  card, com dono, estado e registro, a central de uma área por vez, e o
--  concluir/reabrir como evento visível.
--
--  ADITIVO. Não altera nem apaga nada do que existe. O card continua sendo o
--  tomador: cadastro único é `tomadores`, e nenhuma tabela nova guarda empresa.
--
--  ANTES DE ESCREVER ISTO, O BANCO FOI VARRIDO (ordem do Marco em 08/09/2026:
--  "consulte se já não tem esse cadastro"). O que a varredura devolveu:
--   • empresa mora só em `tomadores` (560). As 8 tabelas com `tomador_id`
--     (analises, analise_fila, analise_documentos, analise_conflitos, anexos,
--     casos, operacoes, socios) apenas apontam para ela. `card_secoes` entra
--     nessa mesma lista, com FK e cascade: 5 linhas por tomador, não outra ficha.
--   • não existe nada guardando seção por área, central ou dono de área.
--     `casos.etapa` é a esteira do e-mail (0 linhas) e `analise_fila.etapa` é o
--     andamento do motor na máquina dele. Nenhum dos dois é isto.
--   • `user_profiles.setores_expertise` é setor ECONÔMICO para a IA, não área
--     de trabalho; `agente_alcadas` (0 linhas) é alçada de agente, não de gente.
--   • `tomadores.responsavel` existe e está vazio nos 560.
--
--  O QUE NÃO VIRA COLUNA, DE PROPÓSITO (mesma decisão da migração de casos):
--  a PENDÊNCIA de cada seção (falta o CNPJ, falta o balanço, falta a taxa) é
--  sempre DERIVADA do dado real, em `lib/card/secoes.ts`, lida pela Mesa e pelo
--  Funil. Gravar a pendência abriria a porta para ela discordar do dado, e aí
--  ninguém sabe qual está certo.
--
--  O QUE JÁ EXISTE E É REAPROVEITADO, em vez de duplicado:
--   • documentos do Cadastro ....... `anexos.categoria` + `caso_item_catalogo`
--   • análise e recomendação ....... `analises` (vigente por tomador)
--   • taxa, voto e parecer ......... `operacoes.taxa`, `voto_subscricao`, `parecer_subscricao`
--   • alçada e status do funil ..... `status_fluxo_operacao`
--   • rastro técnico de coluna ..... `fam_historico` (gatilho de banco, já existe)
--
--  `card_eventos` NÃO substitui o `fam_historico`. O histórico guarda "a coluna
--  X mudou de A para B"; aqui fica o que uma pessoa escreveu e por quê ("reabri
--  porque chegou o balancete de junho"). Uma coisa é rastro, a outra é registro.
-- ============================================================================

begin;

-- ── 1. A ÁREA DE CADA PESSOA ────────────────────────────────────────────────
--  O `souDaArea()` do protótipo não tinha de onde sair: hoje `usuarios` só tem
--  perfil (admin/leitura), cargo em texto livre e as flags de comitê/analista.
--  Sem área não existe "quem escreve o oficial", e a regra vira só enfeite.
--  É LISTA, e não uma área só: o Marco pediu em 08/09 que o Crédito acumule o
--  Cadastro e que ELE possa liberar essa área para outra pessoa na tela de
--  Usuários, sem deploy. Uma pessoa pode ter nenhuma, uma ou várias áreas.
alter table public.usuarios
  add column if not exists areas text[] not null default '{}',
  add column if not exists diretoria boolean not null default false;

alter table public.usuarios drop constraint if exists usuarios_areas_validas;
alter table public.usuarios add constraint usuarios_areas_validas
  check (areas <@ array['comercial','cadastro','credito','subscricao','juridico']::text[]);

comment on column public.usuarios.areas is
  'Áreas do fluxo que a pessoa escreve como oficial no card. Editável na tela de Usuários: liberar o Cadastro para mais alguém é marcar uma caixa, não é deploy. Vazio = não opera seção nenhuma (investidor, financeiro, produtos).';
comment on column public.usuarios.diretoria is
  'Poder de diretoria no card: reabre seção de qualquer área e conclui por cima. Independe de perfil admin, que é só permissão de sistema.';

-- Povoamento pelos cargos que já estão cadastrados (12 pessoas, 08/09/2026).
-- Não existe ninguém com cargo de Cadastro/Triagem: por decisão dele, o Crédito
-- acumula essa área até que outra pessoa seja marcada na tela de Usuários.
update public.usuarios set areas = array['comercial'],            diretoria = true  where cargo = 'Diretor Comercial';
update public.usuarios set areas = array['credito','cadastro'],   diretoria = true  where cargo = 'Executivo de Crédito';
update public.usuarios set areas = array['subscricao'],           diretoria = true  where cargo = 'Diretor de Subscrição';
update public.usuarios set areas = array['subscricao'],           diretoria = false where cargo = 'Coordenadora de Subscrição';
update public.usuarios set areas = array['juridico'],             diretoria = true  where cargo = 'Diretora Jurídica';
update public.usuarios set diretoria = true  where cargo in ('CEO','Diretor Financeiro','Diretora de Produtos');

-- ── 2. ONDE ESTÁ A CENTRAL ──────────────────────────────────────────────────
--  A central é atributo do card, e o card é o tomador. Uma tabela 1:1 só para
--  guardar uma palavra seria peça a mais para manter.
alter table public.tomadores
  add column if not exists central_area text not null default 'comercial'
    check (central_area in ('comercial','cadastro','credito','subscricao','emissao'));

comment on column public.tomadores.central_area is
  'Área que está com a central agora. Só quem tem a central escreve o registro OFICIAL da própria seção; as outras áreas escrevem rascunho. "emissao" é o fim da régua.';

-- ── 3. AS SEÇÕES ────────────────────────────────────────────────────────────
create table if not exists public.card_secoes (
  id                    uuid primary key default gen_random_uuid(),
  tomador_id            uuid not null references public.tomadores(id) on delete cascade,
  area                  text not null
                        check (area in ('comercial','cadastro','credito','subscricao','juridico')),

  estado                text not null default 'aberta'
                        check (estado in ('dormente','aberta','concluida')),

  -- o registro da área: o oficial e o que ainda é rascunho
  texto                 text,
  rascunho              text,
  rascunho_por          text,
  rascunho_em           timestamptz,

  -- o que é só daquela área (temperatura do Comercial, recomendação do Crédito)
  campos                jsonb not null default '{}'::jsonb,

  -- decisão de 08/09: o Crédito conclui com pendência, desde que ela seja escrita
  pendencia_texto       text,

  concluida_em          timestamptz,
  concluida_por         text,
  concluida_por_auth_id uuid,

  reaberta_em           timestamptz,
  reaberta_por          text,
  reaberta_motivo       text,

  -- o poder que o Jurídico pediu: paralisar o fluxo a qualquer momento.
  -- Não é coluna "do Jurídico": a trava é derivada de QUALQUER seção com
  -- paralisa = true, para o dia em que outra área ganhar o mesmo poder.
  paralisa              boolean not null default false,
  paralisa_motivo       text,
  paralisa_por          text,
  paralisa_em           timestamptz,

  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),

  unique (tomador_id, area)
);

comment on table public.card_secoes is
  'Uma linha por área dentro do card do tomador. As cinco nascem juntas: não é fila tipo Pipefy, é seção isolada com dono, estado e registro.';
comment on column public.card_secoes.rascunho is
  'O que a área escreveu SEM ter a central. Vira oficial pelo botão "trazer meu rascunho para o oficial", nunca sozinho.';
comment on column public.card_secoes.pendencia_texto is
  'Por que a seção foi concluída com algo faltando. Preenchido, aparece no card e no cartão do funil: pendência escrita é visível, não some.';
comment on column public.card_secoes.paralisa is
  'Fluxo paralisado por esta área. Enquanto for true, nenhuma seção do card conclui.';

create index if not exists card_secoes_tomador_idx on public.card_secoes (tomador_id);
create index if not exists card_secoes_area_idx    on public.card_secoes (area, estado);
create index if not exists card_secoes_paralisa_idx on public.card_secoes (tomador_id) where paralisa;

-- ── 4. O REGISTRO HUMANO DO CARD ────────────────────────────────────────────
--  Três coisas na mesma tabela porque as três são a mesma linha do tempo que o
--  protótipo desenha embaixo da mesa: o histórico, a conversa entre áreas e o
--  pedido de informação que o Jurídico faz.
create table if not exists public.card_eventos (
  id             uuid primary key default gen_random_uuid(),
  tomador_id     uuid not null references public.tomadores(id) on delete cascade,

  tipo           text not null check (tipo in ('evento','mensagem','pedido')),
  area           text,
  para_area      text,
  texto          text not null,

  autor_nome     text,
  autor_auth_id  uuid,

  -- só em 'pedido': o Jurídico pergunta, a área responde
  resolvido_em   timestamptz,
  resolvido_por  text,
  resposta       text,

  criado_em      timestamptz not null default now()
);

comment on table public.card_eventos is
  'A linha do tempo escrita por gente dentro do card: evento (concluiu, reabriu, paralisou), mensagem interna entre áreas e pedido de informação. O rastro automático de coluna continua em fam_historico.';

create index if not exists card_eventos_tomador_idx on public.card_eventos (tomador_id, criado_em desc);
create index if not exists card_eventos_pedido_idx  on public.card_eventos (tomador_id) where tipo = 'pedido' and resolvido_em is null;

-- ── 5. AS SEÇÕES NASCEM JUNTAS ──────────────────────────────────────────────
--  Gatilho, e não código de tela: o tomador nasce por várias portas (triagem,
--  carga das análises, cadastro à mão) e em todas elas o card tem que nascer
--  inteiro.
create or replace function public.fam_abre_secoes_do_card()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.card_secoes (tomador_id, area, estado)
  values (new.id, 'comercial',  'aberta'),
         (new.id, 'cadastro',   'aberta'),
         (new.id, 'credito',    'aberta'),
         (new.id, 'subscricao', 'aberta'),
         (new.id, 'juridico',   'dormente')
  on conflict (tomador_id, area) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_abre_secoes_do_card on public.tomadores;
create trigger trg_abre_secoes_do_card
  after insert on public.tomadores
  for each row execute function public.fam_abre_secoes_do_card();

-- ── 6. QUEM ESCREVE O QUÊ (a trava de verdade, no banco) ────────────────────
create or replace function public.fam_minhas_areas()
returns text[] language sql stable security definer set search_path to 'public'
as $$ select coalesce((select areas from public.usuarios where auth_id = auth.uid() limit 1), '{}'::text[]); $$;

create or replace function public.fam_e_diretoria()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select exists (select 1 from public.usuarios where auth_id = auth.uid() and diretoria); $$;

alter table public.card_secoes  enable row level security;
alter table public.card_eventos enable row level security;

-- Ler é de todo mundo que entra: o funil só funciona se as áreas olharem a
-- mesma fila. Escrever é de quem é da área (ou da diretoria).
drop policy if exists card_secoes_select on public.card_secoes;
create policy card_secoes_select on public.card_secoes
  for select to authenticated using (true);

drop policy if exists card_secoes_update on public.card_secoes;
create policy card_secoes_update on public.card_secoes
  for update to authenticated
  using (public.fam_pode_escrever() and (area = any (public.fam_minhas_areas()) or public.fam_e_diretoria()))
  with check (public.fam_pode_escrever() and (area = any (public.fam_minhas_areas()) or public.fam_e_diretoria()));

-- Insert existe para o caso de um card antigo abrir sem alguma seção; o
-- caminho normal é o gatilho.
drop policy if exists card_secoes_insert on public.card_secoes;
create policy card_secoes_insert on public.card_secoes
  for insert to authenticated with check (public.fam_pode_escrever());

drop policy if exists card_eventos_select on public.card_eventos;
create policy card_eventos_select on public.card_eventos
  for select to authenticated using (true);

drop policy if exists card_eventos_insert on public.card_eventos;
create policy card_eventos_insert on public.card_eventos
  for insert to authenticated with check (public.fam_pode_escrever());

-- Responder pedido é de quem recebeu o pedido (ou da diretoria).
drop policy if exists card_eventos_update on public.card_eventos;
create policy card_eventos_update on public.card_eventos
  for update to authenticated
  using (public.fam_pode_escrever() and (para_area = any (public.fam_minhas_areas()) or public.fam_e_diretoria()))
  with check (public.fam_pode_escrever());

-- ── 7. OS 560 CARDS QUE JÁ EXISTEM ──────────────────────────────────────────
--  O acervo nasce com as seções abertas. NÃO inventamos conclusão: a única
--  seção marcada como concluída é a do Crédito de quem tem análise vigente no
--  banco, porque isso é fato, não presunção. O que foi presumido fica marcado
--  em campos->>'backfill' para dar para desfazer depois.
insert into public.card_secoes (tomador_id, area, estado, campos)
select t.id, a.area,
       case when a.area = 'juridico' then 'dormente' else 'aberta' end,
       '{"backfill":"08/09/2026"}'::jsonb
from public.tomadores t
cross join (values ('comercial'),('cadastro'),('credito'),('subscricao'),('juridico')) as a(area)
on conflict (tomador_id, area) do nothing;

update public.card_secoes s
set estado = 'concluida',
    concluida_em = coalesce(an.publicado_em, an.registrado_em),
    concluida_por = 'carga das análises',
    campos = s.campos || '{"backfill_credito":"analise vigente no banco"}'::jsonb
from public.analises an
where an.tomador_id = s.tomador_id
  and an.vigente
  and s.area = 'credito'
  and s.estado = 'aberta';

-- A central de cada card antigo vai para ONDE HÁ TRABALHO A FAZER, e não para
-- o estágio mais avançado: quem tem uma apólice emitida e outra operação em
-- análise está com a central no Crédito, não na Emissão.
-- Perdido e Recusado não puxam a central: operação morta não segura ninguém.
update public.tomadores t
set central_area = case
  when exists (select 1 from public.operacoes o where o.tomador_id = t.id and coalesce(o.ativo, true)
                 and o.status in ('Para Analisar','Em Análise','Minuta Enviada para Corretor'))
    then case when exists (select 1 from public.card_secoes s
                            where s.tomador_id = t.id and s.area = 'credito' and s.estado = 'concluida')
              then 'subscricao' else 'credito' end
  when exists (select 1 from public.operacoes o where o.tomador_id = t.id and coalesce(o.ativo, true)
                 and o.status in ('Aprovado','Comitê'))
    then 'subscricao'
  when exists (select 1 from public.operacoes o where o.tomador_id = t.id and coalesce(o.ativo, true)
                 and o.status = 'Emitido')
    then 'emissao'
  else 'comercial'
end;

commit;
