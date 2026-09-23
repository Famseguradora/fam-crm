'use client'

/* MESA DE TRIAGEM E CADASTRO — a segunda estação da esteira.

   REFORMA DE 09/09/2026, e o motivo dela, nas palavras dele: "está muito
   confuso e complexo o primeiro passo; o Comercial pode não querer rodar nada".

   A tela virou TRÊS PASSOS NUMERADOS, um embaixo do outro, e cada um termina
   num botão só:

     1 · A empresa       digita o CNPJ, a Receita preenche, o TOMADOR JÁ NASCE
     2 · Os documentos   arrasta o Serasa e o que faltar, aqui dentro
     3 · Para a análise  quando quiser, e a pendência viaja junto

   O QUE MUDOU DE VERDADE, e não é só desenho:

   • O cadastro do tomador saiu do fim e veio para o passo 1. Antes ele só
     nascia no "Concluir", junto com o envio para a análise — então não havia
     como o Comercial deixar a empresa pré-cadastrada e ir embora. Agora há, e
     o passo 3 é opcional. Quem manda a empresa para o banco é o passo 1.
   • Documento entra pela tela. Antes só entrava o que veio dentro do e-mail, e
     o Serasa (que chega depois, quase sempre) não tinha porta nenhuma.
   • Nada aqui precisa de agente, de esteira ou de máquina ligada. Este caminho
     é o do teclado, e é o principal.

   As três regras antigas continuam valendo, e continuam desenhadas na tela:
   o CNPJ é a chave; pendência de documento NÃO trava a esteira; e o que a
   pessoa decide vence o que o robô achou. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { use as usePromise } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { maskCNPJ, validarCNPJ, fmtData } from '@/lib/utils'
import { consultarCNPJpelaTela } from '@/lib/cnpj'
import { cor } from '@/lib/ui/painel'
import SociosSerasa from '@/components/serasa/SociosSerasa'
import { type PedidoSerasa, SERASA_ABERTO, situacaoSerasa } from '@/lib/serasa/pedido'

const CLASSES: { valor: string; rotulo: string }[] = [
  { valor: 'contabil', rotulo: 'Demonstração contábil' },
  { valor: 'serasa_pj', rotulo: 'Serasa PJ (tomador)' },
  { valor: 'serasa_pf', rotulo: 'Serasa PF (sócio)' },
  { valor: 'contrato_social', rotulo: 'Contrato social' },
  { valor: 'acordo_socios', rotulo: 'Acordo de sócios' },
  { valor: 'cartao_cnpj', rotulo: 'Cartão CNPJ' },
  { valor: 'outro', rotulo: 'Outro documento' },
]

const SITUACOES: { valor: string; rotulo: string; badge: string }[] = [
  { valor: 'ok', rotulo: 'Recebido', badge: 'badge-green' },
  { valor: 'a_caminho', rotulo: 'A caminho', badge: 'badge-blue' },
  { valor: 'duvida', rotulo: 'Em dúvida', badge: 'badge-yellow' },
  { valor: 'dispensado', rotulo: 'Dispensado', badge: 'badge-gray' },
  { valor: 'faltando', rotulo: 'Faltando', badge: 'badge-red' },
]

interface Caso {
  id: string; numero: number; assunto: string
  remetente_nome: string | null; remetente_email: string | null
  recebido_em: string | null; corpo: string | null
  cnpj: string | null; razao_social: string | null
  corretora_texto: string | null; produto: string | null
  corretora_id: string | null; identificado_por: string | null
  etapa: string; tomador_id: string | null; criado_em: string
  criado_por_nome: string | null
  analise_fila_id: string | null
}

interface Documento {
  id: string; nome: string; classe: string; certeza: string
  nao_lido: boolean; bytes: number | null; anexo_id: string | null
  anexos: { storage_path: string } | null
}

interface Item {
  id: string; item: string; situacao: string; por: string
  detalhe: string | null
  caso_item_catalogo: { nome: string; exigencia: string; frase_falta: string | null; ordem: number }
}

const fmtBytes = (b: number | null) =>
  !b ? '' : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`

/** O cabeçalho de um passo: o número grande, o título e a linha que explica o
 *  que aquele passo faz. Passo cumprido fica verde — é o único jeito de bater o
 *  olho na tela e saber onde o caso parou sem ler nada. */
function Passo({ n, titulo, pronto, children }: {
  n: number; titulo: string; pronto: boolean; children: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
      <span style={{
        flexShrink: 0, width: 27, height: 27, borderRadius: '50%',
        background: pronto ? '#1a7a4c' : '#1e4080', color: '#fff',
        display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700,
      }}>{pronto ? '✓' : n}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, color: '#0a1628' }}>{titulo}</div>
        <div style={{ fontSize: 12.5, color: 'var(--soft)' }}>{children}</div>
      </div>
    </div>
  )
}

export default function TriagemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params)
  const router = useRouter()
  const { somenteLeitura } = usePermissoes()

  const [caso, setCaso] = useState<Caso | null>(null)
  const [docs, setDocs] = useState<Documento[]>([])
  const [itens, setItens] = useState<Item[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')
  const [verCorpo, setVerCorpo] = useState(false)
  const [buscandoReceita, setBuscandoReceita] = useState(false)

  // o Serasa pelo robô, ao lado da Receita
  const [serasa, setSerasa] = useState<PedidoSerasa | null>(null)
  const [pedindoSerasa, setPedindoSerasa] = useState(false)
  const [pasta, setPasta] = useState<string | null>(null)
  const [quem, setQuem] = useState<{ nome: string | null; analista: boolean }>({ nome: null, analista: false })
  const serasaAntes = useRef<PedidoSerasa | null>(null)

  // rascunho da identificação
  const [cnpj, setCnpj] = useState('')
  const [razao, setRazao] = useState('')
  // A corretora é da LISTA do CRM (10/09/2026), a mesma do cadastro do tomador.
  const [corretoraId, setCorretoraId] = useState('')
  const [corretoras, setCorretoras] = useState<{ id: string; razao_social: string }[]>([])
  const [produto, setProduto] = useState('')

  // passo 2: anexar à mão
  const [classeNova, setClasseNova] = useState('serasa_pj')
  const [subindo, setSubindo] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const seletor = useRef<HTMLInputElement>(null)

  /* Documentos e checklist, sem tocar no rascunho do passo 1: é o que recarrega
     quando o PDF do Serasa chega, com a pessoa talvez digitando lá em cima. */
  const carregarDocumentos = useCallback(async () => {
    const supabase = createClient()
    const { data: d } = await supabase
      .from('caso_documentos')
      .select('id, nome, classe, certeza, nao_lido, bytes, anexo_id, anexos(storage_path)')
      .eq('caso_id', id)
      .order('criado_em')
    setDocs((d ?? []) as unknown as Documento[])

    const { data: i } = await supabase
      .from('caso_itens')
      .select('id, item, situacao, por, detalhe, caso_item_catalogo!inner(nome, exigencia, frase_falta, ordem)')
      .eq('caso_id', id)
    const lista = ((i ?? []) as unknown as Item[]).sort(
      (a, b) => a.caso_item_catalogo.ordem - b.caso_item_catalogo.ordem,
    )
    setItens(lista)
  }, [id])

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const { data: c } = await supabase.from('casos').select('*').eq('id', id).maybeSingle()
    if (!c) { setErro('Caso não encontrado.'); setCarregando(false); return }
    setCaso(c as Caso)
    setCnpj((c as Caso).cnpj ?? '')
    setRazao((c as Caso).razao_social ?? '')
    setCorretoraId((c as Caso).corretora_id ?? '')
    setProduto((c as Caso).produto ?? '')
    // A pasta da análise, quando a esteira já abriu uma: o PDF do Serasa também cai nela.
    if ((c as Caso).analise_fila_id) {
      const { data: f } = await supabase.from('analise_fila').select('pasta').eq('id', (c as Caso).analise_fila_id as string).maybeSingle()
      setPasta((f?.pasta as string | undefined) ?? null)
    }
    await carregarDocumentos()
    setCarregando(false)
  }, [id, carregarDocumentos])

  useEffect(() => { carregar() }, [carregar])

  // A mesma consulta do Cadastro do tomador: ativas, em ordem de razão social.
  useEffect(() => {
    const supabase = createClient()
    supabase.from('corretoras').select('id, razao_social').eq('status', 'ativo').order('razao_social')
      .then(({ data }) => setCorretoras((data ?? []) as { id: string; razao_social: string }[]))
    // Quem pede o Serasa e quem decide os sócios (a função do banco confere de novo).
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('usuarios').select('nome, email, analista_credito').eq('auth_id', user.id).maybeSingle()
        .then(({ data }) => setQuem({ nome: data?.nome ?? data?.email ?? user.email ?? null, analista: !!data?.analista_credito }))
    })
  }, [])

  /* O SERASA NA TRIAGEM (15/09/2026), ao lado da Receita. É o mesmo pedido do
     cadastro do tomador e do card da análise (`serasa_pedidos`): a esteira do
     notebook consulta pelo robô, o PDF vira anexo do tomador, cai na pasta da
     análise e entra no passo 2 com o item do checklist marcado (quem liga ao
     caso é `/api/esteira/serasa`). Cada consulta é cobrada da FAM: por isso a
     confirmação, e só com o tomador salvo, porque é o CNPJ dele que a esteira
     confere antes de gastar. */
  const tomadorId = caso?.tomador_id ?? null
  const carregarSerasa = useCallback(async () => {
    if (!tomadorId) return
    let q = createClient().from('serasa_pedidos')
      .select('id, estado, criado_em, feito_em, resultado, pedido_por')
      .eq('camada', 'empresa').order('criado_em', { ascending: false }).limit(1)
    q = pasta ? q.or(`tomador_id.eq.${tomadorId},pasta.eq.${JSON.stringify(pasta)}`) : q.eq('tomador_id', tomadorId)
    const { data } = await q.maybeSingle()
    const novo = (data as PedidoSerasa | null) ?? null
    const velho = serasaAntes.current
    if (velho && novo && velho.id === novo.id && SERASA_ABERTO.includes(velho.estado) && !SERASA_ABERTO.includes(novo.estado)) carregarDocumentos()
    serasaAntes.current = novo
    setSerasa(novo)
  }, [tomadorId, pasta, carregarDocumentos])

  useEffect(() => { carregarSerasa() }, [carregarSerasa])
  const serasaAberto = !!serasa && SERASA_ABERTO.includes(serasa.estado)
  useEffect(() => {
    if (!serasaAberto) return
    const t = setInterval(carregarSerasa, 5000)
    return () => clearInterval(t)
  }, [serasaAberto, carregarSerasa])

  async function pedirSerasa() {
    const doc = (caso?.cnpj ?? '').replace(/\D/g, '')
    if (!caso?.tomador_id || doc.length !== 14) return
    const jaTem = docs.some((d) => d.classe === 'serasa_pj')
    if (!window.confirm(`Buscar o Serasa de ${caso.razao_social || 'esta empresa'} (CNPJ ${maskCNPJ(doc)})?\n\n${jaTem
      ? 'O caso já tem um Serasa. Se este CNPJ foi consultado nos últimos 30 dias, o robô reaproveita sem cobrar; senão é uma consulta nova, cobrada.'
      : 'É uma consulta cobrada da FAM (Relatório Avançado, sem nenhum extra).'}\n\nO robô roda no notebook. O PDF entra no passo 2 em 1 a 2 minutos, e os sócios aparecem aqui para a decisão do analista.`)) return
    setPedindoSerasa(true); setErro(''); setRecado('')
    const { error } = await createClient().from('serasa_pedidos').insert({
      tomador_id: caso.tomador_id,
      pasta,
      cnpj: doc,
      documento: doc,
      pedido_por: quem.nome,
    })
    if (error) setErro(error.code === '23505' ? 'Já há um pedido de Serasa em andamento para esta empresa.' : error.message)
    await carregarSerasa()
    setPedindoSerasa(false)
  }

  // Usa a MESMA consulta do botão Receita do Cadastro e da tela de Operações
  // (`lib/cnpj.ts`). Escrever um fetch próprio aqui traria dois defeitos de
  // graça: a razão social viria em CAIXA ALTA (o `tituloReceita` é que a põe em
  // Título) e "CNPJ inexistente" ficaria com a mesma mensagem de "a Receita caiu".
  async function buscarNaReceita() {
    const digitos = cnpj.replace(/\D/g, '')
    if (digitos.length !== 14) { setErro('Digite o CNPJ completo para buscar.'); return }
    setBuscandoReceita(true); setErro('')
    try {
      const cartao = await consultarCNPJpelaTela(digitos)
      setRazao(cartao.razao_social)
      setRecado(`Receita: ${cartao.razao_social}${cartao.situacao ? ' · ' + cartao.situacao : ''}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui consultar a Receita agora.')
    }
    setBuscandoReceita(false)
  }

  /* PASSO 1. Grava a identificação E cria o cadastro do tomador, numa ida só.
     O cadastro é o mesmo `acharOuCriarTomadorPorCnpj` do resto do CRM: se o
     CNPJ já existe, ele reaproveita e não sobrescreve nada. */
  async function preCadastrar() {
    setSalvando(true); setErro(''); setRecado('')
    const digitos = cnpj.replace(/\D/g, '')
    if (!validarCNPJ(digitos)) {
      setErro('CNPJ inválido: confira os dígitos.'); setSalvando(false); return
    }
    try {
      const r = await fetch(`/api/casos/${id}/pre-cadastro`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cnpj: digitos, razao_social: razao, corretora_id: corretoraId || null, produto }),
      })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui salvar.'); setSalvando(false); return }
      setRecado(
        (j.criado ? 'Tomador cadastrado' : 'Tomador já existia e foi vinculado') +
        `: ${j.tomador.razao_social}.` +
        (j.receita?.ok === false ? ` A Receita não respondeu (${j.receita.motivo}): confira endereço e contato na ficha.` : ''),
      )
      await carregar()
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setSalvando(false)
  }

  /* PASSO 2. Os arquivos que chegaram depois do e-mail. A classe é escolhida
     ANTES de soltar o arquivo, de propósito: é ela que faz o item do checklist
     cair, e adivinhar pelo nome é justamente o que erra. */
  const anexar = useCallback(async (arquivos: FileList | File[]) => {
    const lista = Array.from(arquivos)
    if (!lista.length) return
    setSubindo(true); setErro(''); setRecado('')
    const corpo = new FormData()
    corpo.append('classe', classeNova)
    for (const a of lista) corpo.append('arquivo', a)
    try {
      const r = await fetch(`/api/casos/${id}/documentos`, { method: 'POST', body: corpo })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui anexar.'); setSubindo(false); return }
      setRecado(
        `${j.entraram} documento(s) anexado(s)` +
        (j.itens_marcados?.length ? ', e a exigência correspondente foi marcada como recebida.' : '.') +
        (j.no_tomador ? ' Como a triagem já foi concluída, eles nasceram direto na ficha do tomador.' : ''),
      )
      if (j.aviso) setErro(j.aviso)
      await carregar()
    } catch {
      setErro('A conexão caiu no meio do envio. Confira a lista e tente de novo.')
    }
    setSubindo(false)
  }, [classeNova, id, carregar])

  // As duas funções abaixo pintam a tela antes de a gravação voltar (a espera
  // por clique tornaria o checklist arrastado). Mas se a gravação falhar, a tela
  // VOLTA ao que era e diz o motivo: senão o item ficaria "Recebido" aqui e
  // reapareceria como pendência na hora de concluir, sem explicação nenhuma.
  async function trocarClasse(docId: string, classe: string) {
    const supabase = createClient()
    const antes = docs
    setDocs((ds) => ds.map((d) => (d.id === docId ? { ...d, classe, certeza: 'alta' } : d)))
    const { data, error } = await supabase
      .from('caso_documentos')
      .update({ classe, certeza: 'alta', classificado_por: 'humano' })
      .eq('id', docId)
      .select('id')
    if (error || !data?.length) {
      setDocs(antes)
      setErro(error?.message ?? 'Não consegui gravar o tipo do documento (sem permissão de escrita).')
    }
  }

  async function marcarItem(itemId: string, situacao: string) {
    const supabase = createClient()
    const antes = itens
    setItens((is) => is.map((i) => (i.id === itemId ? { ...i, situacao, por: 'humano' } : i)))
    const { data: sessao } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('caso_itens')
      .update({
        situacao,
        por: 'humano',
        decidido_em: new Date().toISOString(),
        decidido_por: sessao.user?.email ?? null,
      })
      .eq('id', itemId)
      .select('id')
    if (error || !data?.length) {
      setItens(antes)
      setErro(error?.message ?? 'Não consegui gravar esta decisão (sem permissão de escrita).')
    }
  }

  async function abrirDocumento(doc: Documento) {
    if (!doc.anexos?.storage_path) { setErro('Este documento não tem arquivo guardado.'); return }
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from('fam-anexos')
      .createSignedUrl(doc.anexos.storage_path, 300)
    if (error || !data) { setErro('Não consegui abrir o arquivo: ' + (error?.message ?? '')); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  /* MANDAR PARA A ANÁLISE À MÃO. O caminho normal é o `concluir` aqui embaixo,
     que já põe o caso na esteira. Este botão é a saída para os casos concluídos
     ANTES de a esteira existir (07/09/2026), e para quando a criação da linha
     falhou no meio do concluir e o cadastro ficou feito sem a análise entrar.
     A regra é a mesma dos dois lados (`lib/analise/abrir-fila.ts`). */
  async function mandarParaAnalise() {
    setSalvando(true); setErro(''); setRecado('')
    try {
      const r = await fetch(`/api/casos/${id}/analisar`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui mandar para a análise.'); setSalvando(false); return }
      setRecado(j.ja_existia
        ? 'Este caso já estava na esteira da análise.'
        : `Entrou na esteira da análise, na pasta "${j.fila.pasta}".`)
      await carregar()
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setSalvando(false)
  }

  /* EXCLUIR (10/09/2026): "às vezes vem tomadores repetidos". Só na triagem,
     com a trava repetida no servidor. O caso sai do funil e fica no histórico;
     a pasta do notebook vai para _excluidas; o tomador não é apagado. */
  async function excluirCaso() {
    const motivo = window.prompt('Por que excluir este caso?\n\nEx.: repetido do caso #17.')
    if (motivo === null) return
    if (!window.confirm(`Excluir o caso #${caso?.numero}?\n\nEle sai da triagem e do funil, e a pasta do notebook vai para _excluidas. Nada é apagado de vez e o tomador continua no cadastro.`)) return
    setSalvando(true); setErro(''); setRecado('')
    try {
      const r = await fetch(`/api/casos/${id}/excluir`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motivo }),
      })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui excluir.'); setSalvando(false); return }
      router.push('/fluxo')
      return
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setSalvando(false)
  }

  async function concluir() {
    setSalvando(true); setErro(''); setRecado('')
    try {
      const r = await fetch(`/api/casos/${id}/concluir`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) { setErro(j.erro ?? 'Não consegui concluir.'); setSalvando(false); return }
      const falta = j.bloqueios?.length ? ` Falta ainda: ${j.bloqueios.join(' · ')}.` : ''
      setRecado(
        (j.criado ? 'Tomador cadastrado' : 'Tomador já existia e foi vinculado') +
        `: ${j.tomador.razao_social}. ${j.documentos_movidos} documento(s) foram para a ficha dele.` +
        ` O caso entrou na fila de análise.${falta}`,
      )
      // O cadastro deu certo, mas se os documentos não migraram isso NÃO pode
      // sair calado: a ficha do tomador ficaria vazia sem ninguém saber por quê.
      if (j.aviso_documentos) setErro(j.aviso_documentos)
      await carregar()
    } catch {
      setErro('A conexão caiu. Tente de novo.')
    }
    setSalvando(false)
  }

  if (carregando) return <div style={{ padding: 24, color: 'var(--soft)' }}>Carregando…</div>
  if (!caso) return <div style={{ padding: 24 }} className="alert-error">{erro || 'Caso não encontrado.'}</div>

  /* QUEM DIZ QUE ACABOU É A ETAPA, e não o `tomador_id`: desde o pré-cadastro,
     ter tomador é o estado normal de um caso ainda em triagem. */
  const naAnalise = caso.etapa === 'analise'
  const excluido = caso.etapa === 'descartado'
  const naTriagem = caso.etapa === 'comercial' || caso.etapa === 'triagem'
  const podeEditar = !somenteLeitura && !naAnalise && !excluido
  const cnpjOk = cnpj.replace(/\D/g, '').length === 14
  const salvo = cnpjOk && caso.cnpj === cnpj.replace(/\D/g, '')
  const cadastrado = !!caso.tomador_id && salvo
  const pendentes = itens.filter((i) => !['ok', 'dispensado'].includes(i.situacao))
  const bloqueando = pendentes.filter((i) => i.caso_item_catalogo.exigencia === 'bloqueia')
  const avisoSerasa = serasa ? situacaoSerasa(serasa, 'nos documentos do passo 2') : null

  return (
    <div style={{ padding: '20px 0' }}>
      {/* ── cabeçalho ── */}
      <button onClick={() => router.push('/fluxo')} className="btn-clear" style={{ marginBottom: 12 }}>
        ← Voltar para o funil
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h1 style={{ fontSize: 21, fontWeight: 700, color: '#0a1628', margin: 0 }}>
          Triagem e cadastro · caso #{caso.numero}
        </h1>
        {naAnalise && <span className="badge badge-green">na fila de análise</span>}
        {!naAnalise && cadastrado && <span className="badge badge-blue">pré-cadastrado</span>}
        {excluido && <span className="badge badge-gray">excluído</span>}
        {naTriagem && !somenteLeitura && (
          <button
            type="button" className="btn-secondary" onClick={excluirCaso} disabled={salvando}
            style={{ marginLeft: 'auto', color: '#a02020', borderColor: '#e0a0a0' }}
            title="Para caso repetido: sai da triagem e do funil, a pasta vai para _excluidas, o tomador fica."
          >
            Excluir
          </button>
        )}
      </div>
      {excluido && (caso as Caso & { motivo_descarte?: string | null }).motivo_descarte && (
        <p style={{ fontSize: 13, color: '#a02020', margin: '4px 0 0' }}>
          Excluído: {(caso as Caso & { motivo_descarte?: string | null }).motivo_descarte}
        </p>
      )}
      <p style={{ color: 'var(--soft)', fontSize: 14, margin: '4px 0 18px' }}>
        {caso.assunto}
        {caso.remetente_nome ? ` · de ${caso.remetente_nome}` : ''}
        {caso.remetente_email ? ` (${caso.remetente_email})` : ''} · entrou em {fmtData(caso.criado_em)}
        {caso.criado_por_nome ? ` por ${caso.criado_por_nome}` : ''}
      </p>

      {erro && <div className="alert-error" style={{ marginBottom: 14 }}>{erro}</div>}
      {recado && <div className="alert-success" style={{ marginBottom: 14 }}>{recado}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 960 }}>

        {/* ══ PASSO 1 · A EMPRESA ═══════════════════════════════════════════ */}
        <div className="card-panel" style={{ borderColor: cadastrado ? undefined : '#1e4080' }}>
          <Passo n={1} titulo="A empresa" pronto={cadastrado}>
            {cadastrado
              ? 'O tomador está no banco. Dá para parar aqui: o resto é quando quiser.'
              : 'Digite o CNPJ e clique em Receita. Ao salvar, o tomador já entra no cadastro do CRM.'}
          </Passo>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
            <div className="form-field">
              <label className="form-label">CNPJ</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="fam-input" value={maskCNPJ(cnpj)} disabled={!podeEditar}
                  onChange={(e) => setCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
                  placeholder="00.000.000/0000-00" inputMode="numeric"
                  style={{ flex: '1 1 160px', minWidth: 0 }}
                />
                <button
                  className="btn-secondary" onClick={buscarNaReceita}
                  disabled={!podeEditar || !cnpjOk || buscandoReceita}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {buscandoReceita ? '…' : 'Receita'}
                </button>
                {!somenteLeitura && !excluido && (
                  <button
                    className="btn-secondary" onClick={pedirSerasa}
                    disabled={!cadastrado || serasaAberto || pedindoSerasa}
                    title={!cadastrado
                      ? 'Salve o passo 1 antes: o Serasa consulta o CNPJ do tomador cadastrado'
                      : 'Consulta o Serasa pelo robô do notebook; o PDF entra nos documentos deste caso'}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {serasaAberto || pedindoSerasa ? '…' : 'Serasa'}
                  </button>
                )}
              </div>
            </div>

            <div className="form-field">
              <label className="form-label">Razão social</label>
              <input className="fam-input" value={razao} disabled={!podeEditar}
                onChange={(e) => setRazao(e.target.value)} placeholder="a Receita preenche" />
            </div>

            <div className="form-field">
              <label className="form-label">Corretora</label>
              <select className="fam-input" value={corretoraId} disabled={!podeEditar}
                onChange={(e) => setCorretoraId(e.target.value)}>
                <option value="">— Selecione a corretora —</option>
                {corretoras.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}
              </select>
              {caso.corretora_id && corretoraId === caso.corretora_id && caso.identificado_por !== 'humano' && (
                <span style={{ fontSize: 12, color: 'var(--soft)' }}>identificada pelo agente no e-mail</span>
              )}
              {!caso.corretora_id && !corretoraId && caso.corretora_texto && (
                <span style={{ fontSize: 12, color: '#8a6410' }}>
                  no e-mail aparece &quot;{caso.corretora_texto}&quot;, que não está no cadastro de corretoras
                </span>
              )}
            </div>

            <div className="form-field">
              <label className="form-label">Produto</label>
              <input className="fam-input" value={produto} disabled={!podeEditar}
                onChange={(e) => setProduto(e.target.value)}
                placeholder="Garantia Executante, Judicial…" />
            </div>
          </div>

          {avisoSerasa && (
            <div style={{ border: `1px solid ${avisoSerasa.erro ? cor.alertaBorda : cor.borda}`, background: avisoSerasa.erro ? cor.alertaFundo : cor.papelZebra, borderRadius: 8, padding: '9px 12px', marginTop: 12, color: avisoSerasa.erro ? cor.alerta : cor.textoSub, fontSize: 12.5, lineHeight: 1.5 }}>
              {avisoSerasa.texto}
            </div>
          )}
          {caso.tomador_id && (
            <div style={{ marginTop: 12 }}>
              <SociosSerasa tomadorId={caso.tomador_id} pasta={pasta} analista={quem.analista} classeBotao="btn-secondary" />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
            {podeEditar && (
              <button className="btn-primary" onClick={preCadastrar} disabled={!cnpjOk || salvando}>
                {salvando ? 'Salvando…' : cadastrado ? 'Salvar de novo' : 'Salvar e cadastrar o tomador'}
              </button>
            )}
            {caso.tomador_id && (
              <button className="btn-secondary" onClick={() => router.push(`/tomadores/${caso.tomador_id}`)}>
                Abrir a ficha do tomador →
              </button>
            )}
            {!cnpjOk && (
              <span style={{ fontSize: 12.5, color: 'var(--soft)' }}>
                Sem o CNPJ nada anda: é ele que liga caso, cadastro e análise.
              </span>
            )}
          </div>

          {/* O resto do Cadastro Básico (endereço, contato, porte, limite) vive
              na ficha do tomador e é preenchido pela Receita neste momento.
              Repetir aqueles campos aqui criaria uma segunda tela de cadastro,
              que é exatamente o que este CRM não pode ter. */}
          {cadastrado && (
            <p style={{ fontSize: 12.5, color: 'var(--soft)', margin: '10px 0 0' }}>
              Endereço, contato e sócios vieram do cartão CNPJ e estão na ficha. Porte, limite e
              observações se editam lá, no Cadastro do tomador.
            </p>
          )}
        </div>

        {/* ══ PASSO 2 · OS DOCUMENTOS ══════════════════════════════════════ */}
        <div className="card-panel">
          <Passo n={2} titulo="Os documentos" pronto={docs.length > 0}>
            O que veio no e-mail já está aqui. O Serasa e o que faltar, você solta abaixo.
          </Passo>

          {podeEditar && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
              <div className="form-field" style={{ minWidth: 210, flex: '0 1 240px', marginBottom: 0 }}>
                <label className="form-label">O que você vai anexar</label>
                <select className="fam-input" value={classeNova} onChange={(e) => setClasseNova(e.target.value)}>
                  {CLASSES.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                </select>
              </div>
            </div>
          )}

          {podeEditar && (
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); anexar(e.dataTransfer.files) }}
              onClick={() => seletor.current?.click()}
              style={{
                border: `2px dashed ${arrastando ? '#1e4080' : 'var(--border)'}`,
                background: arrastando ? '#f2f6fd' : '#fbfcfe',
                borderRadius: 10, padding: '18px 14px', textAlign: 'center',
                cursor: subindo ? 'progress' : 'pointer', marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0a1628' }}>
                {subindo ? 'Enviando…' : 'Solte os arquivos aqui, ou clique para escolher'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--soft)', marginTop: 3 }}>
                PDF, Excel, imagem. Até 50 MB cada. Vários de uma vez.
              </div>
              <input
                ref={seletor} type="file" multiple hidden
                onChange={(e) => { if (e.target.files) anexar(e.target.files); e.target.value = '' }}
              />
            </div>
          )}

          {docs.length === 0 ? (
            <p style={{ color: 'var(--soft)', fontSize: 14, margin: 0 }}>
              Nenhum documento ainda.
            </p>
          ) : (
            <div className="fam-table-wrap">
              <table className="fam-table">
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th style={{ width: 200 }}>É o quê</th>
                    <th style={{ width: 78 }}>Tamanho</th>
                    <th style={{ width: 74 }} />
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div style={{ fontWeight: 600, wordBreak: 'break-word' }}>{d.nome}</div>
                        {d.certeza === 'nula' && (
                          <div style={{ fontSize: 12, color: '#a02020' }}>não consegui abrir</div>
                        )}
                      </td>
                      <td>
                        <select
                          className="fam-input" value={d.classe} disabled={!podeEditar}
                          onChange={(e) => trocarClasse(d.id, e.target.value)}
                          style={{ fontSize: 13, padding: '5px 8px' }}
                        >
                          {CLASSES.map((c) => (
                            <option key={c.valor} value={c.valor}>{c.rotulo}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ color: 'var(--soft)' }}>{fmtBytes(d.bytes)}</td>
                      <td>
                        <button className="btn-clear" onClick={() => abrirDocumento(d)}>abrir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ══ PASSO 3 · PARA A ANÁLISE ═════════════════════════════════════ */}
        <div className="card-panel" style={{ borderColor: !naAnalise && cadastrado ? '#e8b84b' : undefined }}>
          <Passo n={3} titulo="Mandar para a análise de crédito" pronto={naAnalise}>
            {naAnalise
              ? 'Já foi. A análise é feita no Sistema de Análise, dentro do CRM.'
              : caso.analise_fila_id
                ? 'A esteira automática já está com este caso: a pasta foi criada no notebook, e a triagem, o cadastro e a análise andam sozinhos. Este botão só é preciso para concluir à mão.'
                : 'Opcional agora. Pendência de documento não trava: ela viaja junto e o analista decide.'}
          </Passo>
          {!naAnalise && caso.analise_fila_id && (
            <div style={{ marginBottom: 12 }}>
              <button className="btn-secondary" onClick={() => router.push(`/analises/mesa/${caso.analise_fila_id}`)}>
                Acompanhar na esteira →
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 14 }}>
            {itens.map((i) => {
              const s = SITUACOES.find((x) => x.valor === i.situacao) ?? SITUACOES[4]
              return (
                <div key={i.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0a1628' }}>
                      {i.caso_item_catalogo.nome}
                    </span>
                    <span className={`badge ${s.badge}`}>{s.rotulo}</span>
                    {i.caso_item_catalogo.exigencia === 'bloqueia' && !['ok', 'dispensado'].includes(i.situacao) && (
                      <span style={{ fontSize: 11.5, color: '#a02020' }}>
                        {i.caso_item_catalogo.frase_falta}
                      </span>
                    )}
                    {i.por === 'humano' && (
                      <span style={{ fontSize: 11, color: 'var(--soft)' }}>decidido por pessoa</span>
                    )}
                  </div>
                  {podeEditar && (
                    <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                      {SITUACOES.map((op) => (
                        <button
                          key={op.valor} onClick={() => marcarItem(i.id, op.valor)}
                          className="btn-clear"
                          style={{
                            fontSize: 11.5, padding: '4px 9px',
                            background: i.situacao === op.valor ? '#1e4080' : undefined,
                            color: i.situacao === op.valor ? '#fff' : undefined,
                            borderColor: i.situacao === op.valor ? '#1e4080' : undefined,
                          }}
                        >
                          {op.rotulo}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {!naAnalise ? (
            <>
              {bloqueando.length > 0 && salvo && (
                <p style={{
                  fontSize: 12.5, color: '#8a6410', background: '#fdf4dd',
                  border: '1px solid #e8b84b', borderRadius: 8, padding: '8px 10px', margin: '0 0 12px',
                }}>
                  Falta {bloqueando.map((i) => i.caso_item_catalogo.nome).join(' · ')}. Dá para mandar assim
                  mesmo: a pendência viaja junto e quem decide se a análise começa é o analista.
                </p>
              )}
              <button
                className="btn-primary" onClick={concluir}
                disabled={!podeEditar || !salvo || salvando}
              >
                {salvando ? 'Enviando…' : 'Concluir e enviar para análise'}
              </button>
              {!salvo && (
                <div style={{ fontSize: 12, color: 'var(--soft)', marginTop: 6 }}>
                  Termine o passo 1 primeiro.
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {caso.analise_fila_id ? (
                <button className="btn-secondary" onClick={() => router.push('/analises')}>
                  Ver na esteira da análise →
                </button>
              ) : (
                <button className="btn-primary" onClick={mandarParaAnalise} disabled={somenteLeitura || salvando}>
                  {salvando ? 'Mandando…' : 'Mandar para a análise'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* corpo do e-mail: é onde moram corretora, produto e condições */}
        {caso.corpo && (
          <div className="card-panel">
            <div
              className="section-title"
              style={{ cursor: 'pointer', marginBottom: verCorpo ? 14 : 0 }}
              onClick={() => setVerCorpo((v) => !v)}
            >
              <span className="dot" />O que o e-mail dizia {verCorpo ? '▾' : '▸'}
            </div>
            {verCorpo && (
              <pre style={{
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
                fontSize: 13.5, color: '#26374a', margin: 0, maxHeight: 340, overflowY: 'auto',
              }}>{caso.corpo}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
