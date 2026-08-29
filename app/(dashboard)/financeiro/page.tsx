// ============================================================================
//  FAM Financeiro — `/financeiro`
//
//  Componente de SERVIDOR de propósito: quem não tem acesso não recebe dado
//  nenhum, nem escondido no HTML. Tela de bloqueio dentro de componente client
//  seria só um `if` de renderização — o conteúdo já teria viajado.
//
//  Esta tela NÃO olha `perfil`. Ser admin do CRM não abre o caixa; quem manda é
//  `financeiro_acesso`, e só o Marco e o Aldeir concedem.
// ============================================================================
import { quemFinanceiro } from '@/lib/financeiro/acesso'
import FinanceiroTela from './FinanceiroTela'

export const dynamic = 'force-dynamic'

export default async function FinanceiroPage() {
  const quem = await quemFinanceiro()

  if (!quem.ve) {
    return (
      <div className="card-panel" style={{ maxWidth: 560 }}>
        <div className="section-title"><span className="dot" />Financeiro</div>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#3a4a5a' }}>
          Esta tela tem <b>lista própria de acesso</b>, separada do perfil do CRM: ser
          administrador aqui não vale. Quem libera é o <b>Marco</b> ou o <b>Aldeir</b>.
        </p>
      </div>
    )
  }

  return <FinanceiroTela quem={quem} />
}
