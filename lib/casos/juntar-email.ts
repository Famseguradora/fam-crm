/* E-MAIL NOVO, MESMO CASO. A irmã de `abrir-por-email.ts`.

   Pedido do Marco em 30/09/2026: "quando tem documentos faltantes dentro de um
   card de um tomador, eu tenho que ter a opção de anexar os documentos
   faltantes, ou trazer o novo e-mail para dentro do mesmo card. A ideia não é
   uma nova análise, a ideia é um complemento."

   Até aqui todo e-mail trazido abria caso novo, pasta nova e card novo: a
   resposta da corretora com o Serasa que faltava virava uma segunda empresa na
   Mesa. Esta função faz o contrário. O caso já existe, e o e-mail entra nele:

     o arquivo do e-mail     guardado e com linha em `anexos`, para descer para
                             a pasta e ser LIDO (triagem e Agente de Cadastro
                             leem e-mail; o corpo tem o que a corretora escreveu)
     cada anexo útil         `anexos` + `caso_documentos`, como no primeiro
     o checklist             o item que o nome reconhece cai para 'ok', mas só
                             o que o robô tinha marcado: decisão humana não se
                             desfaz sozinha (regra do `caso_itens`)
     a caixa                 a linha do e-mail ganha `caso_id` e `juntado_em`:
                             é o e-mail FILHO; a matriz é `casos.email_caixa_id`
     a esteira               `analise_fila.anexos_em`, e o agente baixa o que
                             chegou e refaz a triagem sozinho

   QUEM DECIDE O CASO É UMA PESSOA. A tela sugere ("parece ser do caso #N"),
   nunca junta sozinha: juntar errado mistura documento de dois tomadores, e
   isso já aconteceu uma vez (Heritage x GGP, 10/09).

   NADA AQUI USA IA, pelo mesmo motivo do primeiro módulo. */

import type { SupabaseClient } from '@supabase/supabase-js'
import { lerEmail, anexosUteis, limparNome, ehEmail, nomeDeEmail, type EmailLido } from '@/lib/email/ler-email'
import { mimePorNome } from '@/lib/anexos/mime'
import { lerChecklistPorNome, type ItemCatalogo } from '@/lib/casos/checklist'
import { MAX_BYTES_EMAIL, dataDoEmail, linhaDeCaixaDoUpload, type AutorDoCaso } from '@/lib/casos/abrir-por-email'

const BUCKET = 'fam-anexos'
const nomeSeguro = (n: string) => n.replace(/[^a-zA-Z0-9._\-]/g, '_')

export interface ReciboDeJuntar {
  ok: boolean
  erro?: string
  /** O mesmo e-mail já estava neste caso: nada foi duplicado. */
  ja_estava?: boolean
  caso?: { id: string; numero: number; assunto: string }
  documentos: number
  ignorados: number
  falhas: string[]
  /** Itens do checklist que este e-mail resolveu. */
  resolveu: string[]
  /** Os arquivos foram para a ficha do tomador (a triagem já tinha concluído). */
  no_tomador: boolean
  /** A análise do caso já está pronta: o documento novo pede Análise complementar. */
  analise_concluida: boolean
  tomador_id: string | null
}

export async function juntarEmailAoCaso(
  supabase: SupabaseClient,
  entrada: {
    casoId: string
    bruto: Buffer
    nomeArquivo: string
    autor: AutorDoCaso
    /** A linha da caixa de onde o e-mail veio, quando veio pelo Carteiro. */
    emailCaixaId?: string | null
    origem?: 'upload' | 'graph'
  },
): Promise<ReciboDeJuntar> {
  const vazio = {
    documentos: 0, ignorados: 0, falhas: [] as string[], resolveu: [] as string[],
    no_tomador: false, analise_concluida: false, tomador_id: null as string | null,
  }

  if (!ehEmail(entrada.nomeArquivo, entrada.bruto)) {
    return { ok: false, ...vazio, erro: `"${entrada.nomeArquivo}" não é um e-mail (.msg ou .eml).` }
  }
  if (entrada.bruto.length > MAX_BYTES_EMAIL) {
    return { ok: false, ...vazio, erro: `E-mail de ${(entrada.bruto.length / 1024 / 1024).toFixed(1)} MB. O limite é 50 MB.` }
  }
  const nomeArquivo = nomeDeEmail(entrada.nomeArquivo, entrada.bruto)

  const { data: caso } = await supabase
    .from('casos')
    .select('id, numero, assunto, etapa, tomador_id, email_caixa_id')
    .eq('id', entrada.casoId)
    .maybeSingle()
  if (!caso) return { ok: false, ...vazio, erro: 'Caso não encontrado.' }
  if (caso.etapa === 'descartado' || caso.etapa === 'encerrado') {
    return { ok: false, ...vazio, erro: `O caso #${caso.numero} foi ${caso.etapa}. Reabra o caso antes de juntar e-mail nele.` }
  }
  const alvoCaso = { id: caso.id as string, numero: caso.numero as number, assunto: caso.assunto as string }

  let email: EmailLido
  try {
    email = lerEmail(entrada.bruto)
  } catch (e) {
    return { ok: false, ...vazio, erro: 'Não consegui ler este e-mail. ' + (e instanceof Error ? e.message : '') }
  }

  /* O MESMO E-MAIL NÃO ENTRA DUAS VEZES, nem em dois casos. No mesmo caso é
     só informação ("já estava"); em outro caso é erro, e o número do outro
     vai na frase: a pessoa precisa saber onde ele está. */
  let linhaCaixa = entrada.emailCaixaId ?? null
  if (email.message_id) {
    const { data: ja } = await supabase
      .from('emails_caixa')
      .select('id, caso_id')
      .eq('message_id', email.message_id)
      .maybeSingle()
    if (ja?.caso_id === caso.id) {
      return { ok: true, ja_estava: true, ...vazio, caso: alvoCaso, erro: 'Este e-mail já está neste caso.' }
    }
    if (ja?.caso_id) {
      const { data: outro } = await supabase.from('casos').select('numero').eq('id', ja.caso_id).maybeSingle()
      return {
        ok: false, ...vazio,
        erro: `Este e-mail já está no caso #${outro?.numero ?? '?'}. Um e-mail mora num caso só.`,
      }
    }
    if (!linhaCaixa && ja?.id) linhaCaixa = ja.id as string
  }

  /* O DOCUMENTO SEGUE O CASO, a mesma regra de `casos/[id]/documentos`: com a
     triagem concluída, o arquivo nasce direto na ficha do tomador, senão ficaria
     pendurado num caso que ninguém abre mais. */
  const jaNoTomador = caso.etapa === 'analise' && !!caso.tomador_id
  const entidade = jaNoTomador
    ? { tipo: 'tomador', id: caso.tomador_id as string }
    : { tipo: 'caso', id: caso.id as string }

  const { data: fila } = await supabase
    .from('analise_fila').select('id, situacao').eq('caso_id', caso.id).maybeSingle()
  const analiseConcluida = fila?.situacao === 'concluida'

  const assunto = limparNome(email.assunto) || nomeArquivo.replace(/\.(msg|eml)$/i, '')
  const quando = dataDoEmail(email.data)
  const rotuloData = quando
    ? new Date(quando).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'sem data'
  const falhas: string[] = []

  /* Guarda um arquivo e o registra. Devolve o id da leitura da triagem, ou
     nada (e a falha já anotada). Arquivo sem linha no banco é órfão: desfaz. */
  const guardar = async (nome: string, dados: Buffer, detalhe: string) => {
    const mime = mimePorNome(nome)
    const caminho = `${entidade.tipo}/${entidade.id}/${Date.now()}_${nomeSeguro(nome)}`
    const { error: erroUp } = await supabase.storage
      .from(BUCKET).upload(caminho, dados, { upsert: false, contentType: mime })
    if (erroUp) { falhas.push(`${nome} (${erroUp.message})`); return null }

    const { data: anexo, error: erroAnexo } = await supabase
      .from('anexos')
      .insert({
        entidade_tipo: entidade.tipo,
        entidade_id: entidade.id,
        tomador_id: jaNoTomador ? caso.tomador_id : null,
        nome_original: nome,
        storage_path: caminho,
        tipo_mime: mime,
        tamanho_bytes: dados.length,
        categoria: 'outro',
      })
      .select('id')
      .single()
    if (erroAnexo || !anexo) {
      await supabase.storage.from(BUCKET).remove([caminho])
      falhas.push(`${nome} (${erroAnexo?.message ?? 'sem permissão de escrita'})`)
      return null
    }

    const { data: leitura, error: erroLeitura } = await supabase
      .from('caso_documentos')
      .insert({ caso_id: caso.id, anexo_id: anexo.id, nome, bytes: dados.length, detalhe })
      .select('id')
      .single()
    if (erroLeitura || !leitura) {
      falhas.push(`${nome} (guardado, mas não entrou na triagem: ${erroLeitura?.message ?? 'sem permissão'})`)
      return { caminho, leitura: null }
    }
    return { caminho, leitura: leitura.id as string }
  }

  /* O PRÓPRIO E-MAIL VAI JUNTO, como documento. É o que faz ele ser LIDO: a
     pasta recebe o arquivo, e a triagem e o Agente de Cadastro leem e-mail. O
     nome carrega a data para o analista distinguir a matriz dos filhos. */
  const nomeDoEmail = `E-mail de ${rotuloData.replace(/\//g, '-')} · ${assunto}`.slice(0, 110) +
    (nomeArquivo.toLowerCase().endsWith('.eml') ? '.eml' : '.msg')
  const doEmail = await guardar(nomeDoEmail, entrada.bruto, `E-mail juntado ao caso por ${entrada.autor.nome ?? 'alguém'}.`)
  if (!doEmail) {
    return { ok: false, ...vazio, caso: alvoCaso, falhas, erro: `Não consegui guardar o e-mail: ${falhas.join(' · ')}` }
  }

  const documentos = anexosUteis(email)
  const nomesGuardados: string[] = []
  for (const doc of documentos) {
    const r = await guardar(doc.nome, doc.dados, `Veio no e-mail de ${rotuloData}.`)
    if (r?.leitura) nomesGuardados.push(doc.nome)
  }

  /* O CHECKLIST, lido pelo nome dos anexos novos. Só sobe para 'ok' o que o
     ROBÔ tinha marcado; o que uma pessoa decidiu (inclusive "dispensado") fica. */
  const resolveu: string[] = []
  if (nomesGuardados.length) {
    const { data: catalogo } = await supabase
      .from('caso_item_catalogo')
      .select('id, nome, exigencia, frase_falta, ordem, padroes_nome')
      .eq('ativo', true)
    const leitura = lerChecklistPorNome(nomesGuardados, (catalogo ?? []) as ItemCatalogo[])
    if (leitura.tem.length) {
      const { data: mexidos } = await supabase
        .from('caso_itens')
        .update({
          situacao: 'ok',
          detalhe: `Reconhecido pelo nome do anexo do e-mail de ${rotuloData}.`,
          decidido_em: new Date().toISOString(),
        })
        .eq('caso_id', caso.id)
        .eq('por', 'robo')
        .in('item', leitura.tem.map((i) => i.id))
        .in('situacao', ['faltando', 'a_caminho', 'duvida'])
        .select('item')
      const mexidosIds = new Set((mexidos ?? []).map((m) => m.item as string))
      resolveu.push(...leitura.tem.filter((i) => mexidosIds.has(i.id)).map((i) => i.nome))
    }
  }

  /* A CAIXA APRENDE QUE ESTE É UM FILHO. `serve = true` porque virou trabalho
     da esteira: a RLS mostra a quem trabalha no caso, e não só ao dono da caixa. */
  const agora = new Date().toISOString()
  const filho = {
    caso_id: caso.id,
    juntar_ao_caso: null,
    juntado_em: agora,
    juntado_por: entrada.autor.nome,
    storage_path: doEmail.caminho,
    estado: 'trazido',
    estado_em: agora,
    estado_por: entrada.autor.nome,
    estado_erro: null,
    serve: true,
  }
  if (linhaCaixa) {
    const { error } = await supabase.from('emails_caixa').update(filho).eq('id', linhaCaixa)
    if (error) falhas.push(`o registro na caixa (${error.message})`)
  } else {
    const { error } = await supabase.from('emails_caixa').insert({
      ...linhaDeCaixaDoUpload(email, entrada.bruto, assunto, documentos.length),
      ...(entrada.origem === 'graph' ? { origem: 'graph' } : {}),
      motivo: 'Juntado a um caso que já existia.',
      ...filho,
    })
    if (error) falhas.push(`o registro na caixa (${error.message})`)
  }

  /* A ESTEIRA BAIXA O QUE CHEGOU e refaz a triagem sozinha. Numa análise já
     concluída a pasta não se remonta (a esteira recusa, de propósito): o
     documento fica no tomador e a tela oferece a Análise complementar. */
  if (fila && !analiseConcluida) {
    await supabase.from('analise_fila').update({ anexos_em: agora }).eq('id', fila.id)
  }

  return {
    ok: true,
    caso: alvoCaso,
    documentos: nomesGuardados.length,
    ignorados: email.anexos.length - documentos.length,
    falhas,
    resolveu,
    no_tomador: jaNoTomador,
    analise_concluida: analiseConcluida,
    tomador_id: (caso.tomador_id as string | null) ?? null,
  }
}
