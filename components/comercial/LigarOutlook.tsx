'use client'

/* LIGAR O OUTLOOK, TUDO DENTRO DO CRM  ·  23/09/2026
   ═══════════════════════════════════════════════════════════════════════════

   Ordem dele: "não sou o admin dessa conta de e-mails... isso tem que ser
   feito para todos os usuários, vão acessar somente o CRM e pronto. Se tiver
   que clicar em algum botão de ligar o Outlook, tudo bem, mas tem que ficar
   dentro do CRM também".

   Então são dois botões, e os dois moram aqui:

     "Ligar o Outlook no CRM"        uma vez, só para o dono do CRM. Registra o
                                     aplicativo no Microsoft 365 da FAM.
     "Ligar minha caixa do Outlook"  cada pessoa, uma vez, no navegador dela.

   O PRIMEIRO PEDE UM CÓDIGO, e não tem como ser diferente: quem faz o login é
   o SERVIDOR do CRM, que não tem navegador. A Microsoft resolve isso com o
   código de seis letras — a tela mostra, a pessoa digita na página da
   Microsoft, e o servidor confere sozinho de cinco em cinco segundos.

   O SEGUNDO é um link comum: aí quem loga é a pessoa, no navegador dela.

   QUEM VÊ O QUÊ: quem não é dono do CRM nunca vê o primeiro botão — vê o
   estado ("ainda não foi ligado") e o caminho que funciona hoje. */

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { cor, texto, raio, botaoCheio } from '@/lib/ui/painel'
import { fmtData } from '@/lib/utils'

interface Estado {
  ligado: boolean
  por: string | null
  em: string | null
  consentido: boolean
  posso: boolean
  permissoes: string[]
  esperando: { user_code: string; verificacao: string; expira_em: string } | null
}

interface Conexao {
  possivel: boolean
  conectado: boolean
  conta: string | null
  /** O link que o administrador do Microsoft 365 abre para aprovar, uma vez. */
  aprovacao?: string
}

export default function LigarOutlook({ aoMudar }: { aoMudar?: () => void }) {
  const caminho = usePathname()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [conexao, setConexao] = useState<Conexao | null>(null)
  const [codigo, setCodigo] = useState<{ codigo: string; onde: string; intervalo: number } | null>(null)
  const [trabalhando, setTrabalhando] = useState(false)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState('')
  const [copiou, setCopiou] = useState(false)

  const ler = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([fetch('/api/ms/registrar'), fetch('/api/ms/conexao')])
      if (r1.ok) setEstado(await r1.json())
      if (r2.ok) setConexao(await r2.json())
    } catch { /* a tela mostra o que tem */ }
  }, [])

  useEffect(() => { const t = setTimeout(ler, 0); return () => clearTimeout(t) }, [ler])

  /* ENQUANTO O CÓDIGO ESTÁ NA TELA, a página pergunta ao servidor se a pessoa
     já terminou. É o servidor que fala com a Microsoft: daqui só sai "e aí?". */
  useEffect(() => {
    if (!codigo) return
    let vivo = true
    const bater = async () => {
      try {
        const r = await fetch('/api/ms/registrar', { method: 'PUT' })
        const j = await r.json()
        if (!vivo) return
        if (j.estado === 'pronto') {
          setCodigo(null)
          setPronto(j.consentido
            ? 'Pronto: o CRM está ligado ao Microsoft 365, e a equipe inteira já pode ligar a própria caixa sem ver tela de permissão.'
            : 'Pronto: o CRM está ligado ao Microsoft 365. Cada pessoa autoriza a própria caixa no primeiro arrasto.')
          ler()
          aoMudar?.()
          return
        }
        if (j.estado === 'erro') { setCodigo(null); setErro(j.erro ?? 'Não consegui ligar.'); return }
      } catch { /* tenta de novo no próximo tique */ }
    }
    const t = setInterval(bater, Math.max(3, codigo.intervalo) * 1000)
    return () => { vivo = false; clearInterval(t) }
  }, [codigo, ler, aoMudar])

  async function comecar() {
    setErro(''); setPronto(''); setTrabalhando(true)
    try {
      const r = await fetch('/api/ms/registrar', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) setErro(j.erro ?? 'Não consegui começar.')
      else {
        setCodigo({ codigo: j.codigo, onde: j.onde, intervalo: j.intervalo ?? 5 })
        // Abre a página da Microsoft numa aba nova, já com o código copiado.
        try { await navigator.clipboard?.writeText(j.codigo) } catch { /* sem área de transferência */ }
        window.open(j.onde, '_blank', 'noopener')
      }
    } catch { setErro('A conexão caiu. Tente de novo.') }
    setTrabalhando(false)
  }

  if (!estado) return null

  const caixaLigada = conexao?.conectado

  return (
    <div style={{
      background: estado.ligado ? cor.papel : '#fdf8e6',
      border: `1px solid ${estado.ligado ? cor.borda : '#eddda8'}`,
      borderRadius: raio.cartao, padding: '12px 14px', marginBottom: 12,
      fontSize: 12.5, lineHeight: 1.6, color: estado.ligado ? cor.texto : cor.ouroTexto,
    }}>
      {/* ── 1. o CRM está ligado ao Microsoft 365? ── */}
      {!estado.ligado ? (
        <>
          <b style={{ color: estado.ligado ? cor.tinta : '#5c460a' }}>
            Arrastar o e-mail do Novo Outlook ainda não está ligado.
          </b>
          <div style={{ marginTop: 6 }}>
            O Novo Outlook não entrega o arquivo do e-mail para o navegador — entrega só o
            endereço dele. Ligando o CRM ao Microsoft 365, ele busca o e-mail inteiro sozinho,
            com anexos. {estado.posso
              ? 'É um botão, uma vez, e vale para a equipe toda.'
              : 'Quem liga é o dono do CRM. Enquanto isso, salve o e-mail e solte o arquivo aqui — o caso abre igual.'}
          </div>

          {estado.posso && !codigo && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={comecar} disabled={trabalhando} style={{ ...botaoCheio, opacity: trabalhando ? .6 : 1 }}>
                {trabalhando ? 'Começando…' : 'Ligar o Outlook no CRM'}
              </button>
              <span style={{ ...texto.nota, flex: 1, minWidth: 220 }}>
                Vai pedir um login da Microsoft com a conta <b>@famseguradora.com.br</b>.
                Permissões: {estado.permissoes.join(', ')} — ler o e-mail de quem autorizar, e nada mais.
              </span>
            </div>
          )}

          {/* ── o código, enquanto a Microsoft espera ── */}
          {codigo && (
            <div style={{
              marginTop: 10, background: cor.papel, border: `1px solid ${cor.borda}`,
              borderRadius: raio.controle, padding: '12px 14px', color: cor.texto,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: cor.tinta }}>
                Abri a página da Microsoft numa aba nova. Cole este código lá:
              </div>
              <div style={{
                margin: '10px 0', fontSize: 30, fontWeight: 800, letterSpacing: 2,
                color: cor.acao, fontVariantNumeric: 'tabular-nums',
              }}>
                {codigo.codigo}
              </div>
              <div style={texto.apoio}>
                (já copiei para a área de transferência) · Depois entre com a conta{' '}
                <b>@famseguradora.com.br</b> — se aparecer a sua conta pessoal, escolha
                &quot;Usar outra conta&quot;.
              </div>
              <div style={{ ...texto.nota, marginTop: 8 }}>
                Esperando você terminar… esta tela se atualiza sozinha.{' '}
                <a href={codigo.onde} target="_blank" rel="noopener noreferrer" style={{ color: cor.acao }}>
                  abrir a página de novo
                </a>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* ── 2. ligado: agora é a caixa de cada um ── */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ color: cor.tinta }}>
              {caixaLigada ? 'Arrastar do Outlook está ligado.' : 'Falta ligar a sua caixa do Outlook.'}
            </b>
            <span style={texto.nota}>
              CRM ligado ao Microsoft 365{estado.por ? ` por ${estado.por}` : ''}
              {estado.em ? ` em ${fmtData(estado.em)}` : ''}
            </span>
          </div>

          {caixaLigada ? (
            <div style={{ marginTop: 6 }}>
              Sua caixa <b>{conexao?.conta}</b> está ligada: arraste o e-mail do Outlook aqui em
              cima e o caso abre sozinho, com os anexos.
              <div style={{ ...texto.nota, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Desligar a sua caixa do CRM? O arrastar do Novo Outlook para de funcionar para você.')) return
                    await fetch('/api/ms/conexao', { method: 'DELETE' })
                    ler()
                  }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline', color: cor.textoFraco }}
                >
                  desligar minha caixa
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <a href={`/api/ms/login?depois=${encodeURIComponent(caminho)}`} style={{ ...botaoCheio, textDecoration: 'none', display: 'inline-block' }}>
                Ligar minha caixa do Outlook
              </a>
              {/* SE A MICROSOFT PEDIR APROVAÇÃO DO ADMINISTRADOR, o caminho é
                  este link — a tela dela não manda e-mail para ninguém, só
                  avisa quem clicou. Fica aqui para o pedido ser "abre e
                  aceita", e não "entra no portal e procura". */}
              {conexao?.aprovacao && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(conexao.aprovacao!).then(() => setCopiou(true), () => setCopiou(false))
                  }}
                  style={{ ...botaoCheio, background: cor.papel, color: cor.texto, border: `1px solid ${cor.borda}` }}
                  title="A Microsoft pediu aprovação do administrador? Copie e mande para quem administra o Microsoft 365 da FAM."
                >
                  {copiou ? 'link copiado' : 'copiar link para o administrador'}
                </button>
              )}
              <span style={{ ...texto.nota, flex: 1, minWidth: 220 }}>
                Um clique, uma vez. O CRM passa a ler <b>só a sua caixa</b>, e só para abrir o caso
                do e-mail que você arrastar. Se a Microsoft disser que precisa de <b>aprovação do
                administrador</b>, copie o link ao lado e mande para quem administra o Microsoft 365:
                ele abre, aceita, e vale para todos.
              </span>
            </div>
          )}
        </>
      )}

      {erro && <div className="alert-error" style={{ marginTop: 10 }}>{erro}</div>}
      {pronto && <div className="alert-success" style={{ marginTop: 10 }}>{pronto}</div>}
    </div>
  )
}
