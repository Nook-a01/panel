# Renderiza el videoclip del estudio de una canción como proceso aparte (sigue
# aunque se cierre la terminal) y deja el registro en <canción>\Videoclip\render.log.
#
#   .\renderizar-estudio.ps1 "<carpeta de la canción>" "<master.wav>" "<nombre de salida>.mp4"
param(
  [Parameter(Mandatory)] [string]$Cancion,
  [Parameter(Mandatory)] [string]$Master,
  [Parameter(Mandatory)] [string]$Nombre
)
$blender = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
$modelo  = "D:\Nook\Videos\Blender\music_studio_at_home - Reversion #4\Estudio y animacion.blend"
$script  = Join-Path $PSScriptRoot "videoclip-estudio.py"
$dir     = Join-Path $Cancion "Videoclip"
$salida  = Join-Path $dir $Nombre

$argumentos = @('-b', "`"$modelo`"", '-P', "`"$script`"", '--', "`"$Master`"", "`"$(Join-Path $dir 'Pantallas')`"", "`"$salida`"")
$p = Start-Process -FilePath $blender -ArgumentList $argumentos -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $dir "render.log") -RedirectStandardError (Join-Path $dir "render-errores.log")
"Blender pid $($p.Id) -> $salida"

# Mientras Blender trabaje, Windows no se suspende solo (lo mismo que pide un
# reproductor de video; no cambia ninguna configuración). Apagar o elegir
# Suspender a mano sí lo corta: en ese caso se vuelve a lanzar este script y
# sigue desde el último cuadro hecho.
$despierto = @"
Add-Type -Name P -Namespace W -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'
[W.P]::SetThreadExecutionState([uint32]'0x80000001') | Out-Null
Wait-Process -Id $($p.Id)
"@
Start-Process powershell -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-Command', $despierto -WindowStyle Hidden | Out-Null
