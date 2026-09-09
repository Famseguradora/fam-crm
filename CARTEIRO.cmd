@echo off
title FAM - Carteiro (NAO FECHAR)
cd /d "%~dp0"
echo.
echo   CARTEIRO DA FAM
echo   ----------------------------------------------------
echo   Le a caixa do Outlook classico e alimenta a Caixa de
echo   entrada do Comercial, dentro do CRM.
echo.
echo   Precisa do OUTLOOK CLASSICO aberto e logado.
echo   Nao marca como lido, nao move e nao apaga nada.
echo.
echo   DEIXE ESTA JANELA ABERTA.
echo   ----------------------------------------------------
echo.
node scripts\carteiro.mjs
echo.
echo   O Carteiro PAROU. A mensagem do erro esta acima.
pause >nul
