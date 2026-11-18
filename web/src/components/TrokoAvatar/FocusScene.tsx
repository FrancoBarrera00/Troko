import type { FocusPhase } from '../../../../shared/types.ts';

export interface FocusSceneProps {
  phase?: FocusPhase;
  isActive?: boolean;
}

export function FocusScene({ phase = 'focus', isActive = false }: FocusSceneProps) {
  return (
    <div
      className="focus-scene"
      data-testid="focus-scene"
      data-scene="focus"
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
        aria-label="Escena de enfoque de Troko en su escritorio"
      >
        <defs>
          <linearGradient id="focus-troko-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F8F4E8" />
            <stop offset="1" stopColor="#E1D8C1" />
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

        {/* Troko character behind laptop */}
        <g transform="translate(88 24)" data-prop="troko">
          <path
            d="M24 2H60Q68 2 72 10L82 42Q86 54 72 54H12Q-2 54 2 42L12 10Q16 2 24 2Z"
            fill="url(#focus-troko-grad)"
          />
          <ellipse cx="22" cy="38" rx="5" ry="2.8" fill="#F29DB0" opacity="0.8" />
          <ellipse cx="62" cy="38" rx="5" ry="2.8" fill="#F29DB0" opacity="0.8" />
          {phase === 'break' ? (
            <path
              d="M26 30Q32 22 38 30M46 30Q52 22 58 30"
              fill="none"
              stroke="#141414"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          ) : (
            <>
              <ellipse cx="32" cy="30" rx="6.2" ry="2.8" fill="#141414" />
              <ellipse cx="52" cy="30" rx="6.2" ry="2.8" fill="#141414" />
            </>
          )}
          <path
            d="M38 41Q42 44 46 41"
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
          <rect x="192" y="74" width="18" height="20" rx="3" fill="#F2EBD9" />
          <path
            d="M210 78H214A4 4 0 0 1 214 88H210"
            fill="none"
            stroke="#F2EBD9"
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
