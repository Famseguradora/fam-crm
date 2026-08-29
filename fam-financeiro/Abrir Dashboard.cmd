@echo off
rem Abre a Tela 1 do FAM Financeiro no Edge.
rem No Windows do Marco o .html esta associado ao VS Code: duplo clique no HTML
rem abre o codigo, nao a tela. Este atalho manda direto para o navegador.
start "" msedge.exe "%~dp0dashboard.html"
