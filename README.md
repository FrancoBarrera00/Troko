# Troko-Desk — Tu compañero de IA en la Dynamic Island

**Troko-Desk** es un compañero de escritorio local-first en español que vive en una **Dynamic Island / Notch** interactiva en la parte superior central de tu pantalla (`#island`).

## Características principales

- **Dynamic Island / Notch (`#island`)**:
  - Píldora compacta en reposo (`188×38 px`), expansión *peek* (`320×48 px`) y panel completo de 2 columnas (`680×560 px`).
  - **11 estados en vivo**: `idle` (Reposo), `listen` (Escuchando), `think` (Pensando), `speak` (Hablando), `alert` (Alerta), `attentive` (Atento), `notification` (Notificación), `sleep` (Dormido), `focus` (Enfoque), `success` (Listo) y `remind` (Recordatorio).
  - **4 tarjetas Peek accionables**: organizar escritorio (`desktop_tidy`), borrador de correo (`email_draft`), recordatorio de hábito (`habit_remind`) y avisos pendientes al despertar (`missed_reminders`).
- **Mascota Vectorial `TrokoAvatar`**:
  - Cuerpo trapezoidal crema con **12 emociones faciales** (`contento`, `enamorado`, `sorpresa`, `orgulloso`, `guino`, `bostezo`, `molesto`, `escucha`, `mareado`, `festejo`, `saludo`, `animo`).
  - Seguimiento suave del cursor (`--gx`, `--gy`), parpadeo natural cada 3–4 s, miradas periféricas y respeto por `prefers-reduced-motion`.
- **IA Híbrida Local-First + Voz (STT/TTS)**:
  - Motor NLU determinístico offline en español e inglés + conector opcional **BYOK** (Ollama, `llama.cpp`, OpenAI-compatible) con *fallback* automático sin conexión.
  - Reconocimiento de voz con palabra de activación `"Troko"`, transcripción en vivo bajo la isla y síntesis de voz local con interruptor `"Con voz"`.
- **Productividad, Hábitos y Herramientas Seguras del Sistema**:
  - **Inicio y Chat**: resumen diario (`¿Qué tengo hoy?`), historial conversacional en SQLite WAL y comandos NLU naturales con soporte voseo:
    - Tareas y avisos: `"Anotame comprar café"`, `"Terminé comprar café"`, `"Recuérdame en 15 minutos llamar a Juan"`, `"Avísame a las 18:30 revisar deploy"`.
    - Hábitos y notas rápidas: `"Tomé agua"`, `"Nota rápida: idea para el proyecto"`.
    - Enfoque, sistema y apps: `"Inicia enfoque"`, `"Estado de mi PC"`, `"Abrime el bloc de notas"` (con alias seguros: `notepad`, `chrome`, `calc`, `explorador`, `spotify`).
    - Tool-calling estructurado con IA local/BYOK (`create_task`, `create_reminder`, `start_focus`, `create_timer`, `log_habit`).
  - **Tareas**: lista de tareas, recordatorios únicos/recurrentes y temporizadores con cuenta regresiva en vivo vía SSE.
  - **Hábitos**: rachas, anillos semanales (`S D L M X J V`) y **15 escenas SVG animadas**.
  - **Enfoque, Guardián Real y Estudio PDF**:
    - Temporizador Pomodoro 25/5 con anillo circular SVG, ciclo de 4 bloques y estadísticas de 7 días.
    - **Guardián Real de Enfoque**: supervisa la ventana activa durante el Pomodoro contra lista negra (`YouTube`, `Twitch`, `Instagram`, etc.) o lista blanca ("Solo estudio") con tiempo de gracia editable, alertas de Troko y racha limpia.
    - **Estudio PDF & Bloques sin pérdida**: extrae `.pdf` o resúmenes largos en bloques estructurados sin recortar texto, con mapa de ideas clave, audio TTS (`Escuchar bloque`), quiz Active Recall y explicación Feynman.
    - **Nivel, XP y Accesorios**: cada bloque de enfoque limpio, bloque estudiado, quiz y hábito suma XP, sube de nivel y desbloquea accesorios SVG equipables (`Lentes de estudio`, `Auriculares`, `Vincha Dojo`, `Corona dorada`, `Aura neón`) sobre `TrokoAvatar`.
  - **Correo**: bandeja IMAP/SMTP opcional y redacción de borradores con confirmación explícita antes de enviar.
  - **Mi Mac / Mi Equipo**: clasificador de archivos sueltos en 8 categorías con vista previa, confirmación obligatoria y deshacer atómico (`Deshacer`), lanzador con lista blanca, **Monitor del Sistema** (CPU/RAM/actividad) y **Bloc rápido (Apuntes locales)**.
  - **Ajustes y Modo Compañero Electron**: proveedor IA local (autodetección de Ollama) o BYOK, selector rápido de Escritorio real vs. Sandbox, permisos de micrófono/notificaciones nativas, atajo global (`Alt+Espacio` en Windows/Linux, `Option+Espacio` en macOS), inicio automático con el sistema, sonido Web Audio y bandeja del sistema (`electron/`).

---

## Cómo ejecutarlo en tu computadora

### Requisitos
- **Node.js 24+** (usa el módulo nativo `node:sqlite`)

### 1. Instalar dependencias
```bash
git clone https://github.com/FrancoBarrera00/Troko.git
cd Troko
npm install
```

### 2. Iniciar en modo desarrollo o Escritorio flotante (Electron)
En Windows PowerShell:
```powershell
git pull origin main
npm.cmd install
npm.cmd run build
npm.cmd run electron:build
npm.cmd run electron:start
```
O solo en navegador web (`http://127.0.0.1:4173`):
```bash
npm run build
PORT=4173 NODE_ENV=production node server/dist/index.js
```
Atajo global en modo Electron: **`Alt + Espacio`** (`Option + Espacio` en macOS) para mostrar/ocultar la isla al instante.

### 3. Pruebas
```bash
npm test                  # Pruebas unitarias SQLite, servicios y Electron
npm run typecheck         # Verificación estricta de TypeScript
```
