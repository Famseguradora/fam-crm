'use client'

/* ENTRADA DE PEDIDOS  ·  /comercial/entrada  ·  23/09/2026
   ═══════════════════════════════════════════════════════════════════════════

   Pedido dele: "eu salvo o e-mail e subo no sistema... isso é bom e está
   certo; o que eu quero é expandir isso para os outros usuários (Abenaias,
   Isabela, Ivan e Marco Dragone), porque aí eu ganho tempo até conseguir ter o
   e-mail dentro do sistema. Como o e-mail não estará configurado na máquina
   deles, não vamos liberar o e-mail".

   POR QUE UMA TELA NOVA, E NÃO UM BOTÃO NA TELA DO COMERCIAL: a /comercial é o
   posto de trabalho do e-mail. Ela mostra a CAIXA DA FAM (o Carteiro lê o
   Outlook na máquina do Comercial), a Fila do dia e a gestão da esteira. Nada
   disso funciona — nem deve aparecer — para quem não tem aquela caixa. Esta
   tela é só a porta de entrada:

     subir o e-mail salvo (.msg/.eml)   a mesma regra de sempre
     abrir o pedido pelo CNPJ           quando não houve e-mail
     ver o que entrou                   os casos, de todo mundo, sem o e-mail

   A REGRA DE ABRIR O CASO NÃO MORA AQUI, e nem na outra tela: ela está em
   `lib/casos/abrir-por-email.ts` e é a mesma do Carteiro. O que muda entre as
   duas telas é o que se vê, nunca o que acontece.

   O CARD NASCE NA COLUNA ENTRADA da Mesa da Análise pelas duas portas. Quem
   quiser furar a fila arrasta o card lá, na Análise: a ordem é uma decisão da
   equipe, e ela se toma olhando o quadro inteiro, não a própria entrada. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { fmtData, maskCNPJ } from '@/lib/utils'
import NovoPedido from '@/components/comercial/NovoPedido'
import LigarOutlook from '@/components/comercial/LigarOutlook'
import { SecaoPainel, CartaoNumero, GradeCartoes, Moldura, Aviso } from '@/components/painel/Painel'
import { cor, corDaArea, texto, raio } from '@/lib/ui/painel'

interface Caso {
  id: string
  numero: number
  assunto: string
  cnpj: string | null
  razao_social: string | null
  etapa: string
  criado_em: string
  criado_por_nome: string | null
}

const ETAPA_BADGE: Record<string, { classe: string; rotulo: string }> = {
  comercial: { classe: 'badge-gray', rotulo: 'Comercial' },
  triagem: { classe: 'badge-orange', rotulo: 'Triagem' },
  analise: { classe: 'badge-blue', rotulo: 'Análise' },
  encerrado: { classe: 'badge-green', rotulo: 'Encerrado' },
  descartado: { classe: 'badge-gray', rotulo: 'Descartado' },
}

export default function EntradaDePedidosPage() {
  const router = useRouter()
  const { somenteLeitura } = usePermissoes()
  const [casos, setCasos] = useState<Caso[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('casos')
      /* SEM `corpo`, SEM `remetente`: esta tela não mostra e-mail, e o que não
         é mostrado não precisa viajar até o navegador. */
      .select('id, numero, assunto, cnpj, razao_social, etapa, criado_em, criado_por_nome')
      .order('criado_em', { ascending: false })
      .limit(100)
    if (error) setErro(error.message)
    setCasos((data ?? []) as Caso[])
    setCarregando(false)
  }, [])

  useEffect(() => {
    const primeira = setTimeout(carregar, 0)
    return () => clearTimeout(primeira)
  }, [carregar])

  /* OS TRÊS NÚMEROS, e nada além. O padrão do painel pede um número grande por
     cartão e cartão que não muda decisão nenhuma fica de fora. Aqui a decisão
     é sempre a mesma: o que ainda depende de alguém desta tela? */
  const numeros = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const deHoje = casos.filter((c) => new Date(c.criado_em) >= hoje)
    const naTriagem = casos.filter((c) => c.etapa === 'triagem')
    const semCnpj = casos.filter((c) => !c.cnpj && c.etapa !== 'descartado' && c.etapa !== 'encerrado')
    return { deHoje, naTriagem, semCnpj }
  }, [casos])

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: cor.tinta, margin: 0 }}>Entrada de pedidos</h1>
        <p style={{ color: cor.textoFraco, fontSize: 14, margin: '6px 0 0' }}>
          Salve o e-mail do pedido e solte aqui, ou abra pelo CNPJ. O CRM guarda os documentos,
          abre o caso e cria o card na coluna <b>Entrada</b> da Análise.
        </p>
      </div>

      {somenteLeitura ? (
        <Aviso>
          Seu acesso é de leitura: você acompanha os pedidos, mas não abre caso novo.
        </Aviso>
      ) : (
        <div className="card-panel" style={{ marginBottom: 16 }}>
          <SecaoPainel nome="Subir um pedido" cor={corDaArea('comercial')} />
          {/* O estado do arrastar, e os botões para ligá-lo — dentro do CRM,
              que foi o pedido de 23/09/2026. Some quando tudo já está ligado
              e a caixa da pessoa também. */}
          <LigarOutlook aoMudar={carregar} />
          <NovoPedido aoAbrir={carregar} />
        </div>
      )}

      {erro && <div className="alert-error" style={{ marginBottom: 14 }}>{erro}</div>}

      {!carregando && casos.length > 0 && (
        <SecaoPainel nome="O que entrou" cor={corDaArea('comercial')}>
          <GradeCartoes>
            <CartaoNumero
              rotulo="Entraram hoje" numero={String(numeros.deHoje.length)}
              sub="pedidos abertos hoje, por toda a equipe"
            />
            <CartaoNumero
              rotulo="Na Triagem" numero={String(numeros.naTriagem.length)}
              sub="já viraram caso e seguiram para a conferência"
            />
            <CartaoNumero
              rotulo="Sem CNPJ" numero={String(numeros.semCnpj.length)}
              sub="não dá para abrir tomador nem análise sem ele"
              alerta={numeros.semCnpj.length > 0}
            />
          </GradeCartoes>
        </SecaoPainel>
      )}

      <div className="card-panel">
        <SecaoPainel nome="Pedidos abertos" cor={corDaArea('comercial')} />
        {carregando ? (
          <p style={{ ...texto.corpo, color: cor.textoFraco }}>Carregando…</p>
        ) : casos.length === 0 ? (
          <p style={{ ...texto.corpo, color: cor.textoFraco }}>
            Nada ainda. O primeiro e-mail que você soltar aqui em cima abre o caso número 1.
          </p>
        ) : (
          <Moldura titulo={`${casos.length} pedido${casos.length === 1 ? '' : 's'}`} origem="casos, os 100 mais recentes">
            <div className="fam-table-wrap">
              <table className="fam-table">
                <thead>
                  <tr>
                    <th style={{ width: 56 }}>#</th>
                    <th>Assunto</th>
                    <th style={{ width: 150 }}>CNPJ</th>
                    <th style={{ width: 150 }}>Quem subiu</th>
                    <th style={{ width: 110 }}>Etapa</th>
                    <th style={{ width: 108 }}>Entrada</th>
                  </tr>
                </thead>
                <tbody>
                  {casos.map((c) => {
                    const b = ETAPA_BADGE[c.etapa] ?? ETAPA_BADGE.comercial
                    return (
                      <tr key={c.id} onClick={() => router.push(`/comercial/${c.id}`)} style={{ cursor: 'pointer' }}>
                        <td style={{ fontWeight: 700, color: cor.textoFraco }}>{c.numero}</td>
                        <td>
                          <div style={{ fontWeight: 600, color: cor.tinta }}>{c.assunto}</div>
                          {c.razao_social && (
                            <div style={{ fontSize: 12, color: cor.textoFraco }}>{c.razao_social}</div>
                          )}
                        </td>
                        <td>{c.cnpj ? maskCNPJ(c.cnpj) : <span style={{ color: cor.textoFraco }}>a confirmar</span>}</td>
                        <td>{c.criado_por_nome ?? '-'}</td>
                        <td><span className={`badge ${b.classe}`}>{b.rotulo}</span></td>
                        <td>{fmtData(c.criado_em)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Moldura>
        )}
      </div>

      <div style={{ marginTop: 14, borderRadius: raio.cartao, overflow: 'hidden' }}>
        <Aviso>
          <b>Onde o pedido continua.</b> Clicar numa linha abre a Triagem do caso, com os
          documentos que o e-mail trouxe. O card do mesmo pedido aparece na <b>Mesa</b>, em
          Análise, na coluna Entrada — e lá dá para arrastar o card para cima quando ele for
          urgente, que é o que muda a ordem da fila para todo mundo.
        </Aviso>
      </div>
    </div>
  )
}
