// ============================================================
//  CARGA DA ESTRUTURA SOCIETARIA DAS ANALISES  ·  o organograma da analise
//  dentro do CRM
//
//  Pedido do Marco, 30/08/2026: "dentro da analise de credito eu faco o
//  organograma; se voce conseguiu trazer aquele organograma para dentro do
//  cadastro do tomador, isso ja resolve" (retrabalho zero).
//
//  Le `gerada.estrutura_societaria` ({entidades, participacoes}) das copias em
//  `_sistema/registro/json` e grava em `analises.estrutura_societaria`. So 44
//  das 131 analises tem o bloco (as mais novas, da skill organograma-fam); as
//  outras ficam nulas e a Mesa cai na tabela `socios` do CRM.
//
//    node scripts/carga-estrutura.mjs            ensaio
//    node scripts/carga-estrutura.mjs --gravar   grava
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const COPIAS = path.join('C:', 'Users', 'MarcoDragoneFAMSEGUR', 'OneDrive - FAM Seguradora',
  'Documents', 'Analises FAM', '_sistema', 'registro', 'json')
const GRAVAR = process.argv.includes('--gravar')

function conectar() {
  const txt = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  const env = {}
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('faltam chaves no .env.local')
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

const txt = v => { const s = String(v ?? '').trim(); return s ? s : null }

/** Limpa o bloco: so o que a tela usa, e nada de string "Nao consta" virando dado. */
function estruturaDe(chave) {
  const p = path.join(COPIAS, chave + '.json')
  if (!fs.existsSync(p)) return { erro: 'sem copia' }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  const rev = j?.revisada?.state ?? j?.revisada ?? null
  const e = rev?.estrutura_societaria ?? j?.gerada?.estrutura_societaria ?? null
  if (!e || !Array.isArray(e.entidades) || !e.entidades.length) return { erro: 'sem bloco' }

  const entidades = e.entidades.map(x => ({
    id: String(x.id),
    nome: txt(x.nome) ?? '(sem nome)',
    cnpj: /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(String(x.cnpj ?? '')) ? x.cnpj : null,
    tipo: x.tipo === 'pf' ? 'pf' : 'emp',
    papel: txt(x.papel),
    selos: Array.isArray(x.selos) ? x.selos.map(String) : [],
    capital_social: txt(x.capital_social),
    diretores: Array.isArray(x.diretores) ? x.diretores.map(d => ({ nome: txt(d.nome), cargo: txt(d.cargo) })).filter(d => d.nome) : [],
    sem_vinculo: !!x.sem_vinculo,
  }))
  const ids = new Set(entidades.map(x => x.id))
  const participacoes = (Array.isArray(e.participacoes) ? e.participacoes : [])
    .filter(l => ids.has(String(l.de)) && ids.has(String(l.para)))
    .map(l => ({ de: String(l.de), para: String(l.para), percentual: txt(l.percentual), fonte: txt(l.fonte) }))
  return { bloco: { entidades, participacoes }, fonte: rev?.estrutura_societaria ? 'revisada' : 'gerada' }
}

const db = conectar()
const { data: analises, error } = await db.from('analises').select('id, chave_local, razao_social, vigente').order('razao_social')
if (error) throw new Error(error.message)

let com = 0, sem = 0, gravadas = 0, falhas = 0
const semLista = []
for (const a of analises) {
  const r = estruturaDe(a.chave_local)
  if (r.erro) { sem++; if (a.vigente) semLista.push(a.razao_social); continue }
  com++
  if (GRAVAR) {
    const { error: e2 } = await db.from('analises').update({ estrutura_societaria: r.bloco }).eq('id', a.id)
    if (e2) { falhas++; console.log('  ! ' + a.razao_social + ': ' + e2.message) } else gravadas++
  }
}
console.log(`modo: ${GRAVAR ? 'gravar' : 'ensaio'} · analises: ${analises.length}`)
console.log(`com estrutura na copia: ${com} · sem: ${sem}` + (GRAVAR ? ` · gravadas: ${gravadas} · falhas: ${falhas}` : ''))
console.log(`vigentes sem estrutura (caem na tabela socios do CRM): ${semLista.length}`)
if (!GRAVAR) console.log('ENSAIO: nada gravado.')
