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

## Fórmulas y Canva (versión 2.6)
- Las fórmulas en la pizarra, el chat y las notas se ven como en un libro (no como código). En voz, Jarvis las dice con palabras.
- Canva: en Ajustes → Canva pega las llaves de tu integración (canva.com/developers) y aprieta "Conectar con Canva".
  Luego dile "haz una presentación en Canva sobre...", "pasa el dibujo a Canva" o "descarga mi diseño de... en PDF".

## Modo clase (versión 2.10)
Dile "Jarvis, modo clase de Física" (o aprieta "Modo clase"). Jarvis escucha en silencio y no contesta nada. Cuando
termine la clase di "Jarvis, termina la clase" (o aprieta "Terminar clase"). En uno o dos minutos se abre un Word con el
resumen, temas, conceptos, fórmulas, tareas, preguntas de repaso y la transcripción, en Documentos\Jarvis\Clases.
Deja la laptop conectada y con la ventana de Jarvis abierta (puede estar minimizada). El audio no se guarda.

## Cámara (versión 2.9)
Dile "¿qué ves?", "¿qué tengo en la mano?", "lee esta hoja" o "tómame una foto". Jarvis pide permiso, toma UNA foto
(la cámara se prende solo un segundo), te muestra lo que vio y te contesta. "Tómame una foto" la guarda en
Documentos\Jarvis\Fotos. La ventana de Jarvis debe estar abierta.

## Configuración de Windows (versión 2.8)
Dile "sube el brillo", "pon el modo oscuro", "prende el Bluetooth", "¿cuánta batería tengo?" o "abre la configuración
del sonido". Siempre te pide permiso (puedes marcar "no volver a preguntar"). Apagar el Wi-Fi siempre se confirma.

## Editar dentro de Canva (versión 2.7)
En tu app de Canva Developers enciende "Canva MCP" (Outside Canva → Configuration → Integration methods). Luego en Jarvis:
Ajustes → Canva → "Activar edición" y da permiso. Después dile "en mi diseño de ... cambia el título por ...".

## Correo de Gmail (versión 2.5)
Panel "Correo (Gmail)": pon tu correo y una "contraseña de aplicación" (se crea en myaccount.google.com/apppasswords;
necesitas tener activada la verificación en 2 pasos). Luego dile "¿tengo correos nuevos?", "léeme el correo de..." o
"contéstale que sí". Antes de mandar cualquier correo, Jarvis te enseña el texto y te pide permiso. No puede borrar correos.

## Sonido de entrada (versión 2.4.2)
Cada vez que se abre la ventana de Jarvis suena su música de entrada; se baja sola cuando Jarvis habla o te escucha.

## Recordatorios con Jarvis apagado (versión 2.4.1)
Si tienes un recordatorio y Jarvis está apagado, Windows lo enciende solo un minuto antes (con la laptop prendida),
te lo dice en voz alta y abre su ventana. Se ve en el Programador de tareas como "Jarvis - recordatorio".

## Notas, dibujos e investigación (versión 2.4)
- **Notas**: "anota que mañana tengo examen", "apunta la receta...", "¿qué notas tengo?". Se ven en el botón
  "Notas" (arriba del reactor), donde también puedes escribir, copiar o borrar notas a mano.
- **Dibujos de Jarvis**: "dibújame un diagrama del ciclo del agua", "hazme un mapa mental de...". Aparece en la pizarra.
- **Dibujar tú**: en la pizarra, botón "Dibujar yo". Colores, grosor, borrador, deshacer y "Guardar imagen"
  (se guarda en Documentos\Jarvis\Dibujos). "Usar dibujo de Jarvis" te deja pintar encima de su dibujo.
- **Investigar a fondo**: "investiga a fondo sobre...", "dame información detallada de...". Jarvis busca en internet,
  te dice un resumen en voz y deja el informe completo en la pizarra con las páginas de donde lo sacó (puedes darles clic).

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

## Despertar a Jarvis diciendo "Jarvis"
Necesita una clave GRATIS de Picovoice (https://console.picovoice.ai). Pégala en el panel **Despertar a Jarvis**.
Funciona sin internet: el sonido nunca sale de tu laptop. "Qué tan fácil te oye": súbelo si no te escucha, bájalo si
se despierta solo con palabras parecidas. Los aplausos siguen disponibles como opción.

## Platicar de corrido (versión 2.3)
Di "Jarvis" (o pulsa "Hablar con Jarvis"): suena un "bip" y te escucha. Después de cada respuesta te sigue
escuchando solo, como una plática. Para terminar di "gracias", "eso es todo" o simplemente quédate callado.
- Permisos con la voz: contesta "sí" o "no". Las acciones delicadas (borrar, apagar) piden que digas "confirmo".
- La primera vez de cada día te da un resumen: clima, noticias y tus recordatorios.
- Recordatorios y alarmas: "recuérdame en 20 minutos sacar la comida", "avísame mañana a las 7 que tengo examen",
  "¿qué recordatorios tengo?". Si la laptop estaba apagada a esa hora, te avisa al encender.
