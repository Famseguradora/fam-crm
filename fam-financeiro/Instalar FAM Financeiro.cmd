@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title Instalar FAM Financeiro

rem ============================================================================
rem  Instalador do FAM Financeiro.
rem
rem  Nao pede administrador: instala para o usuario que esta logado, dentro do
rem  LOCALAPPDATA dele. Cria atalho na area de trabalho e no menu Iniciar, com
rem  icone proprio, e registra a desinstalacao em "Adicionar ou remover
rem  programas". Rodar de novo por cima atualiza a instalacao.
rem
rem  Duas valvulas, para dar para testar sem sujar a maquina:
rem    FAM_DEST      instala noutra pasta
rem    FAM_SEM_PAUSA nao espera tecla no fim
rem
rem  Desenvolvido por: Marco Aurelio Dragone
rem ============================================================================

set "ORIGEM=%~dp0"
set "DEST=%LOCALAPPDATA%\FAM Financeiro"
if defined FAM_DEST set "DEST=%FAM_DEST%"
set "MENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\FAM Seguradora"
set "CHAVE=HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\FAMFinanceiro"

echo.
echo   ============================================================
echo    FAM FINANCEIRO
echo    Controle de caixa e auditoria da FAM Seguradora
echo   ============================================================
echo.
echo   O sistema nao usa nuvem, nao usa banco de dados e nao manda
echo   nada para a internet. Ele fica neste computador.
echo.

if not exist "%ORIGEM%dashboard.html" (
  echo   [erro] Nao achei o dashboard.html do lado deste instalador.
  echo          Rode o instalador de dentro da pasta onde os dois estao juntos.
  goto :fim_erro
)

rem A pasta de desenvolvimento nao pode ser confundida com uma instalacao: o
rem Marco instala na maquina dele para testar, e a pasta do codigo continua
rem sendo dele, intocada.
if exist "%ORIGEM%build-dashboard.cjs" (
  echo   [aviso] Esta e a pasta de DESENVOLVIMENTO do sistema.
  echo           A instalacao vai para outra pasta e nao encosta em nada daqui.
  echo.
)

set "ATUALIZANDO="
if exist "%DEST%\dashboard.html" set "ATUALIZANDO=1"
if defined ATUALIZANDO (
  echo   Ja existe uma instalacao em:
  echo     %DEST%
  echo   Ela vai ser ATUALIZADA. Os dados nao se perdem: eles ficam no
  echo   navegador, nao no arquivo.
  echo.
)

if not exist "%DEST%" mkdir "%DEST%" 2>nul
if not exist "%DEST%" (
  echo   [erro] Nao consegui criar a pasta %DEST%
  goto :fim_erro
)

echo   Copiando os arquivos...
copy /Y "%ORIGEM%dashboard.html" "%DEST%\dashboard.html" >nul || goto :fim_copia
if exist "%ORIGEM%fam-financeiro.ico" copy /Y "%ORIGEM%fam-financeiro.ico" "%DEST%\" >nul
if exist "%ORIGEM%extrato-exemplo-agosto.pdf" copy /Y "%ORIGEM%extrato-exemplo-agosto.pdf" "%DEST%\" >nul

set "ICO=%DEST%\fam-financeiro.ico"
if not exist "%ICO%" set "ICO="

rem carimbo da versao instalada, para saber depois o que esta rodando ali
for %%A in ("%DEST%\dashboard.html") do set "QUANDO=%%~tA"
> "%DEST%\versao.txt" echo FAM Financeiro
>>"%DEST%\versao.txt" echo Instalado em %DATE% as %TIME%
>>"%DEST%\versao.txt" echo Arquivo dashboard.html de %QUANDO%
>>"%DEST%\versao.txt" echo Origem: %ORIGEM%
>>"%DEST%\versao.txt" echo Desenvolvido por: Marco Aurelio Dragone

rem atalho de socorro dentro da propria pasta, caso os outros se percam
> "%DEST%\Abrir FAM Financeiro.cmd" echo @echo off
>>"%DEST%\Abrir FAM Financeiro.cmd" echo start "" msedge.exe "%%~dp0dashboard.html"

rem ── onde esta o Edge ──
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" (
  echo   [aviso] Nao achei o Microsoft Edge no lugar de sempre.
  echo           Os atalhos vao abrir no navegador padrao do Windows.
  set "EDGE="
)

rem A area de trabalho quase nunca esta em %USERPROFILE%\Desktop: com o OneDrive
rem ligado ela e redirecionada. Perguntar ao Windows onde ela fica de verdade e
rem o que faz o desinstalador conseguir apagar o atalho depois.
set "DESKTOP=%USERPROFILE%\Desktop"
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESKTOP=%%D"

rem ── o desinstalador, escrito aqui para viver dentro da instalacao ──
call :escrever_desinstalador
if errorlevel 1 goto :fim_erro

rem ── atalhos: area de trabalho e menu Iniciar ──
if not exist "%MENU%" mkdir "%MENU%" 2>nul
set "PS=%TEMP%\fam-atalhos-%RANDOM%.ps1"
call :escrever_powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS%" -Dest "%DEST%" -Edge "%EDGE%" -Ico "%ICO%" -Menu "%MENU%"
set "ERRO_ATALHO=%ERRORLEVEL%"
del "%PS%" >nul 2>&1
if not "%ERRO_ATALHO%"=="0" echo   [aviso] Algum atalho pode nao ter sido criado.

rem ── "Adicionar ou remover programas" (so do usuario, sem administrador) ──
reg add "%CHAVE%" /v DisplayName     /t REG_SZ /d "FAM Financeiro" /f >nul
reg add "%CHAVE%" /v DisplayVersion  /t REG_SZ /d "1.0" /f >nul
reg add "%CHAVE%" /v Publisher       /t REG_SZ /d "FAM Seguradora - Marco Aurelio Dragone" /f >nul
reg add "%CHAVE%" /v InstallLocation /t REG_SZ /d "%DEST%" /f >nul
reg add "%CHAVE%" /v UninstallString /t REG_SZ /d "\"%DEST%\Desinstalar FAM Financeiro.cmd\"" /f >nul
reg add "%CHAVE%" /v NoModify        /t REG_DWORD /d 1 /f >nul
reg add "%CHAVE%" /v NoRepair        /t REG_DWORD /d 1 /f >nul
if defined ICO reg add "%CHAVE%" /v DisplayIcon /t REG_SZ /d "%ICO%" /f >nul

echo.
echo   ------------------------------------------------------------
if defined ATUALIZANDO (
  echo    ATUALIZADO
) else (
  echo    INSTALADO
)
echo   ------------------------------------------------------------
echo    Pasta ............ %DEST%
echo    Area de trabalho . FAM Financeiro
echo                       %DESKTOP%
echo    Menu Iniciar ..... FAM Seguradora ^> FAM Financeiro
echo    Desinstalar ...... pelo menu Iniciar, ou em
echo                       Adicionar ou remover programas
echo.
echo   ONDE FICAM OS DADOS
echo    Os lancamentos ficam no navegador deste computador, presos ao
echo    usuario do Windows que esta logado agora. Eles NAO ficam dentro
echo    do dashboard.html: trocar o arquivo de lugar, atualizar o
echo    sistema ou desinstalar nao apaga nada.
echo.
echo    Uma vez por mes, abra o sistema e use o botao
echo    "Salvar copia dos dados" la no rodape. Guarde o .json em lugar
echo    seguro: e com ele que os dados voltam, aqui ou noutra maquina.
echo    A trilha de auditoria vai junto nesse mesmo arquivo.
echo.
echo   ------------------------------------------------------------
echo    Desenvolvido por: Marco Aurélio Dragone
echo   ------------------------------------------------------------
echo.

if not defined FAM_SEM_PAUSA (
  choice /C SN /N /M "   Abrir o sistema agora? [S/N] " >nul 2>&1
  if not errorlevel 2 call "%DEST%\Abrir FAM Financeiro.cmd"
  echo.
  pause
)
endlocal
exit /b 0

rem ============================================================================
:escrever_powershell
> "%PS%" echo param([string]$Dest,[string]$Edge,[string]$Ico,[string]$Menu)
>>"%PS%" echo $ErrorActionPreference = 'Stop'
>>"%PS%" echo $w = New-Object -ComObject WScript.Shell
>>"%PS%" echo $pagina = Join-Path $Dest 'dashboard.html'
rem A pasta padrao chama "FAM Financeiro", com espaco no meio. Montar a URL na
rem mao deixava o argumento assim: --app=file:///C:/.../FAM Financeiro/... e o
rem Edge quebrava isso em DOIS argumentos no espaco, abrindo nada. Quem monta a
rem URL agora e o proprio .NET (AbsoluteUri, que troca o espaco por %%20), e o
rem argumento vai entre aspas por cima disso.
>>"%PS%" echo $urlApp = '--app="' + ([Uri]$pagina).AbsoluteUri + '"'
>>"%PS%" echo $desk = [Environment]::GetFolderPath('Desktop')
>>"%PS%" echo $alvos = @( (Join-Path $desk 'FAM Financeiro.lnk'), (Join-Path $Menu 'FAM Financeiro.lnk') )
>>"%PS%" echo foreach ($a in $alvos) {
>>"%PS%" echo   $s = $w.CreateShortcut($a)
>>"%PS%" echo   if ($Edge -and (Test-Path $Edge)) { $s.TargetPath = $Edge; $s.Arguments = $urlApp } else { $s.TargetPath = $pagina }
>>"%PS%" echo   $s.WorkingDirectory = $Dest
>>"%PS%" echo   if ($Ico -and (Test-Path $Ico)) { $s.IconLocation = $Ico + ',0' }
>>"%PS%" echo   $s.Description = 'FAM Financeiro - controle de caixa da FAM Seguradora'
>>"%PS%" echo   $s.Save()
>>"%PS%" echo }
>>"%PS%" echo $d = $w.CreateShortcut((Join-Path $Menu 'Desinstalar FAM Financeiro.lnk'))
>>"%PS%" echo $d.TargetPath = Join-Path $Dest 'Desinstalar FAM Financeiro.cmd'
>>"%PS%" echo $d.WorkingDirectory = $Dest
>>"%PS%" echo if ($Ico -and (Test-Path $Ico)) { $d.IconLocation = $Ico + ',0' }
>>"%PS%" echo $d.Description = 'Remove o FAM Financeiro deste computador'
>>"%PS%" echo $d.Save()
>>"%PS%" echo $p = $w.CreateShortcut((Join-Path $Menu 'Pasta do FAM Financeiro.lnk'))
>>"%PS%" echo $p.TargetPath = $Dest
>>"%PS%" echo $p.Description = 'Abre a pasta onde o sistema esta instalado'
>>"%PS%" echo $p.Save()
exit /b 0

rem ============================================================================
:escrever_desinstalador
set "DES=%DEST%\Desinstalar FAM Financeiro.cmd"
> "%DES%" echo @echo off
>>"%DES%" echo chcp 65001 ^>nul 2^>^&1
>>"%DES%" echo setlocal
>>"%DES%" echo title Desinstalar FAM Financeiro
>>"%DES%" echo set "DEST=%DEST%"
>>"%DES%" echo set "MENU=%MENU%"
>>"%DES%" echo set "CHAVE=%CHAVE%"
>>"%DES%" echo set "DESKTOP=%DESKTOP%"
>>"%DES%" echo echo.
>>"%DES%" echo echo   ============================================================
>>"%DES%" echo echo    DESINSTALAR O FAM FINANCEIRO
>>"%DES%" echo echo   ============================================================
>>"%DES%" echo echo.
>>"%DES%" echo echo   Isto tira o programa deste computador: a pasta, os atalhos
>>"%DES%" echo echo   e o registro em Adicionar ou remover programas.
>>"%DES%" echo echo.
>>"%DES%" echo echo   ATENCAO: os SEUS DADOS nao estao nesta pasta, estao no
>>"%DES%" echo echo   navegador. Eles continuam la depois da desinstalacao, mas
>>"%DES%" echo echo   somem se alguem limpar os dados de navegacao do Edge.
>>"%DES%" echo echo   Antes de continuar, abra o sistema e use
>>"%DES%" echo echo   "Salvar copia dos dados" no rodape.
>>"%DES%" echo echo.
>>"%DES%" echo choice /C SN /N /M "   Desinstalar mesmo assim? [S/N] "
>>"%DES%" echo if errorlevel 2 goto :sai
>>"%DES%" echo echo.
>>"%DES%" echo echo   Removendo...
>>"%DES%" echo del "%%DESKTOP%%\FAM Financeiro.lnk" ^>nul 2^>^&1
>>"%DES%" echo del "%%USERPROFILE%%\Desktop\FAM Financeiro.lnk" ^>nul 2^>^&1
>>"%DES%" echo if exist "%%MENU%%" rd /s /q "%%MENU%%" ^>nul 2^>^&1
>>"%DES%" echo reg delete "%%CHAVE%%" /f ^>nul 2^>^&1
>>"%DES%" echo echo   Pronto. A pasta se apaga sozinha em seguida.
>>"%DES%" echo echo.
>>"%DES%" echo echo   Desenvolvido por: Marco Aurélio Dragone
>>"%DES%" echo echo.
>>"%DES%" echo if not defined FAM_SEM_PAUSA pause
rem A pasta nao pode se apagar enquanto este .cmd ainda esta rodando de dentro
rem dela: quem apaga e um processo solto, que espera dois segundos primeiro.
>>"%DES%" echo start "" /min powershell -NoProfile -Command "Start-Sleep 2; Remove-Item -LiteralPath '%%DEST%%' -Recurse -Force -ErrorAction SilentlyContinue"
>>"%DES%" echo exit /b 0
>>"%DES%" echo :sai
>>"%DES%" echo echo.
>>"%DES%" echo echo   Nada foi removido.
>>"%DES%" echo if not defined FAM_SEM_PAUSA pause
>>"%DES%" echo exit /b 1
if not exist "%DES%" (
  echo   [erro] Nao consegui escrever o desinstalador.
  exit /b 1
)
exit /b 0

rem ============================================================================
:fim_copia
echo   [erro] Nao consegui copiar o dashboard.html para %DEST%
:fim_erro
echo.
if not defined FAM_SEM_PAUSA pause
endlocal
exit /b 1
