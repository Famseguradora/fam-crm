/* "ESTE E-MAIL PARECE SER DO CASO #N". Sugere, nunca junta.

   Decisão do Marco em 30/09/2026: o sistema aponta o caso provável e uma
   pessoa confirma com um clique. Juntar sozinho erraria de vez em quando, e o
   erro aqui é caro: documento de um tomador dentro do card de outro (Heritage
   x GGP, 10/09).

   Três pistas, da mais forte para a mais fraca, e a tela mostra qual bateu:

     mesmo CNPJ        o CNPJ do assunto (com dígito verificador) é o do caso
     mesmo assunto     sem RE:/ENC:/FW:, o assunto é o do e-mail matriz: é a
                       resposta na mesma conversa
     nome da empresa   a razão social do caso aparece no assunto

   Módulo PURO, sem banco: a rota busca os casos abertos e passa aqui. Assim o
   teste roda sem Supabase (`npm run sugerir:test`).

   Quando o Carteiro passar a ler o ConversationID do Outlook (passo 3 do
   plano), ele entra aqui como a pista mais forte de todas. */

import { cnpjDoAssunto } from '@/lib/casos/pistas'
import { limparNome } from '@/lib/email/ler-email'

export interface CasoCandidato {
  id: string
  numero: number
  assunto: string | null
  cnpj: string | null
  razao_social: string | null
  etapa: string
}

export interface Sugestao {
  caso: CasoCandidato
  motivo: 'mesmo CNPJ' | 'mesmo assunto' | 'nome da empresa no assunto'
}

const soDigitos = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '')

/* Minúsculo, sem acento, sem prefixo de resposta e sem pontuação: "RE: ENC:
   Construtora X - Serasa" e "Construtora X – Serasa" são a mesma conversa. */
export const assuntoDaConversa = (s: string | null | undefined) =>
  limparNome(String(s ?? ''))
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/* Palavras que não identificam empresa nenhuma. Sem esta lista, "Construtora"
   sozinha casaria com meia carteira. */
const GENERICAS = new Set(['ltda', 'eireli', 's a', 'sa', 'me', 'epp', 'cia', 'companhia', 'e', 'de', 'do', 'da', 'dos', 'das'])

function nucleoDoNome(razao: string | null | undefined) {
  const partes = assuntoDaConversa(razao).split(' ').filter((p) => p.length > 1 && !GENERICAS.has(p))
  return partes.join(' ')
}

export function sugerirCasos(
  email: { assunto: string | null },
  casos: CasoCandidato[],
  limite = 3,
): Sugestao[] {
  const abertos = casos.filter((c) => c.etapa !== 'descartado' && c.etapa !== 'encerrado')
  const achadas: Sugestao[] = []
  const ja = new Set<string>()
  const por = (c: CasoCandidato, motivo: Sugestao['motivo']) => {
    if (ja.has(c.id)) return
    ja.add(c.id)
    achadas.push({ caso: c, motivo })
  }

  const cnpj = soDigitos(cnpjDoAssunto(email.assunto ?? '')?.valor)
  if (cnpj.length === 14) {
    for (const c of abertos) if (soDigitos(c.cnpj) === cnpj) por(c, 'mesmo CNPJ')
  }

  const conversa = assuntoDaConversa(email.assunto)
  if (conversa.length >= 8) {
    for (const c of abertos) if (assuntoDaConversa(c.assunto) === conversa) por(c, 'mesmo assunto')
  }

  /* O nome só vale com um núcleo de pelo menos 6 letras e casando como
     palavra inteira: "Alpha" dentro de "Alphaville" não é a mesma empresa. */
  const alvo = ` ${conversa} `
  for (const c of abertos) {
    const nucleo = nucleoDoNome(c.razao_social)
    if (nucleo.replace(/ /g, '').length >= 6 && alvo.includes(` ${nucleo} `)) por(c, 'nome da empresa no assunto')
  }

  return achadas.slice(0, limite)
}
