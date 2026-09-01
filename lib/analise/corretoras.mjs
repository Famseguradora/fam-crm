// ============================================================================
//  A CORRETORA DA ANÁLISE, CASADA COM A DO CRM
//
//  Ordem dele, em 31/08/2026:
//    "as corretoras já estão cadastradas no CRM, quando a IA identificar a
//     corretora dentro do sistema de análise de crédito, tem que buscar no
//     sistema e cadastrar com o mesmo nome."
//
//  O PROBLEMA, MEDIDO ANTES DE ESCREVER UMA LINHA
//  ---------------------------------------------------------------------------
//  As 131 análises no banco trazem 43 grafias diferentes de corretora. Batendo
//  texto com texto contra as 98 corretoras cadastradas, só 8 encontravam par.
//  A mesma casa aparece como "ATIX SEGUROS" na análise e "Atix Servicos e
//  Corretagem de Seguros" no cadastro; "WIZ" e "Wiz Corporate Soluções e
//  Corretagem de Seguros Ltda"; "WTW" e "Willis Towers Watson". Nenhuma dessas
//  é erro de ninguém: é o nome curto que a mesa usa contra o nome de contrato.
//
//  POR QUE ESTE ARQUIVO É .mjs, E NÃO .ts
//  ---------------------------------------------------------------------------
//  Ele é usado por três bocas: a rota do CRM (TypeScript), a carga que leva as
//  análises para o banco (`scripts/carga-analises.mjs`, Node puro) e, do outro
//  lado, o motor da análise, que pergunta por HTTP. Regra de casamento de nome
//  escrita duas vezes vira duas regras diferentes no terceiro mês, e aí o nome
//  gravado depende de qual porta gravou.
//
//  A REGRA, E O QUE ELA SE RECUSA A FAZER
//  ---------------------------------------------------------------------------
//  Duas corretoras diferentes NÃO podem virar uma. Então, sempre que houver mais
//  de uma candidata, a resposta é "não achei" — nunca a primeira da lista.
//  Vínculo errado é pior que vínculo vazio: ele desce para o tomador, do tomador
//  para a operação, e ninguém revisa um campo que já está preenchido.
// ============================================================================

/**
 * Enfeite jurídico e comercial. Sai do nome antes de comparar, porque é o que
 * varia entre quem escreve o nome curto e quem escreve o nome do contrato.
 * A lista nasceu do `normalizar.mjs` do sistema de análises, que já vinha
 * unificando as grafias do acervo desde 14/08/2026.
 */
const RUIDO = /\b(seguros?|seguradora|corretora|corretores|corretagens?|de|do|da|e|em|ltda|epp|me|sa|s\/a|s\.a|eireli|consultoria|consultoria|administradora|adm|assessoria|solucoes|servicos|brasil|group|grupo|capital|insurance|investimentos|holding)\b/g

/**
 * As palavras que sobram de um nome de corretora, minúsculas, sem acento e
 * ORDENADAS.
 *
 * A ordenação não é enfeite: "WTW, Willis Corretores de Seguros" e "Willis
 * Corretores de Seguros (WTW)" são a mesma casa escrita ao contrário, e
 * comparadas na ordem em que vieram ficariam separadas para sempre.
 *
 * @param {unknown} nome
 * @returns {string[]}
 */
export function palavrasCorretora(nome) {
  return String(nome ?? '')
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(RUIDO, ' ')
    .split(/\s+/).filter(Boolean)
    .sort()
}

/**
 * As mesmas palavras, coladas: serve de chave de igualdade.
 * @param {unknown} nome
 * @returns {string}
 */
export function chaveCorretora(nome) {
  return palavrasCorretora(nome).join('')
}

/**
 * Nome longo demais não é nome, é frase. O acervo tem uma análise cuja
 * "corretora" é um parágrafo inteiro explicando que o corretor ainda não foi
 * cadastrado. Tentar casar isso só produziria par errado.
 */
const TETO_NOME = 80

/** Uma palavra de duas letras não identifica ninguém sozinha. */
const temPalavraForte = (ps) => ps.some((p) => p.length >= 3)

/** @param {string[]} menor @param {string[]} maior */
const contidoEm = (menor, maior) => menor.every((p) => maior.includes(p))

/**
 * @typedef {object} CorretoraCRM
 * @property {string} id
 * @property {string} razao_social
 * @property {string|null} [nome_fantasia]
 * @property {string|null} [cnpj]
 */

/**
 * @typedef {object} Par
 * @property {boolean} achou
 * @property {string} nome_cru        o que a análise trouxe
 * @property {string|null} nome       o nome do CRM, que é o que passa a valer
 * @property {string|null} corretora_id
 * @property {string|null} razao_social
 * @property {string|null} cnpj
 * @property {string} como           por que casou (ou por que não)
 */

/**
 * Casa UM nome contra a lista de corretoras do CRM.
 *
 * Quatro degraus, do mais seguro para o menos, e cada um só vale quando devolve
 * UMA candidata:
 *
 *   1. as palavras do nome batem exatamente com a RAZÃO SOCIAL
 *   2. ... ou com o NOME FANTASIA
 *   3. as palavras de um estão contidas nas do outro, pela razão social
 *      ("ATIX" dentro de "Atix Serviços e Corretagem")
 *   4. ... ou pelo nome fantasia ("WTW" dentro de "Willis - WTW")
 *
 * A razão social vem antes do fantasia de propósito: duas corretoras podem
 * dividir o mesmo nome fantasia (a Bravo Brasil e a Bravo Brasil SP dividem), e
 * sem esse desempate as duas ficariam empatadas e nenhuma seria escolhida.
 *
 * @param {unknown} nomeCru
 * @param {CorretoraCRM[]} lista
 * @returns {Par}
 */
export function casarCorretora(nomeCru, lista) {
  const nome = String(nomeCru ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const vazio = {
    achou: false, nome_cru: nome, nome: null,
    corretora_id: null, razao_social: null, cnpj: null,
  }
  if (!nome) return { ...vazio, como: 'sem nome de corretora na análise' }
  if (nome.length > TETO_NOME) return { ...vazio, como: 'texto longo demais para ser um nome de corretora' }

  const ps = palavrasCorretora(nome)
  if (!ps.length || !temPalavraForte(ps)) return { ...vazio, como: 'nome curto ou genérico demais para casar' }
  const chave = ps.join('')

  const cs = (lista ?? []).map((c) => ({
    c,
    razao: palavrasCorretora(c.razao_social),
    fantasia: palavrasCorretora(c.nome_fantasia),
  }))

  const escolher = (achadas, como) => {
    if (achadas.length !== 1) return null
    const c = achadas[0].c
    return {
      achou: true,
      nome_cru: nome,
      // O NOME QUE PASSA A VALER é o mesmo que o CRM mostra em toda tela dele:
      // o fantasia quando existe, a razão social quando não. Gravar a razão
      // social crua faria a análise dizer "Marsh Corretora de Seguros Ltda"
      // onde o CRM inteiro diz "Marsh Seguros".
      nome: (c.nome_fantasia || '').trim() || c.razao_social,
      corretora_id: c.id,
      razao_social: c.razao_social,
      cnpj: c.cnpj ?? null,
      como,
    }
  }

  return escolher(cs.filter((x) => x.razao.join('') === chave), 'a razão social do cadastro')
    ?? escolher(cs.filter((x) => x.fantasia.length && x.fantasia.join('') === chave), 'o nome fantasia do cadastro')
    ?? escolher(cs.filter((x) => x.razao.length && temPalavraForte(x.razao)
      && (contidoEm(x.razao, ps) || contidoEm(ps, x.razao))), 'as palavras da razão social')
    ?? escolher(cs.filter((x) => x.fantasia.length && temPalavraForte(x.fantasia)
      && (contidoEm(x.fantasia, ps) || contidoEm(ps, x.fantasia))), 'as palavras do nome fantasia')
    ?? { ...vazio, como: 'não achei esta corretora no cadastro do CRM' }
}

/**
 * O mesmo, para uma lista de nomes de uma vez. Devolve um de-para pronto para
 * ser guardado em arquivo pelo motor da análise, que roda longe do banco.
 *
 * A chave é o nome CRU, e não a chave normalizada, porque quem consulta do outro
 * lado tem em mãos o que a IA escreveu, e não o resultado desta normalização.
 *
 * @param {unknown[]} nomes
 * @param {CorretoraCRM[]} lista
 * @returns {Record<string, Par>}
 */
export function casarVarias(nomes, lista) {
  /** @type {Record<string, Par>} */
  const mapa = {}
  for (const n of nomes ?? []) {
    const chave = String(n ?? '').trim()
    if (!chave || mapa[chave]) continue
    mapa[chave] = casarCorretora(chave, lista)
  }
  return mapa
}
