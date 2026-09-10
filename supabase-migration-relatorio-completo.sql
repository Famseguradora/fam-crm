-- ============================================================================
--  O RELATÓRIO INTEIRO DENTRO DO CRM  ·  09/09/2026
--
--  Pergunta dele, olhando o card da Renova: "cadê o relatório que consta da
--  análise de crédito?". A resposta honesta era que o CRM tinha só um pedaço.
--  Conferido campo a campo contra o JSON do disco, isto é o que faltava:
--
--    identificacao ..... fundação, regime tributário, capital, endereço, CNAE,
--                        funcionários, filiais
--    enquadramento ..... classe, porte, e COMO a ponderação 60/40 foi decidida
--    resseguro ......... as 13 linhas do contrato automático, modalidade a
--                        modalidade, com Enquadrado/Bloqueio e a observação.
--                        Isto vivia só como uma frase solta na conclusão, e é
--                        o que decide o que a subscrição pode emitir.
--    score_memoria ..... a memória de cálculo do Score: cada indicador com
--                        valor bruto, fórmula, classificação, pontos, peso e
--                        score parcial, mais a conta final escrita. Sem isto o
--                        Score é um número que ninguém pode auditar.
--    linha_tempo ....... a história da empresa, ano a ano
--    caixa_estoque ..... caixa e estoques dos dois exercícios, com a leitura
--    limite_base ....... a conta que produziu o limite ("67,5% do PL ...")
--    base_df ........... consolidado ou individual, e a ressalva do auditor
--
--  POR QUE JSONB, E NÃO SEIS TABELAS: nada disto é consultado por linha, é
--  lido inteiro, junto com a análise, para desenhar uma seção. Uma tabela por
--  bloco daria seis joins para montar uma tela e nenhuma consulta a mais.
--  `analise_exercicios` continua tabela porque ali SIM se compara ano a ano
--  entre empresas.
--
--  NADA AQUI APAGA COISA ALGUMA. São colunas novas, todas anuláveis: uma
--  análise publicada antes desta migration continua exatamente como está, e a
--  tela desenha sem os blocos que ela não tem.
--
--  ROLLBACK no fim do arquivo.
-- ============================================================================

alter table public.analises add column if not exists identificacao  jsonb;
alter table public.analises add column if not exists enquadramento  jsonb;
alter table public.analises add column if not exists resseguro      jsonb;
alter table public.analises add column if not exists score_memoria  jsonb;
alter table public.analises add column if not exists linha_tempo    jsonb;
alter table public.analises add column if not exists caixa_estoque  jsonb;
alter table public.analises add column if not exists limite_base    text;
alter table public.analises add column if not exists limite_perc    numeric;
alter table public.analises add column if not exists base_df        text;
alter table public.analises add column if not exists base_df_obs    text;
alter table public.analises add column if not exists unidade        text;

comment on column public.analises.identificacao is
  'Ficha da empresa como a analise a apurou: fundacao, regime, capital, endereco, cnae, funcionarios, filiais.';
comment on column public.analises.enquadramento is
  'Classe, porte, tipo de avaliacao e os pesos objetivo/subjetivo (pObj/pSubj), com a observacao de quem enquadrou.';
comment on column public.analises.resseguro is
  'Array das linhas do contrato automatico: {item, regra, resultado, status, obs}. status = Enquadrado | Bloqueio | Aceitacao especial.';
comment on column public.analises.score_memoria is
  'Memoria de calculo auditavel do Score: {capacidade, indicadores, cadastral, subjetivo, calculo, score_objetivo, peso_obj, peso_subj}. Cada indicador traz valor bruto, formula, classificacao, pontos, peso% e score parcial.';
comment on column public.analises.linha_tempo is
  'Array {ano, evento}: a historia da empresa como a analise a contou.';
comment on column public.analises.caixa_estoque is
  'Caixa e estoques dos dois exercicios, com a leitura escrita por quem analisou.';
comment on column public.analises.limite_base is
  'A conta que produziu o limite, por extenso. Ex.: "67,5% do PL (R$ 1.190.207.000,00 * 0,675)".';
comment on column public.analises.base_df is
  'Consolidado ou Individual: qual demonstracao sustenta a analise.';

-- ── Os documentos lidos ─────────────────────────────────────────────────────
--  A tabela `analise_documentos` existe desde 30/08/2026 e nunca foi
--  preenchida: a carga lia so o `registro/json`, e o indice dos arquivos mora
--  no `_status.json` de cada pasta. A tela dizia "a indexar" para as 153
--  analises do acervo. Nao ha DDL a fazer aqui, e a carga passa a le-lo.
--
--  Uma coisa muda: `hash16` e `bytes` podem faltar num arquivo que o motor
--  leu antes de o hash existir, e isso nao pode barrar a linha.
alter table public.analise_documentos alter column bytes  drop not null;
alter table public.analise_documentos alter column hash16 drop not null;

-- ============================================================================
--  ROLLBACK  (colar inteiro para desfazer)
--
--  alter table public.analises drop column if exists identificacao;
--  alter table public.analises drop column if exists enquadramento;
--  alter table public.analises drop column if exists resseguro;
--  alter table public.analises drop column if exists score_memoria;
--  alter table public.analises drop column if exists linha_tempo;
--  alter table public.analises drop column if exists caixa_estoque;
--  alter table public.analises drop column if exists limite_base;
--  alter table public.analises drop column if exists limite_perc;
--  alter table public.analises drop column if exists base_df;
--  alter table public.analises drop column if exists base_df_obs;
--  alter table public.analises drop column if exists unidade;
--  -- os documentos ja carregados nao sao apagados pelo rollback; para limpar:
--  -- delete from public.analise_documentos;
-- ============================================================================
