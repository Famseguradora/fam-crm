'use client'

// O relatório V13 dentro do card oficial. O card continua sendo a unidade de
// colaboração: Arquivos, Análise, IA, Encaminhar e Atividades ficam ao redor.
// Nesta aba, Marco trabalha no documento integral quando o Sistema de Análise
// local responde; os colegas continuam com a leitura compartilhada do CRM.

import { useState } from 'react'
import type { FichaAnalise } from '@/lib/analise/ficha'
import RelatorioCompleto from './RelatorioCompleto'
import { linkRelatorio } from './card/comum'

type Modo = 'integral' | 'crm'

export default function RelatorioNoFluxo({
  ficha,
  chave,
  sistemaLocal,
  aoCarregar,
}: {
  ficha: FichaAnalise
  chave: string | null
  sistemaLocal: boolean
  aoCarregar: (ficha: FichaAnalise | null) => void
}) {
  const podeAbrirIntegral = sistemaLocal && !!chave
  const [preferencia, setPreferencia] = useState<Modo | null>(null)
  const modo: Modo = preferencia === 'crm' ? 'crm' : podeAbrirIntegral ? 'integral' : 'crm'

  return (
    <div className="an-relatorio-fluxo">
      <div className="an-relatorio-comando">
        <div className="an-relatorio-modos" role="tablist" aria-label="Modo do relatório">
          <button type="button" role="tab" aria-selected={modo === 'integral'}
            disabled={!podeAbrirIntegral} onClick={() => setPreferencia('integral')}>
            Relatório completo
          </button>
          <button type="button" role="tab" aria-selected={modo === 'crm'} onClick={() => setPreferencia('crm')}>
            Base compartilhada
          </button>
        </div>
        <span className="an-relatorio-estado">
          {modo === 'integral'
            ? 'Documento V13 completo, com edição e motor local'
            : 'Leitura oficial disponível para a equipe no CRM'}
        </span>
        {podeAbrirIntegral && modo === 'integral' && (
          <a className="an-bt mini" href={linkRelatorio(chave!)} target="_blank" rel="noopener">
            Abrir em janela
          </a>
        )}
      </div>

      {modo === 'integral' && podeAbrirIntegral ? (
        <div className="an-relatorio-integral">
          <iframe
            title={`Relatório completo de ${ficha.razao_social}`}
            src={linkRelatorio(chave!)}
            allow="fullscreen"
          />
        </div>
      ) : (
        <RelatorioCompleto analiseId={ficha.id} semCabecalho aoCarregar={aoCarregar} />
      )}
    </div>
  )
}
