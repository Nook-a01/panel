' Lanza Node sin abrir ninguna ventana.
'
' POR QUÉ EXISTE
' Las tareas programadas de Windows corren node.exe, y node.exe es un
' programa de consola: Windows le abre una ventana negra sí o sí, aunque
' el programa no imprima nada. Como las tareas corren cada hora, esa
' ventana aparecía sola en el medio de lo que estuvieras haciendo.
'
' Este archivo es el intermediario: Windows ejecuta wscript.exe (que NO
' es de consola y no abre ventana), y wscript lanza node con el modo de
' ventana en 0 = oculta.
'
' Uso:  wscript silencioso.vbs <script.mjs> [argumentos...]
'
' Los errores no se pierden: la tarea programada guarda igual el código
' de salida, así que si algo falla se ve en el Programador de tareas, en
' la columna "Resultado de la última ejecución".

Option Explicit

Dim sh, fso, carpeta, comando, i

If WScript.Arguments.Count < 1 Then WScript.Quit 1

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' La carpeta de este mismo archivo es la del proyecto: los scripts de
' Node usan rutas relativas, así que hay que pararse ahí antes.
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = carpeta

' Se arma: node "ruta\script.mjs" "arg1" "arg2"...
' Cada parte va entre comillas por si algún día la carpeta tiene espacios.
comando = "node"
comando = comando & " """ & carpeta & "\" & WScript.Arguments(0) & """"
For i = 1 To WScript.Arguments.Count - 1
  comando = comando & " """ & WScript.Arguments(i) & """"
Next

' 0 = ventana oculta.  True = esperar a que termine.
'
' Se espera a propósito. Si no se esperara, este archivo terminaría al
' instante y la tarea programada diría "OK" siempre, aunque Node fallara:
' perderíamos el único lugar donde se ve si algo anda mal (la columna
' "Resultado de la última ejecución" del Programador de tareas).
' Esperando, el código de salida de Node se propaga tal cual.
WScript.Quit sh.Run(comando, 0, True)
