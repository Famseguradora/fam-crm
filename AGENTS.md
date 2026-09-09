<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# O design é um só, e ele está no código

Toda tela do CRM usa o mesmo padrão visual, decidido pelo Marco em 09/09/2026 a
partir do painel da IA Gestor. Vale para as telas que estão sendo refeitas
(Comercial, Funil, Análise, Tomadores) **e para todas as telas dentro delas**.

Antes de escrever qualquer tela, componente ou bloco visual:

1. Importe os tokens de `lib/ui/painel.ts`. **Não redigite hex.**
2. Use as peças de `components/painel/Painel.tsx` (`SecaoPainel`, `CartaoNumero`,
   `Moldura`, `AbasPainel`, `Aviso`) antes de criar peça nova.
3. Leia `docs/DESIGN-PAINEL.md` para o porquê de cada escolha e para as cinco
   decisões que fazem o padrão funcionar.
4. A referência viva é `components/ia/GestorGlobal.tsx`: na dúvida, abra o painel
   com Ctrl+I e copie o que ele faz.

**A regra de ouro é dele: o CRM não pode ter cara de IA.** Nada de caixa alta
espaçada, gradiente, glow ou roxo.

# Números de operação têm regra de negócio

Antes de somar operação em qualquer tela, leia o cabeçalho de `lib/ia/robo.ts`.
O LMG é capado em 80 milhões, as operações vivem em três mundos que **não se
somam** (emitida, funil, encerrada), e a taxa ponderada não é prêmio dividido
por LMG. Somar os três mundos junto já produziu um número errado numa tela de
diretoria.
