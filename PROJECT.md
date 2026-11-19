# Project: Nuko Desk (Complete Rebrand + Dual Companions Nuko & Luma)

## Architecture
- **Monorepo**: Root `nuko-desk` (`com.nuko.desk`, `Nuko-Desk`) with workspaces `server` (`@nuko/server`), `web` (`@nuko/web`), `electron` (`@nuko/electron`), and `e2e` (`nuko-e2e`), plus shared TypeScript contracts in `shared/`.
- **Data Persistence**:
  - **SQLite WAL (`nuko.db`)**: Strictly preserves the **15 `EXPECTED_TABLES`** invariant (`conversations`, `desktop_tidy_batches`, `desktop_tidy_moves`, `email_drafts`, `email_messages`, `focus_sessions`, `habit_logs`, `habits`, `integrations`, `messages`, `model_downloads`, `reminders`, `settings`, `tasks`, `timers`).
  - **JSON Sidecars** (resolved in `path.dirname(dbPath)`): `nuko-progression.json` (Option A independent per-companion XP), `nuko-guardian.json`, `nuko-study.json`, `nuko-focus-assistant.json`, `quick-notes.json`.
  - **Automatic Legacy Migration**: WAL-safe idempotent startup migration copies `troko.db` (+ `-wal`/`-shm`) → `nuko.db` and `troko-*.json` → `nuko-*.json` when targets do not yet exist (both same-dir in `server/src/app.ts` and `Troko-Desk` → `Nuko-Desk` `userData` in `electron/main.ts`), plus SQLite `settings.wakeWord === 'Troko'` → `'Nuko'` (preserving custom wake words).
- **Frontend & Dual Companion Engine**:
  - Single `NukoCompanionContext` (`{ companion: CompanionId; accessory: NukoAccessoryId }`) in `web/src/App.tsx` drives `NukoAvatar` (both **Nuko** owl-spirit and **Luma** bioluminescent firefly), `FocusScene`, and all 15 `HabitScenes` live across the Dynamic Island (`IslandBar`), expanded side panel (`IslandPanel`), `BienvenidaModal`, `EnfoqueTab`, and `BreakCoachCard`.
  - OLED Dark Studio palette (`#000000`, `--ivory: #F6F1E3`, `--hood: #2B2444`, `--purple: #8B5CF6`, `--lime: #B6F23A`) and unified Rioplatense voseo Spanish tone across all user-facing copy.

## Code Layout
- `shared/` — `types.ts`, `validators.ts` (shared moods, accessories, companion IDs, API payloads)
- `server/src/` — `index.ts`, `app.ts`, `db/{database.ts,schema.ts}`, `routes/`, `services/`
- `server/tests/` — `m1.storage.test.ts` .. `m8.focus-assistant.test.ts`, `m9.nuko-companions.test.ts` (`node --test`)
- `web/` — `index.html`, `public/favicon.svg`, `src/styles/tokens.css`, `src/api/client.ts`, `src/env.d.ts`, `src/hooks/`, `src/components/NukoAvatar/{NukoAvatar.tsx,FocusScene.tsx,HabitScenes.tsx}`, `src/components/Island/`, `src/components/Tabs/`, `src/components/DesktopStage/`
- `electron/` — `main.ts`, `preload.ts`, `assets/{icon.png,tray-icon.png}`
- `e2e/` — `playwright.config.ts`, `helpers/nuko.ts`, `tests/tier1..tier4/`
- Reference design docs (read-only, do NOT delete): `docs/rebrand-proposal/REBRAND_PLAN.md`, `docs/rebrand-proposal/index.html`

## Feature Inventory
Every Survey feature is assigned to one or more milestones (none unassigned).

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Product Name & App ID | Rebrand to **Nuko Desk**, `appId: com.nuko.desk`, `productName: Nuko-Desk` | M4 | survey |
| 2 | Monorepo Package Names | `nuko-desk`, `@nuko/web`, `@nuko/server`, `@nuko/electron`, `nuko-e2e` | M4, E2E | survey |
| 3 | OLED Dark Studio Palette | `#000000`, `--ivory`/`--cream: #F6F1E3`, `--ivory-2: #E8DFC8`, `--hood: #2B2444`, `--purple: #8B5CF6`, `--lime: #B6F23A`, updated `--line` | M2 | survey |
| 4 | Typography | `Bricolage Grotesque` + `JetBrains Mono` (`tabular-nums`) | M2 | survey |
| 5 | Dual Companions: Nuko & Luma | Both 100% original SVG mascots (`nuko` default owl-spirit + `luma` bioluminescent firefly) in `NukoAvatar.tsx` (`viewBox="-6 -14 112 88"`) | M2 | survey |
| 6 | 12 Idle Emotions (`NUKO_MOODS`) | `contento`, `enamorado`, `sorpresa`, `orgulloso`, `guino`, `bostezo`, `molesto`, `escucha`, `mareado`, `festejo`, `saludo`, `animo` for both Nuko & Luma | M1, M2 | survey |
| 7 | 11 Dynamic Island States | `idle`, `listen`, `think`, `speak`, `alert`, `attentive`, `notification`, `sleep`, `focus`, `success`, `remind` for both Nuko & Luma | M2 | survey |
| 8 | 6 XP Unlockable Accessories | Lv.1 `none` .. Lv.6 `halo` calibrated cleanly for both Nuko & Luma (antennae clearance) | M1, M2 | survey |
| 9 | Eye / Gaze Tracking & Blinking | `.nuko`, `.nuko__body`, `.nuko__eyes`, `--gx`/`--gy`/`--by`, `[data-testid="nuko-avatar"]`, reduced motion | M2, M3 | survey |
| 10 | `FocusScene.tsx` | Redesigned desk focus scene supporting active companion (`nuko` or `luma`) | M2 | survey |
| 11 | 15 `HabitScenes.tsx` | All 15 habit mini-scenes redesigned for Nuko & Luma preserving `data-prop="*"` | M2 | survey |
| 12 | Electron PNG Icons & SVG Favicon | `electron/assets/icon.png` (`256×256`), `tray-icon.png` (`32×32`) via `rsvg-convert`; `web/public/favicon.svg` + `web/index.html` link | M2 | survey |
| 13 | Companion Selector & Live Updates | **Nuko / Luma** selector in `BienvenidaModal` and `EnfoqueTab` Level & Accessories card; live avatar + name in Dynamic Island & side panel | M3 | survey |
| 14 | Independent Per-Companion Progression (Option A) | Separate XP, level, focusStreakBlocks, totalFocusCleanBlocks, totalStudyBlocksMastered, totalQuizzesCorrect, unlocked & equipped accessories for `nuko` & `luma` in `nuko-progression.json` | M1 | survey |
| 15 | `GET /api/progression` Response Shape | Returns `{ ok: true, activeCompanion, progression, companions: { nuko, luma }, catalog }` with top-level `progression` mirroring active companion | M1 | survey |
| 16 | `POST /api/progression/companion` | Switches active companion (`{ companion: 'nuko' \| 'luma' }`), persists, emits `data.updated`, 400 on invalid | M1 | survey |
| 17 | XP Crediting Rules | All 6 XP award sites (focus, PDF master, quiz, Feynman, spaced repetition, habit) + `breakFocusStreak()` credit/affect active companion; `FocusAssistantService` aggregates clean blocks across both companions | M1 | survey |
| 18 | Legacy Progression Migration & Wipe | Flat `troko-progression.json` migrates into `companions.nuko` (Luma fresh); `/api/memory/wipe` resets both companions & `activeCompanion: 'nuko'` | M1 | survey |
| 19 | Wake Word `"Nuko"` + Dual NLU (`"Nuko"` & `"Luma"`) | Default `settings.wakeWord: 'Nuko'`; NLU & voice hook accept both `"Nuko"` and `"Luma"` (+ custom `wakeWord`) | M1, M3 | survey |
| 20 | Rioplatense Voseo Unification | Unify UI, onboarding, chat/NLU, AI prompts, alerts, and tray strings to Rioplatense voseo (*"Tenés"*, *"Mirá"*, *"Estacioná"*, *"Anotame"*, *"Elegí"*) | M1, M3, M4 | survey |
| 21 | 15 SQLite WAL Tables Invariant | Strictly preserve `EXPECTED_TABLES` (15 tables, WAL mode, FK ON) | M1 | survey |
| 22 | Automatic Legacy Data Migration | WAL-safe copy of `troko.db` (+ `-wal`/`-shm`), 4 `troko-*.json` sidecars, `quick-notes.json` (Electron `Troko-Desk` → `Nuko-Desk`), `settings.wakeWord` migration | M1, M4 | survey |
| 23 | Environment Variable Fallbacks | Support `NUKO_*` with fallback to `TROKO_*` across server & Electron | M1, M4 | survey |
| 24 | Focus Guardian Self-Exclusion | Exclude `'nuko'` & `'luma'` window titles from distraction alerts | M1 | survey |
| 25 | Atomic Electron IPC & Bridge Rename | Rename 9 IPC channels (`nuko:*`), `window.nukoElectron`, `html.nuko-electron`, `createNukoNotchWindowConfig`, `NukoWin32` | M4 | survey |
| 26 | Symbol & File Renames | `NukoAvatar/`, `NUKO_MOODS`, `NUKO_ACCESSORY_IDS`, `NukoDatabase`, `NukoApp`, `useNukoEvents.ts`, `e2e/helpers/nuko.ts`, `data-testid="nuko-avatar"` | M1, M2, M3, M4 | survey |
| 27 | Tests, Docs & Build Gates | Update all tests + add dual-companion/Option A tests; update docs; pass `npm run typecheck`, `npm test`, `npm run electron:build`, E2E Tiers 1–5 | M1, M4, M5, E2E | survey |

## Milestones

| # | Name | Scope | Dependencies | Status | Sub-Orch Conv ID |
|---|------|-------|-------------|--------|-----------------|
| M1 | Shared Contracts, Backend Option A Progression, Migration, NLU & Voseo | `shared/`, `server/src/`, `server/tests/` (incl. new `m9.nuko-companions.test.ts`) | none | IN_PROGRESS | c533baac1090fc00aeec8c2cf498cfb7 |
| M2 | Dual Mascot SVG Engine, Scenes, OLED Tokens & Visual Assets | `web/src/components/NukoAvatar/`, `web/src/styles/tokens.css`, `web/public/favicon.svg`, `web/index.html`, `electron/assets/{icon,tray-icon}.png` | M1 | PLANNED | — |
| M3 | Frontend Companion Selector, Live Island/Panel, API Client & Voseo | `web/src/` (API client, hooks, `App.tsx`, `BienvenidaModal`, `EnfoqueTab`, `IslandBar`, `IslandPanel`, `DesktopStage`, all tabs voseo, delete `TrokoAvatar/`, remove temp `@deprecated` aliases from `shared/`) | M1, M2 | PLANNED | — |
| M4 | Electron Shell, Atomic IPC Rename, Packaging & Legacy `userData` Migration | `package.json`, `{server,web,electron}/package.json`, `electron/{main,preload}.ts`, `web/src/env.d.ts` + Electron bridge callers, Electron tests (`m5`/`m6`/`m7`), `README.md`, residual `troko` audit | M3 | PLANNED | — |
| E2E | E2E Testing Track (Parallel) | `e2e/` (`package.json`, `playwright.config.ts`, `helpers/nuko.ts`, Tiers 1–4 specs), `TEST_INFRA.md`, `TEST_READY.md` | none | IN_PROGRESS | 54d79aa5f7861223c2436a2fd53664d5 |
| M5 | Final Milestone: E2E Tiers 1–4 Pass + Tier 5 Adversarial Hardening | Pass 100% E2E Tiers 1–4 + Tier 5 adversarial hardening + final `typecheck`/`test`/`electron:build` verification | M4, E2E | PLANNED | — |

## Interface Contracts

### `shared/types.ts` ↔ `server/` ↔ `web/`
```ts
export const COMPANION_IDS = ['nuko', 'luma'] as const;
export type CompanionId = (typeof COMPANION_IDS)[number];

export const NUKO_MOODS = [
  'contento', 'enamorado', 'sorpresa', 'orgulloso', 'guino', 'bostezo',
  'molesto', 'escucha', 'mareado', 'festejo', 'saludo', 'animo',
] as const;
export type NukoMood = (typeof NUKO_MOODS)[number];

export const NUKO_ACCESSORY_IDS = [
  'none', 'glasses', 'headphones', 'headband', 'crown', 'halo',
] as const;
export type NukoAccessoryId = (typeof NUKO_ACCESSORY_IDS)[number];

export interface CompanionProgressionMap {
  nuko: ProgressionState;
  luma: ProgressionState;
}

export interface ProgressionApiResponse {
  ok: true;
  activeCompanion: CompanionId;
  progression: ProgressionState; // mirrors companions[activeCompanion]
  companions: CompanionProgressionMap;
  catalog: AccessoryCatalogItem[]; // unlocked booleans reflect activeCompanion's level
}
```
*(M1 keeps temporary `@deprecated` re-exports `TROKO_MOODS`, `TrokoMood`, `TROKO_ACCESSORY_IDS`, `TrokoAccessoryId`, `isTrokoMood` so `web/` stays green until M3 deletes them.)*

### Progression HTTP API (`server/src/routes/studyGuardian.ts` ↔ `web/src/api/client.ts`)
- `GET /api/progression` → `200 ProgressionApiResponse`
- `POST /api/progression/companion` with `{ companion: 'nuko' | 'luma' }` → `200 ProgressionApiResponse` (persists to `nuko-progression.json`, emits SSE `data.updated` with `{ scope: 'progression' }`; returns `400` if `companion` is not `'nuko'` or `'luma'`)
- `POST /api/progression/equip` with `{ accessory: NukoAccessoryId }` → equips on `activeCompanion`, returns `{ ok: true, activeCompanion, progression, companions, catalog }` (`403` with Rioplatense voseo message if locked for active companion)
- `POST /api/memory/wipe` → resets `activeCompanion` to `'nuko'` and resets both `companions.nuko` and `companions.luma` to 0 XP / Lv.1 / `'none'`

### Electron IPC (`electron/main.ts` ↔ `electron/preload.ts` ↔ `web/src/env.d.ts`)
- `NUKO_IPC_CHANNELS`: `nuko:set-interactive`, `nuko:hide`, `nuko:quit`
- `NUKO_DESKTOP_IPC_CHANNELS`: `nuko:get-desktop-info`, `nuko:set-auto-launch`, `nuko:notify`, `nuko:open-external`, `nuko:summoned`, `nuko:get-active-window`
- Preload bridge: `window.nukoElectron`
- DOM class: `html.nuko-electron`

### Avatar DOM Contract (`web/src/components/NukoAvatar/NukoAvatar.tsx` ↔ `useGazeTracking.ts` ↔ `e2e/`)
- `<svg viewBox="-6 -14 112 88" className="nuko ..." data-testid="nuko-avatar" data-companion="nuko|luma" data-mood="..." data-state="..." data-expression="..." data-accessory="...">`
- Companion selector testids:
  - Welcome modal: `data-testid="welcome-companion-nuko"`, `data-testid="welcome-companion-luma"`
  - Enfoque progression card: `data-testid="enfoque-companion-nuko"`, `data-testid="enfoque-companion-luma"`
- Exit / Reopen buttons: `data-testid="exit-nuko-btn"`, `data-testid="reopen-nuko-btn"`
