-- ============================================================================
--  UM CADASTRO SÓ DO TOMADOR, E ELE MORA NO CRM  ·  passo 1 (o banco)
--
--  Pedido do Marco em 21/09/2026: "estamos com 3 dados cadastrais do tomador:
--  1) dentro do relatório que eu faço a edição; 2) no cadastro do Tomador
--  dentro da Análise de Crédito; 3) no cadastro do Tomador dentro do CRM FAM.
--  Teremos que fazer somente um cadastro do tomador, que ficará dentro do CRM
--  FAM (Tomador)."
--
--  E a correção dele, no meio do caminho, que mudou esta migration: "Você terá
--  que criar novas colunas no banco de dados? Qual motivo? Esse foi o problema,
--  nós temos diversas colunas e tabelas de banco de dados de tomador.
--  Precisamos unificar."
--
--  ─────────────────────────────────────────────────────────────────────────
--  O QUE A MEDIÇÃO MOSTROU (21/09/2026, contra o banco de produção)
--
--  Dado cadastral de tomador mora hoje em QUATRO tabelas: `tomadores` (606),
--  `analises` vigentes (172), `analise_fila` (48) e `casos` (37).
--
--  Das 127 análises vigentes já ligadas a um tomador:
--    · CNPJ:         0 divergem.    O CNPJ é chave confiável, e é por ele que
--                                   esta migration casa as coisas.
--    · razão social: 118 divergem.  A análise guarda a razão inteira.
--    · 109 tomadores estão VAZIOS em CNAE, capital social e data de abertura,
--      e a análise tem o dado.
--
--  Esse 109 é o diagnóstico: o cadastro do CRM é uma casca, e o dado cadastral
--  de verdade está preso dentro das análises. Unificar aqui não é copiar dado
--  para mais um lugar; é TRAZER PARA CASA o que já existia num lugar errado.
--
--  ─────────────────────────────────────────────────────────────────────────
--  AS TRÊS DECISÕES DELE (21/09/2026), que este arquivo executa
--
--  1. QUEM MANDA: o cadastro do CRM, sempre. A análise guarda a foto do dia e
--     nunca mais sobrescreve o cadastro. Por isso todo `update` aqui embaixo é
--     `where ... is null`: preenche vazio, nunca encosta no que ele digitou.
--  2. NATUREZA: regime, funcionários e filiais descrevem a empresa HOJE, então
--     são cadastro e não análise. É o que autoriza as cinco colunas novas.
--  3. ÓRFÃS: ligar pelo CNPJ e criar o cadastro que faltar.
--
--  ─────────────────────────────────────────────────────────────────────────
--  POR QUE CINCO COLUNAS NOVAS NÃO CONTRADIZEM "PARE DE DUPLICAR"
--
--  Regime, funcionários, filiais, segmento e setor não existem em NENHUM lugar
--  do cadastro hoje: só dentro da análise. Sem uma coluna onde pousar, "o
--  cadastro único no CRM" nasceria perdendo cinco campos, e ele teria que
--  voltar na análise para lê-los, que é exatamente o problema que mandou
--  resolver. Depois deste arquivo, o dono deles é `tomadores`, e a cópia que
--  fica em `analises` vira histórico: a empresa como ela era no dia da análise.
--
--  TUDO ENTRA COMO `text`, E ISSO É DE PROPÓSITO. Os valores reais no acervo
--  não são números: "Sem dados (Serasa)", "0 (Serasa PJ)", "Não informado", e
--  "Nenhuma. As 4 filiais ativas foram encerradas na AGE de 06/08/2026". Uma
--  coluna `integer` obrigaria a inventar zero onde o analista escreveu uma
--  frase, e a frase é a informação.
--
--  ─────────────────────────────────────────────────────────────────────────
--  O QUE ESTA MIGRATION NÃO FAZ, E O MOTIVO
--
--  · NÃO preenche `capital_social` a partir de `identificacao->>'capital'`.
--    O texto da análise é "R$ 1.000.000,00 (balanço 2025)": isso é o capital do
--    BALANÇO, que não é o capital social registrado na Receita. São dois
--    números diferentes com o mesmo nome, e trocar um pelo outro estragaria o
--    cadastro em silêncio. Quem preenche essa coluna é o botão "Receita".
--
--  · NÃO preenche `endereco`. Em `analises` ele é uma string única com o
--    endereço inteiro; em `tomadores` é logradouro, com número, bairro, cidade
--    e CEP em colunas separadas. Jogar a frase inteira no logradouro suja o
--    cadastro. São só 3 casos, e o botão "Receita" resolve melhor.
--
--  · NÃO mexe em `grupo`. O grupo econômico virou `tomadores.holding_id` em
--    18/09/2026 (supabase-migration-vinculo-holding.sql). Uma coluna `grupo` de
--    texto livre ao lado do vínculo estruturado recriaria, dentro do próprio
--    cadastro único, a duplicação que este trabalho veio acabar.
--
--  · NÃO apaga coluna nenhuma de `analises`, `analise_fila` ou `casos`. Esvaziar
--    a cópia é o passo 2, e só depois que as telas estiverem lendo do cadastro.
--    Apagar antes disso derruba o relatório.
--
--  · NÃO toca nas 5 análises vigentes SEM CNPJ. Sem chave confiável, casar por
--    nome seria chute, e chute em cadastro vira tomador errado. Elas ficam
--    órfãs de propósito; a consulta que lista as 5 está no rodapé.
-- ============================================================================

begin;

/* ── 1. AS CINCO COLUNAS QUE FALTAVAM ─────────────────────────────────────── */

alter table public.tomadores
  add column if not exists regime_tributario text,
  add column if not exists funcionarios      text,
  add column if not exists filiais           text,
  add column if not exists segmento          text,
  add column if not exists setor             text;

comment on column public.tomadores.regime_tributario is
  'Regime tributário (Lucro Real, Lucro Presumido, Simples...). Texto livre: o acervo guarda frases como "Não informado (Serasa: sem dados)". Dono do campo desde 21/09/2026; era analises.identificacao->>''regime''.';
comment on column public.tomadores.funcionarios is
  'Quantidade de funcionários, como texto. Texto e não número porque o acervo guarda "Sem dados (Serasa)" e "0 (Serasa PJ)". Era analises.identificacao->>''funcionarios''.';
comment on column public.tomadores.filiais is
  'Filiais, como texto. Texto e não número porque o acervo guarda frases inteiras ("Nenhuma. As 4 filiais ativas foram encerradas na AGE de 06/08/2026"). Era analises.identificacao->>''filiais''.';
comment on column public.tomadores.segmento is
  'O que a empresa faz, em uma frase. Era analises.segmento.';
comment on column public.tomadores.setor is
  'Setor econômico (Energia, Indústria, Serviços...). Era analises.setor.';

/* ── 2. LIGAR AS ÓRFÃS QUE JÁ TÊM CADASTRO ────────────────────────────────────
   20 das 45 análises vigentes sem `tomador_id` têm CNPJ de um tomador que já
   existe. Elas eram ilhas por falta do vínculo, não por falta de cadastro.
   As duas tabelas guardam CNPJ como 14 dígitos sem máscara (conferido), então
   o casamento é igualdade direta, sem normalizar.                            */

update public.analises a
set tomador_id = t.id
from public.tomadores t
where a.vigente
  and a.tomador_id is null
  and a.cnpj is not null and a.cnpj <> ''
  and t.cnpj = a.cnpj;

/* ── 3. CRIAR O CADASTRO DAS ÓRFÃS QUE NÃO TÊM ────────────────────────────────
   Outras 20 têm CNPJ que não existe em `tomadores`. Decisão dele: criar o
   cadastro a partir da análise. Nascem marcadas com `cadastro_fonte='analise'`,
   e é essa marca que permite achá-las (e desfazer) depois.

   `distinct on (cnpj)` protege o índice único `tomadores_cnpj_key` no dia em
   que duas análises vigentes dividirem o mesmo CNPJ. Hoje não há nenhuma
   (medido: 0), mas a migration não pode depender disso para não quebrar.     */

insert into public.tomadores (
  razao_social, cnpj, cnae, data_abertura, data_entrada,
  regime_tributario, funcionarios, filiais, segmento, setor, cadastro_fonte
)
select distinct on (a.cnpj)
  trim(a.razao_social),
  a.cnpj,
  nullif(trim(a.identificacao->>'cnae'), ''),
  /* "14/04/2003, 23 anos" e "13/05/1986 - 40 anos": só o dd/mm/aaaa da frente,
     e só quando o ano é plausível. O resto da frase não é data. */
  case when substring(a.identificacao->>'fundacao' from '^\s*(\d{2}/\d{2}/\d{4})') is not null
        and substring(a.identificacao->>'fundacao' from '^\s*\d{2}/\d{2}/(\d{4})')::int between 1900 and 2030
       then to_date(substring(a.identificacao->>'fundacao' from '^\s*(\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY')
  end,
  a.data_analise,
  nullif(trim(a.identificacao->>'regime'), ''),
  nullif(trim(a.identificacao->>'funcionarios'), ''),
  nullif(trim(a.identificacao->>'filiais'), ''),
  nullif(trim(a.segmento), ''),
  nullif(trim(a.setor), ''),
  'analise'
from public.analises a
where a.vigente
  and a.tomador_id is null
  and a.cnpj is not null and a.cnpj <> ''
  and trim(coalesce(a.razao_social,'')) <> ''
  and not exists (select 1 from public.tomadores t where t.cnpj = a.cnpj)
order by a.cnpj, a.data_analise desc nulls last, a.registrado_em desc nulls last;

/* Agora que existem, ligar. É a mesma consulta do passo 2, de novo, e isso é
   intencional: rodar o arquivo inteiro duas vezes não cria nada nem religa
   nada, porque o passo 3 tem `not exists` e este `update` tem `is null`.     */

update public.analises a
set tomador_id = t.id
from public.tomadores t
where a.vigente
  and a.tomador_id is null
  and a.cnpj is not null and a.cnpj <> ''
  and t.cnpj = a.cnpj;

/* ── 4. TRAZER PARA CASA O QUE O CADASTRO NÃO TEM ─────────────────────────────
   A regra é a dele: o cadastro do CRM manda. Por isso `coalesce(t.x, r.x)`
   (nunca `r.x`) e o `where` só deixa passar linha que tem pelo menos um campo
   vazio para encher. Campo que ele digitou não é tocado, hoje nem numa segunda
   execução.                                                                  */

with recente as (
  select distinct on (a.tomador_id)
    a.tomador_id,
    nullif(trim(a.identificacao->>'regime'), '')       as regime,
    nullif(trim(a.identificacao->>'funcionarios'), '') as funcionarios,
    nullif(trim(a.identificacao->>'filiais'), '')      as filiais,
    nullif(trim(a.segmento), '')                       as segmento,
    nullif(trim(a.setor), '')                          as setor,
    nullif(trim(a.identificacao->>'cnae'), '')         as cnae,
    case when substring(a.identificacao->>'fundacao' from '^\s*(\d{2}/\d{2}/\d{4})') is not null
          and substring(a.identificacao->>'fundacao' from '^\s*\d{2}/\d{2}/(\d{4})')::int between 1900 and 2030
         then to_date(substring(a.identificacao->>'fundacao' from '^\s*(\d{2}/\d{2}/\d{4})'), 'DD/MM/YYYY')
    end                                                as data_abertura
  from public.analises a
  where a.vigente and a.tomador_id is not null
  order by a.tomador_id, a.data_analise desc nulls last, a.registrado_em desc nulls last
)
update public.tomadores t
set regime_tributario = coalesce(t.regime_tributario, r.regime),
    funcionarios      = coalesce(t.funcionarios,      r.funcionarios),
    filiais           = coalesce(t.filiais,           r.filiais),
    segmento          = coalesce(t.segmento,          r.segmento),
    setor             = coalesce(t.setor,             r.setor),
    cnae              = coalesce(t.cnae,              r.cnae),
    data_abertura     = coalesce(t.data_abertura,     r.data_abertura)
from recente r
where t.id = r.tomador_id
  and (t.regime_tributario is null and r.regime        is not null
    or t.funcionarios      is null and r.funcionarios  is not null
    or t.filiais           is null and r.filiais       is not null
    or t.segmento          is null and r.segmento      is not null
    or t.setor             is null and r.setor         is not null
    or t.cnae              is null and r.cnae          is not null
    or t.data_abertura     is null and r.data_abertura is not null);

commit;

-- ============================================================================
--  AS 5 QUE SOBRARAM, PARA OLHAR NA MÃO
--  Análise vigente sem CNPJ não tem como casar sem chutar pelo nome.
--
--    select id, razao_social, data_analise
--    from analises
--    where vigente and tomador_id is null
--    order by razao_social;
--
--  ────────────────────────────────────────────────────────────────────────
--  COMO DESFAZER (o rito: o rollback existe antes de aplicar)
--
--  1) Desligar as análises dos cadastros que ESTA migration criou, e apagá-los:
--       begin;
--       update analises a set tomador_id = null
--         from tomadores t
--        where t.id = a.tomador_id and t.cadastro_fonte = 'analise';
--       delete from tomadores where cadastro_fonte = 'analise';
--       commit;
--     (Confira antes que ninguém passou a usar esses 20: um `select` em
--      operacoes/casos/analise_fila por esses tomador_id. Se já tiverem
--      operação, NÃO apague: o cadastro passou a valer.)
--
--  2) Derrubar as cinco colunas:
--       begin;
--       alter table public.tomadores
--         drop column if exists regime_tributario,
--         drop column if exists funcionarios,
--         drop column if exists filiais,
--         drop column if exists segmento,
--         drop column if exists setor;
--       commit;
--
--  O que NÃO volta sozinho: os 20 vínculos do passo 2 (análise que casou com
--  tomador que já existia) e o `cnae`/`data_abertura` preenchidos no passo 4.
--  Os dois são re-deriváveis (o vínculo é igualdade de CNPJ; o preenchimento só
--  ocupou campo vazio), e nada foi sobrescrito: `analises.identificacao`,
--  `analises.segmento` e `analises.setor` continuam intactos. É por isso que
--  este passo é seguro.
-- ============================================================================
