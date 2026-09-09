// ============================================================================
//  Quando o CRM vira "celular" · `lib/ui/mobile.ts`
//
//  Fonte única. A mesma regra estava copiada em três lugares (DashboardShell,
//  InstallPrompt e o bloco de mobile do globals.css) e uma correção acertava
//  um e esquecia os outros dois.
//
//  A REGRA ANTIGA ERA `(max-width: 768px), (max-height: 600px)`, e a segunda
//  metade não perguntava a largura. Ela existia para o celular DEITADO: ao
//  girar o aparelho a largura passa de 768px (um iPhone deitado tem 844) mas a
//  altura cai para ~390px. O efeito colateral é que QUALQUER tela com 600px ou
//  menos de altura útil virava celular, inclusive um monitor de 1920px de
//  largura: com a escala do Windows em 150% um 1920x1080 vira 1280x720 em
//  pixels CSS, e descontada a barra do navegador sobra por volta de 600px. Daí
//  o sistema aparecer como app de celular "dependendo da máquina e do monitor".
//
//  A CORREÇÃO é perguntar pelo PONTEIRO, e não só pelo tamanho. `pointer:
//  coarse` quer dizer "a mira aqui é um dedo": é verdade num celular em pé ou
//  deitado, e não muda ao girar. Num desktop é sempre `fine`, por mais baixa
//  que a janela esteja. É o mesmo critério que o Financeiro já usa desde a
//  correção do `fam-financeiro/dashboard.html`, pelo mesmo motivo.
//
//  Em media query a vírgula é OU e o `and` amarra mais forte, então isto lê:
//      largura de celular   OU   (tela baixa E a mira é um dedo)
// ============================================================================

/** Media query que define o layout de celular. Use com `window.matchMedia`. */
export const MQ_MOBILE = '(max-width: 768px), (max-height: 600px) and (pointer: coarse)'
