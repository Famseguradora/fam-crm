'use client'

export const dynamic = 'force-dynamic'

// ============================================================================
//  ANÁLISE DE CRÉDITO  ·  /analises  ·  A TELA ÚNICA
//
//  Ordem dele em 08/09/2026: "dentro do fluxo não podemos ter várias telas de
//  análise de crédito, devemos ter apenas uma tela".
//
//  Antes desta consolidação a análise aparecia em QUATRO lugares fora do
//  tomador, dois deles mostrando a mesma lista:
//
//     /analises .......................... a esteira
//     /analises/acervo ................... as análises publicadas
//     /analises/<id> ..................... o relatório de uma análise
//     /tomadores/analise-credito ......... o sistema embutido + a MESMA lista
//
//  Agora é uma tela com abas, no desenho da tela dele (o print de 08/09):
//
//     Mesa ...... o que está andando e o que precisa de gente (a esteira)
//     Acervo .... as análises prontas, com os KPIs e os filtros
//     Sistema ... o motor embutido, quando a máquina dele responde
//
//  O QUE NÃO FOI TOCADO, a pedido dele: a gaveta "Análise de crédito" dentro do
//  card do tomador. É lá que se lê o resultado de UMA empresa, e está certo.
//
//  As duas rotas antigas continuam vivas como atalho (redirecionam para cá),
//  para link salvo e favorito não morrerem.
// ============================================================================

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Esteira from '@/components/analise/Esteira'
import Acervo from '@/components/analise/Acervo'
import SistemaLocal from '@/components/analise/SistemaLocal'
import IaGestao from '@/components/analise/IaGestao'

type Aba = 'mesa' | 'acervo' | 'sistema'

const ABAS: { id: Aba; rotulo: string; dica: string }[] = [
  { id: 'mesa', rotulo: 'Mesa', dica: 'O que está rodando, o que travou e o que precisa de gente' },
  { id: 'acervo', rotulo: 'Acervo', dica: 'As análises publicadas, com os números do período' },
  { id: 'sistema', rotulo: 'Sistema', dica: 'O motor da análise embutido, quando roda nesta máquina' },
]

export default function AnaliseCreditoPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [aba, setAba] = useState<Aba>('mesa')

  // A aba na URL, para o link do menu e o favorito caírem no lugar certo.
  useEffect(() => {
    const q = params.get('aba')
    if (q === 'acervo' || q === 'sistema' || q === 'mesa') setAba(q)
  }, [params])

  const trocar = (nova: Aba) => {
    setAba(nova)
    router.replace(`/analises?aba=${nova}`, { scroll: false })
  }

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 28px) clamp(12px, 3vw, 32px) 30px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0a1628', margin: '0 0 4px' }}>
        Análise de crédito
      </h1>
      <div style={{ fontSize: 13, color: '#6080a0', marginBottom: 14 }}>
        A esteira, o acervo e o motor no mesmo lugar. O resultado de uma empresa continua
        dentro do card dela, na gaveta “Análise de crédito”.
      </div>

      {/* A aba de caderno do sistema dele: a escolhida é a folha branca na
          frente das outras. Mesmo desenho dos três olhares do Funil. */}
      <nav role="tablist" aria-label="Análise de crédito"
        style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {ABAS.map(a => (
          <button key={a.id} type="button" role="tab" title={a.dica}
            aria-selected={aba === a.id}
            onClick={() => trocar(a.id)}
            style={{
              padding: '8px 14px 9px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none', fontFamily: 'inherit',
              color: aba === a.id ? '#1e4080' : '#6080a0',
              borderBottom: `2px solid ${aba === a.id ? '#1e4080' : 'transparent'}`,
              marginBottom: -1,
            }}>
            {a.rotulo}
          </button>
        ))}
      </nav>

      {/* Os três desenhos ficam montados e escondidos, e não desmontados: trocar
          de aba não pode recomeçar a carga do banco a cada clique. */}
      <div hidden={aba !== 'mesa'}><Esteira /></div>
      <div hidden={aba !== 'acervo'}><Acervo /></div>
      {/* O iframe é a exceção: montar só quando pedido evita procurar o sistema
          local em quem nunca vai abrir esta aba. */}
      {aba === 'sistema' && <SistemaLocal />}

      {/* A IA que olha o acervo inteiro. Fica na tela toda, e não numa aba:
          a pergunta dele costuma nascer olhando a lista. */}
      <IaGestao />
    </div>
  )
}
