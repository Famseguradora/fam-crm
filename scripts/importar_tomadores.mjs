/**
 * Importar Tomadores — FAM CRM
 *
 * Como usar:
 *   1. Salve sua planilha como scripts/tomadores.csv (UTF-8, separado por vírgula)
 *   2. Execute: node scripts/importar_tomadores.mjs
 *
 * Colunas do CSV (primeira linha = cabeçalho):
 *   razao_social, nome_fantasia, cnpj, email, telefone, celular, responsavel,
 *   cep, endereco, numero, complemento, bairro, cidade, estado,
 *   porte, limite_aprovado, observacao, corretora_nome, data_cadastro
 *
 * data_cadastro: aceita DD/MM/AAAA ou AAAA-MM-DD — se vazia usa a data de hoje.
 *
 * Campos obrigatórios: razao_social, cnpj
 * Todos os outros são opcionais — deixe a célula vazia se não tiver.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Carregar variáveis de ambiente do .env.local ─────────────────────────────

function carregarEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) throw new Error('.env.local não encontrado na raiz do projeto.')
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  const env = {}
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')
    env[key] = val
  }
  return env
}

// ─── Parser de CSV simples (lida com campos entre aspas) ──────────────────────

function parseCsv(conteudo) {
  const linhas = conteudo.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  // auto-detectar separador na primeira linha não-vazia
  const primeiraLinha = linhas.find((l) => l.trim()) ?? ''
  const sep = primeiraLinha.includes(';') ? ';' : ','
  const resultado = []
  for (const linha of linhas) {
    if (!linha.trim()) continue
    const campos = []
    let campo = ''
    let dentro = false
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i]
      if (c === '"') {
        dentro = !dentro
      } else if (c === sep && !dentro) {
        campos.push(campo.trim())
        campo = ''
      } else {
        campo += c
      }
    }
    campos.push(campo.trim())
    resultado.push(campos)
  }
  return resultado
}

// ─── Normalizar texto para comparação ────────────────────────────────────────

function normalizar(str) {
  return (str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Parsear data (DD/MM/AAAA ou AAAA-MM-DD) → ISO string ────────────────────

function parsearData(valor) {
  if (!valor) return null
  // Formato BR: DD/MM/AAAA
  const br = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) {
    const [, d, m, a] = br
    const dt = new Date(`${a}-${m}-${d}T00:00:00.000Z`)
    return isNaN(dt.getTime()) ? null : dt.toISOString()
  }
  // Formato ISO: AAAA-MM-DD (com ou sem hora)
  const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const dt = new Date(`${iso[0]}T00:00:00.000Z`)
    return isNaN(dt.getTime()) ? null : dt.toISOString()
  }
  return null
}

// ─── Validar CNPJ básico (14 dígitos) ────────────────────────────────────────

function cnpjValido(cnpj) {
  const digits = cnpj.replace(/\D/g, '')
  return digits.length === 14
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const csvPath = path.join(__dirname, 'tomadores.csv')
  if (!fs.existsSync(csvPath)) {
    console.error('❌  Arquivo scripts/tomadores.csv não encontrado.')
    console.error('    Salve sua planilha como tomadores.csv na pasta scripts/ e tente novamente.')
    process.exit(1)
  }

  // Inicializar Supabase com service role (ignora RLS)
  const env = carregarEnv()
  const url = env['NEXT_PUBLIC_SUPABASE_URL']
  const key = env['SUPABASE_SERVICE_ROLE_KEY']
  if (!url || !key) {
    console.error('❌  NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes no .env.local')
    process.exit(1)
  }
  const supabase = createClient(url, key)

  console.log('🔗  Conectado ao Supabase:', url)

  // Carregar corretoras para lookup
  const { data: corretoras, error: errCor } = await supabase
    .from('corretoras')
    .select('id, razao_social, nome_fantasia')
  if (errCor) { console.error('❌  Erro ao carregar corretoras:', errCor.message); process.exit(1) }

  // Mapa: nome normalizado → id (testa razao_social e nome_fantasia)
  const mapaCorretoras = new Map()
  for (const c of corretoras) {
    if (c.razao_social) mapaCorretoras.set(normalizar(c.razao_social), c.id)
    if (c.nome_fantasia) mapaCorretoras.set(normalizar(c.nome_fantasia), c.id)
  }
  console.log(`📋  ${corretoras.length} corretoras carregadas para lookup.`)

  // Ler e parsear CSV (remove BOM se presente)
  const conteudo = fs.readFileSync(csvPath, 'utf-8').replace(/^﻿/, '')
  const linhas = parseCsv(conteudo)
  if (linhas.length < 2) { console.error('❌  CSV vazio ou sem dados.'); process.exit(1) }

  // Mapear cabeçalho
  const cabecalho = linhas[0].map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'))
  const col = (row, nome) => {
    const idx = cabecalho.indexOf(nome)
    return idx !== -1 ? (row[idx] ?? '').trim() : ''
  }

  const dados = linhas.slice(1)
  console.log(`📂  ${dados.length} linha(s) encontradas no CSV.\n`)

  let inseridos = 0
  let ignorados = 0
  let erros = 0
  const semCorretora = []
  const errosList = []

  for (let i = 0; i < dados.length; i++) {
    const row = dados[i]
    const linha = i + 2 // linha real no arquivo (1-based + cabeçalho)

    const razao_social = col(row, 'razao_social')
    const cnpjRaw = col(row, 'cnpj').replace(/\D/g, '')

    // Validações obrigatórias
    if (!razao_social) {
      console.warn(`⚠️   Linha ${linha}: razao_social vazia — ignorada.`)
      ignorados++
      continue
    }
    if (!cnpjValido(cnpjRaw)) {
      console.warn(`⚠️   Linha ${linha}: CNPJ inválido "${col(row, 'cnpj')}" — ignorada.`)
      ignorados++
      continue
    }

    // Lookup corretora por nome
    const corretoraNome = col(row, 'corretora_nome')
    let corretora_id = null
    if (corretoraNome) {
      corretora_id = mapaCorretoras.get(normalizar(corretoraNome)) ?? null
      if (!corretora_id) {
        semCorretora.push({ linha, razao_social, corretoraNome })
      }
    }

    // Porte válido
    const portesValidos = ['Small', 'Middle', 'Corporate', 'Large']
    const porteRaw = col(row, 'porte')
    const porte = portesValidos.includes(porteRaw) ? porteRaw : null

    // Limite aprovado (formato BR: 1.234.567,89 → 1234567.89)
    const limiteRaw = col(row, 'limite_aprovado').replace(/\./g, '').replace(',', '.')
    const limite_aprovado = limiteRaw && !isNaN(parseFloat(limiteRaw)) ? parseFloat(limiteRaw) : null

    // Data de cadastro
    const dataRaw = col(row, 'data_cadastro')
    const created_at = parsearData(dataRaw)
    if (dataRaw && !created_at) {
      console.warn(`⚠️   Linha ${linha}: data_cadastro "${dataRaw}" inválida — usando data de hoje.`)
    }

    const payload = {
      razao_social: razao_social.trim(),
      nome_fantasia: col(row, 'nome_fantasia') || null,
      cnpj: cnpjRaw,
      email: col(row, 'email') || null,
      telefone: col(row, 'telefone').replace(/\D/g, '') || null,
      celular: col(row, 'celular').replace(/\D/g, '') || null,
      responsavel: col(row, 'responsavel') || null,
      cep: col(row, 'cep').replace(/\D/g, '') || null,
      endereco: col(row, 'endereco') || null,
      numero: col(row, 'numero') || null,
      complemento: col(row, 'complemento') || null,
      bairro: col(row, 'bairro') || null,
      cidade: col(row, 'cidade') || null,
      estado: col(row, 'estado').toUpperCase().slice(0, 2) || null,
      porte,
      limite_aprovado,
      observacao: col(row, 'observacao') || null,
      corretora_id,
      status: 'Aguardando Análise',
      ativo: true,
      ...(created_at ? { created_at, updated_at: created_at } : {}),
    }

    const { error } = await supabase.from('tomadores').insert(payload)
    if (error) {
      const motivo = error.message.includes('duplicate') || error.message.includes('unique')
        ? `CNPJ ${cnpjRaw} já cadastrado`
        : error.message
      console.error(`❌  Linha ${linha} (${razao_social}): ${motivo}`)
      errosList.push({ linha, razao_social, motivo })
      erros++
    } else {
      console.log(`✅  Linha ${linha}: ${razao_social}${corretora_id ? '' : ' (sem corretora)'}`)
      inseridos++
    }
  }

  // Relatório final
  console.log('\n══════════════════════════════════════')
  console.log('  RESULTADO DA IMPORTAÇÃO')
  console.log('══════════════════════════════════════')
  console.log(`  ✅  Inseridos com sucesso : ${inseridos}`)
  console.log(`  ⚠️   Ignorados (dados inv.) : ${ignorados}`)
  console.log(`  ❌  Erros                  : ${erros}`)

  if (semCorretora.length > 0) {
    console.log(`\n  ⚠️   ${semCorretora.length} tomador(es) sem corretora vinculada (nome não encontrado):`)
    for (const { linha, razao_social, corretoraNome } of semCorretora) {
      console.log(`       Linha ${linha}: "${razao_social}" → corretora "${corretoraNome}" não encontrada`)
    }
  }

  if (errosList.length > 0) {
    console.log('\n  Erros detalhados:')
    for (const { linha, razao_social, motivo } of errosList) {
      console.log(`    Linha ${linha} — ${razao_social}: ${motivo}`)
    }
  }

  console.log('══════════════════════════════════════\n')
}

main().catch((err) => { console.error('Erro fatal:', err); process.exit(1) })
