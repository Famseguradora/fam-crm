/* LEMBRETES: o vocabulário e as contas. Fonte única da tela e da rota.

   30/09/2026. As categorias vieram da pesquisa do mesmo dia: o que uma
   seguradora de garantia acompanha por tomador (vigência, certidões, balanço,
   limite) mais o que o dia a dia pede (reunião, ligação, visita). A lista é
   aberta: a coluna no banco é texto, e categoria nova entra só aqui. */

export const CATEGORIAS = [
  { id: 'documento', nome: 'Documento faltante' },
  // Aberta pelo robô a partir da "Condição para liberação do crédito" (01/10/2026).
  { id: 'ressalva', nome: 'Ressalva da análise de crédito' },
  { id: 'demonstrativo', nome: 'Cobrar demonstrativo' },
  { id: 'vigencia', nome: 'Fim de vigência / renovação' },
  { id: 'certidao', nome: 'Certidão (CND, CNDT, FGTS)' },
  { id: 'serasa', nome: 'Serasa' },
  { id: 'limite', nome: 'Limite ou rating' },
  { id: 'contragarantia', nome: 'Contragarantia (CCG)' },
  { id: 'obra', nome: 'Prazo de obra ou contrato' },
  { id: 'sinistro', nome: 'Sinistro ou expectativa' },
  { id: 'premio', nome: 'Prêmio e parcelas' },
  { id: 'reuniao', nome: 'Reunião' },
  { id: 'ligacao', nome: 'Ligação' },
  { id: 'visita', nome: 'Visita ao tomador' },
  { id: 'outro', nome: 'Outro' },
] as const

export const nomeCategoria = (id: string) => CATEGORIAS.find((c) => c.id === id)?.nome ?? 'Outro'

export const STATUS: Record<string, { nome: string; tom: 'aberto' | 'parcial' | 'ok' | 'neutro' }> = {
  aberto: { nome: 'Aberto', tom: 'aberto' },
  parcial: { nome: 'Resolvido parcial', tom: 'parcial' },
  resolvido: { nome: 'Resolvido', tom: 'ok' },
  cancelado: { nome: 'Cancelado', tom: 'neutro' },
}

export const RECORRENCIAS = [
  { id: '', nome: 'Não repete' },
  { id: 'semanal', nome: 'Toda semana' },
  { id: 'mensal', nome: 'Todo mês' },
  { id: 'trimestral', nome: 'A cada 3 meses' },
  { id: 'semestral', nome: 'A cada 6 meses' },
  { id: 'anual', nome: 'Todo ano' },
] as const

export interface ItemLembrete { nome: string; ok: boolean; em: string | null; /** quem marcou: 'robo' ou o nome da pessoa */ por?: string }

/* A PRÓXIMA VEZ de um lembrete que repete é contada no banco
   (`lembrete_repetir`), no calendário de São Paulo: ver
   supabase-migration-lembretes-travas.sql. */

/** Status que a lista de itens implica: nada ok = aberto, parte = parcial, tudo = resolvido. */
export function statusDosItens(itens: ItemLembrete[]): 'aberto' | 'parcial' | 'resolvido' | null {
  if (!itens.length) return null
  const ok = itens.filter((i) => i.ok).length
  return ok === 0 ? 'aberto' : ok === itens.length ? 'resolvido' : 'parcial'
}

/* "Venceu", "hoje às 14h", "amanhã", "em 5 dias": o que a pessoa lê na lista.
   Sempre no fuso de São Paulo, seja onde o servidor estiver. */
export function quandoLegivel(iso: string, agora = new Date()): { txt: string; vencido: boolean } {
  const d = new Date(iso)
  const fuso = 'America/Sao_Paulo'
  const dia = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: fuso })
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit' })
  const vencido = d.getTime() < agora.getTime()
  const dd = Math.round((Date.parse(dia(d)) - Date.parse(dia(agora))) / 86400000)
  if (dd === 0) return { txt: `hoje às ${hora}`, vencido }
  if (dd === 1) return { txt: `amanhã às ${hora}`, vencido }
  if (dd === -1) return { txt: `ontem às ${hora}`, vencido }
  if (dd > 1 && dd <= 7) return { txt: `em ${dd} dias`, vencido }
  if (dd < -1 && dd >= -30) return { txt: `há ${-dd} dias`, vencido }
  return { txt: d.toLocaleDateString('pt-BR', { timeZone: fuso }), vencido }
}
