@echo off
chcp 65001 >nul
title Ligar o Outlook no CRM da FAM
cd /d "%~dp0"

echo.
echo   ================================================================
echo     LIGAR O OUTLOOK NO CRM
echo   ================================================================
echo.
echo   Isto registra o CRM no Microsoft 365 da FAM, uma unica vez,
echo   para que ARRASTAR o e-mail do Outlook abra o caso sozinho.
echo.
echo   Voce vai fazer UM login da Microsoft (codigo de 6 letras).
echo   Nenhum e-mail e lido aqui: isto so cria a permissao.
echo.
echo   Depois disso, SEUS COLEGAS NAO PRECISAM FAZER NADA nesta maquina:
echo   eles entram no CRM pelo navegador e clicam uma vez em
echo   "Ligar minha caixa do Outlook". So isso.
echo.
echo   ----------------------------------------------------------------
echo.

node scripts\ligar-outlook.mjs

echo.
echo   ================================================================
echo   Se algo deu errado, o que aconteceu esta salvo em:
echo      ligar-outlook.log   (na mesma pasta)
echo   ================================================================
pause
