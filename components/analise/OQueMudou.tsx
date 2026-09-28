'use client'

// ============================================================================
//  O QUE MUDOU DESDE A ANÁLISE ANTERIOR  ·  24/09/2026
//
//  "Se eu quiser um comparativo de análises, ao fazer a análise, apresentar a
//  diferença das análises e o motivo da nova decisão."
//
//  A seção aparece SOZINHA em toda análise que tem uma versão anterior do
//  mesmo CNPJ, e não só nas que forem reanalisadas daqui para a frente: as
//  contas saem de `lib/analise/comparativo.ts`, que lê as duas linhas do
//  banco. Medido em 24/09/2026, 18 empresas já ganham a seção sem refazer
//  nada, a NC Empreendimentos entre elas (Bloqueio em 04/09, Aprovar em 24/09).
//
//  A LEITURA VAI DA DECISÃO PARA O FUNDAMENTO, como o relatório dele: primeiro
//  a virada, depois os números, depois o texto e os pontos. O motivo do pedido
//  (o que ELE escreveu ao mandar reanalisar) abre a seção quando existe, porque
//  é contra ele que a nova decisão se lê.
//
//  Verde é melhorou, vermelho é piorou, cinza é mudou sem lado melhor (porte,
//  base das DFs). O vermelho aqui é a exceção que a regra 3 do design permite:
//  piora em análise de crédito É decisão a tomar.
// ============================================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cor, raio, texto } from '@/lib/ui/painel'
import { Moldura, Aviso } from '@/components/painel/Painel'
import {
  COLUNAS_COMPARATIVO, anteriorDe, compararAnalises,
  type LinhaComparavel, type Comparativo, type Sentido, type Mudanca,
} from '@/lib/analise/comparativo'

/** O pedido que originou a reanálise, quando houve um. */
interface PedidoReanalise {
  id: string
  motivo: string
  documentos: { nome: string }[] | null
  criado_por_nome: string | null
  criado_em: string
  escopo: string
}

const COR_SENTIDO: Record<Sentido, string> = {
  melhorou: cor.areaOperacao,
  piorou: cor.alerta,
  mudou: cor.textoSub,
}

const SETA: Record<Sentido, string> = { melhorou: '▲', piorou: '▼', mudou: '→' }

const dataBr = (v: string | null | undefined) => {
  const t = String(v ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t || 'sem data'
  const [a, m, d] = t.split('-')
  return `${d}/${m}/${a}`
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Texto longo aparece cortado, com o inteiro a um clique. Conclusão de
 *  análise tem parágrafos: abrir tudo empurraria o resto da tela para baixo. */
function TextoComparado({ m }: { m: Mudanca }) {
  const [aberto, setAberto] = useState(false)
  const sobreviveu = m.semelhanca === undefined ? null : Math.round(m.semelhanca * 100)
  const corta = (s: string) => s.length > 260 && !aberto ? s.slice(0, 257) + '…' : s

  return (
    <div style={{ borderTop: `1px solid ${cor.bordaSuave}`, padding: '10px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ ...texto.titulo, fontSize: 12.5 }}>{m.rotulo}</span>
        {sobreviveu !== null && (
          <span style={texto.nota}>
            {sobreviveu >= 90 ? 'ajuste de redação' : sobreviveu >= 40 ? 'reescrita em parte' : 'reescrita por inteiro'}
            {' · '}{sobreviveu}% do texto anterior sobreviveu
          </span>
        )}
        {/* Alvo de 44px: ele lê isto no celular, e o botão que abre a
            conclusão inteira é o único controle deste bloco. */}
        <button type="button" onClick={() => setAberto(v => !v)}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: cor.acaoClara, cursor: 'pointer', fontSize: 12, minHeight: 44, padding: '0 8px' }}>
          {aberto ? 'recolher' : 'ver inteiro'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginTop: 6 }}>
        <div>
          <div style={texto.rotulo}>Antes</div>
          <div style={{ ...texto.corpo, color: cor.textoSub }}>{corta(m.antes)}</div>
        </div>
        <div>
          <div style={texto.rotulo}>Agora</div>
          <div style={texto.corpo}>{corta(m.depois)}</div>
        </div>
      </div>
    </div>
  )
}

function LinhaMudanca({ m }: { m: Mudanca }) {
  const c = COR_SENTIDO[m.sentido]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(120px, 1.1fr) minmax(90px, 1fr) 22px minmax(90px, 1fr)',
      gap: 8, alignItems: 'baseline', padding: '7px 0', borderTop: `1px solid ${cor.bordaSuave}`,
    }}>
      <span style={{ ...texto.corpo, color: cor.textoSub }}>{m.rotulo}</span>
      <span style={{ ...texto.corpo, color: cor.textoSub, textDecoration: m.peso === 'decisao' ? 'none' : 'none' }}>{m.antes}</span>
      <span style={{ color: c, fontSize: 12, textAlign: 'center' }} aria-hidden>{SETA[m.sentido]}</span>
      <span style={{ ...texto.corpo, color: c, fontWeight: 700 }}>{m.depois}</span>
    </div>
  )
}

export default function OQueMudou({ analiseId, cnpj }: { analiseId: string; cnpj: string | null }) {
  const [comp, setComp] = useState<Comparativo | null>(null)
  const [pedido, setPedido] = useState<PedidoReanalise | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    const digitos = String(cnpj ?? '').replace(/\D/g, '')

    ;(async () => {
      /* SEM CNPJ NÃO HÁ SÉRIE. Cinco das análises do acervo não têm CNPJ
         apurado, e para elas não existe "a anterior do mesmo CNPJ": a seção
         simplesmente não aparece. A saída fica DENTRO do async de propósito,
         para o `setCarregando` nunca ser chamado no corpo do efeito. */
      if (digitos.length !== 14) { if (vivo) setCarregando(false); return }
      const supabase = createClient()
      const { data } = await supabase
        .from('analises').select(COLUNAS_COMPARATIVO)
        .eq('cnpj', digitos)
        .order('data_analise', { ascending: false })
        .limit(12)
      if (!vivo) return
      const todas = (data ?? []) as unknown as LinhaComparavel[]
      const atual = todas.find(l => l.id === analiseId)
      const ant = atual ? anteriorDe(todas, analiseId) : null
      setComp(atual && ant ? compararAnalises(ant, atual) : null)

      /* O pedido que gerou esta análise: casado pela análise que era a base.
         Sem `analise_nova_id` preenchido, o mais recente sobre a base é o que
         a originou, e é o que se quer mostrar. */
      if (ant) {
        const { data: p } = await supabase
          .from('analise_reanalises')
          .select('id, motivo, documentos, criado_por_nome, criado_em, escopo')
          .or(`analise_nova_id.eq.${analiseId},analise_base_id.eq.${ant.id}`)
          .order('criado_em', { ascending: false })
          .limit(1)
        if (vivo && p?.[0]) setPedido(p[0] as unknown as PedidoReanalise)
      }
      setCarregando(false)
    })().catch(() => { if (vivo) setCarregando(false) })

    return () => { vivo = false }
  }, [analiseId, cnpj])

  if (carregando || !comp) return null

  const { anterior, atual, dias, viradaDaDecisao, mudancas, listas, iguais } = comp
  const daDecisao = mudancas.filter(m => m.peso === 'decisao')
  const numeros = mudancas.filter(m => m.peso === 'numero')
  const textos = mudancas.filter(m => m.peso === 'texto')

  return (
    <Moldura
      titulo="O que mudou desde a análise anterior"
      origem={`comparando a análise de ${dataBr(atual.data_analise)} com a de ${dataBr(anterior.data_analise)}${dias !== null ? ` · ${dias} dia${dias === 1 ? '' : 's'} entre as duas` : ''}`}
    >
      {/* ── A virada, quando houve ─────────────────────────────────────── */}
      {viradaDaDecisao ? (
        <div style={{
          background: viradaDaDecisao.sentido === 'piorou' ? cor.alertaFundo : cor.destaque,
          border: `1px solid ${viradaDaDecisao.sentido === 'piorou' ? cor.alertaBorda : cor.borda}`,
          borderLeft: `3px solid ${COR_SENTIDO[viradaDaDecisao.sentido]}`,
          borderRadius: raio.cartao, padding: '10px 12px', marginBottom: 12,
        }}>
          <div style={texto.rotulo}>A decisão mudou</div>
          <div style={{ ...texto.numero, fontSize: 16, marginTop: 3 }}>
            <span style={{ color: cor.textoSub, fontWeight: 600 }}>{viradaDaDecisao.antes}</span>
            <span style={{ color: COR_SENTIDO[viradaDaDecisao.sentido], margin: '0 8px' }}>{SETA[viradaDaDecisao.sentido]}</span>
            <span style={{ color: COR_SENTIDO[viradaDaDecisao.sentido] }}>{viradaDaDecisao.depois}</span>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <Aviso tom="calmo">
            A decisão continua a mesma ({atual.recomendacao || 'sem decisão escrita'}). O que mudou está abaixo.
          </Aviso>
        </div>
      )}

      {/* ── Por que ele pediu ──────────────────────────────────────────── */}
      {pedido && (
        <div style={{
          background: cor.papelZebra, border: `1px solid ${cor.borda}`,
          borderRadius: raio.cartao, padding: '10px 12px', marginBottom: 12,
        }}>
          <div style={texto.rotulo}>
            Por que a reanálise foi pedida
            {pedido.criado_por_nome ? ` · ${pedido.criado_por_nome}` : ''}
            {` · ${quando(pedido.criado_em)}`}
          </div>
          <div style={{ ...texto.corpo, marginTop: 4, whiteSpace: 'pre-wrap' }}>{pedido.motivo}</div>
          {!!pedido.documentos?.length && (
            <div style={{ ...texto.nota, marginTop: 6 }}>
              Documentos apresentados: {pedido.documentos.map(d => d.nome).join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* ── Decisão, limite, risco ─────────────────────────────────────── */}
      {daDecisao.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...texto.rotulo, marginBottom: 2 }}>A decisão</div>
          {daDecisao.map(m => <LinhaMudanca key={m.campo} m={m} />)}
        </div>
      )}

      {/* ── Os números da metodologia ──────────────────────────────────── */}
      {numeros.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...texto.rotulo, marginBottom: 2 }}>Os números</div>
          {numeros.map(m => <LinhaMudanca key={m.campo} m={m} />)}
        </div>
      )}

      {/* ── Pontos que entraram e saíram ───────────────────────────────── */}
      {listas.map(l => (
        <div key={l.rotulo} style={{ marginBottom: 12 }}>
          <div style={{ ...texto.rotulo, marginBottom: 4 }}>
            {l.rotulo} · {l.mantidos} mantido{l.mantidos === 1 ? '' : 's'}
          </div>
          {l.sairam.map((p, i) => (
            <div key={`fora-${i}`} style={{ display: 'flex', gap: 7, padding: '4px 0', alignItems: 'baseline' }}>
              <span style={{ color: cor.areaOperacao, fontSize: 11, flexShrink: 0 }} aria-hidden>saiu</span>
              <span style={{ ...texto.corpo, color: cor.textoSub, textDecoration: 'line-through' }}>{p}</span>
            </div>
          ))}
          {l.entraram.map((p, i) => (
            <div key={`entrou-${i}`} style={{ display: 'flex', gap: 7, padding: '4px 0', alignItems: 'baseline' }}>
              <span style={{ color: cor.ouroTexto, fontSize: 11, flexShrink: 0 }} aria-hidden>novo</span>
              <span style={texto.corpo}>{p}</span>
            </div>
          ))}
        </div>
      ))}

      {/* ── Conclusão e condições ──────────────────────────────────────── */}
      {textos.map(m => (m.semelhanca === undefined ? <LinhaMudanca key={m.campo} m={m} /> : <TextoComparado key={m.campo} m={m} />))}

      <div style={{ ...texto.nota, marginTop: 10, borderTop: `1px solid ${cor.bordaSuave}`, paddingTop: 8 }}>
        {iguais} campo{iguais === 1 ? '' : 's'} não mudaram. A comparação é feita pelo CRM sobre as duas
        análises gravadas, campo a campo, e não depende do texto do relatório.
        {anterior.revisada ? ' A análise anterior tinha sido revisada e editada no CRM: a comparação usa o que ficou valendo.' : ''}
      </div>
    </Moldura>
  )
}
