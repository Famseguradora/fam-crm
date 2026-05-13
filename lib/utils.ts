// Formata valor em moeda BRL: R$ 1.250.000,00
export function fmtMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor)) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor)
}

// Formata percentual: 12,50%
export function fmtPercent(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor)) return '—'
  return (valor * 100).toFixed(2).replace('.', ',') + '%'
}

// Capitaliza nome próprio: "MARCO DRAGONE" → "Marco Dragone"
export function titleCase(str: string): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .replace(/(?:^|\s|[-/])\S/g, (c) => c.toUpperCase())
}

// Máscara CNPJ: 12345678000195 → 12.345.678/0001-95
export function maskCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

// Máscara CPF: 12345678909 → 123.456.789-09
export function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

// Máscara telefone/celular dinâmica
export function maskTelefone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

// Máscara moeda BRL: 500000000 → 5.000.000,00
export function maskMoeda(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  const num = parseInt(digits, 10)
  return (num / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Máscara CEP: 01310100 → 01310-100
export function maskCEP(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.replace(/(\d{5})(\d)/, '$1-$2')
}

// Valida CNPJ (algoritmo módulo 11 Receita Federal)
export function validarCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return false
  if (/^(\d)\1+$/.test(digits)) return false

  const calc = (d: string, weights: number[]) => {
    const sum = d.split('').reduce((acc, n, i) => acc + parseInt(n) * weights[i], 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const d1 = calc(digits.slice(0, 12), w1)
  const d2 = calc(digits.slice(0, 13), w2)
  return parseInt(digits[12]) === d1 && parseInt(digits[13]) === d2
}

// Valida CPF (algoritmo módulo 11 Receita Federal)
export function validarCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '')
  if (digits.length !== 11) return false
  if (/^(\d)\1+$/.test(digits)) return false

  const calc = (d: string, len: number) => {
    const sum = d.split('').reduce((acc, n, i) => acc + parseInt(n) * (len + 1 - i), 0)
    const r = (sum * 10) % 11
    return r === 10 || r === 11 ? 0 : r
  }
  const d1 = calc(digits.slice(0, 9), 9)
  const d2 = calc(digits.slice(0, 10), 10)
  return parseInt(digits[9]) === d1 && parseInt(digits[10]) === d2
}

// Retorna classe de badge conforme status da operação
export function badgeClassOperacao(status: string): string {
  const s = (status || '').toLowerCase()
  if (s.includes('fechado')) return 'badge-green'
  if (s.includes('aprovad')) return 'badge-blue'
  if (s.includes('negado') || s.includes('recusad') || s.includes('perdido')) return 'badge-red'
  if (s.includes('standby')) return 'badge-orange'
  if (s.includes('analis') || s.includes('anális')) return 'badge-yellow'
  if (s.includes('aguardando')) return 'badge-purple'
  return 'badge-gray'
}

// Retorna classe de badge conforme status do tomador
export function badgeClassTomador(status: string): string {
  const s = (status || '').toLowerCase()
  if (s.includes('recusada')) return 'badge-red'
  if (s.includes('não cadastrada') || s.includes('nao cadastrada')) return 'badge-gray'
  if (s.includes('aguardando')) return 'badge-purple'
  if (s.includes('criada')) return 'badge-yellow'
  if (s.includes('ativo') || s.includes('formalizada') || s.includes('assinado')) return 'badge-green'
  if (s.includes('gerado') || s.includes('criado')) return 'badge-blue'
  return 'badge-gray'
}

// Retorna classe de badge para perfil de usuário
export function badgeClassPerfil(perfil: string): string {
  return perfil === 'admin' ? 'badge-blue' : 'badge-gray'
}

// Retorna classe de badge para status de usuário
export function badgeClassStatus(status: string): string {
  return status === 'ativo' ? 'badge-green' : 'badge-red'
}

// Formata data para exibição: 2026-05-10 → 10/05/2026
export function fmtData(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Data por extenso
export function fmtDataExtenso(date: Date = new Date()): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}
