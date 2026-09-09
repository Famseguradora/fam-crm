'use client'

/* ENTRADA DO COMERCIAL — a primeira estação da esteira, dentro do CRM.

   DUAS ESTRADAS ATÉ O MESMO LUGAR, e é assim de propósito. Ordem do Marco em
   07/09/2026: "sempre temos que ter a estrada principal e a redundante, ou
   seja, caso a opção 1 dê problema, a opção 2 não deixa a empresa parar".

     principal    a Caixa de entrada: os e-mails aparecem na tela, a pessoa lê,
                  vê os anexos e escolhe qual vira demanda
     redundante   arrastar o .msg/.eml, de qualquer lugar, quando a máquina do
                  Comercial estiver parada

   As duas terminam na MESMA regra (`lib/casos/abrir-por-email.ts`), então o
   caso nasce igual, com o mesmo checklist, tenha entrado por onde tiver
   entrado. Duas estradas, uma regra.

   O upload fica recolhido, e não some: ele é saída de emergência, não o caminho
   de todo dia. Era o contrário na primeira versão desta tela, e estava errado. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { fmtData } from '@/lib/utils'
import Caixa from './Caixa'

interface Caso {
  id: string
  numero: number
  assunto: string
  remetente_nome: string | null
  remetente_email: string | null
  recebido_em: string | null
  cnpj: string | null
  razao_social: string | null
  etapa: string
  criado_em: string
  criado_por_nome: string | null
  tomador_id: string | null
}

const ETAPA_BADGE: Record<string, { classe: string; rotulo: string }> = {
  comercial: { classe: 'badge-gray', rotulo: 'Comercial' },
  triagem: { classe: 'badge-orange', rotulo: 'Triagem' },
  analise: { classe: 'badge-blue', rotulo: 'Análise' },
  encerrado: { classe: 'badge-green', rotulo: 'Encerrado' },
  descartado: { classe: 'badge-gray', rotulo: 'Descartado' },
}

type Recibo = {
  numero: number
  assunto: string
  id: string
  documentos: number
  ignorados: number
  falhas: string[]
  ja_existia?: boolean
}

export default function ComercialPage() {
  const router = useRouter()
  const { somenteLeitura } = usePermissoes()
  const [casos, setCasos] = useState<Caso[]>([])
  const [docsPorCaso, setDocsPorCaso] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState('')
  const [erro, setErro] = useState('')
  const [recibo, setRecibo] = useState<Recibo | null>(null)
  const [sobre, setSobre] = useState(false)
  const [verUpload, setVerUpload] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('casos')
      .select('id, numero, assunto, remetente_nome, remetente_email, recebido_em, cnpj, razao_social, etapa, criado_em, criado_por_nome, tomador_id')
      .order('criado_em', { ascending: false })
      .limit(200)
    const lista = (data ?? []) as Caso[]
    setCasos(lista)

    if (lista.length) {
      const { data: docs } = await supabase
        .from('caso_documentos')
        .select('caso_id')
        .in('caso_id', lista.map((c) => c.id))
      const conta: Record<string, number> = {}
      for (const d of (docs ?? []) as { caso_id: string }[]) conta[d.caso_id] = (conta[d.caso_id] ?? 0) + 1
      setDocsPorCaso(conta)
    }
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function subir(arquivos: FileList | File[]) {
    setErro('')
    setRecibo(null)
    for (const arquivo of Array.from(arquivos)) {
      setEnviando(arquivo.name)
      const corpo = new FormData()
      corpo.append('email', arquivo)
      try {
        const r = await fetch('/api/casos', { method: 'POST', body: corpo })
        const json = await r.json()
        if (!r.ok) { setErro(json.erro ?? 'Não consegui abrir o caso.'); break }
        setRecibo({
          id: json.caso?.id ?? '',
          numero: json.caso?.numero ?? 0,
          assunto: json.caso?.assunto ?? arquivo.name,
          documentos: json.documentos ?? 0,
          ignorados: json.ignorados ?? 0,
          falhas: json.falhas ?? [],
          ja_existia: !!json.ja_existia,
        })
      } catch {
        setErro('A conexão caiu no meio do envio. Tente de novo.')
        break
      }
    }
    setEnviando('')
    await carregar()
  }

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0a1628', margin: 0 }}>Entrada do Comercial</h1>
        <p style={{ color: 'var(--soft)', fontSize: 14, margin: '6px 0 0', maxWidth: '76ch' }}>
          A caixa de e-mail aparece aqui. Você lê, vê os anexos e escolhe qual e-mail vira demanda.
          O CRM guarda os documentos e abre o caso para a Triagem.
        </p>
      </div>

      <Caixa aoAbrirCaso={carregar} />

      {/* ── a saída de emergência ── */}
      {!somenteLeitura && (
        <div className="card-panel" style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setVerUpload((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
            }}
          >
            <span style={{ color: 'var(--soft)', fontSize: 13 }}>{verUpload ? '▾' : '▸'}</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1a3560' }}>
              Subir o e-mail à mão
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--soft)' }}>
              (para quando a máquina do Comercial estiver parada)
            </span>
          </button>

          {verUpload && (
            <div style={{ marginTop: 12 }}>
              <div
                onDragOver={(e) => { e.preventDefault(); setSobre(true) }}
                onDragLeave={() => setSobre(false)}
                onDrop={(e) => { e.preventDefault(); setSobre(false); if (e.dataTransfer.files.length) subir(e.dataTransfer.files) }}
                onClick={() => entrada.current?.click()}
                style={{
                  border: `2px dashed ${sobre ? '#1e4080' : 'var(--border)'}`,
                  background: sobre ? '#e8f0fa' : 'var(--card)',
                  borderRadius: 12, padding: '22px 20px', textAlign: 'center',
                  cursor: enviando ? 'progress' : 'pointer',
                  transition: 'border-color .15s, background .15s',
                }}
              >
                <input
                  ref={entrada} type="file" accept=".msg,.eml" multiple hidden
                  onChange={(e) => { if (e.target.files?.length) subir(e.target.files); e.target.value = '' }}
                />
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#1a3560' }}>
                  {enviando ? `Lendo ${enviando}…` : 'Arraste o e-mail aqui, ou clique para escolher'}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--soft)', marginTop: 6 }}>
                  Arraste direto do Outlook (.msg) ou o arquivo salvo (.eml). Pode soltar vários.
                  O mesmo e-mail não vira dois casos.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {erro && <div className="alert-error" style={{ margin: '14px 0' }}>{erro}</div>}

      {recibo && (
        <div className="alert-success" style={{ margin: '14px 0' }}>
          <div>
            {recibo.ja_existia
              ? <>Este e-mail já era o caso <strong>#{recibo.numero}</strong>: {recibo.assunto}</>
              : <>Caso <strong>#{recibo.numero}</strong> aberto: {recibo.assunto}</>}
            {recibo.id && (
              <button
                type="button"
                onClick={() => router.push(`/comercial/${recibo.id}`)}
                style={{ marginLeft: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline', color: 'inherit' }}
              >
                abrir
              </button>
            )}
          </div>
          {!recibo.ja_existia && (
            <div style={{ fontWeight: 400, fontSize: 13, marginTop: 4 }}>
              {recibo.documentos} documento{recibo.documentos === 1 ? '' : 's'} guardado
              {recibo.documentos === 1 ? '' : 's'}
              {recibo.ignorados > 0 && ` · ${recibo.ignorados} anexo${recibo.ignorados === 1 ? '' : 's'} ignorado${recibo.ignorados === 1 ? '' : 's'} (assinatura, imagem do corpo ou arquivo vazio)`}
            </div>
          )}
          {recibo.falhas.length > 0 && (
            <div style={{ fontWeight: 400, fontSize: 13, marginTop: 6, color: '#a02020' }}>
              Não subiram: {recibo.falhas.join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* ── a fila ── */}
      <div className="card-panel" style={{ marginTop: 16 }}>
        <div className="section-title"><span className="dot" />Casos na esteira</div>

        {carregando ? (
          <p style={{ color: 'var(--soft)', fontSize: 14 }}>Carregando…</p>
        ) : casos.length === 0 ? (
          <p style={{ color: 'var(--soft)', fontSize: 14 }}>
            Nenhum caso ainda. O primeiro e-mail que você trouxer aqui em cima abre o caso número 1.
          </p>
        ) : (
          <div className="fam-table-wrap">
            <table className="fam-table">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>#</th>
                  <th>Assunto</th>
                  <th>Quem mandou</th>
                  <th style={{ width: 92 }}>Documentos</th>
                  <th style={{ width: 110 }}>Etapa</th>
                  <th style={{ width: 108 }}>Entrada</th>
                </tr>
              </thead>
              <tbody>
                {casos.map((c) => {
                  const b = ETAPA_BADGE[c.etapa] ?? ETAPA_BADGE.comercial
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/comercial/${c.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ fontWeight: 700, color: 'var(--soft)' }}>{c.numero}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0a1628' }}>{c.assunto}</div>
                        {(c.razao_social || c.cnpj) && (
                          <div style={{ fontSize: 12, color: 'var(--soft)' }}>
                            {c.razao_social}{c.razao_social && c.cnpj ? ' · ' : ''}{c.cnpj}
                          </div>
                        )}
                      </td>
                      <td>
                        <div>{c.remetente_nome ?? '-'}</div>
                        <div style={{ fontSize: 12, color: 'var(--soft)' }}>{c.remetente_email}</div>
                      </td>
                      <td style={{ fontWeight: 700 }}>{docsPorCaso[c.id] ?? 0}</td>
                      <td><span className={`badge ${b.classe}`}>{b.rotulo}</span></td>
                      <td>{fmtData(c.criado_em)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
