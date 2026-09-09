@echo off
title FAM CRM - parando
REM ============================================================================
REM  DESLIGA O CRM DA MAQUINA.
REM
REM  Existe porque, sem janela preta, nao ha mais nada para fechar. Serve para
REM  quando alguem precisar liberar a porta 3000 ou parar o servidor de proposito.
REM
REM  Para ligar de novo: duplo clique no REINICIAR CRM.cmd (ou reiniciar o
REM  computador, que ele sobe sozinho).
REM ============================================================================
cd /d "%~dp0"

set achou=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"TCP.*:3000 .*LISTENING"') do (
  taskkill /F /PID %%p >nul 2>&1
  set achou=1
)

echo.
if "%achou%"=="1" (
  echo   O CRM foi parado. O http://localhost:3000 saiu do ar.
) else (
  echo   O CRM nao estava rodando nesta maquina.
)
echo.
echo   Para ligar de novo: duplo clique em "REINICIAR CRM.cmd".
echo.
timeout /t 6 /nobreak >nul
