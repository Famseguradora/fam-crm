' ============================================================================
'  O CARTEIRO E A ESTEIRA SOBEM SEM JANELA NENHUMA.
'
'  Mesmo truque do crm-servidor.vbs: o "0" do Run e a janela escondida, e o
'  "False" e nao esperar terminar. E o unico jeito de nao ter janela alguma no
'  Windows sem instalar programa e sem precisar de administrador.
'
'  Duplo clique aqui e nada aparece. E isso mesmo: o que era para acontecer
'  esta no agentes.log, na raiz do projeto, com hora.
'
'  Para desligar: "PARAR AGENTES.cmd", ao lado.
' ============================================================================
Set fso = CreateObject("Scripting.FileSystemObject")
raiz = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = raiz
sh.Run """" & raiz & "\scripts\agentes-subir.cmd""", 0, False
