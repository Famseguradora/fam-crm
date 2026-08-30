// ============================================================
//  CONSULTA DE CNPJ NA RECEITA, pela BrasilAPI (pública, sem chave).
//
//  Pedido do Marco em 30/08/2026: o CNPJ passa a ser obrigatório no Cadastro
//  Básico, validado pelo dígito, e o cartão CNPJ completa o cadastro sozinho.
//  Esta é a fonte única da consulta: o Cadastro Básico (Operações) e a edição
//  do tomador (Mesa) usam a mesma função.
//
//  O que ela devolve é só o que o CRM tem coluna para guardar. O porte da
//  Receita (ME/EPP/Demais) NÃO é o porte da FAM (Small/Middle/Corporate/
//  Large): não se mistura, então ele não vem.
// ============================================================

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

/**
 * Consulta o CNPJ. Lança com mensagem legível quando o CNPJ é inválido, não
 * existe, ou a API falhou: quem chama mostra a mensagem e segue sem preencher.
 */
export async function consultarCNPJ(cnpj: string): Promise<CartaoCNPJ> {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14 || !validarCNPJ(d)) throw new Error('CNPJ inválido: confira os dígitos.')

  let res: Response
  try {
    res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, { cache: 'no-store' })
  } catch {
    throw new Error('Sem resposta da Receita agora. Preencha à mão ou tente de novo.')
  }
  if (res.status === 404) throw new Error('CNPJ não encontrado na Receita.')
  if (!res.ok) throw new Error(`A consulta falhou (${res.status}). Preencha à mão ou tente de novo.`)

  const j = await res.json()
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
