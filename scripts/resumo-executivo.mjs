// ============================================================================
//  Resumo Executivo Diário do FAM CRM — runner ("Vigia FAM"). 100% Node.
//
//  Lê as credenciais do .env.local, baixa operações/corretoras/tomadores do
//  Supabase, monta o Resumo Executivo (lib/resumo/executivo.mjs) e:
//    1) grava um relatório datado (JSON + TXT legível) na pasta de destino,
//       mantendo as cópias mais recentes (rotação);
//    2) publica uma linha-resumo no BANNER do CRM (tabela `avisos`), trocando
//       o aviso automático do dia anterior — canal in-app, custo de IA zero.
//
//  Pensado para rodar 1x/dia via Tarefa Agendada (scripts/register-resumo-task.ps1),
//  logo após a Análise Financeira das 07:30.
//
//  Uso:   node scripts/resumo-executivo.mjs ["<pasta destino>"] [--no-banner]
//         FAM_RESUMO_DIR sobrescreve o destino padrão.
//         --no-banner  -> só gera o arquivo, não escreve na tabela `avisos`
//                         (útil para conferir números sem tocar produção).
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resumoExecutivo, montarTxt, montarLinhaBanner } from '../lib/resumo/executivo.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')

const DEFAULT_DEST = 'C:\\Users\\MarcoDragoneFAMSEGUR\\FAM Seguradora\\FAM SEGURADORA - Documents\\Infraestrutura\\Resumo Executivo - FAM CRM'
const PREFIX = 'fam-resumo-executivo-'
const KEEP = 30
const PAGE = 1000

// Nome usado para marcar (e depois substituir) os avisos gerados por este robô.
const BANNER_AUTOR = 'Vigia FAM (automático)'
// Quantas horas o aviso do dia fica válido (expira antes da próxima execução).
const BANNER_HORAS = 24

// --- TRAVA DE SEGURANÇA (robô desativado a pedido) -------------------------
// O Resumo Executivo está PAUSADO até ser reajustado. Enquanto ROBO_ATIVO for
// false o script sai sem ler o banco e sem tocar no banner.
// Para religar: troque para true (ou rode com --forcar).
const ROBO_ATIVO = false
if (!ROBO_ATIVO && !process.argv.includes('--forcar')) {
  console.log('[Vigia FAM] Resumo Executivo DESATIVADO (ROBO_ATIVO = false). Nada foi executado.')
  process.exit(0)
}
// ---------------------------------------------------------------------------

const noBanner = process.argv.includes('--no-banner')
const destArg = process.argv.slice(2).find((a) => !a.startsWith('--'))

function loadEnv() {
  const path = join(PROJECT_ROOT, '.env.local')
  const env = {}
  if (!existsSync(path)) return env
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    env[key] = val
  }
  return env
}

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function labelDia(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}`
}

const destDir = destArg || process.env.FAM_RESUMO_DIR || DEFAULT_DEST

function log(msg, level = 'INFO') {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`
  console.log(line)
  try { if (existsSync(destDir)) appendFileSync(join(destDir, 'resumo.log'), line + '\n') } catch {}
}

async function fetchAll(supabase, table) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error) throw new Error(`Tabela "${table}": ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

function rotate() {
  const files = readdirSync(destDir)
    .filter((f) => f.startsWith(PREFIX))
    .map((f) => ({ f, t: statSync(join(destDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  for (const { f } of files.slice(KEEP * 2)) { // *2: cada relatório são 2 arquivos (.json + .txt)
    unlinkSync(join(destDir, f))
    log(`Rotação: removido ${f}`)
  }
}

// Publica a linha-resumo no banner do CRM: desativa o aviso automático anterior
// e insere o de hoje. Best-effort: nunca derruba a geração do relatório.
async function publicarBanner(supabase, mensagem) {
  try {
    const { error: errOff } = await supabase
      .from('avisos')
      .update({ ativo: false })
      .eq('criado_por_nome', BANNER_AUTOR)
      .eq('ativo', true)
    if (errOff) throw new Error(`desativar anteriores: ${errOff.message}`)

    const expira_em = new Date(Date.now() + BANNER_HORAS * 3600 * 1000).toISOString()
    // Coluna `mensagem` tem limite (o formulário manual usa maxLength 280).
    const payload = {
      mensagem: String(mensagem).slice(0, 280),
      tipo: 'info',
      ativo: true,
      expira_em,
      criado_por_auth_id: null,
      criado_por_nome: BANNER_AUTOR,
    }
    const { data: novo, error: errIns } = await supabase.from('avisos').insert(payload).select('id').single()
    if (errIns) throw new Error(`inserir aviso: ${errIns.message}`)

    // Rastreabilidade: espelha o registro em audit_log que a UI faz para `avisos`
    // (app/(dashboard)/configuracoes/avisos/page.tsx). Best-effort — não derruba o robô.
    const { error: errAudit } = await supabase.from('audit_log').insert({
      tabela: 'avisos',
      acao: 'criacao',
      registro_id: novo?.id ?? null,
      dados_antes: null,
      dados_depois: payload,
      usuario_auth_id: null,
      usuario_nome: BANNER_AUTOR,
      usuario_email: null,
    })
    if (errAudit) log(`Aviso publicado, mas audit_log falhou: ${errAudit.message}`, 'ALERTA')
    log('Banner atualizado no CRM (tabela avisos).')
  } catch (e) {
    log(`Falha ao publicar banner (relatório em arquivo não afetado): ${e.message}`, 'ALERTA')
  }
}

async function main() {
  const env = loadEnv()
  const url = process.env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[ERRO] Faltam credenciais (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local).')
    process.exit(1)
  }
  if (!existsSync(destDir)) {
    try { mkdirSync(destDir, { recursive: true }) }
    catch (e) { console.error(`[ERRO] Destino inacessível: ${destDir} - ${e.message}`); process.exit(1) }
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  log(`Iniciando Resumo Executivo -> ${destDir}${noBanner ? ' (--no-banner)' : ''}`)

  const [operacoes, corretoras, tomadores] = await Promise.all([
    fetchAll(supabase, 'operacoes'),
    fetchAll(supabase, 'corretoras'),
    fetchAll(supabase, 'tomadores'),
  ])
  log(`Carregados: ${operacoes.length} operações, ${corretoras.length} corretoras, ${tomadores.length} tomadores`)

  const resumo = resumoExecutivo(operacoes, corretoras, tomadores)
  const agora = new Date()
  const geradoEm = agora.toISOString()
  const dataLabel = labelDia(agora)

  const stamp = fmtDate(agora)
  const base = `${PREFIX}${stamp}`
  writeFileSync(join(destDir, `${base}.json`), JSON.stringify({ geradoEm, ...resumo }, null, 2), 'utf8')
  writeFileSync(join(destDir, `${base}.txt`), montarTxt(resumo, geradoEm, dataLabel), 'utf8')

  const g = resumo.geral
  log(`Resumo: ${g.nOperacoes} op ativas | prêmio R$ ${Math.round(g.premioTotal).toLocaleString('pt-BR')} | LMG R$ ${Math.round(g.lmgTotal).toLocaleString('pt-BR')}`)
  rotate()

  const linha = montarLinhaBanner(resumo, dataLabel)
  if (noBanner) {
    log(`[--no-banner] Banner NÃO publicado. Prévia: ${linha}`)
  } else {
    await publicarBanner(supabase, linha)
  }
}

main().catch((e) => {
  log(e.message || String(e), 'ERRO')
  process.exit(1)
})
