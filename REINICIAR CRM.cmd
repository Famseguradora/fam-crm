@echo off
title FAM CRM - reiniciando
REM ============================================================================
REM  QUANDO O CRM DA PAU, E O UNICO BOTAO QUE VOCE PRECISA APERTAR.
REM
REM  Serve para o erro vermelho "Jest worker encountered ... child process
REM  exceptions" e para a tela que fica em "Carregando..." sem sair do lugar.
REM  Os dois sao o mesmo problema: o servidor da maquina envelheceu.
REM
REM  Ele derruba o que estiver na porta 3000, joga fora o cache de compilacao
REM  (a pasta .next, que e o que corrompe) e sobe tudo de novo SEM JANELA.
REM ============================================================================
cd /d "%~dp0"

echo.
echo   Reiniciando o CRM. Isso leva menos de um minuto.
echo.

REM O parenteses NAO pode aparecer solto no texto aqui dentro: dentro de um
REM bloco `for (...)` o cmd le o primeiro ")" como o fim do bloco.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"TCP.*:3000 .*LISTENING"') do (
  echo   parando o servidor antigo, PID %%p
  taskkill /F /PID %%p >nul 2>&1
)

REM Alem do que ocupa a porta, morre TODO servidor desta pasta, inclusive o que
REM ainda estava subindo e por isso nem tinha aberto a porta. Sem isso, apagar
REM a .next embaixo de um processo vivo corrompe o cache do Turbopack, que e a
REM origem do "Jest worker encountered ... child process exceptions".
echo   procurando servidor sobrando
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*next*' -and $_.CommandLine -like '*fam-crm*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 3 /nobreak >nul

echo   limpando o cache de compilacao
rmdir /s /q .next >nul 2>&1

echo   subindo o CRM
start "" wscript.exe "%~dp0crm-servidor.vbs"

echo.
echo   Esperando o CRM responder...
setlocal enabledelayedexpansion
set /a tentativas=0
:esperar
set /a tentativas+=1
curl -s -o nul --max-time 3 http://localhost:3000/login
if not errorlevel 1 goto pronto
if !tentativas! GEQ 60 goto demorou
timeout /t 2 /nobreak >nul
goto esperar

:pronto
echo.
echo   PRONTO. O CRM esta no ar em http://localhost:3000
echo   Pode fechar esta janela: o servidor NAO depende dela.
echo.
timeout /t 6 /nobreak >nul
exit /b 0

:demorou
echo.
echo   O CRM nao respondeu em 2 minutos. O erro esta no arquivo:
echo   %~dp0crm-servidor.log
echo.
pause
exit /b 1
