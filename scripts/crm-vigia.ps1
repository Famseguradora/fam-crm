# ============================================================================
#  O VIGIA DO CRM (15/09/2026). Ordem do Marco: "precisa manter o CRM FAM aberto".
#
#  Em 15/09/2026 o servidor estava de pe havia 30 h, bateu no limite de memoria
#  do Node, o proprio Next se reiniciou ("approaching the used memory
#  threshold") e voltou respondendo 404 para TUDO. O processo continuava vivo,
#  entao nada o derrubava: o crm-subir.cmd so age quando o servidor morre.
#
#  Este vigia pergunta ao CRM a cada minuto se o /login abre (200). Tres
#  falhas seguidas = o mesmo remedio do REINICIAR CRM.cmd: mata todo next
#  desta pasta, apaga a .next e sobe de novo pelo crm-servidor.vbs.
#
#  Sobe junto com o CRM (crm-servidor.vbs), sem janela, um so por vez.
#  O PARAR CRM.cmd deixa o arquivo crm-parado.flag: com ele, o vigia nao
#  religa nada. O REINICIAR CRM.cmd apaga o arquivo.
#  O que ele fez fica em crm-vigia.log, na raiz.
#
#  ASCII puro de proposito: o PowerShell 5.1 le arquivo sem BOM como ANSI.
# ============================================================================
$ErrorActionPreference = 'Continue'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$log = Join-Path $raiz 'crm-vigia.log'
$parado = Join-Path $raiz 'crm-parado.flag'

# Um vigia so: o crm-servidor.vbs roda a cada subida e tentaria abrir outro.
$mutex = New-Object System.Threading.Mutex($false, 'FAM-CRM-vigia')
try {
  if (-not $mutex.WaitOne(0)) { exit 0 }
} catch [System.Threading.AbandonedMutexException] {
  # o vigia anterior morreu sem soltar: agora o dono e este
}

function Anotar($texto) {
  try { Add-Content -Path $log -Value "$(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')  $texto" -Encoding UTF8 } catch { }
}

function Responde {
  try {
    $r = Invoke-WebRequest 'http://localhost:3000/login' -UseBasicParsing -TimeoutSec 90
    return @{ ok = ($r.StatusCode -eq 200); motivo = "HTTP $($r.StatusCode)" }
  } catch {
    $codigo = $null
    if ($_.Exception.Response) { $codigo = [int]$_.Exception.Response.StatusCode }
    if ($codigo) { return @{ ok = $false; motivo = "HTTP $codigo" } }
    return @{ ok = $false; motivo = $_.Exception.Message }
  }
}

Anotar 'vigia ligado'
$falhas = 0
while ($true) {
  Start-Sleep -Seconds 60
  if (Test-Path $parado) { $falhas = 0; continue }

  $r = Responde
  if ($r.ok) { $falhas = 0; continue }
  $falhas++
  Anotar "o CRM nao abriu ($($r.motivo)), falha $falhas de 3"
  if ($falhas -lt 3) { continue }

  Anotar 'reiniciando: mata o next desta pasta, apaga a .next e sobe de novo'
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*next*' -and $_.CommandLine -like '*fam-crm*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 3
  Remove-Item -Recurse -Force (Join-Path $raiz '.next') -ErrorAction SilentlyContinue
  Start-Process wscript.exe -ArgumentList "`"$(Join-Path $raiz 'crm-servidor.vbs')`"" -WorkingDirectory $raiz
  $falhas = 0

  # Tempo de subir antes de voltar a perguntar.
  Start-Sleep -Seconds 120
  $r = Responde
  if ($r.ok) { Anotar 'voltou: /login 200' } else { Anotar "ainda sem resposta ($($r.motivo)); tento de novo no proximo ciclo" }
}
