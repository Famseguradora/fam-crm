# A PONTE COM O OUTLOOK CLASSICO, sem API, sem senha e sem nuvem (28/08/2026).
#
# Ordem do Marco: "eu prefiro e dou acesso, que possa o sistema acessar meu e-mail e extrair os
# e-mails de analise, se e que e possivel, mesmo sem API".
#
# E possivel, e e isto: o Outlook classico expoe automacao COM na propria maquina. Quem ja esta
# logado e o Outlook dele; este script pede os e-mails ao programa que ja esta aberto, como um
# suplemento faria. Nao ha credencial guardada em lugar nenhum, nada sai da maquina, e nenhuma
# assinatura e paga.
#
# SO LE. Nao marca como lido, nao move, nao apaga, nao responde. Um erro aqui nao pode custar a
# caixa de e-mail dele, e num sistema que vai ser mostrado para a diretoria a garantia de que a
# maquina nao mexe no e-mail de ninguem vale mais do que qualquer comodidade.
#
# O OUTLOOK NOVO (`olk`, o app da Loja) NAO TEM COM. Medido em 28/08/2026: o `olk` nao expoe
# automacao nenhuma. Este script fala com o OUTLOOK.EXE classico, que esta instalado na maquina
# dele em C:\Program Files\Microsoft Office\root\Office16\. Enquanto o perfil classico nao tiver
# entrado na conta ao menos uma vez, o COM responde "Voce nao esta conectado", e o comando
# `diagnostico` abaixo existe para dizer isso com todas as letras em vez de devolver erro seco.
#
# Uso:
#   outlook.ps1 -Acao diagnostico
#   outlook.ps1 -Acao pastas
#   outlook.ps1 -Acao listar  -Pasta "Caixa de Entrada\Analises" -Desde "2026-08-25T00:00:00Z" -Max 50
#   outlook.ps1 -Acao salvar  -EntryId "0000..." -Destino "C:\...\Analises FAM"

param(
  [Parameter(Mandatory = $true)][string]$Acao,
  [string]$Pasta = '',
  [string]$Desde = '',
  [int]$Max = 60,
  [string]$EntryId = '',
  [string]$Destino = '',
  [string]$Assunto = '',
  [string]$Corpo = '',
  [string]$Modo = 'rascunho'
)

$ErrorActionPreference = 'Stop'
# A saida e lida pelo Node como UTF-8. Sem isto, "Análise" chega como "AnÃ¡lise" e o nome da
# pasta do tomador nasce torto: e o mesmo defeito de acento ja documentado no cadastro.mjs.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

function Responder($obj) {
  # -Compress: a saida e dado para o Node, nao texto para ler. -Depth alto porque a lista de
  # anexos e um nivel abaixo da lista de e-mails.
  Write-Output ($obj | ConvertTo-Json -Depth 6 -Compress)
  exit 0
}

function Falhar($msg, $comoResolver = '') {
  Responder @{ ok = $false; erro = "$msg"; como_resolver = "$comoResolver" }
}

# ---------------------------------------------------------------------------
# Conexao
# ---------------------------------------------------------------------------
# Uma unica porta de entrada para o COM, e ela devolve SEMPRE uma explicacao util quando falha.
# "Voce nao esta conectado" sozinho, na tela dele, nao diz o que fazer.
# TENTA MAIS DE UMA VEZ, e isso nao e paranoia: e um caso medido em 29/08/2026.
#
# Com o Outlook ABERTO e conectado, uma chamada falhou com "Nao consegui falar com o Outlook
# classico nesta maquina", e a seguinte, segundos depois, respondeu normal (610 itens). O motivo
# e conhecido do COM: enquanto o Outlook esta ocupado sincronizando, ele RECUSA chamadas de fora
# (RPC_E_CALL_REJECTED / servidor ocupado), e a recusa chega como se o programa nao existisse.
#
# Na tela dele isso e pior do que um erro: manda consertar a coisa errada. Ele leria "instale o
# Outlook classico" com o Outlook classico aberto na frente dele, e concluiria que o sistema
# esta quebrado. Tres tentativas com pausa crescente cobrem a janela de sincronizacao, e a
# mensagem final so fala em instalacao quando o processo REALMENTE nao existe.
function Conectar {
  $ol = $null
  $ultimo = ''
  foreach ($espera in @(0, 1500, 4000)) {
    if ($espera) { Start-Sleep -Milliseconds $espera }
    try { $ol = New-Object -ComObject Outlook.Application; break }
    catch { $ultimo = "$($_.Exception.Message)"; $ol = $null }
  }
  if (-not $ol) {
    $rodando = [bool](Get-Process -Name 'OUTLOOK' -ErrorAction SilentlyContinue)
    if ($rodando) {
      Falhar "O Outlook esta aberto, mas recusou a conexao agora (ele responde assim enquanto esta sincronizando). Detalhe: $ultimo" `
        "Nao e preciso instalar nem configurar nada. Espere ele terminar de sincronizar e clique de novo."
    }
    Falhar "Nao consegui falar com o Outlook classico nesta maquina. Detalhe: $ultimo" `
      "O Outlook classico (OUTLOOK.EXE) precisa estar instalado. O Outlook novo, o do icone azul da Loja, nao aceita automacao."
  }
  foreach ($espera in @(0, 1500, 4000)) {
    if ($espera) { Start-Sleep -Milliseconds $espera }
    try {
      $ns = $ol.GetNamespace('MAPI')
      # Toca no perfil de verdade: criar o objeto sozinho nao prova conexao nenhuma.
      $null = $ns.GetDefaultFolder(6)
      return $ns
    } catch { $ultimo = "$($_.Exception.Message)" }
  }
  Falhar "O Outlook classico esta instalado, mas o perfil nao respondeu. Detalhe: $ultimo" `
    "Abra o Outlook CLASSICO, entre na conta e deixe ele terminar de sincronizar. Se ele ja estiver aberto, espere a sincronizacao acabar e tente de novo."
}

# O ENDERECO DE VERDADE DO REMETENTE (30/08/2026).
#
# `SenderEmailAddress` so devolve SMTP para quem e de FORA. Para colega da propria empresa, que
# e a maioria da caixa dele, o Outlook devolve o X.500 legacy DN do Exchange, assim:
#
#   /O=EXCHANGELABS/OU=EXCHANGE ADMINISTRATIVE GROUP (FYDIBOHF23SPDLT)/CN=RECIPIENTS/CN=4376E00...
#
# Isso e endereco interno do diretorio, nao serve para nada na tela, e foi exatamente o que o
# Marco viu e chamou de lixo: "voce esta trazendo isso a toa". Esta funcao resolve o SMTP de
# verdade, e quando NAO consegue devolve VAZIO, de proposito: e melhor a tela mostrar so o nome
# do que mostrar um DN que nao diz nada a ninguem.
function SmtpDoRemetente($it) {
  # Remetente externo: o proprio campo ja e o endereco. A checagem do `/O=` fica como rede de
  # seguranca para o caso de o `SenderEmailType` vir vazio num item estranho.
  try {
    if ("$($it.SenderEmailType)" -ne 'EX') {
      $e = "$($it.SenderEmailAddress)"
      if ($e -and $e.StartsWith('/')) { return '' }
      return $e
    }
  } catch { }

  # 0x39FE001E = PR_SMTP_ADDRESS. Este e o caminho que funciona mesmo quando o remetente ja saiu
  # da empresa e o GetExchangeUser() nao acha mais ninguem no diretorio.
  try {
    $smtp = "$($it.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x39FE001E'))"
    if ($smtp) { return $smtp }
  } catch { }

  # Ultima tentativa, pelo diretorio.
  try {
    $u = $it.Sender.GetExchangeUser()
    if ($u -and $u.PrimarySmtpAddress) { return "$($u.PrimarySmtpAddress)" }
  } catch { }

  return ''
}

# O CORPO EM TEXTO, para a tela poder ABRIR o e-mail ao lado da lista.
#
# `.Body` e o texto puro. `.HTMLBody` traria a formatacao, mas tambem traria HTML de terceiro
# para dentro de uma tela nossa, e ai o cuidado passa a ser sanitizar. Texto puro resolve o que
# ele pediu (ler o conteudo, achar o que o corretor escreveu) sem abrir essa porta.
#
# O corte em 1.200 caracteres existe porque a saida inteira vira UM JSON: duzentos e-mails com
# fio de conversa longo passariam de megabytes e o Node ficaria segurando isso na memoria a cada
# varredura.
#
# ERA 20 MIL, E ERA DESPERDICIO MEDIDO (08/09/2026). O CRM guarda 400 caracteres desta lista (a
# previa) e joga fora o resto: os outros 19.600 atravessavam a maquina, o JSON e a rede para
# morrer no servidor. Com 1.200 a previa continua inteira, com folga, e a caixa de 200 e-mails
# que ele pediu passou a caber numa rodada. O texto INTEIRO continua existindo, sob demanda, na
# acao 'texto' -- que le UM e-mail, quando alguem abre na tela.
function CorpoDoEmail($it) {
  try {
    $t = "$($it.Body)"
    if (-not $t) { return '' }
    if ($t.Length -gt 1200) { return $t.Substring(0, 1200) }
    return $t
  } catch { return '' }
}

# Acha uma pasta pelo caminho, aceitando "Caixa de Entrada\Analises" ou so "Analises".
# Vazio devolve a Caixa de Entrada, que e o caso comum.
function AcharPasta($ns, $caminho) {
  if (-not $caminho) { return $ns.GetDefaultFolder(6) }
  $partes = $caminho -split '[\\/]' | Where-Object { $_ }
  $atual = $null
  # Primeiro pedaco: pode ser a raiz de uma conta, ou uma pasta da Caixa de Entrada.
  $raiz = $ns.Folders
  foreach ($f in $raiz) { if ($f.Name -eq $partes[0]) { $atual = $f; break } }
  if (-not $atual) {
    $inbox = $ns.GetDefaultFolder(6)
    if ($inbox.Name -eq $partes[0]) { $atual = $inbox }
    else { foreach ($f in $inbox.Folders) { if ($f.Name -eq $partes[0]) { $atual = $f; break } } }
  }
  if (-not $atual) { Falhar "Nao achei a pasta '$caminho' no Outlook." "Confira o nome exato, do jeito que aparece na lateral do Outlook." }
  for ($i = 1; $i -lt $partes.Count; $i++) {
    $prox = $null
    foreach ($f in $atual.Folders) { if ($f.Name -eq $partes[$i]) { $prox = $f; break } }
    if (-not $prox) { Falhar "Dentro de '$($atual.Name)' nao existe a subpasta '$($partes[$i])'." "Confira o caminho na lateral do Outlook." }
    $atual = $prox
  }
  return $atual
}

# Parametro chamado $raizDa, e nao $pasta, pelo mesmo motivo do bloco 'listar' mais abaixo:
# nome que colide com um parametro [string] do script e uma cilada esperando a proxima pessoa.
function ArvoreDe($raizDa, $nivel) {
  $saida = @()
  if ($nivel -gt 2) { return $saida }
  foreach ($f in $raizDa.Folders) {
    $saida += @{ nome = "$($f.Name)"; caminho = "$($f.FolderPath)"; itens = $f.Items.Count; nivel = $nivel }
    $saida += ArvoreDe $f ($nivel + 1)
  }
  return $saida
}

# ---------------------------------------------------------------------------
switch ($Acao) {

  'diagnostico' {
    $r = @{ ok = $true }
    $r.outlook_novo_rodando = [bool](Get-Process -Name 'olk' -ErrorAction SilentlyContinue)
    $r.outlook_classico_rodando = [bool](Get-Process -Name 'OUTLOOK' -ErrorAction SilentlyContinue)
    # O @() por fora do Where-Object nao e enfeite: com UM resultado o PowerShell devolve a
    # string em vez de uma lista de um, e o [0] passa a ser a primeira LETRA do caminho. O
    # diagnostico respondia `classico_caminho: "C"`.
    $caminhos = @(@(
      "${env:ProgramFiles}\Microsoft Office\root\Office16\OUTLOOK.EXE",
      "${env:ProgramFiles(x86)}\Microsoft Office\root\Office16\OUTLOOK.EXE"
    ) | Where-Object { Test-Path $_ })
    $r.classico_instalado = [bool]$caminhos
    $r.classico_caminho = if ($caminhos) { "$($caminhos[0])" } else { '' }
    try {
      $ol = New-Object -ComObject Outlook.Application
      $ns = $ol.GetNamespace('MAPI')
      $inbox = $ns.GetDefaultFolder(6)
      $r.conectado = $true
      $r.caixa = "$($inbox.Name)"
      $r.itens_na_caixa = $inbox.Items.Count
      $r.contas = @($ns.Accounts | ForEach-Object { "$($_.SmtpAddress)" })
    } catch {
      $r.conectado = $false
      $r.motivo = "$($_.Exception.Message)"
    }
    Responder $r
  }

  'pastas' {
    $ns = Conectar
    $inbox = $ns.GetDefaultFolder(6)
    $lista = @(@{ nome = "$($inbox.Name)"; caminho = "$($inbox.FolderPath)"; itens = $inbox.Items.Count; nivel = 0 })
    $lista += ArvoreDe $inbox 1
    Responder @{ ok = $true; caixa = "$($inbox.Name)"; pastas = $lista }
  }

  'listar' {
    # $alvo, e NAO $pasta. Custou o primeiro teste com o Outlook de verdade conectado, e a
    # armadilha e das que nao se veem lendo o codigo:
    #
    #   1. o PowerShell NAO diferencia maiuscula de minuscula em nome de variavel, entao
    #      `$pasta` e `$Pasta` sao a MESMA variavel;
    #   2. `$Pasta` esta declarada `[string]` no param() la em cima, e a restricao de tipo
    #      gruda na VARIAVEL, nao so no que chega por parametro.
    #
    # Resultado: guardar a pasta do Outlook em `$pasta` CONVERTIA o objeto COM para o texto
    # "System.__ComObject". Ai `$pasta.Items` virava $null, e o erro so estourava uma linha
    # depois, no `.Sort()`, apontando para o lugar errado. Nenhuma chamada COM estava errada.
    $ns = Conectar
    $alvo = AcharPasta $ns $Pasta
    $itens = $alvo.Items
    $itens.Sort('[ReceivedTime]', $true)   # mais novo primeiro

    # O Restrict do Outlook exige a data no formato dos Estados Unidos, sempre, mesmo em maquina
    # em portugues. Passar dd/MM devolve zero e-mail sem erro nenhum, que e o pior tipo de bug:
    # o sistema diria "nao chegou nada" para sempre.
    if ($Desde) {
      try {
        $d = [datetime]::Parse($Desde, [Globalization.CultureInfo]::InvariantCulture).ToLocalTime()
        $filtro = "[ReceivedTime] >= '" + $d.ToString('MM/dd/yyyy hh:mm tt', [Globalization.CultureInfo]::GetCultureInfo('en-US')) + "'"
        $itens = $itens.Restrict($filtro)
      } catch { }
    }

    $saida = @()
    $n = 0
    foreach ($it in $itens) {
      if ($n -ge $Max) { break }
      # Item que nao e e-mail (convite, tarefa, recibo) nao tem as propriedades abaixo e
      # estouraria o laco inteiro por causa de um.
      try { if ($it.Class -ne 43) { continue } } catch { continue }
      $n++
      $anexos = @()
      try {
        foreach ($a in $it.Attachments) {
          # Type 6 = OLE embutido (as imagens de assinatura entram como anexo e nao sao documento).
          $anexos += @{ nome = "$($a.FileName)"; kb = [int]([math]::Round($a.Size / 1024)); tipo = [int]$a.Type }
        }
      } catch { }
      # ANEXO UTIL E O QUE TEM CARA DE DOCUMENTO, e a lista e por INCLUSAO, nao por exclusao.
      # Excluindo so imagem, o aviso do OneDrive ("voce excluiu muitos arquivos") entrava na
      # caixa com "3 anexos uteis": eram imagens embutidas no corpo, com nome de GUID e SEM
      # extensao nenhuma, que a regra de exclusao por extensao nao pegava. Numa tela que ele vai
      # mostrar para a diretoria, lixo na lista de "chegaram para analise" custa caro.
      $reais = @($anexos | Where-Object { $_.nome -match '\.(pdf|docx?|xlsx?|xlsm|pptx?|zip|rar|7z|csv|txt|xml|ofx|rem|p7s|msg|eml)$' })
      # O MESSAGE-ID, a identidade do e-mail no mundo (07/09/2026).
      #
      # O EntryID so vale dentro desta caixa nesta maquina: mover o e-mail de pasta ja
      # o troca. O Message-ID e o mesmo no .msg baixado, no .eml e no Graph, e e ele que
      # impede o mesmo e-mail de virar DOIS casos quando entra pela caixa e alguem sobe
      # o arquivo a mao depois. Sem ele as duas estradas do Comercial se atropelam.
      #
      # PropertyAccessor estoura quando a propriedade nao existe (item local, nunca
      # transmitido), e ai fica vazio mesmo: o EntryID cobre esse caso.
      $msgId = ''
      try { $msgId = "$($it.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x1035001F'))" } catch { }
      $saida += @{
        entry_id   = "$($it.EntryID)"
        message_id = "$msgId"
        assunto    = "$($it.Subject)"
        de         = "$($it.SenderName)"
        email_de   = "$(SmtpDoRemetente $it)"
        corpo      = "$(CorpoDoEmail $it)"
        para       = "$(try { $it.To } catch { '' })"
        copia      = "$(try { $it.CC } catch { '' })"
        recebido   = "$(try { $it.ReceivedTime.ToString('o') } catch { '' })"
        nao_lido   = [bool]$it.UnRead
        anexos     = $anexos
        anexos_uteis = $reais.Count
        tamanho_kb = [int]([math]::Round($it.Size / 1024))
      }
    }
    Responder @{ ok = $true; pasta = "$($alvo.FolderPath)"; total_na_pasta = $alvo.Items.Count; lidos = $saida.Count; emails = $saida }
  }

  # ---------------------------------------------------------------------------
  # O CORPO EM HTML, de UM e-mail, sob demanda (30/08/2026)
  # ---------------------------------------------------------------------------
  # Pedido dele, na tela nova: o e-mail aberto tem que aparecer COMO CHEGOU, com a assinatura
  # de quem mandou. A assinatura quase sempre e imagem embutida (cid:), que o texto puro
  # descarta: era o buraco em branco depois do "Atenciosamente,".
  #
  # Por que UM e nao todos: o HTML de um fio de garantia passa de 100 KB, e a lista traz ate
  # 400 e-mails. Mandar tudo em cada batida seria megabytes por clique; aqui vem so o aberto.
  #
  # A imagem embutida vira data: URI dentro do proprio HTML. A tela poe isso num iframe com
  # sandbox e CSP que so aceita data:, entao nada daqui liga para fora nem roda script.
  'corpo' {
    if (-not $EntryId) { Falhar 'Falta o EntryId do e-mail.' }
    $ns = Conectar
    try { $it = $ns.GetItemFromID($EntryId) } catch { Falhar 'Nao achei este e-mail no Outlook. Ele pode ter sido movido ou apagado.' }
    $html = ''
    try { $html = "$($it.HTMLBody)" } catch { $html = '' }
    if ($html.Length -gt 400000) { $html = $html.Substring(0, 400000) }

    if ($html) {
      # As imagens embutidas: anexo com Content-Id que o corpo referencia como cid:...
      $tmp = Join-Path $env:TEMP ('fam-cid-' + [guid]::NewGuid().ToString('N'))
      New-Item -ItemType Directory -Path $tmp | Out-Null
      $trocadas = 0
      try {
        foreach ($a in $it.Attachments) {
          if ($trocadas -ge 12) { break }
          try {
            if ($a.Size -gt 400KB) { continue }
            $cid = "$($a.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F'))"
            if (-not $cid) { continue }
            if ($html.IndexOf('cid:' + $cid, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
            $nome = "$($a.FileName)"; if (-not $nome) { $nome = 'img' }
            $arq = Join-Path $tmp ($trocadas.ToString() + '-' + ($nome -replace '[\/:*?"<>|]', '_'))
            $a.SaveAsFile($arq)
            $mime = 'image/png'
            if ($nome -match '\.jpe?g$') { $mime = 'image/jpeg' }
            elseif ($nome -match '\.gif$') { $mime = 'image/gif' }
            elseif ($nome -match '\.bmp$') { $mime = 'image/bmp' }
            elseif ($nome -match '\.svg$') { continue }  # svg embute script; fica de fora
            $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($arq))
            $html = $html -replace ('(?i)cid:' + [regex]::Escape($cid)), ('data:' + $mime + ';base64,' + $b64)
            $trocadas++
          } catch { }
        }
      } catch { }
      try { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue } catch { }
    }
    Responder @{ ok = $true; entry_id = "$EntryId"; html = $html; imagens = $trocadas }
  }

  'salvar' {
    if (-not $EntryId) { Falhar 'Falta o EntryId do e-mail.' }
    if (-not $Destino) { Falhar 'Falta a pasta de destino.' }
    $ns = Conectar
    try { $it = $ns.GetItemFromID($EntryId) } catch { Falhar 'Nao achei este e-mail no Outlook. Ele pode ter sido movido ou apagado.' }

    # O nome do arquivo sai do assunto, com os caracteres que o Windows nao aceita trocados. O
    # ler-emails.mjs vai reler o assunto de dentro do proprio .msg depois, entao aqui o nome so
    # precisa ser legivel e unico.
    $base = "$($it.Subject)"
    if (-not $base) { $base = 'E-mail sem assunto' }
    $base = ($base -replace '[\\/:*?"<>|]', ' ') -replace '\s+', ' '
    $base = $base.Trim()
    if ($base.Length -gt 90) { $base = $base.Substring(0, 90).Trim() }

    $alvo = Join-Path $Destino "$base.msg"
    $i = 2
    while (Test-Path -LiteralPath $alvo) { $alvo = Join-Path $Destino "$base ($i).msg"; $i++ }

    # 3 = olMSG. O .msg guarda corpo E anexos num arquivo so, que e exatamente o que o
    # ler-emails.mjs ja sabe abrir desde 01/08. Nenhuma peca nova precisou ser inventada.
    $it.SaveAs($alvo, 3)
    Responder @{ ok = $true; arquivo = "$(Split-Path -Leaf $alvo)"; caminho = "$alvo"; assunto = "$($it.Subject)"; de = "$($it.SenderName)" }
  }

  # ---------------------------------------------------------------------------
  # RESPONDER quem pediu a analise (29/08/2026)
  # ---------------------------------------------------------------------------
  # Pedido dele: "quando eu clicar em Trazer, uma mensagem e enviada para quem me enviou o
  # e-mail, com linha de tempo operacional e uma mensagem que a analise de credito iniciou".
  #
  # E o UNICO lugar deste sistema que ESCREVE no Outlook, e por isso ele e o mais cuidadoso:
  #
  #  - `Reply()`, e nao `ReplyAll()`. Ele disse "para quem me enviou", e responder a todos num
  #    e-mail encaminhado joga a resposta em cima de corretor, subscritor e quem mais estava em
  #    copia, gente que nao pediu nada.
  #  - O corpo NOVO entra ANTES do original, que o proprio Reply ja trouxe citado. A conversa
  #    continua no mesmo fio, e quem recebe ve o que perguntou logo abaixo.
  #  - `rascunho` e o padrao: grava em Rascunhos e NAO envia. Ele mesmo disse "ainda temos que
  #    pensar na mensagem", e mensagem automatica para corretora, escrita errada, vai para o
  #    cliente antes de qualquer um perceber. `enviar` existe e e uma palavra na configuracao,
  #    decisao dele, quando o texto estiver aprovado.
  'responder' {
    if (-not $EntryId) { Falhar 'Falta o EntryId do e-mail a responder.' }
    $ns = Conectar
    try { $it = $ns.GetItemFromID($EntryId) } catch { Falhar 'Nao achei este e-mail no Outlook para responder.' }

    $resp = $it.Reply()
    if ($Assunto) { $resp.Subject = $Assunto }

    # HTMLBody preserva o fio citado que o Reply montou. Trocar por .Body apagaria o historico
    # da conversa, e quem recebe perderia o proprio pedido de vista.
    $novo = ($Corpo -replace "`r`n", '<br>') -replace "`n", '<br>'
    $resp.HTMLBody = '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:10.5pt">' + $novo + '</div>' + $resp.HTMLBody

    $paraQuem = @()
    try { foreach ($r in $resp.Recipients) { $paraQuem += "$($r.Address)" } } catch { }

    if ($Modo -eq 'enviar') {
      $resp.Send()
      Responder @{ ok = $true; modo = 'enviado'; para = $paraQuem; assunto = "$($resp.Subject)" }
    }
    $resp.Save()
    Responder @{ ok = $true; modo = 'rascunho'; para = $paraQuem; assunto = "$($resp.Subject)";
      aviso = 'Gravei em Rascunhos, no seu Outlook. Nada foi enviado.' }
  }

  # ---------------------------------------------------------------------------
  # O CORPO EM TEXTO, de UM e-mail, sob demanda (07/09/2026)
  # ---------------------------------------------------------------------------
  # Unica coisa acrescentada a esta ponte na mudanca para dentro do CRM.
  #
  # A acao 'listar' ja traz o corpo, mas cortado, e o CRM guarda dele so os primeiros
  # 400 caracteres: decisao do Marco em 07/09/2026, para o banco do CRM nao virar copia
  # da caixa de entrada. Quando alguem ABRE o e-mail na tela, o texto inteiro vem por
  # aqui, de um e-mail so.
  #
  # TEXTO, e nao o HTML da acao 'corpo': o HTML de terceiro dentro de uma tela nossa
  # obriga a sanitizar, e o CRM nao tem esse aparato. Quem precisa ver a assinatura
  # com as imagens abre o e-mail no proprio Outlook.
  'texto' {
    if (-not $EntryId) { Falhar 'Falta o EntryId do e-mail.' }
    $ns = Conectar
    try { $it = $ns.GetItemFromID($EntryId) } catch { Falhar 'Nao achei este e-mail no Outlook. Ele pode ter sido movido ou apagado.' }
    $t = ''
    try { $t = "$($it.Body)" } catch { $t = '' }
    if ($t.Length -gt 200000) { $t = $t.Substring(0, 200000) + "`r`n`r`n[...] Texto cortado. O e-mail inteiro esta no Outlook." }
    Responder @{ ok = $true; entry_id = "$EntryId"; texto = $t }
  }

  default { Falhar "Acao desconhecida: $Acao" }
}
