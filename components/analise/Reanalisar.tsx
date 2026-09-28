'use client'

// ============================================================================
//  REANALISAR  ·  o pedido inteiro numa tela só  ·  24/09/2026
//
//  O que havia antes, e era a queixa: um campo de instrução opcional, e uma
//  frase mandando ele "colar o documento na pasta, dentro de _concluidas no
//  notebook". Documento novo não tinha por onde entrar pelo CRM, e a análise
//  anterior não ia junto para quem reanalisava.
//
//  Aqui o pedido tem três partes e todas viajam:
//    · o MOTIVO, obrigatório. Vira ordem para o analista e fica na trilha da
//      empresa (`analise_reanalises`), para dali a três meses ainda se saber
//      por que aquela decisão foi revista;
//    · os DOCUMENTOS NOVOS, que sobem aqui e entram na ficha do tomador. O
//      agente os baixa PARA DENTRO da pasta antes de rodar;
//    · a ANÁLISE ANTERIOR, que o CRM monta sozinho e manda junto. Ele não
//      precisa pedir isso: passou a ser o padrão.
//
//  O ESCOPO CONTINUA SENDO ESCOLHA DELE, com o mesmo significado de sempre:
//  "parcial" reaproveita só a leitura dos documentos, e nunca um número.
// ============================================================================

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cor, raio, texto, botaoCheio, botaoVazado } from '@/lib/ui/painel'
import { Aviso } from '@/components/painel/Painel'

const MOTIVO_MINIMO = 15
const TETO_JUNTOS = 48 * 1024 * 1024

export default function Reanalisar({ analiseId, pasta, nome, podeEscrever, aoMandar }: {
  analiseId: string
  /** A pasta que a análise guardou. Só para a frase de contexto. */
  pasta?: string | null
  /** O nome do tomador, para a confirmação. */
  nome: string
  podeEscrever: boolean
  /** Chamado com o id da linha da esteira, para a tela levar ele ao card. */
  aoMandar?: (filaId: string) => void
}) {
  const router = useRouter()
  const [motivo, setMotivo] = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [escopo, setEscopo] = useState<'completa' | 'parcial'>('completa')
  const [modo, setModo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [outraFila, setOutraFila] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const somar = (novos: FileList | null) => {
    if (!novos) return
    setArquivos(a => {
      const jaTem = new Set(a.map(x => x.name + x.size))
      return [...a, ...Array.from(novos).filter(f => !jaTem.has(f.name + f.size))]
    })
  }
  const juntos = arquivos.reduce((s, f) => s + f.size, 0)
  const faltam = MOTIVO_MINIMO - motivo.trim().length

  const mandar = async () => {
    if (enviando) return
    if (faltam > 0) { setErro('Escreva o motivo da reanálise: é ele que o analista lê como ordem.'); return }
    if (juntos > TETO_JUNTOS) { setErro('Os arquivos juntos passam de 48 MB. Mande em duas vezes.'); return }
    if (!window.confirm(
      `Reanalisar ${nome}?\n\n`
      + `O analista recebe o seu motivo, ${arquivos.length ? `os ${arquivos.length} documento(s) que você subiu` : 'a pasta como está'} e a análise anterior inteira (decisão, pontos de atenção, conclusão, condições e números).\n\n`
      + 'A análise que está valendo continua valendo até a nova ser publicada.',
    )) return

    setEnviando(true); setErro(''); setOutraFila(null)
    const fd = new FormData()
    fd.append('analise_id', analiseId)
    fd.append('motivo', motivo.trim())
    fd.append('escopo', escopo)
    if (modo) fd.append('modo', modo)
    for (const f of arquivos) fd.append('arquivo', f)

    try {
      const r = await fetch('/api/analise/reanalisar', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) {
        /* SESSÃO EXPIRADA NÃO CHEGA COMO 401 AQUI. O gate de login do
           `proxy.ts` pega a chamada antes da rota e a manda para /login; um
           POST de formulário caindo numa página vira 404 sem JSON. Sem esta
           linha, quem passou vinte minutos escrevendo o motivo lia "o pedido
           não foi aceito (HTTP 404)" e não sabia que era só entrar de novo.
           O texto do motivo continua na tela: nada do que ele escreveu se perde. */
        setErro(j.erro ?? (r.status === 404 || r.status === 401
          ? 'Sua sessão expirou. Abra o CRM em outra aba, entre de novo, e clique aqui outra vez: o que você escreveu continua nesta tela.'
          : `O pedido não foi aceito (HTTP ${r.status}).`))
        if (j.fila_id) setOutraFila(j.fila_id)
        setEnviando(false)
        return
      }
      if (j.aviso) alert(j.aviso)
      if (aoMandar) aoMandar(j.fila_id)
      else router.push(`/analises/mesa/${j.fila_id}?aba=analise`)
    } catch {
      setErro('A conexão caiu. Tente de novo.')
      setEnviando(false)
    }
  }

  if (!podeEscrever) {
    return (
      <div style={{ ...texto.apoio, background: cor.papelZebra, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, padding: 12 }}>
        Você tem permissão só de leitura: quem manda reanalisar é um analista.
      </div>
    )
  }

  return (
    <div style={{ background: cor.fundo, border: `1px solid ${cor.borda}`, borderRadius: raio.cartao, padding: 12, maxWidth: '80ch' }}>
      <div style={texto.titulo}>Reanalisar</div>
      <p style={{ ...texto.apoio, marginTop: 4 }}>
        Diga o motivo e, se tiver, suba os documentos novos aqui mesmo. O analista recebe junto a
        <b> análise anterior inteira</b>: a decisão que está valendo, os pontos de atenção que pesaram contra,
        a conclusão, as condições e os números que ela usou. Ele é obrigado a responder ponto a ponto o que
        mudou, e a dizer o motivo da nova decisão.
        {pasta ? <> A pasta <b>{pasta}</b> volta do arquivo sozinha.</> : null}
      </p>

      {/* ── O motivo, que é o coração do pedido ─────────────────────────── */}
      <label style={{ display: 'block', marginTop: 12 }}>
        <span style={texto.rotulo}>Por que reanalisar {faltam > 0 ? <b style={{ color: cor.ouroTexto }}>· obrigatório</b> : null}</span>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={5} maxLength={4000}
          placeholder={'Ex.: novos documentos apresentados para reverter a recusa. A dívida decorre da obra X, que consta na primeira linha da planilha. O processo judicial é diligência do tomador, mitigado por acessos da nossa Subscrição e do Jurídico.'}
          style={{
            width: '100%', marginTop: 4, border: `1px solid ${cor.borda}`, borderRadius: raio.controle,
            padding: '8px 10px', fontSize: 16, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
            color: cor.texto, background: cor.papel,
          }} />
      </label>
      <div style={texto.nota}>
        Escreva como escreveria para uma pessoa: o que mudou, o que já foi mitigado e por quem. Este texto vai
        inteiro para o analista e fica na trilha desta empresa.
      </div>

      {/* ── Os documentos novos ─────────────────────────────────────────── */}
      <div
        onDragOver={e => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={e => { e.preventDefault(); setArrastando(false); somar(e.dataTransfer.files) }}
        onClick={() => entrada.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') entrada.current?.click() }}
        style={{
          border: `1.5px dashed ${arrastando ? cor.bordaAtiva : cor.borda}`, borderRadius: raio.cartao,
          background: arrastando ? cor.destaque : cor.papel, padding: '16px 12px', textAlign: 'center',
          cursor: 'pointer', marginTop: 12, minHeight: 44,
        }}>
        <div style={texto.titulo}>Solte os documentos novos aqui, ou clique para escolher</div>
        <div style={{ ...texto.apoio, marginTop: 3 }}>
          Opcional · PDF, planilha ou imagem · até 50 MB cada, 48 MB juntos ·
          eles entram na pasta da análise e na ficha do tomador
        </div>
        <input ref={entrada} type="file" multiple hidden
          accept=".pdf,.xlsx,.xls,.xlsm,.ods,.csv,.png,.jpg,.jpeg,.txt,.docx"
          onChange={e => { somar(e.target.files); e.target.value = '' }} />
      </div>

      {arquivos.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
          {arquivos.map((f, i) => (
            <li key={f.name + f.size} style={{ ...texto.corpo, display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={texto.nota}>{(f.size / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB</span>
              <button type="button" onClick={e => { e.stopPropagation(); setArquivos(a => a.filter((_, j) => j !== i)) }}
                style={{ background: 'none', border: 'none', color: cor.textoFraco, cursor: 'pointer', fontSize: 12, minHeight: 44, padding: '0 6px' }}>tirar</button>
            </li>
          ))}
        </ul>
      )}

      {/* ── Como rodar ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <label style={{ flex: '1 1 220px' }}>
          <span style={texto.rotulo}>O que refazer</span>
          <select value={escopo} onChange={e => setEscopo(e.target.value as 'completa' | 'parcial')}
            style={{ width: '100%', marginTop: 4, border: `1px solid ${cor.borda}`, borderRadius: raio.controle, padding: '8px 9px', fontSize: 16, background: cor.papel, color: cor.texto, minHeight: 44 }}>
            <option value="completa">A análise completa, do zero (o de sempre)</option>
            <option value="parcial">Só as partes relacionadas ao que mudou</option>
          </select>
        </label>
        <label style={{ flex: '1 1 220px' }}>
          <span style={texto.rotulo}>Como rodar</span>
          <select value={modo} onChange={e => setModo(e.target.value)}
            style={{ width: '100%', marginTop: 4, border: `1px solid ${cor.borda}`, borderRadius: raio.controle, padding: '8px 9px', fontSize: 16, background: cor.papel, color: cor.texto, minHeight: 44 }}>
            <option value="">No modelo forte (o de sempre)</option>
            <option value="rapida">No modelo veloz</option>
          </select>
        </label>
      </div>
      {escopo === 'parcial' && (
        <div style={{ ...texto.nota, marginTop: 4 }}>
          Reaproveita a leitura dos documentos. Score, limite, rating, taxas e conclusão são sempre
          recalculados do zero: documento novo mexe no PL, e o limite é calculado sobre o PL.
        </div>
      )}

      {erro && <div style={{ marginTop: 10 }}><Aviso tom="erro">{erro}</Aviso></div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={mandar} disabled={enviando || faltam > 0}
          style={{ ...botaoCheio, minHeight: 44, padding: '10px 16px', opacity: enviando || faltam > 0 ? 0.55 : 1 }}>
          {enviando ? 'Mandando…' : 'Mandar reanalisar'}
        </button>
        {outraFila && (
          <button type="button" style={{ ...botaoVazado, minHeight: 44 }} onClick={() => router.push(`/analises/mesa/${outraFila}?aba=analise`)}>
            Abrir o card dessa pasta
          </button>
        )}
        <span style={texto.nota}>
          {faltam > 0 ? `Faltam ${faltam} caracteres no motivo.` : 'Quem executa é o notebook do analista.'}
        </span>
      </div>
    </div>
  )
}
