import { createContext, useContext, useEffect, useId, useRef } from 'react';
import type { IslandState, TrokoAccessoryId, TrokoMood } from '../../../../shared/types.ts';

export const TrokoAccessoryContext = createContext<TrokoAccessoryId>('none');

export interface TrokoAvatarProps {
  size?: 'sm' | 'lg' | 'xl';
  mood: TrokoMood;
  state: IslandState;
  accessory?: TrokoAccessoryId;
  registerHead?: (el: SVGSVGElement | null) => () => void;
  className?: string;
}

const SIZE_DIMS: Record<'sm' | 'lg' | 'xl', { width: number; height: number }> = {
  sm: { width: 34, height: 26 },
  lg: { width: 74, height: 54 },
  xl: { width: 112, height: 82 },
};

const BODY_PATH =
  'M29 2H71Q80 2 84 11L97 46Q102 62 85 62H15Q-2 62 3 46L16 11Q20 2 29 2Z';

export function TrokoAvatar({
  size = 'sm',
  mood,
  state,
  accessory,
  registerHead,
  className = '',
}: TrokoAvatarProps) {
  const ctxAccessory = useContext(TrokoAccessoryContext);
  const activeAccessory: TrokoAccessoryId = accessory ?? ctxAccessory ?? 'none';
  const uid = useId().replace(/:/g, '');
  const gradId = `tk-grad-${uid}`;
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!registerHead) return;
    return registerHead(svgRef.current);
  }, [registerHead]);

  const dims = SIZE_DIMS[size];
  const activeExpression = state === 'idle' ? mood : state;

  return (
    <svg
      ref={svgRef}
      viewBox="-6 -14 112 88"
      width={dims.width}
      height={dims.height}
      aria-hidden="true"
      data-testid="troko-avatar"
      data-mood={mood}
      data-state={state}
      data-expression={activeExpression}
      data-accessory={activeAccessory}
      className={`troko ${className}`.trim()}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F8F4E8" />
          <stop offset="1" stopColor="#E1D8C1" />
        </linearGradient>
      </defs>

      <g className="troko__body" data-layer="body">
        <path
          d={BODY_PATH}
          fill={`url(#${gradId})`}
          stroke="rgba(20, 20, 20, 0.14)"
          strokeWidth="1"
        />
      </g>

      <g className="troko__blush" data-layer="blush" opacity="0.8">
        <ellipse cx="25" cy="44" rx="6" ry="3.4" fill="#F29DB0" />
        <ellipse cx="75" cy="44" rx="6" ry="3.4" fill="#F29DB0" />
      </g>

      {/* State-specific non-idle expressions */}
      {state === 'listen' && (
        <g className="troko__eyes" data-layer="eyes">
          <g transform="translate(50 33) scale(1.16) translate(-50 -33)">
            <circle cx="38" cy="33" r="7.4" fill="#141414" />
            <circle cx="62" cy="33" r="7.4" fill="#141414" />
            <circle cx="35.6" cy="30.5" r="2.2" fill="#FFFFFF" opacity="0.85" />
            <circle cx="59.6" cy="30.5" r="2.2" fill="#FFFFFF" opacity="0.85" />
          </g>
          <path
            d="M89 24Q96 32 89 40M94 20Q103 32 94 44"
            fill="none"
            stroke="#B6F23A"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>
      )}

      {state === 'think' && (
        <g className="troko__eyes" data-layer="eyes">
          <g transform="translate(0 -4)">
            <circle cx="38" cy="31" r="6.2" fill="#141414" />
            <circle cx="62" cy="31" r="6.2" fill="#141414" />
          </g>
          <path
            d="M44 47Q50 45 56 47"
            fill="none"
            stroke="#141414"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>
      )}

      {state === 'speak' && (
        <g className="troko__eyes" data-layer="eyes">
          <g className="troko__talk-eyes">
            <circle cx="38" cy="32" r="7.2" fill="#141414" />
            <circle cx="62" cy="32" r="7.2" fill="#141414" />
          </g>
          <ellipse cx="50" cy="48" rx="5.2" ry="4.2" fill="#141414" />
          <ellipse cx="50" cy="49.5" rx="3" ry="1.6" fill="#F29DB0" />
        </g>
      )}

      {state === 'alert' && (
        <g className="troko__eyes" data-layer="eyes">
          <g data-layer="brows">
            <path
              d="M28 23L45 28M72 23L55 28"
              fill="none"
              stroke="#141414"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          </g>
          <circle cx="38" cy="34" r="6.8" fill="#141414" />
          <circle cx="62" cy="34" r="6.8" fill="#141414" />
          <path
            d="M43 49Q50 45 57 49"
            fill="none"
            stroke="#141414"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <g transform="translate(87 -2)">
            <circle cx="0" cy="6" r="8" fill="#FF5A5F" />
            <path
              d="M0 1.5V6.5M0 9.5V10.5"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </g>
        </g>
      )}

      {state === 'attentive' && (
        <g className="troko__eyes" data-layer="eyes">
          <circle cx="38" cy="33" r="6.8" fill="#141414" />
          <circle cx="62" cy="32" r="8.6" fill="#141414" />
          <path
            d="M44 47Q50 49 56 46"
            fill="none"
            stroke="#141414"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>
      )}

      {state === 'notification' && (
        <g className="troko__eyes" data-layer="eyes">
          <circle cx="38" cy="33" r="7.4" fill="#141414" />
          <circle cx="62" cy="33" r="7.4" fill="#141414" />
          <circle cx="35.6" cy="30.5" r="2.2" fill="#FFFFFF" />
          <circle cx="59.6" cy="30.5" r="2.2" fill="#FFFFFF" />
          <path
            d="M44 46Q50 51 56 46"
            fill="none"
            stroke="#141414"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <g stroke="#B6F23A" strokeWidth="2.4" strokeLinecap="round">
            <path className="troko__ray" d="M84 6L91 -1" />
            <path className="troko__ray" d="M89 12L99 9" />
            <path className="troko__ray" d="M77 2L80 -6" />
          </g>
        </g>
      )}

      {state === 'sleep' && (
        <g className="troko__eyes" data-layer="lines">
          <path
            d="M30 35H46M54 35H70"
            fill="none"
            stroke="#141414"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M46 47Q50 49 54 47"
            fill="none"
            stroke="#141414"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </g>
      )}

      {state === 'focus' && (
        <g className="troko__eyes" data-layer="squint">
          <ellipse cx="38" cy="35" rx="7.6" ry="3" fill="#141414" />
          <ellipse cx="62" cy="35" rx="7.6" ry="3" fill="#141414" />
          <path
            d="M45 47H55"
            fill="none"
            stroke="#141414"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>
      )}

      {state === 'success' && (
        <g className="troko__eyes" data-layer="arcs">
          <path
            d="M29 38Q37 25 45 38M55 38Q63 25 71 38"
            fill="none"
            stroke="#141414"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M43 46Q50 52 57 46"
            fill="none"
            stroke="#141414"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </g>
      )}

      {state === 'remind' && (
        <g className="troko__eyes" data-layer="eyes">
          <circle cx="38" cy="33" r="7.4" fill="#141414" />
          <circle cx="62" cy="33" r="7.4" fill="#141414" />
          <circle cx="35.6" cy="30.5" r="2.2" fill="#FFFFFF" />
          <circle cx="59.6" cy="30.5" r="2.2" fill="#FFFFFF" />
          <path
            d="M44 46Q50 51 56 46"
            fill="none"
            stroke="#141414"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="88" cy="6" r="5" fill="#58B2FF" />
        </g>
      )}

      {/* Idle 12 Moods */}
      {state === 'idle' && mood === 'contento' && (
        <g className="troko__eyes" data-layer="eyes">
          <circle cx="38" cy="33" r="7.4" fill="#141414" />
          <circle cx="62" cy="33" r="7.4" fill="#141414" />
          <circle cx="35.5" cy="30.4" r="2.1" fill="#FFFFFF" opacity="0.7" />
          <circle cx="59.5" cy="30.4" r="2.1" fill="#FFFFFF" opacity="0.7" />
          <path
            d="M44 46Q50 50.5 56 46"
            fill="none"
            stroke="#141414"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </g>
      )}

      {state === 'idle' && mood === 'enamorado' && (
        <g className="troko__eyes" data-layer="hearts">
          <path
            data-particle="heart"
            d="M38 40C38 40 29 34 29 28.5C29 25.5 31.5 23.5 34 23.5C35.8 23.5 37.2 24.5 38 26C38.8 24.5 40.2 23.5 42 23.5C44.5 23.5 47 25.5 47 28.5C47 34 38 40 38 40Z"
            fill="#FF5A5F"
          />
          <path
            data-particle="heart"
            d="M62 40C62 40 53 34 53 28.5C53 25.5 55.5 23.5 58 23.5C59.8 23.5 61.2 24.5 62 26C62.8 24.5 64.2 23.5 66 23.5C68.5 23.5 71 25.5 71 28.5C71 34 62 40 62 40Z"
            fill="#FF5A5F"
          />
          <path
            data-particle="heart"
            d="M86 12C86 12 81 8.5 81 5.5C81 3.8 82.4 2.5 84 2.5C85 2.5 85.7 3 86 3.8C86.3 3 87 2.5 88 2.5C89.6 2.5 91 3.8 91 5.5C91 8.5 86 12 86 12Z"
            fill="#FF5A5F"
          />
          <path
            d="M43 46Q50 52 57 46"
            fill="none"
            stroke="#141414"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </g>
      )}

      {state === 'idle' && mood === 'sorpresa' && (
        <g className="troko__eyes" data-layer="eyes">
          <g data-layer="brows">
            <path
              d="M31 20Q38 16 45 20M55 20Q62 16 69 20"
              fill="none"
              stroke="#141414"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </g>
          <circle cx="38" cy="33" r="9.2" fill="#141414" />
          <circle cx="62" cy="33" r="9.2" fill="#141414" />
          <circle cx="35.2" cy="29.8" r="2.6" fill="#FFFFFF" />
          <circle cx="59.2" cy="29.8" r="2.6" fill="#FFFFFF" />
          <circle cx="50" cy="48" r="3.6" fill="#141414" />
        </g>
      )}

      {state === 'idle' && mood === 'orgulloso' && (
        <g className="troko__eyes" data-layer="stars">
          <path
            d="M30 35Q38 25 46 35M54 35Q62 25 70 35"
            fill="none"
            stroke="#141414"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M43 46Q51 52 59 44"
            fill="none"
            stroke="#141414"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            data-particle="star"
            d="M86 3L88 8L93 10L88 12L86 17L84 12L79 10L84 8Z"
            fill="#F5A623"
          />
          <path
            data-particle="star"
            d="M14 5L15.5 8.5L19 10L15.5 11.5L14 15L12.5 11.5L9 10L12.5 8.5Z"
            fill="#B6F23A"
          />
        </g>
      )}

      {state === 'idle' && mood === 'guino' && (
        <g className="troko__eyes" data-layer="arcs">
          <circle cx="38" cy="33" r="7.4" fill="#141414" />
          <circle cx="35.5" cy="30.4" r="2.1" fill="#FFFFFF" opacity="0.75" />
          <path
            d="M54 34Q62 26 70 34"
            fill="none"
            stroke="#141414"
            strokeWidth="2.9"
            strokeLinecap="round"
          />
          <path
            d="M43 46Q51 52 58 45"
            fill="none"
            stroke="#141414"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </g>
      )}

      {state === 'idle' && mood === 'bostezo' && (
        <g className="troko__eyes" data-layer="lines">
          <path
            d="M30 32Q38 38 46 32M54 32Q62 38 70 32"
            fill="none"
            stroke="#141414"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <ellipse cx="50" cy="47.5" rx="4.5" ry="6" fill="#141414" />
          <text x="84" y="14" fill="#8E8E93" fontSize="11" fontWeight="700">
            z
          </text>
        </g>
      )}

      {state === 'idle' && mood === 'molesto' && (
        <g className="troko__eyes" data-layer="brows">
          <path
            d="M28 24L45 30M72 24L55 30"
            fill="none"
            stroke="#141414"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <ellipse cx="38" cy="35" rx="6.6" ry="4.5" fill="#141414" />
          <ellipse cx="62" cy="35" rx="6.6" ry="4.5" fill="#141414" />
          <path
            d="M42 49Q50 44 58 49"
            fill="none"
            stroke="#141414"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M84 5L88 9M88 5L84 9"
            stroke="#FF5A5F"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </g>
      )}

      {state === 'idle' && mood === 'escucha' && (
        <g className="troko__eyes" data-layer="eyes">
          <g transform="translate(50 33) scale(1.16) translate(-50 -33)">
            <circle cx="38" cy="33" r="7.4" fill="#141414" />
            <circle cx="62" cy="33" r="7.4" fill="#141414" />
            <circle cx="35.6" cy="30.4" r="2.2" fill="#FFFFFF" opacity="0.85" />
            <circle cx="59.6" cy="30.4" r="2.2" fill="#FFFFFF" opacity="0.85" />
          </g>
          <path
            d="M45 46Q50 49 55 46"
            fill="none"
            stroke="#141414"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M90 24Q96 32 90 40M95 20Q103 32 95 44"
            fill="none"
            stroke="#B6F23A"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
        </g>
      )}

      {state === 'idle' && mood === 'mareado' && (
        <g className="troko__eyes" data-layer="spirals">
          <g className="troko__spin" data-eye="spiral" transform="translate(38 33)">
            <path
              d="M0 0a2 2 0 1 1 2 2a4 4 0 1 1 -4 -4a6 6 0 1 1 6 6"
              fill="none"
              stroke="#141414"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
          <g className="troko__spin" data-eye="spiral" transform="translate(62 33)">
            <path
              d="M0 0a2 2 0 1 1 2 2a4 4 0 1 1 -4 -4a6 6 0 1 1 6 6"
              fill="none"
              stroke="#141414"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
          <path
            d="M41 47Q45.5 44 50 47T59 47"
            fill="none"
            stroke="#141414"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>
      )}

      {state === 'idle' && mood === 'festejo' && (
        <g className="troko__eyes" data-layer="arcs">
          <path
            d="M29 38Q37 25 45 38M55 38Q63 25 71 38"
            fill="none"
            stroke="#141414"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M40 44Q50 55 60 44Z"
            fill="#141414"
          />
          <circle cx="14" cy="10" r="3" fill="#B6F23A" />
          <circle cx="88" cy="12" r="3" fill="#8B5CF6" />
          <path d="M80 2L85 -3M19 3L14 -2" stroke="#F5A623" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}

      {state === 'idle' && mood === 'saludo' && (
        <g className="troko__eyes" data-layer="eyes">
          <circle cx="38" cy="33" r="7.4" fill="#141414" />
          <circle cx="62" cy="33" r="7.4" fill="#141414" />
          <circle cx="35.5" cy="30.4" r="2.2" fill="#FFFFFF" opacity="0.85" />
          <circle cx="59.5" cy="30.4" r="2.2" fill="#FFFFFF" opacity="0.85" />
          <path
            d="M43 46Q50 52 57 46"
            fill="none"
            stroke="#141414"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <g className="troko__wave-hand" data-layer="wave-hand">
            <rect
              x="86"
              y="34"
              width="12"
              height="18"
              rx="6"
              fill="#F8F4E8"
              stroke="rgba(20, 20, 20, 0.22)"
              strokeWidth="1.2"
            />
          </g>
        </g>
      )}

      {state === 'idle' && mood === 'animo' && (
        <g className="troko__eyes" data-layer="eyes">
          <circle cx="38" cy="33" r="7.4" fill="#141414" />
          <circle cx="62" cy="33" r="7.4" fill="#141414" />
          <circle cx="36" cy="30.5" r="2.4" fill="#B6F23A" />
          <circle cx="60" cy="30.5" r="2.4" fill="#B6F23A" />
          <path
            d="M43 46Q50 52 57 46"
            fill="none"
            stroke="#141414"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M84 14L89 8L94 14"
            fill="none"
            stroke="#B6F23A"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {/* Unlockable Accessories */}
      {activeAccessory === 'glasses' && (
        <g className="troko__accessory" data-layer="accessory-glasses">
          <rect
            x="26"
            y="24"
            width="21"
            height="16"
            rx="5"
            fill="rgba(88, 178, 255, 0.16)"
            stroke="#141414"
            strokeWidth="2.4"
          />
          <rect
            x="53"
            y="24"
            width="21"
            height="16"
            rx="5"
            fill="rgba(88, 178, 255, 0.16)"
            stroke="#141414"
            strokeWidth="2.4"
          />
          <path d="M47 31H53M21 30L26 31M74 31L79 30" stroke="#141414" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}

      {activeAccessory === 'headphones' && (
        <g className="troko__accessory" data-layer="accessory-headphones">
          <path
            d="M14 28C16 4 84 4 86 28"
            fill="none"
            stroke="#8B5CF6"
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <rect x="6" y="24" width="9" height="19" rx="4.5" fill="#1E1E24" stroke="#B6F23A" strokeWidth="1.8" />
          <rect x="85" y="24" width="9" height="19" rx="4.5" fill="#1E1E24" stroke="#B6F23A" strokeWidth="1.8" />
        </g>
      )}

      {activeAccessory === 'headband' && (
        <g className="troko__accessory" data-layer="accessory-headband">
          <path
            d="M17 14Q50 18 83 14L81 20Q50 24 19 20Z"
            fill="#FF5A5F"
            stroke="#141414"
            strokeWidth="1.1"
          />
          <circle cx="77" cy="17" r="3" fill="#F5A623" />
        </g>
      )}

      {activeAccessory === 'crown' && (
        <g className="troko__accessory" data-layer="accessory-crown">
          <path
            d="M33 4L36 -8L44 -1L50 -10L56 -1L64 -8L67 4Z"
            fill="#F5A623"
            stroke="#141414"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="-2" r="2" fill="#FF5A5F" />
        </g>
      )}

      {activeAccessory === 'halo' && (
        <g className="troko__accessory" data-layer="accessory-halo">
          <ellipse
            cx="50"
            cy="-7"
            rx="22"
            ry="4.5"
            fill="none"
            stroke="#B6F23A"
            strokeWidth="2.8"
          />
          <ellipse
            cx="50"
            cy="-7"
            rx="22"
            ry="4.5"
            fill="none"
            stroke="#58B2FF"
            strokeWidth="1.2"
            opacity="0.7"
          />
        </g>
      )}
    </svg>
  );
}
