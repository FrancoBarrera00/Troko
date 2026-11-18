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
  - **Inicio y Chat**: resumen diario (hábitos, tareas, próximo aviso, enfoque) e historial conversacional persistente en SQLite WAL.
  - **Tareas**: lista de tareas, recordatorios únicos/recurrentes y temporizadores con cuenta regresiva en vivo vía SSE.
  - **Hábitos**: rachas, anillos semanales (`S D L M X J V`) y **15 escenas SVG animadas**.
  - **Enfoque**: temporizador Pomodoro 25/5 con anillo circular SVG, ciclo de 4 bloques y estadísticas de 7 días.
  - **Correo**: bandeja local de no leídos y redacción de borradores con confirmación explícita antes de enviar.
  - **Mi Mac**: clasificador de archivos sueltos en 8 categorías con vista previa, confirmación obligatoria, deshacer atómico (`Deshacer`) y lanzador de aplicaciones con lista blanca estricta.
  - **Ajustes y Electron**: configuración de proveedor IA, permisos locales, exportación/borrado de memoria JSON y *wrapper* opcional de Electron (`electron/`).

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

### 2. Iniciar en modo desarrollo (Backend + Web App)
```bash
npm run dev
```
O compilar y ejecutar en modo producción en un solo puerto (`http://127.0.0.1:4173`):
```bash
npm run build
PORT=4173 NODE_ENV=production node server/dist/index.js
```
Luego abre **`http://127.0.0.1:4173`** en tu navegador.

### 3. Pruebas
```bash
npm test                  # Pruebas unitarias SQLite y servicios (9/9)
npm run typecheck         # Verificación estricta de TypeScript
```
