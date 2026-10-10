# Crea el icono "Jarvis" en el Escritorio y en el menu Inicio.
$carpeta = $PSScriptRoot
$shell = New-Object -ComObject WScript.Shell
foreach ($destino in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $acceso = $shell.CreateShortcut((Join-Path $destino 'Jarvis.lnk'))
  $acceso.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $acceso.Arguments = '"' + (Join-Path $carpeta 'Jarvis.vbs') + '"'
  $acceso.WorkingDirectory = $carpeta
  $acceso.IconLocation = Join-Path $carpeta 'jarvis.ico'
  $acceso.Description = 'J.A.R.V.I.S.'
  $acceso.Save()
}
