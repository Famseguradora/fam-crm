@echo off
REM ============================================================================
REM  SOBE O CRM NA MAQUINA, e garante que ele sobe UMA VEZ SO.
REM
REM  Quem chama este arquivo e o crm-servidor.vbs, que roda tudo SEM JANELA.
REM  Ordem do Marco em 08/09/2026: "essa tela preta nunca precisou, amanha nao
REM  vou conseguir usar o sistema".
REM
REM  POR QUE TANTO CUIDADO COM PROCESSO REPETIDO. Medido nesta maquina em
REM  08/09/2026: dois servidores escrevendo na mesma pasta .next corrompem o
REM  cache do Turbopack, e o log enche de
REM
REM      TurbopackInternalError: Failed to restore task data (corrupted database)
REM      Persisting failed: Another write batch or compaction is already active
REM
REM  Dali em diante toda tela que precise compilar responde 500, e o que aparece
REM  para quem esta usando e o erro vermelho "Jest worker encountered 2 child
REM  process exceptions". E o mesmo defeito que ele levou hoje ao abrir a ficha
REM  de um tomador. Por isso: se ja ha um CRM de pe, este arquivo NAO sobe outro;
REM  se ha um servidor meio morto (nao responde, mas o processo existe), ele
REM  limpa antes de subir.
REM
REM  A saida vai para crm-servidor.log, na raiz do projeto. E o que substitui a
REM  janela preta: quando alguma coisa quebrar, o erro esta ali, com hora.
REM ============================================================================
cd /d "%~dp0.."

REM 1. Ja esta no ar? Entao nao ha nada a fazer. O -f conta 404 e 500 como
REM    fora do ar: em 15/09/2026 o servidor respondia 404 para tudo e passava.
curl -sf -o nul --max-time 3 http://localhost:3000/login
if not errorlevel 1 (
  echo O CRM ja esta de pe em http://localhost:3000
  exit /b 0
)

REM 2. Nao responde. Se sobrou processo desta pasta, ele morre antes de subir o
REM    novo: e o unico jeito de garantir um escritor so na pasta .next.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*next*' -and $_.CommandLine -like '*fam-crm*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

REM A MEMORIA NAO SE MEXE AQUI (15/09/2026): o next dev ja da ao servidor
REM metade da RAM, uns 15 GB nesta maquina. Mesmo assim, de pe por 30 h, ele
REM chegou a 80 por cento, se reiniciou sozinho e voltou respondendo 404 para
REM tudo. Quem cuida disso e o scripts\crm-vigia.ps1.

echo. >> crm-servidor.log
echo ==== subindo o CRM em %DATE% %TIME% ==== >> crm-servidor.log
call npm run dev >> crm-servidor.log 2>&1

echo ==== o CRM PAROU em %DATE% %TIME% ==== >> crm-servidor.log
exit /b 1
