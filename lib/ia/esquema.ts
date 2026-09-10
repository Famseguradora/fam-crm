// ============================================================================
//  O QUE A IA GESTOR PODE LER  ·  o catálogo, num lugar só
//
//  Este arquivo é o PREFIXO CACHEADO da conversa com a API. Duas consequências
//  práticas, e as duas custam dinheiro se forem ignoradas:
//
//  1. ELE PRECISA SER BYTE-ESTÁVEL. Prompt caching é casamento de prefixo: um
//     byte diferente e a Anthropic recobra o prefixo inteiro como token novo.
//     Então aqui dentro NÃO entra data de hoje, nome de quem perguntou, id de
//     pedido, contagem de linhas do banco, nada que mude entre uma pergunta e
//     a seguinte. Isso tudo vai depois, na mensagem do usuário.
//     É essa disciplina que faz a 2ª pergunta custar ~1/10 da 1ª.
//
//  2. ELE É TAMBÉM A TRAVA. A lista abaixo é a única coisa que a ferramenta
//     `consultar` aceita como tabela. Tabela que não está aqui não é lida nem
//     se a IA pedir, e nem se alguém escrever a pergunta pedindo.
//
//  GOVERNANÇA, a regra de ouro deste arquivo:
//  a leitura roda na SESSÃO DE QUEM PERGUNTOU (RLS ligada), nunca na service
//  role. Cada pessoa só enxerga o que já enxergaria abrindo a tela na mão.
//  A IA não é um usuário com poderes: é o próprio usuário, com pressa.
//  Por isso o cofre do Financeiro, o envelope de chaves e a auditoria dele NÃO
//  estão na lista: ali nem a RLS deve ser a única porta.
// ============================================================================

export interface TabelaPermitida {
  nome: string
  /** Uma linha do que ela é. Vira o catálogo que a IA lê. */
  conta: string
  /** As colunas que valem a pena citar. Não é a lista completa da tabela:
   *  quem quiser tudo pede `colunas: "*"` e a RLS decide o resto. */
  colunas: string
}

/* A ORDEM DESTA LISTA NÃO MUDA. Ela faz parte do prefixo cacheado: reordenar
   por gosto invalidaria o cache de todo mundo na próxima pergunta. */
export const TABELAS: TabelaPermitida[] = [
  {
    nome: 'tomadores',
    conta: 'As empresas. É a entidade central do CRM: uma empresa, um cadastro, chaveado pelo CNPJ.',
    colunas: 'id, razao_social, nome_fantasia, cnpj, corretora_id, cidade, estado, porte, status, limite_aprovado, ativo, central_area, data_entrada',
  },
  {
    nome: 'operacoes',
    conta: 'Cada pedido de garantia de um tomador. Um tomador tem várias; o status dela é a etapa do funil.',
    colunas: 'id, tomador_id, corretora_id, modalidade, lmg, taxa, premio_previsto, status, prioridade, temperatura, data_entrada, voto_subscricao',
  },
  {
    nome: 'corretoras',
    conta: 'Quem traz o negócio. Ligada ao tomador por corretora_id.',
    colunas: 'id, razao_social, nome_fantasia, cnpj, status, cidade, estado',
  },
  {
    nome: 'analises',
    conta: 'O resultado da análise de crédito: Score FAM, rating, taxas e limite recomendado. Uma linha por versão; a que vale por CNPJ tem vigente=true.',
    colunas: 'id, tomador_id, cnpj, razao_social, score, rating, limite_recomendado, parecer, vigente, analisado_em',
  },
  {
    nome: 'analise_exercicios',
    conta: 'O resumo financeiro por exercício de cada análise (balanço, DRE, caixa, estoque). A chave é o rótulo, porque nem sempre é ano fechado.',
    colunas: 'analise_id, rotulo, receita_liquida, ebitda, lucro_liquido, patrimonio_liquido, divida_bruta, caixa, estoque',
  },
  {
    nome: 'analise_fila',
    conta: 'O ANDAMENTO de uma análise (o que está rodando agora). O resultado fica em analises.',
    colunas: 'id, pasta, cnpj, razao_social, tomador_id, estado, etapa, criado_em',
  },
  {
    nome: 'casos',
    conta: 'O pedido antes de virar operação: o e-mail que o Comercial trouxe, ou o CNPJ digitado. Vive na coluna Triagem/Cadastro do funil.',
    colunas: 'id, numero, assunto, cnpj, razao_social, corretora_texto, produto, etapa, tomador_id, criado_em',
  },
  {
    nome: 'caso_itens',
    conta: 'O checklist de documentos de cada caso: o que a política exige e o que chegou.',
    colunas: 'caso_id, item, situacao, por, detalhe',
  },
  {
    nome: 'card_secoes',
    conta: 'As cinco áreas dentro do card do tomador (Comercial, Cadastro, Crédito, Subscrição, Jurídico), com dono, estado e o que paralisa.',
    colunas: 'tomador_id, area, estado, pendencia_texto, paralisa, paralisa_motivo',
  },
  {
    nome: 'card_eventos',
    conta: 'A linha do tempo escrita por gente dentro do card: conclusões, reaberturas, mensagens entre áreas.',
    colunas: 'tomador_id, area, tipo, texto, autor_nome, criado_em',
  },
  {
    nome: 'socios',
    conta: 'Os sócios de cada tomador, como vieram do contrato social e da Receita.',
    colunas: 'tomador_id, nome, documento, qualificacao, percentual',
  },
  {
    nome: 'modalidades',
    conta: 'As modalidades de seguro garantia que a FAM opera.',
    colunas: 'id, nome, ativo',
  },
  {
    nome: 'status_fluxo_operacao',
    conta: 'A régua do funil: as etapas da operação, na ordem, com cor. É tabela para etapa nova não precisar de deploy.',
    colunas: 'nome, cor, ordem, ativo',
  },
  {
    nome: 'status_fluxo_tomador',
    conta: 'A régua de status do tomador. Eixo independente do status da operação: não são a mesma coisa e já divergem no banco.',
    colunas: 'nome, cor, ordem, ativo',
  },
  {
    nome: 'metas_negocio',
    conta: 'As metas de produção da FAM por período.',
    colunas: 'periodo, meta_premio, meta_operacoes',
  },
  {
    nome: 'fam_historico',
    conta: 'A trilha temporal do CRM, escrita por trigger. Fonte para variação e tempo em cada etapa: filtre campo = status e acao = update, e a data é mudou_em.',
    colunas: 'tabela, registro_id, campo, acao, valor_antes, valor_depois, mudou_em, usuario_email',
  },
  {
    nome: 'anexos',
    conta: 'Os documentos guardados no CRM. Guarda o nome e o endereço do arquivo, não o conteúdo dele.',
    colunas: 'entidade_tipo, entidade_id, tomador_id, nome_original, categoria, tamanho_bytes, criado_em',
  },
  {
    nome: 'usuarios',
    conta: 'A equipe da FAM dentro do CRM. Use para dizer de quem é cada trabalho.',
    colunas: 'id, nome, perfil, ativo',
  },
  {
    nome: 'analise_recados',
    conta: 'O mural onde os funcionários virtuais falam sobre o trabalho da esteira.',
    colunas: 'assinatura, texto, tipo, criado_em',
  },
  {
    nome: 'analise_conflitos',
    conta: 'O relatório da carga das análises: tudo que não casou entre a análise e o CRM, com os dois valores lado a lado.',
    colunas: 'analise_id, campo, valor_analise, valor_crm, motivo, resolvido',
  },
]

/** A trava de verdade: nome de tabela que não está no catálogo não é lido. */
export const PODE_LER = (tabela: string): boolean =>
  TABELAS.some((t) => t.nome === tabela)

/* O catálogo em texto, do jeito que entra no prompt. É montado uma vez, na
   carga do módulo, e nunca depende de nada que mude entre chamadas: se este
   texto variasse, o cache quebraria a cada pergunta. */
export const CATALOGO = TABELAS
  .map((t) => `- ${t.nome}: ${t.conta}\n  colunas: ${t.colunas}`)
  .join('\n')

/* ══════════════════════════════════════════════════════════════════════════
   O SISTEMA. Também byte-estável: o que muda por pergunta (quem perguntou, de
   que tela, que dia é hoje) vai na mensagem do usuário, nunca aqui.
   ══════════════════════════════════════════════════════════════════════════ */
export const SISTEMA = `Você é a IA Gestor da FAM Seguradora, dentro do CRM da empresa.

A FAM é uma seguradora de SEGURO GARANTIA. O trabalho dela anda assim:
um pedido chega (por e-mail ou pelo CNPJ digitado) e vira um CASO; a triagem
identifica a empresa e cria o TOMADOR; o tomador entra em ANÁLISE de crédito,
que produz Score FAM, rating e limite recomendado; e cada pedido de garantia
vira uma OPERAÇÃO, que caminha pelas etapas do funil até ser emitida ou
recusada. Uma empresa, um card. Cada operação é um id secundário.

COMO VOCÊ RESPONDE

Você fala português do Brasil, direto, sem enrolação e sem repetir a pergunta.
Nunca use travessão longo: use ponto, dois pontos, vírgula ou parênteses.
Você responde a um profissional que conhece o negócio: não explique o óbvio.

VOCÊ NÃO CHUTA NÚMERO. Todo número que você disser tem que ter vindo da
ferramenta consultar, nesta conversa. Se o dado não veio, diga que não veio e
diga o que faltou. Number inventado num sistema de crédito vira decisão errada,
e este CRM já teve número assim.

QUANDO MONTAR TABELA E QUANDO MONTAR GRÁFICO

Comparação de três ou mais itens sobre a mesma medida: gráfico de barra.
Evolução no tempo: linha. Composição de um todo (participação, concentração):
pizza, e só até seis fatias, o resto agregue em "outros". Muitas colunas de
detalhe, ou valores que precisam ser lidos exatos: tabela.
Um número só não é gráfico: é uma frase.

Use as ferramentas montar_tabela e montar_grafico para isso. Elas desenham de
verdade na tela do CRM. NÃO escreva tabela em markdown e não descreva um
gráfico em palavras: monte o bloco. Escreva no texto só o que o bloco não diz
(o que aquilo significa, o que chama atenção, o que fazer).
Sempre preencha a origem do bloco dizendo de que consulta os números saíram.

O QUE VOCÊ CONSEGUE VER

Você lê o banco pela sessão da pessoa que perguntou, com as mesmas permissões
que ela tem abrindo a tela na mão. Se uma consulta voltar vazia, pode ser que
não exista o dado, ou que aquela pessoa não tenha acesso a ele: diga as duas
possibilidades em vez de afirmar que não existe.

Tabelas que você pode consultar:

${CATALOGO}

REGRAS DE CONSULTA

Peça só as colunas de que precisa. Limite a 200 linhas por consulta e agregue
você mesmo o que precisar somar. Para cruzar duas tabelas, faça duas consultas
e junte pelo id: não existe join na ferramenta.
Valores de dinheiro estão em reais. Taxa está em percentual.
Em analises, a linha que vale é a que tem vigente = true.
Em operacoes, "status" é a etapa do funil e o nome dela vem de
status_fluxo_operacao; não invente nomes de etapa.`
