-- ============================================================================
--  A GAVETA DA REANÁLISE (E A DO COMPLEMENTO)  ·  24/09/2026
--
--  Achado pela revisão adversarial da Reanálise com memória, e ele já existia
--  antes dela: o documento que sobe SEM TOMADOR RESOLVIDO ficava legível para
--  qualquer usuário autenticado, inclusive quem não tem acesso à Análise.
--
--  O MECANISMO, e vale entender porque é sutil:
--    · a policy do bucket (`auth_select_fam_anexos`) libera o objeto quando
--      `not fam_storage_e_de_credito(name)`;
--    · `fam_storage_e_de_credito` reconhece material de crédito por uma linha
--      em `anexos` com aquele `storage_path`;
--    · e a linha em `anexos` só nasce quando existe tomador: `entidade_id` é
--      NOT NULL e `entidade_tipo` só aceita tomador, operação, corretora ou
--      caso. Sem tomador, o arquivo sobe para `complemento/<id>` ou
--      `reanalise/<id>` e NÃO tem linha em `anexos`.
--  Resultado: o balanço de um tomador sem cadastro era o único documento de
--  crédito do sistema aberto para o CRM inteiro. Medido em 24/09: 5 das 181
--  análises vigentes não resolvem tomador nem por `tomador_id` nem por CNPJ.
--
--  O CONSERTO É PELO CAMINHO, e não por uma linha em `anexos`: os dois
--  prefixos são escritos pelo servidor, nunca pelo usuário, e tudo que cai
--  neles é material de crédito por construção. Ensinar a função a reconhecê-los
--  fecha os dois fluxos sem tocar no schema de `anexos`.
--
--  A TRILHA DA REANÁLISE também passa a seguir a régua dos anexos: ela guarda
--  o `storage_path` dos documentos no jsonb, e quem não vê análise não tem o
--  que fazer com isso.
--
--  ROLLBACK (volta ao estado de 24/09 de manhã):
--    create or replace function public.fam_storage_e_de_credito(p_name text)
--    returns boolean language sql stable security definer set search_path to 'public' as $f$
--      select exists (select 1 from anexos a where a.storage_path = p_name and public.fam_anexo_e_de_credito(a.id))
--          or exists (select 1 from casos c where c.email_storage_path = p_name);
--    $f$;
--    drop policy if exists "Analise le reanalises" on public.analise_reanalises;
--    create policy "Autenticados leem reanalises" on public.analise_reanalises
--      for select to authenticated using (true);
-- ============================================================================

create or replace function public.fam_storage_e_de_credito(p_name text)
returns boolean language sql stable security definer set search_path to 'public' as $f$
  select exists (select 1 from anexos a where a.storage_path = p_name and public.fam_anexo_e_de_credito(a.id))
      or exists (select 1 from casos c where c.email_storage_path = p_name)
      -- Os dois prefixos que o servidor usa quando não há tomador para
      -- pendurar o anexo. Ver o cabeçalho: sem isto, o arquivo fica aberto.
      or p_name like 'complemento/%'
      or p_name like 'reanalise/%';
$f$;

comment on function public.fam_storage_e_de_credito(text) is
  'O arquivo e material de credito, pelo caminho no Storage? Linha em `anexos` '
  'de categoria de credito, OU o e-mail de um caso, OU as pastas que o servidor '
  'usa quando nao ha tomador para pendurar o anexo (complemento/, reanalise/). '
  'Estas duas entraram em 24/09/2026: sem linha em `anexos`, o documento de um '
  'tomador sem cadastro ficava aberto para todo autenticado.';

-- A trilha da reanálise carrega o caminho dos documentos: mesma régua dos anexos.
drop policy if exists "Autenticados leem reanalises" on public.analise_reanalises;
drop policy if exists "Analise le reanalises" on public.analise_reanalises;
create policy "Analise le reanalises" on public.analise_reanalises
  for select to authenticated using (public.fam_ve_analise());
