'use client'

// O parecer complementar na tela: o mesmo HTML que ele baixa e manda por
// e-mail. Some quando a análise não teve determinação da Diretoria.
//
// EDITAR (28/09/2026). O parecer sai gerado, mas quem assina é o analista: ele
// acrescenta as próprias ressalvas ("análise especulativa, não confere
// aprovação") e imagens antes de mandar. As ferramentas são as do relatório
// principal (v13): contenteditable + execCommand, imagem embutida no próprio
// documento, e o download leva exatamente o que foi salvo.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { carregarParecer, htmlDoParecer, type DadosParecer } from '@/lib/analise/parecer-complementar'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { cor, raio, texto, botaoCheio, botaoVazado } from '@/lib/ui/painel'
import { Aviso } from '@/components/painel/Painel'

const nomeDoArquivo = (p: DadosParecer) =>
  'FAM_Parecer_complementar_' + p.razao.replace(/[^\wÀ-ÿ .-]/g, '').trim().replace(/\s+/g, '_').slice(0, 80)
  + '_' + p.dataAnalise.slice(0, 10) + '.html'

const RESSALVA_MODELO =
  'Esta análise complementar é especulativa e não confere aprovação tácita ou real. '
  + 'Serve para cumprir a solicitação da Diretoria de Subscrição e não substitui a análise oficial.'

/** O documento vai para o banco e é aberto por outras pessoas: nada que execute sobrevive. */
function limpar(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, iframe, object, embed, link, meta[http-equiv], base, form').forEach(n => n.remove())
  doc.querySelectorAll('*').forEach(el => {
    for (const at of [...el.attributes]) {
      const nome = at.name.toLowerCase()
      const val = at.value.trim().toLowerCase()
      if (nome.startsWith('on') || nome === 'contenteditable' || nome === 'spellcheck') el.removeAttribute(at.name)
      else if ((nome === 'href' || nome === 'src' || nome === 'xlink:href') && (val.startsWith('javascript:') || (val.startsWith('data:') && !val.startsWith('data:image/')))) el.removeAttribute(at.name)
    }
  })
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}

/** Foto de celular tem 5 MB: reduz para caber no banco sem perder leitura. */
function imagemComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((ok, falha) => {
    const leitor = new FileReader()
    leitor.onerror = () => falha(new Error('Não consegui ler a imagem.'))
    leitor.onload = () => {
      const bruto = String(leitor.result)
      if (arquivo.size <= 300 * 1024) { ok(bruto); return }
      const img = new Image()
      img.onerror = () => falha(new Error('Formato de imagem não suportado.'))
      img.onload = () => {
        const escala = Math.min(1, 1400 / img.width)
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * escala)
        c.height = Math.round(img.height * escala)
        const g = c.getContext('2d')!
        g.fillStyle = '#fff'
        g.fillRect(0, 0, c.width, c.height)
        g.drawImage(img, 0, 0, c.width, c.height)
        ok(c.toDataURL('image/jpeg', 0.85))
      }
      img.src = bruto
    }
    leitor.readAsDataURL(arquivo)
  })
}

export default function ParecerComplementar({ analiseId, chave }: { analiseId?: string; chave?: string }) {
  const { editaAnalise } = usePermissoes()
  const [dados, setDados] = useState<DadosParecer | null>(null)
  const [versao, setVersao] = useState(0)
  const [altura, setAltura] = useState(600)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const quadro = useRef<HTMLIFrameElement>(null)
  const arquivoImg = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    carregarParecer(createClient(), { id: analiseId, chave })
      .then(d => { if (vivo) setDados(d) })
      .catch(() => { if (vivo) setDados(null) })
    return () => { vivo = false }
  }, [analiseId, chave, versao])

  const doc = () => quadro.current?.contentDocument ?? null
  const medir = useCallback(() => {
    const d = quadro.current?.contentDocument
    if (d?.documentElement) setAltura(d.documentElement.scrollHeight + 4)
  }, [])

  const corpoEditavel = () => doc()?.querySelector<HTMLElement>('.corpo') ?? doc()?.body ?? null

  const ligarEdicao = (ligar: boolean) => {
    const c = corpoEditavel()
    if (!c) return
    c.contentEditable = ligar ? 'true' : 'false'
    c.style.outline = ligar ? `2px dashed ${cor.bordaAtiva}` : ''
    c.style.outlineOffset = ligar ? '-6px' : ''
    if (ligar) doc()?.execCommand('styleWithCSS', false, 'true')
  }

  // A altura do documento muda enquanto ele escreve: sem ouvir o quadro (ele
  // não roda script), mede de tempos em tempos só enquanto edita.
  useEffect(() => {
    if (!editando) return
    const t = setInterval(medir, 700)
    return () => clearInterval(t)
  }, [editando, medir])

  if (!dados) return null
  const html = dados.editado?.html ?? htmlDoParecer(dados)

  const baixar = () => {
    const atual = editando ? limpar('<!doctype html>' + (doc()?.documentElement.outerHTML ?? '')) : html
    const url = URL.createObjectURL(new Blob([atual], { type: 'text/html;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nomeDoArquivo(dados)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const imprimir = () => {
    const w = quadro.current?.contentWindow
    if (w) { w.focus(); w.print() }
  }

  const cmd = (nome: string, valor?: string) => {
    const d = doc()
    if (!d) return
    quadro.current?.contentWindow?.focus()
    if (nome === 'hiliteColor' && !d.execCommand('hiliteColor', false, valor)) d.execCommand('backColor', false, valor)
    else d.execCommand(nome, false, valor)
  }

  /** Insere no cursor; sem cursor dentro do parecer, entra antes da nota final. */
  const inserir = (trecho: string) => {
    const d = doc()
    const c = corpoEditavel()
    if (!d || !c) return
    const sel = d.getSelection()
    const dentro = sel && sel.rangeCount > 0 && c.contains(sel.getRangeAt(0).commonAncestorContainer)
    if (dentro) { quadro.current?.contentWindow?.focus(); d.execCommand('insertHTML', false, trecho) }
    else {
      const nota = c.querySelector('.nota')
      const caixa = d.createElement('div')
      caixa.innerHTML = trecho
      for (const n of [...caixa.childNodes]) c.insertBefore(n, nota)
    }
    medir()
  }

  const escolherImagem = async (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) { setErro('Escolha um arquivo de imagem (PNG ou JPG).'); return }
    try {
      const src = await imagemComoDataUrl(f)
      inserir(`<figure class="img" style="width:70%"><img src="${src}" alt=""><figcaption>Legenda da imagem</figcaption></figure><p><br></p>`)
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  /** A imagem selecionada (clicada) no parecer, para mudar o tamanho. */
  const imagemSelecionada = (): HTMLElement | null => {
    const d = doc()
    const sel = d?.getSelection()
    if (!sel || !sel.rangeCount) return null
    const r = sel.getRangeAt(0)
    let n: Node | null = r.startContainer.childNodes[r.startOffset] ?? r.startContainer
    while (n && n.nodeType === 1 && !(n as HTMLElement).matches?.('figure.img')) {
      const el = n as HTMLElement
      if (el.tagName === 'IMG') { n = el.closest('figure.img') ?? el; break }
      n = el.parentElement
    }
    if (!n || n.nodeType !== 1) n = r.startContainer.parentElement?.closest('figure.img') ?? null
    return (n as HTMLElement | null)?.matches?.('figure.img') ? n as HTMLElement : null
  }

  const tamanho = (passo: number | 'ajustar') => {
    const fig = imagemSelecionada()
    if (!fig) { setErro('Clique na imagem antes de mudar o tamanho.'); return }
    setErro('')
    const atual = parseInt(fig.style.width || '70', 10) || 70
    fig.style.width = passo === 'ajustar' ? '100%' : `${Math.max(15, Math.min(100, atual + passo))}%`
    medir()
  }

  const entrar = () => { setErro(''); setEditando(true); ligarEdicao(true) }

  const cancelar = () => {
    setEditando(false)
    setErro('')
    // Recarrega o quadro com o que está salvo: descarta o que foi digitado.
    if (quadro.current) quadro.current.srcdoc = html
  }

  const salvar = async () => {
    const d = doc()
    if (!d || salvando) return
    setSalvando(true); setErro('')
    ligarEdicao(false)
    const final = limpar('<!doctype html>' + d.documentElement.outerHTML)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    const por = String(user?.user_metadata?.nome || user?.user_metadata?.full_name || user?.email || '')
    const { error } = await sb.from('analises')
      .update({ parecer_editado: { html: final, por, em: new Date().toISOString() } })
      .eq('id', dados.analiseId)
    setSalvando(false)
    if (error) {
      ligarEdicao(true)
      setErro(/row-level|permission|denied/i.test(error.message)
        ? 'O banco recusou: só o analista de crédito grava o parecer.'
        : `Não salvou: ${error.message}`)
      return
    }
    setEditando(false)
    setVersao(v => v + 1)
  }

  const voltarAoGerado = async () => {
    if (!window.confirm('Descartar as suas edições e voltar ao parecer gerado pela análise?')) return
    const { error } = await createClient().from('analises').update({ parecer_editado: null }).eq('id', dados.analiseId)
    if (error) { setErro(`Não voltou: ${error.message}`); return }
    setEditando(false)
    setVersao(v => v + 1)
  }

  const bt: React.CSSProperties = { ...botaoVazado, padding: '6px 10px', minHeight: 36, fontSize: 12.5 }
  const naoRouba = (e: React.MouseEvent) => e.preventDefault()

  return (
    <section style={{
      background: cor.papel, border: `1px solid ${cor.alertaBorda}`, borderLeft: `4px solid ${cor.ouro}`,
      borderRadius: raio.cartao, padding: 12, marginBottom: 14,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={texto.titulo}>Parecer complementar: determinação fora da metodologia</div>
          <div style={texto.apoio}>
            {dados.editado
              ? <>Editado{dados.editado.por ? ` por ${dados.editado.por}` : ''}{dados.editado.em ? ` em ${new Date(dados.editado.em).toLocaleString('pt-BR')}` : ''}. É esta versão que baixa e imprime.</>
              : <>A análise oficial segue a metodologia. Este parecer mostra, ao lado dela, o resultado com o que foi pedido e o motivo do pedido.</>}
          </div>
        </div>
        {!editando && <>
          <button type="button" onClick={baixar} style={{ ...botaoCheio, minHeight: 40 }}>Baixar parecer (HTML)</button>
          <button type="button" onClick={imprimir} style={{ ...botaoVazado, minHeight: 40 }}
            title="Abre a impressão. Escolha Salvar como PDF no destino.">Imprimir / PDF</button>
          {editaAnalise && <button type="button" onClick={entrar} style={{ ...botaoVazado, minHeight: 40 }}>Editar</button>}
        </>}
        {editando && <>
          <button type="button" onClick={salvar} disabled={salvando} style={{ ...botaoCheio, minHeight: 40, opacity: salvando ? 0.6 : 1 }}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" onClick={cancelar} style={{ ...botaoVazado, minHeight: 40 }}>Cancelar</button>
          {dados.editado && <button type="button" onClick={voltarAoGerado} style={{ ...botaoVazado, minHeight: 40 }}>Voltar ao gerado</button>}
        </>}
      </div>

      {editando && (
        <div role="toolbar" aria-label="Formatação do parecer" onMouseDown={naoRouba} style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10, padding: 8,
          background: cor.papelZebra, border: `1px solid ${cor.borda}`, borderRadius: raio.controle,
          position: 'sticky', top: 0, zIndex: 2,
        }}>
          <button type="button" style={{ ...bt, fontWeight: 800 }} onClick={() => cmd('bold')} title="Negrito">B</button>
          <button type="button" style={{ ...bt, fontStyle: 'italic' }} onClick={() => cmd('italic')} title="Itálico">I</button>
          <button type="button" style={{ ...bt, textDecoration: 'underline' }} onClick={() => cmd('underline')} title="Sublinhado">U</button>
          <button type="button" style={{ ...bt, textDecoration: 'line-through' }} onClick={() => cmd('strikeThrough')} title="Tachado">S</button>
          <select aria-label="Tamanho do texto" defaultValue="" onChange={e => { if (e.target.value) cmd('fontSize', e.target.value); e.target.value = '' }}
            style={{ ...bt, fontWeight: 400 }}>
            <option value="">Tamanho</option>
            <option value="2">Pequeno</option>
            <option value="3">Normal</option>
            <option value="4">Médio</option>
            <option value="5">Grande</option>
          </select>
          <label style={{ ...bt, display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Cor do texto">
            Cor <input type="color" defaultValue={cor.alerta} onChange={e => cmd('foreColor', e.target.value)} style={{ width: 22, height: 22, border: 'none', padding: 0, background: 'none' }} />
          </label>
          <label style={{ ...bt, display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Realce">
            Realce <input type="color" defaultValue="#fff3b0" onChange={e => cmd('hiliteColor', e.target.value)} style={{ width: 22, height: 22, border: 'none', padding: 0, background: 'none' }} />
          </label>
          <button type="button" style={bt} onClick={() => cmd('insertUnorderedList')} title="Lista">Lista</button>
          <button type="button" style={bt} onClick={() => cmd('justifyLeft')} title="Alinhar à esquerda">Esquerda</button>
          <button type="button" style={bt} onClick={() => cmd('justifyCenter')} title="Centralizar">Centro</button>
          <button type="button" style={bt} onClick={() => cmd('removeFormat')} title="Limpar formatação">Limpar</button>
          <span style={{ width: 1, alignSelf: 'stretch', background: cor.borda, margin: '0 2px' }} />
          <button type="button" style={bt} onClick={() => inserir(`<div class="ressalva"><b>Ressalva do analista.</b> ${RESSALVA_MODELO}</div><p><br></p>`)}
            title="Caixa destacada para a sua ressalva">Inserir ressalva</button>
          <button type="button" style={bt} onClick={() => inserir('<h2>Novo título</h2><p>Texto.</p>')}>Inserir seção</button>
          <button type="button" style={bt} onClick={() => inserir('<div class="caixa">Texto.</div><p><br></p>')}>Inserir caixa de texto</button>
          <button type="button" style={bt} onClick={() => arquivoImg.current?.click()}>Inserir imagem</button>
          <button type="button" style={bt} onClick={() => inserir('<hr><p><br></p>')}>Divisor</button>
          <span style={{ width: 1, alignSelf: 'stretch', background: cor.borda, margin: '0 2px' }} />
          <span style={texto.rotulo}>Imagem:</span>
          <button type="button" style={bt} onClick={() => tamanho(-10)} title="Diminuir a imagem clicada">−</button>
          <button type="button" style={bt} onClick={() => tamanho(10)} title="Aumentar a imagem clicada">+</button>
          <button type="button" style={bt} onClick={() => tamanho('ajustar')} title="Largura total">Ajustar</button>
          <input ref={arquivoImg} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden
            onChange={e => { escolherImagem(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      )}
      {editando && (
        <div style={{ ...texto.nota, marginTop: 6 }}>
          Clique no texto do parecer para escrever. Para remover uma caixa ou imagem, selecione e apague. Para mudar o
          tamanho de uma imagem, clique nela e use − e +. Nada vale até você clicar em Salvar.
        </div>
      )}
      {erro && <div style={{ marginTop: 8 }}><Aviso tom="erro">{erro}</Aviso></div>}

      <iframe
        ref={quadro}
        title={`Parecer complementar de ${dados.razao}`}
        srcDoc={html}
        // Sem script nenhum: allow-same-origin só para editar, medir e imprimir daqui de fora.
        sandbox="allow-same-origin allow-modals"
        onLoad={() => { medir(); if (editando) ligarEdicao(true) }}
        style={{ width: '100%', height: altura, border: 'none', marginTop: 10, borderRadius: raio.controle, background: cor.fundo }}
      />
    </section>
  )
}
