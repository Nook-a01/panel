# Programa las tareas en Windows para que los avisos salgan desde tu PC,
# como respaldo de GitHub.
#
#   powershell -ExecutionPolicy Bypass -File instalar-tarea-windows.ps1
#
# Abrilo en una ventana de PowerShell NORMAL (no como administrador).
#
# Por qué existe este respaldo: GitHub trata las tareas programadas como
# "mejor esfuerzo" y las demora o saltea cuando tiene carga. Medido en
# este repo: la tarea de avisos, configurada cada 15 minutos, corrió 4
# veces en 14 horas. Windows sí respeta el horario, pero sólo con la
# computadora encendida. Con los dos, algo siempre llega.

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host "No encuentro Node.js. Instalalo desde https://nodejs.org" -ForegroundColor Red
  exit 1
}

Write-Host "Proyecto: $PSScriptRoot"
Write-Host "Node:     $node"
Write-Host ""

# Sin la suscripción no hay a quién avisar desde la PC.
if (-not (Test-Path ".subscriptions.json")) {
  Write-Host "Falta .subscriptions.json" -ForegroundColor Red
  Write-Host "  Es el texto que copia la app al tocar el boton de avisos."
  Write-Host "  Guardalo en ese archivo, en la carpeta del proyecto."
  exit 1
}
Write-Host "  OK  suscripcion encontrada" -ForegroundColor Green

function Nueva-Tarea {
  param(
    [string]$Nombre,
    [string]$Script,
    $Disparador,
    [string]$Descripcion,
    [string]$Argumento = ""
  )

  $args = """$PSScriptRoot\scripts\$Script"""
  if ($Argumento) { $args = "$args $Argumento" }

  $accion = New-ScheduledTaskAction -Execute $node -Argument $args -WorkingDirectory $PSScriptRoot

  # Que corra aunque la PC estuviera apagada a esa hora, y sin exigir
  # que la laptop esté enchufada.
  $opciones = New-ScheduledTaskSettingsSet -StartWhenAvailable `
              -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
              -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

  Unregister-ScheduledTask -TaskName $Nombre -Confirm:$false -ErrorAction SilentlyContinue

  try {
    Register-ScheduledTask -TaskName $Nombre -Action $accion -Trigger $Disparador `
      -Settings $opciones -Description $Descripcion -ErrorAction Stop | Out-Null
    Write-Host "  OK  $Nombre" -ForegroundColor Green
  } catch {
    Write-Host "  ERROR en $Nombre : $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "Creando las tareas..." -ForegroundColor Cyan

# 1) Bajar los datos, cada hora
$cadaHora = New-ScheduledTaskTrigger -Once -At (Get-Date) `
            -RepetitionInterval (New-TimeSpan -Hours 1) `
            -RepetitionDuration (New-TimeSpan -Days 3650)
Nueva-Tarea -Nombre "Panel - Actualizar datos" -Script "fetch.mjs" `
  -Disparador $cadaHora `
  -Descripcion "Baja calendario, posiciones, planteles y noticias"

# 2) Revisar si toca avisar, cada 15 minutos
$cada15 = New-ScheduledTaskTrigger -Once -At (Get-Date) `
          -RepetitionInterval (New-TimeSpan -Minutes 15) `
          -RepetitionDuration (New-TimeSpan -Days 3650)
Nueva-Tarea -Nombre "Panel - Enviar avisos" -Script "send-push.mjs" `
  -Disparador $cada15 `
  -Descripcion "Avisa 1 dia antes y 1 hora antes de cada evento"

# 3) Resumen de la mañana con los partidos del día
Nueva-Tarea -Nombre "Panel - Resumen del dia" -Script "send-push.mjs" `
  -Disparador (New-ScheduledTaskTrigger -Daily -At 8:30am) `
  -Descripcion "Manda los partidos de hoy a la maniana" `
  -Argumento "--diario"

# 4) Resumen de la semana, los domingos
Nueva-Tarea -Nombre "Panel - Resumen semanal" -Script "send-push.mjs" `
  -Disparador (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 9:00am) `
  -Descripcion "Manda el calendario de la semana" `
  -Argumento "--semanal"

Write-Host ""
Write-Host "Tareas instaladas:" -ForegroundColor Cyan
Get-ScheduledTask -TaskName "Panel - *" -ErrorAction SilentlyContinue |
  ForEach-Object { Write-Host ("  " + $_.TaskName.PadRight(34) + $_.State) }

Write-Host ""
Write-Host "Para verlas:    Get-ScheduledTask -TaskName 'Panel - *'"
Write-Host "Para probar:    Start-ScheduledTask -TaskName 'Panel - Resumen del dia'"
Write-Host "Para borrarlas: Get-ScheduledTask -TaskName 'Panel - *' | Unregister-ScheduledTask -Confirm:`$false"
Write-Host ""
