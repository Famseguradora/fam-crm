'use client'

// ============================================================================
//  RECADOS  ·  o mural onde os funcionários virtuais falam com ele
//
//  Porte da aba Recados do cockpit, na versão executiva aprovada em
//  30/08/2026: a lista à esquerda, por funcionário virtual (avatar com
//  iniciais), a leitura à direita como um e-mail aberto; o relatório do
//  auditor-chefe é o 1º item, e as ações "O que eu faria" viram 3 cartões.
//
//  AS TRÊS REGRAS DO MURAL continuam (recados.mjs): recado não some sozinho,
//  recado não repete, e quem escreve é Node, nunca a IA. Aqui entra a quarta,
//  do CRM: "lido" e "arquivado" são decisão de pessoa, marcadas no banco na
//  hora; o agente do notebook leva a marca ao disco em segundos.
//
//  "Pedir relatório" grava um comando que o agente executa (o auditor-chefe
//  mede a operação e escreve; leva cerca de um minuto).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { agenteDoMural, recadoLido, recadoArquivado, dataCurta, desde, corta, type Recado } from '@/lib/analise/mesa'

export default function Recados({ nomeUsuario }: { nomeUsuario: string | null }) {
  const router = useRouter()
  const { somenteLeitura } = usePermissoes()
  const [recados, setRecados] = useState<Recado[]>([])
  const [aberto, setAberto] = useState<string | null>(null)
  const [todos, setTodos] = useState(false)
  const [pedindo, setPedindo] = useState(false)
  const [comando, setComando] = useState<{ criado_em: string; aceito_em: string | null } | null>(null)
  const [filaPorChave, setFilaPorChave] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const [r, c, f] = await Promise.all([
      supabase.from('analise_recados').select('*').order('em', { ascending: false }).limit(300),
      supabase.from('analise_comandos').select('criado_em, aceito_em').eq('comando', 'relatorio').is('feito_em', null).order('criado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('analise_fila').select('id, chave, pasta'),
    ])
    setRecados((r.data ?? []) as Recado[])
    setComando(c.data ?? null)
    const m: Record<string, string> = {}
    for (const x of (f.data ?? []) as { id: string; chave: string | null; pasta: string }[]) { if (x.chave) m[x.chave] = x.id; m[x.pasta] = x.id }
    setFilaPorChave(m)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    const supabase = createClient()
    const canal = supabase.channel('recados-analise')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_recados' }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analise_comandos' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [carregar])

  const lista = useMemo(() => {
    const vivos = recados.filter(r => todos || !recadoArquivado(r))
    // O relatório é o 1º item, como na tela dele.
    return [...vivos.filter(r => r.id === 'relatorio'), ...vivos.filter(r => r.id !== 'relatorio')]
  }, [recados, todos])
  const naoLidos = recados.filter(r => !recadoLido(r) && !recadoArquivado(r)).length

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!lista.length) { setAberto(null); return }
    if (!aberto || !lista.some(r => r.id === aberto)) setAberto(lista[0].id)
  }, [lista, aberto])

  const marcar = async (ids: string[], campo: 'lido_no_crm_em' | 'arquivado_no_crm_em') => {
    if (somenteLeitura || !ids.length) return
    const supabase = createClient()
    await supabase.from('analise_recados').update({ [campo]: new Date().toISOString(), ...(campo === 'lido_no_crm_em' ? { lido_no_crm_por: nomeUsuario } : {}), confirmado_em: null }).in('id', ids)
    await carregar()
  }
  const abrir = (r: Recado) => {
    setAberto(r.id)
    if (!recadoLido(r) && r.id !== 'relatorio') marcar([r.id], 'lido_no_crm_em')
  }
  const pedirRelatorio = async () => {
    if (somenteLeitura || pedindo) return
    setPedindo(true)
    const supabase = createClient()
    await supabase.from('analise_comandos').insert({ comando: 'relatorio', por: nomeUsuario })
    setPedindo(false)
    carregar()
  }

  const r = lista.find(x => x.id === aberto) ?? null

  /* O RELATÓRIO, LIDO COMO E-MAIL. As seções vêm em CAIXA ALTA numa linha só. A
     seção "O QUE EU FARIA" vira três cartões, porque é a parte que pede ação. */
  // Função de desenho, e não componente: fecha sobre nada de estado, e o React
  // não precisa reconciliá-la como um tipo novo a cada render.
  const relatorio = (r: Recado) => {
    const secoes: { t: string; linhas: string[] }[] = []
    let atual: { t: string; linhas: string[] } | null = null
    for (const l of String(r.texto ?? '').split(/\n/)) {
      const s = l.trim()
      if (s && s.length < 60 && s === s.toUpperCase() && /[A-ZÀ-Ú]/.test(s)) { atual = { t: s, linhas: [] }; secoes.push(atual); continue }
      if (!atual) { atual = { t: '', linhas: [] }; secoes.push(atual) }
      atual.linhas.push(l)
    }
    const faria = secoes.find(x => /FARIA|RECOMEND/.test(x.t)) ?? null
    const resto = secoes.filter(x => x !== faria)
    const itens = faria ? faria.linhas.map(l => l.trim()).filter(l => /^\d+[.)]/.test(l)) : []
    const dados = (r.dados ?? {}) as { licao?: string | null; janela_dias?: number; escrevendo?: boolean }
    return (
      <>
        <h3>Relatório da operação, últimos {dados.janela_dias ?? 30} dias</h3>
        <div className="an-rc-de">
          <span className="an-av" style={{ ['--cor' as string]: '#e8b84b', width: 32, height: 32, fontSize: 12 }}>AU</span>
          <span><span className="nm">Auditor-chefe</span> · funcionário virtual<br /><span>escrito {dataCurta(r.em)}{dados.escrevendo ? ' · escrevendo um novo agora…' : ''}</span></span>
        </div>
        <div className="an-rc-corpo">
          {faria && (
            <>
              <h4>{faria.t}</h4>
              {itens.length >= 2 ? (
                <div className="an-rc-acoes3">
                  {itens.slice(0, 3).map((l, i) => {
                    const t = l.replace(/^\d+[.)]\s*/, '')
                    const corte = t.search(/[:.](\s|$)/)
                    const b = corte > 0 ? t.slice(0, corte) : t
                    const rest = corte > 0 ? t.slice(corte + 1).trim() : ''
                    return <div key={i} className="a"><b>{b}</b><small>{rest}</small></div>
                  })}
                </div>
              ) : <p>{faria.linhas.join('\n').trim()}</p>}
            </>
          )}
          {resto.map((x, i) => {
            const txt = x.linhas.join('\n').replace(/^\n+|\n+$/g, '')
            if (!txt) return null
            return <div key={i}>{x.t && <h4>{x.t}</h4>}<p style={{ margin: 0 }}>{txt}</p></div>
          })}
          {dados.licao && <div className="an-rc-licao"><b>O que ele aprendeu nesta rodada:</b> {dados.licao}</div>}
        </div>
      </>
    )
  }

  return (
    <div className="an-rc">
      <div className="an-rc-col">
        <div className="an-rc-barra">
          <span>{recados.length ? (naoLidos ? `${naoLidos} não lido(s) de ${lista.length}` : `${lista.length} recado(s), tudo lido`) : 'Nenhum recado ainda.'}</span>
          <div className="bts">
            <button type="button" className="an-bt mini" onClick={() => setTodos(v => !v)} title="Mostrar também os arquivados">{todos ? 'Só os vivos' : 'Ver arquivados'}</button>
            {!somenteLeitura && (
              <>
                <button type="button" className="an-bt mini" disabled={pedindo || !!comando} onClick={pedirRelatorio}
                  title="Pedir ao auditor-chefe um relatório novo sobre a sua operação. Leva cerca de um minuto.">{comando ? (comando.aceito_em ? 'Escrevendo…' : 'Pedido…') : 'Pedir relatório'}</button>
                <button type="button" className="an-bt mini" disabled={!naoLidos} onClick={() => marcar(recados.filter(x => !recadoLido(x) && !recadoArquivado(x) && x.id !== 'relatorio').map(x => x.id), 'lido_no_crm_em')} title="Marcar tudo como lido">Marcar lido</button>
              </>
            )}
          </div>
        </div>
        <div className="an-rc-rolo">
          {lista.length === 0 && <div className="an-rc-nada">Seus agentes ainda não têm nada a dizer. Assim que chegar um e-mail ou um documento novo, eles falam aqui. O mural chega pelo agente do notebook (<b>node scripts/esteira.mjs</b>).</div>}
          {lista.map(x => {
            const ag = agenteDoMural(x.agente)
            const lido = recadoLido(x) || x.id === 'relatorio'
            return (
              <button key={x.id} type="button" className={`an-rc-item${aberto === x.id ? ' on' : ''}${lido ? ' lido' : ''}`} onClick={() => abrir(x)}>
                <span className="an-av" style={{ ['--cor' as string]: ag.cor, width: 30, height: 30, fontSize: 11 }}>{ag.sigla}</span>
                <span className="meio">
                  <span className="de">{ag.nome}<span className="q">{desde(x.em)}</span></span>
                  <span className="tit">{x.titulo}</span>
                  {x.texto && <span className="prev">{corta(x.texto.replace(/\s+/g, ' '), 90)}</span>}
                </span>
                {!lido && <span className="nl" title="Não lido" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="an-rc-col">
        <div className="an-rc-leitura">
          {!r ? <div className="an-rc-nada">Clique num recado à esquerda para ler aqui.</div>
            : r.id === 'relatorio' ? relatorio(r)
              : (
                <>
                  <h3>{r.titulo}</h3>
                  <div className="an-rc-de">
                    <span className="an-av" style={{ ['--cor' as string]: agenteDoMural(r.agente).cor, width: 32, height: 32, fontSize: 12 }}>{agenteDoMural(r.agente).sigla}</span>
                    <span><span className="nm">{agenteDoMural(r.agente).nome}</span> · {agenteDoMural(r.agente).papel}<br /><span>{dataCurta(r.em)}{r.pasta ? ` · pasta ${r.pasta}` : ''}{recadoArquivado(r) ? ' · arquivado' : ''}</span></span>
                  </div>
                  <div className="an-rc-corpo">{r.texto || '(sem texto)'}</div>
                  <div className="an-rc-bts">
                    {(r.acoes ?? []).map((a, i) => {
                      if (a.tipo === 'copiar' && a.valor) return <button key={i} type="button" className="an-bt mini" onClick={() => navigator.clipboard?.writeText(String(a.valor))}>{a.rotulo}</button>
                      if ((a.tipo === 'card' || a.tipo === 'tomador')) {
                        const id = filaPorChave[String(a.chave ?? a.pasta ?? r.chave ?? r.pasta ?? '')]
                        return id ? <button key={i} type="button" className="an-bt mini contorno" onClick={() => router.push(`/analises/mesa/${id}`)}>{a.rotulo}</button> : null
                      }
                      return null
                    })}
                    {!(r.acoes ?? []).some(a => a.tipo === 'card' || a.tipo === 'tomador') && (r.chave || r.pasta) && filaPorChave[r.chave ?? ''] && (
                      <button type="button" className="an-bt mini contorno" onClick={() => router.push(`/analises/mesa/${filaPorChave[r.chave ?? '']}`)}>Ver no card</button>
                    )}
                    {!somenteLeitura && !recadoArquivado(r) && <button type="button" className="an-bt mini" onClick={() => marcar([r.id], 'arquivado_no_crm_em')}>Arquivar</button>}
                  </div>
                </>
              )}
        </div>
      </div>
    </div>
  )
}
