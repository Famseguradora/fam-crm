'use client'

// ============================================================================
//  O RELATÓRIO COMPLETO, SOMENTE PARA LER  ·  23/09/2026
//
//  Ordem dele: "preciso que apareça igual antes, mas que as pessoas tenham
//  acesso ao relatório sem editar". O documento de verdade (template v13) é
//  servido pelo motor do notebook e não chega ao CRM do ar. A carga
//  (`scripts/carga-relatorio.mjs`) guarda no banco uma cópia somente leitura,
//  em duas peças: o modelo (um só) e o que é próprio da análise.
//
//  A tela junta as duas e desenha num quadro ISOLADO: `sandbox` sem
//  `allow-same-origin`, então o documento não enxerga a sessão do CRM nem
//  chama a API dele, mesmo que o texto de um balanço traga um script. Sem
//  servidor por trás, nada do que se clicar ali grava em lugar nenhum.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/* EXPORTAR SEM EDITAR (25/09/2026). Ordem dele: "insira a opção da pessoa
   exportar o relatório, igual eu tenho na minha máquina, em HTML ou PDF, mas
   mantenha a edição inabilitada".

   O ARQUIVO É O DO PRÓPRIO TEMPLATE, e não uma cópia do quadro: o "Baixar HTML"
   do v13 abre todas as contas, tira o que é de edição (contenteditable, botões
   de bloco) e junta o robô de bordo com a conversa. É o mesmo arquivo que ele
   baixa no notebook, e ele já sai sem edição. O `somente_leitura` esconde esse
   botão lá dentro; aqui ele é chamado por esta ponte, que pega o arquivo antes
   de o quadro baixá-lo e o devolve para a tela do CRM baixar. Assim o download
   não depende do navegador aceitar download de dentro de quadro isolado.

   O botão Editar continua escondido pela trava da carga, e o quadro continua
   sem `allow-same-origin`: a ponte só fala por postMessage, e só estas duas
   palavras. */
const PONTE = `<script>(function(){
window.addEventListener('message',function(e){
  var d=e.data;if(!d||d.fam!=='exportar')return;
  if(d.formato==='pdf'){var p=document.getElementById('bt-pdf');if(p)p.click();else window.print();return;}
  var b=document.getElementById('bt-html');
  if(!b){parent.postMessage({fam:'exportado',erro:'sem-exportador'},'*');return;}
  var achado=null,co=URL.createObjectURL,ck=HTMLAnchorElement.prototype.click;
  URL.createObjectURL=function(x){if(x instanceof Blob)achado={blob:x};return co.call(URL,x);};
  HTMLAnchorElement.prototype.click=function(){if(achado&&this.download){achado.nome=this.download;return;}return ck.call(this);};
  try{b.click();}catch(err){console.error(err);}finally{URL.createObjectURL=co;HTMLAnchorElement.prototype.click=ck;}
  if(!achado||!achado.nome){parent.postMessage({fam:'exportado',erro:'nada'},'*');return;}
  achado.blob.text().then(function(t){parent.postMessage({fam:'exportado',nome:achado.nome,html:t},'*');});
});
})();</script>`

/** A ponte entra antes do ÚLTIMO </body>: o runtime do documento tem strings
 *  com "</body>" dentro (o acidente de 03/08/2026, contado no auditor.js). */
function comPonte(html: string): string {
  const fim = html.lastIndexOf('</body>')
  return fim < 0 ? html + PONTE : html.slice(0, fim) + PONTE + html.slice(fim)
}

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const nomeDoArquivo = (razao: string) =>
  'FAM_' + (razao || 'relatorio').replace(/[^\wÀ-ÿ .-]/g, '').trim().replace(/\s+/g, '_').slice(0, 90) + '.html'

export default function RelatorioLeitura({ chave, razao }: { chave: string; razao: string }) {
  const [html, setHtml] = useState<string | null>(null)
  /** Quem já baixou tem o arquivo exportado guardado inteiro: esse sai como está. */
  const [exportado, setExportado] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [baixando, setBaixando] = useState(false)
  const [aviso, setAviso] = useState('')
  const quadro = useRef<HTMLIFrameElement>(null)
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    function ouvir(e: MessageEvent) {
      if (e.source !== quadro.current?.contentWindow) return
      const d = e.data as { fam?: string; nome?: string; html?: string; erro?: string } | null
      if (!d || d.fam !== 'exportado') return
      clearTimeout(espera.current)
      setBaixando(false)
      if (d.html && d.nome) { baixar(d.nome, d.html); setAviso(''); return }
      setAviso('O relatório não gerou o arquivo. Tente de novo em alguns segundos.')
    }
    window.addEventListener('message', ouvir)
    return () => window.removeEventListener('message', ouvir)
  }, [])

  function exportar(formato: 'html' | 'pdf') {
    setAviso('')
    if (formato === 'html' && exportado) { baixar(nomeDoArquivo(razao), exportado); return }
    const alvo = quadro.current?.contentWindow
    if (!alvo) return
    if (formato === 'html') {
      setBaixando(true)
      // Sem resposta, o botão não fica girando para sempre.
      clearTimeout(espera.current)
      espera.current = setTimeout(() => {
        setBaixando(false)
        setAviso('O relatório não respondeu. Tente de novo.')
      }, 15000)
    }
    alvo.postMessage({ fam: 'exportar', formato }, '*')
  }

  useEffect(() => {
    let vivo = true
    createClient()
      .from('analise_relatorio_leitura')
      .select('id, html')
      .in('id', ['modelo', chave])
      .then(({ data, error }) => {
        if (!vivo) return
        const modelo = data?.find(l => l.id === 'modelo')?.html
        const peca = data?.find(l => l.id === chave)?.html
        if (error || !peca) {
          setErro(error?.message ?? 'A cópia de leitura desta análise ainda não foi publicada.')
          return
        }
        /* DOIS FORMATOS NA MESMA LINHA. Quem já baixou o HTML tem o arquivo
           inteiro guardado (com a conversa com a IA e o robô de bordo): abre
           como está. Quem não baixou tem só a peça da análise, e ela entra no
           modelo. */
        if (/^\s*<!doctype html/i.test(peca)) { setExportado(peca); setHtml(comPonte(peca)); return }
        if (!modelo) { setErro('O modelo do relatório ainda não foi publicado.'); return }
        // Por FUNÇÃO, nunca por string: um "$'" no texto colaria o resto do documento de novo.
        setHtml(comPonte(modelo.replace('<!--FAM-DADOS-->', () => peca)))
      })
    return () => { vivo = false }
  }, [chave])

  if (erro) {
    return <div className="an-aviso aviso">{erro} Enquanto isso, a &quot;Base compartilhada&quot; mostra a análise.</div>
  }
  if (!html) {
    return <div className="card-panel"><p style={{ color: 'var(--soft)', fontSize: 14 }}>Abrindo o relatório…</p></div>
  }
  return (
    <>
      <div className="an-relatorio-comando" style={{ justifyContent: 'flex-end' }}>
        {aviso && <span style={{ fontSize: 12, color: '#a02020', flex: 1 }}>{aviso}</span>}
        <span style={{ fontSize: 12, color: 'var(--soft)' }}>Exportar, sem edição:</span>
        <button type="button" className="an-bt mini" disabled={baixando} onClick={() => exportar('html')}
          title="O mesmo HTML que o analista baixa no notebook, com o robô de bordo. Abre em qualquer navegador e não edita.">
          {baixando ? 'Gerando o HTML…' : 'Baixar HTML'}
        </button>
        <button type="button" className="an-bt mini" onClick={() => exportar('pdf')}
          title="Abre a impressão do navegador. Escolha Salvar como PDF no destino.">
          Baixar PDF
        </button>
      </div>
      <div className="an-relatorio-integral">
        <iframe
          ref={quadro}
          title={`Relatório completo de ${razao}, somente leitura`}
          srcDoc={html}
          sandbox="allow-scripts allow-modals allow-downloads allow-popups"
        />
      </div>
    </>
  )
}
