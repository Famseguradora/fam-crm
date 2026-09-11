'use client'

// ============================================================================
//  GESTÃO  ·  o relatório gerencial do mês
//
//  Até 11/09/2026 esta aba era o retrato do acervo (as vigentes de hoje). Nesse
//  dia o Marco pediu que ela virasse o relatório de performance da FAM inteira,
//  por mês, juntando a entrada de e-mails, as análises e o funil. O retrato do
//  acervo continua inteiro na Sala de Comando, com as mesmas contas
//  (lib/analise/retrato.ts), e o relatório usa essas contas sobre as análises
//  do mês.
//
//  As telas "Sua performance" e "Análise prévia" do cockpit eram por pessoa e
//  dependem de material que só existe no notebook; seguem no Sistema local.
// ============================================================================

import RelatorioMensal from '@/components/gestao/RelatorioMensal'

export default function Gestao() {
  return <RelatorioMensal />
}
