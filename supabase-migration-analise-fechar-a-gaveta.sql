-- ============================================================================
--  A GAVETA ONDE A ANALISE MORA  ·  23/09/2026
--
--  Esta migration conserta a anterior (`supabase-migration-analise-para-a-equipe`),
--  e o motivo esta escrito aqui para nao se perder: aquela trancou as 16 tabelas
--  `analise*` e DEIXOU ABERTA a gaveta onde a analise de verdade e guardada.
--
--  ------------------------------------------------------------------------
--  MEDIDO NA SESSAO DE marcelo@bulhoesadvogados.com (perfil leitura, cargo
--  "Investidor", sem a marca), DEPOIS da trava e ANTES desta migration:
--
--      analises ............................  0   <- a trava funcionava
--      analise_fila ........................  0   <- a trava funcionava
--      anexos ..............................  556
--      anexos categoria = analise_credito ..  185 <- o relatorio inteiro
--      objetos no bucket fam-anexos ........  610
--      ia_pedidos escopo = analise .........    5 <- a IA contando da empresa
--
--  Os arquivos se chamam "Analise de Credito - Huawei do Brasil.html",
--  "Analise de Credito - Valor Real.html". E nao era preciso adivinhar o
--  caminho: duas telas logadas ja listavam e ja geravam o link de download,
--  sem checagem nenhuma (`components/AnexosSection.tsx`, dentro do card do
--  tomador, e `app/(dashboard)/operacoes/page.tsx`, que fazia
--  `from('anexos').select('*')` sem filtro).
--
--  A licao, para a proxima vez: TRANCAR O INDICE NAO TRANCA O ARQUIVO. A
--  pergunta certa nao e "de que tabela esta tela le", e sim "por quantos
--  caminhos este dado sai".
--  ------------------------------------------------------------------------
--
--  QUEM PERDE O QUE. Os quatro perfis `leitura` do CRM sao INVESTIDORES
--  (Francisco, Gilda, Marcelo Bulhoes, Marcelo Fonseca), nenhum deles no
--  Comite. Os cinco diretores que votam sao todos `admin` e todos ja estavam
--  marcados, entao o dossie do Comite e a tela de Operacoes nao perdem nada.
--  O investidor sai de 556 anexos para 34 — os que nao sao de credito
--  (25 do tomador, 5 de operacao, 4 de corretora).
-- ============================================================================

begin;

-- A policy do storage tem que casar objeto por NOME com `anexos.storage_path`,
-- e sem indice isso seria uma varredura a cada URL assinada.
create index if not exists anexos_storage_path_idx on public.anexos (storage_path);

-- ─────────────────────────────────────────────────────────────
-- 1. "Este arquivo e material de credito?" — a pergunta, num lugar so
-- ─────────────────────────────────────────────────────────────
-- Tres caminhos levam ao mesmo arquivo (a tabela `anexos`, o bucket, e o
-- e-mail do caso), e os tres precisam da MESMA resposta. Escrever a lista de
-- categorias a mao em cada policy e o desenho que garante que um dia elas
-- divergem — e a que divergir para o lado errado vira vazamento.
--
-- NAO E SO A CATEGORIA. Dos 367 anexos marcados `outro`, 302 sao documento de
-- um caso da triagem: balanco, DRE, Serasa, contrato social. Confiar so na
-- categoria deixaria esses 302 abertos.
create or replace function public.fam_anexo_e_de_credito(p_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $f$
  select exists (select 1 from anexos a where a.id = p_id and a.categoria in ('analise_credito','analise_subscricao'))
      or exists (select 1 from caso_documentos d where d.anexo_id = p_id)
      or exists (select 1 from serasa_pedidos s where s.anexo_id = p_id);
$f$;

comment on function public.fam_anexo_e_de_credito(uuid) is
  'O arquivo e material de credito? Categoria de analise, OU documento de um '
  'caso da triagem (balanco, Serasa, contrato social), OU o PDF de um pedido '
  'de Serasa. Nao basta olhar a categoria: 302 documentos de caso sao "outro".';

create or replace function public.fam_storage_e_de_credito(p_name text)
returns boolean language sql stable security definer set search_path to 'public' as $f$
  select exists (select 1 from anexos a where a.storage_path = p_name and public.fam_anexo_e_de_credito(a.id))
      or exists (select 1 from casos c where c.email_storage_path = p_name);
$f$;

comment on function public.fam_storage_e_de_credito(text) is
  'A mesma pergunta pelo caminho no Storage. O e-mail do caso entra junto: ele '
  'nao tem linha em `anexos` e carrega as condicoes que o comercial escreveu.';

-- ─────────────────────────────────────────────────────────────
-- 2. A tabela e o bucket
-- ─────────────────────────────────────────────────────────────
drop policy if exists "Autenticados podem ler anexos" on public.anexos;
drop policy if exists anexos_leitura on public.anexos;
create policy anexos_leitura on public.anexos for select to authenticated
  using (public.fam_ve_analise() or not public.fam_anexo_e_de_credito(id));

-- O bucket e `public = false`, mas isso so barra o anonimo: a policy antiga
-- liberava QUALQUER objeto de `fam-anexos` para QUALQUER autenticado.
drop policy if exists auth_select_fam_anexos on storage.objects;
create policy auth_select_fam_anexos on storage.objects for select to authenticated
  using (bucket_id = 'fam-anexos' and (public.fam_ve_analise() or not public.fam_storage_e_de_credito(name)));

-- ─────────────────────────────────────────────────────────────
-- 3. A analise tambem saia pela conversa com a IA
-- ─────────────────────────────────────────────────────────────
-- `escopo = 'analise'` caia no ramo `escopo <> 'crm'`, que era publico para
-- todo logado. E a resposta da IA cita socio, participacao e CNPJ do tomador:
-- o conteudo da analise saindo em prosa, com as tabelas trancadas.
drop policy if exists ia_pedidos_leitura on public.ia_pedidos;
create policy ia_pedidos_leitura on public.ia_pedidos for select to authenticated
  using ((escopo <> 'crm' or criado_por_auth_id = auth.uid())
         and (escopo <> 'analise' or public.fam_ve_analise()));

drop policy if exists ia_blocos_leitura on public.ia_blocos;
create policy ia_blocos_leitura on public.ia_blocos for select to authenticated
  using (exists (select 1 from ia_pedidos p where p.id = ia_blocos.pedido_id
                 and (p.escopo <> 'crm' or p.criado_por_auth_id = auth.uid())
                 and (p.escopo <> 'analise' or public.fam_ve_analise())));

-- ─────────────────────────────────────────────────────────────
-- 4. Funcao de RLS nao tem por que atender quem nao fez login
-- ─────────────────────────────────────────────────────────────
-- Inofensivo na pratica (`auth.uid()` nulo devolve false e a funcao sai cedo),
-- mas o advisor reclama com razao: elas eram chamaveis por `anon` em
-- /rest/v1/rpc/.
revoke execute on function public.fam_ve_analise() from anon;
revoke execute on function public.fam_ajuda_analise() from anon;
revoke execute on function public.registrar_visita_analise(uuid) from anon;
revoke execute on function public.fam_anexo_e_de_credito(uuid) from anon;
revoke execute on function public.fam_storage_e_de_credito(text) from anon;

commit;

-- ============================================================================
--  O QUE ESTA MIGRATION *NAO* FECHOU, e e decisao do Marco, nao minha:
--
--    · `tomadores.limite_aprovado` .. 257 tomadores com limite, visivel aos 4
--      investidores. O limite vem da analise. Esconder a coluna muda o CRM
--      inteiro para eles, nao so a Analise.
--    · `fam_historico` ............... 3.709 linhas de `tomadores`, incluindo a
--      evolucao do limite campo a campo.
--    · `serasa_pedidos`, `caso_documentos`, `avisos_pedido`, `agente_eventos`
--      ................................ leitura `true`. Nao entregam o arquivo
--      (o `anexo_id` agora nao abre nada), mas entregam nome de empresa, classe
--      do documento e o andamento da esteira.
-- ============================================================================
