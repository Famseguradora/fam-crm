<#
.SYNOPSIS
  Cria a tarefa agendada que roda o backup do FAM CRM (Node) Seg/Qua/Sex.

.DESCRIPTION
  Rode UMA vez, como Administrador. Cria a Tarefa Agendada "FAM CRM - Backup DB"
  que executa: node scripts\backup-db.mjs "<DestDir>".
  Usa "iniciar assim que possivel apos perder o horario": se o PC estiver
  desligado no horario, o backup roda assim que o PC religar/logar.
  As credenciais sao lidas do .env.local do projeto (nada de segredo aqui).

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
  [string]$DestDir = 'C:\Users\MarcoDragoneFAMSEGUR\FAM Seguradora\FAM SEGURADORA - Documentos\Infraestrutura\Backup - Dashboard FAM',
  [string]$StartAt = '08:00',
  [string[]]$SafetyTimes = @('12:00','18:00'),
  [string[]]$Days = @('Monday','Wednesday','Friday'),
  [switch]$TestNow
)

$ErrorActionPreference = 'Stop'
$taskName  = 'FAM CRM - Backup DB'
$scriptDir = $PSScriptRoot
$worker    = Join-Path $scriptDir 'backup-db.mjs'

if (-not (Test-Path $worker)) { throw "Nao encontrei backup-db.mjs em $scriptDir" }

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
$trigger = foreach ($t in $times) { New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Days -At $t }

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -MultipleInstances IgnoreNew
# S4U = "executar estando o usuario logado ou nao", sem armazenar senha. Assim o
# backup NAO morre se a sessao for bloqueada/deslogada (o Interactive morria com
# erro 0xC000013A) e roda mesmo fora da sessao interativa. Acesso a internet
# (Supabase via HTTPS) funciona normalmente sob S4U.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType S4U -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal `
  -Description 'Backup completo do banco do FAM CRM (Node/Supabase). 1x por dia em dias selecionados.' -Force | Out-Null
Write-Host "Tarefa criada: '$taskName' ($($Days -join ', ') as $StartAt + seguranca $($SafetyTimes -join '/'); WakeToRun ligado; idempotente 1x/dia)" -ForegroundColor Green
Write-Host "  Comando: `"$node`" $argument" -ForegroundColor DarkGray

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
