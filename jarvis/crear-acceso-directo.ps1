# Crea el icono "Ares" en el Escritorio y en el menu Inicio (y quita el icono viejo "Jarvis", si existe).
$carpeta = $PSScriptRoot
$shell = New-Object -ComObject WScript.Shell
foreach ($destino in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $acceso = $shell.CreateShortcut((Join-Path $destino 'Ares.lnk'))
  $acceso.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $acceso.Arguments = '"' + (Join-Path $carpeta 'Jarvis.vbs') + '"'
  $acceso.WorkingDirectory = $carpeta
  $acceso.IconLocation = Join-Path $carpeta 'ares.ico'
  $acceso.Description = 'A.R.E.S.'
  $acceso.Save()
  Remove-Item -LiteralPath (Join-Path $destino 'Jarvis.lnk') -ErrorAction SilentlyContinue
}
