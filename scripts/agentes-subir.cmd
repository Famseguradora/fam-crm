@echo off
REM ============================================================================
REM  SOBE O CARTEIRO E A ESTEIRA, sem janela nenhuma.
REM
REM  Pedido do Marco em 09/09/2026: "tenho que manter varias telas abertas para
REM  poder trabalhar: Carteiro, Esteira e o meu proprio Outlook".
REM
REM  ISTO NAO E A SOLUCAO, E O CURATIVO. Enquanto o Carteiro ler o Outlook desta
REM  maquina e o motor da analise rodar aqui, os dois processos precisam existir
REM  em algum lugar. O que este arquivo tira e a JANELA, nao a dependencia. A
REM  solucao de verdade e tirar os dois da maquina (Microsoft Graph para o
REM  e-mail, API da Anthropic para o motor), e esta escrita no LEMBRETES.md.
REM
REM  Quem chama este arquivo e o agentes.vbs, que roda tudo escondido.
REM
REM  QUEM JA ESTA DE PE NAO E DERRUBADO (mudanca de 09/09/2026). Antes este
REM  arquivo matava os dois e subia os dois de novo, e isso interrompia uma
REM  analise em curso so porque alguem queria ligar o Carteiro. Agora ele olha
REM  cada um e sobe apenas o que falta.
REM
REM  UM DE CADA, sempre: dois Carteiros leriam o mesmo e-mail duas vezes e duas
REM  Esteiras dariam a mesma ordem duas vezes ao motor.
REM
REM  ── OS DOIS DEFEITOS CONSERTADOS EM 10/09/2026 ──────────────────────────────
REM
REM  1. A ESTEIRA NUNCA SUBIA POR AQUI. O Carteiro e a Esteira gravavam no MESMO
REM     agentes.log. O Carteiro subia primeiro e ficava com o arquivo aberto; o
REM     Windows recusava o segundo ">> agentes.log", e com isso a linha que subia
REM     a Esteira falhava calada. Resultado: a Mesa do CRM guardava as ordens
REM     (reconferir, varrer) e ninguem executava, e o caso da Bouw ficou parado
REM     com os balancos no Storage e a pasta so com dois Serasas.
REM     Agora cada um tem o seu log: carteiro.log e esteira.log. O agentes.log
REM     fica so com o diario deste arquivo, escrito ANTES de subir qualquer um.
REM
REM  2. A CHECAGEM DE "JA ESTA DE PE" NAO RECONHECIA O CARTEIRO aberto pelo
REM     CARTEIRO.cmd, cuja linha de comando e "node scripts\carteiro.mjs", sem o
REM     caminho do repositorio. Ela exigia "fam-crm" no comando, nao achava, e
REM     subia um SEGUNDO Carteiro. Agora basta o nome do script.
REM ============================================================================
cd /d "%~dp0.."

set CARTEIRO_DE_PE=0
set ESTEIRA_DE_PE=0
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*carteiro.mjs*' }) { exit 1 } else { exit 0 }"
if errorlevel 1 set CARTEIRO_DE_PE=1
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*esteira.mjs*' }) { exit 1 } else { exit 0 }"
if errorlevel 1 set ESTEIRA_DE_PE=1

REM O diario vai inteiro AGORA, com o arquivo ainda livre.
echo. >> agentes.log
echo ==== agentes.vbs em %DATE% %TIME% ==== >> agentes.log
if "%CARTEIRO_DE_PE%"=="1" (echo Carteiro ja estava de pe. Nao subi outro. >> agentes.log) else (echo Subindo o Carteiro. Saida em carteiro.log. >> agentes.log)
if "%ESTEIRA_DE_PE%"=="1" (echo Esteira ja estava de pe. Nao subi outra. >> agentes.log) else (echo Subindo a Esteira. Saida em esteira.log. >> agentes.log)

if "%CARTEIRO_DE_PE%"=="0" start "" /b cmd /c node scripts\carteiro.mjs >> carteiro.log 2>&1
if "%ESTEIRA_DE_PE%"=="0" start "" /b cmd /c node scripts\esteira.mjs >> esteira.log 2>&1

exit /b 0
