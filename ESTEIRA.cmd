@echo off
title FAM - Esteira da analise (NAO FECHAR)
cd /d "%~dp0"
echo.
echo   ESTEIRA DA ANALISE DE CREDITO
echo   ----------------------------------------------------
echo   E o agente que liga o CRM ao motor da analise neste
echo   notebook: leva a Mesa inteira para o CRM (fichas,
echo   arquivos, triagem, mural de recados, alcadas) e
echo   executa as ordens dadas la (analisar, reler a pasta,
echo   parar, ler a pasta, responder a IA).
echo.
echo   Com o Sistema de Analise de pe (Analisar.cmd), a
echo   ordem "Analisar agora" do CRM vira o mesmo clique do
echo   cockpit. Sem ele, o agente entrega o comando aqui.
echo.
echo   DEIXE ESTA JANELA ABERTA.
echo   ----------------------------------------------------
echo.
node scriptsesteira.mjs
echo.
echo   A Esteira PAROU. A mensagem do erro esta acima.
pause >nul
