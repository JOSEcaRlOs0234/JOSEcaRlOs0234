# J.A.R.V.I.S. — Cómo usarlo (Windows)

## Abrir Jarvis
- Doble clic en el icono **Jarvis** del Escritorio (o búscalo en el menú Inicio).
- Se abre en su propia ventana, sin ventana negra.
- **Cerrar la ventana no apaga a Jarvis** (sigue listo en segundo plano). Para apagarlo del todo: botón **Apagar** arriba a la derecha.

## Primera vez
Doble clic en **Encender Jarvis.bat**: instala las piezas, te pide la clave de Gemini y crea el icono del Escritorio.

## Qué puede hacer en tu laptop (siempre con tu permiso)
Abrir programas, abrir páginas y búsquedas, cambiar el volumen, ver y leer archivos de texto en tus carpetas
(Escritorio, Documentos, Descargas, Imágenes, Música, Videos), crear y borrar archivos solo en `Documentos\Jarvis`,
abrir documentos/fotos, y bloquear, suspender, reiniciar o apagar la laptop.

- Antes de cada acción aparece una ventana para que digas **Sí** o **No**.
- Puedes marcar "No volver a preguntar" para acciones normales. Para quitarlo: panel **Permisos sin preguntar**.
- Borrar, reemplazar archivos, reiniciar y apagar **siempre** piden permiso.

## Archivos importantes
- `.env` → tus claves secretas. Solo existe en tu laptop. **Nunca lo compartas.**
- `registro/jarvis.log` → todo lo que Jarvis hace, con fecha y hora (se abre con el Bloc de notas).
- `registro/servidor.log` → mensajes técnicos cuando Jarvis se abre desde el icono (útil si algo falla).
- `datos/permisos.json` → los permisos de "no volver a preguntar".

## Si algo falla
Abre **Encender Jarvis.bat** (con ventana negra) para ver los mensajes, y mándale una foto a Claude.

## Cambiar la clave de Gemini
Borra el archivo `.env` y vuelve a abrir **Encender Jarvis.bat**.
