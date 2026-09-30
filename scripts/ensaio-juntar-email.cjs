/* O ENSAIO DO "JUNTAR E-MAIL AO CASO"  ·  30/09/2026
   ═══════════════════════════════════════════════════════════════════════════

   Roda `juntarEmailAoCaso` de verdade contra o banco e o Storage de produção,
   em três casos de ensaio criados aqui e apagados no fim (com conferência).

   O QUE ELE NÃO FAZ, e é decisão: não cria linha em `analise_fila`. A fila é o
   que o agente do notebook vem buscar, e uma linha de teste viraria pasta de
   verdade na máquina do Marco. O `anexos_em` é uma linha só, lida no código.

   Rodar:  npm run juntar:ensaio
*/
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { createClient } = require('@supabase/supabase-js')

const SAIDA = path.join(__dirname, '..', '.tmp-juntar')
const resolverOriginal = Module._resolveFilename
Module._resolveFilename = function (pedido, ...resto) {
  if (pedido.startsWith('@/')) {
    const alvo = path.join(SAIDA, pedido.slice(2))
    pedido = fs.existsSync(alvo + '.mjs') ? alvo + '.mjs' : alvo
  }
  return resolverOriginal.call(this, pedido, ...resto)
}
const { juntarEmailAoCaso } = require(path.join(SAIDA, 'lib/casos/juntar-email.js'))

let passou = 0, falhou = 0
const ok = (nome, cond, detalhe) => {
  if (cond) { passou++; console.log(`  ok    ${nome}`) }
  else { falhou++; console.log(`  FALHA ${nome}${detalhe !== undefined ? ` · ${typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe)}` : ''}`) }
}

function lerEnv() {
  const env = {}
  for (const l of fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

/* Um .eml de verdade, montado à mão: corpo, dois PDFs e a logo da assinatura
   embutida (que tem que ser ignorada). */
function montarEml(messageId) {
  const b = 'LIMITE_ENSAIO'
  const pdf = (t) => Buffer.from(`%PDF-1.4\n% ${t}\n%%EOF\n`).toString('base64')
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64')
  return Buffer.from([
    'From: Corretora Ensaio <ensaio@corretora.example>',
    'To: comercial@famseguradora.com.br',
    'Subject: RE: ENSAIO JUNTAR · Serasa e contrato que faltavam',
    'Date: Tue, 30 Sep 2026 10:15:00 -0300',
    `Message-ID: <${messageId}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b}"`,
    '',
    `--${b}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Segue o Serasa e o contrato social que faltavam.',
    `--${b}`,
    'Content-Type: application/pdf; name="Serasa Empresa Ensaio.pdf"',
    'Content-Disposition: attachment; filename="Serasa Empresa Ensaio.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    pdf('serasa'),
    `--${b}`,
    'Content-Type: application/pdf; name="Contrato Social Ensaio.pdf"',
    'Content-Disposition: attachment; filename="Contrato Social Ensaio.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    pdf('contrato'),
    `--${b}`,
    'Content-Type: image/png; name="image001.png"',
    'Content-Disposition: inline; filename="image001.png"',
    'Content-ID: <image001.png@01>',
    'Content-Transfer-Encoding: base64',
    '',
    png,
    `--${b}--`,
    '',
  ].join('\r\n'))
}

async function main() {
  const env = lerEnv()
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const marca = `ensaio-juntar-${Date.now()}`
  const messageId = `${marca}@corretora.example`
  const autor = { auth_id: null, nome: 'Ensaio automático' }
  const criados = []

  try {
    // ── cenário ──────────────────────────────────────────────────────────
    const novo = async (etapa) => {
      const { data, error } = await sb.from('casos')
        .insert({ assunto: `ENSAIO JUNTAR ${marca}`, etapa, criado_por_nome: 'Ensaio automático' })
        .select('id, numero').single()
      if (error) throw new Error('não criei o caso de ensaio: ' + error.message)
      criados.push(data.id)
      return data
    }
    const A = await novo('triagem')
    const B = await novo('triagem')
    const C = await novo('descartado')
    await sb.from('caso_itens').insert([
      { caso_id: A.id, item: 'serasa_pj', situacao: 'faltando', por: 'robo' },
      { caso_id: A.id, item: 'contrato_social', situacao: 'faltando', por: 'humano' },
      { caso_id: A.id, item: 'demonstracoes_2_exercicios', situacao: 'faltando', por: 'robo' },
    ])
    console.log(`\nCasos de ensaio: #${A.numero} (alvo), #${B.numero} (outro), #${C.numero} (descartado)\n`)

    const eml = montarEml(messageId)

    // ── 1. o caminho feliz ───────────────────────────────────────────────
    console.log('1. Juntar o e-mail ao caso')
    const r = await juntarEmailAoCaso(sb, { casoId: A.id, bruto: eml, nomeArquivo: 'resposta.eml', autor })
    ok('juntou', r.ok, r.erro)
    ok('dois anexos úteis (a logo embutida ficou de fora)', r.documentos === 2 && r.ignorados === 1, { documentos: r.documentos, ignorados: r.ignorados })
    ok('resolveu só o Serasa (o contrato estava decidido por uma pessoa)', JSON.stringify(r.resolveu) === JSON.stringify(['Serasa do tomador']), r.resolveu)
    ok('ficou no caso, não no tomador', r.no_tomador === false)
    ok('nenhuma falha', r.falhas.length === 0, r.falhas)

    const { data: docs } = await sb.from('caso_documentos').select('nome, anexo_id, detalhe, anexos(storage_path, entidade_tipo, entidade_id)').eq('caso_id', A.id)
    ok('três documentos na triagem: o e-mail e os dois PDFs', docs?.length === 3, docs?.map((d) => d.nome))
    ok('o próprio e-mail entrou como documento, com a data no nome', docs?.some((d) => /^E-mail de 30-09-2026 · ENSAIO JUNTAR/.test(d.nome) && d.nome.endsWith('.eml')), docs?.map((d) => d.nome))
    ok('os anexos estão pendurados no caso', docs?.every((d) => d.anexos?.entidade_tipo === 'caso' && d.anexos?.entidade_id === A.id))
    for (const d of docs ?? []) {
      const pasta = path.posix.dirname(d.anexos.storage_path)
      const { data: lista } = await sb.storage.from('fam-anexos').list(pasta, { search: path.posix.basename(d.anexos.storage_path) })
      ok(`arquivo existe no Storage: ${d.nome.slice(0, 40)}`, (lista ?? []).length === 1)
    }

    const { data: itens } = await sb.from('caso_itens').select('item, situacao, por').eq('caso_id', A.id)
    const it = Object.fromEntries((itens ?? []).map((i) => [i.item, i]))
    ok('Serasa virou ok (era do robô)', it.serasa_pj?.situacao === 'ok', it.serasa_pj)
    ok('Contrato continua como a pessoa deixou', it.contrato_social?.situacao === 'faltando' && it.contrato_social?.por === 'humano', it.contrato_social)
    ok('Demonstrativo continua faltando (não veio)', it.demonstracoes_2_exercicios?.situacao === 'faltando')

    const { data: linha } = await sb.from('emails_caixa').select('*').eq('message_id', messageId).maybeSingle()
    ok('a caixa ganhou a linha do e-mail filho', !!linha)
    ok('ligada ao caso, com juntado_em e quem juntou', linha?.caso_id === A.id && !!linha?.juntado_em && linha?.juntado_por === 'Ensaio automático')
    ok('serve = true (a equipe do caso enxerga)', linha?.serve === true)
    ok('guarda onde o arquivo do e-mail ficou', !!linha?.storage_path && docs?.some((d) => d.anexos.storage_path === linha.storage_path))
    ok('não é a matriz do caso', !(await sb.from('casos').select('email_caixa_id').eq('id', A.id).single()).data.email_caixa_id)

    // ── 2. as travas ─────────────────────────────────────────────────────
    console.log('\n2. As travas')
    const r2 = await juntarEmailAoCaso(sb, { casoId: A.id, bruto: eml, nomeArquivo: 'resposta.eml', autor })
    ok('o mesmo e-mail no mesmo caso não duplica', r2.ok && r2.ja_estava)
    ok('e nada novo foi gravado', (await sb.from('caso_documentos').select('id').eq('caso_id', A.id)).data?.length === 3)

    const r3 = await juntarEmailAoCaso(sb, { casoId: B.id, bruto: eml, nomeArquivo: 'resposta.eml', autor })
    ok('o mesmo e-mail em OUTRO caso é recusado, com o número do dono', !r3.ok && r3.erro.includes(`#${A.numero}`), r3.erro)
    ok('o outro caso continua vazio', !(await sb.from('caso_documentos').select('id').eq('caso_id', B.id)).data?.length)

    const r4 = await juntarEmailAoCaso(sb, { casoId: C.id, bruto: montarEml(`${marca}-2@corretora.example`), nomeArquivo: 'x.eml', autor })
    ok('caso descartado recusa', !r4.ok && /descartado/.test(r4.erro), r4.erro)

    const r5 = await juntarEmailAoCaso(sb, { casoId: A.id, bruto: Buffer.from('%PDF-1.4 nada'), nomeArquivo: 'balanco.pdf', autor })
    ok('PDF solto não passa como e-mail', !r5.ok && /não é um e-mail/.test(r5.erro), r5.erro)

    const r6 = await juntarEmailAoCaso(sb, { casoId: '00000000-0000-0000-0000-000000000000', bruto: eml, nomeArquivo: 'x.eml', autor })
    ok('caso inexistente recusa', !r6.ok && /não encontrado/.test(r6.erro), r6.erro)

    // ── 3. o pedido feito pela Caixa (o que o Carteiro atende) ───────────
    console.log('\n3. Linha da caixa já existente (o caminho do Carteiro)')
    const mid2 = `${marca}-3@corretora.example`
    const { data: pedida } = await sb.from('emails_caixa').insert({
      origem: 'outlook', message_id: mid2, assunto: 'ENSAIO pedido pela Caixa', serve: false,
      estado: 'a_trazer', juntar_ao_caso: A.id, motivo: 'ensaio',
    }).select('id').single()
    const r7 = await juntarEmailAoCaso(sb, { casoId: A.id, bruto: montarEml(mid2), nomeArquivo: 'y.msg', autor, emailCaixaId: pedida.id })
    ok('juntou pela linha da caixa', r7.ok, r7.erro)
    const { data: l7 } = await sb.from('emails_caixa').select('caso_id, juntar_ao_caso, estado, serve').eq('id', pedida.id).single()
    ok('a linha virou trazida, ligada ao caso e o pedido limpo', l7.caso_id === A.id && l7.juntar_ao_caso === null && l7.estado === 'trazido' && l7.serve === true, l7)
    ok('nenhuma linha duplicada na caixa', (await sb.from('emails_caixa').select('id').eq('message_id', mid2)).data?.length === 1)
  } finally {
    // ── limpeza, sempre ──────────────────────────────────────────────────
    console.log('\nLimpeza')
    for (const id of criados) {
      const { data: anexos } = await sb.from('anexos').select('id, storage_path').eq('entidade_tipo', 'caso').eq('entidade_id', id)
      const caminhos = (anexos ?? []).map((a) => a.storage_path).filter(Boolean)
      if (caminhos.length) await sb.storage.from('fam-anexos').remove(caminhos)
      await sb.from('caso_documentos').delete().eq('caso_id', id)
      await sb.from('anexos').delete().eq('entidade_tipo', 'caso').eq('entidade_id', id)
      await sb.from('caso_itens').delete().eq('caso_id', id)
      await sb.from('emails_caixa').delete().eq('caso_id', id)
      await sb.from('emails_caixa').delete().eq('juntar_ao_caso', id)
    }
    await sb.from('emails_caixa').delete().like('message_id', `${marca}%`)
    if (criados.length) await sb.from('casos').delete().in('id', criados)

    const sobrou = [
      (await sb.from('casos').select('id').in('id', criados.length ? criados : ['00000000-0000-0000-0000-000000000000'])).data?.length ?? 0,
      (await sb.from('emails_caixa').select('id').like('message_id', `${marca}%`)).data?.length ?? 0,
      (await sb.from('anexos').select('id').eq('entidade_tipo', 'caso').in('entidade_id', criados.length ? criados : ['00000000-0000-0000-0000-000000000000'])).data?.length ?? 0,
    ]
    ok('nada do ensaio sobrou no banco', sobrou.every((n) => n === 0), sobrou)
  }

  console.log(`\n${passou} passaram, ${falhou} falharam.`)
  process.exit(falhou ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
