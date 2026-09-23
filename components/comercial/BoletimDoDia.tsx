'use client'

/* O BOLETIM DO DIA · o aviso que abre o expediente
   ═══════════════════════════════════════════════════════════════════════════

   Pedido dele em 17/09/2026: "precisa mostrar um aviso de e-mails que
   chegaram. Também pode fazer um aviso sobre relatório do dia anterior,
   informar que está pronto, e quando eu fizer análise e finalizar análise do
   dia em questão, apresente um aviso de quantas empresas eu analisei e quantas
   ainda faltam." E o exemplo que ele desenhou:

       Dia 16/09/2026
       5 E-mails elegíveis para análise
       XPTOT
       ABC

   São TRÊS avisos, e nessa ordem de importância:

     1. o dia fechado: as empresas daquele dia, quantas já foram e quantas
        faltam, com a lista nominal
     2. o que chegou HOJE, que por combinado ainda não entra na fila
     3. o "dia fechado", quando não falta mais nada — o único momento em que
        esta peça se dá por satisfeita

   A CONTA É DE `lib/email/fila.ts` (`montarBoletim`), pura e testada. Aqui só
   se desenha. E o número nunca é adjetivo: "5 empresas" é `itens.length`, não
   uma impressão.

   O NOME DA EMPRESA tem duas procedências, e a tela diz qual é: quando o caso
   já foi aberto, vem do cadastro; antes disso é lido do assunto, e aí aparece
   em tom normal com o assunto embaixo. Nome adivinhado com cara de cadastro
   seria a tela mentindo com confiança.

   Design: components/painel/Painel.tsx e lib/ui/painel.ts. Nenhum hex aqui. */

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Moldura, Aviso } from '@/components/painel/Painel'
import { cor, texto, raio, botaoVazado } from '@/lib/ui/painel'
import {
  diaPorExtenso, proximoDiaUtil,
  type Boletim, type ItemDoBoletim, type SituacaoBoletim,
} from '@/lib/email/fila'

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/* O RÓTULO DE CADA SITUAÇÃO. O verde é do que terminou, o azul é do que está
   andando, e o cinza é do que saiu sem virar análise. Vermelho NÃO entra aqui:
   e-mail esperando decisão é trabalho normal do dia, não falha — e alarme que
   toca todo dia vira paisagem. */
const SITUACAO: Record<SituacaoBoletim, { rotulo: string; cor: string; feito: boolean }> = {
  analisada: { rotulo: 'análise concluída', cor: cor.areaOperacao, feito: true },
  na_esteira: { rotulo: 'na esteira', cor: cor.acaoClara, feito: true },
  dispensada: { rotulo: 'fora da análise', cor: cor.textoFraco, feito: true },
  a_caminho: { rotulo: 'a caminho da esteira', cor: cor.ouroTexto, feito: false },
  falta: { rotulo: 'esperando você', cor: cor.tinta2, feito: false },
}

export default function BoletimDoDia({ boletim, chegaramHoje, agora, aoVerCaixa }: {
  boletim: Boletim
  /** Quantos e-mails elegíveis chegaram depois do corte (hoje). */
  chegaramHoje: number
  agora: Date
  /** Leva para a aba da caixa, onde o e-mail de hoje pode ser lido. */
  aoVerCaixa?: () => void
}) {
  const router = useRouter()
  const entram = useMemo(() => diaPorExtenso(proximoDiaUtil(agora)), [agora])

  /* A BARRA É A CONTA, e não um enfeite: a largura é feitas/empresas, em
     porcentagem. Sem empresa nenhuma ela não aparece — barra cheia num dia
     vazio pareceria dever cumprido. */
  const pct = boletim.empresas ? Math.round((boletim.feitas / boletim.empresas) * 100) : 0

  return (
    <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
      {/* ── 1. o que chegou hoje ─────────────────────────────────────────── */}
      {chegaramHoje > 0 && (
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
            background: cor.destaque, border: `1px solid ${cor.borda}`,
            borderRadius: raio.cartao, padding: '9px 12px',
          }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: cor.acao, flexShrink: 0 }} />
          <span style={{ ...texto.corpo, color: cor.tinta }}>
            <b>{plural(chegaramHoje, 'e-mail chegou', 'e-mails chegaram')} hoje</b>
            {' · '}
            {chegaramHoje === 1 ? 'ele entra' : 'eles entram'} na fila {entram}, quando hoje virar o dia anterior
          </span>
          {aoVerCaixa && (
            <button type="button" onClick={aoVerCaixa} style={{ ...botaoVazado, padding: '3px 10px', fontSize: 11.5 }}>
              ver na caixa
            </button>
          )}
        </div>
      )}

      {/* ── 2. o dia fechado ─────────────────────────────────────────────── */}
      {boletim.empresas === 0 ? (
        <Aviso>
          Nenhum pedido elegível em {boletim.diaTexto}. Dia sem trabalho novo dos seus remetentes.
        </Aviso>
      ) : (
        <Moldura
          titulo={`Relatório de ${boletim.diaTexto} · pronto`}
          origem="e-mails daquele dia, dos seus remetentes, que passaram na régua da caixa"
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px' }}>
            <span style={{ ...texto.numero, fontSize: 19 }}>
              {plural(boletim.empresas, 'empresa elegível', 'empresas elegíveis')} para análise
            </span>
            {boletim.emails !== boletim.empresas && (
              <span style={texto.nota}>em {plural(boletim.emails, 'e-mail', 'e-mails')}</span>
            )}
          </div>

          <div style={{ ...texto.apoio, marginTop: 4 }}>
            {boletim.fechado ? (
              <b style={{ color: cor.areaOperacao }}>
                Dia fechado: {boletim.empresas === 1 ? 'a empresa saiu' : `as ${boletim.empresas} saíram`} da fila.
              </b>
            ) : (
              <>
                Você já cuidou de <b style={{ color: cor.tinta }}>{boletim.feitas}</b>
                {' · '}
                <b style={{ color: cor.tinta }}>{plural(boletim.faltam, 'falta', 'faltam')}</b>
              </>
            )}
            {boletim.analisadas > 0 && (
              <> · {plural(boletim.analisadas, 'já tem análise concluída', 'já têm análise concluída')}</>
            )}
          </div>

          {/* A barra, fina e sólida. Nada de gradiente: o CRM não tem cara de IA. */}
          <div
            role="img"
            aria-label={`${boletim.feitas} de ${boletim.empresas} empresas já saíram da fila`}
            style={{ height: 5, background: cor.bordaSuave, borderRadius: 3, margin: '9px 0 11px', overflow: 'hidden' }}
          >
            <div style={{ width: `${pct}%`, height: '100%', background: boletim.fechado ? cor.areaOperacao : cor.acao }} />
          </div>

          <div>
            {boletim.itens.map((i) => (
              <Linha key={i.chave} item={i} aoAbrirCaso={(id) => router.push(`/comercial/${id}`)} />
            ))}
          </div>
        </Moldura>
      )}
    </div>
  )
}

function Linha({ item, aoAbrirCaso }: { item: ItemDoBoletim; aoAbrirCaso: (id: string) => void }) {
  const s = SITUACAO[item.situacao]
  const faltando = item.pendente
  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 8px',
        padding: '5px 0', borderTop: `1px solid ${cor.bordaSuave}`,
      }}
    >
      <span
        aria-hidden
        style={{ width: 6, height: 6, borderRadius: '50%', background: s.cor, flexShrink: 0, alignSelf: 'center' }}
      />
      <span style={{ ...texto.corpo, fontWeight: 600, color: faltando ? cor.tinta : cor.textoSub }}>
        {item.nome}
      </span>
      {/* Quando o nome veio do assunto, a tela diz isso em vez de fingir cadastro. */}
      {!item.firme && <span style={texto.nota}>lido do assunto</span>}
      <span style={{ ...texto.nota, color: s.cor }}>{s.rotulo}</span>
      <span style={{ flex: 1 }} />
      {item.caso_id && (
        <button
          type="button"
          onClick={() => aoAbrirCaso(item.caso_id as string)}
          style={{ ...botaoVazado, padding: '2px 9px', fontSize: 11 }}
        >
          {item.caso_numero ? `caso #${item.caso_numero}` : 'ver o caso'}
        </button>
      )}
    </div>
  )
}
