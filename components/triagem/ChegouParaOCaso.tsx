'use client'

/* O QUE CHEGOU PARA ESTE CASO · a linha do tempo, com o selo da matriz.

   Pedido do Marco em 30/09/2026: "o e-mail que iniciou o cadastro do tomador
   recebesse um selo e todo e-mail que estivesse atrelado ao e-mail matriz,
   tudo fosse lido pelo sistema". E, no mesmo dia: "às vezes recebemos por
   outros meios que não o e-mail. O e-mail é a preferência porque deixa
   histórico."

   Então a linha mostra os três jeitos de algo chegar, na ordem em que chegou:

     Matriz     o e-mail que abriu o caso, sempre no topo, com o selo dourado
     E-mail     os filhos, juntados depois, com quem juntou
     Avulso     o documento que veio por WhatsApp, em mãos, portal: com o meio

   e o que cada um trouxe. Mora dentro da Bancada (usa as classes `bt-`), e
   a fonte é GET /api/casos/<id>/email. */

import { useEffect, useState } from 'react'
import type { EventoDoCaso } from '@/app/api/casos/[id]/email/route'

const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'sem data'

const ROTULO: Record<EventoDoCaso['tipo'], string> = {
  matriz: 'E-mail matriz',
  email: 'E-mail juntado',
  avulso: 'Documento avulso',
}

export default function ChegouParaOCaso({ casoId, versao }: {
  casoId: string
  /** muda quando algo novo entra, para a lista recarregar */
  versao: number
}) {
  const [eventos, setEventos] = useState<EventoDoCaso[] | null>(null)
  const [temMatriz, setTemMatriz] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    fetch(`/api/casos/${casoId}/email`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!vivo) return
        if (!ok) { setErro(j.erro ?? 'Não consegui ler o histórico.'); return }
        setErro('')
        setEventos(j.eventos ?? [])
        setTemMatriz(!!j.tem_matriz)
      })
      .catch(() => vivo && setErro('A conexão caiu ao ler o histórico.'))
    return () => { vivo = false }
  }, [casoId, versao])

  if (erro) return <p className="bt-nota" style={{ margin: 0 }}>{erro}</p>
  if (!eventos) return <p className="bt-nota" style={{ margin: 0 }}>Lendo o histórico…</p>

  return (
    <>
      {!temMatriz && (
        <p className="bt-nota" style={{ margin: '0 0 8px' }}>
          Este caso não nasceu de um e-mail (foi aberto pelo CNPJ). O primeiro e-mail juntado aparece aqui,
          sem o selo de matriz.
        </p>
      )}
      {eventos.length === 0 ? (
        <p className="bt-nota" style={{ margin: 0 }}>Nada registrado ainda.</p>
      ) : (
        <ol className="bt-tl">
          {eventos.map((e, i) => (
            <li key={`${e.tipo}-${i}`} className={e.tipo}>
              <div className="bt-tl-cab">
                <span className={`bt-tl-selo ${e.tipo}`}>{ROTULO[e.tipo]}</span>
                <span className="bt-tl-quando">{data(e.quando)}</span>
              </div>
              <div className="bt-tl-titulo">{e.titulo}</div>
              {(e.de || e.por) && (
                <div className="bt-tl-quem">
                  {e.de ? `De ${e.de}` : ''}
                  {e.de && e.por ? ' · ' : ''}
                  {e.por ? (e.tipo === 'matriz' ? `caso aberto por ${e.por}` : e.tipo === 'email' ? `juntado por ${e.por}` : e.por) : ''}
                </div>
              )}
              <div className="bt-tl-trouxe">
                {e.trouxe.length
                  ? <>Trouxe: {e.trouxe.join(' · ')}</>
                  : 'Sem anexo útil (só o texto do e-mail).'}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
