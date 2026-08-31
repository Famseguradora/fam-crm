// ============================================================================
//  UMA FORMA SÓ DE CNPJ — `lib/analise/cnpj.ts`
//
//  O motor lê o CNPJ do `_cadastro.json`, onde ele está MASCARADO
//  ("16.600.690/0001-50"). A tabela `tomadores` do CRM guarda SEM MÁSCARA
//  ("16600690000150"). São o mesmo número escrito de dois jeitos.
//
//  Guardar o evento como ele chega faria a busca do card nunca casar, e o modo
//  como isso falha é o pior possível: não dá erro, não aparece nada vermelho, a
//  caixa da análise simplesmente não aparece no card e ninguém sabe por quê.
//
//  Por isso a normalização mora aqui, num lugar só, e as três rotas do motor
//  passam por ela. Achado em 31/08/2026, antes de chegar na tela.
// ============================================================================

/** Devolve só os dígitos do CNPJ, ou null se não sobrar nada. */
export function soDigitos(v: string | undefined | null): string | null {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length ? d.slice(0, 14) : null
}
