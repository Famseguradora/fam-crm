// Teste isolado do mock-client (sem subir o Next, sem tocar no banco real).
// Compila-se os .ts antes em .sandbox-test/ e roda-se este arquivo.
const fs = require('node:fs')
const path = require('node:path')

// Stub de fetch: serve a planilha local como se fosse /sandbox-dados.xlsx
const xlsxBytes = fs.readFileSync(path.join(__dirname, '..', 'public', 'sandbox-dados.xlsx'))
global.fetch = async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => xlsxBytes.buffer.slice(xlsxBytes.byteOffset, xlsxBytes.byteOffset + xlsxBytes.byteLength),
})

const { createSandboxClient } = require('../.sandbox-test/lib/supabase/sandbox/mock-client.js')

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗ FALHOU:', name) }
}

;(async () => {
  const sb = createSandboxClient()

  // 1) auth.getUser → Marco
  const { data: { user } } = await sb.auth.getUser()
  check('auth.getUser devolve usuário sandbox', user && user.id === 'sandbox-user')

  // 2) select com embeds + filtro + order
  const { data: ops } = await sb
    .from('operacoes')
    .select('*, tomador:tomadores(id,razao_social,cnpj,porte), corretora:corretoras(id,razao_social,nome_fantasia), produto:produtos(id,nome)')
    .eq('ativo', true)
    .order('created_at', { ascending: false })
  check('operacoes: 5 linhas', ops.length === 5)
  check('embed tomador resolvido', ops[0].tomador && ops[0].tomador.razao_social)
  check('embed corretora resolvido', ops.every(o => o.corretora && o.corretora.razao_social))
  check('embed produto resolvido', ops.every(o => o.produto && o.produto.nome))

  // 3) single()
  const { data: tom1 } = await sb.from('tomadores').select('*, corretora:corretoras(id,razao_social,nome_fantasia)').eq('id', 'tom-1').single()
  check('single devolve objeto único', tom1 && tom1.id === 'tom-1')
  check('single embed corretora', tom1.corretora && tom1.corretora.razao_social === 'Corretora Aurora Seguros Ltda')

  // 4) count + head
  const { count } = await sb.from('corretoras').select('*', { count: 'exact', head: true })
  check('count/head devolve total', count === 5)

  // 5) in()
  const { data: metas } = await sb.from('metas_negocio').select('*').in('periodo', ['2026-06', '2026'])
  check('in() filtra períodos', metas.length === 2)

  // 6) insert + select + premio calculado
  const { data: novo } = await sb.from('operacoes').insert({
    tomador_id: 'tom-1', corretora_id: 'corr-1', produto_id: 'prod-1',
    modalidade: 'Garantia de Concorrência', lmg: 1000000, taxa: 1.0, vigencia_anos: 1, vigencia_dias: 365,
    status: 'Para Analisar', ativo: true,
  }).select().single()
  check('insert devolve linha com id', novo && novo.id)
  check('insert calcula premio_previsto', novo.premio_previsto === 10000)

  const { data: aposInsert } = await sb.from('operacoes').select('id').eq('ativo', true)
  check('insert persiste (agora 6 linhas)', aposInsert.length === 6)

  // 7) update
  await sb.from('operacoes').update({ status: 'Emitida' }).eq('id', novo.id)
  const { data: upd } = await sb.from('operacoes').select('status').eq('id', novo.id).single()
  check('update altera o registro', upd.status === 'Emitida')

  // 8) delete
  await sb.from('operacoes').delete().eq('id', novo.id)
  const { data: aposDelete } = await sb.from('operacoes').select('id')
  check('delete remove o registro (volta a 5)', aposDelete.length === 5)

  // 9) .or() dos anexos (sem crash, retorna [])
  const { data: anexos } = await sb.from('anexos').select('*')
    .or('and(entidade_tipo.eq.tomador,entidade_id.eq.tom-1),and(entidade_tipo.eq.operacao,tomador_id.eq.tom-1)')
  check('.or() não quebra', Array.isArray(anexos))

  // 10) not is null
  const { data: emitidas } = await sb.from('operacoes').select('id,data_emissao').not('data_emissao', 'is', null)
  check('not(is null) filtra emitidas', emitidas.length === 1 && emitidas[0].id === 'op-5')

  console.log(`\nResultado: ${pass} passaram, ${fail} falharam`)
  process.exit(fail === 0 ? 0 : 1)
})()
