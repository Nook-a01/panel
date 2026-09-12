' Lanza un script de PowerShell sin abrir ninguna ventana.
'
' POR QUE EXISTE
' Es el hermano de silencioso.vbs, que hace lo mismo con Node.
' powershell.exe es un programa de consola: cuando lo arranca el
' Programador de tareas, Windows le abre la ventana negra ANTES de que
' PowerShell llegue a leer -WindowStyle Hidden. El resultado es un
' parpadeo negro en el medio de lo que estes haciendo, cada vez que la
' tarea corre. Con una tarea que repite cada tres minutos, eso es todo
' el dia.
'
' Este archivo es el intermediario: Windows ejecuta wscript.exe, que NO
' es de consola y no abre ventana, y wscript lanza PowerShell con el
' modo de ventana en 0 = oculta. La ventana nunca llega a existir.
'
' Uso:  wscript silencioso-ps.vbs "C:\ruta\al\script.ps1" [argumentos...]
'
' Los errores no se pierden: se espera a que PowerShell termine y se
' devuelve su codigo de salida tal cual, asi que si algo falla se ve en
' el Programador de tareas, en la columna "Resultado de la ultima
' ejecucion".
'
' (Sin acentos a proposito: los .vbs los lee Windows en ANSI y los
'  acentos guardados en UTF-8 salen como garabatos.)

Option Explicit

Dim sh, fso, carpeta, comando, i

If WScript.Arguments.Count < 1 Then WScript.Quit 1

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Igual que en silencioso.vbs: parados en la carpeta del proyecto, por si
' el script usa rutas relativas.
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = carpeta

comando = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File"
comando = comando & " """ & WScript.Arguments(0) & """"
For i = 1 To WScript.Arguments.Count - 1
  comando = comando & " """ & WScript.Arguments(i) & """"
Next

' 0 = ventana oculta.  True = esperar a que termine.
WScript.Quit sh.Run(comando, 0, True)
