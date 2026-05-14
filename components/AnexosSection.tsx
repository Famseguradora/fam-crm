'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Anexo } from '@/types'

const BUCKET = 'fam-anexos'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

function fmtBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function iconeArquivo(mime: string | null): string {
  if (!mime) return '📄'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime === 'application/pdf') return '📕'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.includes('sheet') || mime.includes('excel')) return '📊'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📊'
  if (mime.startsWith('video/')) return '🎥'
  if (mime.startsWith('audio/')) return '🎵'
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('compressed')) return '🗜️'
  return '📄'
}

interface Props {
  entidadeTipo: 'tomador' | 'operacao' | 'corretora'
  entidadeId: string
}

export default function AnexosSection({ entidadeTipo, entidadeId }: Props) {
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [erro, setErro] = useState('')
  const [confirmExcluir, setConfirmExcluir] = useState<Anexo | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('anexos')
      .select('*')
      .eq('entidade_tipo', entidadeTipo)
      .eq('entidade_id', entidadeId)
      .order('created_at', { ascending: false })
    setAnexos((data as Anexo[]) ?? [])
    setCarregando(false)
  }, [entidadeTipo, entidadeId])

  useEffect(() => { carregar() }, [carregar])

  async function uploadArquivo(file: File) {
    setErro('')
    if (file.size > MAX_BYTES) {
      setErro(`Arquivo muito grande. Máximo permitido: 5 MB. (${fmtBytes(file.size)})`)
      return
    }
    setEnviando(true)
    setProgresso(`Enviando ${file.name}…`)
    try {
      const supabase = createClient()
      const nomeSeguro = file.name.replace(/[^a-zA-Z0-9._\-]/g, '_')
      const path = `${entidadeTipo}/${entidadeId}/${Date.now()}_${nomeSeguro}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined })
      if (uploadError) throw new Error(uploadError.message)

      const { error: dbError } = await supabase.from('anexos').insert({
        entidade_tipo: entidadeTipo,
        entidade_id: entidadeId,
        nome_original: file.name,
        storage_path: path,
        tipo_mime: file.type || null,
        tamanho_bytes: file.size,
      })
      if (dbError) {
        await supabase.storage.from(BUCKET).remove([path])
        throw new Error(dbError.message)
      }
      await carregar()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar arquivo.')
    } finally {
      setEnviando(false)
      setProgresso('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function baixarAnexo(anexo: Anexo) {
    setErro('')
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(anexo.storage_path, 120)
    if (error || !data?.signedUrl) { setErro('Erro ao gerar link de download.'); return }
    try {
      // Fetch como blob para preservar extensão/formato original (ex: .html, .pdf)
      const res = await fetch(data.signedUrl)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = anexo.nome_original
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch {
      // fallback: abre em nova aba
      window.open(data.signedUrl, '_blank')
    }
  }

  async function excluirAnexo(anexo: Anexo) {
    setExcluindo(true)
    try {
      const supabase = createClient()
      await supabase.storage.from(BUCKET).remove([anexo.storage_path])
      await supabase.from('anexos').delete().eq('id', anexo.id)
      await carregar()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir.')
    } finally {
      setExcluindo(false)
      setConfirmExcluir(null)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDrag(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadArquivo(file)
  }

  return (
    <div>
      {/* Título da seção */}
      <div className="section-title" style={{ marginBottom: 14 }}>
        <span className="dot" style={{ background: '#3070c8' }} />Anexos
        <span style={{ marginLeft: 8, fontSize: 12, color: '#6080a0', fontWeight: 400 }}>
          ({anexos.length}) · máx. 5 MB por arquivo
        </span>
      </div>

      {/* Área de upload */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => !enviando && fileRef.current?.click()}
        style={{
          border: `2px dashed ${drag ? '#3070c8' : '#c5d5e8'}`,
          borderRadius: 10,
          padding: '18px 16px',
          textAlign: 'center',
          cursor: enviando ? 'not-allowed' : 'pointer',
          background: drag ? '#e8f0fc' : '#f8fafc',
          transition: 'all 0.15s',
          marginBottom: 14,
          userSelect: 'none',
        }}
      >
        <input
          ref={fileRef}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadArquivo(f) }}
          disabled={enviando}
        />
        {enviando ? (
          <div style={{ color: '#3070c8', fontSize: 13, fontWeight: 600 }}>{progresso}</div>
        ) : (
          <>
            <div style={{ fontSize: 22, marginBottom: 4 }}>📎</div>
            <div style={{ fontSize: 13, color: '#3070c8', fontWeight: 600 }}>
              Clique ou arraste um arquivo aqui
            </div>
            <div style={{ fontSize: 11, color: '#6080a0', marginTop: 2 }}>
              Qualquer tipo de arquivo · máx. 5 MB
            </div>
          </>
        )}
      </div>

      {erro && (
        <div className="alert-error" style={{ marginBottom: 12, fontSize: 13 }}>
          {erro}
          <button onClick={() => setErro('')} style={{ marginLeft: 10, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#a02020' }}>✕</button>
        </div>
      )}

      {/* Lista de anexos */}
      {carregando ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#6080a0', fontSize: 13 }}>Carregando…</div>
      ) : anexos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#6080a0', fontSize: 13 }}>
          Nenhum anexo. Faça o upload acima.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {anexos.map((a) => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', background: '#f0f4f8',
              borderRadius: 8, border: '1px solid #d0e4f5',
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{iconeArquivo(a.tipo_mime)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2a3a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.nome_original}
                </div>
                <div style={{ fontSize: 11, color: '#6080a0' }}>
                  {fmtBytes(a.tamanho_bytes)}{a.tamanho_bytes ? ' · ' : ''}{fmtData(a.created_at)}
                </div>
              </div>
              <button
                onClick={() => baixarAnexo(a)}
                title="Baixar"
                style={{ padding: '4px 10px', borderRadius: 6, border: '1.5px solid #c5d5e8', background: 'white', color: '#1e4080', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'Calibri','Segoe UI',sans-serif", whiteSpace: 'nowrap' }}
              >
                ⬇ Baixar
              </button>
              <button
                onClick={() => setConfirmExcluir(a)}
                title="Excluir"
                style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#fbeaea', color: '#a02020', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal confirmação de exclusão */}
      {confirmExcluir && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setConfirmExcluir(null)}>
          <div className="modal-box" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <div className="modal-title">Excluir Anexo</div>
              <button onClick={() => setConfirmExcluir(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6080a0' }}>✕</button>
            </div>
            <p style={{ marginBottom: 20, fontSize: 14, color: '#1a2a3a' }}>
              Excluir <strong>"{confirmExcluir.nome_original}"</strong>?
              Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setConfirmExcluir(null)}>Cancelar</button>
              <button className="btn-danger" onClick={() => excluirAnexo(confirmExcluir)} disabled={excluindo}>
                {excluindo ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
