'use client'

export const dynamic = 'force-dynamic'

// ============================================================
//  Apresentação Executiva para a reunião de sócios.
//
//  • Duas peles: "Sala de Diretoria" (16:9, projetar) e "Caderno do Conselho"
//    (A4, imprimir). O mesmo roteiro e os mesmos números nas duas.
//  • Você escolhe quais blocos entram e em que ordem. A escolha fica salva;
//    o que fica salvo são as ESCOLHAS, nunca os números.
//  • Todo valor é lido das tabelas na hora: abrir a tela e exportar releem o
//    banco, então o arquivo sai com a posição do momento da exportação.
// ============================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { carregarDadosApresentacao, type DadosApresentacao } from '@/lib/apresentacao/dados'
import { Slide, PELES, BLOCOS, FONTE, type Pele } from '@/components/apresentacao/Slides'
import PdfPreview, { type PdfGerado } from '@/components/PdfPreview'

const CHAVE_ESCOLHAS = 'fam.apresentacao.escolhas.v1'

interface Escolhas {
  pele: Pele['id']
  ordem: string[]        // ids de blocos, na ordem em que saem
  desligados: string[]   // ids que ficam de fora
}

const PADRAO: Escolhas = {
  pele: 'diretoria',
  ordem: BLOCOS.map(b => b.id),
  desligados: [],
}

// Só aceita ids que existem hoje: um bloco removido do código não pode
// quebrar a tela de quem tem a escolha antiga salva.
function sanear(bruto: unknown): Escolhas {
  const validos = new Set(BLOCOS.map(b => b.id))
  const e = bruto as Partial<Escolhas> | null
  if (!e || typeof e !== 'object') return PADRAO
  const ordem = (Array.isArray(e.ordem) ? e.ordem : []).filter(id => validos.has(id))
  for (const b of BLOCOS) if (!ordem.includes(b.id)) ordem.push(b.id)
  return {
    pele: e.pele === 'caderno' ? 'caderno' : 'diretoria',
    ordem,
    desligados: (Array.isArray(e.desligados) ? e.desligados : []).filter(id => validos.has(id)),
  }
}

export default function ApresentacaoPage() {
  const router = useRouter()

  const [dados, setDados] = useState<DadosApresentacao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ano, setAno] = useState<string | undefined>(undefined)
  // Lê a escolha salva já na primeira renderização. No servidor não há
  // localStorage, e nada que dependa de `escolhas` é renderizado antes de os
  // dados chegarem (o que só acontece no navegador), então não há divergência
  // entre o HTML do servidor e o do cliente.
  const [escolhas, setEscolhas] = useState<Escolhas>(() => {
    if (typeof window === 'undefined') return PADRAO
    try {
      const bruto = window.localStorage.getItem(CHAVE_ESCOLHAS)
      return bruto ? sanear(JSON.parse(bruto)) : PADRAO
    } catch { return PADRAO }
  })
  const [exportando, setExportando] = useState<'' | 'pdf' | 'png'>('')
  const [progresso, setProgresso] = useState('')
  const [pdf, setPdf] = useState<PdfGerado | null>(null)
  const [larguraPalco, setLarguraPalco] = useState(900)

  const palcoRef = useRef<HTMLDivElement>(null)
  const slidesRef = useRef<Map<string, HTMLDivElement>>(new Map())

  const pele = PELES[escolhas.pele]

  const gravar = useCallback((novas: Escolhas) => {
    setEscolhas(novas)
    try { localStorage.setItem(CHAVE_ESCOLHAS, JSON.stringify(novas)) } catch { /* sem localStorage: só não persiste */ }
  }, [])

  // ── Dados ao vivo ──────────────────────────────────────────────────────────
  // `buscar` só lê o banco e devolve; quem mexe no estado é cada chamador.
  // Separar as duas coisas evita renderização em cascata no efeito de abertura.
  const buscar = useCallback(
    (anoAlvo?: string) => carregarDadosApresentacao(createClient(), anoAlvo),
    [],
  )

  const aplicar = useCallback((novos: DadosApresentacao) => {
    setDados(novos)
    setErro(null)
  }, [])

  // Carga inicial e troca de exercício.
  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const novos = await buscar(ano)
        if (vivo) aplicar(novos)
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível ler os dados.')
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => { vivo = false }
  }, [buscar, aplicar, ano])

  // Recarga pedida no botão: aqui o indicador pode ser ligado direto, porque
  // parte de um clique e não de um efeito.
  async function recarregar(anoAlvo?: string) {
    setCarregando(true)
    try {
      aplicar(await buscar(anoAlvo))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler os dados.')
    } finally {
      setCarregando(false)
    }
  }

  // Largura disponível para encaixar o slide na tela. ResizeObserver em vez de
  // medir no corpo do efeito: pega também o recolher da barra lateral, não só
  // o redimensionar da janela.
  useEffect(() => {
    const el = palcoRef.current
    if (!el) return
    const ro = new ResizeObserver(entradas => {
      const l = entradas[0]?.contentRect.width
      if (l && l > 0) setLarguraPalco(l)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [carregando, dados])

  const ativos = useMemo(
    () => escolhas.ordem.filter(id => !escolhas.desligados.includes(id)),
    [escolhas],
  )

  // Sumário que a capa do caderno imprime: os blocos escolhidos, menos a
  // própria capa, com o número da página em que cada um sai.
  const sumario = useMemo(
    () => ativos
      .map((id, i) => ({ pagina: i + 1, titulo: BLOCOS.find(b => b.id === id)?.titulo ?? id, id }))
      .filter(s => s.id !== 'capa'),
    [ativos],
  )

  // ── Ações do seletor ───────────────────────────────────────────────────────
  const alternarBloco = (id: string) => {
    const fora = escolhas.desligados.includes(id)
    gravar({ ...escolhas, desligados: fora ? escolhas.desligados.filter(x => x !== id) : [...escolhas.desligados, id] })
  }

  const mover = (id: string, dir: -1 | 1) => {
    const i = escolhas.ordem.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= escolhas.ordem.length) return
    const nova = [...escolhas.ordem]
    ;[nova[i], nova[j]] = [nova[j], nova[i]]
    gravar({ ...escolhas, ordem: nova })
  }

  // ── Exportação ─────────────────────────────────────────────────────────────
  // Relê o banco antes de gerar: o arquivo sai com a posição DESTE momento,
  // não com o que estava na tela quando ela foi aberta.
  async function capturarSlides(): Promise<{ id: string; dataUrl: string }[]> {
    const { toPng } = await import('html-to-image')
    const saida: { id: string; dataUrl: string }[] = []
    for (let i = 0; i < ativos.length; i++) {
      const id = ativos[i]
      const node = slidesRef.current.get(id)
      if (!node) continue
      setProgresso(`Renderizando ${i + 1} de ${ativos.length}...`)
      const dataUrl = await toPng(node, {
        width: pele.largura, height: pele.altura,
        pixelRatio: 2, cacheBust: true, backgroundColor: pele.fundo,
        style: { transform: 'none', transformOrigin: 'top left', margin: '0' },
      })
      saida.push({ id, dataUrl })
    }
    return saida
  }

  async function exportarPdf() {
    setExportando('pdf'); setProgresso('Lendo os números do banco...')
    try {
      aplicar(await buscar(ano))
      await new Promise(r => setTimeout(r, 700)) // deixa o React repintar antes de fotografar
      const imagens = await capturarSlides()
      if (imagens.length === 0) throw new Error('Nenhum bloco selecionado.')

      setProgresso('Montando o PDF...')
      const { default: jsPDF } = await import('jspdf')
      const paisagem = pele.id === 'diretoria'
      // A tela 16:9 vira uma folha do próprio tamanho (não A4), para o slide
      // ocupar a página inteira sem tarja branca. O caderno é A4 de verdade.
      const doc = paisagem
        ? new jsPDF({ orientation: 'landscape', unit: 'mm', format: [338.7, 190.5] })
        : new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const lp = doc.internal.pageSize.getWidth()
      const ap = doc.internal.pageSize.getHeight()

      imagens.forEach((img, i) => {
        if (i > 0) doc.addPage()
        doc.addImage(img.dataUrl, 'PNG', 0, 0, lp, ap, undefined, 'FAST')
      })

      const blob = doc.output('blob')
      setPdf({
        url: URL.createObjectURL(blob),
        filename: `FAM_Apresentacao_${pele.id === 'diretoria' ? 'Diretoria' : 'Caderno'}_${new Date().toISOString().slice(0, 10)}.pdf`,
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o PDF.')
    } finally {
      setExportando(''); setProgresso('')
    }
  }

  async function exportarImagens() {
    setExportando('png'); setProgresso('Lendo os números do banco...')
    try {
      aplicar(await buscar(ano))
      await new Promise(r => setTimeout(r, 700))
      const imagens = await capturarSlides()
      const dia = new Date().toISOString().slice(0, 10)
      for (let i = 0; i < imagens.length; i++) {
        setProgresso(`Baixando ${i + 1} de ${imagens.length}...`)
        const a = document.createElement('a')
        a.href = imagens[i].dataUrl
        a.download = `FAM_${String(i + 1).padStart(2, '0')}_${imagens[i].id}_${dia}.png`
        document.body.appendChild(a); a.click(); a.remove()
        await new Promise(r => setTimeout(r, 450)) // o navegador engasga com downloads em rajada
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar as imagens.')
    } finally {
      setExportando(''); setProgresso('')
    }
  }

  async function baixarUm(id: string) {
    const node = slidesRef.current.get(id)
    if (!node) return
    const { toPng } = await import('html-to-image')
    const dataUrl = await toPng(node, {
      width: pele.largura, height: pele.altura, pixelRatio: 2, cacheBust: true,
      backgroundColor: pele.fundo, style: { transform: 'none', transformOrigin: 'top left', margin: '0' },
    })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `FAM_${id}_${new Date().toISOString().slice(0, 10)}.png`
    document.body.appendChild(a); a.click(); a.remove()
  }

  // ── Estilos ────────────────────────────────────────────────────────────────
  const cartao: React.CSSProperties = {
    background: 'white', borderRadius: 12, border: '1.5px solid #d0e4f5',
    boxShadow: '0 1px 4px rgba(30,64,128,0.06)',
  }
  const btn: React.CSSProperties = {
    padding: '8px 15px', borderRadius: 8, border: '1.5px solid #d0e4f5',
    background: 'white', color: '#1e4080', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: FONTE, display: 'inline-flex', alignItems: 'center', gap: 6,
  }
  const btnPrim: React.CSSProperties = { ...btn, background: '#1e4080', color: 'white', borderColor: '#1e4080' }

  const escala = Math.min(1, larguraPalco / pele.largura)

  return (
    <div style={{ fontFamily: FONTE, maxWidth: 1320, margin: '0 auto', padding: '24px 20px 60px' }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
        <button onClick={() => router.back()} style={btn}>← Voltar</button>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1e4080' }}>🎬 Apresentação Executiva</div>
          <div style={{ fontSize: 13, color: '#6080a0' }}>
            Reunião de sócios · números lidos do banco no momento da exportação
          </div>
        </div>
        {dados && dados.anosDisponiveis.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: '#6080a0', fontWeight: 600 }}>Exercício:</label>
            <select
              value={ano ?? dados.ano}
              onChange={e => setAno(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #d0e4f5', fontFamily: FONTE, fontSize: 14, fontWeight: 700, color: '#1e4080', background: 'white', cursor: 'pointer' }}
            >
              {dados.anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}
        <button onClick={() => recarregar(ano)} style={btn} disabled={carregando || !!exportando}>
          ↻ Atualizar dados
        </button>
        <button onClick={exportarImagens} style={btn} disabled={carregando || !!exportando || ativos.length === 0}>
          🖼 Exportar imagens
        </button>
        <button onClick={exportarPdf} style={btnPrim} disabled={carregando || !!exportando || ativos.length === 0}>
          {exportando === 'pdf' ? 'Gerando...' : '📄 Exportar PDF'}
        </button>
      </div>

      {progresso && (
        <div style={{ ...cartao, padding: '10px 16px', marginBottom: 16, fontSize: 13.5, color: '#1e4080', fontWeight: 600, background: '#f0f6ff' }}>
          {progresso}
        </div>
      )}
      {erro && (
        <div style={{ ...cartao, padding: '12px 16px', marginBottom: 16, fontSize: 13.5, color: '#b3261e', borderColor: '#f2c4c0', background: '#fdf3f2' }}>
          {erro}
        </div>
      )}

      {carregando && !dados ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6080a0', fontSize: 15 }}>Lendo os números do banco...</div>
      ) : !dados ? null : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 22, alignItems: 'start' }} className="apres-grade">

          {/* Painel de escolhas */}
          <div style={{ ...cartao, overflow: 'hidden', position: 'sticky', top: 16 }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #eef2f8', background: '#f8fbff' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e4080' }}>Formato</div>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(Object.values(PELES)).map(p => (
                <button
                  key={p.id}
                  onClick={() => gravar({ ...escolhas, pele: p.id })}
                  style={{
                    ...btn, width: '100%', textAlign: 'left', display: 'block', padding: '10px 13px',
                    borderColor: escolhas.pele === p.id ? '#1e4080' : '#d0e4f5',
                    background: escolhas.pele === p.id ? '#eef4fc' : 'white',
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 800 }}>{p.nome}</div>
                  <div style={{ fontSize: 11.5, color: '#6080a0', fontWeight: 400, marginTop: 2 }}>{p.descricao}</div>
                </button>
              ))}
            </div>

            <div style={{ padding: '14px 16px', borderTop: '1px solid #eef2f8', borderBottom: '1px solid #eef2f8', background: '#f8fbff', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e4080' }}>O que entra</div>
              <div style={{ fontSize: 12, color: '#6080a0' }}>{ativos.length} de {BLOCOS.length}</div>
            </div>
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 460, overflowY: 'auto' }}>
              {escolhas.ordem.map((id, i) => {
                const b = BLOCOS.find(x => x.id === id)
                if (!b) return null
                const ligado = !escolhas.desligados.includes(id)
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 7, background: ligado ? 'transparent' : '#fafbfc' }}>
                    <input
                      type="checkbox" checked={ligado} onChange={() => alternarBloco(id)}
                      id={`bloco-${id}`}
                      style={{ width: 17, height: 17, accentColor: '#1e4080', cursor: 'pointer', flex: 'none' }}
                    />
                    <label htmlFor={`bloco-${id}`} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: ligado ? '#1e4080' : '#a0b0c8', textDecoration: ligado ? 'none' : 'line-through' }}>{b.titulo}</div>
                      <div style={{ fontSize: 11, color: '#8fa3bd', lineHeight: 1.35 }}>{b.descricao}</div>
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 'none' }}>
                      <button onClick={() => mover(id, -1)} disabled={i === 0} title="Subir"
                        style={{ ...btn, padding: '1px 6px', fontSize: 10, opacity: i === 0 ? 0.3 : 1, cursor: i === 0 ? 'default' : 'pointer' }}>▲</button>
                      <button onClick={() => mover(id, 1)} disabled={i === escolhas.ordem.length - 1} title="Descer"
                        style={{ ...btn, padding: '1px 6px', fontSize: 10, opacity: i === escolhas.ordem.length - 1 ? 0.3 : 1, cursor: i === escolhas.ordem.length - 1 ? 'default' : 'pointer' }}>▼</button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: '11px 16px', borderTop: '1px solid #eef2f8', fontSize: 11.5, color: '#8fa3bd', lineHeight: 1.5 }}>
              A escolha fica salva neste navegador. O que fica guardado são os blocos e a ordem, nunca os números:
              cada exportação relê o banco.
            </div>
          </div>

          {/* Palco */}
          <div ref={palcoRef} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {ativos.length === 0 ? (
              <div style={{ ...cartao, padding: 40, textAlign: 'center', color: '#6080a0', fontSize: 14 }}>
                Nenhum bloco selecionado. Marque ao menos um à esquerda.
              </div>
            ) : ativos.map((id, i) => (
              <div key={id}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#1e4080' }}>
                    {String(i + 1).padStart(2, '0')} · {BLOCOS.find(b => b.id === id)?.titulo}
                  </span>
                  <button onClick={() => baixarUm(id)} style={{ ...btn, padding: '3px 9px', fontSize: 11.5 }}>
                    🖼 Baixar esta
                  </button>
                </div>
                <div style={{
                  width: pele.largura * escala, height: pele.altura * escala,
                  overflow: 'hidden', borderRadius: 6, border: '1.5px solid #d0e4f5',
                  boxShadow: '0 2px 10px rgba(30,64,128,0.10)',
                }}>
                  <div
                    ref={n => { if (n) slidesRef.current.set(id, n); else slidesRef.current.delete(id) }}
                    style={{ transform: `scale(${escala})`, transformOrigin: 'top left' }}
                  >
                    <Slide bloco={id} dados={dados} pele={pele} pagina={i + 1} total={ativos.length} sumario={sumario} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <PdfPreview pdf={pdf} titulo={`Apresentação · ${pele.nome}`} onFechar={() => setPdf(null)} />

      <style jsx>{`
        @media (max-width: 900px) {
          .apres-grade { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
