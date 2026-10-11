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


## Elegir el modelo de Gemini
Arriba a la derecha hay un menú con **todos los modelos de Gemini** que tu clave puede usar (la misma clave sirve para todos).
Los "Flash" son rápidos; los "Pro" piensan más pero tardan más y tienen menos uso gratis.
Si el elegido falla o llega a su límite, Jarvis usa otro automáticamente (queda anotado en el registro).

## Memoria
Dile a Jarvis "Recuerda que..." y lo guarda para siempre (en `datos/memoria.json`, solo en tu laptop).
Lo ves y lo borras en el panel **Memoria de Jarvis**. También puedes decirle "olvida que...".
La conversación también se conserva al cerrar la ventana; el botón ↺ empieza una conversación nueva (la memoria no se borra).
No le pidas que recuerde contraseñas ni datos del banco.

## Todo lo que platicas queda guardado
Cada mensaje se guarda en `datos/historial/` (un archivo por mes). Pregúntale "¿qué te conté la semana pasada sobre...?"
y Jarvis lo busca. No necesitas instalar ninguna base de datos.

## Pizarra
Pídele "escribe en la pizarra..." o "hazme una lista de...": aparece una pizarra sobre el reactor.
Botones: Copiar, Borrar y ✕ (cerrar sin borrar). El botón "Pizarra" (arriba del reactor) la vuelve a abrir.

## Cuando Jarvis no sabe algo
- **Investigar** (gratis): busca en Google con Gemini; lo hace solo cuando necesita datos actuales.
- **Consultar a Claude** (opcional, de pago, unos centavos por pregunta): doble clic en `Configurar Claude.bat`
  y pega una clave de https://console.anthropic.com. Siempre te pide permiso antes de cada consulta.

## Clima y noticias
Pregúntale "¿cómo va a estar el clima mañana?" o "¿qué noticias hay de deportes?". Es gratis y no necesita claves.
Para verlo en tu navegador: "búscame en Google ..." o "abre youtube.com" (te pide permiso).

## Activar con aplausos
Jarvis escucha en segundo plano: aplaude **dos veces seguidas** y te saluda en voz alta y abre su ventana.
Ignora ruidos sueltos, portazos, golpes en la mesa, voces y tres golpes seguidos (alguien tocando la puerta).
- Panel **Activar con aplausos**: encender/apagar, sensibilidad (1 a 10) y la lista de lo que escuchó.
  Si no te detecta, sube la sensibilidad; si se activa solo, bájala.
- Casilla **Encender Jarvis solo al prender la laptop** (activada desde el inicio).
- El sonido se analiza en tu laptop: no se graba ni se envía a internet.

## Dónde se guardan tus datos (desde la versión 2.0)
Tu clave, memoria, historial, pizarra, permisos y registro viven en `C:\Users\<tú>\AppData\Local\Jarvis`.
Por eso puedes extraer una actualización en cualquier carpeta y no te vuelve a pedir la clave.
Para cambiar la clave de Gemini: doble clic en **Cambiar clave de Gemini.bat**.

## Si no reconoce tus aplausos
Panel **Activar con aplausos** → botón **Enseñarle mis aplausos** → aplaude 3 veces, despacio (uno por segundo).
Jarvis aprende cómo suenan en tu cuarto. **Reiniciar** vuelve a las reglas de fábrica.
