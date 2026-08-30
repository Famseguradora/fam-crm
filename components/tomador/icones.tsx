// ============================================================================
//  Ícones da Mesa do Tomador — SVG inline, sem biblioteca.
//
//  O projeto não tem pacote de ícones e não é hora de trazer um: são oito
//  desenhos de traço, e cada um cabe em quatro linhas. Todos herdam a cor do
//  pai (`currentColor`) e o traço tem a mesma espessura, para a fileira não
//  ficar desalinhada.
// ============================================================================

interface P { size?: number }

const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
})

export const IcoVisao = ({ size = 17 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M15.5 8.5l-2 5-5 2 2-5z" />
  </svg>
)

export const IcoDoc = ({ size = 17 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h5M9 17h3" />
  </svg>
)

export const IcoEscudo = ({ size = 17 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" />
  </svg>
)

export const IcoCheck = ({ size = 17 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.2l2.4 2.4 4.6-4.9" />
  </svg>
)

export const IcoCalendario = ({ size = 17 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
  </svg>
)

export const IcoRede = ({ size = 17 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <circle cx="12" cy="5" r="2.2" /><circle cx="5.5" cy="18.5" r="2.2" /><circle cx="18.5" cy="18.5" r="2.2" />
    <path d="M12 7.2v4.3M12 11.5H6.5a1 1 0 0 0-1 1v3.8M12 11.5h5.5a1 1 0 0 1 1 1v3.8" />
  </svg>
)

export const IcoGrafico = ({ size = 17 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
)

export const IcoRelogio = ({ size = 17 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.3 2" />
  </svg>
)

export const IcoBalanca = ({ size = 17 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M12 4v16M7 20h10M4.5 9h15M12 4.5L4.5 9M12 4.5L19.5 9" />
    <path d="M2 14.5a2.5 2.5 0 0 0 5 0L4.5 9zM17 14.5a2.5 2.5 0 0 0 5 0L19.5 9z" />
  </svg>
)

export const IcoPercent = ({ size = 17 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M19 5L5 19" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" />
  </svg>
)

export const IcoCarteira = ({ size = 17 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5H17a2 2 0 0 1 2 2v1" />
    <rect x="3.5" y="7.5" width="17" height="11.5" rx="2" />
    <path d="M20.5 12h-3.6a1.7 1.7 0 0 0 0 3.4h3.6" />
  </svg>
)

export const IcoInfo = ({ size = 16 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none" />
  </svg>
)

export const IcoBaixar = ({ size = 15 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M12 4v10M8 10.5l4 4 4-4M4.5 19h15" />
  </svg>
)

export const IcoVoltar = ({ size = 15 }: P) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M14.5 6l-6 6 6 6" />
  </svg>
)
