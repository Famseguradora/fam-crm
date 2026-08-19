<#
.SYNOPSIS
  Cria a tarefa agendada que roda o backup do FAM CRM (Node) Seg/Qua/Sex.

.DESCRIPTION
  Rode UMA vez. Cria a Tarefa Agendada "FAM CRM - Backup DB" que executa:
  node scripts\backup-db.mjs "<DestDir>".
  Usa "iniciar assim que possivel apos perder o horario": se o PC estiver
  desligado no horario, o backup roda assim que o PC religar/logar.
  As credenciais sao lidas do .env.local do projeto (nada de segredo aqui).

  DOIS MODOS, escolhidos automaticamente:
   - COM admin  -> LogonType S4U: roda com voce logado ou nao, e o WakeToRun
                   acorda o PC no horario. E o modo ideal.
   - SEM admin  -> LogonType Interactive: o Windows so permite registrar S4U e
                   WakeToRun com elevacao, entao caimos para Interactive e
                   acrescentamos um gatilho de logon. O backup passa a exigir
                   que voce esteja logado, mas com 3 horarios + logon + a
                   idempotencia do worker o backup diario se mantem na pratica.
  A mensagem final informa qual modo foi usado.

.PARAMETER SemAdmin
  Forca o modo Interactive mesmo com privilegio de administrador disponivel.

.PARAMETER DestDir
  Pasta de destino dos backups. Padrao: pasta de Infraestrutura no SharePoint da FAM.

.PARAMETER StartAt
  Hora alvo do backup nos dias escolhidos. Padrao: 08:00. Se o PC estiver
  desligado nesse horario, o backup roda assim que o PC ligar naquele dia.

.PARAMETER SafetyTimes
  Horarios de REDE DE SEGURANCA nos mesmos dias (padrao: 12:00 e 18:00). Se o PC
  estava dormindo as 08:00 e a janela de "catch-up" do Windows expirou, um desses
  gatilhos roda o backup quando o PC estiver acordado. O script e idempotente: se
  o backup do dia ja foi feito ha menos de 6h, esses gatilhos extras apenas pulam.

.PARAMETER Days
  Dias da semana em que o backup ocorre. Padrao: Monday,Wednesday,Friday.

.PARAMETER TestNow
  Se presente, roda um backup imediatamente apos criar a tarefa.

.EXAMPLE
  .\register-backup-task.ps1 -TestNow
#>

[CmdletBinding()]
param(
  [string]$DestDir = 'C:\Users\MarcoDragoneFAMSEGUR\FAM Seguradora\FAM SEGURADORA - Documents\Infraestrutura\Backup - Dashboard FAM',
  [string]$StartAt = '08:00',
  [string[]]$SafetyTimes = @('12:00','18:00'),
  [string[]]$Days = @('Monday','Wednesday','Friday'),
  [switch]$TestNow,
  [switch]$SemAdmin
)

$ErrorActionPreference = 'Stop'
$taskName  = 'FAM CRM - Backup DB'
$scriptDir = $PSScriptRoot
$worker    = Join-Path $scriptDir 'backup-db.mjs'

if (-not (Test-Path $worker)) { throw "Nao encontrei backup-db.mjs em $scriptDir" }

# Registrar LogonType S4U exige privilegio de administrador -- sem elevacao o
# Register-ScheduledTask falha com "Acesso negado". Em maquina corporativa sem
# admin isso inviabilizaria o backup, entao detectamos e caimos para Interactive,
# que foi como a tarefa rodou originalmente (ver $usarS4U mais abaixo).
$ehAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$usarS4U = $ehAdmin -and -not $SemAdmin

# Localiza node.exe
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node.exe nao encontrado no PATH. Instale o Node.js ou ajuste o PATH.' }

# Garante a pasta de destino
if (-not (Test-Path $DestDir)) { New-Item -ItemType Directory -Path $DestDir -Force | Out-Null }

# --- Cria a tarefa agendada ---
$argument = '"{0}" "{1}"' -f $worker, $DestDir
$action   = New-ScheduledTaskAction -Execute $node -Argument $argument -WorkingDirectory $scriptDir

# Backup nos dias escolhidos (Seg/Qua/Sex). Tres camadas de robustez:
#  1) Gatilho principal as 08:00 com -WakeToRun: o Windows ACORDA o PC para rodar.
#  2) Gatilhos de seguranca (12:00/18:00): se o PC dormiu alem da janela de
#     catch-up do das 08:00, um destes roda o backup quando o PC estiver acordado.
#  3) StartWhenAvailable: roda assim que possivel apos perder o horario.
# O script e idempotente (pula se o backup do dia ja foi feito ha < 6h), entao na
# pratica continua "1x por dia" -- os gatilhos extras so agem se o principal falhar.
$times   = @($StartAt) + $SafetyTimes
$trigger = @(foreach ($t in $times) { New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Days -At $t })

# Sem S4U a tarefa so roda com o usuario logado. Um gatilho de logon compensa:
# se o PC estava desligado nos tres horarios, o backup sai no proximo login.
# Seguro porque o worker e idempotente (pula se ja rodou ha < 6h).
if (-not $usarS4U) { $trigger += New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME" }

# WakeToRun (acordar o PC) tambem e privilegiado: so pedimos com elevacao.
$settingsArgs = @{
  StartWhenAvailable       = $true
  AllowStartIfOnBatteries  = $true
  DontStopIfGoingOnBatteries = $true
  ExecutionTimeLimit       = (New-TimeSpan -Hours 1)
  MultipleInstances        = 'IgnoreNew'
}
if ($usarS4U) { $settingsArgs.WakeToRun = $true }
$settings = New-ScheduledTaskSettingsSet @settingsArgs

# S4U = "executar estando o usuario logado ou nao", sem armazenar senha. Assim o
# backup NAO morre se a sessao for bloqueada/deslogada (o Interactive morria com
# erro 0xC000013A) e roda mesmo fora da sessao interativa. Acesso a internet
# (Supabase via HTTPS) funciona normalmente sob S4U.
# Interactive e o plano B para maquina sem admin: roda so com o usuario logado,
# mas com 3 horarios + gatilho de logon + idempotencia o backup diario se mantem.
$logon = if ($usarS4U) { 'S4U' } else { 'Interactive' }
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType $logon -RunLevel Limited

try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal `
    -Description 'Backup completo do banco do FAM CRM (Node/Supabase). 1x por dia em dias selecionados.' `
    -Force -ErrorAction Stop | Out-Null
} catch {
  throw "Falha ao registrar '$taskName': $($_.Exception.Message)"
}

# Register-ScheduledTask e um cmdlet CIM e nem sempre honra o
# $ErrorActionPreference -- ja aconteceu de ele falhar com "Acesso negado" e o
# script seguir imprimindo "Tarefa criada". So confiamos no que o agendador
# confirma de volta.
if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
  throw "Register-ScheduledTask nao acusou erro, mas '$taskName' nao existe no agendador. Rode como administrador e confira."
}

$extras = if ($usarS4U) { 'WakeToRun ligado; roda logado ou nao' }
          else { 'gatilho de logon extra; roda apenas com voce logado' }
Write-Host "Tarefa criada: '$taskName' ($($Days -join ', ') as $StartAt + seguranca $($SafetyTimes -join '/'); idempotente 1x/dia)" -ForegroundColor Green
Write-Host "  Modo: $logon -- $extras" -ForegroundColor Cyan
Write-Host "  Comando: `"$node`" $argument" -ForegroundColor DarkGray
if (-not $usarS4U) {
  Write-Host ''
  Write-Host 'Registrado SEM privilegio de administrador (modo Interactive).' -ForegroundColor Yellow
  Write-Host 'Consequencia: o backup nao roda com a sessao deslogada nem acorda o PC.' -ForegroundColor Yellow
  Write-Host 'Se um dia tiver admin, rode este script elevado para voltar ao modo S4U.' -ForegroundColor Yellow
}

# --- Teste imediato (opcional) ---
if ($TestNow) {
  Write-Host 'Rodando backup de teste agora...' -ForegroundColor Cyan
  & $node $worker $DestDir
  if ($LASTEXITCODE -eq 0) { Write-Host 'Teste OK - confira o .json.gz no destino.' -ForegroundColor Green }
  else { Write-Host "Teste FALHOU (codigo $LASTEXITCODE). Veja backup.log no destino." -ForegroundColor Red }
}

Write-Host ''
Write-Host 'Para rodar manualmente quando quiser:' -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName `"$taskName`""
