<#
.SYNOPSIS
  Cria a tarefa agendada que gera o Resumo Executivo Diario do FAM CRM
  ("Vigia FAM") TODOS OS DIAS.

.DESCRIPTION
  Rode UMA vez. Cria a Tarefa Agendada "FAM CRM - Resumo Executivo" que
  executa: node scripts\resumo-executivo.mjs "<DestDir>".
  Usa "iniciar assim que possivel apos perder o horario": se o PC estiver
  desligado no horario, o resumo roda assim que o PC religar/logar no dia.
  As credenciais sao lidas do .env.local do projeto (nada de segredo aqui).
  Horario padrao 07:40 -- logo apos a Analise Financeira das 07:30.

.PARAMETER DestDir
  Pasta de destino dos relatorios. Padrao: pasta de Infraestrutura no SharePoint.

.PARAMETER StartAt
  Hora alvo do resumo. Padrao: 07:40.

.PARAMETER TestNow
  Se presente, gera um resumo imediatamente apos criar a tarefa (SEM publicar
  no banner: usa --no-banner, so para conferir que gera o arquivo).

.EXAMPLE
  .\register-resumo-task.ps1 -TestNow
#>

[CmdletBinding()]
param(
  [string]$DestDir = 'C:\Users\MarcoDragoneFAMSEGUR\FAM Seguradora\FAM SEGURADORA - Documents\Infraestrutura\Resumo Executivo - FAM CRM',
  [string]$StartAt = '07:40',
  [switch]$TestNow
)

$ErrorActionPreference = 'Stop'
$taskName  = 'FAM CRM - Resumo Executivo'
$scriptDir = $PSScriptRoot
$worker    = Join-Path $scriptDir 'resumo-executivo.mjs'

if (-not (Test-Path $worker)) { throw "Nao encontrei resumo-executivo.mjs em $scriptDir" }

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'node.exe nao encontrado no PATH. Instale o Node.js ou ajuste o PATH.' }

if (-not (Test-Path $DestDir)) { New-Item -ItemType Directory -Path $DestDir -Force | Out-Null }

# --- Cria a tarefa agendada (diaria) ---
$argument = '"{0}" "{1}"' -f $worker, $DestDir
$action   = New-ScheduledTaskAction -Execute $node -Argument $argument -WorkingDirectory $scriptDir

# 1 resumo por dia. Se o PC estiver desligado no horario, "StartWhenAvailable"
# roda assim que ele ligar -- uma unica vez no dia.
$trigger  = New-ScheduledTaskTrigger -Daily -At $StartAt

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive -RunLevel Limited

try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal `
    -Description 'Resumo Executivo Diario do FAM CRM (Node/Supabase). Roda 1x/dia, gera relatorio e publica o resumo no banner do CRM.' `
    -Force -ErrorAction Stop | Out-Null
} catch {
  throw "Falha ao registrar '$taskName': $($_.Exception.Message)"
}

# Register-ScheduledTask e um cmdlet CIM e nem sempre honra o
# $ErrorActionPreference. So confiamos no que o agendador confirma de volta.
if (-not (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
  throw "Register-ScheduledTask nao acusou erro, mas '$taskName' nao existe no agendador."
}

Write-Host "Tarefa criada: '$taskName' (diaria as $StartAt; roda ao ligar se perdido)" -ForegroundColor Green
Write-Host "  Comando: `"$node`" $argument" -ForegroundColor DarkGray

if ($TestNow) {
  Write-Host 'Gerando resumo de teste agora (--no-banner)...' -ForegroundColor Cyan
  & $node $worker $DestDir --no-banner
  if ($LASTEXITCODE -eq 0) { Write-Host 'Teste OK - confira o .txt no destino.' -ForegroundColor Green }
  else { Write-Host "Teste FALHOU (codigo $LASTEXITCODE). Veja o resumo.log no destino." -ForegroundColor Yellow }
}

Write-Host ''
Write-Host 'Para rodar manualmente quando quiser:' -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName `"$taskName`""
