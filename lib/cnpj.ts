// ============================================================================
//  CONSULTA DE CNPJ NA RECEITA, pela BrasilAPI (pública, sem chave).
//
//  Pedido do Marco em 30/08/2026: o CNPJ passa a ser obrigatório no Cadastro
//  Básico, validado pelo dígito, e o cartão CNPJ completa o cadastro sozinho.
//  Esta é a fonte única da consulta: o Cadastro Básico (Operações), a edição do
//  tomador (Mesa) e a Triagem usam a mesma função.
//
//  O que ela devolve é só o que o CRM tem coluna para guardar. O porte da
//  Receita (ME/EPP/Demais) NÃO é o porte da FAM (Small/Middle/Corporate/
//  Large): não se mistura, então ele não vem.
//
//  ─── O 403 QUE PARECIA "A API ESTÁ ERRADA" (09/09/2026) ────────────────────
//
//  A BrasilAPI está atrás da Cloudflare, e a Cloudflare BLOQUEIA requisição sem
//  User-Agent. Medido nesta máquina, no mesmo minuto, com o mesmo CNPJ:
//
//      sem User-Agent (era o que este arquivo fazia)   403 Forbidden, sempre
//      User-Agent 'Mozilla/5.0' genérico               429 Too Many Requests
//      User-Agent que identifica a FAM                 200 OK
//
//  E o defeito era INVISÍVEL do lado da tela: no navegador o Chrome põe o
//  User-Agent dele e a consulta passava, então o botão "Receita" funcionava e
//  o cadastro feito PELO SERVIDOR (pré-cadastro da Triagem, "＋ Novo pelo
//  CNPJ", Finalizar Análise) nascia sem endereço, sem telefone e sem sócios,
//  com a observação "a Receita não respondeu" que ninguém lia.
//
//  Por isso duas coisas mudaram aqui:
//  1. TODA chamada leva User-Agent identificando o CRM. É o que a BrasilAPI
//     pede de quem usa a API pública, e é o que separa a FAM da fila anônima.
//  2. QUEM CHAMA DA TELA NÃO FALA COM A BRASILAPI. Passa por /api/cnpj, que
//     tem cache e uma fila só. Antes, cada navegador da FAM somava no mesmo
//     limite por IP e o quinto cadastro do dia tomava 429 sem explicação.
// ============================================================================

import { validarCNPJ } from '@/lib/utils'

export interface CartaoCNPJ {
  razao_social: string
  nome_fantasia: string | null
  cep: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  telefone: string | null
  email: string | null
  situacao: string | null
  abertura: string | null
  capital_social: number | null
  cnae: string | null
  socios: { nome: string; qualificacao: string | null; documento: string | null; entrada: string | null }[]
}

const limpo = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  return s ? s : null
}

/** Nome em CAIXA ALTA da Receita vira Título, sem quebrar siglas curtas (S.A, ME).
 *  O "S.A." (30/09/2026): o padrão antigo era `S\.a\.?\b`, e depois do ponto
 *  final não há fronteira de palavra; ele casava só "S.a", trocava por "S.A." e
 *  o ponto original sobrava. Oito tomadores e cinco casos foram gravados com
 *  "S.A..". Agora o ponto é consumido depois da fronteira. */
export function tituloReceita(s: string): string {
  return s.toLowerCase().replace(/(^|\s|\.|\/)(\S)/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, m => m.toLowerCase())
    .replace(/\bLtda\b/g, 'Ltda').replace(/\bS\.a\b\.?/gi, 'S.A.').replace(/\bEireli\b/gi, 'EIRELI')
    .replace(/\bMe\b/g, 'ME').replace(/\bEpp\b/g, 'EPP').replace(/\bSpe\b/g, 'SPE')
}

/** O nome para LER na tela, sem mudar o dado. Pedido dele em 30/09/2026: "as
 *  informações são escritas feias, o nome do tomador está maiúsculo".
 *  Só mexe no que chegou TODO em caixa alta (o nome do Serasa, o assunto do
 *  e-mail): vira Título pelo `tituloReceita`. Palavra curta sem vogal é sigla
 *  e volta a ser sigla em qualquer caso (FBS, MGM, MDS), porque "Fbs", que o
 *  próprio `tituloReceita` grava no cadastro, é pior que "FBS". O resto de um
 *  texto em caixa normal passa intacto. E o "S.A.." gravado pelo defeito antigo
 *  do `tituloReceita` sai com um ponto só. */
export function nomeDeExibicao(s: string | null | undefined): string {
  const t = String(s ?? '').trim().replace(/\.{2,}(?=\s|$)/g, '.')
  const letras = t.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '')
  const altas = letras.replace(/[^A-ZÀ-ÖØ-Þ]/g, '').length
  const base = letras.length >= 4 && altas / letras.length >= 0.8 ? tituloReceita(t) : t
  return base.replace(
    /(^|[\s(/-])([A-Za-zÀ-ÖØ-öø-ÿ]{2,4})(?=$|[\s),./-])/g,
    (m, a: string, w: string) => (/[aeiouyáéíóúâêôãõàü]/i.test(w) || /^(jr|sr|dr|dra|sra)$/i.test(w) ? m : a + w.toUpperCase()),
  )
}

/* O User-Agent. A BrasilAPI é pública e mantida por voluntários: identificar
   quem chama é a etiqueta pedida por eles, e aqui é também o que faz a
   requisição passar pela Cloudflare em vez de tomar 403. Não invente um
   navegador falso: 'Mozilla/5.0' cai na fila de todo mundo e toma 429. */
const IDENTIDADE = 'FAM-CRM/1.0 (+https://famseguradora.com.br; seguro garantia)'

/** Converte o JSON da BrasilAPI no cartão que o CRM guarda. Fica separado da
 *  requisição para a rota do servidor poder reusar sem repetir o de-para. */
export function cartaoDoJson(j: Record<string, unknown>): CartaoCNPJ {
  const ddd = limpo(j.ddd_telefone_1)
  const qsa = Array.isArray(j.qsa) ? j.qsa : []

  return {
    razao_social: tituloReceita(String(j.razao_social ?? '')),
    nome_fantasia: limpo(j.nome_fantasia) ? tituloReceita(String(j.nome_fantasia)) : null,
    cep: limpo(j.cep)?.replace(/\D/g, '') ?? null,
    endereco: limpo(j.logradouro) ? tituloReceita([j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ')) : null,
    numero: limpo(j.numero),
    complemento: limpo(j.complemento) ? tituloReceita(String(j.complemento)) : null,
    bairro: limpo(j.bairro) ? tituloReceita(String(j.bairro)) : null,
    cidade: limpo(j.municipio) ? tituloReceita(String(j.municipio)) : null,
    estado: limpo(j.uf),
    telefone: ddd ? ddd.replace(/\D/g, '') : null,
    email: limpo(j.email)?.toLowerCase() ?? null,
    situacao: limpo(j.descricao_situacao_cadastral),
    abertura: limpo(j.data_inicio_atividade),
    capital_social: typeof j.capital_social === 'number' ? j.capital_social : null,
    cnae: limpo(j.cnae_fiscal_descricao),
    socios: qsa.map((s: Record<string, unknown>) => ({
      nome: tituloReceita(String(s.nome_socio ?? '')),
      qualificacao: limpo(s.qualificacao_socio),
      documento: limpo(s.cnpj_cpf_do_socio),
      entrada: limpo(s.data_entrada_sociedade),
    })).filter((s: { nome: string }) => s.nome),
  }
}

/**
 * A CONSULTA DIRETA NA BRASILAPI. É para uso do SERVIDOR (rotas, o motor da
 * análise, a carga). Da tela, use `consultarCNPJpelaTela`, que passa pelo CRM
 * e aproveita o cache.
 *
 * Lança com mensagem legível quando o CNPJ é inválido, não existe, ou a API
 * falhou: quem chama mostra a mensagem e segue sem preencher.
 */
export async function consultarCNPJ(cnpj: string): Promise<CartaoCNPJ> {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14 || !validarCNPJ(d)) throw new Error('CNPJ inválido: confira os dígitos.')

  /* ─── A SEGUNDA FONTE (08/10/2026) ───────────────────────────────────────
     O botão "Receita" do Cadastro Básico deu "Não consegui consultar a Receita
     agora" com o CNPJ 09.944.104/0001-29. A BrasilAPI respondia 500 depois de
     5 segundos PARA ESSE CNPJ (o fornecedor dela por trás caiu), e para outros
     respondia 200 na hora. As três tentativas com espera somavam uns 20
     segundos, a função do servidor estourava o tempo, e a tela recebia uma
     página de erro em vez da mensagem.
     Agora: cada chamada tem teto de 7 segundos; 429/403 (fila) tenta a
     BrasilAPI mais uma vez; erro de servidor ou silêncio vai direto para a
     CNPJ.ws (pública, outra base), que respondeu o mesmo CNPJ em meio segundo.
     404 continua definitivo: não existe na Receita. */
  let ultimoErro = 'Sem resposta da Receita agora. Preencha à mão ou tente de novo.'

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    let res: Response
    try {
      res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, {
        cache: 'no-store',
        headers: { 'User-Agent': IDENTIDADE, Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      })
    } catch {
      break // sem resposta: a segunda fonte, sem gastar mais tempo aqui
    }

    if (res.ok) return cartaoDoJson(await res.json())

    if (res.status === 404) throw new Error('CNPJ não encontrado na Receita.')

    if ((res.status === 429 || res.status === 403) && tentativa < 2) {
      ultimoErro = 'A consulta à Receita está com muitas chamadas agora. Tente de novo em alguns segundos.'
      await new Promise((r) => setTimeout(r, 1200))
      continue
    }
    break
  }

  try {
    return await consultarCnpjWs(d)
  } catch (e: unknown) {
    if (e instanceof Error && /não encontrado/i.test(e.message)) throw e
    throw new Error(ultimoErro)
  }
}

/** A CNPJ.ws, a fonte de reserva. Ela também é pública e sem chave (3 consultas
 *  por minuto), e devolve o cartão num formato diferente: aqui ele vira o
 *  mesmo `CartaoCNPJ`, com os campos escritos como a BrasilAPI escreve. */
async function consultarCnpjWs(d: string): Promise<CartaoCNPJ> {
  const res = await fetch(`https://publica.cnpj.ws/cnpj/${d}`, {
    cache: 'no-store',
    headers: { 'User-Agent': IDENTIDADE, Accept: 'application/json' },
    signal: AbortSignal.timeout(7000),
  })
  if (res.status === 404) throw new Error('CNPJ não encontrado na Receita.')
  if (!res.ok) throw new Error(`CNPJ.ws ${res.status}`)
  const j = await res.json()
  const e = (j.estabelecimento ?? {}) as Record<string, unknown>
  const obj = (v: unknown) => (v && typeof v === 'object' ? v as Record<string, unknown> : {})
  const ddd = limpo(e.ddd1), fone = limpo(e.telefone1)
  const capital = Number(j.capital_social)
  const socios = Array.isArray(j.socios) ? j.socios : []

  return {
    razao_social: tituloReceita(String(j.razao_social ?? '')),
    nome_fantasia: limpo(e.nome_fantasia) ? tituloReceita(String(e.nome_fantasia)) : null,
    cep: limpo(e.cep)?.replace(/\D/g, '') ?? null,
    endereco: limpo(e.logradouro) ? tituloReceita([e.tipo_logradouro, e.logradouro].filter(Boolean).join(' ')) : null,
    numero: limpo(e.numero),
    complemento: limpo(e.complemento) ? tituloReceita(String(e.complemento)) : null,
    bairro: limpo(e.bairro) ? tituloReceita(String(e.bairro)) : null,
    cidade: limpo(obj(e.cidade).nome) ? tituloReceita(String(obj(e.cidade).nome)) : null,
    estado: limpo(obj(e.estado).sigla),
    telefone: ddd && fone ? (ddd + fone).replace(/\D/g, '') : null,
    email: limpo(e.email)?.toLowerCase() ?? null,
    situacao: limpo(e.situacao_cadastral)?.toUpperCase() ?? null,
    abertura: limpo(e.data_inicio_atividade),
    capital_social: Number.isFinite(capital) ? capital : null,
    cnae: limpo(obj(e.atividade_principal).descricao),
    socios: socios.map((s: Record<string, unknown>) => ({
      nome: tituloReceita(String(s.nome ?? '')),
      qualificacao: limpo(obj(s.qualificacao_socio).descricao),
      documento: limpo(s.cpf_cnpj_socio),
      entrada: limpo(s.data_entrada),
    })).filter((s: { nome: string }) => s.nome),
  }
}

/**
 * A CONSULTA FEITA PELA TELA. Vai ao CRM, e o CRM vai à Receita.
 *
 * Três motivos para não falar direto com a BrasilAPI daqui:
 * o cache mora no servidor (o mesmo CNPJ consultado três vezes no dia é uma
 * chamada só), a identificação da FAM vai junto (sem ela é 403), e a fila do
 * limite por minuto passa a ser uma, e não uma por navegador aberto na FAM.
 */
export async function consultarCNPJpelaTela(cnpj: string): Promise<CartaoCNPJ> {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14 || !validarCNPJ(d)) throw new Error('CNPJ inválido: confira os dígitos.')

  let res: Response
  try {
    res = await fetch(`/api/cnpj/${d}`, { cache: 'no-store' })
  } catch {
    throw new Error('A conexão com o CRM caiu. Tente de novo.')
  }

  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.erro ?? 'Não consegui consultar a Receita agora.')
  return j.cartao as CartaoCNPJ
}
