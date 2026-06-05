<#
.SYNOPSIS
  Cria a tarefa agendada que roda o Agente de Análise Financeira do FAM CRM
  TODOS OS DIAS.

.DESCRIPTION
  Rode UMA vez. Cria a Tarefa Agendada "FAM CRM - Analise Financeira" que
  executa: node scripts\analise-financeira.mjs "<DestDir>".
  Usa "iniciar assim que possivel apos perder o horario": se o PC estiver
  desligado no horario, a analise roda assim que o PC religar/logar no dia.
  As credenciais sao lidas do .env.local do projeto (nada de segredo aqui).

.PARAMETER DestDir
  Pasta de destino dos relatorios. Padrao: pasta de Infraestrutura no SharePoint.

.PARAMETER StartAt
  Hora alvo da analise. Padrao: 07:30 (antes do expediente).

.PARAMETER TestNow
  Se presente, roda uma analise imediatamente apos criar a tarefa.

.EXAMPLE
  .\register-analise-task.ps1 -TestNow
#>

[CmdletBinding()]
param(
  [string]$DestDir = 'C:\Users\MarcoDragoneFAMSEGUR\FAM Seguradora\FAM SEGURADORA - Documentos\Infraestrutura\Analise Financeira - FAM CRM',
  [string]$StartAt = '07:30',
  [switch]$TestNow
)

$ErrorActionPreference = 'Stop'
$taskName  = 'FAM CRM - Analise Financeira'
$scriptDir = $PSScriptRoot
$worker    = Join-Path $scriptDir 'analise-financeira.mjs'

if (-not (Test-Path $worker)) { throw "Nao encontrei analise-financeira.mjs em $scriptDir" }

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node.exe nao encontrado no PATH. Instale o Node.js ou ajuste o PATH.' }

if (-not (Test-Path $DestDir)) { New-Item -ItemType Directory -Path $DestDir -Force | Out-Null }

# --- Cria a tarefa agendada (diaria) ---
$argument = '"{0}" "{1}"' -f $worker, $DestDir
$action   = New-ScheduledTaskAction -Execute $node -Argument $argument -WorkingDirectory $scriptDir

# 1 analise por dia. Se o PC estiver desligado no horario, "StartWhenAvailable"
# roda assim que ele ligar -- uma unica vez no dia.
$trigger  = New-ScheduledTaskTrigger -Daily -At $StartAt

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal `
  -Description 'Agente de Analise Financeira do FAM CRM (Node/Supabase). Roda 1x/dia e gera relatorio de furos e erros.' -Force | Out-Null
Write-Host "Tarefa criada: '$taskName' (diaria as $StartAt; roda ao ligar se perdido)" -ForegroundColor Green
Write-Host "  Comando: `"$node`" $argument" -ForegroundColor DarkGray

if ($TestNow) {
  Write-Host 'Rodando analise de teste agora...' -ForegroundColor Cyan
  & $node $worker $DestDir
  if ($LASTEXITCODE -eq 0) { Write-Host 'Teste OK - nenhum achado critico. Confira o .txt no destino.' -ForegroundColor Green }
  else { Write-Host "Teste concluiu com achados CRITICOS (codigo $LASTEXITCODE). Veja o .txt no destino." -ForegroundColor Yellow }
}

Write-Host ''
Write-Host 'Para rodar manualmente quando quiser:' -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName `"$taskName`""
