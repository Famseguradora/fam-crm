// ============================================================================
//  O ROBÔ  ·  a IA que responde sem API, e sem custo nenhum
//
//  Ordem dele em 09/09/2026: "quando estiver com API desligada, deixa somente
//  o Robô, um robô que vai aguçar a curiosidade dos Diretores".
//
//  A ESCOLHA QUE FAZ ESTA PEÇA EXISTIR: sem API não há quem interprete uma
//  pergunta escrita à mão. Tentar adivinhar por palavra-chave erraria na frente
//  de diretor. Então o robô não tem caixa de texto: ele tem um cardápio fixo de
//  perguntas, cada uma com a conta escrita aqui, em TypeScript, auditável linha
//  a linha. O painel abre com as respostas já na tela. O diretor não pergunta,
//  ele vê e clica.
//
//  QUEM CALCULA É O NODE, A IA SÓ NARRA. Vale nos dois modos. Com a API ligada
//  estes mesmos cartões continuam existindo (instantâneos e de graça), e a IA
//  entra para o que o robô não sabe fazer: pergunta livre e relatório sob
//  medida. Número que diretor lê nunca sai de dentro do modelo.
//
//  GOVERNANÇA: o cliente Supabase vem de fora, e é sempre o DA SESSÃO. Este
//  arquivo não conhece a service role. O robô lê exatamente o que a pessoa
//  leria abrindo a tela na mão, porque é a RLS que responde, não este código.
//
//  A ORIGEM APARECE SEMPRE, como nos blocos da IA: gráfico sem origem é
//  gráfico que ninguém pode conferir, e este CRM já teve número assim.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BlocoIA } from './servidor'
import { anosVig } from '@/lib/comite/calculo'
import { lmgFam, mundoDa } from './regras-operacao'

/* ══════════════════════════════════════════════════════════════════════════
   O QUE UM CARTÃO É

   `numero` é a manchete: o valor grande, já formatado, que aparece sem clicar.
   `sub` é a frase que dá o contexto dele. `blocos` é o detalhe, que só desenha
   quando a pessoa abre o cartão: todas as tabelas abertas de uma vez seria uma
   parede, e parede ninguém lê.

   `pergunta` é a ponte para o outro modo: com a API ligada, o mesmo cartão
   ganha um "aprofundar", que manda ESTA frase para a IA. O robô dá o número, a
   IA discute o número.
   ══════════════════════════════════════════════════════════════════════════ */
export interface CartaoRobo {
  id: string
  area: 'tomadores' | 'operacoes'
  titulo: string
  numero: string
  sub: string
  /** Vermelho na tela. Reservado para o que precisa de decisão, não para o que
   *  é só grande: alarme que toca sempre vira paisagem. */
  alerta?: boolean
  blocos: BlocoIA[]
  pergunta: string
}

/* ── as formas do banco, só o que o robô usa ────────────────────────────── */
interface LinhaTomador {
  id: string
  razao_social: string | null
  corretora_id: string | null
  limite_aprovado: number | null
  status: string | null
}
interface LinhaOperacao {
  id: string
  tomador_id: string | null
  corretora_id: string | null
  modalidade: string | null
  lmg: number | null
  taxa: number | null
  premio_previsto: number | null
  status: string | null
  prioridade: string | null
  temperatura: string | null
  data_entrada: string | null
  voto_subscricao: string | null
  /* Só existem aqui para a taxa ponderada. A tela de Operações pondera pela
     vigência (`anosVig`), e sem estas três o robô daria outra taxa que a tela. */
  vigencia_anos: number | null
  vigencia_dias: number | null
  periodicidade_vigencia: string | null
}
interface LinhaCorretora {
  id: string
  razao_social: string | null
  nome_fantasia: string | null
}

export interface AcervoRobo {
  tomadores: LinhaTomador[]
  operacoes: LinhaOperacao[]
  corretoras: LinhaCorretora[]
}

/* ══════════════════════════════════════════════════════════════════════════
   FORMATO

   Tudo em português do Brasil e tudo curto. Um número de dez dígitos na
   manchete de um cartão estreito não é informação, é ruído.
   ══════════════════════════════════════════════════════════════════════════ */
const n0 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 16.130.073.287 vira "R$ 16,1 bi". A manchete quer a ordem de grandeza; o
 *  valor exato está na tabela de dentro, que é onde alguém confere. */
export function curto(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e9) return 'R$ ' + (v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' bi'
  if (a >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'
  if (a >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'
  return 'R$ ' + n2(v)
}

const num = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/* ══════════════════════════════════════════════════════════════════════════
   AS DUAS REGRAS QUE VÊM DA TELA DE OPERAÇÕES

   Ordem dele em 09/09/2026: "para não ter erro, copie da forma que está na tela
   de operações". Estas duas regras estavam lá e não estavam aqui, e sem elas o
   robô dava número diferente do que o CRM mostra na mesma pergunta. Robô que
   discorda da tela é pior que robô nenhum.

   1) O LMG É CAPADO EM 80 MILHÕES. É o limite que a FAM carrega por operação:
      acima disso o excedente não é dela. A tela de Operações capa em todo
      lugar (`Math.min(op.lmg, 80_000_000)`), inclusive na taxa ponderada e no
      consumo de limite do tomador.

   2) AS OPERAÇÕES VIVEM EM TRÊS MUNDOS, e somar os três dá um número que não
      significa nada:
        · EMITIDO           é o realizado, e a tela chama de "fora do funil"
        · PERDIDO/RECUSADO  é o que morreu, e não volta
        · o FUNIL           é todo o resto, e é o único que ainda pode entrar
      O funil é definido por EXCLUSÃO, como na tela: etapa nova entra nele
      sozinha, sem ninguém precisar lembrar de mexer neste arquivo.
   ══════════════════════════════════════════════════════════════════════════ */
/* O cap do LMG (`lmgFam`) e os três mundos (`mundoDa`) moram em
   lib/ia/regras-operacao.ts desde 10/09/2026, quando a IA pela API passou a
   somar operação também. Todo lugar deste arquivo usa `lmgFam`, nunca `o.lmg`. */
const eEmitida = (o: { status: string | null }) => mundoDa(o.status) === 'emitida'
const eEncerrada = (o: { status: string | null }) => mundoDa(o.status) === 'encerrada'
const noFunil = (o: { status: string | null }) => mundoDa(o.status) === 'funil'

/** Nome de corretora cabe em 28 caracteres no eixo de um gráfico. Mais que
 *  isso empurra o desenho para fora da moldura. */
const apara = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Soma agrupada por uma chave de texto, que é a conta que quase todo cartão
 *  faz. Sai ordenado do maior para o menor, porque em cima é onde se olha. */
function agrupar<T>(linhas: T[], chave: (l: T) => string, valor: (l: T) => number) {
  const m = new Map<string, number>()
  for (const l of linhas) {
    const k = chave(l)
    m.set(k, (m.get(k) ?? 0) + valor(l))
  }
  return [...m.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total)
}

/** Conta agrupada (quantas, não quanto). */
function contar<T>(linhas: T[], chave: (l: T) => string) {
  return agrupar(linhas, chave, () => 1)
}

const dias = (iso: string | null): number | null => {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

/* ══════════════════════════════════════════════════════════════════════════
   A LEITURA

   Uma ida ao banco por abertura do painel, não uma por cartão. Doze consultas
   separadas para desenhar uma tela seria uma viagem por cartão, e a tela abriria
   piscando. As tabelas são pequenas (centenas de linhas), então elas vêm
   inteiras e as contas todas acontecem em memória.

   `limit` alto e explícito: o padrão do PostgREST é 1000, e uma tabela que
   cresça além disso passaria a mentir em silêncio. Se um dia estourar, o
   número certo é paginar aqui, e não subir este teto para sempre.
   ══════════════════════════════════════════════════════════════════════════ */
export async function lerAcervo(supabase: SupabaseClient): Promise<AcervoRobo> {
  const [t, o, c] = await Promise.all([
    supabase.from('tomadores')
      .select('id, razao_social, corretora_id, limite_aprovado, status').limit(5000),
    supabase.from('operacoes')
      .select('id, tomador_id, corretora_id, modalidade, lmg, taxa, premio_previsto, status, prioridade, temperatura, data_entrada, voto_subscricao, vigencia_anos, vigencia_dias, periodicidade_vigencia')
      .limit(5000),
    supabase.from('corretoras').select('id, razao_social, nome_fantasia').limit(5000),
  ])
  return {
    tomadores: (t.data ?? []) as LinhaTomador[],
    operacoes: (o.data ?? []) as LinhaOperacao[],
    corretoras: (c.data ?? []) as LinhaCorretora[],
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   OS CARTÕES

   A ordem é a que ele fechou em 09/09/2026: dois de tomadores, dez de
   operações. Cartão que não tem dado NÃO é escondido: ele aparece dizendo que
   não tem dado. Sumir com o cartão faria o diretor achar que a pergunta não
   existe, quando a verdade é que o campo está vazio no banco, e isso é
   informação.
   ══════════════════════════════════════════════════════════════════════════ */
export function montarCartoes(a: AcervoRobo): CartaoRobo[] {
  const { tomadores, operacoes, corretoras } = a

  /* De id para nome, uma vez só. Sem isto cada cartão faria um find() dentro de
     um laço, que é o jeito de transformar 300 linhas em 30 mil comparações. */
  const nomeCorretora = new Map<string, string>()
  for (const c of corretoras) {
    nomeCorretora.set(c.id, (c.razao_social || c.nome_fantasia || 'Sem nome').trim())
  }
  const daCorretora = (id: string | null) =>
    (id && nomeCorretora.get(id)) || 'Sem corretora'

  const nomeTomador = new Map<string, string>()
  for (const t of tomadores) nomeTomador.set(t.id, (t.razao_social || 'Sem nome').trim())

  /* NÃO existe mais um "total" das 298 operações neste arquivo, e é de
     propósito: somar os três mundos junto foi exatamente o erro que ele pegou
     em 09/09/2026. Cada cartão diz de qual mundo está falando. */

  const cartoes: CartaoRobo[] = []

  /* ── 1. Concentração por corretora ────────────────────────────────────────
     A pergunta do risco comercial: se as três maiores saírem, quanto sai
     junto. A conta é sobre o LIMITE APROVADO do tomador, não sobre o prêmio:
     limite é o que a FAM se comprometeu a bancar. */
  {
    const porCorretora = agrupar(
      tomadores.filter((t) => num(t.limite_aprovado) > 0),
      (t) => daCorretora(t.corretora_id),
      (t) => num(t.limite_aprovado),
    )
    const total = porCorretora.reduce((s, x) => s + x.total, 0)
    const tres = porCorretora.slice(0, 3).reduce((s, x) => s + x.total, 0)
    const pct = total > 0 ? (tres / total) * 100 : 0

    /* Seis fatias e uma de "as outras". Pizza com noventa e nove fatias é um
       disco colorido, não um gráfico. */
    const seis = porCorretora.slice(0, 6)
    const resto = porCorretora.slice(6).reduce((s, x) => s + x.total, 0)
    const fatias = [
      ...seis.map((x) => ({ corretora: apara(x.nome, 22), limite: Math.round(x.total) })),
      ...(resto > 0 ? [{ corretora: `outras ${porCorretora.length - 6}`, limite: Math.round(resto) }] : []),
    ]

    cartoes.push({
      id: 'concentracao-corretora',
      area: 'tomadores',
      titulo: 'Concentração por corretora',
      numero: pct.toFixed(1).replace('.', ',') + '%',
      sub: `do limite aprovado está nas 3 maiores de ${porCorretora.length} corretoras · ${curto(total)} no total`,
      alerta: pct >= 50,
      pergunta: 'Analise a concentração do limite aprovado por corretora. As três maiores respondem por quanto, e o que isso significa para o risco comercial da FAM?',
      blocos: [
        {
          tipo: 'grafico', formato: 'pizza',
          titulo: 'Limite aprovado por corretora',
          dados: {
            eixo: 'corretora',
            series: [{ campo: 'limite', rotulo: 'Limite aprovado' }],
            dados: fatias,
          },
          origem: 'tomadores.limite_aprovado agrupado por corretora_id',
        },
        {
          tipo: 'tabela',
          titulo: 'As dez maiores',
          dados: {
            colunas: ['Corretora', 'Limite aprovado', '% do total'],
            linhas: porCorretora.slice(0, 10).map((x) => [
              x.nome,
              curto(x.total),
              total > 0 ? (x.total / total * 100).toFixed(1).replace('.', ',') + '%' : '—',
            ]),
          },
          origem: 'tomadores.limite_aprovado agrupado por corretora_id',
        },
      ],
    })
  }

  /* ── 2. Tomadores perto de estourar o limite ──────────────────────────────
     A regra é a que ele fixou: o que consome limite é o LMG EMITIDO, e só ele.
     Operação aprovada ainda pode não virar apólice; operação recusada nunca
     vai. Contar as outras faria o alarme tocar por operação que não existe. */
  {
    const emitidoPorTomador = new Map<string, number>()
    for (const o of operacoes) {
      if (o.status !== 'Emitido' || !o.tomador_id) continue
      emitidoPorTomador.set(o.tomador_id, (emitidoPorTomador.get(o.tomador_id) ?? 0) + lmgFam(o))
    }

    const usos = tomadores
      .filter((t) => num(t.limite_aprovado) > 0)
      .map((t) => {
        const usado = emitidoPorTomador.get(t.id) ?? 0
        return {
          nome: t.razao_social || 'Sem nome',
          limite: num(t.limite_aprovado),
          usado,
          pct: (usado / num(t.limite_aprovado)) * 100,
        }
      })
      .filter((x) => x.usado > 0)
      .sort((a2, b2) => b2.pct - a2.pct)

    const apertados = usos.filter((x) => x.pct >= 90)
    const estourados = usos.filter((x) => x.pct > 100)

    cartoes.push({
      id: 'limite-estourado',
      area: 'tomadores',
      titulo: 'Tomadores no limite',
      numero: n0(apertados.length),
      sub: apertados.length
        ? `acima de 90% do limite aprovado${estourados.length ? `, e ${estourados.length} já passou${estourados.length === 1 ? '' : 'ram'} de 100%` : ''}`
        : `nenhum acima de 90% · ${usos.length} tomador(es) com LMG emitido`,
      alerta: estourados.length > 0,
      pergunta: 'Que tomadores estão com o LMG emitido perto de estourar o limite aprovado? Liste os casos e diga o que fazer com cada um.',
      blocos: usos.length ? [{
        tipo: 'tabela',
        titulo: 'Limite aprovado contra LMG emitido',
        dados: {
          colunas: ['Tomador', 'Limite aprovado', 'LMG emitido', '% usado'],
          linhas: usos.slice(0, 20).map((x) => [
            x.nome, curto(x.limite), curto(x.usado),
            x.pct.toFixed(1).replace('.', ',') + '%',
          ]),
        },
        origem: 'soma de operacoes.lmg em status Emitido, contra tomadores.limite_aprovado',
      }] : [],
    })
  }

  /* ── 3. Prêmio EMITIDO ────────────────────────────────────────────────────
     O que a FAM realizou. É o número que a tela de Operações mostra grande, em
     verde, no cartão "Emitidas", e ele não soma nem funil nem perdida.

     Este cartão nasceu de um erro meu que ele pegou: o robô mostrava "Prêmio
     previsto total, R$ 100,3 mi em 298 operações", somando Recusadas e
     Perdidas junto. Parecia produção que ainda podia entrar, e era em boa parte
     negócio morto. Um número desses numa tela de diretoria não é impreciso, é
     mentiroso. */
  const emitidas = operacoes.filter(eEmitida)
  const encerradas = operacoes.filter(eEncerrada)
  const funil = operacoes.filter(noFunil)

  const somaPremio = (ls: LinhaOperacao[]) => ls.reduce((s, o) => s + num(o.premio_previsto), 0)
  const somaLmg = (ls: LinhaOperacao[]) => ls.reduce((s, o) => s + lmgFam(o), 0)

  const premioEmitido = somaPremio(emitidas)
  const premioFunil = somaPremio(funil)
  const premioEncerrado = somaPremio(encerradas)

  /* A tabela dos três mundos, lado a lado. Ela aparece dentro dos DOIS cartões
     de prêmio de propósito: é exatamente ela que impede alguém de somar de novo
     o que não se soma. */
  const tresMundos: BlocoIA = {
    tipo: 'tabela',
    titulo: 'Os três mundos das operações',
    dados: {
      colunas: ['Mundo', 'Operações', 'Prêmio', 'LMG (limite FAM)'],
      linhas: [
        ['Emitidas (realizado)', emitidas.length, curto(premioEmitido), curto(somaLmg(emitidas))],
        ['No funil (pode entrar)', funil.length, curto(premioFunil), curto(somaLmg(funil))],
        ['Perdidas e Recusadas', encerradas.length, curto(premioEncerrado), curto(somaLmg(encerradas))],
      ],
    },
    origem: 'operacoes separadas por status, do mesmo jeito que a tela de Operações separa',
  }

  {
    const porCorretoraEmit = agrupar(emitidas, (o) => daCorretora(o.corretora_id), (o) => num(o.premio_previsto))

    cartoes.push({
      id: 'premio-emitido',
      area: 'operacoes',
      titulo: 'Prêmio emitido',
      numero: curto(premioEmitido),
      sub: emitidas.length
        ? `realizado em ${n0(emitidas.length)} operações emitidas · ${curto(somaLmg(emitidas))} de LMG`
        : 'nenhuma operação emitida no acervo',
      pergunta: 'Analise o prêmio já emitido pela FAM: de quais corretoras e modalidades ele vem, e como se compara ao que ainda está no funil.',
      blocos: [
        tresMundos,
        ...(porCorretoraEmit.length ? [{
          tipo: 'grafico' as const, formato: 'barra',
          titulo: 'Prêmio emitido por corretora',
          dados: {
            eixo: 'corretora',
            series: [{ campo: 'premio', rotulo: 'Prêmio emitido' }],
            dados: porCorretoraEmit.slice(0, 8).map((x) => ({
              corretora: apara(x.nome, 20), premio: Math.round(x.total),
            })),
          },
          origem: 'soma de operacoes.premio_previsto em status Emitido, por corretora',
        }] : []),
      ],
    })
  }

  /* ── 4. Prêmio NO FUNIL ───────────────────────────────────────────────────
     O que ainda pode entrar, e só isso. Perdida e Recusada ficam de fora, que
     era o ponto dele. */
  {
    const porEtapa = agrupar(funil, (o) => o.status || 'Sem status', (o) => num(o.premio_previsto))
    const conversao = premioEmitido + premioEncerrado > 0
      ? (premioEmitido / (premioEmitido + premioEncerrado)) * 100
      : null

    cartoes.push({
      id: 'premio-funil',
      area: 'operacoes',
      titulo: 'Prêmio no funil',
      numero: curto(premioFunil),
      sub: funil.length
        ? `ainda pode entrar, em ${n0(funil.length)} operações vivas${conversao == null ? '' : ` · das já decididas, ${conversao.toFixed(0)}% do prêmio virou emissão`}`
        : 'nenhuma operação viva no funil',
      pergunta: 'Quanto prêmio ainda pode entrar pelo funil, em que etapas ele está parado, e qual a chance histórica de virar emissão?',
      blocos: [
        tresMundos,
        ...(porEtapa.length ? [{
          tipo: 'grafico' as const, formato: 'barra',
          titulo: 'Prêmio por etapa do funil',
          dados: {
            eixo: 'etapa',
            series: [{ campo: 'premio', rotulo: 'Prêmio previsto' }],
            dados: porEtapa.map((x) => ({ etapa: x.nome, premio: Math.round(x.total) })),
          },
          origem: 'soma de operacoes.premio_previsto nas etapas vivas (fora Emitido, Perdido e Recusado)',
        }] : []),
      ],
    })
  }

  /* ── 5 e 6. Aprovadas e Comitê ────────────────────────────────────────────
     Mesma conta, duas etapas. Feito num laço para as duas nunca divergirem:
     duas cópias do mesmo cálculo é o jeito de um dia uma ser corrigida e a
     outra não. */
  for (const [id, etapa, titulo] of [
    ['aprovadas', 'Aprovado', 'Operações aprovadas'],
    ['comite', 'Comitê', 'Operações em Comitê'],
  ] as const) {
    const dela = operacoes.filter((o) => o.status === etapa)
    const premio = dela.reduce((s, o) => s + num(o.premio_previsto), 0)
    const lmg = dela.reduce((s, o) => s + lmgFam(o), 0)

    cartoes.push({
      id, area: 'operacoes', titulo,
      numero: n0(dela.length),
      sub: dela.length
        ? `${curto(premio)} de prêmio · ${curto(lmg)} de LMG`
        : `nenhuma operação em ${etapa} hoje`,
      pergunta: `Analise as operações na etapa ${etapa}: quanto somam, de quais corretoras vêm e o que está travando as mais antigas.`,
      blocos: dela.length ? [{
        tipo: 'tabela',
        titulo: `As maiores em ${etapa}`,
        dados: {
          colunas: ['Tomador', 'Modalidade', 'LMG', 'Taxa', 'Prêmio', 'Dias na base'],
          linhas: [...dela]
            .sort((x, y) => num(y.premio_previsto) - num(x.premio_previsto))
            .slice(0, 15)
            .map((o) => [
              (o.tomador_id && nomeTomador.get(o.tomador_id)) || 'Sem tomador',
              o.modalidade || '—',
              curto(lmgFam(o)),
              o.taxa != null ? n2(num(o.taxa)) + '%' : '—',
              curto(num(o.premio_previsto)),
              dias(o.data_entrada) ?? '—',
            ]),
        },
        origem: `operacoes com status = ${etapa}`,
      }] : [],
    })
  }

  /* ── 6. LMG total em risco ────────────────────────────────────────────────
     Prêmio é o que a FAM ganha; LMG é o que a FAM deve se tudo der errado. São
     grandezas de ordem completamente diferente, e o segundo não aparece somado
     em nenhuma tela do CRM hoje. */
  {
    const lmgEmitido = somaLmg(emitidas)
    const lmgFunil = somaLmg(funil)
    const porEtapa = agrupar(funil, (o) => o.status || 'Sem status', lmgFam)

    cartoes.push({
      id: 'lmg-risco',
      area: 'operacoes',
      titulo: 'LMG em risco',
      numero: curto(lmgEmitido),
      /* A exposição é a EMITIDA, e só ela: é a única que a FAM já deve. O funil
         entra como o que ainda pode virar exposição, dito com essas palavras. */
      sub: `emitido, que é o que a FAM já deve · ${curto(lmgFunil)} ainda no funil`,
      pergunta: 'Qual a exposição da FAM em LMG emitido, quanto ainda pode virar exposição pelo funil, e como isso se compara ao prêmio?',
      blocos: [
        tresMundos,
        ...(porEtapa.length ? [{
          tipo: 'grafico' as const, formato: 'barra',
          titulo: 'LMG que ainda pode entrar, por etapa',
          dados: {
            eixo: 'etapa',
            series: [{ campo: 'lmg', rotulo: 'LMG (limite FAM)' }],
            dados: porEtapa.map((x) => ({ etapa: x.nome, lmg: Math.round(x.total) })),
          },
          origem: 'soma de operacoes.lmg capado em 80 mi, nas etapas vivas do funil',
        }] : []),
      ],
    })
  }

  /* ── 7. Ticket médio ────────────────────────────────────────────────────── */
  {
    /* Sobre as EMITIDAS. Ticket médio que inclui operação recusada responde
       "quanto valeria se tudo tivesse dado certo", que não é a pergunta. */
    const ticket = emitidas.length ? premioEmitido / emitidas.length : 0
    const porMod = agrupar(emitidas, (o) => o.modalidade || 'Sem modalidade', (o) => num(o.premio_previsto))
    const qtdMod = contar(emitidas, (o) => o.modalidade || 'Sem modalidade')
    const qtdDe = new Map(qtdMod.map((x) => [x.nome, x.total]))

    const linhas = porMod.map((x) => {
      const q = qtdDe.get(x.nome) ?? 0
      return { nome: x.nome, q, premio: x.total, ticket: q ? x.total / q : 0 }
    }).sort((p, q2) => q2.ticket - p.ticket)

    cartoes.push({
      id: 'ticket-medio',
      area: 'operacoes',
      titulo: 'Ticket médio',
      numero: curto(ticket),
      sub: `de prêmio por operação · ${n0(porMod.length)} modalidades no acervo`,
      pergunta: 'Compare o ticket médio de prêmio entre as modalidades e diga onde a FAM ganha mais por operação.',
      blocos: [{
        tipo: 'tabela',
        titulo: 'Ticket médio por modalidade',
        dados: {
          colunas: ['Modalidade', 'Operações', 'Prêmio total', 'Ticket médio'],
          linhas: linhas.map((x) => [x.nome, x.q, curto(x.premio), curto(x.ticket)]),
        },
        origem: 'operacoes.premio_previsto dividido pela contagem, agrupado por modalidade',
      }],
    })
  }

  /* ── 8. Taxa média ────────────────────────────────────────────────────────
     Duas médias, e elas não são a mesma coisa. A simples trata uma operação de
     dez mil e uma de dez milhões como iguais; a ponderada é a taxa que a FAM
     de fato pratica no dinheiro. Mostrar as duas é o que impede a conversa de
     "mas a nossa taxa média é 0,85". */
  {
    /* As duas médias são das EMITIDAS, que é o book que a tela de Operações
       usa para a taxa ponderada. Taxa de operação recusada é taxa que ninguém
       pagou. */
    const comTaxa = emitidas.filter((o) => o.taxa != null)
    const simples = comTaxa.length
      ? comTaxa.reduce((s, o) => s + num(o.taxa), 0) / comTaxa.length
      : 0
    /* A FÓRMULA É A DA TELA DE OPERAÇÕES, não prêmio dividido por LMG. Lá a
       ponderada é a média da própria coluna `taxa`, pesada pelo LMG capado e
       pela vigência (`anosVig`, de lib/comite/calculo.ts, a mesma função que a
       tela importa). Prêmio/LMG daria outro número, e o robô estaria brigando
       com o CRM na mesma pergunta. */
    const lmgEmit = somaLmg(emitidas)
    const pesoTaxa = emitidas.reduce(
      (acc, o) => acc + num(o.taxa) * lmgFam(o) * Math.min(anosVig(o), 1), 0)
    const ponderada = lmgEmit > 0 ? pesoTaxa / lmgEmit : 0

    const ordenadas = [...comTaxa].sort((x, y) => num(y.taxa) - num(x.taxa))
    const extremos = [
      ...ordenadas.slice(0, 3),
      ...ordenadas.slice(-3).reverse(),
    ]

    cartoes.push({
      id: 'taxa-media',
      area: 'operacoes',
      titulo: 'Taxa média praticada',
      numero: n2(ponderada) + '%',
      sub: `ponderada pelo LMG · a média simples é ${n2(simples)}%`,
      pergunta: 'A taxa média ponderada difere da média simples. Analise por modalidade onde a FAM está cobrando acima e abaixo do padrão dela.',
      blocos: comTaxa.length ? [{
        tipo: 'tabela',
        titulo: 'As três maiores e as três menores taxas',
        dados: {
          colunas: ['Tomador', 'Modalidade', 'Taxa', 'LMG', 'Prêmio'],
          linhas: extremos.map((o) => [
            (o.tomador_id && nomeTomador.get(o.tomador_id)) || 'Sem tomador',
            o.modalidade || '—',
            n2(num(o.taxa)) + '%',
            curto(lmgFam(o)),
            curto(num(o.premio_previsto)),
          ]),
        },
        origem: 'operacoes.taxa nas emitidas, ponderada pelo LMG capado e pela vigência, igual à tela de Operações',
      }] : [],
    })
  }

  /* ── 9. As quentes que estão paradas ──────────────────────────────────────
     O cruzamento que ninguém faz na mão: a operação marcada como urgente ou
     quente é justamente a que não pode estar velha. Só conta quem ainda está
     em etapa viva; cobrar uma operação Perdida por estar parada é ruído. */
  {
    const quentes = funil
      .filter((o) => o.temperatura === 'Quente'
        || o.prioridade === 'Urgente' || o.prioridade === 'Prioridade')
      .map((o) => ({ o, d: dias(o.data_entrada) }))
      .filter((x) => x.d != null)
      .sort((x, y) => (y.d ?? 0) - (x.d ?? 0))

    const maisVelha = quentes[0]?.d ?? 0

    cartoes.push({
      id: 'quentes-paradas',
      area: 'operacoes',
      titulo: 'Urgentes ainda na fila',
      numero: n0(quentes.length),
      sub: quentes.length
        ? `operações quentes ou urgentes em etapa viva · a mais velha entrou há ${n0(maisVelha)} dias`
        : 'nenhuma operação urgente ou quente parada em etapa viva',
      alerta: maisVelha >= 30,
      pergunta: 'Que operações marcadas como urgentes ou quentes ainda estão em etapa viva, e há quanto tempo? Diga por onde começar.',
      blocos: quentes.length ? [{
        tipo: 'tabela',
        titulo: 'Da mais velha para a mais nova',
        dados: {
          colunas: ['Tomador', 'Etapa', 'Prioridade', 'Temperatura', 'Prêmio', 'Dias'],
          linhas: quentes.slice(0, 20).map((x) => [
            (x.o.tomador_id && nomeTomador.get(x.o.tomador_id)) || 'Sem tomador',
            x.o.status || '—',
            x.o.prioridade || '—',
            x.o.temperatura || '—',
            curto(num(x.o.premio_previsto)),
            x.d ?? '—',
          ]),
        },
        origem: 'operacoes com temperatura Quente ou prioridade Urgente/Prioridade, em etapa viva',
      }] : [],
    })
  }

  /* ── 10. Voto de subscrição ───────────────────────────────────────────────
     Este cartão hoje mostra um buraco, e é de propósito. A coluna existe e está
     vazia no banco inteiro: nenhuma operação tem voto registrado. Um cartão que
     diz isso em voz alta vale mais do que um cartão escondido. */
  {
    const decidindo = operacoes.filter((o) => o.status === 'Comitê' || o.status === 'Em Análise')
    const semVoto = decidindo.filter((o) => !o.voto_subscricao)
    const comVoto = operacoes.filter((o) => o.voto_subscricao).length

    cartoes.push({
      id: 'votos-pendentes',
      area: 'operacoes',
      titulo: 'Voto de subscrição',
      numero: n0(semVoto.length),
      sub: comVoto === 0
        ? `sem voto em Comitê ou Em Análise · nenhuma das ${n0(operacoes.length)} operações do CRM tem voto registrado`
        : `sem voto registrado, de ${n0(decidindo.length)} em decisão · ${n0(comVoto)} com voto no acervo`,
      /* Sem alerta de propósito, mesmo com o acervo inteiro vazio: este cartão
         ficaria vermelho todo dia até alguém começar a registrar voto, e
         alarme que toca sempre vira paisagem. O número já conta a história. */
      pergunta: 'Quais operações estão em decisão sem voto de subscrição registrado, e o que isso atrasa?',
      blocos: semVoto.length ? [{
        tipo: 'tabela',
        titulo: 'Em decisão, sem voto',
        dados: {
          colunas: ['Tomador', 'Etapa', 'Modalidade', 'LMG', 'Prêmio'],
          linhas: semVoto.slice(0, 20).map((o) => [
            (o.tomador_id && nomeTomador.get(o.tomador_id)) || 'Sem tomador',
            o.status || '—', o.modalidade || '—',
            curto(lmgFam(o)), curto(num(o.premio_previsto)),
          ]),
        },
        origem: 'operacoes em Comitê ou Em Análise com voto_subscricao vazio',
      }] : [],
    })
  }

  /* ── 11. Concentração por modalidade ──────────────────────────────────────
     Vale pelo mesmo motivo do cartão 1, no outro eixo: se a FAM depende de uma
     modalidade, uma mudança de regra de uma modalidade derruba a carteira. */
  {
    /* Sobre o negócio VIVO: o que já foi emitido mais o que ainda está no
       funil. Modalidade que só aparece em operação recusada não é exposição da
       FAM, é história. */
    const vivas = [...emitidas, ...funil]
    const premioVivo = premioEmitido + premioFunil
    const porMod = agrupar(vivas, (o) => o.modalidade || 'Sem modalidade', (o) => num(o.premio_previsto))
    const maior = porMod[0]
    const pct = premioVivo > 0 && maior ? (maior.total / premioVivo) * 100 : 0

    const seis = porMod.slice(0, 6)
    const resto = porMod.slice(6).reduce((s, x) => s + x.total, 0)

    cartoes.push({
      id: 'concentracao-modalidade',
      area: 'operacoes',
      titulo: 'Concentração por modalidade',
      numero: pct.toFixed(1).replace('.', ',') + '%',
      sub: maior ? `do prêmio está em ${apara(maior.nome, 34)}` : 'sem modalidade no acervo',
      alerta: pct >= 50,
      pergunta: 'Analise a concentração do prêmio previsto por modalidade e diga a que a FAM está mais exposta.',
      blocos: porMod.length ? [{
        tipo: 'grafico', formato: 'pizza',
        titulo: 'Prêmio previsto por modalidade',
        dados: {
          eixo: 'modalidade',
          series: [{ campo: 'premio', rotulo: 'Prêmio previsto' }],
          dados: [
            ...seis.map((x) => ({ modalidade: apara(x.nome, 22), premio: Math.round(x.total) })),
            ...(resto > 0 ? [{ modalidade: `outras ${porMod.length - 6}`, premio: Math.round(resto) }] : []),
          ],
        },
        origem: 'soma de operacoes.premio_previsto agrupada por modalidade',
      }] : [],
    })
  }

  /* ── 12. Entradas dos últimos 30 dias ─────────────────────────────────────
     A única pergunta do cardápio que tem tempo dentro. Comparar com os 30 dias
     anteriores é o que transforma um número solto ("entraram 12") em um sinal
     ("entraram 12, contra 30"). */
  {
    const janela = (de: number, ate: number) => operacoes.filter((o) => {
      const d = dias(o.data_entrada)
      return d != null && d >= de && d < ate
    })
    const agora = janela(0, 30)
    const antes = janela(30, 60)

    const pAgora = agora.reduce((s, o) => s + num(o.premio_previsto), 0)
    const pAntes = antes.reduce((s, o) => s + num(o.premio_previsto), 0)
    const variacao = pAntes > 0 ? ((pAgora - pAntes) / pAntes) * 100 : null

    cartoes.push({
      id: 'entradas-30d',
      area: 'operacoes',
      titulo: 'Entraram em 30 dias',
      numero: n0(agora.length),
      sub: variacao == null
        ? `${curto(pAgora)} de prêmio · sem base nos 30 dias anteriores para comparar`
        : `${curto(pAgora)} de prêmio · ${variacao >= 0 ? '+' : ''}${variacao.toFixed(0)}% contra os 30 dias anteriores`,
      alerta: variacao != null && variacao <= -30,
      pergunta: 'Compare as entradas de operações dos últimos 30 dias com os 30 anteriores, em quantidade e prêmio, e diga se a queda ou a alta se concentra em alguma corretora.',
      blocos: [{
        tipo: 'grafico', formato: 'barra',
        titulo: 'Últimos 30 dias contra os 30 anteriores',
        dados: {
          eixo: 'periodo',
          series: [{ campo: 'premio', rotulo: 'Prêmio previsto' }],
          dados: [
            { periodo: '30 dias anteriores', premio: Math.round(pAntes) },
            { periodo: 'últimos 30 dias', premio: Math.round(pAgora) },
          ],
        },
        origem: 'operacoes.data_entrada nas duas janelas de 30 dias',
      }],
    })
  }

  return cartoes
}
