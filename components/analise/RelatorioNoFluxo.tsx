'use client'

// O relatório V13 dentro do card oficial. O card continua sendo a unidade de
// colaboração: Arquivos, Análise, IA, Encaminhar e Atividades ficam ao redor.
//
// TRÊS JEITOS DE VER O MESMO RELATÓRIO (23/09/2026):
//   · editar ....... o documento vivo, servido pelo notebook. Só onde o Sistema
//                    de Análise responde e a página é http (localhost);
//   · leitura ...... o MESMO documento, copiado para o banco pela carga e
//                    aberto num quadro isolado. Funciona em qualquer lugar e
//                    não edita: é o que a equipe vê no CRM do ar;
//   · base ......... as seções do CRM, lidas do banco (e editáveis pelo analista).
// O padrão é o mais completo que estiver disponível.

import { useEffect, useState } from 'react'
import type { FichaAnalise } from '@/lib/analise/ficha'
import RelatorioCompleto from './RelatorioCompleto'
import RelatorioLeitura from './RelatorioLeitura'
import { linkRelatorio } from './card/comum'
import { createClient } from '@/lib/supabase/client'
import { dataCurta } from '@/lib/analise/mesa'
import { usePermissoes } from '@/lib/context/permissoes-context'

type Modo = 'integral' | 'leitura' | 'crm'

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
  const { editaAnalise } = usePermissoes()
  const [preferencia, setPreferencia] = useState<Modo | null>(null)
  /* A cópia de leitura existe para esta análise? `undefined` = ainda perguntando.
     Só a existência e a data: o documento (centenas de KB) só é baixado quando
     alguém abre a aba. */
  const [copiaEm, setCopiaEm] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!chave) { setCopiaEm(null); return }
    let vivo = true
    createClient().from('analise_relatorio_leitura').select('atualizado_em').eq('id', chave).maybeSingle()
      .then(({ data }) => { if (vivo) setCopiaEm(data?.atualizado_em ?? null) })
    return () => { vivo = false }
  }, [chave])

  /* NO SITE PUBLICADO (https) O DOCUMENTO DO NOTEBOOK NÃO ABRE EMBUTIDO.
     O Chrome deixa a página publicada enxergar o notebook depois que a
     permissão de rede local é dada, e aí `sistemaLocal` vira verdadeiro; mas um
     iframe de http://127.0.0.1 dentro de uma página https fica em branco. Lá o
     documento vivo abre em janela própria, e a leitura vem do banco. Em
     http://localhost o padrão é o de sempre. Esta tela só monta depois de a
     análise carregar, então `window` já existe. */
  const noAr = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const temEditar = sistemaLocal && !!chave && !noAr
  const temLeitura = !!copiaEm && !!chave

  const modos: { id: Modo; rotulo: string }[] = [
    ...(temEditar ? [{ id: 'integral' as Modo, rotulo: 'Relatório completo · editar' }] : []),
    ...(temLeitura ? [{ id: 'leitura' as Modo, rotulo: temEditar ? 'Relatório completo · leitura' : 'Relatório completo' }] : []),
    { id: 'crm' as Modo, rotulo: 'Base compartilhada' },
  ]
  const padrao: Modo = temEditar ? 'integral' : temLeitura ? 'leitura' : 'crm'
  const modo: Modo = preferencia && modos.some(m => m.id === preferencia) ? preferencia : padrao

  // Enquanto pergunta se a cópia existe, não pisca a Base compartilhada para
  // trocar por outro documento um instante depois.
  if (copiaEm === undefined && !temEditar) {
    return <div className="card-panel"><p style={{ color: 'var(--soft)', fontSize: 14 }}>Abrindo o relatório…</p></div>
  }

  return (
    <div className="an-relatorio-fluxo">
      <div className="an-relatorio-comando">
        {modos.length > 1 && (
          <div className="an-relatorio-modos" role="tablist" aria-label="Modo do relatório">
            {modos.map(m => (
              <button key={m.id} type="button" role="tab" aria-selected={modo === m.id} onClick={() => setPreferencia(m.id)}>
                {m.rotulo}
              </button>
            ))}
          </div>
        )}
        <span className="an-relatorio-estado">
          {modo === 'integral'
            ? 'Documento V13 completo, com edição e motor local'
            : modo === 'leitura'
              ? `Documento V13 completo, somente leitura · cópia de ${dataCurta(copiaEm)}`
              : editaAnalise
                ? 'Relatório da equipe, lido do CRM. Você pode editar'
                : 'Relatório da equipe, lido do CRM. Somente leitura'}
        </span>
        {/* No site publicado o documento vivo abre em janela própria, e não
            embutido: é o jeito que o navegador deixa passar. */}
        {sistemaLocal && !!chave && (modo === 'integral' || noAr) && (
          <a className="an-bt mini" href={linkRelatorio(chave)} target="_blank" rel="noopener">
            {noAr ? 'Abrir para editar (neste notebook)' : 'Abrir em janela'}
          </a>
        )}
      </div>

      {modo === 'integral' && temEditar ? (
        <div className="an-relatorio-integral">
          <iframe
            title={`Relatório completo de ${ficha.razao_social}`}
            src={linkRelatorio(chave!)}
            allow="fullscreen"
          />
        </div>
      ) : modo === 'leitura' && chave ? (
        <RelatorioLeitura chave={chave} razao={ficha.razao_social} />
      ) : (
        <RelatorioCompleto analiseId={ficha.id} semCabecalho aoCarregar={aoCarregar} />
      )}
    </div>
  )
}
