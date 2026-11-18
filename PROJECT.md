# Project: Troko-Desk

> Local-first AI Desktop Companion (`https://trokotec.com/desk/`), built with TypeScript, React, Vite, Node.js 24 (`node:sqlite` + SSE), and Playwright E2E verification, with optional Electron always-on-top notch packaging.

---

## Architecture

Troko-Desk is a Spanish-first, privacy-focused personal AI companion that lives in an interactive top-of-screen **Dynamic Island / Notch** (`#island`) above a desktop workspace. Unlike cloud SaaS tools, it requires **zero accounts** and stores all conversations, tasks, reminders, timers, habits, focus sessions, desktop-tidy undo logs, email drafts, and settings locally in SQLite (`node:sqlite`).

### System Topology
1. **Frontend (`web/` — React 19 + TypeScript + Vite)**:
   - **Floating Notch Island (`IslandBar` + `IslandPanel`)**: Anchored top-center. Hover peeks, click pins open, `Esc` or outside-click closes. Supports 8+ live states (`idle`, `listen`, `think`, `speak`, `focus`, `success`, `remind`, `sleep`, plus `alert`/`attentive`/`notification` expressions) and inline peek confirmation cards (desktop tidy preview, email draft preview, habit reminder nudge).
   - **Troko SVG Character Engine (`TrokoAvatar`)**: Rounded-trapezoid cream mascot (`#F8F4E8` → `#E1D8C1`) with `#141414` face, `#F29DB0` blush, pointer gaze-tracking (`--gx`, `--gy` interpolated easing), periodic blinking, 5s idle random glances, 35s idle sleep (`Dormido`), **12 emotions**, **15 animated habit scenes**, and **laptop-typing focus animation**. Respects `prefers-reduced-motion`.
   - **7-Tab Navigation + Footer Actions**: `Inicio`, `Chat`, `Tareas`, `Hábitos`, `Enfoque`, `Correo`, `Mi Mac`, plus `Ajustes`, `Salir de Troko`, and global `"Con voz"` TTS toggle.
   - **Desktop Stage Backdrop**: Renders a clean desktop environment with live interactive desktop files so users/testers in browser mode can watch `"Ordena mi escritorio"` organize files into category folders and `"Deshacer"` restore them losslessly.
2. **Local Backend (`server/` — Node.js v24 + TypeScript + `node:sqlite` + SSE)**:
   - Single-process local HTTP/REST + **Server-Sent Events (`/api/events`)** daemon serving built static assets and real-time state updates (`timer.tick`, `focus.tick`, `reminder.due`, `habit.nudge`, `island.state`, `mail.unread`, `desktop.changed`).
   - **Scheduler Engine**: Drives 1-second focus/timer ticks, one-shot/recurring reminders, and **missed-while-asleep wake catch-up** when the app resumes after sleep/downtime.
   - **Local AI & NLU Engine**: Pluggable `AIProvider` supporting `Llama.cpp` / `Ollama` / OpenAI-compatible local endpoints AND a built-in deterministic **Spanish/English NLU Intent Router** + conversational persona so every command (`"Troko, anota una tarea..."`, `"Enfócate 25 minutos"`, `"Ordena mi escritorio"`, `"Responde a Ana..."`, `"Descansa"`) works offline with zero external dependencies.
   - **Safety-First OS Services**:
     - `DesktopOrganizerService` via `FileSystemAdapter`: scans configured desktop folder (sandboxed `./data/desktop-sandbox` in browser/dev mode or user-configured directory), categorizes files, previews counts, requires explicit confirmation, **never deletes files**, handles filename collisions safely, and records an atomic move manifest for `Deshacer`.
     - `MailBridgeService`: local realistic inbox/draft adapter (plus optional IMAP/SMTP settings) that **always creates a pending draft and blocks sending until explicit confirmation**.
     - `AppLauncherService`: whitelisted application launcher (no arbitrary shell execution).
3. **Shared Contracts (`shared/`)**: Strict TypeScript interfaces and runtime validators shared across `server/`, `web/`, and tests.
4. **Optional Native Desktop Shell (`electron/`)**: Lightweight frameless, always-on-top, top-center notch Electron wrapper pointing to the local Troko-Desk server.

### Visual Design System (from `trokotec.com/desk/`)
- **Palette**: `--ink: #000000`, `--panel: #0E0E10`, `--raise: #151518`, `--card: #1B1B1F`, `--line: rgba(242,235,217,0.13)`, `--cream: #F2EBD9`, `--muted: #B3B0A6`, `--gray: #8E8E93`, `--lime: #B6F23A`, `--purple: #8B5CF6`, `--blue: #58B2FF`, `--amber: #F5A623`, `--danger: #FF5A5F`.
- **Typography**: `Bricolage Grotesque` (UI & headings, with clean system sans fallback offline) + `JetBrains Mono` / `SF Mono` (`tabular-nums` for timers and counters).
- **Default Language**: Natural Spanish (`es`), warm informal `"tú"` tone, Spanish weekday headers `S D L M X J V`.

---

## Feature Inventory

Every feature discovered in Step 0 Survey (`spec_miner_survey_1`, `explorer_survey_1`, `explorer_survey_2`) is assigned to a milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Top-Screen Dynamic Island Bar | Always-on-top top-center pill (`#island`); hover peeks, click pins open, `Esc`/outside-click closes; smooth resize & ARIA support | M1 | survey |
| F2 | Expanded 2-Column Panel & Sidebar | ~700px panel with left sidebar (Troko avatar + status, 7 tabs `Inicio`, `Chat`, `Tareas`, `Hábitos`, `Enfoque`, `Correo`, `Mi Mac`, `Ajustes`, `Salir de Troko`) + `"Con voz"` toggle | M1 (shell), M2–M5 (views) | survey |
| F3 | Troko Animated Vector Avatar & Gaze Tracking | Cream trapezoid SVG mascot tracking pointer (`--gx`, `--gy`), blinking (`~3-6s`), 5s idle glances, `prefers-reduced-motion` support | M1 | survey |
| F4 | 12 Facial Emotions | `contento`, `enamorado` (hearts), `sorpresa`, `orgulloso` (stars), `guino`, `bostezo`, `molesto`, `escucha`, `mareado` (spiral), `festejo`, `saludo`, `animo` | M1 | survey |
| F5 | Island Status States & Overlays | `idle` (`Reposo`), `listen` (`Escuchando`), `think` (`Pensando`), `speak` (`Hablando`), `alert` (`Alerta`), `attentive` (`Atento`), `notification` (`Notificación`), `sleep` (`Dormido`, 35s idle/`"descansa"`), plus `focus` (`MM:SS`), `success` (`Listo`/`Anotado`/`Deshecho`), `remind` | M1 | survey |
| F6 | Wake-Word & Natural Voice Commands | `"Troko"` wake word + mic push-to-talk (Web Speech STT fallback), live closed-island transcript bubble, permission error handling | M4 | survey |
| F7 | Local AI Brain & Pluggable LLM | Built-in offline Spanish/English NLU intent router + pluggable `AIProvider` (`llama.cpp` / Ollama / OpenAI-compatible BYOK) for chat, tool calls, and draft generation | M4 | survey |
| F8 | Local TTS & `"Con voz"` Toggle | Spoken responses synchronized with `speak` purple waveforms via Web Speech / Kokoro-compatible TTS adapter; toggleable globally | M4 | survey |
| F9 | First-Run `Bienvenida` & Model Download | Welcome modal (`Llama 3.2 3B Instruct Q4_K_M`, `2,02 GB`) with pausable/resumable download simulation/manager + instant Lite offline mode (`Ahora no` / `Empezar`) | M4 | survey |
| F10 | `Inicio` Home Summary & Command Bar | Quick prompt `"Escribe o habla con Troko..."`, mic + lime send `↑`, 3 KPI cards (`hábitos hoy`, `tareas pendientes`, `próximo aviso`), `ATAJOS` (`Hablar`, `+ Nueva tarea`) | M1 (stub), M2 (KPIs), M4 (command bar) | survey |
| F11 | `Chat` Conversational History | Persistent multi-turn local conversation thread with tool-execution badges, voice/text transcripts, and clear-history support | M4 | survey |
| F12 | `Tareas` (Tasks, Reminders & Timers) | Create/check/delete tasks, one-shot & optional recurring reminders with sound + island alert + **missed-while-asleep wake catch-up**, and live SSE countdown timers | M2 | survey |
| F13 | `Hábitos` (Streaks, Weekly Rings & 15 Scenes) | Daily habit targets (`x/y`), `+1`, `Deshacer`, `SEGUIMIENTO DE LA SEMANA` (`S D L M X J V`), `Mejor racha`, scheduled reminder + `Probar`, `+ Agregar` modal, 15 animated SVG scenes + `¡Meta cumplida!` celebration | M3 | survey |
| F14 | `Enfoque` (Pomodoro Focus Mode & Weekly Stats) | 25/5 Pomodoro (configurable in `Ajustes del enfoque`), 4-dot cycle indicator, task label, circular SVG ring, laptop-typing Troko scene, `Pausar`/`+5 min`/`Terminar`/`Detener`, `HOY` summary, 7-day bar chart, persisted recovery across reload/restart | M2 | survey |
| F15 | `Correo` (Unread Reader & Draft Confirmation) | Reads unread emails (local adapter + optional IMAP/SMTP), drafts replies via command, displays peek card (`Enviar`, `Descartar`, `Editar`, voice `"envíalo"`/`"descártalo"`), **never sends without confirmation** | M5 | survey |
| F16 | `Mi Mac` / Desktop Organizer (Preview + Undo) | Scans loose desktop files, categorizes (`Capturas`, `Imágenes`, `Documentos`, `Hojas de cálculo`, `Audio`, `Videos`, `Comprimidos`, `Otros`), shows island peek (`Ordenar ahora`, `Cancelar`, `Ver detalle`), collision-safe move, **never deletes**, atomic `Deshacer` | M5 | survey |
| F17 | Whitelisted App Launcher | Voice/text `"Abre <App>"` opens whitelisted desktop apps / stage panels; strictly rejects arbitrary shell commands | M5 | survey |
| F18 | `Ajustes`, Memory Wipe & `Salir de Troko` | Settings for AI provider, voice/TTS/wake word, focus durations, permissions, JSON export, **full local memory wipe**, and `Salir de Troko` | M4 | survey |
| F19 | Optional Electron Notch Shell & Bridges | Frameless always-on-top top-center Electron wrapper (`electron/main.ts`) + extensible Telegram/Weather/Tavily bridge config in `Ajustes` | M5 | survey |

---

## Milestones

### Implementation Track

| # | Name | Scope | Dependencies | Status |
|---|------|-------|--------------|--------|
| M1 | Foundation, Storage & Notch Shell | Monorepo (`shared`, `server`, `web`, `e2e` config), `node:sqlite` schema & migrations, HTTP+SSE server, Troko design system, Desktop Stage, Floating Notch Island (`7` tabs + footer), Troko SVG avatar (gaze tracking, 12 emotions, all island states) | none | IN_PROGRESS (dc313fddd3cdc3107fa80faf0e01c9ca) |
| M2 | Productivity Core (Tasks, Reminders, Timers & Focus) | `tasks`, `reminders` (incl. missed-on-wake catch-up), `timers`, `focus_sessions` services & routes; `Tareas`, `Enfoque` (Pomodoro ring, laptop scene, weekly chart, crash/reload recovery), and `Inicio` KPI cards | M1 | PLANNED |
| M3 | Habits Engine & 15 Animated Scenes | `habits` & `habit_logs` service/routes (`+1`, `Deshacer`, streaks, weekly rings, timed nudges + `Probar`); `Hábitos` tab & `+ Agregar` modal; all 15 animated Troko habit SVG scenes + goal celebration | M1 | PLANNED |
| M4 | Local AI Brain, Voice, Chat, Onboarding & Settings | Offline Spanish/English NLU + pluggable `AIProvider` (Ollama/`llama.cpp`/BYOK) + `ToolRegistry`, Web Speech STT + `"Troko"` wake word + TTS (`"Con voz"`), `Chat` tab, `Inicio` prompt bar, `Bienvenida` onboarding (pausable model download), `Ajustes` + memory wipe + `Salir de Troko` | M2, M3 | PLANNED |
| M5 | Desktop Organizer, Email Drafts, App Launcher & Electron Shell | `DesktopOrganizerService` (preview, confirm, collision-safe move, zero-delete, atomic `Deshacer` + Desktop Stage file animation), `MailBridgeService` & `Correo` tab (unread + draft peek confirm-before-send), whitelisted `AppLauncherService`, optional `electron/` notch shell & bridge config | M1, M4 | PLANNED |
| M6 | Final Milestone: E2E Suite Pass & Tier 5 Hardening | Phase 1: Wait for `TEST_READY.md`, pass 100% of E2E tests sequentially (Tiers 1 → 2 → 3 → 4). Phase 2: Dedicated Tier 5 white-box adversarial hardening loop until Challengers find no remaining gaps | M2, M3, M4, M5, E2E Track | PLANNED |

### E2E Testing Track (Parallel)

| Track | Scope | Dependencies | Status |
|-------|-------|--------------|--------|
| E2E Testing Track | Requirement-driven opaque-box Playwright test infrastructure + 4-tier test suite (`>= 5*N` Tier 1, `>= 5*N` Tier 2, `>= N` Tier 3, `>= max(5, N/2)` Tier 4 for `N=19` features -> `>= 219` tests) against `/usr/bin/chromium --no-sandbox`; publishes `TEST_INFRA.md` and `TEST_READY.md` | none (runs parallel to Implementation Track) | IN_PROGRESS (d10284bd808ef2bf24fdfbfacd30acd9) |

---

## Interface Contracts

### 1. Shared Domain Types (`shared/types.ts`)
- `IslandState`: `'idle' | 'listen' | 'think' | 'speak' | 'alert' | 'attentive' | 'notification' | 'sleep' | 'focus' | 'success' | 'remind'`
- `TrokoMood`: `'contento' | 'enamorado' | 'sorpresa' | 'orgulloso' | 'guino' | 'bostezo' | 'molesto' | 'escucha' | 'mareado' | 'festejo' | 'saludo' | 'animo'`
- `HabitSceneId`: `'water' | 'book' | 'dumbbell' | 'sun' | 'laptop' | 'sleep' | 'walk' | 'stretch' | 'journal' | 'music' | 'cook' | 'clean' | 'study' | 'detox' | 'breathe'`
- `TabId`: `'inicio' | 'chat' | 'tareas' | 'habitos' | 'enfoque' | 'correo' | 'mi_mac' | 'ajustes'`
- `IslandStatusPayload`: `{ state: IslandState; mood: TrokoMood; statusText: string; badgeWord?: string; focusRemainingSec?: number; remindMessage?: string; transcript?: string; peekCard?: PeekCard | null }`
- `PeekCard`:
  - `{ kind: 'desktop_tidy'; batchId: string; totalFiles: number; categories: Record<string, number>; items: Array<{ fileName: string; category: string }> }`
  - `{ kind: 'email_draft'; draftId: string; toName: string; toEmail: string; subject: string; body: string }`
  - `{ kind: 'habit_remind'; habitId: string; habitName: string; progress: number; goal: number; unitLabel: string }`
  - `{ kind: 'missed_reminders'; reminders: Array<{ id: string; title: string; triggerAt: string }> }`

### 2. SQLite Schema (`server/src/db/schema.ts`)
All tables created in M1 migration `001_init.sql` (using `node:sqlite` `DatabaseSync` in WAL mode):
- `settings(key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)`
- `tasks(id TEXT PRIMARY KEY, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, completed_at TEXT)`
- `reminders(id TEXT PRIMARY KEY, title TEXT NOT NULL, trigger_at TEXT NOT NULL, recurrence TEXT, status TEXT NOT NULL DEFAULT 'scheduled', fired_at TEXT, sound_enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`
- `timers(id TEXT PRIMARY KEY, label TEXT NOT NULL, duration_sec INTEGER NOT NULL, remaining_sec INTEGER NOT NULL, status TEXT NOT NULL, started_at TEXT, ends_at TEXT, created_at TEXT NOT NULL)`
- `habits(id TEXT PRIMARY KEY, name TEXT NOT NULL, scene_id TEXT NOT NULL, unit_label TEXT NOT NULL, daily_goal INTEGER NOT NULL, unit_volume_label TEXT, reminder_time TEXT, streak_current INTEGER NOT NULL DEFAULT 0, streak_best INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`
- `habit_logs(id TEXT PRIMARY KEY, habit_id TEXT NOT NULL, date_ymd TEXT NOT NULL, delta INTEGER NOT NULL, logged_at TEXT NOT NULL)`
- `focus_sessions(id TEXT PRIMARY KEY, label TEXT, duration_sec INTEGER NOT NULL, break_sec INTEGER NOT NULL, remaining_sec INTEGER NOT NULL, phase TEXT NOT NULL, cycle_index INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT, last_tick_at TEXT)`
- `conversations(id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL)`
- `messages(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, input_mode TEXT NOT NULL DEFAULT 'text', intent_json TEXT, created_at TEXT NOT NULL)`
- `desktop_tidy_batches(id TEXT PRIMARY KEY, target_dir TEXT NOT NULL, status TEXT NOT NULL, file_count INTEGER NOT NULL, created_at TEXT NOT NULL, undone_at TEXT)`
- `desktop_tidy_moves(id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, file_name TEXT NOT NULL, category TEXT NOT NULL, source_path TEXT NOT NULL, dest_path TEXT NOT NULL)`
- `email_messages(id TEXT PRIMARY KEY, from_name TEXT NOT NULL, from_email TEXT NOT NULL, subject TEXT NOT NULL, snippet TEXT NOT NULL, body TEXT NOT NULL, unread INTEGER NOT NULL DEFAULT 1, received_at TEXT NOT NULL)`
- `email_drafts(id TEXT PRIMARY KEY, source_message_id TEXT, to_name TEXT NOT NULL, to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, sent_at TEXT)`
- `model_downloads(id TEXT PRIMARY KEY, model_name TEXT NOT NULL, total_bytes INTEGER NOT NULL, downloaded_bytes INTEGER NOT NULL, status TEXT NOT NULL, local_path TEXT, updated_at TEXT NOT NULL)`
- `integrations(id TEXT PRIMARY KEY, type TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, config_json TEXT NOT NULL, updated_at TEXT NOT NULL)`

### 3. REST & SSE API Contract (`server/src/routes/`)
- `GET /api/health` → `{ ok: true, version: '0.1.0', uptimeSec }`
- `GET /api/events` → `text/event-stream` SSE pushing `{ type, payload, ts }` (`island.state`, `timer.tick`, `focus.tick`, `reminder.due`, `habit.nudge`, `data.updated`)
- `GET /api/summary` → `{ habitsCompletedToday, habitsTotalToday, pendingTasksCount, nextReminder, activeFocus, unreadEmailsCount, looseDesktopFilesCount }`
- `GET /api/settings` | `PATCH /api/settings` | `POST /api/memory/export` | `POST /api/memory/wipe` | `POST /api/app/wake` (triggers missed-while-asleep reminder catch-up)
- `GET /api/tasks` | `POST /api/tasks` | `PATCH /api/tasks/:id` | `DELETE /api/tasks/:id`
- `GET /api/reminders` | `POST /api/reminders` | `POST /api/reminders/:id/dismiss` | `POST /api/reminders/:id/ack-missed` | `DELETE /api/reminders/:id`
- `GET /api/timers` | `POST /api/timers` | `POST /api/timers/:id/pause` | `POST /api/timers/:id/resume` | `POST /api/timers/:id/cancel`
- `GET /api/focus` | `POST /api/focus/start` | `POST /api/focus/pause` | `POST /api/focus/resume` | `POST /api/focus/extend` | `POST /api/focus/finish` | `POST /api/focus/stop`
- `GET /api/habits` | `POST /api/habits` | `PATCH /api/habits/:id` | `DELETE /api/habits/:id` | `POST /api/habits/:id/increment` | `POST /api/habits/:id/undo` | `POST /api/habits/:id/test-reminder`
- `GET /api/chat` | `POST /api/chat/command` | `DELETE /api/chat`
- `GET /api/onboarding` | `POST /api/onboarding/download/start` | `POST /api/onboarding/download/pause` | `POST /api/onboarding/download/resume` | `POST /api/onboarding/complete`
- `GET /api/desktop/scan` | `POST /api/desktop/tidy/preview` | `POST /api/desktop/tidy/apply` | `POST /api/desktop/tidy/undo` | `POST /api/desktop/seed-sample`
- `GET /api/mail/inbox` | `POST /api/mail/draft` | `PATCH /api/mail/drafts/:id` | `POST /api/mail/drafts/:id/send` | `POST /api/mail/drafts/:id/discard`
- `POST /api/apps/launch` | `GET /api/integrations` | `PATCH /api/integrations/:type`

### 4. Backend Service & Adapter Interfaces
- `EventBus`: `{ publish(event: ServerEvent): void; subscribe(listener): () => void }`
- `AIProvider`: `{ id: string; isAvailable(): Promise<boolean>; complete(input: { text: string; context: SummarySnapshot; history: ConversationMessage[] }): Promise<AiDecision> }`
- `FileSystemAdapter`: `{ resolveTargetDir(): string; listRootFiles(dir: string): Promise<FileEntry[]>; ensureDir(dir: string): Promise<void>; moveFile(from: string, to: string): Promise<void>; exists(path: string): Promise<boolean> }`
- `MailAdapter`: `{ listUnread(): Promise<EmailMessage[]>; sendEmail(draft: EmailDraft): Promise<{ delivered: boolean; provider: string }> }`

---

## Code Layout & Exclusive File Ownership

```text
/home/antigravity/FrancoBarrera00/Troko/
├── package.json                      # Root scripts: dev, build, start, test, test:e2e, typecheck (M1)
├── tsconfig.base.json                # Strict TS base config (M1)
├── .gitignore                        # Ignore node_modules, dist, *.db*, data/, playwright-report/ (M1)
├── PROJECT.md                        # Living project index (Orchestrator)
├── TEST_INFRA.md                     # E2E test architecture & feature checklist (E2E Track)
├── TEST_READY.md                     # E2E completion signal (E2E Track)
├── shared/
│   ├── types.ts                      # Domain models, IslandState, TrokoMood, HabitSceneId, PeekCard (M1)
│   └── validators.ts                 # Runtime input validation helpers (M1)
├── server/
│   ├── package.json                  # Server workspace config (M1)
│   ├── tsconfig.json                 # Server TS config (M1)
│   ├── src/
│   │   ├── index.ts                  # HTTP server + static serving + mounts all route modules (M1)
│   │   ├── app.ts                    # App factory createApp(config) for isolated tests & prod (M1)
│   │   ├── eventBus.ts               # SSE pub/sub + Island state manager (M1)
│   │   ├── db/
│   │   │   ├── database.ts           # node:sqlite DatabaseSync wrapper, WAL mode, wipe/export (M1)
│   │   │   └── schema.ts             # Complete SQLite DDL + seed defaults (M1)
│   │   ├── services/
│   │   │   ├── settingsService.ts    # Settings & memory export/wipe (M1/M4)
│   │   │   ├── productivityService.ts# Tasks, reminders (wake catch-up), timers, focus (M2)
│   │   │   ├── habitService.ts       # Habits, logs, streaks, weekly rings, nudges (M3)
│   │   │   ├── nluService.ts         # Offline Spanish/English NLU + wake word + replies (M4)
│   │   │   ├── aiProvider.ts         # Pluggable Ollama/llama.cpp/BYOK + fallback + tool exec (M4)
│   │   │   ├── organizerService.ts   # Safe Desktop organizer + FileSystemAdapter + undo (M5)
│   │   │   ├── mailerService.ts      # Inbox + draft-confirm gate + MailAdapter (M5)
│   │   │   └── appLauncherService.ts # Whitelisted app launcher + bridge config (M5)
│   │   └── routes/
│   │       ├── core.ts               # /api/health, /api/events, /api/summary, /api/settings (M1)
│   │       ├── productivity.ts       # /api/tasks, /api/reminders, /api/timers, /api/focus (M2)
│   │       ├── habits.ts             # /api/habits (M3)
│   │       ├── ai.ts                 # /api/chat, /api/onboarding, /api/memory, /api/app (M4)
│   │       └── osTools.ts            # /api/desktop, /api/mail, /api/apps, /api/integrations (M5)
│   └── tests/
│       ├── m1.storage.test.ts        # M1 unit/integration tests
│       ├── m2.productivity.test.ts   # M2 unit/integration tests
│       ├── m3.habits.test.ts         # M3 unit/integration tests
│       ├── m4.ai.test.ts             # M4 unit/integration tests
│       └── m5.ostools.test.ts        # M5 unit/integration tests
├── web/
│   ├── package.json                  # Web workspace config (M1)
│   ├── tsconfig.json                 # Web TS config (M1)
│   ├── vite.config.ts                # Vite proxy to /api -> localhost:3001 (M1)
│   ├── index.html                    # Root HTML + Bricolage Grotesque & JetBrains Mono fonts (M1)
│   └── src/
│       ├── main.tsx                  # React entry (M1)
│       ├── App.tsx                   # DesktopStage + Island + Modal mounts (M1)
│       ├── styles/tokens.css         # Official Troko CSS palette & motion tokens (M1)
│       ├── api/client.ts             # Typed REST + SSE client hooks (M1)
│       ├── hooks/
│       │   ├── useTrokoEvents.ts     # SSE state & real-time sync hook (M1)
│       │   ├── useGazeTracking.ts    # Pointer --gx/--gy, blink, 5s glance, 35s sleep (M1)
│       │   └── useVoiceAudio.ts      # Web Speech STT + wake word + Web Audio/TTS (M4)
│       └── components/
│           ├── Island/
│           │   ├── IslandBar.tsx     # Collapsed pill, slots, status, timer, peek cards (M1)
│           │   └── IslandPanel.tsx   # Expanded 2-column sidebar + active tab router (M1)
│           ├── TrokoAvatar/
│           │   ├── TrokoAvatar.tsx   # SVG mascot + 12 moods + island expressions (M1)
│           │   ├── FocusScene.tsx    # Laptop-typing animation for Enfoque (M2)
│           │   └── HabitScenes.tsx   # All 15 animated habit SVG scenes + celebration (M3)
│           ├── DesktopStage/
│           │   ├── DesktopStage.tsx  # Simulated desktop wallpaper & notch backdrop (M1)
│           │   └── DesktopFiles.tsx  # Interactive loose files & folder animation (M5)
│           └── Tabs/
│               ├── InicioTab.tsx     # Home summary KPIs + prompt bar + shortcuts (M1 stub -> M2 KPIs -> M4 prompt)
│               ├── TareasTab.tsx     # Tasks, reminders (incl. wake catch-up), timers (M2)
│               ├── EnfoqueTab.tsx    # Pomodoro ring, controls, HOY & 7-day chart (M2)
│               ├── HabitosTab.tsx    # Weekly rings, habit cards, +Agregar modal (M3)
│               ├── ChatTab.tsx       # Multi-turn conversation view (M4)
│               ├── AjustesTab.tsx    # AI/Voice/Focus settings, export, memory wipe (M4)
│               ├── BienvenidaModal.tsx # First-run onboarding & pausable download (M4)
│               ├── MiEquipoTab.tsx   # Desktop organizer preview/apply/undo + app launcher (M5)
│               └── CorreoTab.tsx     # Unread inbox + draft preview/edit/send/discard (M5)
├── electron/
│   ├── package.json                  # Optional Electron notch wrapper config (M5)
│   └── main.ts                       # Frameless always-on-top top-center window (M5)
└── e2e/
    ├── package.json                  # Playwright E2E package (E2E Testing Track)
    ├── playwright.config.ts          # Uses /usr/bin/chromium --no-sandbox (E2E Testing Track)
    └── tests/                        # Tier 1–4 E2E specs (E2E Testing Track)
```

### Build, Start & Test Commands
- **Install**: `npm install` (set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` for E2E Playwright)
- **Typecheck**: `npm run typecheck`
- **Build**: `npm run build` (builds `shared`, `server`, and `web/dist`)
- **Start**: `npm start` (starts local server on `PORT` default `3000`, serving API + SSE + `web/dist`)
- **Unit & Integration Tests**: `npm test` (runs `node --test` across `server/tests/*.test.ts` using isolated temp SQLite DBs)
- **E2E Tests**: `npm run test:e2e` (runs Playwright against `/usr/bin/chromium` with `--no-sandbox --disable-dev-shm-usage` against an isolated test server & temp DB/sandbox desktop)

---

## Round 3: Desktop Companion Completion (4 Remaining Pieces)

| # | Name | Scope | Dependencies | Status |
|---|------|-------|--------------|--------|
| R3-M1 | Electron Native Floating Window & Windows Packaging | `electron/preload.ts`, `electron/main.ts` (auto-start backend, `app.getPath('userData')`, single-instance, tray, `alwaysOnTop`, `transparent`, `troko:set-interactive` click-through, `troko:quit`), `electron/tsconfig.json`, root `package.json` scripts + `electron-builder` Windows config, `web/` transparent Electron overlay mode (`env.d.ts`, `tokens.css`, `App.tsx`) | none | DONE |
| R3-M2 | Real Local AI / Ollama Auto-Detection & BYOK UX | `shared/types.ts` (`AiDetectResult`, `AiConnectionTestResult`), `server/src/services/aiProvider.ts` (Ollama `/api/tags` + `/api/chat`, OpenAI-compatible `/v1/chat/completions`, connection test, conversation history, structured JSON fallback), `nluService.ts`, `routes/ai.ts` (`GET /api/ai/detect`, `POST /api/ai/test`), `web/` (`client.ts`, `AjustesTab.tsx` detect/test while keeping `input[name="model"]`, `BienvenidaModal.tsx` non-blocking Ollama banner), `server/tests/m4.ai.test.ts` | none | DONE |
| R3-M3 | Real IMAP/SMTP Email Alongside Sandbox | `server/src/services/mailTransport.ts` (`node:tls`/`node:net` IMAP & SMTP + connection verify), `mailerService.ts` (`syncInbox()`, SMTP send gated on `imap_smtp.enabled`, mandatory confirmation before send), `routes/osTools.ts` (`/api/mail/sync`, `/api/integrations/:type/test`), `web/` (`AjustesTab.tsx` `imap_smtp` fields + test, `CorreoTab.tsx` sync + error banner, `client.ts`), `server/tests/m5.mail.test.ts` | R3-M2 | DONE |
| R3-M4 | Real Safe App Launcher & Live Bridges | `server/src/services/appLauncherService.ts` (static per-OS `win32`/`darwin`/`linux` `spawn(..., { shell: false, detached: true })` guarded by `NODE_ENV !== 'test'`, preserving `SHELL_META_REGEX` + whitelist), `server/src/services/bridgeService.ts` (Open-Meteo Weather, Tavily Search, Telegram Bot API via `fetch`), `nluService.ts` bridge intents, `ChatTab.tsx` `TOOL_LABELS`, `server/tests/m5.ostools.test.ts` | R3-M3 | DONE |
| R3-M5 | Full Verification, New E2E Coverage & Final Audit | Add E2E tests for R3-M1..R3-M4, run full `npm run typecheck && npm run build && npm test && npm run test:e2e`, and perform whole-project Forensic Audit | R3-M1, R3-M2, R3-M3, R3-M4 | DONE |

