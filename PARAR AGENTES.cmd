@echo off
title FAM - parando o Carteiro e a Esteira
REM ============================================================================
REM  DESLIGA O CARTEIRO E A ESTEIRA.
REM
REM  Existe porque, sem janela preta, nao ha mais nada para fechar.
REM  Para ligar de novo: duplo clique no agentes.vbs (ou reiniciar o computador,
REM  se a tarefa de logon estiver criada).
REM ============================================================================
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*carteiro.mjs*' -or $_.CommandLine -like '*esteira.mjs*' }; $p | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Host ''; if ($p) { Write-Host ('   Parei ' + $p.Count + ' agente(s).') } else { Write-Host '   Nenhum agente estava rodando.' }"

echo.
echo   Para ligar de novo: duplo clique em "agentes.vbs".
echo.
timeout /t 6 /nobreak >nul
