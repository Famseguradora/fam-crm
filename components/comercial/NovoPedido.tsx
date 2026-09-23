'use client'

/* AS DUAS PORTAS DE ENTRADA DE UM PEDIDO, numa peça só  ·  23/09/2026
   ═══════════════════════════════════════════════════════════════════════════

   Pedido dele: "quero expandir isso para os outros usuários (Abenaias,
   Isabela, Ivan e Marco Dragone), porque aí eu ganho tempo até conseguir ter o
   e-mail dentro do sistema".

   As duas portas que sobem um pedido à mão:

     o e-mail salvo   arrasta o .msg (direto do Outlook) ou o .eml
     o CNPJ           o pedido veio por telefone, WhatsApp ou reunião

   POR QUE UMA PEÇA, E NÃO UM BLOCO EM CADA TELA: a tela de Entrada do
   Comercial e o "+ Novo card" da Mesa fazem a MESMA coisa, e se o texto e o
   comportamento fossem escritos duas vezes, no terceiro mês um dos dois
   estaria explicando ao usuário uma regra que o outro não cumpre. O mesmo
   motivo de `lib/casos/abrir-por-email.ts` existir: duas estradas, uma regra.

   O CARD NASCE NA MESA pelas duas portas. Pelo e-mail isso já acontecia
   (`abrirCasoPorEmail` chama `abrirNaFila`); pelo CNPJ passou a acontecer hoje,
   com a bandeira `na_esteira` em /api/casos/novo — antes o caso existia e o
   card não aparecia no quadro, e quem abriu ficava sem ver o próprio pedido.

   NADA AQUI LÊ CAIXA DE E-MAIL. É de propósito: quem usa esta peça não tem o
   Outlook configurado na máquina, e a Caixa do CRM mostra a caixa da FAM. */

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cor, texto, raio, botaoCheio, botaoVazado } from '@/lib/ui/painel'
import { maskCNPJ, validarCNPJ } from '@/lib/utils'
import { lerArrastoDoOutlook, nomeDoArrastado, FORMATO_ARRASTO } from '@/lib/email/arrasto-outlook'
import { usePermissoes } from '@/lib/context/permissoes-context'

/** O que voltou de cada e-mail que subiu. Um por arquivo: soltar cinco e ver
 *  o recibo de um só (o que a tela antiga fazia) esconde o que deu errado nos
 *  outros quatro. */
export interface ReciboPedido {
  chave: string
  arquivo: string
  id: string
  numero: number
  assunto: string
  documentos: number
  ignorados: number
  falhas: string[]
  ja_existia: boolean
}

export default function NovoPedido({
  aoAbrir,
  portas = 'as duas',
  aoFechar,
}: {
  /** Chamado depois de cada pedido aberto, para a tela recarregar a lista. */
  aoAbrir?: () => void | Promise<void>
  /** A Mesa usa só a porta do CNPJ: lá o e-mail não faz sentido, o quadro é da análise. */
  portas?: 'as duas' | 'só cnpj'
  /** Quando a peça está dentro de uma janelinha (o "+ Novo card" da Mesa). */
  aoFechar?: () => void
}) {
  const router = useRouter()
  const { proprietario } = usePermissoes()
  const entrada = useRef<HTMLInputElement>(null)
  const [sobre, setSobre] = useState(false)
  const [enviando, setEnviando] = useState('')
  const [erro, setErro] = useState('')
  const [recibos, setRecibos] = useState<ReciboPedido[]>([])
  const [cnpj, setCnpj] = useState('')
  const [criando, setCriando] = useState(false)
  /** Os formatos que o drop trouxe quando não veio arquivo nenhum, com o que
   *  havia dentro de cada um. */
  const [diagnostico, setDiagnostico] = useState<{ tipo: string; valor: string }[] | null>(null)
  const [copiou, setCopiou] = useState(false)
  /** Quando o e-mail arrastado só pode ser buscado depois de ligar a caixa. */
  const [precisaLigar, setPrecisaLigar] = useState('')
  /** O CRM ainda não foi ligado ao Microsoft 365 (falta a configuração). */
  const [semConfig, setSemConfig] = useState(false)
  /** O recado da volta do login da Microsoft (?ms=conectado|erro|…). */
  const [recadoMS, setRecadoMS] = useState<{ tom: 'ok' | 'erro'; txt: string } | null>(null)
  const caminho = usePathname()
  const busca = useSearchParams()

  /* A VOLTA DO LOGIN DA MICROSOFT. Ela cai na mesma tela, com `?ms=...`: a
     pessoa precisa ver que deu certo (ou o que faltou) e continuar de onde
     parou — arrastando o e-mail de novo, agora com a caixa ligada. */
  useEffect(() => {
    const r = busca.get('ms')
    if (!r) return
    const detalhe = busca.get('detalhe') ?? ''
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecadoMS(
      r === 'conectado'
        ? { tom: 'ok', txt: `Caixa ${detalhe || 'do Outlook'} ligada ao CRM. Arraste o e-mail de novo: agora eu busco sozinho.` }
        : r === 'falta-config'
          ? { tom: 'erro', txt: `A busca no Outlook ainda não foi configurada no servidor (falta ${detalhe || 'a configuração'}).` }
          : r === 'recusado'
            ? { tom: 'erro', txt: `A Microsoft não autorizou: ${detalhe || 'permissão recusada'}.` }
            : { tom: 'erro', txt: detalhe || 'Não consegui ligar a caixa. Tente de novo.' },
    )
    // O recado fica na tela, mas some da barra de endereço: recarregar a página
    // não pode reanunciar uma conexão feita ontem.
    window.history.replaceState(null, '', caminho)
  }, [busca, caminho])

  /* O QUE CAIU NA ÁREA, procurado nos DOIS lugares (23/09/2026).

     `dataTransfer.files` é a lista normal, e é o que quase todo site usa. Mas
     o e-mail arrastado do Outlook não é um arquivo do disco: é um item
     virtual (ele mora no Exchange), e o Chromium monta o arquivo só quando
     alguém o pede — o que acontece em `items[i].getAsFile()`. Dependendo da
     versão do Chrome e do formato que o Outlook oferece, `files` chega vazia
     enquanto `items` tem o e-mail ali, esperando ser pedido.

     Olhar só a primeira lista era desistir de um e-mail que estava na mão. */
  const arquivosDoDrop = (dt: DataTransfer): File[] => {
    if (dt.files?.length) return Array.from(dt.files)
    const pedidos: File[] = []
    for (const item of Array.from(dt.items ?? [])) {
      if (item.kind !== 'file') continue
      const f = item.getAsFile()
      if (f) pedidos.push(f)
    }
    return pedidos
  }

  /* QUEM DECIDE SE É E-MAIL É O SERVIDOR, olhando o CONTEÚDO (23/09/2026).
     Aqui só barramos o que é claramente outra coisa — um PDF, uma planilha,
     uma foto —, porque soltar uma pasta do Windows mandaria dez arquivos para
     a rota um a um e a pessoa leria dez erros iguais.

     O e-mail ARRASTADO DIRETO DO OUTLOOK costuma chegar sem extensão: o
     navegador o monta na hora, a partir de um item que mora no Exchange e não
     no disco. Filtrar por ".msg" aqui recusava justamente o arrastar que ele
     pediu. Sem extensão, passa: o servidor confere a assinatura do arquivo. */
  const NAO_EH_EMAIL = /\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|bmp|zip|rar|7z|csv|txt|html?|mp4|mp3)$/i

  async function subir(arquivos: FileList | File[]) {
    setErro('')
    const lista = Array.from(arquivos)
    const emails = lista.filter((a) => !NAO_EH_EMAIL.test(a.name))
    const fora = lista.filter((a) => NAO_EH_EMAIL.test(a.name))
    if (fora.length) {
      setErro(`${fora.length === 1 ? `"${fora[0].name}" não é` : `${fora.length} arquivos não são`} e-mail. ${
        emails.length ? 'O que era e-mail no lote seguiu.' : 'Arraste o e-mail em si, e não os anexos dele.'
      }`)
    }

    for (const arquivo of emails) {
      setEnviando(arquivo.name)
      const corpo = new FormData()
      corpo.append('email', arquivo)
      try {
        const r = await fetch('/api/casos', { method: 'POST', body: corpo })
        const json = await r.json()
        if (!r.ok) {
          setErro(`${arquivo.name}: ${json.erro ?? 'não consegui abrir o caso.'}`)
          break
        }
        setRecibos((antes) => [{
          chave: `${arquivo.name}-${Date.now()}-${antes.length}`,
          arquivo: arquivo.name,
          id: json.caso?.id ?? '',
          numero: json.caso?.numero ?? 0,
          assunto: json.caso?.assunto ?? arquivo.name,
          documentos: json.documentos ?? 0,
          ignorados: json.ignorados ?? 0,
          falhas: json.falhas ?? [],
          ja_existia: !!json.ja_existia,
        }, ...antes])
      } catch {
        setErro('A conexão caiu no meio do envio. Tente de novo.')
        break
      }
    }
    setEnviando('')
    await aoAbrir?.()
  }

  /* ── O ARRASTO DO NOVO OUTLOOK ──────────────────────────────────────────
     O servidor busca o e-mail no Microsoft 365 e devolve o mesmo recibo do
     upload: um por e-mail arrastado, com o número do caso. Quando a caixa
     ainda não está ligada (428), a tela não mostra erro: mostra o convite de
     ligar, que é um clique e acontece uma vez só. */
  async function buscarNoOutlook(bilhete: string) {
    const alvos = lerArrastoDoOutlook(bilhete)
    if (!alvos.length) return
    setErro(''); setDiagnostico(null)
    setEnviando(alvos.length === 1 ? nomeDoArrastado(alvos[0]) : `${alvos.length} e-mails`)
    try {
      const r = await fetch('/api/casos/do-outlook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ arrasto: bilhete }),
      })
      const j = await r.json()
      if (r.status === 428 || j.conectar) {
        setPrecisaLigar(j.erro ?? 'Ligue sua caixa do Outlook ao CRM.')
        setEnviando('')
        return
      }
      /* AINDA NÃO FOI LIGADO NO MICROSOFT 365. A mensagem crua ("falta
         MS_TENANT_ID") serve para quem vai resolver, e é ruído para quem só
         queria abrir um caso. Então a tela separa os dois: para o dono do CRM,
         o que fazer; para a equipe, o caminho que funciona hoje. */
      if (r.status === 503 || j.falta) { setSemConfig(true); setEnviando(''); return }
      if (!r.ok) { setErro(j.erro ?? 'Não consegui buscar o e-mail no Outlook.'); setEnviando(''); return }

      const vindos = Array.isArray(j.recibos) ? j.recibos : []
      setRecibos((antes) => [
        ...vindos.map((v: Record<string, unknown>, i: number) => ({
          chave: `ms-${Date.now()}-${i}`,
          arquivo: '',
          id: (v.caso as { id?: string } | undefined)?.id ?? '',
          numero: (v.caso as { numero?: number } | undefined)?.numero ?? 0,
          assunto: String(v.assunto ?? 'e-mail do Outlook'),
          documentos: Number(v.documentos ?? 0),
          ignorados: Number(v.ignorados ?? 0),
          falhas: (Array.isArray(v.falhas) ? v.falhas as string[] : []).concat(v.ok ? [] : [String(v.erro ?? 'não deu certo')]),
          ja_existia: !!v.ja_existia,
        })),
        ...antes,
      ])
      await aoAbrir?.()
    } catch {
      setErro('A conexão caiu enquanto eu buscava o e-mail no Outlook.')
    }
    setEnviando('')
  }

  async function abrirPorCnpj() {
    const digitos = cnpj.replace(/\D/g, '')
    if (!validarCNPJ(digitos)) { setErro('CNPJ inválido: confira os dígitos.'); return }
    setCriando(true); setErro('')
    try {
      const r = await fetch('/api/casos/novo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // A bandeira que faz o card aparecer na coluna Entrada da Mesa.
        body: JSON.stringify({ cnpj: digitos, na_esteira: true }),
      })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui abrir o pedido.'); setCriando(false); return }
      await aoAbrir?.()

      /* O AVISO NÃO PODE SUMIR NA TROCA DE TELA (23/09/2026, achado da
         revisão). A rota devolve `aviso` quando o caso nasceu mas alguma parte
         dele não (o checklist, ou a linha da esteira que faz o card aparecer
         na Mesa). Redirecionar por cima disso levaria a pessoa para a Triagem
         achando que está tudo certo, e o card prometido simplesmente não
         estaria no quadro. Então aqui o aviso vira recibo, com o link, e quem
         subiu decide quando sair desta tela. */
      if (j.aviso) {
        setRecibos((antes) => [{
          chave: `cnpj-${Date.now()}-${antes.length}`,
          arquivo: '',
          id: j.caso?.id ?? '',
          numero: j.caso?.numero ?? 0,
          assunto: `CNPJ ${maskCNPJ(digitos)}`,
          documentos: 0,
          ignorados: 0,
          falhas: [String(j.aviso)],
          ja_existia: !!j.ja_existia,
        }, ...antes])
        setCnpj('')
        setCriando(false)
        return
      }

      /* O CNPJ leva direto à Triagem: é lá que a pessoa vai dizer o que o
         pedido é, já que não veio e-mail nenhum com os documentos. */
      router.push(`/comercial/${j.caso.id}`)
    } catch {
      setErro('A conexão caiu. Tente de novo.')
      setCriando(false)
    }
  }

  return (
    <div>
      {portas === 'as duas' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setSobre(true) }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => {
            e.preventDefault()
            setSobre(false)
            const caiu = arquivosDoDrop(e.dataTransfer)
            if (caiu.length) { subir(caiu); return }
            /* SOLTOU E NÃO VEIO ARQUIVO. Acontece de verdade, e não é defeito do
               CRM: o Outlook entrega o e-mail como "arquivo virtual" (ele mora
               no Exchange, não no disco). O Outlook clássico e o Chrome se
               entendem nesse formato desde 2019; o NOVO Outlook não entrega
               nada para o navegador — é limitação conhecida da Microsoft.

               Em vez de o nada acontecer (o que parecia o CRM estar quebrado),
               a tela diz o que chegou e o que fazer. */
            /* O QUE VEIO NO LUGAR DO ARQUIVO, com conteúdo e tudo. O Novo
               Outlook manda formatos internos dele (`multimaillistconversationrows`),
               que ninguém documentou: só olhando o que tem dentro dá para
               saber se ali existe um identificador da mensagem — e, se
               existir, o CRM pode ir buscar o e-mail pelo Graph em vez de
               pedir o arquivo. Isto NÃO sai do navegador: fica na tela. */
            /* O NOVO OUTLOOK NÃO MANDA O ARQUIVO, MANDA O ENDEREÇO. O bilhete
               dele (`multimaillistconversationrows`) traz o identificador da
               mensagem e a caixa. Com a caixa da pessoa ligada ao CRM, o
               servidor busca o e-mail inteiro no Microsoft 365 — e o arrastar
               vira um passo só, que era o pedido. */
            let bilhete = ''
            try { bilhete = e.dataTransfer.getData(FORMATO_ARRASTO) } catch { /* segue */ }
            if (lerArrastoDoOutlook(bilhete).length) { buscarNoOutlook(bilhete); return }

            const achados = Array.from(e.dataTransfer.types ?? []).map((tipo) => {
              let valor = ''
              try { valor = e.dataTransfer.getData(tipo) } catch { valor = '(não deixou ler)' }
              return { tipo, valor }
            })
            setDiagnostico(achados)
          }}
          onClick={() => entrada.current?.click()}
          style={{
            border: `2px dashed ${sobre ? cor.bordaAtiva : cor.borda}`,
            background: sobre ? cor.destaque : cor.papel,
            borderRadius: raio.cartao, padding: '26px 20px', textAlign: 'center',
            cursor: enviando ? 'progress' : 'pointer',
            transition: 'border-color .15s, background .15s',
          }}
        >
          <input
            ref={entrada} type="file" accept=".msg,.eml" multiple hidden
            onChange={(e) => { if (e.target.files?.length) subir(e.target.files); e.target.value = '' }}
          />
          <div style={{ fontSize: 14.5, fontWeight: 700, color: cor.tinta2 }}>
            {enviando ? `Lendo ${enviando}…` : 'Arraste o e-mail aqui, ou clique para escolher'}
          </div>
          <div style={{ ...texto.apoio, marginTop: 6 }}>
            Arraste direto do Outlook (.msg) ou o arquivo salvo (.eml). Pode soltar vários.
            O mesmo e-mail não vira dois casos.
          </div>
        </div>
      )}

      {/* ── a outra porta: o pedido que não veio por e-mail ── */}
      <div style={{
        marginTop: portas === 'as duas' ? 14 : 0,
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          value={cnpj}
          onChange={(e) => setCnpj(maskCNPJ(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter' && !criando) abrirPorCnpj() }}
          placeholder="00.000.000/0000-00"
          inputMode="numeric"
          aria-label="CNPJ do tomador"
          style={{
            /* 16px no celular: abaixo disso o iOS dá zoom no campo e a tela
               "pula" quando a pessoa toca nele. */
            fontSize: 16, padding: '9px 12px', borderRadius: raio.controle,
            border: `1px solid ${cor.borda}`, color: cor.texto,
            width: 190, maxWidth: '100%',
          }}
        />
        <button type="button" onClick={abrirPorCnpj} disabled={criando} style={{ ...botaoCheio, opacity: criando ? .6 : 1 }}>
          {criando ? 'Abrindo…' : 'Abrir pelo CNPJ'}
        </button>
        {aoFechar && (
          <button type="button" onClick={aoFechar} style={botaoVazado}>Fechar</button>
        )}
        <span style={{ ...texto.nota, flex: 1, minWidth: 180 }}>
          Quando o pedido chegou por telefone, WhatsApp ou reunião. O card nasce na
          coluna <b>Entrada</b> da Análise, do mesmo jeito.
        </span>
      </div>

      {erro && (
        <div className="alert-error" style={{ marginTop: 12 }}>{erro}</div>
      )}

      {recadoMS && (
        <div className={recadoMS.tom === 'ok' ? 'alert-success' : 'alert-error'} style={{ marginTop: 12 }}>
          {recadoMS.txt}
        </div>
      )}

      {/* ── o CRM ainda não foi ligado ao Microsoft 365 ───────────────────── */}
      {semConfig && (
        <div style={{
          marginTop: 12, background: '#fdf8e6', border: '1px solid #eddda8',
          borderRadius: raio.cartao, padding: '12px 14px', fontSize: 12.5, lineHeight: 1.6, color: cor.ouroTexto,
        }}>
          {proprietario ? (
            <>
              <b style={{ color: '#5c460a' }}>Falta ligar o CRM ao Microsoft 365 — é um duplo clique.</b>
              <div style={{ marginTop: 6 }}>
                Na pasta do CRM, abra <b>LIGAR OUTLOOK.cmd</b>. Ele faz um login da Microsoft
                (um código de seis letras), registra o aplicativo e escreve tudo sozinho. Depois é
                só reiniciar o CRM. Você faz isso <b>uma vez</b>, e vale para a equipe inteira.
              </div>
            </>
          ) : (
            <>
              <b style={{ color: '#5c460a' }}>A busca automática no Outlook ainda não foi ligada.</b>
              <div style={{ marginTop: 6 }}>
                Enquanto isso, o caminho continua: salve o e-mail (ou arraste-o para a Área de
                Trabalho) e solte o arquivo aqui — o caso abre igual. O Marco liga a busca uma
                vez e isso some daqui.
              </div>
            </>
          )}
          <div style={{ ...texto.nota, marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setSemConfig(false)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline', color: cor.textoFraco }}
            >
              fechar
            </button>
          </div>
        </div>
      )}

      {/* ── arrastou do Novo Outlook e a caixa ainda não está ligada ──────── */}
      {precisaLigar && (
        <div style={{
          marginTop: 12, background: cor.destaque, border: `1px solid ${cor.borda}`,
          borderRadius: raio.cartao, padding: '12px 14px', fontSize: 12.5, lineHeight: 1.6, color: cor.texto,
        }}>
          <b style={{ color: cor.tinta }}>Falta ligar a sua caixa do Outlook ao CRM.</b>{' '}
          O Novo Outlook não entrega o arquivo do e-mail para o navegador — entrega só o endereço dele.
          Com a caixa ligada, o CRM vai buscar o e-mail inteiro sozinho, com anexos, toda vez que você
          arrastar. É um clique, uma vez: a Microsoft vai perguntar se você autoriza o CRM a <b>ler o seu
          e-mail</b>, e nada mais.
          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <a
              href={`/api/ms/login?depois=${encodeURIComponent(caminho)}`}
              style={{ ...botaoCheio, textDecoration: 'none', display: 'inline-block' }}
            >
              Ligar minha caixa do Outlook
            </a>
            <button type="button" onClick={() => setPrecisaLigar('')} style={botaoVazado}>Agora não</button>
            <span style={{ ...texto.nota, flex: 1, minWidth: 200 }}>
              Só a sua caixa, e só para o CRM abrir o caso. Dá para desligar quando quiser.
            </span>
          </div>
        </div>
      )}

      {/* ── soltou, e o Outlook não entregou o arquivo ────────────────────── */}
      {diagnostico && (
        <div style={{
          marginTop: 12, background: '#fdf8e6', border: `1px solid #eddda8`,
          borderRadius: raio.cartao, padding: '11px 13px', fontSize: 12.5,
          lineHeight: 1.6, color: cor.ouroTexto,
        }}>
          <b style={{ color: '#5c460a' }}>O e-mail foi solto, mas o arquivo não veio junto.</b>{' '}
          Isso não é o CRM: quem entrega (ou não) o arquivo é o Outlook. O <b>Novo Outlook</b> não
          sabe entregar e-mail para o navegador — é limitação da Microsoft, sem volta do nosso lado.
          <div style={{ marginTop: 6 }}>
            Duas saídas, as duas de um passo:
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              <li>abrir o mesmo e-mail no <b>Outlook clássico</b> e arrastar de lá (funciona direto);</li>
              <li>ou arrastar o e-mail para a <b>Área de Trabalho</b> e soltar o arquivo aqui.</li>
            </ul>
          </div>
          <div style={{ ...texto.nota, marginTop: 8, color: cor.textoFraco }}>
            O que o Outlook mandou: {diagnostico.length ? diagnostico.map((d) => d.tipo).join(' · ') : 'nada'}
          </div>

          {/* O CONTEÚDO, para o dia em que der para fazer melhor. O Novo
              Outlook manda os identificadores internos da mensagem; se eles
              servirem, o CRM busca o e-mail sozinho e o arrastar volta a ser
              um passo só. */}
          {diagnostico.some((d) => d.valor) && (
            <pre style={{
              marginTop: 6, maxHeight: 150, overflow: 'auto', background: cor.papel,
              border: `1px solid ${cor.borda}`, borderRadius: raio.controle,
              padding: '8px 10px', fontSize: 11, lineHeight: 1.45, color: cor.texto,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {diagnostico.map((d) => `${d.tipo}: ${d.valor || '(vazio)'}`).join('\n\n')}
            </pre>
          )}

          <div style={{ ...texto.nota, marginTop: 6 }}>
            <button
              type="button"
              onClick={() => {
                const txt = diagnostico.map((d) => `${d.tipo}: ${d.valor}`).join('\n\n')
                navigator.clipboard?.writeText(txt).then(() => setCopiou(true), () => setCopiou(false))
              }}
              style={{ ...botaoVazado, padding: '4px 10px', fontSize: 11.5 }}
            >
              {copiou ? 'copiado' : 'copiar isto'}
            </button>
            <button
              type="button"
              onClick={() => { setDiagnostico(null); setCopiou(false) }}
              style={{ marginLeft: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline', color: cor.textoFraco }}
            >
              fechar
            </button>
          </div>
        </div>
      )}

      {recibos.map((r) => (
        <div key={r.chave} className="alert-success" style={{ marginTop: 12 }}>
          <div>
            {r.ja_existia
              ? <>Este e-mail já era o caso <strong>#{r.numero}</strong>: {r.assunto}</>
              : <>Caso <strong>#{r.numero}</strong> aberto: {r.assunto}</>}
            {r.id && (
              <button
                type="button"
                onClick={() => router.push(`/comercial/${r.id}`)}
                style={{ marginLeft: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline', color: 'inherit' }}
              >
                abrir
              </button>
            )}
          </div>
          {!r.ja_existia && (
            <div style={{ fontWeight: 400, fontSize: 13, marginTop: 4 }}>
              {r.documentos} documento{r.documentos === 1 ? '' : 's'} guardado{r.documentos === 1 ? '' : 's'}
              {r.ignorados > 0 && ` · ${r.ignorados} anexo${r.ignorados === 1 ? '' : 's'} ignorado${r.ignorados === 1 ? '' : 's'} (assinatura, imagem do corpo ou arquivo vazio)`}
              {' · '}o card entrou na coluna Entrada da Análise
            </div>
          )}
          {r.falhas.length > 0 && (
            <div style={{ fontWeight: 400, fontSize: 13, marginTop: 6, color: '#a02020' }}>
              Não subiram: {r.falhas.join(' · ')}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
