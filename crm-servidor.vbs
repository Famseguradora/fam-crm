' ============================================================================
'  O CRM SOBE SEM JANELA NENHUMA.
'
'  O "0" do Run e a janela escondida, e o "False" e nao esperar terminar: o
'  servidor fica rodando e este arquivo sai na hora.
'
'  Por que um .vbs e nao um .cmd: no Windows, qualquer .cmd abre uma janela
'  preta, mesmo minimizada. Este e o unico jeito de nao ter janela alguma sem
'  instalar programa nenhum e sem precisar de administrador.
'
'  Ele nao faz mais nada alem disso: quem sabe subir o CRM (e nao subir duas
'  vezes) e o scripts\crm-subir.cmd.
' ============================================================================
Set fso = CreateObject("Scripting.FileSystemObject")
raiz = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = raiz
sh.Run """" & raiz & "\scripts\crm-subir.cmd""", 0, False

' O VIGIA (15/09/2026): pergunta ao CRM a cada minuto e reinicia quando ele
' para de abrir. Se ja houver um vigia rodando, este sai sozinho.
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & raiz & "\scripts\crm-vigia.ps1""", 0, False
