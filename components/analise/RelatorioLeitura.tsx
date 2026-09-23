'use client'

// ============================================================================
//  O RELATÓRIO COMPLETO, SOMENTE PARA LER  ·  23/09/2026
//
//  Ordem dele: "preciso que apareça igual antes, mas que as pessoas tenham
//  acesso ao relatório sem editar". O documento de verdade (template v13) é
//  servido pelo motor do notebook e não chega ao CRM do ar. A carga
//  (`scripts/carga-relatorio.mjs`) guarda no banco uma cópia somente leitura,
//  em duas peças: o modelo (um só) e o que é próprio da análise.
//
//  A tela junta as duas e desenha num quadro ISOLADO: `sandbox` sem
//  `allow-same-origin`, então o documento não enxerga a sessão do CRM nem
//  chama a API dele, mesmo que o texto de um balanço traga um script. Sem
//  servidor por trás, nada do que se clicar ali grava em lugar nenhum.
// ============================================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function RelatorioLeitura({ chave, razao }: { chave: string; razao: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    createClient()
      .from('analise_relatorio_leitura')
      .select('id, html')
      .in('id', ['modelo', chave])
      .then(({ data, error }) => {
        if (!vivo) return
        const modelo = data?.find(l => l.id === 'modelo')?.html
        const peca = data?.find(l => l.id === chave)?.html
        if (error || !peca) {
          setErro(error?.message ?? 'A cópia de leitura desta análise ainda não foi publicada.')
          return
        }
        /* DOIS FORMATOS NA MESMA LINHA. Quem já baixou o HTML tem o arquivo
           inteiro guardado (com a conversa com a IA e o robô de bordo): abre
           como está. Quem não baixou tem só a peça da análise, e ela entra no
           modelo. */
        if (/^\s*<!doctype html/i.test(peca)) { setHtml(peca); return }
        if (!modelo) { setErro('O modelo do relatório ainda não foi publicado.'); return }
        // Por FUNÇÃO, nunca por string: um "$'" no texto colaria o resto do documento de novo.
        setHtml(modelo.replace('<!--FAM-DADOS-->', () => peca))
      })
    return () => { vivo = false }
  }, [chave])

  if (erro) {
    return <div className="an-aviso aviso">{erro} Enquanto isso, a &quot;Base compartilhada&quot; mostra a análise.</div>
  }
  if (!html) {
    return <div className="card-panel"><p style={{ color: 'var(--soft)', fontSize: 14 }}>Abrindo o relatório…</p></div>
  }
  return (
    <div className="an-relatorio-integral">
      <iframe
        title={`Relatório completo de ${razao}, somente leitura`}
        srcDoc={html}
        sandbox="allow-scripts allow-modals allow-downloads allow-popups"
      />
    </div>
  )
}
