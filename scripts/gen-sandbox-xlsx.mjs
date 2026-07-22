// ============================================================
//  Gera public/sandbox-dados.xlsx com dados FICTÍCIOS (5 por tabela).
//  Rode:  npm run sandbox:gen
//  Depois é só editar a planilha no Excel — nada de banco real.
// ============================================================
import * as XLSX from 'xlsx'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public', 'sandbox-dados.xlsx')

const T = '2026-06-01T12:00:00.000Z' // timestamp fixo (reprodutível)

// premio_previsto = min(lmg,80M) * taxa/100 * dias/365  (igual ao Postgres)
const premio = (lmg, taxa, dias) =>
  Math.round((Math.min(lmg, 80_000_000) * taxa / 100) * (dias / 365) * 100) / 100

const corretoras = [
  { id: 'corr-1', razao_social: 'Corretora Aurora Seguros Ltda', nome_fantasia: 'Aurora Seguros', cnpj: '11.111.111/0001-11', codigo_susep: '10001', email: 'contato@aurora.com.br', telefone: '(11) 3000-1001', cidade: 'São Paulo', estado: 'SP', status: 'ativo' },
  { id: 'corr-2', razao_social: 'Bandeirante Corretora de Seguros SA', nome_fantasia: 'Bandeirante', cnpj: '22.222.222/0001-22', codigo_susep: '10002', email: 'contato@bandeirante.com.br', telefone: '(19) 3000-1002', cidade: 'Campinas', estado: 'SP', status: 'ativo' },
  { id: 'corr-3', razao_social: 'Litoral Garantias Ltda', nome_fantasia: 'Litoral Garantias', cnpj: '33.333.333/0001-33', codigo_susep: '10003', email: 'contato@litoral.com.br', telefone: '(13) 3000-1003', cidade: 'Santos', estado: 'SP', status: 'ativo' },
  { id: 'corr-4', razao_social: 'Planalto Corretora Ltda', nome_fantasia: 'Planalto', cnpj: '44.444.444/0001-44', codigo_susep: '10004', email: 'contato@planalto.com.br', telefone: '(61) 3000-1004', cidade: 'Brasília', estado: 'DF', status: 'ativo' },
  { id: 'corr-5', razao_social: 'Sul Corretora de Seguros Ltda', nome_fantasia: 'Sul Seguros', cnpj: '55.555.555/0001-55', codigo_susep: '10005', email: 'contato@sul.com.br', telefone: '(51) 3000-1005', cidade: 'Porto Alegre', estado: 'RS', status: 'inativo' },
].map((c) => ({ ...c, created_at: T, updated_at: T }))

const produtos = [
  { id: 'prod-1', nome: 'Seguro Garantia', codigo: 'P01', descricao: 'Garantia para contratos públicos e privados' },
  { id: 'prod-2', nome: 'Garantia Judicial', codigo: 'P02', descricao: 'Substituição de depósito judicial' },
  { id: 'prod-3', nome: 'Garantia de Performance', codigo: 'P03', descricao: 'Garantia de execução de obra/serviço' },
  { id: 'prod-4', nome: 'Fiança Locatícia', codigo: 'P04', descricao: 'Garantia de aluguel' },
  { id: 'prod-5', nome: 'Garantia Aduaneira', codigo: 'P05', descricao: 'Garantia de tributos aduaneiros' },
].map((p) => ({ ...p, status: 'ativo', created_at: T, updated_at: T }))

const modalidades = [
  { id: 'mod-1', nome: 'Garantia de Concorrência', codigo_cobertura: '0432', produto_id: 'prod-1', grupo: 'Licitação' },
  { id: 'mod-2', nome: 'Garantia de Execução (Performance)', codigo_cobertura: '0435', produto_id: 'prod-3', grupo: 'Performance' },
  { id: 'mod-3', nome: 'Garantia Judicial Cível', codigo_cobertura: '0775', produto_id: 'prod-2', grupo: 'Judicial' },
  { id: 'mod-4', nome: 'Fiança Locatícia Residencial', codigo_cobertura: '0870', produto_id: 'prod-4', grupo: 'Locatícia' },
  { id: 'mod-5', nome: 'Garantia Aduaneira', codigo_cobertura: '0990', produto_id: 'prod-5', grupo: 'Aduaneira' },
].map((m) => ({ ...m, observacao: null, status: 'ativo', created_at: T, updated_at: T }))

const tomadores = [
  { id: 'tom-1', razao_social: 'Construtora Horizonte Ltda', nome_fantasia: 'Horizonte', cnpj: '01.001.001/0001-01', corretora_id: 'corr-1', cidade: 'São Paulo', estado: 'SP', porte: 'Middle', prioridade: 'Fluxo Normal', limite_aprovado: 5_000_000, status: 'Aprovado', ativo: true },
  { id: 'tom-2', razao_social: 'Engenharia Vale Verde SA', nome_fantasia: 'Vale Verde', cnpj: '02.002.002/0001-02', corretora_id: 'corr-2', cidade: 'Campinas', estado: 'SP', porte: 'Corporate', prioridade: 'Prioridade', limite_aprovado: 20_000_000, status: 'Aprovado', ativo: true },
  { id: 'tom-3', razao_social: 'Infra Brasil Participações SA', nome_fantasia: 'Infra Brasil', cnpj: '03.003.003/0001-03', corretora_id: 'corr-3', cidade: 'Santos', estado: 'SP', porte: 'Large', prioridade: 'Urgente', limite_aprovado: 50_000_000, status: 'Em Análise', ativo: true },
  { id: 'tom-4', razao_social: 'Pavimenta Obras Ltda', nome_fantasia: 'Pavimenta', cnpj: '04.004.004/0001-04', corretora_id: 'corr-4', cidade: 'Brasília', estado: 'DF', porte: 'Small', prioridade: 'Fluxo Normal', limite_aprovado: 1_200_000, status: 'Aguardando Análise', ativo: true },
  { id: 'tom-5', razao_social: 'Metalúrgica Sul Ltda', nome_fantasia: 'Metal Sul', cnpj: '05.005.005/0001-05', corretora_id: 'corr-5', cidade: 'Porto Alegre', estado: 'RS', porte: 'Middle', prioridade: 'Fluxo Normal', limite_aprovado: 8_000_000, status: 'Aprovado', ativo: true },
  // ── Tomadores extras: dão volume/variedade aos gráficos do Painel Gerencial.
  //    Distribuição desigual de propósito (corr-1 e corr-2 concentram) p/ Pareto.
  { id: 'tom-6', razao_social: 'Alfa Construções Ltda', nome_fantasia: 'Alfa', cnpj: '06.006.006/0001-06', corretora_id: 'corr-1', cidade: 'São Paulo', estado: 'SP', porte: 'Middle', prioridade: 'Fluxo Normal', limite_aprovado: 10_000_000, status: 'Aprovado', ativo: true, data_entrada: '2026-02-10' },
  { id: 'tom-7', razao_social: 'Ponte Nova Engenharia Ltda', nome_fantasia: 'Ponte Nova', cnpj: '07.007.007/0001-07', corretora_id: 'corr-1', cidade: 'Guarulhos', estado: 'SP', porte: 'Small', prioridade: 'Fluxo Normal', limite_aprovado: 4_000_000, status: 'Em Análise', ativo: true, data_entrada: '2026-04-05' },
  { id: 'tom-8', razao_social: 'Rodovias Unidas SA', nome_fantasia: 'Rodovias Unidas', cnpj: '08.008.008/0001-08', corretora_id: 'corr-2', cidade: 'Campinas', estado: 'SP', porte: 'Corporate', prioridade: 'Prioridade', limite_aprovado: 45_000_000, status: 'Aprovado', ativo: true, data_entrada: '2026-01-20' },
  { id: 'tom-9', razao_social: 'Saneamento Central Ltda', nome_fantasia: 'Saneamento Central', cnpj: '09.009.009/0001-09', corretora_id: 'corr-2', cidade: 'Ribeirão Preto', estado: 'SP', porte: 'Middle', prioridade: 'Fluxo Normal', limite_aprovado: 12_000_000, status: 'Aprovado', ativo: true, data_entrada: '2026-03-12' },
  { id: 'tom-10', razao_social: 'Porto Litoral Logística Ltda', nome_fantasia: 'Porto Litoral', cnpj: '10.010.010/0001-10', corretora_id: 'corr-3', cidade: 'Santos', estado: 'SP', porte: 'Large', prioridade: 'Prioridade', limite_aprovado: 30_000_000, status: 'Aprovado', ativo: true, data_entrada: '2026-03-28' },
  { id: 'tom-11', razao_social: 'Cerrado Construtora Ltda', nome_fantasia: 'Cerrado', cnpj: '11.011.011/0001-11', corretora_id: 'corr-4', cidade: 'Brasília', estado: 'DF', porte: 'Middle', prioridade: 'Fluxo Normal', limite_aprovado: 6_000_000, status: 'Em Análise', ativo: true, data_entrada: '2026-04-18' },
  { id: 'tom-12', razao_social: 'Gaúcha Metal Ltda', nome_fantasia: 'Gaúcha Metal', cnpj: '12.012.012/0001-12', corretora_id: 'corr-5', cidade: 'Caxias do Sul', estado: 'RS', porte: 'Small', prioridade: 'Fluxo Normal', limite_aprovado: 3_000_000, status: 'Aprovado', ativo: true, data_entrada: '2026-02-25' },
].map((t) => ({ ...t, data_entrada: t.data_entrada ?? '2026-05-15', created_at: T, updated_at: T }))

const opsRaw = [
  { id: 'op-1', tomador_id: 'tom-1', corretora_id: 'corr-1', corretor: 'João Pereira', produto_id: 'prod-1', modalidade: 'Garantia de Concorrência', codigo_cobertura: '0432', estado: 'SP', temperatura: 'Quente', prioridade: 'Fluxo Normal', lmg: 2_000_000, taxa: 0.8, vigencia_anos: 2, vigencia_dias: 730, status: 'Em Análise', data_emissao: null },
  // op-2 já está em Comitê COM parecer da subscrição e enviada ao WhatsApp —
  // serve para Marco ver o "julgamento" em andamento (1 voto já lançado).
  { id: 'op-2', tomador_id: 'tom-2', corretora_id: 'corr-2', corretor: 'Maria Souza', produto_id: 'prod-3', modalidade: 'Garantia de Execução (Performance)', codigo_cobertura: '0435', estado: 'SP', temperatura: 'Morno', prioridade: 'Prioridade', lmg: 10_000_000, taxa: 1.2, vigencia_anos: 3, vigencia_dias: 1095, status: 'Comitê', data_emissao: null,
    parecer_subscricao: 'Tomador com excelente histórico em obras públicas e índices de liquidez saudáveis. Risco dentro do apetite da carteira. Recomendo aprovação.', voto_subscricao: 'aprovado', subscritor_nome: 'Ivan Lima', comite_enviado_whatsapp: true },
  { id: 'op-3', tomador_id: 'tom-3', corretora_id: 'corr-3', corretor: 'Carlos Lima', produto_id: 'prod-2', modalidade: 'Garantia Judicial Cível', codigo_cobertura: '0775', estado: 'SP', temperatura: 'Quente', prioridade: 'Urgente', lmg: 30_000_000, taxa: 0.5, vigencia_anos: 1, vigencia_dias: 365, status: 'Aprovado', data_emissao: null },
  { id: 'op-4', tomador_id: 'tom-4', corretora_id: 'corr-4', corretor: 'Ana Castro', produto_id: 'prod-4', modalidade: 'Fiança Locatícia Residencial', codigo_cobertura: '0870', estado: 'DF', temperatura: 'Frio', prioridade: 'Fluxo Normal', lmg: 800_000, taxa: 2.0, vigencia_anos: 1, vigencia_dias: 365, status: 'Para Analisar', data_emissao: null },
  { id: 'op-5', tomador_id: 'tom-5', corretora_id: 'corr-5', corretor: 'Pedro Rocha', produto_id: 'prod-1', modalidade: 'Garantia de Concorrência', codigo_cobertura: '0432', estado: 'RS', temperatura: 'Morno', prioridade: 'Fluxo Normal', lmg: 5_000_000, taxa: 0.9, vigencia_anos: 2, vigencia_dias: 730, status: 'Emitido', data_emissao: '2026-06-10' },
  // ── Operações extras: volume/variedade p/ Pareto, Treemap, Sankey e histórico
  //    mensal. corr-1 e corr-2 concentram prêmio (80/20). Datas espalhadas.
  { id: 'op-6', tomador_id: 'tom-6', corretora_id: 'corr-1', corretor: 'João Pereira', produto_id: 'prod-1', modalidade: 'Garantia de Concorrência', codigo_cobertura: '0432', estado: 'SP', temperatura: 'Quente', prioridade: 'Fluxo Normal', lmg: 8_000_000, taxa: 1.0, vigencia_anos: 2, vigencia_dias: 730, status: 'Emitido', data_entrada: '2026-02-03', data_emissao: '2026-02-20' },
  { id: 'op-7', tomador_id: 'tom-6', corretora_id: 'corr-1', corretor: 'João Pereira', produto_id: 'prod-3', modalidade: 'Garantia de Execução (Performance)', codigo_cobertura: '0435', estado: 'SP', temperatura: 'Quente', prioridade: 'Prioridade', lmg: 15_000_000, taxa: 0.9, vigencia_anos: 1, vigencia_dias: 365, status: 'Aprovado', data_entrada: '2026-03-08', data_emissao: null },
  { id: 'op-8', tomador_id: 'tom-7', corretora_id: 'corr-1', corretor: 'João Pereira', produto_id: 'prod-2', modalidade: 'Garantia Judicial Cível', codigo_cobertura: '0775', estado: 'SP', temperatura: 'Morno', prioridade: 'Fluxo Normal', lmg: 3_000_000, taxa: 1.1, vigencia_anos: 1, vigencia_dias: 365, status: 'Em Análise', data_entrada: '2026-04-15', data_emissao: null },
  { id: 'op-9', tomador_id: 'tom-1', corretora_id: 'corr-1', corretor: 'João Pereira', produto_id: 'prod-1', modalidade: 'Garantia de Concorrência', codigo_cobertura: '0432', estado: 'SP', temperatura: 'Quente', prioridade: 'Fluxo Normal', lmg: 12_000_000, taxa: 0.85, vigencia_anos: 2, vigencia_dias: 730, status: 'Emitido', data_entrada: '2026-01-10', data_emissao: '2026-01-25' },
  { id: 'op-10', tomador_id: 'tom-8', corretora_id: 'corr-2', corretor: 'Maria Souza', produto_id: 'prod-3', modalidade: 'Garantia de Execução (Performance)', codigo_cobertura: '0435', estado: 'SP', temperatura: 'Quente', prioridade: 'Prioridade', lmg: 40_000_000, taxa: 0.7, vigencia_anos: 3, vigencia_dias: 1095, status: 'Emitido', data_entrada: '2026-03-02', data_emissao: '2026-03-22' },
  { id: 'op-11', tomador_id: 'tom-8', corretora_id: 'corr-2', corretor: 'Maria Souza', produto_id: 'prod-1', modalidade: 'Garantia de Concorrência', codigo_cobertura: '0432', estado: 'SP', temperatura: 'Morno', prioridade: 'Fluxo Normal', lmg: 25_000_000, taxa: 0.8, vigencia_anos: 2, vigencia_dias: 730, status: 'Aprovado', data_entrada: '2026-05-05', data_emissao: null },
  { id: 'op-12', tomador_id: 'tom-9', corretora_id: 'corr-2', corretor: 'Maria Souza', produto_id: 'prod-5', modalidade: 'Garantia Aduaneira', codigo_cobertura: '0990', estado: 'SP', temperatura: 'Morno', prioridade: 'Fluxo Normal', lmg: 6_000_000, taxa: 1.0, vigencia_anos: 1, vigencia_dias: 365, status: 'Emitido', data_entrada: '2026-06-01', data_emissao: '2026-06-15' },
  { id: 'op-13', tomador_id: 'tom-2', corretora_id: 'corr-2', corretor: 'Maria Souza', produto_id: 'prod-3', modalidade: 'Garantia de Execução (Performance)', codigo_cobertura: '0435', estado: 'SP', temperatura: 'Quente', prioridade: 'Prioridade', lmg: 18_000_000, taxa: 0.95, vigencia_anos: 2, vigencia_dias: 730, status: 'Em Análise', data_entrada: '2026-06-20', data_emissao: null },
  { id: 'op-14', tomador_id: 'tom-10', corretora_id: 'corr-3', corretor: 'Carlos Lima', produto_id: 'prod-3', modalidade: 'Garantia de Execução (Performance)', codigo_cobertura: '0435', estado: 'SP', temperatura: 'Quente', prioridade: 'Prioridade', lmg: 22_000_000, taxa: 0.75, vigencia_anos: 2, vigencia_dias: 730, status: 'Emitido', data_entrada: '2026-04-04', data_emissao: '2026-04-24' },
  { id: 'op-15', tomador_id: 'tom-10', corretora_id: 'corr-3', corretor: 'Carlos Lima', produto_id: 'prod-1', modalidade: 'Garantia de Concorrência', codigo_cobertura: '0432', estado: 'SP', temperatura: 'Morno', prioridade: 'Fluxo Normal', lmg: 9_000_000, taxa: 0.9, vigencia_anos: 1, vigencia_dias: 365, status: 'Aprovado', data_entrada: '2026-05-14', data_emissao: null },
  { id: 'op-16', tomador_id: 'tom-3', corretora_id: 'corr-3', corretor: 'Carlos Lima', produto_id: 'prod-2', modalidade: 'Garantia Judicial Cível', codigo_cobertura: '0775', estado: 'SP', temperatura: 'Quente', prioridade: 'Urgente', lmg: 14_000_000, taxa: 0.6, vigencia_anos: 1, vigencia_dias: 365, status: 'Comitê', data_entrada: '2026-07-02', data_emissao: null },
  { id: 'op-17', tomador_id: 'tom-11', corretora_id: 'corr-4', corretor: 'Ana Castro', produto_id: 'prod-4', modalidade: 'Fiança Locatícia Residencial', codigo_cobertura: '0870', estado: 'DF', temperatura: 'Frio', prioridade: 'Fluxo Normal', lmg: 4_000_000, taxa: 1.3, vigencia_anos: 1, vigencia_dias: 365, status: 'Emitido', data_entrada: '2026-02-08', data_emissao: '2026-02-28' },
  { id: 'op-18', tomador_id: 'tom-11', corretora_id: 'corr-4', corretor: 'Ana Castro', produto_id: 'prod-1', modalidade: 'Garantia de Concorrência', codigo_cobertura: '0432', estado: 'DF', temperatura: 'Frio', prioridade: 'Fluxo Normal', lmg: 2_500_000, taxa: 1.5, vigencia_anos: 1, vigencia_dias: 365, status: 'Para Analisar', data_entrada: '2026-07-05', data_emissao: null },
  { id: 'op-19', tomador_id: 'tom-4', corretora_id: 'corr-4', corretor: 'Ana Castro', produto_id: 'prod-4', modalidade: 'Fiança Locatícia Residencial', codigo_cobertura: '0870', estado: 'DF', temperatura: 'Frio', prioridade: 'Fluxo Normal', lmg: 1_500_000, taxa: 1.8, vigencia_anos: 1, vigencia_dias: 365, status: 'Aprovado', data_entrada: '2026-06-11', data_emissao: null },
  { id: 'op-20', tomador_id: 'tom-12', corretora_id: 'corr-5', corretor: 'Pedro Rocha', produto_id: 'prod-1', modalidade: 'Garantia de Concorrência', codigo_cobertura: '0432', estado: 'RS', temperatura: 'Morno', prioridade: 'Fluxo Normal', lmg: 3_500_000, taxa: 1.0, vigencia_anos: 1, vigencia_dias: 365, status: 'Emitido', data_entrada: '2026-03-06', data_emissao: '2026-03-26' },
  { id: 'op-21', tomador_id: 'tom-5', corretora_id: 'corr-5', corretor: 'Pedro Rocha', produto_id: 'prod-3', modalidade: 'Garantia de Execução (Performance)', codigo_cobertura: '0435', estado: 'RS', temperatura: 'Morno', prioridade: 'Fluxo Normal', lmg: 2_000_000, taxa: 1.1, vigencia_anos: 2, vigencia_dias: 730, status: 'Em Análise', data_entrada: '2026-05-19', data_emissao: null },
]
const operacoes = opsRaw.map((o) => ({
  ...o,
  premio_previsto: premio(o.lmg, o.taxa, o.vigencia_dias),
  periodicidade_vigencia: 'anos',
  observacao: null, ativo: true, data_entrada: o.data_entrada ?? '2026-05-20',
  // ── Julgamento do Comitê (defaults; op-2 já vem preenchida) ──
  parecer_subscricao: o.parecer_subscricao ?? null,
  voto_subscricao: o.voto_subscricao ?? null,
  subscritor_nome: o.subscritor_nome ?? null,
  comite_enviado_whatsapp: o.comite_enviado_whatsapp ?? false,
  comite_parecer_final: null,
  comite_encerrado: false,
  comite_vista_por: null,
  comite_vista_cargo: null,
  comite_vista_justificativa: null,
  created_at: T, updated_at: T,
}))

const status_fluxo_operacao = [
  { id: 'sfo-1', nome: 'Para Analisar', cor: '#6b7280', base: true, ordem: 1 },
  { id: 'sfo-2', nome: 'Em Análise', cor: '#3b82f6', base: false, ordem: 2 },
  { id: 'sfo-3', nome: 'Comitê', cor: '#a855f7', base: false, ordem: 3 },
  { id: 'sfo-4', nome: 'Aprovado', cor: '#22c55e', base: false, ordem: 4 },
  { id: 'sfo-5', nome: 'Emitido', cor: '#16a34a', base: false, ordem: 5 },
].map((s) => ({ ...s, ativo: true, created_at: T }))

const status_fluxo_tomador = [
  { id: 'sft-1', nome: 'Aguardando Análise', cor: '#6b7280', base: true, ordem: 1 },
  { id: 'sft-2', nome: 'Em Análise', cor: '#3b82f6', base: false, ordem: 2 },
  { id: 'sft-3', nome: 'Aprovado', cor: '#22c55e', base: false, ordem: 3 },
  { id: 'sft-4', nome: 'Reprovado', cor: '#ef4444', base: false, ordem: 4 },
  { id: 'sft-5', nome: 'Inativo', cor: '#9ca3af', base: false, ordem: 5 },
].map((s) => ({ ...s, ativo: true, created_at: T }))

// `comite: true` = diretor votante do Julgamento (recebe o convite no WhatsApp
// simulado quando há telefone). Ivan Lima é o Subscritor que envia ao comitê.
const usuarios = [
  { id: 'usr-1', auth_id: 'sandbox-user', nome: 'Marco Dragone', email: 'sandbox@fam.local', telefone: '(11) 90000-0001', cargo: 'Diretor de Tecnologia', perfil: 'admin', status: 'ativo', primeiro_acesso: false, proprietario: true, pode_publicar_avisos: true, comite: true },
  { id: 'usr-2', auth_id: 'sb-auth-2', nome: 'Ivan Lima', email: 'ivan@fam.local', telefone: '(11) 90000-0002', cargo: 'Subscritor', perfil: 'usuario', status: 'ativo', primeiro_acesso: false, proprietario: false, pode_publicar_avisos: false, comite: false },
  { id: 'usr-3', auth_id: 'sb-auth-3', nome: 'Sérgio Macedo', email: 'sergio@fam.local', telefone: '(11) 90000-0003', cargo: 'Diretor de Subscrição', perfil: 'admin', status: 'ativo', primeiro_acesso: false, proprietario: false, pode_publicar_avisos: false, comite: true },
  { id: 'usr-4', auth_id: 'sb-auth-4', nome: 'Abenaias Costa', email: 'abenaias@fam.local', telefone: '(11) 90000-0004', cargo: 'Diretor-Presidente', perfil: 'admin', status: 'ativo', primeiro_acesso: false, proprietario: false, pode_publicar_avisos: false, comite: true },
  { id: 'usr-5', auth_id: 'sb-auth-5', nome: 'Diego Martins', email: 'diego@fam.local', telefone: '(11) 90000-0005', cargo: 'Diretor Comercial', perfil: 'admin', status: 'ativo', primeiro_acesso: false, proprietario: false, pode_publicar_avisos: true, comite: true },
  { id: 'usr-6', auth_id: 'sb-auth-6', nome: 'Beatriz Almeida', email: 'beatriz@fam.local', telefone: '(11) 90000-0006', cargo: 'Analista de Risco', perfil: 'usuario', status: 'ativo', primeiro_acesso: false, proprietario: false, pode_publicar_avisos: false, comite: false },
].map((u) => ({ ...u, created_at: T, updated_at: T }))

const metas_negocio = [
  { id: 'meta-1', periodo: '2026-06', tipo: 'mensal', premio_meta: 500_000, lmg_meta: 50_000_000, taxa_media_ponderada_meta: 0.9, qtd_operacoes_meta: 12 },
  { id: 'meta-2', periodo: '2026', tipo: 'anual', premio_meta: 6_000_000, lmg_meta: 600_000_000, taxa_media_ponderada_meta: 0.9, qtd_operacoes_meta: 140 },
  { id: 'meta-3', periodo: '2026-05', tipo: 'mensal', premio_meta: 480_000, lmg_meta: 48_000_000, taxa_media_ponderada_meta: 0.9, qtd_operacoes_meta: 11 },
  { id: 'meta-4', periodo: '2026-07', tipo: 'mensal', premio_meta: 520_000, lmg_meta: 52_000_000, taxa_media_ponderada_meta: 0.9, qtd_operacoes_meta: 13 },
  { id: 'meta-5', periodo: '2025', tipo: 'anual', premio_meta: 5_200_000, lmg_meta: 520_000_000, taxa_media_ponderada_meta: 0.95, qtd_operacoes_meta: 120 },
].map((m) => ({ ...m, risco_judicial: null, sinistralidade_aceitavel: null, observacao: null, criado_por: 'Marco Dragone', created_at: T, updated_at: T }))

const comite_comentarios = [
  { id: 'cc-1', operacao_id: 'op-2', autor: 'Rafael Nunes', comentario: 'Solicitar balanço auditado do tomador.', tipo: 'condicao', created_at: T },
  { id: 'cc-2', operacao_id: 'op-2', autor: 'Beatriz Almeida', comentario: 'Tomador com bom histórico de obras.', tipo: 'geral', created_at: T },
  { id: 'cc-3', operacao_id: 'op-3', autor: 'Diego Martins', comentario: 'Aprovado em comitê com taxa mínima.', tipo: 'aprovacao', created_at: T },
  { id: 'cc-4', operacao_id: 'op-3', autor: 'Rafael Nunes', comentario: 'Limitar LMG a R$ 30M.', tipo: 'restricao', created_at: T },
  { id: 'cc-5', operacao_id: 'op-1', autor: 'Camila Ferreira', comentario: 'Aguardando documentação da concorrência.', tipo: 'geral', created_at: T },
]

// Votos do Comitê (Julgamento). op-2 já tem 1 voto: Sérgio Macedo acompanhou
// o Subscritor (Ivan Lima votou "aprovado"). Faltam 3 diretores votarem.
const comite_votos = [
  { id: 'cv-1', operacao_id: 'op-2', usuario_id: 'usr-3', autor: 'Sérgio Macedo', cargo: 'Diretor de Subscrição', voto: 'aprovado', segue_subscritor: true, argumentacao: 'Acompanho o parecer da subscrição. Operação alinhada ao apetite.', canal: 'whatsapp', created_at: T, updated_at: T },
]

const socios = [
  { id: 'soc-1', tomador_id: 'tom-1', parent_socio_id: null, nome_razao_social: 'José Horizonte', documento: '111.111.111-11', tipo_pessoa: 'PF', percentual: 60, categoria: 'socio', cargo: 'Sócio-administrador', ordem: 1 },
  { id: 'soc-2', tomador_id: 'tom-1', parent_socio_id: null, nome_razao_social: 'Marina Horizonte', documento: '222.222.222-22', tipo_pessoa: 'PF', percentual: 40, categoria: 'socio', cargo: 'Sócia', ordem: 2 },
  { id: 'soc-3', tomador_id: 'tom-2', parent_socio_id: null, nome_razao_social: 'Vale Verde Holding SA', documento: '99.999.999/0001-99', tipo_pessoa: 'PJ', percentual: 100, categoria: 'socio', cargo: null, ordem: 1 },
  { id: 'soc-4', tomador_id: 'tom-3', parent_socio_id: null, nome_razao_social: 'Antonio Infra', documento: '333.333.333-33', tipo_pessoa: 'PF', percentual: 70, categoria: 'socio', cargo: 'Diretor', ordem: 1 },
  { id: 'soc-5', tomador_id: 'tom-3', parent_socio_id: null, nome_razao_social: 'Lucia Infra', documento: '444.444.444-44', tipo_pessoa: 'PF', percentual: 30, categoria: 'diretor', cargo: 'Diretora Financeira', ordem: 2 },
].map((s) => ({ ...s, ativo: true, created_at: T, updated_at: T }))

const avisos = [
  { id: 'av-1', mensagem: 'Bem-vindo ao ambiente de testes (Sandbox) do FAM CRM!', tipo: 'info', ativo: true, expira_em: '2026-12-31T23:59:59.000Z', criado_por_auth_id: 'sandbox-user', criado_por_nome: 'Marco Dragone', criado_em: T, atualizado_em: null },
  { id: 'av-2', mensagem: 'Parabéns! Meta de prêmio de maio batida. 🎉', tipo: 'parabens', ativo: true, expira_em: '2026-12-31T23:59:59.000Z', criado_por_auth_id: 'sandbox-user', criado_por_nome: 'Marco Dragone', criado_em: T, atualizado_em: null },
  { id: 'av-3', mensagem: 'Atenção: revisar operações em comitê até sexta.', tipo: 'alerta', ativo: true, expira_em: '2026-12-31T23:59:59.000Z', criado_por_auth_id: 'sandbox-user', criado_por_nome: 'Marco Dragone', criado_em: T, atualizado_em: null },
  { id: 'av-4', mensagem: 'Nova modalidade Aduaneira disponível para cotação.', tipo: 'info', ativo: false, expira_em: '2026-12-31T23:59:59.000Z', criado_por_auth_id: 'sandbox-user', criado_por_nome: 'Marco Dragone', criado_em: T, atualizado_em: null },
  { id: 'av-5', mensagem: 'Lembrete: backup do sistema roda Seg/Qua/Sex.', tipo: 'info', ativo: true, expira_em: '2026-12-31T23:59:59.000Z', criado_por_auth_id: 'sandbox-user', criado_por_nome: 'Marco Dragone', criado_em: T, atualizado_em: null },
]

const configuracoes_sistema = [
  { id: 'cfg-1', chave: 'data_inicio_calculos', valor: '2026-01-01', created_at: T, updated_at: T },
]

const fam_skills_global = [
  { id: 'sk-1', titulo: 'Análise de Risco de Crédito', versao: '1.0', ativo: true, created_at: T },
  { id: 'sk-2', titulo: 'Resumo de Operação', versao: '1.0', ativo: true, created_at: T },
]

// Tabelas que começam vazias (o app insere nelas durante o uso)
const fam_skills_usuario = []
const audit_log = []
// Anexo de exemplo: a análise de crédito do tomador da op-2 (em Comitê), para os
// diretores consultarem na Deliberação. (Arquivo fictício; storage é simulado.)
const anexos = [
  { id: 'anx-1', entidade_tipo: 'tomador', entidade_id: 'tom-2', tomador_id: 'tom-2', nome_original: 'Analise_de_Credito_Engenharia_Vale_Verde.pdf', storage_path: 'tomador/tom-2/analise_credito.pdf', tipo_mime: 'application/pdf', tamanho_bytes: 248000, created_at: T },
]

const SHEETS = {
  corretoras, produtos, modalidades, tomadores, operacoes,
  status_fluxo_operacao, status_fluxo_tomador, usuarios, metas_negocio,
  comite_comentarios, comite_votos, socios, avisos, configuracoes_sistema,
  fam_skills_global, fam_skills_usuario, audit_log, anexos,
}

const wb = XLSX.utils.book_new()
for (const [name, rows] of Object.entries(SHEETS)) {
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, name)
}
XLSX.writeFile(wb, OUT)
console.log(`✅ Planilha sandbox gerada: ${OUT}`)
console.log(`   ${Object.keys(SHEETS).length} abas (tabelas), 5 registros nas principais.`)
