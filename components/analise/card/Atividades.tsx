'use client'

// ============================================================================
//  ABA 7: ATIVIDADES  ·  a linha de processos do tomador
//
//  "O que aconteceu com esta empresa?", numa lista só e em ordem. A base é a
//  linha que o linha.mjs monta no motor (e-mail que chegou, triagem, decisões,
//  perguntas, análise, edição), que chega por `analise_fila.linha`. Aqui
//  entram junto os eventos que só o CRM conhece: o encaminhamento, a nota, a
//  pergunta à IA, a ordem dada, o aviso do motor e o passo do agente.
//
//  É HISTÓRIA, um evento datado que já aconteceu e não muda. O que é
//  conhecimento vivo (a nota, o substatus) mora na Visão geral.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { dataCurta, corta, type Encaminhamento, type LinhaItem } from '@/lib/analise/mesa'
import { textoDaNota } from '@/lib/analise/notas'
import { nomeArea } from '@/lib/card/secoes'

const textoDaNotaCurto = (html: string) => corta(textoDaNota(html), 90)
import { type PropsAba } from './comum'

const COR: Record<string, string> = {
  email: '#4a90d0', triagem: '#8ba3c0', decisao: '#e8b84b', pergunta: '#d0743f', resposta: '#27a96c',
  analise: '#1e4080', edicao: '#e8b84b', encaminhado: '#d0743f', devolvido: '#27a96c',
  nota: '#a07b1e', ia: '#3070c8', ordem: '#1e4080', agente: '#3fae82', aviso: '#3070c8',
}

export default function Atividades({ f }: PropsAba) {
  const [extras, setExtras] = useState<LinhaItem[]>([])

  useEffect(() => {
    let vivo = true
    const supabase = createClient()
    const ler = async () => {
      const [enc, notas, ia, ev, ag] = await Promise.all([
        supabase.from('analise_encaminhamentos').select('*').eq('fila_id', f.id),
        supabase.from('analise_notas').select('id, titulo, html, autor_nome, em').eq('chave', f.chave || f.pasta),
        supabase.from('ia_pedidos').select('id, pergunta, criado_por_nome, criado_em').eq('fila_id', f.id),
        f.cnpj ? supabase.from('analise_eventos').select('id, tipo, detalhe, criado_em, criado_por').eq('cnpj', f.cnpj).limit(30) : Promise.resolve({ data: [] }),
        f.cnpj ? supabase.from('agente_eventos').select('id, agente, acao, tarefa, detalhe, criado_em').eq('cnpj', f.cnpj).order('criado_em', { ascending: false }).limit(40) : Promise.resolve({ data: [] }),
      ])
      if (!vivo) return
      const l: LinhaItem[] = []
      for (const e of (enc.data ?? []) as Encaminhamento[]) {
        l.push({ em: e.criado_em, tipo: 'encaminhado', txt: `Encaminhado para ${e.para_nome || nomeArea(e.para_area)}: ${e.pedido}`, quem: e.de_nome ?? '' })
        if (e.respondido_em) l.push({ em: e.respondido_em, tipo: 'devolvido', txt: `${e.para_nome || nomeArea(e.para_area)} respondeu: ${e.resposta ?? ''}`, quem: '' })
      }
      for (const n of (notas.data ?? []) as { id: string; titulo: string | null; html: string; autor_nome: string | null; em: string }[]) {
        l.push({ em: n.em, tipo: 'nota', txt: `Nota: ${n.titulo || textoDaNotaCurto(n.html)}`, quem: n.autor_nome ?? '' })
      }
      for (const p of (ia.data ?? []) as { id: string; pergunta: string; criado_por_nome: string | null; criado_em: string }[]) {
        l.push({ em: p.criado_em, tipo: 'ia', txt: `Perguntou à IA: ${p.pergunta}`, quem: p.criado_por_nome ?? '' })
      }
      for (const e of (ev.data ?? []) as { id: string; tipo: string; detalhe: string | null; criado_em: string; criado_por: string | null }[]) {
        l.push({ em: e.criado_em, tipo: 'aviso', txt: e.tipo === 'iniciou' ? 'A análise começou' : e.tipo === 'concluiu' ? 'A análise ficou pronta' : `A análise parou: ${e.detalhe ?? ''}`, quem: e.criado_por ?? 'motor' })
      }
      for (const e of (ag.data ?? []) as { id: string; agente: string; acao: string; tarefa: string; detalhe: string | null; criado_em: string }[]) {
        if (e.acao === 'passo') continue // o passo a passo é ruído numa linha de história
        l.push({ em: e.criado_em, tipo: 'agente', txt: `${e.agente}: ${e.tarefa}${e.detalhe ? ` · ${e.detalhe}` : ''}`, quem: e.acao === 'comecou' ? 'começou' : 'terminou' })
      }
      if (f.ultima_ordem_em && f.ultima_ordem_resultado) l.push({ em: f.ultima_ordem_em, tipo: 'ordem', txt: f.ultima_ordem_resultado, quem: 'o notebook' })
      setExtras(l)
    }
    ler()
    return () => { vivo = false }
  }, [f.id, f.cnpj, f.chave, f.pasta, f.ultima_ordem_em, f.ultima_ordem_resultado])

  const linha = useMemo(() => {
    const base = (f.linha ?? []).map(l => ({ ...l }))
    const tudo = [...base, ...extras].filter(l => l.em)
    tudo.sort((a, b) => String(b.em).localeCompare(String(a.em)))
    return tudo
  }, [f.linha, extras])

  return (
    <div className="an-bloco">
      <h4>Atividades<span className="dir">{linha.length} evento{linha.length === 1 ? '' : 's'}</span></h4>
      {linha.length === 0 ? <div className="an-vazio">Nada registrado sobre este tomador ainda.</div> : (
        <ul className="an-ativ">
          {linha.map((l, i) => (
            <li key={`${l.em}-${i}`}>
              <i className="pt" style={{ ['--cor' as string]: COR[l.tipo] ?? '#8ba3c0' }} />
              <div>
                <div className="tx">{l.abrir ? <a href={l.abrir} target="_blank" rel="noopener">{l.txt}</a> : l.txt}</div>
                <div className="pe">{dataCurta(l.em)}{l.quem ? ` · ${l.quem}` : ''}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
