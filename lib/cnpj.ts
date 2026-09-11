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

/** Nome em CAIXA ALTA da Receita vira Título, sem quebrar siglas curtas (S.A, ME). */
export function tituloReceita(s: string): string {
  return s.toLowerCase().replace(/(^|\s|\.|\/)(\S)/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, m => m.toLowerCase())
    .replace(/\bLtda\b/g, 'Ltda').replace(/\bS\.a\.?\b/gi, 'S.A.').replace(/\bEireli\b/gi, 'EIRELI')
    .replace(/\bMe\b/g, 'ME').replace(/\bEpp\b/g, 'EPP').replace(/\bSpe\b/g, 'SPE')
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

  /* TRÊS TENTATIVAS, com espera crescente. 429 é o limite por minuto da API
     pública, e ele passa: desistir na primeira transforma um segundo de espera
     num cadastro nascido sem endereço. 404 NÃO é tentado de novo: já é
     definitivo, e insistir só gasta a cota de quem vier depois. */
  let ultimoErro = 'Sem resposta da Receita agora.'

  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    let res: Response
    try {
      res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, {
        cache: 'no-store',
        headers: { 'User-Agent': IDENTIDADE, Accept: 'application/json' },
      })
    } catch {
      ultimoErro = 'Sem resposta da Receita agora. Preencha à mão ou tente de novo.'
      if (tentativa < 3) await new Promise((r) => setTimeout(r, tentativa * 1200))
      continue
    }

    if (res.ok) return cartaoDoJson(await res.json())

    if (res.status === 404) throw new Error('CNPJ não encontrado na Receita.')

    if (res.status === 429 || res.status === 403) {
      ultimoErro = 'A consulta à Receita está com muitas chamadas agora. Tente de novo em alguns segundos.'
    } else {
      ultimoErro = `A consulta falhou (${res.status}). Preencha à mão ou tente de novo.`
    }
    if (tentativa < 3) await new Promise((r) => setTimeout(r, tentativa * 1200))
  }

  throw new Error(ultimoErro)
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
