/* A IMPRESSÃO DIGITAL DE UMA LINHA SINCRONIZADA
   ═══════════════════════════════════════════════════════════════════════════

   Existe para o CRM parar de reescrever no banco o que já está lá igual.

   O MOTIVO, medido em 17/09/2026 no banco de produção: a esteira manda o mural
   e as conversas inteiros a cada 10 segundos, e o CRM gravava tudo de novo.
   `ia_mensagens` tinha 179 linhas e 495.782 UPDATEs; `analise_recados`, 197
   linhas e 490.492. Como as duas tabelas são publicadas no Realtime, cada
   reescrita virava um evento a decodificar: 3,2 milhões de chamadas e 5h31 de
   CPU do banco, 90% de todo o processamento, para avisar telas sobre coisa que
   não mudou.

   POR QUE UM RESUMO, E NÃO COMPARAR OS CAMPOS: comparar exigiria trazer o
   conteúdo inteiro de volta a cada rodada (recado tem até 20 mil caracteres;
   fala da IA, até 200 mil). Seria trocar escrita por leitura. O resumo tem 16
   caracteres, vem junto do `id` numa consulta só, e diz com precisão se algo
   mudou.

   SHA-1 E NÃO CRIPTOGRAFIA: aqui não há segredo nenhum a proteger. A pergunta
   é "este conteúdo é o mesmo de antes?", e para isso o SHA-1 basta e é rápido.

   DEGRADA, NÃO QUEBRA: linha sem resumo guardado (a primeira rodada depois da
   migration, ou uma coluna que suma) conta como "mudou" e é gravada. O pior
   caso é o comportamento antigo. */

import { createHash } from 'node:crypto'

/** 16 caracteres do SHA-1 do conteúdo. Colisão aqui é irrelevante: o pior
 *  efeito possível seria deixar de reescrever uma linha idêntica. */
export function hashDe(valor: unknown): string {
  return createHash('sha1').update(JSON.stringify(valor ?? null)).digest('hex').slice(0, 16)
}

/* Separa o que precisa ir para o banco do que já está igual lá.

   `linhas`     o que o motor mandou, cada uma com `id`
   `guardados`  o `id` e o `hash_sync` que já estão no banco
   `campos`     o que entra na conta do resumo. `sincronizado_em` fica FORA de
                propósito: ele muda toda rodada, e se entrasse aqui toda linha
                seria "diferente" e a economia inteira sumiria (foi exatamente
                a armadilha que o Carteiro já tinha encontrado com `visto_em`). */
export function apenasMudadas<T extends { id: string }>(
  linhas: T[],
  guardados: { id: string; hash_sync: string | null }[],
  campos: (keyof T)[],
): (T & { hash_sync: string })[] {
  const antes = new Map(guardados.map((g) => [g.id, g.hash_sync]))
  const saida: (T & { hash_sync: string })[] = []
  for (const linha of linhas) {
    const conteudo = campos.map((c) => linha[c] ?? null)
    const hash = hashDe(conteudo)
    if (antes.get(linha.id) === hash) continue
    saida.push({ ...linha, hash_sync: hash })
  }
  return saida
}
