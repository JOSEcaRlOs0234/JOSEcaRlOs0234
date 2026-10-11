' Abre J.A.R.V.I.S. como aplicacion, sin la ventana negra.
' Si Jarvis ya esta encendido (y es la version actual), solo abre su ventana.
' Con el argumento "fondo" (lo usa el arranque de Windows): enciende Jarvis escondido,
' sin abrir ventana, para que escuche los aplausos.
Option Explicit

Dim sh, fso, carpeta, estado, fondo
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = carpeta
fondo = False
If WScript.Arguments.Count > 0 Then fondo = (LCase(WScript.Arguments(0)) = "fondo")

' Falta instalar, falta la clave o una actualizacion trae piezas nuevas: usar el encendido con ventana visible
If Not fso.FileExists(carpeta & "\node_modules\.bin\tsx.cmd") Or Not fso.FileExists(carpeta & "\.env") Then
  If Not fondo Then sh.Run """" & carpeta & "\Encender Jarvis.bat""", 1, False
  WScript.Quit
End If
If sh.Run("node revisar-piezas.cjs", 0, True) <> 0 Then
  If Not fondo Then sh.Run """" & carpeta & "\Encender Jarvis.bat""", 1, False
  WScript.Quit
End If

estado = Pedir("GET", "http://127.0.0.1:3000/api/estado")

If estado <> "" And InStr(estado, """version"":""" & VersionInstalada() & """") > 0 Then
  ' Ya esta encendido y actualizado: solo abrir la ventana (en modo fondo no hace falta nada)
  If Not fondo Then sh.Run "cmd /c start """" msedge --app=http://localhost:3000 --window-size=1400,900", 0, False
Else
  If estado <> "" Then
    ' Esta encendida una version vieja: apagarla primero
    Pedir "POST", "http://127.0.0.1:3000/api/apagar"
    WScript.Sleep 2000
  End If
  If Not fso.FolderExists(carpeta & "\registro") Then fso.CreateFolder(carpeta & "\registro")
  If Not fondo Then sh.Environment("PROCESS")("ABRIR_NAVEGADOR") = "1"
  ' El servidor corre escondido; sus mensajes quedan en registro\servidor.log
  sh.Run "cmd /c node_modules\.bin\tsx.cmd server.ts > registro\servidor.log 2>&1", 0, False
End If

' Hace una peticion a Jarvis; devuelve el texto de la respuesta o "" si no responde
Function Pedir(metodo, url)
  Dim http
  Pedir = ""
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 1000, 1000, 2000, 2000
  http.Open metodo, url, False
  http.Send
  If Err.Number = 0 And http.Status = 200 Then Pedir = http.responseText
  On Error GoTo 0
End Function

' Lee la version de package.json
Function VersionInstalada()
  Dim texto, re, m
  VersionInstalada = "?"
  texto = fso.OpenTextFile(carpeta & "\package.json", 1).ReadAll
  Set re = New RegExp
  re.Pattern = """version"":\s*""([^""]+)"""
  Set m = re.Execute(texto)
  If m.Count > 0 Then VersionInstalada = m(0).SubMatches(0)
End Function
