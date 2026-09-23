// ============================================================================
//  OS DOCUMENTOS DE UMA ANÁLISE QUE MORAM NO STORAGE DO CRM
//
//  Fonte única. Duas rotas perguntam a mesma coisa e tinham que responder a
//  mesma lista, senão o agente do notebook baixaria um conjunto de documentos e
//  a equipe leria outro — numa mesa de crédito, o pior defeito possível é duas
//  pessoas decidindo sobre papéis diferentes achando que são os mesmos:
//
//    · /api/esteira/documentos ... o agente do notebook, com service role, para
//                                  materializar a pasta no disco onde o motor lê.
//    · /api/analise/documentos .... a equipe, com a sessão de quem está olhando,
//                                  para ABRIR o documento no navegador.
//
//  Por isso a função recebe o cliente pronto, e não o cria: quem chama decide
//  com que identidade está falando com o banco. É o mesmo desenho do resto do
//  CRM, e é o que mantém a RLS valendo para a equipe e não atrapalhando o agente.
//
//  O QUE ESTA FUNÇÃO NÃO ALCANÇA, e a tela precisa dizer com todas as letras:
//  os documentos das análises ANTIGAS não estão aqui. `analise_documentos` é
//  índice — o comentário da própria tabela diz "o arquivo fica no disco" —, e
//  disco é a máquina do Marco. O que esta função devolve é o que entrou pela
//  triagem do CRM e foi parar no bucket `fam-anexos`.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'

export const BUCKET_ANEXOS = 'fam-anexos'

/** Quinze minutos para o agente baixar 30 MB; cinco para a pessoa clicar e
 *  abrir. Endereço assinado é porta aberta para o arquivo, e porta aberta tem
 *  que fechar — a diferença é só quanto tempo cada um precisa dela. */
export const VALE_AGENTE = 15 * 60
export const VALE_PESSOA = 5 * 60

export interface DocumentoDaAnalise {
  nome: string
  url: string
  bytes: number | null
}

export interface DocumentosDaAnalise {
  documentos: DocumentoDaAnalise[]
  /** O que existe como registro e não virou endereço. Some na tela, não no log. */
  falhas: string[]
}

/**
 * Junta os documentos de uma pasta da esteira que estão no Storage do CRM e
 * devolve um endereço assinado para cada um.
 *
 * @param sb      cliente já criado — service role para o agente, sessão do
 *                usuário para a equipe (e aí a RLS de `anexos` vale).
 * @param fila    a linha de `analise_fila`, com as duas pontas onde o documento
 *                pode estar penduradas.
 * @param segundos quanto tempo o endereço assinado vale.
 */
export async function documentosDaAnalise(
  sb: SupabaseClient,
  fila: { caso_id?: string | null; tomador_id?: string | null },
  segundos: number,
): Promise<DocumentosDaAnalise> {
  /* OS DOCUMENTOS PODEM ESTAR EM DOIS LUGARES, e é preciso olhar os dois.
     Enquanto a triagem não conclui, eles estão pendurados no CASO. Ao concluir,
     a rota `concluir` os passa para o TOMADOR, para o CRM não ter duas pilhas
     de documento da mesma empresa. Uma análise nascida da triagem já passou por
     essa mudança, então procurar só pelo caso devolveria zero arquivo. */
  const alvos: { tipo: string; id: string }[] = []
  if (fila.tomador_id) alvos.push({ tipo: 'tomador', id: fila.tomador_id })
  if (fila.caso_id) alvos.push({ tipo: 'caso', id: fila.caso_id })

  const vistos = new Set<string>()
  const documentos: DocumentoDaAnalise[] = []
  const falhas: string[] = []

  for (const alvo of alvos) {
    const { data: anexos } = await sb
      .from('anexos')
      .select('id, nome_original, storage_path, tamanho_bytes')
      .eq('entidade_tipo', alvo.tipo)
      .eq('entidade_id', alvo.id)

    for (const a of (anexos ?? []) as { nome_original: string; storage_path: string | null; tamanho_bytes: number | null }[]) {
      // O mesmo arquivo pode aparecer pelas duas pontas; contá-lo duas vezes
      // criaria documento repetido na pasta, e o hash do conjunto mudaria à toa.
      if (!a.storage_path || vistos.has(a.storage_path)) continue
      vistos.add(a.storage_path)

      const { data: assinado, error } = await sb.storage
        .from(BUCKET_ANEXOS).createSignedUrl(a.storage_path, segundos)
      if (error || !assinado?.signedUrl) {
        falhas.push(`${a.nome_original} (${error?.message ?? 'sem endereço'})`)
        continue
      }
      documentos.push({
        nome: a.nome_original,
        url: assinado.signedUrl,
        bytes: a.tamanho_bytes ?? null,
      })
    }
  }

  /* O PRÓPRIO E-MAIL É DOCUMENTO (10/09/2026). Ordem do Marco: a triagem "vai
     LER O E-MAIL". O .msg fica só em `casos.email_storage_path`, sem linha em
     `anexos`, e sem ele a corretora, o produto e as condições que o comercial
     escreveu nunca chegam a quem lê depois. */
  if (fila.caso_id) {
    const { data: caso } = await sb
      .from('casos').select('numero, email_storage_path').eq('id', fila.caso_id).maybeSingle()
    const caminho = (caso as { numero?: string; email_storage_path?: string | null } | null)?.email_storage_path
    if (caminho && !vistos.has(caminho)) {
      vistos.add(caminho)
      const { data: assinado } = await sb.storage.from(BUCKET_ANEXOS).createSignedUrl(caminho, segundos)
      if (assinado?.signedUrl) {
        const ext = caminho.toLowerCase().endsWith('.eml') ? '.eml' : '.msg'
        documentos.push({
          nome: `E-mail original do caso ${(caso as { numero?: string })?.numero ?? ''}${ext}`,
          url: assinado.signedUrl,
          bytes: null,
        })
      } else {
        falhas.push('o próprio e-mail (sem endereço assinado)')
      }
    }
  }

  return { documentos, falhas }
}
