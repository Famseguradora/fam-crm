'use client'

// ============================================================================
//  "O QUE EU SEI DESTE TOMADOR"  ·  as notas, com o editor igual ao OneNote
//
//  Porte do bloco de notas do cockpit (notas.mjs + o editor do cockpit.js):
//  a barra de formatação (negrito, itálico, sublinhado, tachado, marca-texto,
//  lista, numeração, caixinha de tarefa, link, imagem, limpar) em cima, o
//  título opcional, a folha para escrever, e o ⤢ que traz a MESMA folha para
//  a tela cheia (é o mesmo nó, não uma segunda caixa).
//
//  A nota é por CHAVE do tomador, e não por análise: o que ele sabe da empresa
//  atravessa as análises dela. As que ele escreveu no cockpit chegam pelo
//  agente (origem=motor); as que escreve aqui ficam aqui. Ninguém apaga a do
//  outro.
//
//  O HTML é limpo antes de gravar (`limparHtml`, a mesma lista de permissão do
//  notas.mjs): print colado vira data: URI e viaja dentro da nota.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { limparHtml, limparTitulo, type Nota } from '@/lib/analise/notas'
import { dataCurta } from '@/lib/analise/mesa'

export default function Notas({ chave, filaId, tomadorId, cnpj, podeEscrever, nomeUsuario }: {
  chave: string
  filaId: string | null
  tomadorId: string | null
  cnpj: string | null
  podeEscrever: boolean
  nomeUsuario: string | null
}) {
  const [notas, setNotas] = useState<Nota[]>([])
  const [titulo, setTitulo] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [cheia, setCheia] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const editor = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    if (!chave) return
    const supabase = createClient()
    const { data, error } = await supabase.from('analise_notas').select('*').eq('chave', chave)
      .order('fixada', { ascending: false }).order('em', { ascending: false }).limit(200)
    if (error) { setErro(error.message); return }
    setNotas((data ?? []) as Nota[])
  }, [chave])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!cheia) return
    const sair = (e: KeyboardEvent) => { if (e.key === 'Escape') setCheia(false) }
    window.addEventListener('keydown', sair)
    return () => window.removeEventListener('keydown', sair)
  }, [cheia])

  /* execCommand continua sendo o que faz um contenteditable formatar sem
     biblioteca. Está marcado como obsoleto há anos e continua em todo
     navegador; é o mesmo que o cockpit usa. */
  const cmd = (c: string, v?: string) => {
    editor.current?.focus()
    document.execCommand(c, false, v)
  }
  const marcar = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const alcance = sel.getRangeAt(0)
    const m = document.createElement('mark')
    try { alcance.surroundContents(m) } catch { cmd('hiliteColor', '#fdf0b8') }
  }
  const tarefa = () => {
    const sel = window.getSelection()
    const no = sel?.anchorNode
    const el = (no?.nodeType === 1 ? no as HTMLElement : no?.parentElement) ?? null
    const alvo = el?.closest('li, p, div') as HTMLElement | null
    if (alvo && editor.current?.contains(alvo) && alvo !== editor.current) {
      const atual = alvo.getAttribute('data-tarefa')
      if (!atual) alvo.setAttribute('data-tarefa', 'aberta')
      else if (atual === 'aberta') alvo.setAttribute('data-tarefa', 'feita')
      else alvo.removeAttribute('data-tarefa')
    } else {
      cmd('insertHTML', '<div data-tarefa="aberta">&nbsp;</div>')
    }
  }
  const link = () => {
    const url = window.prompt('Endereço do link (https://…)')
    if (url) cmd('createLink', url)
  }
  const imagem = (arq: File) => {
    if (!/^image\//.test(arq.type)) return
    const leitor = new FileReader()
    leitor.onload = () => cmd('insertImage', String(leitor.result))
    leitor.readAsDataURL(arq)
  }
  const colar = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (item) { e.preventDefault(); const f = item.getAsFile(); if (f) imagem(f) }
  }
  const soltar = (e: React.DragEvent) => {
    const f = e.dataTransfer.files?.[0]
    if (f && /^image\//.test(f.type)) { e.preventDefault(); imagem(f) }
  }

  const salvar = async () => {
    if (!podeEscrever || salvando) return
    const html = limparHtml(editor.current?.innerHTML ?? '')
    const soTexto = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
    if (!soTexto && !/<img/i.test(html)) return
    setSalvando(true); setErro('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const linha = {
      chave, fila_id: filaId, tomador_id: tomadorId, cnpj,
      titulo: limparTitulo(titulo) || null, html,
      autor_nome: nomeUsuario, autor_auth_id: user?.id ?? null,
      atualizado_em: new Date().toISOString(),
    }
    const { error } = editando
      ? await supabase.from('analise_notas').update(linha).eq('id', editando)
      : await supabase.from('analise_notas').insert({ ...linha, origem: 'crm' })
    if (error) setErro(error.message)
    else {
      if (editor.current) editor.current.innerHTML = ''
      setTitulo(''); setEditando(null); setCheia(false)
      await carregar()
    }
    setSalvando(false)
  }

  const editar = (n: Nota) => {
    setEditando(n.id); setTitulo(n.titulo ?? '')
    if (editor.current) editor.current.innerHTML = n.html
    editor.current?.focus()
  }
  const fixar = async (n: Nota) => {
    const supabase = createClient()
    await supabase.from('analise_notas').update({ fixada: !n.fixada }).eq('id', n.id)
    carregar()
  }
  const apagar = async (n: Nota) => {
    if (!window.confirm('Apagar esta nota? Não tem volta.')) return
    const supabase = createClient()
    await supabase.from('analise_notas').delete().eq('id', n.id)
    carregar()
  }

  return (
    <div>
      {podeEscrever ? (
        <>
          <div className="an-nt-barra" role="toolbar" aria-label="Formatação">
            <button type="button" title="Negrito (Ctrl+B)" onClick={() => cmd('bold')}><b>N</b></button>
            <button type="button" title="Itálico (Ctrl+I)" onClick={() => cmd('italic')}><i>I</i></button>
            <button type="button" title="Sublinhado (Ctrl+U)" onClick={() => cmd('underline')}><u>S</u></button>
            <button type="button" title="Tachado" onClick={() => cmd('strikeThrough')}><s>T</s></button>
            <button type="button" title="Marca-texto" onClick={marcar}><span style={{ background: '#fdf0b8', padding: '0 4px', borderRadius: 3 }}>ab</span></button>
            <span className="sep" />
            <button type="button" title="Lista" onClick={() => cmd('insertUnorderedList')}>•</button>
            <button type="button" title="Numeração" onClick={() => cmd('insertOrderedList')}>1.</button>
            <button type="button" title="Caixinha de tarefa: clique de novo para marcar feita" onClick={tarefa}>☐</button>
            <span className="sep" />
            <button type="button" title="Link" onClick={link}>🔗</button>
            <label title="Imagem (ou cole o print direto na folha)" style={{ display: 'inline-grid', placeItems: 'center', width: 30, height: 28, cursor: 'pointer', borderRadius: 6 }}>
              🖼<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) imagem(f); e.currentTarget.value = '' }} />
            </label>
            <button type="button" title="Limpar formatação" onClick={() => cmd('removeFormat')}>⌫</button>
            <span style={{ flex: 1 }} />
            <button type="button" title={cheia ? 'Voltar para a coluna (Esc)' : 'Escrever em tela cheia'} onClick={() => setCheia(v => !v)}>{cheia ? '✕' : '⤢'}</button>
          </div>
          <input className="an-nt-titulo" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título da nota (opcional)" maxLength={120} />
          <div ref={editor} className={`an-nt-editor${cheia ? ' cheia' : ''}`} contentEditable suppressContentEditableWarning
            data-vazio="Escreva aqui o que você sabe deste tomador e não cabe em documento: o que o corretor falou, o que você viu na visita, o que desconfia. Pode colar print, arrastar imagem e formatar o texto."
            onPaste={colar} onDrop={soltar} onDragOver={e => e.preventDefault()}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') salvar() }} />
          <div className="an-nt-pe">
            <button type="button" className="an-bt azul mini" onClick={salvar} disabled={salvando}>{editando ? 'Salvar a edição' : 'Guardar a nota'}</button>
            {editando && <button type="button" className="an-bt mini" onClick={() => { setEditando(null); setTitulo(''); if (editor.current) editor.current.innerHTML = '' }}>Cancelar</button>}
            <small>Ctrl+Enter guarda. Fica por tomador, e a equipe toda lê.</small>
          </div>
        </>
      ) : (
        <div className="an-explica">Só quem escreve no CRM anota aqui. Você está lendo.</div>
      )}
      {erro && <div className="an-aviso erro">{erro}</div>}

      {notas.length === 0 && <div className="an-vazio">Ainda não há nada escrito sobre este tomador.</div>}
      {notas.map(n => (
        <div key={n.id} className={`an-nota${n.fixada ? ' fixada' : ''}`}>
          <div className="tit">
            {n.fixada && <span title="Fixada">📌</span>}
            <span>{n.titulo || dataCurta(n.em)}</span>
            <span className="q">{n.autor_nome || 'Marco'} · {dataCurta(n.em)}{n.origem === 'motor' ? ' · no sistema' : ''}</span>
          </div>
          <div className="corpo" dangerouslySetInnerHTML={{ __html: limparHtml(n.html) }} />
          {podeEscrever && (
            <div className="bts">
              <button type="button" onClick={() => fixar(n)}>{n.fixada ? 'desafixar' : 'fixar'}</button>
              {n.origem === 'crm' && <button type="button" onClick={() => editar(n)}>editar</button>}
              {n.origem === 'crm' && <button type="button" className="perigo" onClick={() => apagar(n)}>apagar</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
