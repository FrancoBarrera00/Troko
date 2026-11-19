import { useContext } from 'react';
import type { CompanionId, HabitSceneId } from '../../../../shared/types.ts';
import { NukoCompanionContext } from './TrokoAvatar.tsx';

export const HABIT_SCENE_META: Record<
  HabitSceneId,
  { label: string; defaultGoal: number; defaultUnit: string }
> = {
  water: { label: 'Agua', defaultGoal: 8, defaultUnit: 'vasos' },
  book: { label: 'Lectura', defaultGoal: 20, defaultUnit: 'páginas' },
  dumbbell: { label: 'Ejercicio', defaultGoal: 3, defaultUnit: 'series' },
  sun: { label: 'Sol', defaultGoal: 15, defaultUnit: 'min' },
  laptop: { label: 'Trabajo profundo', defaultGoal: 4, defaultUnit: 'bloques' },
  sleep: { label: 'Sueño', defaultGoal: 8, defaultUnit: 'horas' },
  walk: { label: 'Caminar', defaultGoal: 6, defaultUnit: 'km' },
  stretch: { label: 'Estirar', defaultGoal: 10, defaultUnit: 'min' },
  journal: { label: 'Diario', defaultGoal: 1, defaultUnit: 'entrada' },
  music: { label: 'Música', defaultGoal: 20, defaultUnit: 'min' },
  cook: { label: 'Cocinar sano', defaultGoal: 2, defaultUnit: 'comidas' },
  clean: { label: 'Ordenar', defaultGoal: 1, defaultUnit: 'sesión' },
  study: { label: 'Estudiar', defaultGoal: 30, defaultUnit: 'min' },
  detox: { label: 'Sin pantallas', defaultGoal: 2, defaultUnit: 'horas' },
  breathe: { label: 'Respiración', defaultGoal: 5, defaultUnit: 'min' },
};

const MINI_NUKO_HOOD =
  'M19 10Q12 4 8 6Q6 10 8 15C4 20 3 29 5 36C7 42 15 45 30 45C45 45 53 42 55 36C57 29 56 20 52 15Q54 10 52 6Q48 4 41 10C37 8.5 33 8 30 8C27 8 23 8.5 19 10Z';
const MINI_NUKO_DISC =
  'M30 15C25 11.5 16 11.5 11.5 16C7 20.5 7 31 12.5 37C17 41 23 42.5 30 42.5C37 42.5 43 41 47.5 37C53 31 53 20.5 48.5 16C44 11.5 35 11.5 30 15Z';
const MINI_LUMA_BODY =
  'M30 9C17 9 8 18 8 30C8 40 16 45 30 45C44 45 52 40 52 30C52 18 43 9 30 9Z';

export function HabitSceneSvg({
  sceneId,
  size = 56,
  companion,
}: {
  sceneId: HabitSceneId;
  size?: number;
  companion?: CompanionId;
}) {
  const ctxCompanion = useContext(NukoCompanionContext);
  const activeCompanion: CompanionId = companion ?? ctxCompanion ?? 'nuko';
  const isNuko = activeCompanion === 'nuko';

  return (
    <span
      className="habit-scene-wrap"
      data-scene={sceneId}
      data-companion={activeCompanion}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <svg
        viewBox="0 0 80 56"
        width={size}
        height={Math.round(size * 0.7)}
        data-scene={sceneId}
        aria-label={HABIT_SCENE_META[sceneId]?.label ?? sceneId}
      >
        {/* Base Nuko or Luma mini companion */}
        {isNuko ? (
          <>
            <path d={MINI_NUKO_HOOD} fill="#2B2444" stroke="#8B5CF6" strokeWidth="1.3" />
            <path d={MINI_NUKO_DISC} fill="#F6F1E3" />
            <path d="M30 28L32.4 30.2L30 32.5L27.6 30.2Z" fill="#F5A623" />
          </>
        ) : (
          <>
            <path d="M22 10L16 3M38 10L44 3" stroke="#8E8E93" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="16" cy="3" r="2.3" fill="#B6F23A" />
            <circle cx="44" cy="3" r="2.3" fill="#B6F23A" />
            <path d={MINI_LUMA_BODY} fill="#FAF6EA" stroke="#B6F23A" strokeWidth="1.3" />
          </>
        )}
        <circle cx="22" cy="26" r="3.8" fill="#141414" />
        <circle cx="38" cy="26" r="3.8" fill="#141414" />
        <path
          d="M26 35.5Q30 38.5 34 35.5"
          fill="none"
          stroke="#141414"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {sceneId === 'water' && (
          <g data-prop="water-glass">
            <path d="M60 16H74L72 44H62Z" fill="#58B2FF" opacity="0.85" />
            <path d="M58 14L65 24" stroke="#B6F23A" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="67" cy="34" r="2" fill="#FFFFFF" />
          </g>
        )}

        {sceneId === 'book' && (
          <g data-prop="open-book">
            <path
              d="M54 20Q63 17 66 22Q69 17 78 20V42Q69 39 66 44Q63 39 54 42Z"
              fill="#8B5CF6"
            />
            <line x1="66" y1="22" x2="66" y2="44" stroke="#F6F1E3" strokeWidth="1.6" />
          </g>
        )}

        {sceneId === 'dumbbell' && (
          <g data-prop="dumbbell">
            <rect x="55" y="12" width="5" height="14" rx="2" fill="#B6F23A" />
            <rect x="72" y="12" width="5" height="14" rx="2" fill="#B6F23A" />
            <line x1="60" y1="19" x2="72" y2="19" stroke="#8E8E93" strokeWidth="3.2" />
            <path d="M16 18H44" stroke="#FF5A5F" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}

        {sceneId === 'sun' && (
          <g data-prop="sun-glasses">
            <rect x="17" y="22" width="11" height="7" rx="1.5" fill="#0E0E10" />
            <rect x="32" y="22" width="11" height="7" rx="1.5" fill="#0E0E10" />
            <line x1="28" y1="25" x2="32" y2="25" stroke="#0E0E10" strokeWidth="2" />
            <circle cx="67" cy="16" r="7" fill="#F5A623" />
            <path
              d="M67 5V8M67 24V27M56 16H59M75 16H78"
              stroke="#F5A623"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        )}

        {sceneId === 'laptop' && (
          <g data-prop="mini-laptop">
            <rect x="54" y="22" width="22" height="15" rx="2.5" fill="#1B1B1F" stroke="#B6F23A" strokeWidth="1.5" />
            <rect x="51" y="37" width="28" height="3" rx="1.5" fill="#8E8E93" />
            <circle cx="65" cy="29.5" r="2.2" fill="#B6F23A" />
          </g>
        )}

        {sceneId === 'sleep' && (
          <g data-prop="night-cap">
            <path d="M18 9L34 1L44 10Z" fill="#8B5CF6" />
            <circle cx="35" cy="2" r="2.8" fill="#F6F1E3" />
            <path d="M64 12A8 8 0 1 0 74 24A6 6 0 1 1 64 12Z" fill="#F5A623" />
          </g>
        )}

        {sceneId === 'walk' && (
          <g data-prop="sneaker-steps">
            <ellipse cx="18" cy="48" rx="6" ry="3" fill="#B6F23A" />
            <ellipse cx="42" cy="48" rx="6" ry="3" fill="#B6F23A" />
            <path d="M60 36L66 22L72 36Z" fill="#2ECC71" />
            <rect x="64.5" y="36" width="3" height="8" fill="#8E8E93" />
          </g>
        )}

        {sceneId === 'stretch' && (
          <g data-prop="stretch-arcs">
            <path
              d="M6 26Q2 12 16 6M54 26Q58 12 44 6"
              fill="none"
              stroke="#B6F23A"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <circle cx="67" cy="28" r="7" fill="none" stroke="#8B5CF6" strokeWidth="2.2" />
          </g>
        )}

        {sceneId === 'journal' && (
          <g data-prop="notebook-pen">
            <rect x="56" y="16" width="18" height="26" rx="2" fill="#F6F1E3" stroke="#8E8E93" strokeWidth="1.4" />
            <line x1="60" y1="23" x2="70" y2="23" stroke="#141414" strokeWidth="1.5" />
            <line x1="60" y1="29" x2="70" y2="29" stroke="#141414" strokeWidth="1.5" />
            <path d="M52 38L64 14" stroke="#F5A623" strokeWidth="2.6" strokeLinecap="round" />
          </g>
        )}

        {sceneId === 'music' && (
          <g data-prop="headphones">
            <path
              d="M11 26A19 19 0 0 1 49 26"
              fill="none"
              stroke="#8B5CF6"
              strokeWidth="3.2"
            />
            <rect x="7" y="22" width="5" height="11" rx="2.5" fill="#8B5CF6" />
            <rect x="48" y="22" width="5" height="11" rx="2.5" fill="#8B5CF6" />
            <text x="62" y="26" fill="#B6F23A" fontSize="15" fontWeight="700">
              ♪
            </text>
          </g>
        )}

        {sceneId === 'cook' && (
          <g data-prop="chef-hat-bowl">
            <path d="M20 8C18 2 25 1 30 3C35 1 42 2 40 8Z" fill="#FFFFFF" />
            <path d="M56 30H76A10 10 0 0 1 56 30Z" fill="#FF5A5F" />
            <circle cx="63" cy="28" r="3" fill="#B6F23A" />
            <circle cx="69" cy="28" r="3" fill="#2ECC71" />
          </g>
        )}

        {sceneId === 'clean' && (
          <g data-prop="sparkles-broom">
            <line x1="58" y1="12" x2="70" y2="38" stroke="#F5A623" strokeWidth="2.6" />
            <path d="M65 36L75 34L73 44L63 44Z" fill="#B6F23A" />
            <path d="M62 10L64 14L68 16L64 18L62 22L60 18L56 16L60 14Z" fill="#58B2FF" />
          </g>
        )}

        {sceneId === 'study' && (
          <g data-prop="grad-cap">
            <polygon points="30,1 48,7 30,13 12,7" fill="#1B1B1F" stroke="#B6F23A" strokeWidth="1.2" />
            <line x1="46" y1="8" x2="48" y2="18" stroke="#F5A623" strokeWidth="2" />
            <rect x="58" y="20" width="16" height="22" rx="2" fill="#58B2FF" />
          </g>
        )}

        {sceneId === 'detox' && (
          <g data-prop="phone-off">
            <rect x="58" y="14" width="15" height="26" rx="3" fill="#1B1B1F" stroke="#FF5A5F" strokeWidth="1.6" />
            <line x1="55" y1="12" x2="76" y2="42" stroke="#FF5A5F" strokeWidth="2.6" strokeLinecap="round" />
          </g>
        )}

        {sceneId === 'breathe' && (
          <g data-prop="zen-aura">
            <circle
              cx="30"
              cy="26"
              r="24"
              fill="none"
              stroke="#58B2FF"
              strokeWidth="1.6"
              strokeDasharray="4 3"
            />
            <path
              d="M58 28Q66 20 74 28Q66 36 58 28Z"
              fill="#B6F23A"
              opacity="0.85"
            />
          </g>
        )}
      </svg>
    </span>
  );
}
