# Nuko Desk — Tu compañero de enfoque e IA en la Dynamic Island

**Nuko Desk** es un asistente virtual de enfoque, estudio y productividad local-first en español (voseo rioplatense) que vive en una **Dynamic Island / Notch** interactiva en la parte superior central de tu pantalla (`#island`).

## Características principales

- **Compañeros Duales 100% Originales (`Nuko` & `Luma`) con XP Independiente**:
  - **Nuko (Búho-espíritu nocturno guardián)** y **Luma (Luciérnaga bioluminiscente de foco)** seleccionables en 1 clic desde la bienvenida o desde la pestaña *Enfoque*.
  - **Progresión de XP y Nivel independiente (Opción A)**: podés entrenar a Nuko y a Luma por separado con tus bloques de enfoque, estudio PDF, quizzes y hábitos; cada uno desbloquea y equipa sus propios **6 accesorios SVG** (`Clásico`, `Lentes de estudio`, `Auriculares chill`, `Vincha Dojo`, `Corona dorada`, `Aura neón`).
  - **12 emociones faciales** (`contento`, `enamorado`, `sorpresa`, `orgulloso`, `guino`, `bostezo`, `molesto`, `escucha`, `mareado`, `festejo`, `saludo`, `animo`), seguimiento suave del cursor (`--gx`, `--gy`) y parpadeo natural.
- **Dynamic Island / Notch (`#island`)**:
  - **11 estados en vivo**: `idle` (Reposo), `listen` (Escuchando), `think` (Pensando), `speak` (Hablando), `alert` (Alerta), `attentive` (Atento), `notification` (Notificación), `sleep` (Dormido), `focus` (Enfoque), `success` (Listo) y `remind` (Recordatorio).
  - **4 tarjetas Peek accionables**: organizar escritorio (`desktop_tidy`), borrador de correo (`email_draft`), recordatorio de hábito (`habit_remind`) y avisos retenidos/pendientes (`missed_reminders`).
- **Suite Completa de Asistente Virtual de Enfoque**:
  - **Perfiles de enfoque en 1 clic + Ritual de Intención**: `Estudio Profundo (25/5 + Solo estudio + Ruido marrón)`, `Trabajo / Código (50/10 + Lista negra + Lluvia suave)` y `Sprint Rápido (15/3 + Gamma 40 Hz)`, vinculando tu tarea o bloque PDF como meta en la Dynamic Island.
  - **Paisajes sonoros offline (Web Audio API)**: síntesis procedural 100% local de **Ruido marrón**, **Lluvia suave** y **Pulso binaural Gamma 40 Hz** con *fade-in/out* automático al iniciar o pausar el Pomodoro.
  - **Escudo de Notificaciones**: retiene silenciosamente los recordatorios durante un bloque de enfoque activo y te los entrega agrupados en una sola tarjeta *Peek* al pasar al descanso.
  - **Parking Lot Mental**: estacioná ideas o pendientes intrusivos en 3 segundos (`"Estaciona ..."` o desde *Enfoque*) sin perder la concentración y convertilos en tareas reales con 1 clic (`→ Tarea`).
  - **Descansos activos guiados**: micro-rituales de 60 segundos con **Respiración 4-4-4** animada con Nuko o Luma, **Regla 20-20-20** para descansar la vista e hidratación conectada a tus hábitos.
  - **Guardián Real de Enfoque**: supervisa la ventana activa durante el Pomodoro contra lista negra (`YouTube`, `Twitch`, `Instagram`, etc.) o lista blanca ("Solo estudio") con tiempo de gracia editable y racha limpia.
  - **Estudio PDF sin pérdida + Repaso Espaciado**: extrae `.pdf` o apuntes largos en bloques estructurados con ideas clave, lectura TTS, quiz Active Recall, evaluación Feynman y **Repaso Espaciado automático** (`1, 3, 7 y 14 días`).
  - **Radiografía de Enfoque**: calcula tu **mejor franja horaria** (`Mañana`, `Tarde`, `Noche`), porcentaje de bloques limpios, minutos acumulados y top de distracciones detectadas.
- **IA Híbrida Local-First + Voz Dual (`"Nuko"` / `"Luma"`)**:
  - Motor NLU determinístico offline en español + conector opcional **BYOK** (autodetección de Ollama, `llama.cpp`, OpenAI-compatible) con *fallback* automático sin conexión.
  - Reconocimiento de voz con palabras de activación `"Nuko"` y `"Luma"`, transcripción en vivo y síntesis de voz local.
- **Productividad, Hábitos, Correo y Herramientas del Sistema**:
  - **Tareas, Recordatorios y Temporizadores** persistidos en SQLite WAL (15 tablas) con cuenta regresiva vía SSE.
  - **Hábitos** con rachas, anillos semanales (`S D L M X J V`) y **15 escenas SVG animadas** protagonizadas por Nuko o Luma.
  - **Correo IMAP/SMTP** con borradores y confirmación obligatoria antes de enviar.
  - **Mi Equipo**: organizador de escritorio en 8 categorías con vista previa y deshacer atómico (`Deshacer`), lanzador seguro, monitor de CPU/RAM y bloc de notas rápidas.

---

## Cómo actualizar y abrirlo en tu PC

### Requisitos
- **Node.js 24+** (usa el módulo nativo `node:sqlite`)

### En Windows PowerShell (Modo Escritorio Flotante Electron o Web)
```powershell
git pull origin main
npm.cmd install
npm.cmd run electron:build
npm.cmd run electron:start
```
Atajo global en modo Electron: **`Alt + Espacio`** (`Option + Espacio` en macOS) para mostrar/ocultar la Dynamic Island al instante.

O para abrirlo directamente en tu navegador web (`http://127.0.0.1:4173`):
```powershell
npm.cmd run build
$env:PORT=4173; $env:NODE_ENV="production"; node server/dist/index.js
```

### Pruebas
```bash
npm test                  # 51 pruebas unitarias e integración (SQLite, Enfoque, Nuko & Luma)
npm run typecheck         # Verificación estricta de TypeScript en server, web y electron
```
