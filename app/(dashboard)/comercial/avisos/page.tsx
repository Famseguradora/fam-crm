'use client'

/* OS AVISOS DA LINHA DO TEMPO DO PEDIDO · a tela mora em
   components/comercial/AvisosDoPedido.tsx; a página só dá o lugar dela no CRM,
   ao lado da Entrada do Comercial e da régua do e-mail. */

import { useRouter } from 'next/navigation'
import AvisosDoPedido from '@/components/comercial/AvisosDoPedido'
import { IcoVoltar } from '@/components/tomador/icones'
import { cor, texto } from '@/lib/ui/painel'

export default function AvisosDoPedidoPage() {
  const router = useRouter()
  return (
    <div style={{ padding: '18px 0 40px' }}>
      <button type="button" className="mt-voltar" onClick={() => router.push('/comercial')}>
        <IcoVoltar /> Comercial
      </button>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: cor.tinta, margin: '10px 0 4px' }}>
        Avisos do pedido
      </h1>
      <p style={{ ...texto.apoio, maxWidth: '80ch', marginBottom: 16 }}>
        Cada vez que um pedido anda de etapa (chegou, triagem e cadastro, análise de crédito,
        subscrição), nasce aqui um aviso pronto para sair. Por padrão ele espera a sua ordem;
        na régua, cada nó pode passar a sair sozinho.
      </p>
      <AvisosDoPedido />
    </div>
  )
}
