# Troko-Desk E2E Test Infrastructure (`TEST_INFRA.md`)

> Opaque-box Playwright E2E test architecture, isolation contract, 4-tier quota matrix (`N = 19` features), and progressive UI testability guide for **Troko-Desk**.

---

## 1. Opaque-Box Testing Contract

The `e2e/` test suite is **100% opaque-box**:
- **Zero internal imports**: Specs and helpers NEVER import from `shared/`, `server/`, `web/`, or `electron/`.
- **Single-interface testing**: Tests interact exclusively through:
  1. Real browser actions in Chromium against `http://127.0.0.1:<PORT>` (`page` / `TrokoPage`).
  2. Documented REST contracts (`/api/*`) via Playwright's `APIRequestContext` (`TrokoApi`).
  3. Server-Sent Events (`/api/events`) via `SseCollector` and browser `EventSource` taps.
  4. Real filesystem checks inside the isolated temporary desktop sandbox (`DesktopSandbox`) for F16 (`Mi Mac` desktop organizer) and opaque packaging file checks for F19.
- **No skipped or tautological tests**: `test.skip`, `test.fixme`, empty test bodies, and `expect(true).toBe(true)` are strictly forbidden. Every test combines user interactions with observable DOM/SVG/ARIA, REST, SSE, or filesystem persistence assertions.

---

## 2. Runtime, Browser & Installation

- **Node.js**: `v24.x` (verified `v24.22.2` with native `fetch` and `node:sqlite`).
- **Browser**: System Chromium at `/usr/bin/chromium` (`CHROMIUM_PATH` override supported) launched with:
  ```text
  --no-sandbox --disable-dev-shm-usage --disable-gpu
  ```
- **Locale & Viewport**: `es-ES`, default `1280×800` (fits the ~700px expanded Dynamic Island panel comfortably).

### Commands

```bash
# Install Playwright & TypeScript inside e2e/ without downloading duplicate browsers
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm --prefix e2e install

# Type-check E2E config, helpers, and all specs
npm --prefix e2e run typecheck

# List all discovered E2E tests (works safely even before server/web are built)
npm --prefix e2e run test:list

# Run full E2E suite (auto-spawns isolated server on port 4173 when built)
npm --prefix e2e test

# Run individual tiers
npm --prefix e2e run test:tier1
npm --prefix e2e run test:tier2
npm --prefix e2e run test:tier3
npm --prefix e2e run test:tier4

# Point E2E suite at an already-running server
BASE_URL=http://127.0.0.1:3000 npm --prefix e2e test
```

---

## 3. Server Isolation & Environment Contract

When `BASE_URL` / `TROKO_BASE_URL` is **not** set, `e2e/playwright.config.ts` probes `server/dist/index.js` (or `server/dist/server/src/index.js`) and root `package.json`:
- **During `--list` or before server is built**: `webServer` is left `undefined` and no temporary directories are created at config load time (`TROKO_E2E_USE_NPM_START=1` can opt in to `npm start` when unbuilt), allowing `npx playwright test --list` and `tsc --noEmit` to succeed cleanly with zero `/tmp/troko-e2e-*` leaks.
- **When server is built (or `TROKO_E2E_USE_NPM_START=1` with `scripts.start`)**: `playwright.config.ts` validates `TROKO_E2E_PORT` (`1..65535`, default `4173`), allocates an isolated per-run temporary directory (`os.tmpdir()/troko-e2e-*`), and starts the server on `127.0.0.1:<port>` with:
  - `NODE_ENV=test`
  - `HOST=127.0.0.1`
  - `PORT=4173`
  - `TROKO_DATA_DIR`, `DATA_DIR` → `<tmpDir>/data`
  - `TROKO_DB_PATH`, `DB_PATH`, `SQLITE_PATH` → `<tmpDir>/data/troko-e2e.db`
  - `TROKO_DESKTOP_DIR`, `DESKTOP_SANDBOX_DIR`, `DESKTOP_DIR` → `<tmpDir>/desktop-sandbox`
- **Readiness gate**: `GET http://127.0.0.1:<port>/api/health` (`reuseExistingServer: false`).
- **DesktopSandbox safety invariant**: `DesktopSandbox` refuses `os.homedir()`, `~/Desktop/*`, and arbitrary subdirectories inside `os.homedir()`; it only permits paths strictly inside `os.tmpdir()` or the repo's `.e2e-sandbox` / `data/desktop-sandbox`, and enforces traversal guards on `writeFile`, `exists`, and `readFile`.

---

## 4. 4-Tier Test Suite Quota Matrix (`N = 19` Features)

| Tier | Directory | Quota Formula | Minimum Required | Current / Planned | Focus |
|---|---|---|---|---|---|
| **Tier 1** | `e2e/tests/tier1/*.spec.ts` | `>= 5 * N` | `>= 95` (`>= 5` / feature) | **106** (E1) | Happy-path functional, visual, REST, SSE & persistence coverage for F1–F19 |
| **Tier 2** | `e2e/tests/tier2/*.spec.ts` | `>= 5 * N` | `>= 95` (`>= 5` / feature) | Planned (E2) | Boundary values, validation errors, collision/race conditions, empty/overflow edge cases |
| **Tier 3** | `e2e/tests/tier3/*.spec.ts` | `>= N` | `>= 19` | Planned (E3) | Cross-feature pairwise interactions (e.g., Voice -> Focus -> Island -> TTS, Habit -> Nudge -> Island) |
| **Tier 4** | `e2e/tests/tier4/*.spec.ts` | `>= max(5, N/2)` | `>= 10` | Planned (E3) | End-to-end daily Spanish user workflows across multiple tabs, reloads & wake catch-up |
| **Total** | `e2e/tests/` | — | **`>= 219`** | **106 in E1 / >= 230 target** | Full requirement-driven E2E suite |

---

## 5. F1–F19 Feature Checklist & Spec Mapping

| # | Feature | Tier 1 Spec File | Tests | Key Spanish UI & API/SSE Contracts |
|---|---|---|---|---|
| **F1** | Top-Screen Dynamic Island Bar | `f01-island-bar.spec.ts` | 5 | `#island`, top-center alignment, hover peek, click pin (`aria-expanded`), `Esc` / outside-click close, resize |
| **F2** | Expanded 2-Column Panel & Sidebar | `f02-panel-sidebar.spec.ts` | 6 | 2-col layout (~700px), 7 tabs (`Inicio`..`Mi Mac`), `Ajustes`, `Salir de Troko`, `"Con voz"`, arrow nav, badges, empty states |
| **F3** | Troko Animated Vector Avatar & Gaze | `f03-avatar-gaze.spec.ts` | 5 | Cream trapezoid SVG, `--gx`/`--gy` gaze tracking, 3–6s blink, 5s idle glance, `prefers-reduced-motion` |
| **F4** | 12 Facial Emotions | `f04-emotions.spec.ts` | 6 | `data-mood` across all 12 moods (`contento`, `enamorado`, `sorpresa`, `orgulloso`, `guino`, `bostezo`, `molesto`, `escucha`, `mareado`, `festejo`, `saludo`, `animo`) |
| **F5** | Island Status States & Overlays | `f05-island-states.spec.ts` | 6 | All 11 `IslandState` values (`idle`..`remind`), `#status-text`, `#live`, lime/purple slots, SSE `island.state` |
| **F6** | Wake-Word & Natural Voice Commands | `f06-voice-wake-word.spec.ts` | 5 | `"Troko"` wake word, mic push-to-talk, live closed-island transcript bubble, voice task/focus/sleep commands |
| **F7** | Local AI Brain & Pluggable LLM | `f07-local-ai-nlu.spec.ts` | 5 | Offline ES/EN NLU via `/api/chat/command`, Ollama/OpenAI settings, fallback when unreachable, live mock OpenAI |
| **F8** | Local TTS & `"Con voz"` Toggle | `f08-tts-voice-toggle.spec.ts` | 5 | `"Con voz"` persistence (`/api/settings`), `speak` purple waveforms, silence OFF, mid-speech `cancel()`, reminder TTS |
| **F9** | First-Run `Bienvenida` & Model Download | `f09-onboarding-download.spec.ts` | 5 | `Bienvenida` modal, `Llama 3.2 3B Instruct` (`2,02 GB`), `Descargar`/`Pausar`/`Reanudar`, `Ahora no`, `Empezar` |
| **F10** | `Inicio` Home Summary & Command Bar | `f10-inicio-home.spec.ts` | 5 | `"Escribe o habla con Troko..."`, lime `↑` send, 3 KPI cards (`hábitos hoy`, `tareas pendientes`, `próximo aviso`), `ATAJOS` |
| **F11** | `Chat` Conversational History | `f11-chat-history.spec.ts` | 5 | Multi-turn thread, tool execution badges (`intent_json`), voice transcripts, reload persistence, `DELETE /api/chat` |
| **F12** | `Tareas` (Tasks, Reminders & Timers) | `f12-tareas.spec.ts` | 6 | Task CRUD + badges, one-shot SSE reminder + dismiss, recurring reminder, live SSE timer pause/resume/cancel, `/api/app/wake` catch-up |
| **F13** | `Hábitos` (Streaks, Weekly Rings & 15 Scenes) | `f13-habitos.spec.ts` | 6 | `+ Agregar` modal, `+1`/`Deshacer`, `¡Meta cumplida!` + `Mejor racha`, `S D L M X J V` rings, `Probar` nudge, all 15 SVG scenes |
| **F14** | `Enfoque` (Pomodoro Focus & Weekly Stats) | `f14-enfoque.spec.ts` | 6 | 25/5 Pomodoro, circular SVG ring, 4-dot cycle, laptop scene, collapsed `MM:SS`, `Pausar`/`+5 min`/`Terminar`/`Detener`, `HOY` & 7-day chart, reload recovery |
| **F15** | `Correo` (Unread Reader & Draft Confirmation) | `f15-correo.spec.ts` | 6 | `/api/mail/inbox`, `email_draft` peek (`Enviar`/`Descartar`/`Editar`), edit before send, confirm-before-send gate, NLU draft |
| **F16** | `Mi Mac` / Desktop Organizer (Preview + Undo) | `f16-mi-mac.spec.ts` | 6 | 8 categories (`Capturas`..`Otros`), preview without move, `Ver detalle`/`Cancelar`, `Ordenar ahora` zero-delete move, atomic `Deshacer`, collision safety |
| **F17** | Whitelisted App Launcher | `f17-app-launcher.spec.ts` | 6 | Launch whitelisted apps via UI/API/`"Abre <App>"`, multi-app launch, shell-injection rejection (API + NLU), close stage panel |
| **F18** | `Ajustes`, Memory Wipe & `Salir de Troko` | `f18-ajustes-memory.spec.ts` | 6 | AI/voice/focus settings persistence, `/api/memory/export` JSON, `/api/memory/wipe`, `Salir de Troko`, permission status & `soundEnabled` |
| **F19** | Optional Electron Notch Shell & Bridges | `f19-electron-bridges.spec.ts` | 6 | `/api/integrations` UI (`Telegram`, `Clima`, `Tavily`), enable/disable persistence, `/api/health` + `electron/` artifacts, top-center notch geometry |

---

## 6. Progressive Selector & ARIA Contract Recommendations

To keep UI and E2E tracks cleanly aligned without coupling internals, helpers in `e2e/helpers/troko.ts` target accessible ARIA roles, Spanish copy, and `PROJECT.md` IDs first, supplemented by recommended `data-testid` / `data-*` attributes:

- **Island & Avatar**: `#island[data-state][aria-expanded]`, `#panel`, `#status-text`, `#live[aria-live]`, `[data-testid="troko-avatar"][data-mood]`, `[data-testid="island-peek-card"]`, `[data-testid="transcript-bubble"]`
- **F12 (`Tareas`)**: `[data-testid="task-item"]`, `[data-testid="reminder-item"]`, `[data-testid="timer-item"]`, `[data-testid="missed-reminders-banner"]`
- **F13 (`Hábitos`)**: `[data-testid="habit-card"]`, `[data-testid="habit-scene"][data-scene="<id>"]`, `[data-testid="weekly-tracker"]`, `[data-testid="habit-celebration"]`
- **F14 (`Enfoque`)**: `[data-testid="focus-ring"]`, `[data-testid="focus-timer-display"]`, `[data-testid="focus-cycle-dots"]`, `[data-testid="focus-scene"]`, `[data-testid="focus-today-summary"]`, `[data-testid="focus-weekly-chart"]`
- **F15 (`Correo`)**: `[data-testid="mail-message-item"]`, `[data-testid="email-draft-peek"]`
- **F16 (`Mi Mac`)**: `[data-testid="desktop-loose-count"]`, `[data-testid="desktop-tidy-peek"]`, `[data-testid="desktop-category-list"]`
- **F17 (`App Launcher`)**: `[data-testid="app-launcher-grid"]`, `[data-testid="launched-app-window"]`
- **F18 (`Ajustes`)**: `[data-testid="settings-section-ai"]`, `[data-testid="settings-section-focus"]`, `[data-testid="settings-export-btn"]`, `[data-testid="settings-wipe-btn"]`, `[data-testid="exit-troko-btn"]`
- **F19 (`Integraciones`)**: `[data-testid="integration-card-telegram"]`, `[data-testid="integration-card-weather"]`, `[data-testid="integration-card-tavily"]`

---

## 7. Determinism, Clock & Browser API Boundary Policy

1. **Sequential Execution**: `workers: 1`, `fullyParallel: false` prevents SQLite lock contention and single-user global state races across specs.
2. **Per-Test State Reset**: `beforeEach` calls `resetTrokoState(api, desktopSandbox)` (`POST /api/memory/wipe` + clean temp desktop sandbox), then sets onboarding state (`completeOnboarding()` for F1–F8 & F10–F19; un-onboarded state for F9).
3. **Time & Timers**:
   - Periodic avatar blink (`~3–6s`), `5s` idle glance, and `35s` idle sleep (`Dormido`) use Playwright `page.clock.install()` + `fastForward` / `runFor` instead of brittle multi-second sleeps.
   - Live SSE countdowns (`Enfoque`, `Tareas` timers) assert strict decrement over time via `expect.poll(...)` / `toPass(...)` rather than fixed sleeps.
4. **Hardware Media Shims**: Headless Chromium inside the container has no physical microphone or audio hardware. Helpers install deterministic W3C browser API shims strictly via `page.addInitScript` on `window.SpeechRecognition`, `window.webkitSpeechRecognition`, `navigator.mediaDevices.getUserMedia`, and `window.speechSynthesis` — never mocking or patching Troko application modules.
