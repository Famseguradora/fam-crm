'use client'

/* ENTRADA DO COMERCIAL — a primeira estação da esteira, dentro do CRM.

   DUAS ESTRADAS ATÉ O MESMO LUGAR, e é assim de propósito. Ordem do Marco em
   07/09/2026: "sempre temos que ter a estrada principal e a redundante, ou
   seja, caso a opção 1 dê problema, a opção 2 não deixa a empresa parar".

     principal    a Caixa de entrada: os e-mails aparecem na tela, a pessoa lê,
                  vê os anexos e escolhe qual vira demanda
     redundante   arrastar o .msg/.eml, de qualquer lugar, quando a máquina do
                  Comercial estiver parada

   As duas terminam na MESMA regra (`lib/casos/abrir-por-email.ts`), então o
   caso nasce igual, com o mesmo checklist, tenha entrado por onde tiver
   entrado. Duas estradas, uma regra.

   O upload fica recolhido, e não some: ele é saída de emergência, não o caminho
   de todo dia. Era o contrário na primeira versão desta tela, e estava errado. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { fmtData } from '@/lib/utils'
import Caixa from './Caixa'
import PainelEmail from '@/components/comercial/PainelEmail'
import NovoPedido from '@/components/comercial/NovoPedido'
import LigarOutlook from '@/components/comercial/LigarOutlook'
import PainelGestaoEsteira from '@/components/comercial/PainelGestaoEsteira'
import FilaDoDia from '@/components/comercial/FilaDoDia'
import { SecaoPainel, CartaoNumero, Moldura, GradeCartoes, AbasPainel } from '@/components/painel/Painel'
import { cor, corDaArea, texto, botaoVazado, raio } from '@/lib/ui/painel'
import { useLembrado } from '@/lib/ui/lembrar'

type Aba = 'fila' | 'email' | 'painel'
const ehAba = (v: unknown): v is Aba => v === 'fila' || v === 'email' || v === 'painel'

interface Caso {
  id: string
  numero: number
  assunto: string
  remetente_nome: string | null
  remetente_email: string | null
  recebido_em: string | null
  cnpj: string | null
  razao_social: string | null
  etapa: string
  criado_em: string
  criado_por_nome: string | null
  tomador_id: string | null
}

const ETAPA_BADGE: Record<string, { classe: string; rotulo: string }> = {
  comercial: { classe: 'badge-gray', rotulo: 'Comercial' },
  triagem: { classe: 'badge-orange', rotulo: 'Triagem' },
  analise: { classe: 'badge-blue', rotulo: 'Análise' },
  encerrado: { classe: 'badge-green', rotulo: 'Encerrado' },
  descartado: { classe: 'badge-gray', rotulo: 'Descartado' },
}

export default function ComercialPage() {
  const router = useRouter()
  const { somenteLeitura, proprietario } = usePermissoes()
  const [casos, setCasos] = useState<Caso[]>([])
  const [docsPorCaso, setDocsPorCaso] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [verUpload, setVerUpload] = useState(false)
  const [cartaoAberto, setCartaoAberto] = useState<string | null>(null)

  /* AS TRÊS ABAS. A Fila do dia abre primeiro, e é de propósito: é a pergunta
     do começo do expediente ("o que eu tenho para analisar do dia útil
     anterior?"). A E-mail é o posto de trabalho de olhar o e-mail em si: a
     caixa crua, os mais antigos parados e o upload de emergência.

     A Painel nasceu em 17/09/2026 como o RELATÓRIO dessas mesmas contas, e em
     18/09/2026 herdou a ponte inteira ("E-mails de pedido de análise"), a
     fila do degrau escolhido e o botão da IA, que também saíram da E-mail:
     primeiro a lista "Tudo o que chegou" e a triagem em lote (período grande
     virava parede de informação no meio do trabalho do dia), depois a ponte
     em si (ordem do Marco, vendo-a recolhida ali: "essas informações são
     mesmo necessárias nessa tela?" — não eram, a Painel já tinha uma
     equivalente). A informação continua existindo — só mudou de aba.

     A fila não some quando a aba troca: o número dela fica guardado aqui, na
     página, senão voltar para a E-mail apagaria a contagem da aba.

     A ABA FICA NO NAVEGADOR (18/09/2026): "a forma que eu sair dessa página é
     a mesma forma que quando eu voltar". Sair do Comercial e voltar tem que
     abrir na mesma aba de antes, e não sempre na Fila do dia. */
  const [aba, setAba] = useLembrado<Aba>('fam:comercial:aba', 'fila', ehAba)
  const [naFila, setNaFila] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('casos')
      .select('id, numero, assunto, remetente_nome, remetente_email, recebido_em, cnpj, razao_social, etapa, criado_em, criado_por_nome, tomador_id')
      .order('criado_em', { ascending: false })
      .limit(200)
    const lista = (data ?? []) as Caso[]
    setCasos(lista)

    if (lista.length) {
      const { data: docs } = await supabase
        .from('caso_documentos')
        .select('caso_id')
        .in('caso_id', lista.map((c) => c.id))
      const conta: Record<string, number> = {}
      for (const d of (docs ?? []) as { caso_id: string }[]) conta[d.caso_id] = (conta[d.caso_id] ?? 0) + 1
      setDocsPorCaso(conta)
    }
    setCarregando(false)
  }, [])

  // A primeira leitura sai no próximo tique, fora do corpo do efeito: é o
  // mesmo cuidado que o PainelEmail já tomava, e que o lint do React 19 cobra.
  useEffect(() => {
    const primeira = setTimeout(carregar, 0)
    return () => clearTimeout(primeira)
  }, [carregar])

  /* ESTA TELA É DE QUEM TEM A CAIXA (23/09/2026). Ela mostra a caixa de
     e-mail da FAM, lida pelo Carteiro na máquina do Comercial. Quem não tem
     aquela máquina não tem o que fazer aqui e vai para a Entrada de pedidos,
     que é a porta dele: subir o e-mail salvo e abrir pelo CNPJ.

     Não é segredo guardado na tela: o que protege o conteúdo da caixa é a RLS.
     Isto é para ninguém abrir um posto de trabalho que não é o seu e achar que
     o CRM está vazio. */
  useEffect(() => {
    if (!proprietario) router.replace('/comercial/entrada')
  }, [proprietario, router])

  /* ── OS NÚMEROS DA ESTEIRA ────────────────────────────────────────────────
     O padrão visual de 09/09/2026 (docs/DESIGN-PAINEL.md): um número grande por
     cartão, o detalhe escondido até alguém pedir, e vermelho SÓ onde há decisão
     a tomar. Aqui o vermelho é dos dois cartões que apontam trabalho parado por
     falta de coisa (CNPJ e documento), e não da fila normal.

     Sai tudo do que já foi carregado. Nenhuma consulta a mais: a tela não pode
     ficar mais lenta por causa de enfeite. */
  const numeros = useMemo(() => {
    const de = (etapa: string) => casos.filter((c) => c.etapa === etapa)
    const semCnpj = casos.filter((c) => !c.cnpj && c.etapa !== 'descartado' && c.etapa !== 'encerrado')
    const semDoc = casos.filter((c) => (docsPorCaso[c.id] ?? 0) === 0 && c.etapa === 'comercial')
    return {
      comercial: de('comercial'),
      triagem: de('triagem'),
      semCnpj,
      semDoc,
    }
  }, [casos, docsPorCaso])

  /** A tabela do cartão aberto, embaixo da grade e na largura inteira. Sempre
   *  com origem, porque número sem origem é número que ninguém pode conferir. */
  function ListaDeCasos({ lista, origem, rotulo, aoFechar }: {
    lista: Caso[]; origem: string; rotulo: string; aoFechar: () => void
  }) {
    const fechar = (
      <button type="button" onClick={aoFechar} style={{ ...botaoVazado, padding: '3px 10px', fontSize: 11.5 }}>
        fechar
      </button>
    )
    if (!lista.length) {
      return (
        <Moldura titulo={rotulo} acao={fechar}>
          <div style={texto.nota}>Nenhum caso nesta situação agora.</div>
        </Moldura>
      )
    }
    return (
      <Moldura titulo={`${rotulo} · ${lista.length} caso${lista.length === 1 ? '' : 's'}`} origem={origem} acao={fechar}>
        <div className="fam-table-wrap">
          <table className="fam-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Assunto</th>
                <th style={{ width: 100 }}>Entrada</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, 12).map((c) => (
                <tr key={c.id} onClick={() => router.push(`/comercial/${c.id}`)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 700, color: cor.textoFraco }}>{c.numero}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: cor.tinta }}>{c.assunto}</div>
                    {c.razao_social && (
                      <div style={{ fontSize: 12, color: cor.textoFraco }}>{c.razao_social}</div>
                    )}
                  </td>
                  <td>{fmtData(c.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Moldura>
    )
  }

  // A troca de tela já foi pedida no efeito acima: não montar a Caixa no meio.
  if (!proprietario) {
    return (
      <div style={{ padding: '20px 0', color: cor.textoFraco, fontSize: 14 }}>
        Levando você para a Entrada de pedidos…
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: cor.tinta, margin: 0 }}>Entrada do Comercial</h1>
        <p style={{ color: cor.textoFraco, fontSize: 14, margin: '6px 0 0' }}>
          A caixa de e-mail aparece aqui. Você lê, vê os anexos e escolhe qual e-mail vira demanda.
          O CRM guarda os documentos e abre o caso para a Triagem.
        </p>
      </div>

      {/* ── as três abas ─────────────────────────────────────────────────── */}
      <div style={{ borderRadius: `${raio.cartao}px ${raio.cartao}px 0 0`, overflow: 'hidden', marginBottom: 14 }}>
        <AbasPainel
          abas={[
            {
              id: 'fila' as const,
              nome: naFila === null ? 'Fila do dia' : `Fila do dia (${naFila})`,
              dica: 'O que chegou dos seus remetentes até o último dia útil e ainda não virou caso',
            },
            { id: 'email' as const, nome: 'E-mail', dica: 'A caixa de e-mail, os mais antigos parados e a entrada manual' },
            { id: 'painel' as const, nome: 'Painel', dica: 'A evolução da esteira, a ponte por período, "Tudo o que chegou" e a triagem em lote' },
          ]}
          atual={aba}
          aoTrocar={setAba}
        />
      </div>

      {aba === 'fila' ? (
        <FilaDoDia aoMudar={carregar} aoContar={setNaFila} aoVerCaixa={() => setAba('email')} />
      ) : aba === 'painel' ? (
        <PainelGestaoEsteira aoMudar={carregar} />
      ) : (
      <>
      {/* ── os números, antes do trabalho ────────────────────────────────────
          Quatro cartões e nada mais. A tentação era encher de indicador; o
          padrão pede o contrário: um número grande por cartão, e cartão que não
          muda decisão nenhuma não entra. */}
      {!carregando && casos.length > 0 && (() => {
        const cartoes = [
          {
            id: 'comercial', rotulo: 'No Comercial', lista: numeros.comercial,
            sub: 'esperando você decidir se vira demanda',
            origem: 'casos com etapa = comercial',
          },
          {
            id: 'triagem', rotulo: 'Na Triagem', lista: numeros.triagem,
            sub: 'já viraram demanda e seguiram',
            origem: 'casos com etapa = triagem',
          },
          {
            id: 'sem-cnpj', rotulo: 'Sem CNPJ', lista: numeros.semCnpj,
            sub: 'não dá para abrir tomador nem análise sem ele',
            origem: 'casos vivos com cnpj vazio',
            alerta: numeros.semCnpj.length > 0,
          },
          {
            id: 'sem-doc', rotulo: 'Sem documento', lista: numeros.semDoc,
            sub: 'e-mail entrou, mas nenhum anexo foi guardado',
            origem: 'casos em comercial sem linha em caso_documentos',
            alerta: numeros.semDoc.length > 0,
          },
        ]
        const aberto = cartoes.find((k) => k.id === cartaoAberto)
        return (
          <SecaoPainel nome="A esteira hoje" cor={corDaArea('comercial')}>
            {/* O detalhe abre embaixo da grade, na largura inteira (11/09/2026). */}
            <GradeCartoes
              detalhe={aberto && (
                <ListaDeCasos
                  lista={aberto.lista} origem={aberto.origem} rotulo={aberto.rotulo}
                  aoFechar={() => setCartaoAberto(null)}
                />
              )}
            >
              {cartoes.map((k) => (
                <CartaoNumero
                  key={k.id}
                  rotulo={k.rotulo}
                  numero={String(k.lista.length)}
                  sub={k.sub}
                  alerta={k.alerta}
                  aberto={cartaoAberto === k.id}
                  aoAlternar={() => setCartaoAberto(cartaoAberto === k.id ? null : k.id)}
                />
              ))}
            </GradeCartoes>
          </SecaoPainel>
        )
      })()}

      {/* O PAINEL VEIO PARA A FRENTE em 10/09/2026 ("não quero mais uma tela
          de outlook, se fosse isso eu usaria o outlook"), e a caixa crua
          voltou para cima, aberta, logo abaixo dos números, em 11/09/2026:
          "a visualização dos e-mails igual o outlook deve ficar em cima
          aberta". Quem desenha a caixa agora é o PainelEmail, no lugar em que
          ficavam os mais antigos parados (que foram para o pé, recolhidos).

          A caixa é o único caminho que existe hoje para um e-mail virar caso
          (o botão "Trazer para a esteira" mora lá dentro). */}
      <PainelEmail aoMudar={carregar} caixa={<Caixa aoAbrirCaso={carregar} />} aoAbrirGestao={() => setAba('painel')} />

      {/* ── a saída de emergência ── */}
      {!somenteLeitura && (
        <div className="card-panel" style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => setVerUpload((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
            }}
          >
            <span style={{ color: 'var(--soft)', fontSize: 13 }}>{verUpload ? '▾' : '▸'}</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1a3560' }}>
              Subir o e-mail à mão
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--soft)' }}>
              (para quando a máquina do Comercial estiver parada)
            </span>
          </button>

          {/* A MESMA PEÇA DA ENTRADA DE PEDIDOS (23/09/2026). Este bloco era
              uma segunda área de soltura, escrita à parte — e quando o arrastar
              direto do Outlook ganhou tratamento novo (pedir o arquivo também
              por `items`, aceitar o e-mail sem extensão no nome, explicar
              quando o Outlook não entrega nada), esta tela ficaria de fora. Duas
              áreas de soltura com comportamentos diferentes, no mesmo CRM, é o
              tipo de divergência que só aparece no dia do aperto. */}
          {verUpload && (
            <div style={{ marginTop: 12 }}>
              {/* O botão de ligar o Outlook também aqui: ele trabalha nesta
                  tela, e não na da equipe. */}
              <LigarOutlook aoMudar={carregar} />
              <NovoPedido aoAbrir={carregar} />
            </div>
          )}
        </div>
      )}


      {/* ── a fila ── */}
      <div className="card-panel" style={{ marginTop: 16 }}>
        <SecaoPainel nome="Casos na esteira" cor={corDaArea('comercial')} />

        {carregando ? (
          <p style={{ color: cor.textoFraco, fontSize: 14 }}>Carregando…</p>
        ) : casos.length === 0 ? (
          <p style={{ color: cor.textoFraco, fontSize: 14 }}>
            Nenhum caso ainda. O primeiro e-mail que você trouxer aqui em cima abre o caso número 1.
          </p>
        ) : (
          <div className="fam-table-wrap">
            <table className="fam-table">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>#</th>
                  <th>Assunto</th>
                  <th>Quem mandou</th>
                  <th style={{ width: 92 }}>Documentos</th>
                  <th style={{ width: 110 }}>Etapa</th>
                  <th style={{ width: 108 }}>Entrada</th>
                </tr>
              </thead>
              <tbody>
                {casos.map((c) => {
                  const b = ETAPA_BADGE[c.etapa] ?? ETAPA_BADGE.comercial
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/comercial/${c.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ fontWeight: 700, color: 'var(--soft)' }}>{c.numero}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0a1628' }}>{c.assunto}</div>
                        {(c.razao_social || c.cnpj) && (
                          <div style={{ fontSize: 12, color: 'var(--soft)' }}>
                            {c.razao_social}{c.razao_social && c.cnpj ? ' · ' : ''}{c.cnpj}
                          </div>
                        )}
                      </td>
                      <td>
                        <div>{c.remetente_nome ?? '-'}</div>
                        <div style={{ fontSize: 12, color: 'var(--soft)' }}>{c.remetente_email}</div>
                      </td>
                      <td style={{ fontWeight: 700 }}>{docsPorCaso[c.id] ?? 0}</td>
                      <td><span className={`badge ${b.classe}`}>{b.rotulo}</span></td>
                      <td>{fmtData(c.criado_em)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  )
}
