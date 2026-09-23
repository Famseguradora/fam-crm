/* E-MAIL VIRA CASO. Uma regra só, para as duas estradas.

   POR QUE ISTO É UM MÓDULO, e não o corpo de uma rota:
   o e-mail entra por dois caminhos que não podem divergir.

     estrada principal   o Carteiro lê o Outlook na máquina do Comercial e sobe
                         o .msg do e-mail que a pessoa escolheu na tela
     estrada redundante  a pessoa arrasta o .msg/.eml direto no CRM, de onde
                         estiver, quando a máquina do Comercial estiver parada

   Ordem do Marco em 07/09/2026: "sempre temos que ter a estrada principal e a
   redundante, ou seja, caso a opção 1 dê problema, a opção 2 não deixa a
   empresa parar". Duas estradas, sim; duas regras, não. Se a criação do caso
   fosse escrita nos dois lugares, no terceiro mês o caso nascido pelo Carteiro
   teria um checklist e o nascido pelo upload teria outro.

   NADA AQUI USA IA. O que classifica documento é o nome do arquivo contra o
   catálogo da política, que é regra auditável. Quando a IA entrar (ler o
   conteúdo do PDF, na Subscrição), ela vira uma segunda opinião marcada como
   tal, e o que a pessoa decidiu continua vencendo. */

import type { SupabaseClient } from '@supabase/supabase-js'
import { lerEmail, anexosUteis, limparNome, ehEmail, nomeDeEmail, type EmailLido } from '@/lib/email/ler-email'
import { mimePorNome } from '@/lib/anexos/mime'
import { lerChecklistPorNome, type ItemCatalogo } from '@/lib/casos/checklist'
import { cnpjDoAssunto, corretoraDoRemetente } from '@/lib/casos/pistas'
import { abrirNaFila } from '@/lib/analise/abrir-fila'
import { acharCorretoraNoEmail } from '@/lib/analise/corretoras.mjs'

const BUCKET = 'fam-anexos'
export const MAX_BYTES_EMAIL = 50 * 1024 * 1024

const nomeSeguro = (n: string) => n.replace(/[^a-zA-Z0-9._\-]/g, '_')

/* A data do cabeçalho é texto ("Fri, 4 Sep 2026 13:37:05 +0000"). Data inválida
   vira null em vez de "Invalid Date", que o Postgres recusaria e derrubaria a
   abertura do caso inteiro por causa de um cabeçalho torto. */
export function dataDoEmail(txt: string): string | null {
  if (!txt) return null
  const d = new Date(txt)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export interface AutorDoCaso {
  auth_id: string | null
  nome: string | null
}

export interface ReciboDeAbertura {
  ok: boolean
  erro?: string
  /** Quando o mesmo e-mail já tinha virado caso: não duplica, aponta o que existe. */
  ja_existia?: boolean
  caso?: { id: string; numero: number; assunto: string }
  /** A análise automática que nasceu junto (a pasta que o notebook vai montar). */
  fila?: { id: string; pasta: string }
  documentos: number
  ignorados: number
  falhas: string[]
  /** O que o nome dos anexos reconheceu do checklist da política. */
  checklist?: { tem: string[]; faltam: string[] }
}

/**
 * Abre o caso a partir do arquivo bruto de um e-mail.
 *
 * `supabase` decide a permissão: com o cliente de sessão, a trava é a RLS; com
 * o cliente de serviço (o Carteiro, que não tem cookie de login), a trava é o
 * segredo que a rota já conferiu antes de chamar aqui.
 */
export async function abrirCasoPorEmail(
  supabase: SupabaseClient,
  entrada: {
    bruto: Buffer
    nomeArquivo: string
    autor: AutorDoCaso
    /** A linha da caixa de entrada de onde este e-mail veio, quando veio de lá. */
    emailCaixaId?: string | null
  },
): Promise<ReciboDeAbertura> {
  const vazio = { documentos: 0, ignorados: 0, falhas: [] as string[] }

  /* O CONTEÚDO DECIDE, NÃO O NOME (23/09/2026). O e-mail arrastado direto do
     Outlook é montado pelo navegador a partir de um item virtual (ele mora no
     Exchange, não no disco), e o nome que chega depende do assunto e da versão
     do Windows: às vezes vem sem extensão. Recusar por causa do nome era
     recusar um e-mail que está inteiro ali dentro. `nomeDeEmail` devolve o
     nome com a extensão certa, para o arquivo guardado abrir com dois cliques
     depois. */
  if (!ehEmail(entrada.nomeArquivo, entrada.bruto)) {
    return { ok: false, ...vazio, erro: `"${entrada.nomeArquivo}" não é um e-mail (.msg ou .eml).` }
  }
  const nomeArquivo = nomeDeEmail(entrada.nomeArquivo, entrada.bruto)
  if (entrada.bruto.length > MAX_BYTES_EMAIL) {
    return {
      ok: false,
      ...vazio,
      erro: `E-mail de ${(entrada.bruto.length / 1024 / 1024).toFixed(1)} MB. O limite é 50 MB.`,
    }
  }

  let email: EmailLido
  try {
    email = lerEmail(entrada.bruto)
  } catch (e) {
    return {
      ok: false,
      ...vazio,
      erro: 'Não consegui ler este e-mail. ' + (e instanceof Error ? e.message : ''),
    }
  }

  /* O MESMO E-MAIL NÃO VIRA DOIS CASOS. Cenário real do desenho de duas
     estradas: o Carteiro traz, a máquina cai antes de a tela atualizar, e a
     pessoa sobe o mesmo e-mail pelo upload. Sem esta consulta nasceriam dois
     casos do mesmo pedido, e a duplicata só apareceria na análise. */
  let linhaCaixa = entrada.emailCaixaId ?? null
  if (email.message_id) {
    const { data: ja } = await supabase
      .from('emails_caixa')
      .select('id, caso_id')
      .eq('message_id', email.message_id)
      .maybeSingle()
    if (ja?.caso_id) {
      const { data: c } = await supabase
        .from('casos')
        .select('id, numero, assunto')
        .eq('id', ja.caso_id)
        .maybeSingle()
      return {
        ok: true,
        ja_existia: true,
        ...vazio,
        caso: c ? { id: c.id, numero: c.numero, assunto: c.assunto } : undefined,
        erro: 'Este e-mail já tinha virado caso.',
      }
    }
    /* Só adota a linha achada quando ninguém disse de qual linha veio. Se o
       Carteiro já nomeou a linha, ela manda: duas linhas para o mesmo e-mail
       existem (uma por cano), e escrever o resultado na errada deixaria o
       e-mail que a pessoa clicou eternamente "trazendo…" na tela. */
    if (!linhaCaixa && ja?.id) linhaCaixa = ja.id as string
  }

  const documentos = anexosUteis(email)
  const assunto = limparNome(email.assunto) || nomeArquivo.replace(/\.(msg|eml)$/i, '')

  /* As pistas entram no caso já na abertura, e marcadas como pistas. O CNPJ só
     entra se passar no dígito verificador (ver `pistas.ts`): a triagem confirma
     ou corrige, e `identificado_por` continua 'robo' até um humano mexer. */
  const cnpj = cnpjDoAssunto(email.assunto)
  const corretora = corretoraDoRemetente(email.email_de)
  /* A CORRETORA CADASTRADA, lida do e-mail inteiro (10/09/2026). O remetente é
     quase sempre alguém da FAM encaminhando; a corretora está no corpo. Achou
     uma só: o caso nasce ligado a ela, e a tela mostra a lista já escolhida. */
  const { data: listaCorretoras } = await supabase
    .from('corretoras').select('id, razao_social, nome_fantasia, cnpj, email').eq('status', 'ativo')
  const achada = acharCorretoraNoEmail({ email_de: email.email_de, corpo: email.corpo, assunto: email.assunto }, listaCorretoras ?? [])

  const { data: caso, error: erroCaso } = await supabase
    .from('casos')
    .insert({
      assunto,
      remetente_nome: email.de || null,
      remetente_email: email.email_de || null,
      recebido_em: dataDoEmail(email.data),
      corpo: email.corpo || null,
      cnpj: cnpj?.valor ?? null,
      corretora_texto: achada.achou ? achada.nome : (corretora?.valor ?? null),
      corretora_id: achada.achou ? achada.corretora_id : null,
      etapa: 'triagem',
      criado_por_auth_id: entrada.autor.auth_id,
      criado_por_nome: entrada.autor.nome,
      email_caixa_id: linhaCaixa,
    })
    .select('id, numero, assunto')
    .single()

  /* Escrita barrada por RLS volta sem linha e às vezes sem erro. Por isso a
     checagem é pelo que VOLTOU, e não pela ausência de `error`. */
  if (erroCaso || !caso) {
    return {
      ok: false,
      ...vazio,
      erro: erroCaso?.message ?? 'Você não tem permissão para abrir casos no CRM.',
    }
  }

  const guardar = async (nome: string, dados: Buffer, mime: string) => {
    const caminho = `caso/${caso.id}/${Date.now()}_${nomeSeguro(nome)}`
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, dados, { upsert: false, contentType: mime })
    if (error) return { erro: error.message, caminho: '' }
    return { erro: '', caminho }
  }

  const falhas: string[] = []

  // O e-mail original fica guardado: é a prova do que chegou.
  const original = await guardar(nomeArquivo, entrada.bruto, mimePorNome(nomeArquivo))
  if (original.caminho) {
    await supabase.from('casos').update({ email_storage_path: original.caminho }).eq('id', caso.id)
  } else {
    falhas.push(`o próprio e-mail (${original.erro})`)
  }

  // Cada anexo útil vira anexo do CRM + uma linha de leitura da triagem.
  let guardados = 0
  const nomesGuardados: string[] = []
  for (const doc of documentos) {
    const mime = mimePorNome(doc.nome)
    const { erro, caminho } = await guardar(doc.nome, doc.dados, mime)
    if (!caminho) {
      falhas.push(`${doc.nome} (${erro})`)
      continue
    }

    const { data: anexo, error: erroAnexo } = await supabase
      .from('anexos')
      .insert({
        entidade_tipo: 'caso',
        entidade_id: caso.id,
        nome_original: doc.nome,
        storage_path: caminho,
        tipo_mime: mime,
        tamanho_bytes: doc.dados.length,
        categoria: 'outro',
      })
      .select('id')
      .single()

    if (erroAnexo || !anexo) {
      // Arquivo sem linha no banco é arquivo órfão: desfaz o upload.
      await supabase.storage.from(BUCKET).remove([caminho])
      falhas.push(`${doc.nome} (${erroAnexo?.message ?? 'sem permissão de escrita'})`)
      continue
    }

    /* O arquivo subiu e a linha de anexo existe; falta a LEITURA da triagem. Se
       ela não entrar, o documento fica invisível na mesa mesmo estando
       guardado, então isso conta como falha e não como sucesso. */
    const { data: leitura, error: erroLeitura } = await supabase
      .from('caso_documentos')
      .insert({ caso_id: caso.id, anexo_id: anexo.id, nome: doc.nome, bytes: doc.dados.length })
      .select('id')
      .single()

    if (erroLeitura || !leitura) {
      falhas.push(`${doc.nome} (guardado, mas não entrou na triagem: ${erroLeitura?.message ?? 'sem permissão'})`)
      continue
    }
    guardados++
    nomesGuardados.push(doc.nome)
  }

  /* O CHECKLIST NASCE JUNTO COM O CASO, mesmo vazio: item que não existe na
     tela é item que ninguém cobra. E ele nasce JÁ LIDO pelo nome dos anexos,
     que é exatamente o que a Caixa de entrada mostrava antes do clique. Tudo
     marcado como `robo`: a triagem confirma lendo o conteúdo, e o que a pessoa
     marcar nunca é desfeito por releitura. */
  const { data: catalogo } = await supabase
    .from('caso_item_catalogo')
    .select('id, nome, exigencia, frase_falta, ordem, padroes_nome')
    .eq('ativo', true)
    .order('ordem')

  let checklist: { tem: string[]; faltam: string[] } | undefined
  const itens = (catalogo ?? []) as ItemCatalogo[]
  if (itens.length) {
    const leitura = lerChecklistPorNome(nomesGuardados, itens)
    checklist = { tem: leitura.tem.map((i) => i.nome), faltam: leitura.faltam.map((i) => i.nome) }
    const reconhecido = new Set(leitura.tem.map((i) => i.id))

    const { data: nascidos, error: erroItens } = await supabase
      .from('caso_itens')
      .insert(
        itens.map((i) => ({
          caso_id: caso.id,
          item: i.id,
          situacao: reconhecido.has(i.id) ? 'ok' : 'faltando',
          por: 'robo',
          detalhe: reconhecido.has(i.id) ? 'Reconhecido pelo nome do anexo.' : null,
        })),
      )
      .select('id')
    // Checklist que não nasce é exigência que ninguém cobra: falha visível.
    if (erroItens || nascidos?.length !== itens.length) {
      falhas.push(`o checklist do caso (${erroItens?.message ?? 'gravou incompleto'})`)
    }
  }

  /* A caixa de entrada aprende que este e-mail virou caso. É o que substitui o
     `_outlook-vistos.json` do motor, e aqui o rastro não expira: o motor
     guardava o CAMINHO da pasta, e a pasta anda de lugar quando a análise é
     entregue. */
  if (linhaCaixa) {
    await supabase
      .from('emails_caixa')
      .update({
        estado: 'trazido',
        estado_em: new Date().toISOString(),
        estado_por: entrada.autor.nome,
        estado_erro: null,
        caso_id: caso.id,
      })
      .eq('id', linhaCaixa)
  } else if (email.message_id) {
    /* Veio pelo upload e nunca passou pela caixa: a linha nasce agora, já
       trazida. Assim a Caixa mostra o quadro inteiro, tenha o e-mail entrado
       pela estrada principal ou pela redundante. */
    const { data: nova } = await supabase
      .from('emails_caixa')
      .insert({
        origem: 'upload',
        message_id: email.message_id,
        assunto,
        de: email.de || null,
        email_de: email.email_de || null,
        para: email.para || null,
        copia: email.copia || null,
        recebido_em: dataDoEmail(email.data),
        previa: (email.corpo || '').slice(0, 400) || null,
        corpo: email.corpo || null,
        corpo_em: new Date().toISOString(),
        anexos: email.anexos.map((a) => ({
          nome: a.nome,
          kb: Math.round(a.dados.length / 1024),
          embutido: a.embutido,
        })),
        anexos_uteis: documentos.length,
        tamanho_kb: Math.round(entrada.bruto.length / 1024),
        serve: true,
        motivo: 'Subido à mão no CRM.',
        estado: 'trazido',
        estado_em: new Date().toISOString(),
        estado_por: entrada.autor.nome,
        caso_id: caso.id,
      })
      .select('id')
      .maybeSingle()
    if (nova?.id) await supabase.from('casos').update({ email_caixa_id: nova.id }).eq('id', caso.id)
  }

  /* A PASTA NASCE NO CLIQUE (10/09/2026). Ordem do Marco: "quando eu clicar em
     trazer para esteira, o agente deve ler o e-mail inteiro, criar a pasta do
     tomador e já fazer a triagem". Até aqui a análise só entrava na fila no
     Concluir da Triagem, e a pasta não existia enquanto ninguém clicasse. Agora
     a fila abre na hora, marcada `automatica`: o agente do notebook monta a
     pasta com o e-mail dentro, a triagem roda sozinha, o Cadastro em seguida, e
     a análise de crédito começa quando nada faltar. */
  const naFila = await abrirNaFila(supabase, {
    id: caso.id, numero: caso.numero, assunto: caso.assunto,
    cnpj: cnpj?.valor ?? null, razao_social: null, tomador_id: null,
  }, entrada.autor.nome ?? 'Carteiro', { automatica: true })
  if (!naFila.ok) falhas.push(`a esteira automática (${naFila.erro})`)

  return {
    ok: true,
    caso: { id: caso.id, numero: caso.numero, assunto: caso.assunto },
    fila: naFila.ok ? naFila.fila : undefined,
    documentos: guardados,
    ignorados: email.anexos.length - documentos.length,
    falhas,
    checklist,
  }
}
