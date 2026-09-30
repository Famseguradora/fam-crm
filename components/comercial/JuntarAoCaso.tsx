'use client'

/* JUNTAR AO CASO · a sugestão e a escolha, na Caixa de entrada.

   Pedido do Marco em 30/09/2026: o e-mail novo da corretora (o Serasa que
   faltava, o balanço atrasado) entra no card que já existe, e não abre
   análise nova. Decisão dele no mesmo dia: o sistema SUGERE, a pessoa junta.

   A sugestão vem de GET /api/caixa/sugestao (regra em lib/casos/sugerir-caso.ts)
   e diz o motivo ("mesmo CNPJ", "mesmo assunto"), para a pessoa conferir antes
   do clique. Quando não acerta, a busca livre acha pelo número ou pelo nome. */

import { useEffect, useState } from 'react'
import { cor, raio } from '@/lib/ui/painel'

interface CasoAchado {
  id: string
  numero: number
  assunto: string | null
  razao_social: string | null
  etapa: string
}

const ETAPA: Record<string, string> = {
  comercial: 'no Comercial', triagem: 'em triagem', analise: 'na análise',
}

const nomeDoCaso = (c: CasoAchado) => c.razao_social || c.assunto || 'sem nome'

export default function JuntarAoCaso({ emailId, ocupado, aoJuntar }: {
  emailId: string
  ocupado: boolean
  aoJuntar: (casoId: string) => void
}) {
  const [sugestoes, setSugestoes] = useState<{ caso: CasoAchado; motivo: string }[]>([])
  const [procurando, setProcurando] = useState(false)
  const [termo, setTermo] = useState('')
  const [achados, setAchados] = useState<CasoAchado[] | null>(null)

  useEffect(() => {
    let vivo = true
    setSugestoes([]); setProcurando(false); setTermo(''); setAchados(null)
    fetch(`/api/caixa/sugestao?id=${encodeURIComponent(emailId)}`)
      .then((r) => (r.ok ? r.json() : { sugestoes: [] }))
      .then((j) => { if (vivo) setSugestoes(j.sugestoes ?? []) })
      .catch(() => { /* sem sugestão, a busca livre continua */ })
    return () => { vivo = false }
  }, [emailId])

  // A busca livre espera a pessoa parar de digitar.
  useEffect(() => {
    const q = termo.trim()
    if (q.length < 2) { setAchados(null); return }
    let vivo = true
    const t = setTimeout(() => {
      fetch(`/api/caixa/sugestao?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { casos: [] }))
        .then((j) => { if (vivo) setAchados(j.casos ?? []) })
        .catch(() => vivo && setAchados([]))
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [termo])

  const confirmar = (c: CasoAchado) => {
    if (!window.confirm(`Juntar este e-mail ao caso #${c.numero} (${nomeDoCaso(c)})?\n\nOs anexos entram no card dele e a triagem refaz sozinha. Nenhuma análise nova é aberta.`)) return
    aoJuntar(c.id)
  }

  const linha = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }

  return (
    <div style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sugestoes.map(({ caso, motivo }) => (
        <div key={caso.id} style={{
          ...linha, border: `1px solid ${cor.borda}`, boxShadow: `inset 3px 0 0 ${cor.ouro}`,
          borderRadius: raio.controle, padding: '7px 10px', background: cor.papel, fontSize: 13,
        }}>
          <span style={{ color: cor.texto, minWidth: 0, flex: '1 1 220px' }}>
            Parece ser do <b style={{ color: cor.tinta }}>caso #{caso.numero}</b> · {nomeDoCaso(caso)}
            <span style={{ color: cor.textoFraco }}> ({motivo}{ETAPA[caso.etapa] ? `, ${ETAPA[caso.etapa]}` : ''})</span>
          </span>
          <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => confirmar(caso)}>
            Juntar ao caso #{caso.numero}
          </button>
        </div>
      ))}

      {!procurando ? (
        <button
          type="button"
          onClick={() => setProcurando(true)}
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: '4px 0', font: 'inherit', fontSize: 12.5, color: cor.acao, cursor: 'pointer' }}
        >
          {sugestoes.length ? 'Não é esse? Juntar a outro caso' : 'Juntar a um caso que já existe'}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Número do caso ou nome da empresa"
            style={{
              font: 'inherit', fontSize: 16, padding: '7px 10px', border: `1px solid ${cor.borda}`,
              borderRadius: raio.controle, color: cor.tinta, maxWidth: 360, width: '100%',
            }}
          />
          {achados && achados.length === 0 && (
            <span style={{ fontSize: 12.5, color: cor.textoFraco }}>Nenhum caso aberto com isso.</span>
          )}
          {achados?.map((c) => (
            <div key={c.id} style={{ ...linha, fontSize: 13 }}>
              <span style={{ color: cor.texto, minWidth: 0, flex: '1 1 220px' }}>
                <b style={{ color: cor.tinta }}>#{c.numero}</b> · {nomeDoCaso(c)}
                <span style={{ color: cor.textoFraco }}>{ETAPA[c.etapa] ? ` (${ETAPA[c.etapa]})` : ''}</span>
              </span>
              <button type="button" className="btn-secondary" disabled={ocupado} onClick={() => confirmar(c)}>Juntar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
