'use client'

// O relatório V13 dentro do card oficial. O card continua sendo a unidade de
// colaboração: Arquivos, Análise, IA, Encaminhar e Atividades ficam ao redor.
// Nesta aba, Marco trabalha no documento integral quando o Sistema de Análise
// local responde; os colegas continuam com a leitura compartilhada do CRM.

import { useState } from 'react'
import type { FichaAnalise } from '@/lib/analise/ficha'
import RelatorioCompleto from './RelatorioCompleto'
import { linkRelatorio } from './card/comum'
import { usePermissoes } from '@/lib/context/permissoes-context'

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
  const { editaAnalise } = usePermissoes()
  const [preferencia, setPreferencia] = useState<Modo | null>(null)
  /* NO SITE PUBLICADO (https), A LEITURA DO CRM É A PORTA (23/09/2026).
     "Ninguém consegue ver o relatório, nem eu": o Chrome deixa a página
     publicada enxergar o notebook depois que a permissão de rede local é dada,
     e aí `sistemaLocal` vira verdadeiro e o modo integral abria por padrão um
     iframe de http://127.0.0.1 dentro de uma página https — que fica em
     branco. A leitura do CRM vem do banco e funciona em qualquer lugar; o
     documento completo continua a um clique, para quem estiver na máquina.
     Em http://localhost o padrão é o de sempre. Esta tela só monta depois de a
     análise carregar, então `window` já existe. */
  const noAr = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const modo: Modo = preferencia === 'crm' ? 'crm'
    : podeAbrirIntegral && !noAr ? 'integral' : 'crm'

  return (
    <div className="an-relatorio-fluxo">
      <div className="an-relatorio-comando">
        {/* Sem o notebook por perto o "Relatório completo" só apareceria
            apagado, e um botão apagado lê como defeito. Some. */}
        {podeAbrirIntegral && !noAr && (
          <div className="an-relatorio-modos" role="tablist" aria-label="Modo do relatório">
            <button type="button" role="tab" aria-selected={modo === 'integral'} onClick={() => setPreferencia('integral')}>
              Relatório completo
            </button>
            <button type="button" role="tab" aria-selected={modo === 'crm'} onClick={() => setPreferencia('crm')}>
              Base compartilhada
            </button>
          </div>
        )}
        <span className="an-relatorio-estado">
          {modo === 'integral'
            ? 'Documento V13 completo, com edição e motor local'
            : editaAnalise
              ? 'Relatório da equipe, lido do CRM. Você pode editar'
              : 'Relatório da equipe, lido do CRM. Somente leitura'}
        </span>
        {/* No site publicado o documento completo abre em janela própria, e não
            embutido: é o jeito que o navegador deixa passar. */}
        {podeAbrirIntegral && (modo === 'integral' || noAr) && (
          <a className="an-bt mini" href={linkRelatorio(chave!)} target="_blank" rel="noopener">
            {noAr ? 'Abrir o relatório completo (neste notebook)' : 'Abrir em janela'}
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
