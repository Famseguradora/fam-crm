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

# 1 backup por dia nos dias escolhidos (Seg/Qua/Sex). Se o PC estiver desligado
# no horario, "StartWhenAvailable" roda assim que ele ligar -- uma unica vez no dia.
$trigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Days -At $StartAt

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal `
  -Description 'Backup completo do banco do FAM CRM (Node/Supabase). 1x por dia em dias selecionados.' -Force | Out-Null
Write-Host "Tarefa criada: '$taskName' (1x/dia em $($Days -join ', ') as $StartAt; roda ao ligar se perdido)" -ForegroundColor Green
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
