// ============================================================================
//  Quem pode MEXER na análise de crédito — `lib/analise/acesso.ts`
//
//  São TRÊS andares, e confundir dois deles já custou caro:
//
//    ve    · entra em /analises, lê a Mesa, o Acervo e os relatórios.
//            Vem de `usuarios.acesso_analise`, marcado na tela /usuarios.
//    ajuda · arrasta card na coluna, escreve a nota do tomador, encaminha.
//            É `ve` mais perfil que não é `leitura`.
//    edita · decide conflito, aplica ao cadastro, publica a análise.
//            Vem de `usuarios.analista_credito`. Continua só do Marco.
//
//  POR QUE `ve` DEIXOU DE SER "TODO MUNDO" (23/09/2026). A regra de 30/08 era
//  "ler a análise é de todo mundo que tem login", e nasceu certa: naquele dia
//  os 12 logins eram todos da FAM. Em 23/09 dois deles eram de fora — um
//  escritório de advocacia e a Stonepart —, e a regra, sem ter mudado, tinha
//  passado a entregar balanço, Serasa e limite de 634 tomadores para fora de
//  casa. Ordem dele no mesmo dia: a marca passa a governar VER.
//
//  Não confundir com `perfil`. Oito pessoas são `admin` no CRM e todas passam
//  por `fam_pode_escrever()`. Isso não as faz analistas, e desde 23/09 também
//  não as faz enxergar a análise: o que as faz enxergar é a marca.
//
//  ESTE ARQUIVO NÃO É A TRAVA. A trava é a RLS (`fam_ve_analise()`,
//  `fam_ajuda_analise()`, `fam_e_analista()`), que roda no banco e vale para
//  qualquer caminho, inclusive quem chamar a API por fora do navegador. O que
//  está aqui serve para a tela não OFERECER um botão que o banco vai recusar
//  depois — frustração à toa e erro vermelho sem motivo —, e para o guarda do
//  `layout.tsx` de /analises barrar ANTES de montar dado sensível no HTML.
// ============================================================================
import { createClient } from '@/lib/supabase/server'

export interface QuemAnalise {
  /** Entra na tela e lê tudo. Marcado em `usuarios.acesso_analise`. */
  ve: boolean
  /** Arrasta card na coluna, escreve nota, encaminha. `ve` e não é `leitura`. */
  ajuda: boolean
  /** Decide conflito, aplica ao cadastro, publica a análise. Só o analista. */
  edita: boolean
  /** Nome de quem está olhando, para assinar a decisão. Vem do banco. */
  nome: string
}

export const NINGUEM: QuemAnalise = { ve: false, ajuda: false, edita: false, nome: '' }

/** Mantido para quem já importava o nome antigo. Hoje ninguém "visita": sem a
 *  marca não se entra. */
export const VISITANTE: QuemAnalise = NINGUEM

/**
 * Lê a sessão do CRM e devolve o que essa pessoa pode fazer na análise.
 * Nunca lança: sem sessão, volta como ninguém.
 */
export async function quemAnalise(): Promise<QuemAnalise> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NINGUEM

  const { data } = await supabase
    .from('usuarios')
    .select('nome, email, perfil, status, acesso_analise, analista_credito')
    .eq('auth_id', user.id)
    .maybeSingle()

  if (!data) return NINGUEM

  /* A MESMA CONTA QUE A RLS FAZ, e na mesma ordem. Se um dia divergirem, quem
     manda é o banco e a tela é que fica errada — por isso as três linhas abaixo
     são cópia literal de `fam_ve_analise()` e `fam_ajuda_analise()`. */
  const ativo = data.status === 'ativo'
  const ve = ativo && Boolean(data.acesso_analise)
  const ajuda = ve && data.perfil !== 'leitura'

  return {
    ve,
    ajuda,
    edita: Boolean(data.analista_credito),
    nome: data.nome ?? data.email ?? user.email ?? '',
  }
}
