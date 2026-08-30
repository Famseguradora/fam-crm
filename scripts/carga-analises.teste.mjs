// Teste das funcoes de leitura da carga, com dados INVENTADOS de proposito.
// Nao toca no banco, nao toca no acervo. Roda com:
//   node scripts/carga-analises.teste.mjs
//
// O caso que justifica este arquivo: o `valorEmReais` do sistema de analises
// captura so os digitos, entao "-50.039" voltaria +50.039 e um prejuizo viraria
// lucro na tela do CRM. Aqui isso e travado por teste.

import { numeroBR, taxaPct, cnpjLimpo, cnpjsNoTexto, razaoComparavel, nomeiaMaisDeUma, mesmoNome, escalaDaUnidade, limiteDesmentido, temEscalaEscrita, valorComEscala, limiteAcimaDoTeto } from './carga-analises.mjs'

let ok = 0, falhou = 0
function e(o_que, deu, esperado) {
  const igual = JSON.stringify(deu) === JSON.stringify(esperado)
  if (igual) { ok++ } else { falhou++; console.log(`  FALHOU · ${o_que}\n     esperado ${JSON.stringify(esperado)}\n     deu      ${JSON.stringify(deu)}`) }
}

console.log('\n=== numeroBR: o que o balanco realmente tem ===')
e('milhar com centavos', numeroBR('40.251.323,94'), 40251323.94)
e('milhar sem centavos', numeroBR('30.238.513'), 30238513)
e('PREJUIZO com sinal', numeroBR('-50.039'), -50039)
e('prejuizo com centavos', numeroBR('-1.475.343,00'), -1475343)
e('sinal unicode', numeroBR('−50.039'), -50039)
e('entre parenteses', numeroBR('(50.039)'), -50039)
e('decimal simples', numeroBR('2,49'), 2.49)
e('inteiro pequeno', numeroBR('200'), 200)
e('zero e zero, nao nulo', numeroBR('0,00'), 0)
e('N/D vira nulo', numeroBR('N/D'), null)
e('N/A vira nulo', numeroBR('N/A'), null)
e('traco vira nulo', numeroBR('-'), null)
e('vazio vira nulo', numeroBR(''), null)
e('nulo vira nulo', numeroBR(null), null)
e('texto sem numero', numeroBR('nao informado'), null)
e('tira a tag', numeroBR('<b>1.234,56</b>'), 1234.56)
e('nbsp', numeroBR('1.234,56&nbsp;'), 1234.56)
e('com R$ na frente', numeroBR('R$ 2.858.549,71'), 2858549.71)

console.log('\n=== taxaPct: 129 de 131 sao assim, 2 nao ===')
e('taxa normal', taxaPct('2,23%'), 2.23)
e('taxa sem %', taxaPct('3,34'), 3.34)
e('taxa com 4 casas', taxaPct('0,7512%'), 0.7512)
e('traco vira nulo, NAO zero', taxaPct('-'), null)
e('vazio vira nulo', taxaPct(''), null)
e('fora de faixa vira nulo', taxaPct('250%'), null)

console.log('\n=== cnpjLimpo: 14 digitos ou nada ===')
e('formatado', cnpjLimpo('08.260.577/0001-44'), '08260577000144')
e('so digitos', cnpjLimpo('08260577000144'), '08260577000144')
e('curto demais', cnpjLimpo('123'), null)
e('DOIS CNPJs no campo nao viram um', cnpjLimpo('52.279.446/0001-09 (SPE) 30.258.297/0001-50 (holding)'), null)
e('texto sem cnpj', cnpjLimpo('sem CNPJ no Brasil'), null)
e('vazio', cnpjLimpo(''), null)

console.log('\n=== cnpjsNoTexto: candidatos, nunca escolha ===')
e('consorcio com dois', cnpjsNoTexto('52.279.446/0001-09 (SPE) 30.258.297/0001-50 (holding)'),
  ['52279446000109', '30258297000150'])
e('com barra vertical', cnpjsNoTexto('55.768.791/0001-96 (tomador) | 09.473.239/0001-53 (garantidora)'),
  ['55768791000196', '09473239000153'])
e('estrangeira sem cnpj', cnpjsNoTexto('Espanha - Reg. Mercantil de Madrid, tomo 1.148'), [])
e('nao repete', cnpjsNoTexto('11.111.111/1111-11 e 11.111.111/1111-11'), ['11111111111111'])

console.log('\n=== razaoComparavel: os casos reais de divergencia ===')
e('erro de digitacao NAO some',
  razaoComparavel('Bracon Incorporacoes e Articipações') === razaoComparavel('BRACON INCORPORACOES E PARTICIPACOES LTDA'), false)
e('tipo societario nao conta',
  razaoComparavel('Hyperion Engenharia S/A,') === razaoComparavel('HYPERION ENGENHARIA S/A'), true)
e('espaco no fim nao conta',
  razaoComparavel('Usina Pampa Sul S.a. ') === razaoComparavel('USINA PAMPA SUL S.A.'), true)
e('acento nao conta',
  razaoComparavel('Ute Paulinia Verde') === razaoComparavel('UTE Paulínia Verde'), true)
e('nome cortado NAO passa',
  razaoComparavel('Qualieng Engenharia') === razaoComparavel('QUALIENG ENGENHARIA DE MONTAGENS LTDA'), false)

console.log('\n=== nomeiaMaisDeUma: o que NAO pode virar sugestao em lote ===')
e('tomadora + holding', nomeiaMaisDeUma('WDS PRIME ALFREDO PUJOL EMPREEN. IMOB. LTDA (tomadora) NELLI INCORPORAÇÕES LTDA (holding)'), true)
e('spe + holding', nomeiaMaisDeUma('SIG 12 Empreendimentos (SPE) SIG Empreendimentos Imobiliarios (Holding)'), true)
e('dois LTDA', nomeiaMaisDeUma('ALFA CONSTRUCOES LTDA BETA INCORPORACOES LTDA'), true)
e('empresa normal passa', nomeiaMaisDeUma('BRACON INCORPORACOES E PARTICIPACOES LTDA'), false)
e('empresa normal S/A passa', nomeiaMaisDeUma('HYPERION ENGENHARIA S/A'), false)
e('vazio', nomeiaMaisDeUma(''), false)

console.log('\n=== mesmoNome: propoe o par, nunca aplica ===')
e('identico', !!mesmoNome('Bracon Incorporacoes Ltda', 'BRACON INCORPORACOES LTDA'), true)
e('CRM cortou o nome', !!mesmoNome('Qualieng Engenharia', 'QUALIENG ENGENHARIA DE MONTAGENS LTDA'), true)
e('erro de digitacao NAO propoe', mesmoNome('Construtora R. Yazebek Ltda', 'Construtora R. Yazbek Ltda'), null)
e('empresas diferentes NAO propoem', mesmoNome('Alfa Construcoes Ltda', 'Beta Incorporacoes Ltda'), null)
e('nome curto demais nao propoe', mesmoNome('ABC', 'ABC Engenharia Ltda'), null)
e('prefixo curto nao basta', mesmoNome('Usina Ltda', 'Usina Termeletrica Pampa Sul Ltda'), null)

console.log('\n=== valorComEscala: a escala abreviada que passou batido ===')
// Os tres casos reais que estavam gravados como limite CONFIAVEL de R$ 80,00.
e('80.0 milhoes', valorComEscala('R$ 80.0 milhões'), 80000000)
e('80.0 milhoes com parentese', valorComEscala('R$ 80.0 milhões (teto do contrato automático de resseguro por tomador)'), 80000000)
e('90M colado', valorComEscala('A Amper tem capacidade para afiançar os R$ 90M; a estrutura'), 90000000)
e('40 MM', valorComEscala('sublimite de resseguro de R$ 40 MM para a modalidade'), 40000000)
e('80,0 milhoes com virgula', valorComEscala('R$ 80,0 milhões (Teto FAM)'), 80000000)
e('bilhoes', valorComEscala('R$ 1,2 bilhões'), 1200000000)
// E o que NAO pode ganhar escala: valor ja escrito por extenso em reais.
e('valor cheio nao ganha escala', valorComEscala('R$ 2.858.549,71'), 2858549.71)
e('valor cheio com teto', valorComEscala('R$ 80.000.000,00 (Teto FAM por tomador)'), 80000000)
e('valor cheio com percentual', valorComEscala('R$ 5.683.800,00 (60% do PL)'), 5683800)
e('zero continua zero', valorComEscala('R$ 0,00'), 0)
e('sem numero', valorComEscala('Sem Recomendação'), null)

console.log('\n=== limiteAcimaDoTeto: o teto de R$ 80 milhoes por tomador ===')
// Medido antes de virar regra: 44 das 120 vigentes citam esse teto no texto,
// 20 param exatamente em 80.000.000, e o maior valor abaixo dele e 80.000.000.
e('Conasa, 75% do PL virando limite', limiteAcimaDoTeto(727192500), true)
e('Castilho, limite calculado', limiteAcimaDoTeto(242795271.83), true)
e('Itapema, 81,25MM passa por pouco', limiteAcimaDoTeto(81250000), true)
e('exatamente no teto NAO passa', limiteAcimaDoTeto(80000000), false)
e('um real abaixo do teto', limiteAcimaDoTeto(79999999), false)
e('limite normal', limiteAcimaDoTeto(2858549.71), false)
e('zero', limiteAcimaDoTeto(0), false)
e('nulo continua nulo', limiteAcimaDoTeto(null), false)

console.log('\n=== limiteDesmentido: os casos reais do acervo ===')
// A Conata: o parser pegou o ANO 2026 de dentro da frase e serviu como limite.
e('Conata, ano virando limite',
  !!limiteDesmentido('Nenhum limite concedido: Tomador bloqueado nesta data; Exposição zero até reanálise', 2026), true)
e('CP Construplan, BLOQUEADO',
  !!limiteDesmentido('BLOQUEADO Limite técnico calculado: R$ 95.455.962,28 (85% do PL)', 95455962.28), true)
e('BRNPAR, tecnico com teto menor',
  !!limiteDesmentido('Limite técnico de R$ 142.337.044,20 (60% do PL), porém recomenda-se operar com teto de R$ 80.000.000,00', 142337044.2), true)
e('Labutare, condicoes suspensivas',
  !!limiteDesmentido('R$ 35.583.821,79 (15% do PL) - sujeito às condições suspensivas abaixo', 35583821.79), true)
e('limite limpo passa',
  limiteDesmentido('R$ 2.858.549,71', 2858549.71), null)
e('limite limpo com percentual passa',
  limiteDesmentido('R$ 40.000.000,00 (60% do patrimônio líquido)', 40000000), null)
e('ZERO com texto que concorda e poupado',
  limiteDesmentido('R$ 0,00 (crédito não recomendado nesta data, ver Conclusão)', 0), null)
e('nulo continua nulo', limiteDesmentido('qualquer coisa', null), null)

console.log('\n=== temEscalaEscrita: celula ambigua ===')
e('celula com milhoes', temEscalaEscrita('R$ 12,5 milhões'), true)
e('celula com mil', temEscalaEscrita('450 mil'), true)
e('numero puro', temEscalaEscrita('40.251.323,94'), false)
e('N/D', temEscalaEscrita('N/D'), false)

console.log('\n=== escalaDaUnidade: as 19 grafias REAIS do acervo, mais as armadilhas ===')
// A armadilha central: "milhares" comeca com "milh". Testar /milh/ antes de
// /mil\b/ transformaria milhar em milhao, erro de mil vezes num balanco.
e('milhares NAO e milhoes', escalaDaUnidade('Em milhares de reais'), 1000)
e('R$ mil', escalaDaUnidade('R$ mil'), 1000)
e('R$ mil (consolidado)', escalaDaUnidade('R$ mil (consolidado)'), 1000)
e('R$ mil auditado', escalaDaUnidade('R$ mil (Consolidado, auditado pela Deloitte)'), 1000)
e('R$ mil com nome de auditoria', escalaDaUnidade('R$ mil (base: demonstrações CONSOLIDADAS auditadas pela Grant Thornton)'), 1000)
e('milhoes', escalaDaUnidade('R$ milhões ( conversão de EUR à taxa EUR/BRL 5,8893)'), 1000000)
e('milhao no singular', escalaDaUnidade('R$ milhão'), 1000000)
e('MM', escalaDaUnidade('R$ MM'), 1000000)
e('R$ puro', escalaDaUnidade('R$'), 1)
e('Reais', escalaDaUnidade('Reais'), 1)
e('Reais (R$)', escalaDaUnidade('Reais (R$)'), 1)
e('R$ (valores em reais)', escalaDaUnidade('R$ (valores em reais)'), 1)
e('R$ com frase longa', escalaDaUnidade('R$ (demonstrações consolidados - pessoa jurídica do tomador)'), 1)
e('texto sem escala vira NULO', escalaDaUnidade('unidade monetária desconhecida'), null)
e('vazio vira NULO', escalaDaUnidade(''), null)

console.log(`\n${ok} passaram · ${falhou} falharam`)
process.exit(falhou ? 1 : 0)
