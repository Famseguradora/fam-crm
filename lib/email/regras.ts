/* AS REGRAS DO CARTEIRO — o que entra na caixa do CRM e o que fica de fora.
   Portado de `_sistema/outlook.mjs` (avaliarEmail + os modelos de texto), que é
   o sistema que vai ser descartado.

   POR QUE ELAS MORAM AQUI, NO SERVIDOR, e não na máquina que lê o Outlook:
   as regras estão no banco (`email_regras`), e quem lê a caixa é um cano burro.
   Assim a mesma régua vale para o Carteiro, para o upload e para o Graph
   amanhã, e mudar uma regra não exige mexer em nada instalado na máquina de
   ninguém. Era esse o defeito do desenho antigo: a regra vivia num JSON no
   disco da máquina do analista.

   NADA AQUI USA IA. É regra determinística de propósito: resultado de regra se
   audita, resultado de IA se confere. Quando a IA entrar (Subscrição), ela vira
   mais uma opinião ao lado desta, com o mesmo formato de saída, e nunca
   substitui a régua calada. */

/** Uma linha de `email_regras`. Os padrões batem com os defaults da migration. */
export interface RegrasEmail {
  ligado: boolean
  pasta: string
  so_com_anexo: boolean
  so_nao_lidos: boolean
  so_remetente_interno: boolean
  dias_para_tras: number
  max_por_rodada: number
  remetentes: string[]
  assunto_contem: string[]
  assunto_ignora: string[]
  acolher_sozinho: boolean
  responder_ao_trazer: 'nao' | 'rascunho' | 'enviar'
  resposta_assunto: string
  resposta_texto: string
  pedido_texto: string
}

/* O DOMÍNIO INTERNO DA FAM (10/09/2026). Ordem do Marco: "eu recebo os e-mails
   internos, então as análises só são feitas quando o remetente é da FAM" — o
   pedido de análise chega quase sempre por alguém da casa encaminhando o que a
   corretora mandou (é a mesma suposição que `acharCorretoraNoEmail` já fazia:
   "o remetente é sempre a FAM encaminhando; a corretora está no corpo").

   É CONSTANTE, e não um campo de tela: é o domínio da empresa, não uma
   preferência de caixa. Fica aqui, e não redigitado em cada lugar que precisar
   dele. */
export const DOMINIO_INTERNO_FAM = 'famseguradora.com.br'

/* A RÉGUA NÃO ESCONDE E-MAIL DO DONO DA CAIXA (08/09/2026).
   Ordem do Marco: "eu preciso ver todos os e-mails e a meu critério eu trago
   para a esteira de análise". Então ela deixou de ser um filtro de existência e
   virou o que sempre deveria ter sido: um DESTAQUE.

     o que ela aprova   entra em "Para análise" E a FAM inteira vê (é o pedido
                        de análise, que vira caso)
     o que ela recusa   continua na lista, na aba "Todos", com o motivo à vista,
                        e SÓ O DONO DA CAIXA enxerga (é a RLS que garante)

   Por isso `so_com_anexo` continua ligado de fábrica, e agora sem custo para
   quem é dono: ele não perde e-mail nenhum de vista, e a caixa pessoal de um
   colega (RH, médico, família) não vaza para a empresa por causa de um flag.

   DIAS E MÁXIMO SUBIRAM (3→7 dias, 40→200). O 40 era o teto que fazia a caixa
   dele parar nos 40 e-mails exatos e parecer que o sistema "não trazia tudo".
   A varredura ficou barata o bastante para isso: o corpo que a máquina manda
   na lista foi cortado de 20 mil para 1,2 mil caracteres, e o servidor só grava
   o que MUDOU desde a última rodada. */
export const REGRAS_PADRAO: RegrasEmail = {
  ligado: false,
  pasta: '',
  so_com_anexo: true,
  so_nao_lidos: false,
  so_remetente_interno: true,
  dias_para_tras: 7,
  max_por_rodada: 200,
  remetentes: [],
  assunto_contem: [],
  assunto_ignora: [
    'fora do escritório',
    'out of office',
    'automatic reply',
    'entrega falhou',
    'undeliverable',
  ],
  acolher_sozinho: false,
  responder_ao_trazer: 'nao',
  resposta_assunto: '',
  resposta_texto: '',
  pedido_texto: '',
}

/** O cabeçalho que a régua precisa ver. É o que o Carteiro manda e o que a caixa guarda. */
export interface CabecalhoEmail {
  assunto?: string | null
  de?: string | null
  email_de?: string | null
  nao_lido?: boolean | null
  anexos_uteis?: number | null
}

/* Devolve `{ serve, motivo }` SEMPRE, inclusive para quem passou. O motivo é a
   parte que importa: sem ele a tela diria "3 de 27 e-mails" e ninguém saberia se
   os outros 24 eram propaganda ou a análise que se está esperando. Regra que não
   se explica vira suspeita, e regra que ninguém confia acaba contornada por fora
   do sistema.

   `serve: false` NÃO É "sumiu": é "não está em Para análise, e só o dono da
   caixa vê". Quem lê este resultado (a tela, a RLS) trata os dois casos assim. */
export function avaliarEmail(
  e: CabecalhoEmail,
  r: RegrasEmail = REGRAS_PADRAO,
): { serve: boolean; motivo: string } {
  const assunto = String(e.assunto ?? '').toLowerCase()
  const de = `${e.email_de ?? ''} ${e.de ?? ''}`.toLowerCase()

  for (const t of r.assunto_ignora ?? []) {
    if (t && assunto.includes(String(t).toLowerCase())) {
      return { serve: false, motivo: `Assunto tem "${t}".` }
    }
  }
  if (r.so_nao_lidos && !e.nao_lido) return { serve: false, motivo: 'Já lido.' }
  if (r.so_com_anexo && !((e.anexos_uteis ?? 0) > 0)) {
    return { serve: false, motivo: 'Sem anexo (só imagem de assinatura ou nenhum).' }
  }
  /* SÓ REMETENTE INTERNO (10/09/2026). O pedido de análise chega quase sempre
     por alguém da FAM encaminhando o que a corretora mandou. Corretora que
     escreve DIRETO para a caixa não vira pedido de análise sozinha: fica em
     "Todos", só o dono vê, e o dono decide na hora se traz mesmo assim (o
     clique nunca deixa de existir, isto só tira o auto). */
  if (r.so_remetente_interno && !de.includes(`@${DOMINIO_INTERNO_FAM}`)) {
    return { serve: false, motivo: `Remetente não é da FAM (@${DOMINIO_INTERNO_FAM}).` }
  }
  if ((r.remetentes ?? []).length) {
    const bate = r.remetentes.some((x) => de.includes(String(x).toLowerCase()))
    if (!bate) return { serve: false, motivo: 'Remetente fora da lista.' }
  }
  if ((r.assunto_contem ?? []).length) {
    const bate = r.assunto_contem.some((t) => assunto.includes(String(t).toLowerCase()))
    if (!bate) return { serve: false, motivo: 'Assunto não bate com a lista.' }
  }
  /* O motivo de quem PASSOU também é lido na tela, então ele não pode falar de
     anexo quando a régua nem exige anexo: seria a tela explicando uma regra que
     não foi aplicada. */
  return {
    serve: true,
    motivo: r.so_com_anexo ? 'Tem anexo e passou nas regras.' : 'Passou nas regras.',
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   OS TEXTOS QUE VÃO PARA A CORRETORA

   São MODELOS com lacunas, e não frases montadas em código: o texto vai mudar
   (ele já disse que sim), e texto de e-mail que só muda com deploy é texto que
   nunca muda. Ficam no banco, editáveis pela tela.

   A AUTORIZAÇÃO NÃO MORA AQUI. `responder_ao_trazer` é só como a caixinha
   aparece pré-marcada. Quem decide é o clique, que viaja junto do pedido.
   Ordem do Marco em 29/08/2026: "a mensagem só pode ser enviada com a minha
   autorização... isso é PRIORIDADE". Configuração é um estado que alguém ligou
   um dia e ninguém mais olhou; se ela mandasse no envio, bastaria ficar em
   'enviar' por engano para o sistema escrever a uma corretora sem ninguém ter
   decidido nada naquele momento.
   ──────────────────────────────────────────────────────────────────────────── */

export const RESPOSTA_PADRAO = [
  'Olá, {saudacao}',
  '',
  'Recebemos a documentação e a análise de crédito de {empresa} foi iniciada hoje, {data}.',
  '',
  'Como funciona daqui em diante:',
  '',
  '1. Conferência dos documentos recebidos ({documentos} arquivos)',
  '2. Leitura dos balanços, do Serasa e do contrato social',
  '3. Cálculo do Score e do Rating FAM',
  '4. Enquadramento no contrato de resseguro',
  '5. Retorno com o parecer e o limite',
  '',
  'Se faltar algum documento para concluir, entramos em contato antes de seguir.',
  '',
  'Atenciosamente,',
].join('\n')

export const PEDIDO_PADRAO = [
  'Olá, {saudacao}',
  '',
  'Recebemos o pedido de análise de {empresa}. Para darmos andamento, ainda precisamos de:',
  '',
  '{faltam}',
  '',
  'Assim que os documentos chegarem, a análise de crédito é iniciada e retornamos com o prazo.',
  '',
  'Atenciosamente,',
].join('\n')

export interface DadosDoTexto {
  de?: string
  empresa?: string
  cnpj?: string
  documentos?: number | string
  assunto?: string
  faltam?: string[]
}

/* `{saudacao}` sai do primeiro nome de quem escreveu, e cai para "bom dia"
   quando não dá para saber: nome errado num e-mail para corretora é pior do que
   nenhum nome. E `{empresa}` cai no ASSUNTO sem os "ENC:"/"RES:" na frente,
   porque "a análise de crédito de ENC: LE QUARTIER foi iniciada" entrega que o
   texto é montado por máquina, e mal. */
export function preencherTexto(modelo: string, dados: DadosDoTexto = {}): string {
  const primeiro = String(dados.de ?? '').split(/[|<(,]/)[0].trim().split(/\s+/)[0] ?? ''
  const troca: Record<string, string> = {
    saudacao: primeiro || 'bom dia',
    nome: primeiro,
    empresa:
      dados.empresa ||
      String(dados.assunto ?? '')
        .replace(/^\s*((RES|ENC|RE|FW|FWD)\s*:\s*)+/i, '')
        .trim() ||
      // Sem nada, a lacuna fica VISÍVEL: melhor "{empresa}" do que "análise de do tomador".
      '{empresa}',
    cnpj: dados.cnpj ?? '',
    documentos: String(dados.documentos ?? ''),
    data: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
    assunto: dados.assunto ?? '',
    faltam: (dados.faltam ?? []).map((x) => `• ${String(x).trim()}`).filter((x) => x !== '• ').join('\n'),
  }
  return String(modelo || '').replace(/\{(\w+)\}/g, (todo, chave: string) =>
    chave in troca ? troca[chave] : todo,
  )
}
