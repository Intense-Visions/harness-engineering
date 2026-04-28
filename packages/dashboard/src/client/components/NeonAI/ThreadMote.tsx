import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import type { ThreadAvatar } from '../../types/thread';

interface Props {
  avatar: ThreadAvatar;
  isActive?: boolean;
  size?: number;
}

/**
 * ThreadMote — tiny bioluminescent micro-organisms representing thread types.
 *
 * Each avatar type maps to a visually distinct deep-sea species:
 *   • user     → Dinoflagellate (single-celled, warm cyan glow, gentle spin)
 *   • organism → Ctenophore (comb-jelly, rainbow iridescence, pulsing lobes)
 *   • alert    → Pyrosome (colonial fire-body, amber/red warning glow)
 *   • system   → Radiolarian (geometric skeleton, cool blue lattice)
 *
 * Designed for 18-22px scale with high contrast against dark backgrounds.
 * Completely distinct from Sigil (header mark).
 */
export function ThreadMote({ avatar, isActive = false, size = 20 }: Props) {
  const prefersReduced = useReducedMotion();

  switch (avatar) {
    case 'user':
      return <Dinoflagellate size={size} isActive={isActive} reduced={!!prefersReduced} />;
    case 'organism':
      return <Ctenophore size={size} isActive={isActive} reduced={!!prefersReduced} />;
    case 'alert':
      return <Pyrosome size={size} isActive={isActive} reduced={!!prefersReduced} />;
    case 'system':
    default:
      return <Radiolarian size={size} isActive={isActive} reduced={!!prefersReduced} />;
  }
}

/* ── Dinoflagellate — chat/user threads ────────────────────── */

function Dinoflagellate({
  size,
  isActive,
  reduced,
}: {
  size: number;
  isActive: boolean;
  reduced: boolean;
}) {
  // Stable shape per mount — slightly irregular cell outline
  const bodyPath = useMemo(() => {
    const cx = 50,
      cy = 50,
      r = 28;
    const points = 8;
    const coords: string[] = [];
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const wobble = r + (Math.random() - 0.5) * 8;
      coords.push(
        `${(cx + Math.cos(angle) * wobble).toFixed(1)} ${(cy + Math.sin(angle) * wobble).toFixed(1)}`
      );
    }
    // Smooth closed path via quadratic beziers
    let d = `M ${coords[0]}`;
    for (let i = 0; i < points; i++) {
      const next = coords[(i + 1) % points];
      d += ` Q ${coords[i]}, ${next}`;
    }
    return d + ' Z';
  }, []);

  const breathDur = reduced ? 0 : 3;

  return (
    <Wrapper size={size}>
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <defs>
          <radialGradient id="dino-grad">
            <stop offset="0%" stopColor="#e0f7fa" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0e7490" stopOpacity="0.4" />
          </radialGradient>
          <filter id="dino-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
          </filter>
        </defs>

        {/* Ambient glow haze */}
        <motion.circle
          cx="50"
          cy="50"
          r="24"
          fill="#06b6d4"
          filter="url(#dino-glow)"
          animate={breathDur ? { opacity: [0.1, 0.25, 0.1] } : undefined}
          transition={
            breathDur ? { duration: breathDur, repeat: Infinity, ease: 'easeInOut' } : undefined
          }
          opacity={isActive ? 0.25 : 0.12}
        />

        {/* Cell body */}
        <motion.path
          d={bodyPath}
          fill="url(#dino-grad)"
          animate={
            breathDur
              ? {
                  scale: [1, 1.06, 1],
                  opacity: isActive ? [0.8, 1, 0.8] : [0.5, 0.7, 0.5],
                }
              : undefined
          }
          transition={
            breathDur ? { duration: breathDur, repeat: Infinity, ease: 'easeInOut' } : undefined
          }
          opacity={isActive ? 0.85 : 0.55}
          style={{ transformOrigin: '50px 50px' }}
        />

        {/* Flagellum — a whip-like tail */}
        <motion.path
          d="M 50 78 Q 55 88 48 96"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2"
          strokeLinecap="round"
          animate={
            breathDur
              ? {
                  d: ['M 50 78 Q 55 88 48 96', 'M 50 78 Q 45 90 52 98', 'M 50 78 Q 55 88 48 96'],
                  opacity: [0.3, 0.6, 0.3],
                }
              : undefined
          }
          transition={breathDur ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : undefined}
          opacity={0.4}
        />

        {/* Nucleus */}
        <motion.circle
          cx="50"
          cy="48"
          r="6"
          fill="#e0f7fa"
          animate={breathDur ? { opacity: [0.6, 1, 0.6], r: [5, 7, 5] } : undefined}
          transition={
            breathDur
              ? { duration: breathDur * 0.7, repeat: Infinity, ease: 'easeInOut' }
              : undefined
          }
          opacity={0.7}
        />
        <circle cx="50" cy="48" r="2.5" fill="white" opacity={0.9} />
      </svg>
    </Wrapper>
  );
}

/* ── Ctenophore — agent/organism threads ───────────────────── */

function Ctenophore({
  size,
  isActive,
  reduced,
}: {
  size: number;
  isActive: boolean;
  reduced: boolean;
}) {
  // Iridescent comb rows
  const combs = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const y = 25 + i * 10;
      const width = 20 - Math.abs(i - 2.5) * 3;
      return {
        x1: 50 - width,
        x2: 50 + width,
        y,
        hue: (i * 50 + 180) % 360,
        delay: i * 0.15,
      };
    });
  }, []);

  const breathDur = reduced ? 0 : 3.5;

  return (
    <Wrapper size={size}>
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <defs>
          <radialGradient id="cteno-grad">
            <stop offset="0%" stopColor="rgba(200, 230, 255, 0.9)" />
            <stop offset="60%" stopColor="rgba(100, 180, 255, 0.4)" />
            <stop offset="100%" stopColor="rgba(60, 120, 200, 0)" />
          </radialGradient>
          <filter id="cteno-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
          </filter>
        </defs>

        {/* Translucent bell body */}
        <motion.ellipse
          cx="50"
          cy="48"
          rx="22"
          ry="30"
          fill="url(#cteno-grad)"
          stroke="rgba(150, 210, 255, 0.25)"
          strokeWidth="1"
          animate={
            breathDur
              ? {
                  ry: [28, 32, 28],
                  opacity: isActive ? [0.6, 0.85, 0.6] : [0.35, 0.55, 0.35],
                }
              : undefined
          }
          transition={
            breathDur ? { duration: breathDur, repeat: Infinity, ease: 'easeInOut' } : undefined
          }
          opacity={isActive ? 0.65 : 0.4}
          style={{ transformOrigin: '50px 48px' }}
        />

        {/* Iridescent comb rows — the signature feature */}
        {combs.map((c, i) => (
          <motion.line
            key={i}
            x1={c.x1}
            y1={c.y}
            x2={c.x2}
            y2={c.y}
            stroke={`hsla(${c.hue}, 80%, 70%, 0.7)`}
            strokeWidth="1.5"
            strokeLinecap="round"
            animate={
              breathDur
                ? {
                    stroke: [
                      `hsla(${c.hue}, 80%, 70%, 0.5)`,
                      `hsla(${(c.hue + 60) % 360}, 85%, 75%, 0.9)`,
                      `hsla(${c.hue}, 80%, 70%, 0.5)`,
                    ],
                    x1: [c.x1, c.x1 - 1, c.x1],
                    x2: [c.x2, c.x2 + 1, c.x2],
                  }
                : undefined
            }
            transition={
              breathDur
                ? {
                    duration: 1.8,
                    delay: c.delay,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }
                : undefined
            }
          />
        ))}

        {/* Inner glow core */}
        <motion.circle
          cx="50"
          cy="42"
          r="5"
          fill="white"
          filter="url(#cteno-glow)"
          animate={breathDur ? { opacity: [0.3, 0.7, 0.3], r: [4, 6, 4] } : undefined}
          transition={
            breathDur
              ? { duration: breathDur * 0.8, repeat: Infinity, ease: 'easeInOut' }
              : undefined
          }
          opacity={0.4}
        />

        {/* Trailing tentacles */}
        <motion.path
          d="M 42 76 Q 40 88 38 96"
          fill="none"
          stroke="rgba(180, 220, 255, 0.3)"
          strokeWidth="1"
          strokeLinecap="round"
          animate={
            breathDur
              ? {
                  d: ['M 42 76 Q 40 88 38 96', 'M 42 76 Q 44 90 40 98', 'M 42 76 Q 40 88 38 96'],
                }
              : undefined
          }
          transition={
            breathDur ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' } : undefined
          }
        />
        <motion.path
          d="M 58 76 Q 60 88 62 96"
          fill="none"
          stroke="rgba(180, 220, 255, 0.3)"
          strokeWidth="1"
          strokeLinecap="round"
          animate={
            breathDur
              ? {
                  d: ['M 58 76 Q 60 88 62 96', 'M 58 76 Q 56 90 60 98', 'M 58 76 Q 60 88 62 96'],
                }
              : undefined
          }
          transition={
            breathDur
              ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }
              : undefined
          }
        />
      </svg>
    </Wrapper>
  );
}

/* ── Pyrosome — alert/attention threads ────────────────────── */

function Pyrosome({
  size,
  isActive,
  reduced,
}: {
  size: number;
  isActive: boolean;
  reduced: boolean;
}) {
  const breathDur = reduced ? 0 : 2;

  return (
    <Wrapper size={size}>
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <defs>
          <radialGradient id="pyro-grad">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="40%" stopColor="#f59e0b" />
            <stop offset="80%" stopColor="#ea580c" />
            <stop offset="100%" stopColor="#991b1b" stopOpacity="0.3" />
          </radialGradient>
          <filter id="pyro-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
          </filter>
        </defs>

        {/* Warning corona — pulsing outer fire */}
        <motion.circle
          cx="50"
          cy="50"
          r="30"
          fill="#f59e0b"
          filter="url(#pyro-glow)"
          animate={
            breathDur
              ? {
                  opacity: [0.1, 0.35, 0.1],
                  r: [26, 36, 26],
                }
              : undefined
          }
          transition={
            breathDur ? { duration: breathDur, repeat: Infinity, ease: 'easeInOut' } : undefined
          }
          opacity={0.15}
        />

        {/* Colonial body — irregular diamond-ish shape */}
        <motion.path
          d="M 50 20 L 75 45 Q 78 50 75 55 L 50 80 L 25 55 Q 22 50 25 45 Z"
          fill="url(#pyro-grad)"
          animate={
            breathDur
              ? {
                  scale: isActive ? [1, 1.12, 1] : [1, 1.06, 1],
                  opacity: isActive ? [0.75, 1, 0.75] : [0.5, 0.75, 0.5],
                }
              : undefined
          }
          transition={
            breathDur ? { duration: breathDur, repeat: Infinity, ease: 'easeInOut' } : undefined
          }
          opacity={isActive ? 0.8 : 0.55}
          style={{ transformOrigin: '50px 50px' }}
        />

        {/* Internal ember channels */}
        {[
          { d: 'M 38 40 L 50 50 L 38 60', delay: 0 },
          { d: 'M 62 40 L 50 50 L 62 60', delay: 0.3 },
          { d: 'M 50 28 L 50 50', delay: 0.6 },
        ].map((ch, i) => (
          <motion.path
            key={i}
            d={ch.d}
            fill="none"
            stroke="#fef3c7"
            strokeWidth="1.2"
            strokeLinecap="round"
            animate={
              breathDur
                ? {
                    opacity: [0.15, 0.5, 0.15],
                  }
                : undefined
            }
            transition={
              breathDur
                ? {
                    duration: breathDur * 0.8,
                    delay: ch.delay,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }
                : undefined
            }
            opacity={0.2}
          />
        ))}

        {/* Hot core */}
        <motion.circle
          cx="50"
          cy="50"
          r="6"
          fill="#fef3c7"
          animate={
            breathDur
              ? {
                  opacity: [0.7, 1, 0.7],
                  r: [5, 8, 5],
                }
              : undefined
          }
          transition={
            breathDur
              ? { duration: breathDur * 0.6, repeat: Infinity, ease: 'easeInOut' }
              : undefined
          }
          opacity={0.8}
        />
        <circle cx="50" cy="50" r="2.5" fill="white" opacity={0.95} />
      </svg>
    </Wrapper>
  );
}

/* ── Radiolarian — system threads ──────────────────────────── */

function Radiolarian({
  size,
  isActive,
  reduced,
}: {
  size: number;
  isActive: boolean;
  reduced: boolean;
}) {
  // Geometric lattice skeleton
  const spokes = useMemo(() => {
    const count = 6;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const r = 24 + (Math.random() - 0.5) * 4;
      return {
        x: 50 + Math.cos(angle) * r,
        y: 50 + Math.sin(angle) * r,
        angle,
      };
    });
  }, []);

  const breathDur = reduced ? 0 : 5;

  return (
    <Wrapper size={size}>
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <defs>
          <radialGradient id="radio-grad">
            <stop offset="0%" stopColor="#c7d2fe" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#312e81" stopOpacity="0.3" />
          </radialGradient>
          <filter id="radio-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
          </filter>
        </defs>

        {/* Geometric lattice skeleton */}
        {spokes.map((s, i) => {
          const next = spokes[(i + 1) % spokes.length]!;
          return (
            <g key={i}>
              {/* Spoke to center */}
              <motion.line
                x1="50"
                y1="50"
                x2={s.x}
                y2={s.y}
                stroke="#818cf8"
                strokeWidth="1"
                strokeLinecap="round"
                animate={breathDur ? { opacity: [0.15, 0.35, 0.15] } : undefined}
                transition={
                  breathDur
                    ? {
                        duration: breathDur,
                        delay: i * 0.2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }
                    : undefined
                }
                opacity={0.2}
              />
              {/* Perimeter connection */}
              <motion.line
                x1={s.x}
                y1={s.y}
                x2={next.x}
                y2={next.y}
                stroke="#a5b4fc"
                strokeWidth="0.8"
                strokeLinecap="round"
                animate={breathDur ? { opacity: [0.1, 0.3, 0.1] } : undefined}
                transition={
                  breathDur
                    ? {
                        duration: breathDur,
                        delay: i * 0.2 + 0.1,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }
                    : undefined
                }
                opacity={0.15}
              />
              {/* Node at spoke tip */}
              <motion.circle
                cx={s.x}
                cy={s.y}
                r="2"
                fill="#a5b4fc"
                animate={
                  breathDur
                    ? {
                        opacity: [0.2, 0.6, 0.2],
                        r: [1.5, 2.5, 1.5],
                      }
                    : undefined
                }
                transition={
                  breathDur
                    ? {
                        duration: breathDur,
                        delay: i * 0.3,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }
                    : undefined
                }
                opacity={0.3}
              />
            </g>
          );
        })}

        {/* Central sphere */}
        <motion.circle
          cx="50"
          cy="50"
          r="10"
          fill="url(#radio-grad)"
          animate={
            breathDur
              ? {
                  scale: [1, 1.08, 1],
                  opacity: isActive ? [0.6, 0.9, 0.6] : [0.35, 0.55, 0.35],
                }
              : undefined
          }
          transition={
            breathDur ? { duration: breathDur, repeat: Infinity, ease: 'easeInOut' } : undefined
          }
          opacity={isActive ? 0.65 : 0.4}
          style={{ transformOrigin: '50px 50px' }}
        />

        {/* Inner nucleus */}
        <motion.circle
          cx="50"
          cy="50"
          r="4"
          fill="#c7d2fe"
          animate={breathDur ? { opacity: [0.4, 0.8, 0.4] } : undefined}
          transition={
            breathDur
              ? { duration: breathDur * 0.6, repeat: Infinity, ease: 'easeInOut' }
              : undefined
          }
          opacity={0.5}
        />
        <circle cx="50" cy="50" r="1.5" fill="white" opacity={0.8} />
      </svg>
    </Wrapper>
  );
}

/* ── Shared wrapper ────────────────────────────────────────── */

function Wrapper({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      {children}
    </div>
  );
}
