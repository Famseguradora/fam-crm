// ============================================================================
//  A ANÁLISE COMPLEMENTAR, do lado do notebook  ·  17/09/2026
//
//  Pedido do Marco: tomador já analisado mandou documento novo (o balancete de
//  2026). Não se roda a skill inteira de novo. Os documentos novos são lidos
//  CONTRA a análise anterior e os complementos que já houve, e a resposta diz
//  se a empresa manteve o rumo ou mudou.
//
//  O caminho:
//    1. o CRM guarda os arquivos e abre o pedido (/api/analise/<id>/complemento);
//    2. aqui: pega o pedido, baixa os arquivos para uma pasta de trabalho FORA
//       do OneDrive (download grande no OneDrive morre com WinError 32), e
//       converte planilha em CSV, porque o Read do Claude não abre .xlsx;
//    3. o claude.exe desta máquina lê tudo com Read/Grep/Glob e SÓ ISSO (sem
//       Write, Edit, Bash nem internet) e devolve um JSON;
//    4. o CRM valida o JSON e grava. As contas (variação, anualização, índices)
//       são feitas na tela, em lib/analise/complemento.ts, e não pela IA.
//
//  Um por vez, e solto da rodada da esteira: uma leitura leva minutos.
// ============================================================================
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const DIR_TRABALHO = path.join(os.tmpdir(), 'fam-complementos')
const LIMITE_MS = 25 * 60 * 1000

let ocupado = false

const PROMPT = `Você é o analista de crédito da FAM Seguradora (seguro garantia) fazendo uma ANÁLISE COMPLEMENTAR.

A análise de crédito completa deste tomador JÁ FOI FEITA. Ela está resumida em contexto.json, junto com os exercícios que ela usou (valores em REAIS) e os complementos anteriores, se houver. Não refaça a análise e não leia skill nenhuma.

Os documentos NOVOS estão na pasta "documentos". Planilhas foram convertidas para .csv ao lado do original.

O SEU TRABALHO:
1. Leia contexto.json inteiro.
2. Leia TODOS os documentos novos.
3. Extraia os números dos documentos novos, período por período (um balancete de jun/2026 é um período; se o documento trouxer comparativo, cada data é um período). Converta tudo para REAIS inteiros (documento em "R$ mil" multiplica por 1000). Conta que não existe no documento vai null: NUNCA estime nem calcule por fora.
   Contas: ativo_total, ativo_circulante, passivo_circulante, exigivel_total (passivo circulante + não circulante), patrimonio_liquido, receita_operacional (receita líquida acumulada no período), ebitda, lucro_liquido (acumulado no período), caixa (caixa e equivalentes), estoques.
   "meses" é quantos meses o resultado acumula (balancete de jan a jun = 6). Não inclua períodos que já estão em contexto.json.
4. Confira a QUALIDADE dos documentos: assinado por contador/responsável? auditado? o ativo fecha com passivo + PL? o lucro do período conversa com a variação do PL? há conta estranha, saldo invertido, número redondo demais, mudança de critério em relação aos exercícios anteriores?
5. Compare com a análise anterior: o que os números novos CONFIRMAM do que ela concluiu (pontos positivos, 3 C's, limite), o que CONTRADIZEM, e que risco NOVO apareceu. Seja concreto e cite números.
6. Dê o veredito: "mantem" (segue o que a análise viu), "melhora", "piora", "mudou_de_rumo" (mudança de natureza, não só de grau) ou "inconclusivo" (documento insuficiente).
7. Recomende UMA ação: "manter", "revisar_limite", "reduzir_limite", "ampliar_limite", "suspender" ou "pedir_documentos", e explique em 2 a 4 frases.

Escreva em português do Brasil, direto, sem travessão (use dois pontos, ponto ou parênteses). Nada de floreio.

RESPONDA SOMENTE com um bloco \`\`\`json contendo exatamente este formato:
{
  "veredito": "mantem|melhora|piora|mudou_de_rumo|inconclusivo",
  "titulo": "uma frase curta que resume o veredito",
  "resumo": "3 a 5 frases: o que chegou, o que mostra no tempo, e o que isso faz com a análise anterior",
  "recomendacao": { "acao": "manter|revisar_limite|reduzir_limite|ampliar_limite|suspender|pedir_documentos", "texto": "..." },
  "periodos": [
    { "rotulo": "jun/2026", "data_base": "2026-06-30", "meses": 6, "tipo": "balancete|balanco|dre|outro", "auditado": false, "arquivo": "nome do arquivo", "base": "Individual|Consolidado|...",
      "valores": { "ativo_total": 0, "ativo_circulante": 0, "passivo_circulante": 0, "exigivel_total": 0, "patrimonio_liquido": 0, "receita_operacional": 0, "ebitda": null, "lucro_liquido": 0, "caixa": 0, "estoques": 0 } }
  ],
  "leitura_quantitativa": [ { "tema": "Receita|Margem|Liquidez|Endividamento|Patrimônio|Caixa|...", "texto": "leitura do número no tempo, citando os valores" } ],
  "confirma": ["..."],
  "contradiz": ["..."],
  "novos_riscos": ["..."],
  "documentos": [ { "arquivo": "...", "tipo": "Balancete|Balanço|DRE|Serasa|...", "periodo": "jun/2026", "assinado": true, "consistencia": "ok|atencao|problema", "observacao": "..." } ],
  "pendencias": ["documento ou esclarecimento a pedir, se houver"]
}`

function planilhaParaCsv(arquivo) {
  try {
    const XLSX = require('xlsx')
    const wb = XLSX.readFile(arquivo, { cellDates: true })
    let n = 0
    for (const nome of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[nome], { blankrows: false })
      if (!csv.trim()) continue
      const destino = `${arquivo}.${nome.replace(/[^\w\-]+/g, '_')}.csv`
      fs.writeFileSync(destino, csv, 'utf8')
      n++
    }
    return n
  } catch (e) {
    console.error('    planilha não converteu:', path.basename(arquivo), e.message)
    return 0
  }
}

function jsonDaResposta(texto) {
  const bloco = String(texto || '').match(/```json\s*([\s\S]*?)```/)
  const cru = bloco ? bloco[1] : String(texto || '').slice(String(texto || '').indexOf('{'), String(texto || '').lastIndexOf('}') + 1)
  return JSON.parse(cru)
}

/** Chamado solto a cada rodada da esteira. `crm` é a ponte já autenticada. */
export async function atenderComplementos({ crm, raiz, maquina }) {
  if (ocupado || !raiz) return
  ocupado = true
  let id = null
  const inicio = Date.now()
  try {
    const r = await crm('/api/esteira/complementos')
    if (!r.ok || !r.pedido) return
    id = r.pedido.id
    const pego = await crm('/api/esteira/complementos', { acao: 'pegar', id, maquina })
    if (!pego.ok || !pego.pegou) return

    console.log(`  Análise complementar: ${r.contexto?.analise?.razao_social ?? id} (${r.pedido.arquivos.length} arquivo(s))`)
    if (!r.pedido.arquivos.length) throw new Error(`Nenhum arquivo pôde ser baixado. ${(r.pedido.falhas || []).join(' · ')}`)

    const dir = path.join(DIR_TRABALHO, id)
    const docs = path.join(dir, 'documentos')
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(docs, { recursive: true })

    for (const a of r.pedido.arquivos) {
      const resp = await fetch(a.url)
      if (!resp.ok) throw new Error(`Não baixou ${a.nome} (HTTP ${resp.status}).`)
      const destino = path.join(docs, a.nome.replace(/[<>:"/\\|?*]+/g, '_'))
      fs.writeFileSync(destino, Buffer.from(await resp.arrayBuffer()))
      if (/\.(xlsx|xlsm|xls|ods)$/i.test(destino)) planilhaParaCsv(destino)
    }
    fs.writeFileSync(path.join(dir, 'contexto.json'), JSON.stringify({
      ...r.contexto,
      pedido_do_analista: r.pedido.instrucoes || null,
    }, null, 2), 'utf8')

    await crm('/api/esteira/complementos', { acao: 'progresso', id, mensagem: 'Lendo os documentos contra a análise anterior.' })

    const { rodar, eventoDaFerramenta, fraseDoEvento } = await import(pathToFileURL(path.join(raiz, '_sistema', 'ponte.mjs')).href)
    const entrada = PROMPT + (r.pedido.instrucoes ? `\n\nO ANALISTA PEDIU PARA CONFERIR EM ESPECIAL:\n${r.pedido.instrucoes}` : '')

    let resposta = ''
    let ultimoAviso = 0
    const res = await rodar({
      dir,
      args: [
        '--model', 'opus',
        '--permission-mode', 'default',
        '--allowedTools', 'Read', 'Grep', 'Glob',
        '--output-format', 'stream-json', '--verbose',
        '-p',
      ],
      entrada,
      limiteMs: LIMITE_MS,
      aoLinha: (ev) => {
        if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
          for (const b of ev.message.content) {
            const e = eventoDaFerramenta(b)
            if (!e || Date.now() - ultimoAviso < 8000) continue
            ultimoAviso = Date.now()
            crm('/api/esteira/complementos', { acao: 'progresso', id, mensagem: fraseDoEvento(e) || 'Lendo.' }).catch(() => {})
          }
        }
        if (ev.type === 'result' && typeof ev.result === 'string') resposta = ev.result
      },
    })
    if (!res.ok) throw new Error(res.motivo || 'O Claude não respondeu.')
    if (!resposta.trim()) throw new Error('O Claude terminou sem resposta. ' + String(res.erro || '').slice(0, 300))

    let resultado
    try { resultado = jsonDaResposta(resposta) } catch { throw new Error('A leitura não veio no formato esperado. Tente de novo.') }

    const g = await crm('/api/esteira/complementos', {
      acao: 'pronta', id, resultado, segundos: Math.round((Date.now() - inicio) / 1000),
    })
    if (!g.ok) throw new Error('O CRM recusou a leitura: ' + (g.erro || g.status))
    console.log('  Análise complementar pronta.')
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (e) {
    console.error('  Análise complementar falhou:', e.message)
    if (id) await crm('/api/esteira/complementos', { acao: 'erro', id, erro: e.message }).catch(() => {})
  } finally {
    ocupado = false
  }
}
