// ============================================================================
//  Documento da cédula — `/voto/<token>/doc/<anexoId>`
//
//  Faz o stream do arquivo do Storage privado para quem tem um convite válido.
//  Existe por dois motivos:
//    1) o diretor não tem sessão no CRM, então não pode gerar signed URL;
//    2) o HTML da análise precisa chegar com Content-Type text/html, senão o
//       Chrome mostra o código-fonte em vez de renderizar. O truque do Blob
//       usado no CRM exige fetch autenticado — impossível aqui.
// ============================================================================
import { NextRequest } from 'next/server'
import { resolverConvite, adminClient, anexoPertenceAoDossie, tokenCurto } from '@/lib/comite/convites'
import type { Anexo, Operacao } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Resposta única para qualquer falha: não revela se o token existe, se o anexo
// existe, ou qual dos dois falhou.
function naoEncontrado(): Response {
  return new Response('Documento não disponível.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string; anexoId: string }> },
) {
  const { token, anexoId } = await params

  const res = await resolverConvite(token)
  // Operação encerrada/em vista ainda permite LER os documentos — o diretor
  // pode querer reler depois de votar. Só o token inválido/expirado barra.
  const operacao: Operacao | null = res.ok ? res.dados.operacao : (res.operacao ?? null)
  if (!operacao) return naoEncontrado()
  if (!res.ok && (res.motivo === 'inexistente' || res.motivo === 'expirado')) return naoEncontrado()

  const supabase = adminClient()
  const { data: anexo } = await supabase
    .from('anexos').select('*').eq('id', anexoId).maybeSingle()
  if (!anexo) return naoEncontrado()

  // TRAVA CRÍTICA: sem isto, um token válido viraria leitor de QUALQUER anexo
  // do sistema — bastaria trocar o id na URL.
  if (!anexoPertenceAoDossie(anexo as Anexo, operacao)) {
    console.warn(`[voto] anexo fora do dossiê: token=${tokenCurto(token)} anexo=${anexoId}`)
    return naoEncontrado()
  }
  if ((anexo as Anexo).categoria === 'outro') return naoEncontrado()

  const { data: arquivo, error } = await supabase.storage
    .from('fam-anexos')
    .download((anexo as Anexo).storage_path)
  if (error || !arquivo) return naoEncontrado()

  const ext = (anexo as Anexo).nome_original.split('.').pop()?.toLowerCase()
  const ehHtml = ext === 'html' || ext === 'htm'
  const tipo = ehHtml
    ? 'text/html; charset=utf-8'
    : ((anexo as Anexo).tipo_mime ?? 'application/octet-stream')

  // Nome ASCII: header HTTP não aceita acento cru.
  const nomeAscii = (anexo as Anexo).nome_original
    .normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')

  return new Response(arquivo, {
    headers: {
      'Content-Type': tipo,
      'Content-Disposition': `inline; filename="${nomeAscii}"`,
      // `sandbox` põe o documento num origin opaco: os gráficos/JS da análise
      // continuam rodando, mas o arquivo não enxerga cookie nem localStorage
      // do domínio do CRM. Obrigatório — servimos HTML de terceiros aqui.
      'Content-Security-Policy': "sandbox allow-scripts allow-popups allow-forms",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
