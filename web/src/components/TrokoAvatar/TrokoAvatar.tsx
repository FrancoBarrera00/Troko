import { createContext, useContext, useEffect, useId, useRef } from 'react';
import type {
  CompanionId,
  IslandState,
  NukoAccessoryId,
  NukoMood,
} from '../../../../shared/types.ts';

export const NukoCompanionContext = createContext<CompanionId>('nuko');
export const NukoAccessoryContext = createContext<NukoAccessoryId>('none');
export const TrokoAccessoryContext = NukoAccessoryContext;

export interface NukoAvatarProps {
  size?: 'sm' | 'lg' | 'xl';
  mood: NukoMood;
  state: IslandState;
  companion?: CompanionId;
  accessory?: NukoAccessoryId;
  registerHead?: (el: SVGSVGElement | null) => () => void;
  className?: string;
}

export type TrokoAvatarProps = NukoAvatarProps;

const SIZE_DIMS: Record<'sm' | 'lg' | 'xl', { width: number; height: number }> = {
  sm: { width: 34, height: 26 },
  lg: { width: 74, height: 54 },
  xl: { width: 112, height: 82 },
};

const NUKO_HOOD_PATH =
  'M32 12Q21 3 15 6Q12 12 14 19C8 27 7 39 10 50C13 60 26 65 50 65C74 65 87 60 90 50C93 39 92 27 86 19Q88 12 85 6Q79 3 68 12C62 10 56 9.5 50 9.5C44 9.5 38 10 32 12Z';
const NUKO_FACE_DISC_PATH =
  'M50 20C43 15 29 15 22 22C15 29 15 44 23 53C30 59 40 61 50 61C60 61 70 59 77 53C85 44 85 29 78 22C71 15 57 15 50 20Z';
const LUMA_BODY_PATH =
  'M50 11C30 11 16 24 16 42C16 56 29 64 50 64C71 64 84 56 84 42C84 24 70 11 50 11Z';

export function NukoAvatar({
  size = 'sm',
  mood,
  state,
  companion,
  accessory,
  registerHead,
  className = '',
}: NukoAvatarProps) {
  const ctxCompanion = useContext(NukoCompanionContext);
  const ctxAccessory = useContext(NukoAccessoryContext);
  const activeCompanion: CompanionId = companion ?? ctxCompanion ?? 'nuko';
  const activeAccessory: NukoAccessoryId = accessory ?? ctxAccessory ?? 'none';
  const uid = useId().replace(/:/g, '');
  const hoodGradId = `nk-hood-${uid}`;
  const faceGradId = `nk-face-${uid}`;
  const lumaBodyGradId = `lm-body-${uid}`;
  const lumaGlowGradId = `lm-glow-${uid}`;
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!registerHead) return;
    return registerHead(svgRef.current);
  }, [registerHead]);

  const dims = SIZE_DIMS[size];
  const activeExpression = state === 'idle' ? mood : state;
  const isNuko = activeCompanion === 'nuko';

  const renderBeak = (up = false) =>
    isNuko ? (
      <path
        d={up ? 'M50 37L54.2 40.5L50 43.8L45.8 40.5Z' : 'M50 38.5L54.2 42L50 45.8L45.8 42Z'}
        fill="#F5A623"
        stroke="#141414"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
    ) : null;

  return (
    <svg
      ref={svgRef}
      viewBox="-6 -14 112 88"
      width={dims.width}
      height={dims.height}
      aria-hidden="true"
      data-testid="troko-avatar"
      data-companion={activeCompanion}
      data-mood={mood}
      data-state={state}
      data-expression={activeExpression}
      data-accessory={activeAccessory}
      className={`troko nuko ${className}`.trim()}
    >
      <defs>
        <linearGradient id={hoodGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#332B52" />
          <stop offset="1" stopColor="#211B36" />
        </linearGradient>
        <linearGradient id={faceGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F6F1E3" />
          <stop offset="1" stopColor="#E8DFC8" />
        </linearGradient>
        <linearGradient id={lumaBodyGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FAF6EA" />
          <stop offset="1" stopColor="#E6E1CC" />
        </linearGradient>
        <radialGradient id={lumaGlowGradId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#B6F23A" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#B6F23A" stopOpacity="0" />
        </radialGradient>
      </defs>

      {isNuko ? (
        <g className="troko__body nuko__body" data-layer="body">
          <ellipse cx="38" cy="64.5" rx="5.2" ry="2.6" fill="#F5A623" stroke="#141414" strokeWidth="1" />
          <ellipse cx="62" cy="64.5" rx="5.2" ry="2.6" fill="#F5A623" stroke="#141414" strokeWidth="1" />
          <path d="M11 36C5.5 41 7.5 53 16.5 57.5C14 51 14 44 16 38.5Z" fill="#3B315E" stroke="#8B5CF6" strokeWidth="1.1" />
          <path d="M89 36C94.5 41 92.5 53 83.5 57.5C86 51 86 44 84 38.5Z" fill="#3B315E" stroke="#8B5CF6" strokeWidth="1.1" />
          <path
            d={NUKO_HOOD_PATH}
            fill={`url(#${hoodGradId})`}
            stroke="#8B5CF6"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path d="M26 13Q21 8.5 18.5 10Q17.5 13 19.5 16.5Z" fill="#8B5CF6" opacity="0.58" />
          <path d="M74 13Q79 8.5 81.5 10Q82.5 13 80.5 16.5Z" fill="#8B5CF6" opacity="0.58" />
          <path
            d={NUKO_FACE_DISC_PATH}
            fill={`url(#${faceGradId})`}
            stroke="rgba(20, 20, 20, 0.12)"
            strokeWidth="1"
          />
        </g>
      ) : (
        <g className="troko__body nuko__body" data-layer="body">
          <ellipse cx="13" cy="36" rx="10" ry="6" transform="rotate(-18 13 36)" fill="rgba(88,178,255,0.24)" stroke="#58B2FF" strokeWidth="1.4" />
          <ellipse cx="87" cy="36" rx="10" ry="6" transform="rotate(18 87 36)" fill="rgba(88,178,255,0.24)" stroke="#58B2FF" strokeWidth="1.4" />
          <path d="M38 14C34 4 28 -2 24 -3" fill="none" stroke="#8E8E93" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M62 14C66 4 72 -2 76 -3" fill="none" stroke="#8E8E93" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="24" cy="-3" r="7.5" fill={`url(#${lumaGlowGradId})`} />
          <circle cx="76" cy="-3" r="7.5" fill={`url(#${lumaGlowGradId})`} />
          <circle cx="24" cy="-3" r="3.4" fill="#B6F23A" />
          <circle cx="76" cy="-3" r="3.4" fill="#B6F23A" />
          <path
            d={LUMA_BODY_PATH}
            fill={`url(#${lumaBodyGradId})`}
            stroke="#B6F23A"
            strokeWidth="1.5"
          />
          <path d="M27 56Q50 63 73 56Q67 64 50 64Q33 64 27 56Z" fill="#B6F23A" opacity="0.48" />
        </g>
      )}

      <g className="troko__blush" data-layer="blush" opacity="0.76">
        <ellipse cx="25.5" cy="44" rx="5.4" ry="3.1" fill="#F29DB0" />
        <ellipse cx="74.5" cy="44" rx="5.4" ry="3.1" fill="#F29DB0" />
      </g>

      {/* Non-idle Island states */}
      {state === 'listen' && (
        <g className="troko__eyes nuko__eyes" data-layer="eyes">
          <g transform="translate(50 33) scale(1.15) translate(-50 -33)">
            <circle cx="37" cy="33" r="7.1" fill="#141414" />
            <circle cx="63" cy="33" r="7.1" fill="#141414" />
            <circle cx="39.3" cy="30.5" r="2.2" fill="#FFFFFF" opacity="0.9" />
            <circle cx="65.3" cy="30.5" r="2.2" fill="#FFFFFF" opacity="0.9" />
          </g>
          {renderBeak(false)}
          <path d="M90 25Q97 33 90 41M95 21Q104 33 95 45" fill="none" stroke="#B6F23A" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {state === 'think' && (
        <g className="troko__eyes nuko__eyes" data-layer="eyes">
          <g transform="translate(0 -3.5)">
            <circle cx="37" cy="32" r="6" fill="#141414" />
            <circle cx="63" cy="32" r="6" fill="#141414" />
          </g>
          {renderBeak(false)}
          <path d="M44 48Q50 46 56 48" fill="none" stroke="#141414" strokeWidth="2.3" strokeLinecap="round" />
        </g>
      )}

      {state === 'speak' && (
        <g className="troko__eyes nuko__eyes" data-layer="eyes">
          <g className="troko__talk-eyes">
            <circle cx="37" cy="33" r="6.8" fill="#141414" />
            <circle cx="63" cy="33" r="6.8" fill="#141414" />
          </g>
          {renderBeak(true)}
          <ellipse cx="50" cy="49.5" rx="5.4" ry="4.4" fill="#141414" />
          <ellipse cx="50" cy="51.2" rx="3.2" ry="1.8" fill="#F29DB0" />
        </g>
      )}

      {state === 'alert' && (
        <g className="troko__eyes nuko__eyes" data-layer="eyes">
          <g data-layer="brows">
            <path d="M28 24L44 29M72 24L56 29" fill="none" stroke="#141414" strokeWidth="2.8" strokeLinecap="round" />
          </g>
          <circle cx="37" cy="34" r="6.5" fill="#141414" />
          <circle cx="63" cy="34" r="6.5" fill="#141414" />
          {renderBeak(false)}
          <path d="M43 50Q50 45.5 57 50" fill="none" stroke="#141414" strokeWidth="2.4" strokeLinecap="round" />
          <g transform="translate(88 -1)">
            <circle cx="0" cy="6" r="7.6" fill="#FF5A5F" />
            <path d="M0 1.8V6.5M0 9.5V10.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        </g>
      )}

      {state === 'attentive' && (
        <g className="troko__eyes nuko__eyes" data-layer="eyes">
          <circle cx="37" cy="33.5" r="6.2" fill="#141414" />
          <circle cx="63" cy="32.5" r="8.2" fill="#141414" />
          {renderBeak(false)}
          <path d="M44 48Q50 50 56 47" fill="none" stroke="#141414" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {state === 'notification' && (
        <g className="troko__eyes nuko__eyes" data-layer="eyes">
          <circle cx="37" cy="33.5" r="7" fill="#141414" />
          <circle cx="63" cy="33.5" r="7" fill="#141414" />
          <circle cx="39.2" cy="31" r="2.2" fill="#FFFFFF" />
          <circle cx="65.2" cy="31" r="2.2" fill="#FFFFFF" />
          {renderBeak(false)}
          <path d="M44 47.5Q50 52 56 47.5" fill="none" stroke="#141414" strokeWidth="2.4" strokeLinecap="round" />
          <g stroke="#B6F23A" strokeWidth="2.4" strokeLinecap="round">
            <path className="troko__ray" d="M84 7L91 0" />
            <path className="troko__ray" d="M89 13L98 10" />
            <path className="troko__ray" d="M78 3L81 -5" />
          </g>
        </g>
      )}

      {state === 'sleep' && (
        <g className="troko__eyes nuko__eyes" data-layer="lines">
          <path d="M30 35H45M55 35H70" fill="none" stroke="#141414" strokeWidth="2.8" strokeLinecap="round" />
          {renderBeak(false)}
          <path d="M46 48.5Q50 50.5 54 48.5" fill="none" stroke="#141414" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}

      {state === 'focus' && (
        <g className="troko__eyes nuko__eyes" data-layer="squint">
          <ellipse cx="37" cy="34.5" rx="7.4" ry="3" fill="#141414" />
          <ellipse cx="63" cy="34.5" rx="7.4" ry="3" fill="#141414" />
          {renderBeak(false)}
          <path d="M45 48.5H55" fill="none" stroke="#141414" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {state === 'success' && (
        <g className="troko__eyes nuko__eyes" data-layer="arcs">
          <path d="M29.5 37Q37 25.5 44.5 37M55.5 37Q63 25.5 70.5 37" fill="none" stroke="#141414" strokeWidth="2.8" strokeLinecap="round" />
          {renderBeak(false)}
          <path d="M43 47Q50 53 57 47" fill="none" stroke="#141414" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      )}

      {state === 'remind' && (
        <g className="troko__eyes nuko__eyes" data-layer="eyes">
          <circle cx="37" cy="33.5" r="7" fill="#141414" />
          <circle cx="63" cy="33.5" r="7" fill="#141414" />
          <circle cx="39.2" cy="31" r="2.1" fill="#FFFFFF" />
          <circle cx="65.2" cy="31" r="2.1" fill="#FFFFFF" />
          {renderBeak(false)}
          <path d="M44 47.5Q50 52 56 47.5" fill="none" stroke="#141414" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="89" cy="7" r="5.2" fill="#58B2FF" />
        </g>
      )}

      {/* Idle 12 Moods */}
      {state === 'idle' && mood === 'contento' && (
        <g className="troko__eyes nuko__eyes" data-layer="eyes">
          <circle cx="37" cy="33.5" r="7" fill="#141414" />
          <circle cx="63" cy="33.5" r="7" fill="#141414" />
          <circle cx="39.2" cy="31" r="2.1" fill="#FFFFFF" opacity="0.88" />
          <circle cx="65.2" cy="31" r="2.1" fill="#FFFFFF" opacity="0.88" />
          {renderBeak(false)}
          <path d="M44 47.5Q50 52 56 47.5" fill="none" stroke="#141414" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {state === 'idle' && mood === 'enamorado' && (
        <g className="troko__eyes nuko__eyes" data-layer="hearts">
          <path
            data-particle="heart"
            d="M37 40C37 40 29 34.5 29 29.5C29 26.8 31.3 25 33.6 25C35.2 25 36.4 25.9 37 27.2C37.6 25.9 38.8 25 40.4 25C42.7 25 45 26.8 45 29.5C45 34.5 37 40 37 40Z"
            fill="#FF5A5F"
          />
          <path
            data-particle="heart"
            d="M63 40C63 40 55 34.5 55 29.5C55 26.8 57.3 25 59.6 25C61.2 25 62.4 25.9 63 27.2C63.6 25.9 64.8 25 66.4 25C68.7 25 71 26.8 71 29.5C71 34.5 63 40 63 40Z"
            fill="#FF5A5F"
          />
          <path
            data-particle="heart"
            d="M88 13C88 13 83 9.5 83 6.5C83 4.8 84.4 3.5 86 3.5C87 3.5 87.7 4 88 4.8C88.3 4 89 3.5 90 3.5C91.6 3.5 93 4.8 93 6.5C93 9.5 88 13 88 13Z"
            fill="#FF5A5F"
          />
          {renderBeak(false)}
          <path d="M43 47.5Q50 53 57 47.5" fill="none" stroke="#141414" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {state === 'idle' && mood === 'sorpresa' && (
        <g className="troko__eyes nuko__eyes" data-layer="eyes">
          <g data-layer="brows">
            <path d="M30 21Q37 17.5 44 21M56 21Q63 17.5 70 21" fill="none" stroke="#141414" strokeWidth="2.3" strokeLinecap="round" />
          </g>
          <circle cx="37" cy="33.5" r="8.4" fill="#141414" />
          <circle cx="63" cy="33.5" r="8.4" fill="#141414" />
          <circle cx="39.6" cy="30.5" r="2.5" fill="#FFFFFF" />
          <circle cx="65.6" cy="30.5" r="2.5" fill="#FFFFFF" />
          {renderBeak(true)}
          <circle cx="50" cy="49.5" r="3.6" fill="#141414" />
        </g>
      )}

      {state === 'idle' && mood === 'orgulloso' && (
        <g className="troko__eyes nuko__eyes" data-layer="stars">
          <path d="M30 35.5Q37 26 44 35.5M56 35.5Q63 26 70 35.5" fill="none" stroke="#141414" strokeWidth="2.8" strokeLinecap="round" />
          {renderBeak(false)}
          <path d="M43 47.5Q51 53 59 45" fill="none" stroke="#141414" strokeWidth="2.5" strokeLinecap="round" />
          <path data-particle="star" d="M89 3L91 8L96 10L91 12L89 17L87 12L82 10L87 8Z" fill="#F5A623" />
          <path data-particle="star" d="M10 6L11.5 9.5L15 11L11.5 12.5L10 16L8.5 12.5L5 11L8.5 9.5Z" fill="#B6F23A" />
        </g>
      )}

      {state === 'idle' && mood === 'guino' && (
        <g className="troko__eyes nuko__eyes" data-layer="arcs">
          <circle cx="37" cy="33.5" r="7" fill="#141414" />
          <circle cx="39.2" cy="31" r="2.1" fill="#FFFFFF" opacity="0.88" />
          <path d="M55 34.5Q63 27 71 34.5" fill="none" stroke="#141414" strokeWidth="2.9" strokeLinecap="round" />
          {renderBeak(false)}
          <path d="M43.5 47.5Q51 52.5 58 45.5" fill="none" stroke="#141414" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}

      {state === 'idle' && mood === 'bostezo' && (
        <g className="troko__eyes nuko__eyes" data-layer="lines">
          <path d="M30 32.5Q37 38 44 32.5M56 32.5Q63 38 70 32.5" fill="none" stroke="#141414" strokeWidth="2.6" strokeLinecap="round" />
          {renderBeak(true)}
          <ellipse cx="50" cy="49.5" rx="4.3" ry="5.6" fill="#141414" />
          <text x="86" y="14" fill="#8E8E93" fontSize="11" fontWeight="700">
            z
          </text>
        </g>
      )}

      {state === 'idle' && mood === 'molesto' && (
        <g className="troko__eyes nuko__eyes" data-layer="brows">
          <path d="M28 24.5L44 30.5M72 24.5L56 30.5" fill="none" stroke="#141414" strokeWidth="2.9" strokeLinecap="round" />
          <ellipse cx="37" cy="35" rx="6.4" ry="4.3" fill="#141414" />
          <ellipse cx="63" cy="35" rx="6.4" ry="4.3" fill="#141414" />
          {renderBeak(false)}
          <path d="M42.5 50.5Q50 45 57.5 50.5" fill="none" stroke="#141414" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M85 6L90 11M90 6L85 11" stroke="#FF5A5F" strokeWidth="2.3" strokeLinecap="round" />
        </g>
      )}

      {state === 'idle' && mood === 'escucha' && (
        <g className="troko__eyes nuko__eyes" data-layer="eyes">
          <g transform="translate(50 33.5) scale(1.15) translate(-50 -33.5)">
            <circle cx="37" cy="33.5" r="7" fill="#141414" />
            <circle cx="63" cy="33.5" r="7" fill="#141414" />
            <circle cx="39.3" cy="31" r="2.1" fill="#FFFFFF" opacity="0.9" />
            <circle cx="65.3" cy="31" r="2.1" fill="#FFFFFF" opacity="0.9" />
          </g>
          {renderBeak(false)}
          <path d="M45 47.5Q50 50.5 55 47.5" fill="none" stroke="#141414" strokeWidth="2.3" strokeLinecap="round" />
          <path d="M91 25Q98 33 91 41M96 21Q104 33 96 45" fill="none" stroke="#B6F23A" strokeWidth="2.3" strokeLinecap="round" />
        </g>
      )}

      {state === 'idle' && mood === 'mareado' && (
        <g className="troko__eyes nuko__eyes" data-layer="spirals">
          <g className="troko__spin" data-eye="spiral" transform="translate(37 33.5)">
            <path d="M0 0a2 2 0 1 1 2 2a4 4 0 1 1 -4 -4a6 6 0 1 1 6 6" fill="none" stroke="#141414" strokeWidth="2" strokeLinecap="round" />
          </g>
          <g className="troko__spin" data-eye="spiral" transform="translate(63 33.5)">
            <path d="M0 0a2 2 0 1 1 2 2a4 4 0 1 1 -4 -4a6 6 0 1 1 6 6" fill="none" stroke="#141414" strokeWidth="2" strokeLinecap="round" />
          </g>
          {renderBeak(false)}
          <path d="M41.5 48.5Q45.5 45.5 50 48.5T58.5 48.5" fill="none" stroke="#141414" strokeWidth="2.3" strokeLinecap="round" />
        </g>
      )}

      {state === 'idle' && mood === 'festejo' && (
        <g className="troko__eyes nuko__eyes" data-layer="arcs">
          <path d="M29.5 36.5Q37 25.5 44.5 36.5M55.5 36.5Q63 25.5 70.5 36.5" fill="none" stroke="#141414" strokeWidth="2.9" strokeLinecap="round" />
          {renderBeak(true)}
          <path d="M41 46Q50 56 59 46Z" fill="#141414" />
          <circle cx="11" cy="9" r="2.8" fill="#B6F23A" />
          <circle cx="90" cy="10" r="2.8" fill="#8B5CF6" />
          <path d="M82 2L87 -3M17 3L12 -2" stroke="#F5A623" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}

      {state === 'idle' && mood === 'saludo' && (
        <g className="troko__eyes nuko__eyes" data-layer="eyes">
          <circle cx="37" cy="33.5" r="7" fill="#141414" />
          <circle cx="63" cy="33.5" r="7" fill="#141414" />
          <circle cx="39.2" cy="31" r="2.1" fill="#FFFFFF" opacity="0.9" />
          <circle cx="65.2" cy="31" r="2.1" fill="#FFFFFF" opacity="0.9" />
          {renderBeak(false)}
          <path d="M43.5 47.5Q50 52.5 56.5 47.5" fill="none" stroke="#141414" strokeWidth="2.5" strokeLinecap="round" />
          <g className="troko__wave-hand" data-layer="wave-hand">
            {isNuko ? (
              <path
                d="M89 48C95 45 101 38 99 30C97 26 91 29 89 35C87 40 87 45 89 48Z"
                fill="#2B2444"
                stroke="#8B5CF6"
                strokeWidth="1.5"
              />
            ) : (
              <rect
                x="86"
                y="34"
                width="12"
                height="18"
                rx="6"
                fill="#FAF6EA"
                stroke="#B6F23A"
                strokeWidth="1.4"
              />
            )}
          </g>
        </g>
      )}

      {state === 'idle' && mood === 'animo' && (
        <g className="troko__eyes nuko__eyes" data-layer="eyes">
          <circle cx="37" cy="33.5" r="7" fill="#141414" />
          <circle cx="63" cy="33.5" r="7" fill="#141414" />
          <circle cx="39.4" cy="31" r="2.3" fill="#B6F23A" />
          <circle cx="65.4" cy="31" r="2.3" fill="#B6F23A" />
          {renderBeak(false)}
          <path d="M43.5 47.5Q50 52.5 56.5 47.5" fill="none" stroke="#141414" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M85 15L90 9L95 15" fill="none" stroke="#B6F23A" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* Unlockable Accessories */}
      {activeAccessory === 'glasses' && (
        <g className="troko__accessory nuko__accessory" data-layer="accessory-glasses">
          <rect x="25.5" y="25" width="21.5" height="16.5" rx="5.5" fill="rgba(88, 178, 255, 0.18)" stroke="#141414" strokeWidth="2.4" />
          <rect x="53" y="25" width="21.5" height="16.5" rx="5.5" fill="rgba(88, 178, 255, 0.18)" stroke="#141414" strokeWidth="2.4" />
          <path d="M47 32H53M21 31L25.5 32M74.5 32L79 31" stroke="#141414" strokeWidth="2.3" strokeLinecap="round" />
        </g>
      )}

      {activeAccessory === 'headphones' && (
        <g className="troko__accessory nuko__accessory" data-layer="accessory-headphones">
          <path d="M10 31C12 1 88 1 90 31" fill="none" stroke="#8B5CF6" strokeWidth="4.2" strokeLinecap="round" />
          <rect x="2.5" y="26" width="9.5" height="19" rx="4.5" fill="#1B1B22" stroke="#B6F23A" strokeWidth="1.9" />
          <rect x="88" y="26" width="9.5" height="19" rx="4.5" fill="#1B1B22" stroke="#B6F23A" strokeWidth="1.9" />
        </g>
      )}

      {activeAccessory === 'headband' && (
        <g className="troko__accessory nuko__accessory" data-layer="accessory-headband">
          <path d="M15 21.5Q50 15.5 85 21.5L83 26.8Q50 21 17 26.8Z" fill="#FF5A5F" stroke="#141414" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="74" cy="22.2" r="2.9" fill="#F5A623" />
        </g>
      )}

      {activeAccessory === 'crown' && (
        <g className="troko__accessory nuko__accessory" data-layer="accessory-crown">
          <path d="M33 11L31 -3L42 3.5L50 -9L58 3.5L69 -3L67 11Z" fill="#F5A623" stroke="#141414" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="50" cy="4.2" r="2.1" fill="#FF5A5F" />
        </g>
      )}

      {activeAccessory === 'halo' && (
        <g className="troko__accessory nuko__accessory" data-layer="accessory-halo">
          <ellipse cx="50" cy="-7.5" rx="22" ry="4.4" fill="none" stroke="#B6F23A" strokeWidth="2.8" />
          <ellipse cx="50" cy="-7.5" rx="22" ry="4.4" fill="none" stroke="#58B2FF" strokeWidth="1.2" opacity="0.72" />
        </g>
      )}
    </svg>
  );
}

export const TrokoAvatar = NukoAvatar;
