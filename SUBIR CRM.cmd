@echo off
title FAM CRM - servidor (NAO FECHAR)
cd /d "C:\Users\MarcoDragoneFAMSEGUR\FAM Seguradora\FAM SEGURADORA - Documents\Individuais\Marco Dragone\fam-crm"
echo.
echo   FAM CRM
echo   ----------------------------------------------------
echo   Endereco:  http://localhost:3000
echo.
echo   DEIXE ESTA JANELA ABERTA.
echo   Fechar esta janela derruba o site.
echo   ----------------------------------------------------
echo.
call npm run dev
echo.
echo   O servidor PAROU. A mensagem do erro esta acima.
pause >nul
