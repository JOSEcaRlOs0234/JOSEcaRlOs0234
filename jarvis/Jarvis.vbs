' Abre J.A.R.V.I.S. como aplicacion, sin la ventana negra.
' Si Jarvis ya esta encendido, solo abre su ventana.
Option Explicit

Dim sh, fso, carpeta
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = carpeta

' Primera vez (falta instalar o falta la clave): usar el encendido con ventana visible
If Not fso.FileExists(carpeta & "\node_modules\.bin\tsx.cmd") Or Not fso.FileExists(carpeta & "\.env") Then
  sh.Run """" & carpeta & "\Encender Jarvis.bat""", 1, False
  WScript.Quit
End If

If ServidorActivo() Then
  sh.Run "cmd /c start """" msedge --app=http://localhost:3000 --window-size=1400,900", 0, False
Else
  If Not fso.FolderExists(carpeta & "\registro") Then fso.CreateFolder(carpeta & "\registro")
  sh.Environment("PROCESS")("ABRIR_NAVEGADOR") = "1"
  ' El servidor corre escondido; sus mensajes quedan en registro\servidor.log
  sh.Run "cmd /c node_modules\.bin\tsx.cmd server.ts > registro\servidor.log 2>&1", 0, False
End If

Function ServidorActivo()
  Dim http
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 1000, 1000, 1000, 1000
  http.Open "GET", "http://127.0.0.1:3000/api/estado", False
  http.Send
  ServidorActivo = (Err.Number = 0 And http.Status = 200)
  On Error GoTo 0
End Function
