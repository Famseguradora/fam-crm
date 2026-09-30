-- ============================================================================
--  E-MAIL JUNTADO AO CASO  ·  30/09/2026
--
--  Pedido do Marco: quando falta documento num card, o e-mail novo da corretora
--  tem que entrar NO MESMO card, e não abrir análise nova. "A ideia não é uma
--  nova análise, é um complemento."
--
--  O vínculo já existia no banco e ninguém usava: `emails_caixa.caso_id` é 1:N,
--  e `casos.email_caixa_id` aponta um só. Daqui para a frente:
--
--    casos.email_caixa_id      o e-mail MATRIZ, o que abriu o caso (o selo)
--    emails_caixa.caso_id      todos os e-mails do caso, a matriz e os filhos
--    emails_caixa.juntado_em   só nos filhos: quando e por quem foi juntado
--
--  E o pedido de juntar feito na Caixa precisa atravessar o Carteiro (é ele que
--  tem o .msg na máquina). A tela marca `a_trazer` + `juntar_ao_caso`, e a rota
--  /api/carteiro/trazer lê a coluna para saber se abre caso ou junta.
--
--  Nada de RLS nova: a leitura continua `serve or dono da caixa`, e o e-mail
--  juntado nasce `serve = true` (virou trabalho da esteira).
-- ============================================================================

alter table public.emails_caixa
  add column if not exists juntar_ao_caso uuid references public.casos(id) on delete set null,
  add column if not exists juntado_em timestamptz,
  add column if not exists juntado_por text,
  add column if not exists storage_path text;

comment on column public.emails_caixa.juntar_ao_caso is
  'Pedido pendente: o Carteiro, ao trazer, junta a este caso em vez de abrir um novo. Some quando o e-mail vira caso_id.';
comment on column public.emails_caixa.juntado_em is
  'E-mail FILHO: juntado a um caso que ja existia. Nulo na matriz (casos.email_caixa_id).';
comment on column public.emails_caixa.storage_path is
  'Onde o arquivo do e-mail juntado ficou no bucket fam-anexos. A matriz usa casos.email_storage_path.';

create index if not exists emails_caixa_juntar_idx on public.emails_caixa (juntar_ao_caso) where juntar_ao_caso is not null;

-- ROLLBACK
-- drop index if exists public.emails_caixa_juntar_idx;
-- alter table public.emails_caixa drop column if exists storage_path, drop column if exists juntado_por,
--   drop column if exists juntado_em, drop column if exists juntar_ao_caso;
