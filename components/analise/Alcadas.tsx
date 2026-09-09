'use client'

// ============================================================================
//  AS ALÇADAS  ·  o que o funcionário virtual faz sozinho, e o que ele pede
//
//  Porte do alcadas.html do cockpit, nos três andares: o que espera você (os
//  pedidos abertos, com Autorizar / Autorizar e liberar sempre / Negar), o que
//  ele pode (o catálogo das ações, com o nível livre / pedir / proibido), e o
//  que ele fez (o extrato).
//
//  A garantia do alcadas.mjs continua: a IA nunca ganha caneta. Ela pede, o
//  Node faz. E aqui a decisão é do analista (RLS `fam_e_analista`), gravada no
//  banco na hora; o agente do notebook aplica no disco e executa, pelo mesmo
//  caminho do botão do cockpit.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { dataCurta, desde } from '@/lib/analise/mesa'

interface Acao { acao: string; alcada: string; rotulo: string | null; o_que_faz: string | null; desfaz: string | null; padrao: string | null; definido_no_crm_em: string | null; aplicado_em: string | null }
interface Pedido { id: string; acao: string; acao_rotulo: string | null; args: Record<string, unknown> | null; quem: string; motivo: string | null; status: string; pedido_em: string; decisao_crm: string | null; decisao_crm_por: string | null; aplicado_em: string | null; resultado: string | null; pasta: string | null; chave: string | null }
interface Linha { id: number; em: string; tipo: string; acao: string | null; quem: string | null; por: string | null; de: string | null; para: string | null; motivo: string | null; ok: boolean | null }

export default function Alcadas({ nomeUsuario }: { nomeUsuario: string | null }) {
  const router = useRouter()
  const { editaAnalise } = usePermissoes()
  const [acoes, setAcoes] = useState<Acao[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [diario, setDiario] = useState<Linha[]>([])
  const [filaPorPasta, setFilaPorPasta] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState('')

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const [a, p, d, f] = await Promise.all([
      supabase.from('agente_alcadas').select('*').order('acao'),
      supabase.from('agente_pedidos').select('*').order('pedido_em', { ascending: false }).limit(100),
      supabase.from('agente_diario').select('id, em, tipo, acao, quem, por, de, para, motivo, ok').order('em', { ascending: false }).limit(80),
      supabase.from('analise_fila').select('id, pasta, chave'),
    ])
    setAcoes((a.data ?? []) as Acao[])
    setPedidos((p.data ?? []) as Pedido[])
    setDiario((d.data ?? []) as Linha[])
    const m: Record<string, string> = {}
    for (const x of (f.data ?? []) as { id: string; pasta: string; chave: string | null }[]) { m[x.pasta] = x.id; if (x.chave) m[x.chave] = x.id }
    setFilaPorPasta(m)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
    const supabase = createClient()
    const canal = supabase.channel('alcadas-crm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agente_pedidos' }, () => carregar())
      .subscribe()
    const t = setInterval(carregar, 20000)
    return () => { clearInterval(t); supabase.removeChannel(canal) }
  }, [carregar])

  const decidir = async (p: Pedido, decisao: 'autorizar' | 'autorizar_sempre' | 'negar') => {
    let motivo = ''
    if (decisao === 'negar') motivo = window.prompt('Por que não? (ele lê isto, e é assim que ele aprende o seu critério)') ?? ''
    setOcupado(p.id)
    const supabase = createClient()
    await supabase.from('agente_pedidos').update({ decisao_crm: decisao, decisao_crm_por: nomeUsuario ?? 'marco', decisao_crm_em: new Date().toISOString(), decisao_crm_motivo: motivo || null }).eq('id', p.id)
    setOcupado('')
    carregar()
  }
  const definir = async (a: Acao, nivel: string) => {
    if (a.alcada === nivel) return
    setOcupado(a.acao)
    const supabase = createClient()
    await supabase.from('agente_alcadas').update({ alcada: nivel, alterado_por: nomeUsuario ?? 'marco', alterado_em: new Date().toISOString(), definido_no_crm_em: new Date().toISOString(), aplicado_em: null }).eq('acao', a.acao)
    setOcupado('')
    carregar()
  }

  const abertos = pedidos.filter(p => p.status === 'aberto')
  const frase = (l: Linha) => {
    if (l.tipo === 'execucao') return <>{l.ok === false ? 'tentou e não conseguiu ' : 'fez '}<b>{l.acao}</b></>
    if (l.tipo === 'pedido') return <>pediu autorização para <b>{l.acao}</b></>
    if (l.tipo === 'negado') return <>você negou <b>{l.acao}</b></>
    if (l.tipo === 'barrada') return <>tentou <b>{l.acao}</b>, que está proibida</>
    if (l.tipo === 'alcada') return <>alçada de <b>{l.acao}</b>: {l.de} para {l.para}</>
    return <>{l.tipo}</>
  }

  return (
    <div>
      <div className={`an-bloco${abertos.length ? '' : ''}`} style={abertos.length ? { borderColor: '#e8b84b' } : undefined}>
        <h4>O que espera você{abertos.length > 0 && <span className="dir">{abertos.length} pedido{abertos.length === 1 ? '' : 's'}</span>}</h4>
        {abertos.length === 0 && <div className="an-vazio">Nada esperando você.{acoes.length === 0 ? ' As alçadas chegam pelo agente do notebook (node scripts/esteira.mjs).' : ''}</div>}
        {abertos.map(p => {
          const acao = acoes.find(a => a.acao === p.acao)
          const args = p.args ?? {}
          const filaId = filaPorPasta[p.pasta ?? String(args.pasta ?? '')] ?? filaPorPasta[p.chave ?? String(args.chave ?? '')]
          return (
            <div key={p.id} className="an-ped">
              <h3>{p.acao_rotulo || acao?.rotulo || p.acao}</h3>
              {p.motivo && <div className="motivo">{p.motivo}</div>}
              <div className="detalhe">
                {acao?.o_que_faz && <><b>O que acontece:</b> {acao.o_que_faz}<br /></>}
                {Object.keys(args).length > 0 && <>{Object.entries(args).map(([k, v]) => <span key={k}><b>{k}:</b> {String(v)} &nbsp;·&nbsp; </span>)}<br /></>}
                {acao?.desfaz && <><b>Se der errado:</b> {acao.desfaz}</>}
              </div>
              <div className="pe">
                {p.decisao_crm ? (
                  <span className="an-aviso bom" style={{ margin: 0 }}><span>✓</span><span>Você decidiu <b>{p.decisao_crm === 'negar' ? 'negar' : p.decisao_crm === 'autorizar_sempre' ? 'autorizar e liberar sempre' : 'autorizar'}</b>{p.aplicado_em ? `, aplicado ${desde(p.aplicado_em)}` : '. O notebook aplica em segundos.'}</span></span>
                ) : editaAnalise ? (
                  <>
                    <button type="button" className="an-bt ouro" disabled={!!ocupado} onClick={() => decidir(p, 'autorizar')}>Autorizar</button>
                    <button type="button" className="an-bt" disabled={!!ocupado} onClick={() => decidir(p, 'autorizar_sempre')}>Autorizar e liberar sempre</button>
                    <button type="button" className="an-bt forcar" disabled={!!ocupado} onClick={() => decidir(p, 'negar')}>Negar</button>
                  </>
                ) : <span className="an-dica">A decisão é do analista de crédito.</span>}
                {filaId && <button type="button" className="an-bt mini" onClick={() => router.push(`/analises/mesa/${filaId}`)}>Ver o card</button>}
                <span className="quando">pedido por {p.quem} {desde(p.pedido_em)}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="an-bloco">
        <h4>O que ele pode fazer sozinho</h4>
        <p className="an-explica">Livre faz na hora e conta no mural. Pedir abre um pedido e espera você. Proibido nem o pedido abre. Nenhuma ação nasce proibida: o nível existe para VOCÊ travar o que quiser.</p>
        {acoes.length === 0 ? <div className="an-vazio">O catálogo chega pelo agente do notebook.</div> : (
          <div className="mt-tab-wrap"><table className="an-tab">
            <thead><tr><th>Ação</th><th>Se der errado</th><th style={{ textAlign: 'right' }}>Alçada</th></tr></thead>
            <tbody>
              {acoes.map(a => {
                const pendente = a.definido_no_crm_em && (!a.aplicado_em || a.definido_no_crm_em > a.aplicado_em)
                return (
                  <tr key={a.acao} style={{ cursor: 'default' }}>
                    <td><b style={{ color: '#0a1628' }}>{a.rotulo || a.acao}</b><br /><small style={{ color: '#6080a0' }}>{a.o_que_faz}</small></td>
                    <td style={{ color: '#6080a0', fontSize: 12, maxWidth: 320 }}>{a.desfaz}</td>
                    <td className="num">
                      <span className="an-niveis">
                        {(['livre', 'pedir', 'proibido'] as const).map(n => (
                          <button key={n} type="button" className={`${a.alcada === n ? 'on ' + n : ''}`} disabled={!editaAnalise || ocupado === a.acao} onClick={() => definir(a, n)}>{n === 'livre' ? 'Livre' : n === 'pedir' ? 'Pedir' : 'Proibido'}</button>
                        ))}
                      </span>
                      {pendente && <div style={{ fontSize: 10.5, color: '#8a6410' }}>esperando o notebook</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="an-bloco">
        <h4>O que ele fez</h4>
        {diario.length === 0 ? <div className="an-vazio">Ele ainda não fez nada.</div> : (
          <div className="an-extrato">
            {diario.map(l => (
              <div key={l.id} className={l.tipo === 'execucao' && l.ok === false ? 'falhou' : ''}>
                <i title={dataCurta(l.em)}>{desde(l.em)}</i>
                <span>{frase(l)}{l.motivo ? <span style={{ color: '#6080a0' }}> · {l.motivo}</span> : null}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
