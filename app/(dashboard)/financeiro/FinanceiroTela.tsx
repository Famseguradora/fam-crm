'use client'

// ============================================================================
//  A moldura do FAM Financeiro dentro do CRM.
//
//  O sistema em si roda no iframe, servido por /api/financeiro/pagina (que só
//  entrega depois de conferir a sessão). Aqui em volta ficam duas coisas que
//  são do CRM, não do sistema: QUEM TEM ACESSO e o AVISO ao outro dono.
//
//  CUIDADO AO MEXER: o iframe não pode ser remontado. Se ele mudar de lugar na
//  árvore, o navegador recarrega a página de dentro e a pessoa perde o que
//  estava digitando. Por isso o painel de acessos abre por CSS (display), e
//  nunca desmontando o iframe com um `&&`.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Quem { usuarioId: string; nome: string; ve: boolean; edita: boolean; dono: boolean }

interface LinhaAcesso {
  id: string
  dono: boolean
  pode_editar: boolean
  concedido_em: string
  revogado_em: string | null
  usuarios: { id: string; nome: string; cargo: string | null } | null
}
interface Aviso { id: string; texto: string; criado_em: string }
interface Pessoa { id: string; nome: string; cargo: string | null }

export default function FinanceiroTela({ quem }: { quem: Quem }) {
  const [painel, setPainel] = useState(false)
  const [ativos, setAtivos] = useState<LinhaAcesso[]>([])
  const [historico, setHistorico] = useState<LinhaAcesso[]>([])
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [escolhido, setEscolhido] = useState('')
  const [podeLancar, setPodeLancar] = useState(false)
  const [recado, setRecado] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    const r = await fetch('/api/financeiro/acesso', { cache: 'no-store' })
    if (!r.ok) return
    const j = await r.json()
    setAtivos(j.ativos ?? [])
    setHistorico(j.historico ?? [])
    setAvisos(j.avisos ?? [])
  }, [])

  /* A busca da montagem tem guarda própria: se a pessoa sair da tela antes de a
     resposta chegar, o setState não roda num componente que já morreu. */
  useEffect(() => {
    let vivo = true
    void (async () => {
      const r = await fetch('/api/financeiro/acesso', { cache: 'no-store' })
      if (!vivo || !r.ok) return
      const j = await r.json()
      if (!vivo) return
      setAtivos(j.ativos ?? [])
      setHistorico(j.historico ?? [])
      setAvisos(j.avisos ?? [])
    })()
    return () => { vivo = false }
  }, [])

  // Lista de quem existe no CRM, para o dono escolher. Só o dono precisa dela.
  useEffect(() => {
    if (!quem.dono) return
    const supabase = createClient()
    supabase.from('usuarios').select('id, nome, cargo').order('nome')
      .then(({ data }) => setPessoas((data ?? []) as Pessoa[]))
  }, [quem.dono])

  // O outro dono fica sabendo NA HORA: a tabela de avisos está na publicação de
  // realtime, então a linha nova acende aqui sem recarregar nada.
  useEffect(() => {
    if (!quem.dono) return
    const supabase = createClient()
    const canal = supabase
      .channel('financeiro-acesso')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'financeiro_acesso_avisos' },
        () => carregar())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'financeiro_acesso' },
        () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [quem.dono, carregar])

  async function conceder() {
    if (!escolhido) return setRecado('Escolha a pessoa.')
    setOcupado(true)
    const r = await fetch('/api/financeiro/acesso', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usuarioId: escolhido, podeEditar: podeLancar }),
    })
    const j = await r.json().catch(() => ({}))
    setOcupado(false)
    setRecado(r.ok ? 'Acesso liberado. O outro dono já foi avisado.' : (j.erro ?? 'Não deu para liberar.'))
    if (r.ok) { setEscolhido(''); setPodeLancar(false); carregar() }
  }

  async function revogar(acessoId: string, nome: string) {
    if (!confirm(`Tirar o acesso de ${nome} ao Financeiro?`)) return
    setOcupado(true)
    const r = await fetch('/api/financeiro/acesso', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acessoId }),
    })
    const j = await r.json().catch(() => ({}))
    setOcupado(false)
    setRecado(r.ok ? 'Acesso revogado. O outro dono já foi avisado.' : (j.erro ?? 'Não deu para revogar.'))
    if (r.ok) carregar()
  }

  async function darPorLido() {
    const supabase = createClient()
    await supabase.from('financeiro_acesso_avisos')
      .update({ lido_em: new Date().toISOString() })
      .is('lido_em', null)
    carregar()
  }

  /* ── A ALTURA DO IFRAME É MEDIDA, NÃO CHUTADA ─────────────────────────────
     Antes era `calc(100vh - 104px)`, com 104 sendo o meu palpite para o
     cabeçalho do CRM. Só que o topo tem cabeçalho E ticker de notícias, e o
     shell é `minHeight:100vh` (cresce com o conteúdo). Quando a soma passava da
     janela, a PÁGINA DE FORA ganhava rolagem: no topo, o rodapé do iframe ficava
     abaixo da dobra e os botões flutuantes (Robô Caixa, Lembretes, HP) sumiam ·
     rolar para baixo os trazia de volta, que foi exatamente o que o Marco viu.

     Medindo onde o iframe começa e tirando isso da janela, ele encosta na borda
     de baixo e a página de fora nunca precisa rolar. */
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [altura, setAltura] = useState<number | null>(null)

  useEffect(() => {
    const medir = () => {
      const el = iframeRef.current
      if (!el) return
      const topo = el.getBoundingClientRect().top + window.scrollY
      setAltura(Math.max(360, Math.round(window.innerHeight - topo - 2)))
    }
    // primeira medida depois da pintura: no corpo do efeito, o layout ainda
    // não assentou e o ticker do topo mediria zero
    const id = requestAnimationFrame(medir)
    window.addEventListener('resize', medir)
    // a barra de acesso abre e fecha, e o aviso do outro dono nasce e some:
    // os dois mudam onde o iframe começa
    const ro = new ResizeObserver(medir)
    if (iframeRef.current?.parentElement) ro.observe(iframeRef.current.parentElement)
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', medir); ro.disconnect() }
  }, [])

  const jaTem = new Set(ativos.map(a => a.usuarios?.id).filter(Boolean) as string[])
  const disponiveis = pessoas.filter(p => !jaTem.has(p.id))
  const data = (s: string) => new Date(s).toLocaleDateString('pt-BR')

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ── aviso do outro dono, quando há ── */}
      {avisos.length > 0 && (
        <div style={{
          background: '#fdf8e6', borderBottom: '2px solid #e8b84b',
          padding: '10px 18px', fontSize: 13.5, color: '#7a5c10', lineHeight: 1.6,
        }}>
          <b>Mudou quem entra no Financeiro:</b>
          <ul style={{ margin: '6px 0 8px 18px' }}>
            {avisos.map(a => <li key={a.id}>{a.texto} <span style={{ color: '#9a8340' }}>({data(a.criado_em)})</span></li>)}
          </ul>
          <button className="btn-clear" onClick={darPorLido}>Entendi</button>
        </div>
      )}

      {/* ── barra: quem sou eu aqui + abrir a lista ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '7px 18px' }}>
        <span className={`badge ${quem.dono ? 'badge-blue' : quem.edita ? 'badge-green' : 'badge-orange'}`}>
          {quem.dono ? 'Dono do Financeiro' : quem.edita ? 'Pode lançar' : 'Só leitura'}
        </span>
        <span style={{ fontSize: 13, color: '#6080a0' }}>
          {ativos.length} pessoa{ativos.length === 1 ? '' : 's'} com acesso a esta tela
        </span>
        <button className="btn-clear" style={{ marginLeft: 'auto' }} onClick={() => setPainel(v => !v)}>
          {painel ? 'Fechar a lista' : '🔐 Quem tem acesso'}
        </button>
      </div>

      {/* ── painel de acessos: display, NUNCA desmontando o iframe abaixo ── */}
      <div className="card-panel" style={{ display: painel ? 'block' : 'none', marginBottom: 0, borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}>
        <div className="section-title"><span className="dot" />Quem tem acesso ao Financeiro</div>
        <p style={{ fontSize: 13, color: '#6080a0', lineHeight: 1.6, marginBottom: 12 }}>
          Esta lista é <b>independente do perfil do CRM</b>: administrador não entra aqui sem estar nela.
          Só o Marco e o Aldeir concedem, e cada mudança avisa o outro na hora.
        </p>

        <div className="fam-table-wrap">
          <table className="fam-table">
            <thead><tr><th>Pessoa</th><th>Cargo</th><th>Papel</th><th>Desde</th><th></th></tr></thead>
            <tbody>
              {ativos.map(a => (
                <tr key={a.id}>
                  <td><b>{a.usuarios?.nome ?? '(removido)'}</b></td>
                  <td style={{ color: '#6080a0' }}>{a.usuarios?.cargo ?? '-'}</td>
                  <td>
                    <span className={`badge ${a.dono ? 'badge-blue' : a.pode_editar ? 'badge-green' : 'badge-orange'}`}>
                      {a.dono ? 'Dono' : a.pode_editar ? 'Pode lançar' : 'Só leitura'}
                    </span>
                  </td>
                  <td style={{ color: '#6080a0' }}>{data(a.concedido_em)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {quem.dono && !a.dono && (
                      <button className="btn-clear" disabled={ocupado}
                        onClick={() => revogar(a.id, a.usuarios?.nome ?? 'essa pessoa')}>Tirar</button>
                    )}
                    {a.dono && <span style={{ fontSize: 12, color: '#6080a0' }}>um dono não remove o outro</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {quem.dono && (
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="fam-input" style={{ minWidth: 240 }} value={escolhido}
              onChange={e => setEscolhido(e.target.value)}>
              <option value="">Liberar o acesso para…</option>
              {disponiveis.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cargo ? ` · ${p.cargo}` : ''}</option>)}
            </select>
            <label style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={podeLancar} onChange={e => setPodeLancar(e.target.checked)} />
              pode lançar (senão, só olha)
            </label>
            <button className="btn-primary" onClick={conceder} disabled={ocupado || !escolhido}>Liberar</button>
          </div>
        )}

        {recado && <div style={{ marginTop: 10, fontSize: 13, color: '#1a3560' }}>{recado}</div>}

        {historico.length > 0 && (
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#6080a0' }}>
              Quem já teve acesso e saiu ({historico.length})
            </summary>
            <ul style={{ margin: '8px 0 0 18px', fontSize: 13, color: '#3a4a5a', lineHeight: 1.8 }}>
              {historico.map(h => (
                <li key={h.id}>
                  {h.usuarios?.nome ?? '(removido)'} · de {data(h.concedido_em)} a {data(h.revogado_em!)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* ── o sistema. Este iframe não pode ser remontado nem movido daqui. ── */}
      <iframe
        ref={iframeRef}
        src="/api/financeiro/pagina"
        title="FAM Financeiro"
        /* Sem moldura: a tela é full-bleed (ver TELA_CHEIA no DashboardShell),
           então o iframe vai de borda a borda e a altura é a janela menos o
           cabeçalho do CRM e a barra fina daqui de cima. Antes sobravam 190px
           reservados e o sistema ficava espremido numa faixa · é a tela em que
           o CFO passa o dia. */
        style={{
          width: '100%',
          // medido, nunca chutado · ver o bloco de comentário acima
          height: altura ? altura + 'px' : '70vh',
          border: 'none', borderTop: '1px solid var(--border)', background: '#fff', display: 'block',
        }}
      />
    </div>
  )
}
