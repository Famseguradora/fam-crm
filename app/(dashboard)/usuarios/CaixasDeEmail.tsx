'use client'

// ============================================================================
//  QUEM VÊ CADA CAIXA DE E-MAIL  ·  na tela de Usuários
//
//  Pedido dele em 09/09/2026, com o deploy à vista: a caixa do Comercial é lida
//  pela máquina dele, mas quem vai TRABALHAR nela são o Abenaias, o Ivan e a
//  Isabela, cada um da sua máquina. A caixa pessoal dele continua só dele.
//
//  POR QUE UMA LISTA, E NÃO UM PERFIL: hoje o CRM tem OITO admins. "Admin" diz
//  o que a pessoa pode fazer no sistema, não de quem é o e-mail. Amarrar a
//  caixa do Comercial ao perfil de admin abriria a caixa para cinco pessoas que
//  ele não citou. Então é nome a nome, e a marca fica gravada com quem marcou.
//
//  A TELA NÃO É A TRAVA. Quem decide é a RLS (`fam_ve_caixa` e
//  `fam_manda_na_caixa`): esconder o quadrado aqui só evita que alguém digite
//  em vão. Um usuário sem acesso não vê a caixa nem os e-mails dela mesmo que
//  chame o banco direto.
//
//  DUAS COISAS DIFERENTES, e confundi-las já custou caro noutro lugar:
//    · LIGAR a caixa  → decide que aquele e-mail passa a ser lido. É do dono;
//      em caixa de setor (sem dono), do proprietário do CRM.
//    · VER a caixa    → decide quem trabalha nela. É esta tela.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Caixa {
  id: string
  conta: string
  apelido: string | null
  dono_auth_id: string | null
  dono_nome: string | null
  ligado: boolean
  maquina: string | null
  ultimo_contato: string | null
}

interface Pessoa {
  auth_id: string | null
  nome: string
  email: string
  perfil: string
  status: string | null
}

export default function CaixasDeEmail({ souProprietario }: { souProprietario: boolean }) {
  const [caixas, setCaixas] = useState<Caixa[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [acesso, setAcesso] = useState<Record<string, Set<string>>>({})
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [meuAuthId, setMeuAuthId] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    setMeuAuthId(user?.id ?? null)

    /* A RLS já filtra: quem não vê a caixa não recebe a linha. Então esta tela
       mostra exatamente o que a pessoa tem direito de administrar, sem nenhum
       `if` de permissão do lado do navegador. */
    const [c, u, a] = await Promise.all([
      supabase.from('email_contas')
        .select('id, conta, apelido, dono_auth_id, dono_nome, ligado, maquina, ultimo_contato')
        .order('conta'),
      supabase.from('usuarios')
        .select('auth_id, nome, email, perfil, status')
        .eq('status', 'ativo').order('nome'),
      supabase.from('email_conta_acesso').select('conta_id, auth_id'),
    ])
    if (c.error) setErro(c.error.message)
    setCaixas((c.data ?? []) as Caixa[])
    setPessoas((u.data ?? []) as Pessoa[])
    const mapa: Record<string, Set<string>> = {}
    for (const l of (a.data ?? []) as { conta_id: string; auth_id: string }[]) {
      (mapa[l.conta_id] ??= new Set()).add(l.auth_id)
    }
    setAcesso(mapa)
    setCarregando(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [carregar])

  const podeMexer = (cx: Caixa) => souProprietario || (!!meuAuthId && cx.dono_auth_id === meuAuthId)

  const virar = async (cx: Caixa, p: Pessoa, marcar: boolean) => {
    if (!p.auth_id || !podeMexer(cx)) return
    setSalvando(`${cx.id}:${p.auth_id}`); setErro('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: eu } = user
      ? await supabase.from('usuarios').select('nome').eq('auth_id', user.id).maybeSingle()
      : { data: null }

    if (marcar) {
      const { error } = await supabase.from('email_conta_acesso')
        .insert({ conta_id: cx.id, auth_id: p.auth_id, criado_por: eu?.nome ?? null })
      /* Escrita barrada por RLS não vem como erro em toda operação; aqui o
         insert devolve erro de política, e ele é mostrado como está. */
      if (error && !/duplicate|unique/i.test(error.message)) { setErro(error.message); setSalvando(null); return }
    } else {
      const { error } = await supabase.from('email_conta_acesso')
        .delete().eq('conta_id', cx.id).eq('auth_id', p.auth_id)
      if (error) { setErro(error.message); setSalvando(null); return }
    }
    setSalvando(null)
    await carregar()
  }

  if (carregando) {
    return <div className="card-panel"><p style={{ color: 'var(--soft)', fontSize: 14, margin: 0 }}>Carregando as caixas…</p></div>
  }

  if (!caixas.length) {
    return (
      <div className="card-panel">
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Caixas de e-mail</h2>
        <p style={{ color: 'var(--soft)', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
          Nenhuma caixa que você administre. Uma caixa aparece aqui quando o Carteiro roda numa
          máquina e a vê no Outlook.
        </p>
      </div>
    )
  }

  return (
    <div className="card-panel">
      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>Quem vê cada caixa de e-mail</h2>
      <p style={{ color: 'var(--soft)', fontSize: 13, lineHeight: 1.6, margin: '0 0 16px', maxWidth: '86ch' }}>
        Marcar uma pessoa aqui dá a ela a caixa inteira: ler os e-mails, trazer para a esteira e
        tratar. É <b>nome a nome</b>, e não por perfil — hoje há oito admins no CRM, e perfil diz o
        que a pessoa faz no sistema, não de quem é o e-mail. Quem lê a caixa no Outlook continua
        sendo <b>uma máquina só</b>; as outras pessoas apenas dão a ordem, de onde estiverem.
      </p>

      {erro && <div className="alert-error" style={{ marginBottom: 12 }}>{erro}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {caixas.map(cx => {
          const meus = acesso[cx.id] ?? new Set<string>()
          const mexo = podeMexer(cx)
          const semDono = !cx.dono_auth_id
          return (
            <div key={cx.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                <b style={{ fontSize: 14.5 }}>{cx.apelido || cx.conta}</b>
                <span style={{ fontSize: 12.5, color: 'var(--soft)' }}>{cx.conta}</span>
                <span className={`badge ${cx.ligado ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                  {cx.ligado ? 'ligada' : 'desligada'}
                </span>
                {semDono
                  ? <span className="badge badge-blue" style={{ fontSize: 10 }}>caixa de setor</span>
                  : <span style={{ fontSize: 12, color: 'var(--soft)' }}>de {cx.dono_nome}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--soft)' }}>
                  {cx.maquina ? `lida por ${cx.maquina}` : 'nenhuma máquina leu ainda'}
                </span>
              </div>

              {/* O DONO NÃO ENTRA NA LISTA: ele já vê por ser dono. Mostrar um
                  quadrado marcado e travado ao lado do nome dele só faria
                  alguém tentar desmarcar. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {pessoas.filter(p => p.auth_id && p.auth_id !== cx.dono_auth_id).map(p => {
                  const tem = meus.has(p.auth_id!)
                  const estaSalvando = salvando === `${cx.id}:${p.auth_id}`
                  return (
                    <label key={p.auth_id} title={p.email}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        border: `1px solid ${tem ? '#3070c8' : 'var(--border)'}`,
                        background: tem ? '#e8f0fa' : '#fff',
                        borderRadius: 9, padding: '6px 11px', fontSize: 13,
                        cursor: mexo ? 'pointer' : 'default', opacity: estaSalvando ? .5 : 1,
                      }}>
                      <input type="checkbox" checked={tem} disabled={!mexo || estaSalvando}
                        onChange={e => virar(cx, p, e.target.checked)} />
                      {p.nome}
                    </label>
                  )
                })}
              </div>

              {!mexo && (
                <div style={{ fontSize: 12, color: 'var(--soft)', marginTop: 10 }}>
                  Você vê esta caixa, mas quem decide quem entra é {semDono ? 'o proprietário do CRM' : cx.dono_nome}.
                </div>
              )}
              {semDono && mexo && !cx.ligado && (
                <div style={{ fontSize: 12, color: 'var(--soft)', marginTop: 10, lineHeight: 1.5 }}>
                  Esta caixa está <b>desligada</b>: ninguém a está lendo ainda. Ligar é na tela do
                  Comercial, e vale para todos de uma vez.
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
