/* O CHECKLIST DA POLÍTICA, LIDO PELO NOME DOS ANEXOS.

   UMA LISTA SÓ, e essa é a razão deste arquivo existir. No sistema que vai ser
   descartado havia duas: `caso_item_catalogo` no banco dizia O QUE a FAM exige,
   e a constante DOCS dentro do cockpit dizia o que a caixa de entrada mostrava.
   Eram listas diferentes (6 contra 4), então a Caixa cobrava "Relação de obras"
   e a Triagem cobrava "Demonstrativo do ano corrente". Aqui o catálogo é a
   única fonte: ele carrega o nome, a exigência e os pedaços de texto que o
   reconhecem num anexo (`padroes_nome`).

   O QUE ESTE MÓDULO NÃO FAZ: abrir arquivo. Ele olha só o NOME, porque na
   Caixa de entrada o arquivo ainda está na máquina de quem recebeu o e-mail.
   Por isso a resposta é sempre um palpite declarado, nunca uma conclusão. Quem
   lê o conteúdo é a triagem, depois, e o que a pessoa marcar vence o palpite. */

/** Uma linha de `caso_item_catalogo`. */
export interface ItemCatalogo {
  id: string
  nome: string
  exigencia: 'bloqueia' | 'sinaliza'
  frase_falta: string | null
  ordem: number
  padroes_nome: string[]
}

/* Minúsculo, sem acento e com os separadores virando espaço. O NFD antes de
   tirar o acento não é preciosismo: anexo real chegou como "Balanço 2025.pdf"
   com a cedilha em acento COMBINANTE, separada do "c", e "balanco" não casava
   com nada. É o mesmo cuidado que o `limparNome` já toma na entrada. */
export const normalizarNomeArquivo = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

export interface LeituraChecklist {
  /** Itens do catálogo reconhecidos em algum anexo. */
  tem: ItemCatalogo[]
  /** Itens que nenhum anexo reconheceu. É o que vai no "Pedir o que falta". */
  faltam: ItemCatalogo[]
  /** Só os que travam a esteira e não vieram. */
  faltam_bloqueando: ItemCatalogo[]
}

/**
 * Casa os nomes dos anexos contra o catálogo.
 *
 * Item sem `padroes_nome` NUNCA é dado como recebido por esta função: sem
 * padrão não há como reconhecer, e marcar "ok" no escuro é pior do que marcar
 * "faltando" numa coisa que veio. Faltando alguém corrige em um clique; um "ok"
 * errado ninguém revisa.
 */
export function lerChecklistPorNome(
  nomesDeAnexos: string[],
  catalogo: ItemCatalogo[],
): LeituraChecklist {
  const alvo = nomesDeAnexos.map(normalizarNomeArquivo).join(' | ')
  const tem: ItemCatalogo[] = []
  const faltam: ItemCatalogo[] = []

  for (const item of [...catalogo].sort((a, b) => a.ordem - b.ordem)) {
    const padroes = (item.padroes_nome ?? []).map(normalizarNomeArquivo).filter(Boolean)
    const achou = padroes.length > 0 && padroes.some((p) => alvo.includes(p))
    ;(achou ? tem : faltam).push(item)
  }

  return {
    tem,
    faltam,
    faltam_bloqueando: faltam.filter((i) => i.exigencia === 'bloqueia'),
  }
}

/**
 * A lista de nomes que vai no e-mail para a corretora. Só o nome do documento,
 * porque é isso que quem recebe entende: "demonstracoes_2_exercicios" é chave
 * de banco, e chave de banco não vai para fora da empresa.
 */
export const nomesQueFaltam = (leitura: LeituraChecklist) => leitura.faltam.map((i) => i.nome)
