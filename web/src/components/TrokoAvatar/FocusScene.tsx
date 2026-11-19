import { useContext } from 'react';
import type { CompanionId, FocusPhase } from '../../../../shared/types.ts';
import { NukoCompanionContext } from './TrokoAvatar.tsx';

export interface FocusSceneProps {
  phase?: FocusPhase;
  isActive?: boolean;
  companion?: CompanionId;
}

export function FocusScene({
  phase = 'focus',
  isActive = false,
  companion,
}: FocusSceneProps) {
  const ctxCompanion = useContext(NukoCompanionContext);
  const activeCompanion: CompanionId = companion ?? ctxCompanion ?? 'nuko';
  const isNuko = activeCompanion === 'nuko';

  return (
    <div
      className="focus-scene"
      data-testid="focus-scene"
      data-scene="focus"
      data-companion={activeCompanion}
      data-phase={phase}
      data-active={isActive ? 'true' : 'false'}
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '8px 0',
      }}
    >
      <svg
        viewBox="0 0 260 120"
        width="240"
        height="110"
        data-scene="focus"
        aria-label={`Escena de enfoque de ${isNuko ? 'Nuko' : 'Luma'} en su escritorio`}
      >
        <defs>
          <linearGradient id="focus-nuko-hood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#332B52" />
            <stop offset="1" stopColor="#211B36" />
          </linearGradient>
          <linearGradient id="focus-nuko-face" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F6F1E3" />
            <stop offset="1" stopColor="#E8DFC8" />
          </linearGradient>
          <radialGradient id="lamp-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#F5A623" stopOpacity="0.35" />
            <stop offset="1" stopColor="#F5A623" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Warm lamp glow */}
        <circle cx="52" cy="54" r="46" fill="url(#lamp-glow)" />

        {/* Desk surface */}
        <rect x="16" y="94" width="228" height="8" rx="4" fill="#26262B" />

        {/* Desk lamp (left) */}
        <g data-prop="lamp">
          <rect x="34" y="88" width="24" height="6" rx="3" fill="#8E8E93" />
          <path
            d="M46 88L38 56L54 42"
            fill="none"
            stroke="#8E8E93"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M46 38L64 46L52 54Z" fill="#F5A623" />
        </g>

        {/* Active companion (Nuko or Luma) behind laptop */}
        <g transform="translate(88 18)" data-prop="troko">
          {isNuko ? (
            <>
              <path
                d="M27 10Q17 2 12 5Q10 10 11 16C6 23 5 33 8 43C11 51 22 55 42 55C62 55 73 51 76 43C79 33 78 23 73 16Q74 10 72 5Q67 2 57 10C52 8 47 7.5 42 7.5C37 7.5 32 8 27 10Z"
                fill="url(#focus-nuko-hood)"
                stroke="#8B5CF6"
                strokeWidth="1.5"
              />
              <path
                d="M42 17C36 12 24 12 18 18C12 24 12 37 19 45C25 50 33 52 42 52C51 52 59 50 65 45C72 37 72 24 66 18C60 12 48 12 42 17Z"
                fill="url(#focus-nuko-face)"
              />
              <path d="M42 33L45.5 36L42 39L38.5 36Z" fill="#F5A623" />
            </>
          ) : (
            <>
              <path d="M32 12C29 4 24 0 21 -1" fill="none" stroke="#8E8E93" strokeWidth="2" strokeLinecap="round" />
              <path d="M52 12C55 4 60 0 63 -1" fill="none" stroke="#8E8E93" strokeWidth="2" strokeLinecap="round" />
              <circle cx="21" cy="-1" r="3.2" fill="#B6F23A" />
              <circle cx="63" cy="-1" r="3.2" fill="#B6F23A" />
              <path
                d="M42 10C25 10 13 21 13 36C13 48 24 55 42 55C60 55 71 48 71 36C71 21 59 10 42 10Z"
                fill="url(#focus-nuko-face)"
                stroke="#B6F23A"
                strokeWidth="1.5"
              />
            </>
          )}
          <ellipse cx="22" cy="38" rx="4.5" ry="2.6" fill="#F29DB0" opacity="0.78" />
          <ellipse cx="62" cy="38" rx="4.5" ry="2.6" fill="#F29DB0" opacity="0.78" />
          {phase === 'break' ? (
            <path
              d="M25 30Q31 22 37 30M47 30Q53 22 59 30"
              fill="none"
              stroke="#141414"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          ) : (
            <>
              <ellipse cx="31" cy="30" rx="5.8" ry="2.7" fill="#141414" />
              <ellipse cx="53" cy="30" rx="5.8" ry="2.7" fill="#141414" />
            </>
          )}
          <path
            d="M38 42Q42 45 46 42"
            fill="none"
            stroke="#141414"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </g>

        {/* Laptop in center */}
        <g data-prop="laptop">
          <rect
            x="98"
            y="60"
            width="64"
            height="34"
            rx="5"
            fill="#1B1B1F"
            stroke="#B6F23A"
            strokeWidth="1.5"
          />
          <circle cx="130" cy="77" r="4.5" fill="#B6F23A" opacity={isActive ? 0.95 : 0.5} />
          <rect x="90" y="91" width="80" height="4" rx="2" fill="#8E8E93" />
        </g>

        {/* Mug on right */}
        <g data-prop="mug">
          <rect x="192" y="74" width="18" height="20" rx="3" fill="#F6F1E3" />
          <path
            d="M210 78H214A4 4 0 0 1 214 88H210"
            fill="none"
            stroke="#F6F1E3"
            strokeWidth="2.4"
          />
          <path
            d="M198 69Q200 64 198 59M204 69Q206 64 204 59"
            fill="none"
            stroke="#8E8E93"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </g>
      </svg>
    </div>
  );
}
