import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';

/**
 * Sigil — The app's living bioluminescent identity mark.
 *
 * Bold shapes with deep-sea bioluminescence: a vivid cyan-teal glow
 * that bleeds outward like light from a living creature. Periodic
 * bright flares mimic the flash patterns of real bioluminescent organisms.
 */
export function Sigil({ size = 32 }: { size?: number }) {
  const prefersReduced = useReducedMotion();
  const animate = !prefersReduced;

  const hue = useMemo(() => 185 + Math.floor(Math.random() * 12) - 6, []);

  return (
    <div
      className="relative flex items-center justify-center shrink-0 mr-3"
      style={{ width: size, height: size }}
    >
      {/* CSS glow halo — bleeds beyond SVG bounds */}
      <motion.div
        className="absolute inset-[-4px] rounded-full"
        style={{
          background: `radial-gradient(circle, hsla(${hue}, 95%, 60%, 0.2) 0%, hsla(${hue}, 90%, 45%, 0.1) 50%, transparent 75%)`,
        }}
        {...(animate
          ? {
              animate: { scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] },
              transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const },
            }
          : {})}
      />

      {/* Bioluminescent flash — softer, less frequent flare */}
      {animate && (
        <motion.div
          className="absolute inset-[-8px] rounded-full"
          style={{
            background: `radial-gradient(circle, hsla(${hue}, 100%, 75%, 0.3) 0%, transparent 60%)`,
          }}
          animate={{
            scale: [0.9, 1.4, 0.9],
            opacity: [0, 0.4, 0],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: 'easeInOut',
            times: [0, 0.3, 1],
          }}
        />
      )}

      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible relative z-10">
        <defs>
          {/* Bioluminescent core — bright teal center fading to deep ocean */}
          <radialGradient id="sigil-bio-core">
            <stop offset="0%" stopColor={`hsl(${hue + 10}, 100%, 95%)`} />
            <stop offset="25%" stopColor={`hsl(${hue}, 100%, 72%)`} />
            <stop offset="55%" stopColor={`hsl(${hue - 5}, 90%, 50%)`} />
            <stop offset="100%" stopColor={`hsl(${hue - 15}, 80%, 22%)`} />
          </radialGradient>

          <filter id="sig-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
          </filter>
        </defs>

        {/* Outer ring — bold, slow clockwise */}
        <motion.g
          {...(animate
            ? {
                animate: { rotate: 360 },
                transition: { duration: 45, repeat: Infinity, ease: 'linear' as const },
              }
            : {})}
          style={{ transformOrigin: '50px 50px' }}
        >
          {/* Ring glow */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={`hsla(${hue}, 90%, 65%, 0.15)`}
            strokeWidth="3"
            strokeDasharray="10 5"
            filter="url(#sig-glow)"
          />
          {/* Crisp ring */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={`hsla(${hue}, 85%, 72%, 0.6)`}
            strokeWidth="1.6"
            strokeDasharray="10 5"
          />
        </motion.g>

        {/* Inner ring — counter-clockwise */}
        <motion.g
          {...(animate
            ? {
                animate: { rotate: -360 },
                transition: { duration: 28, repeat: Infinity, ease: 'linear' as const },
              }
            : {})}
          style={{ transformOrigin: '50px 50px' }}
        >
          <circle
            cx="50"
            cy="50"
            r="28"
            fill="none"
            stroke={`hsla(${hue + 20}, 80%, 68%, 0.15)`}
            strokeWidth="2.5"
            strokeDasharray="6 8"
            filter="url(#sig-glow)"
          />
          <circle
            cx="50"
            cy="50"
            r="28"
            fill="none"
            stroke={`hsla(${hue + 20}, 80%, 74%, 0.5)`}
            strokeWidth="1.2"
            strokeDasharray="6 8"
          />
        </motion.g>

        {/* Core glow — the bioluminescent organ */}
        <motion.circle
          cx="50"
          cy="50"
          r="18"
          fill="url(#sigil-bio-core)"
          filter="url(#sig-glow)"
          {...(animate
            ? {
                animate: { r: [16, 20, 16], opacity: [0.5, 0.8, 0.5] },
                transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const },
              }
            : {})}
          opacity={0.6}
        />

        {/* Crisp core body */}
        <motion.circle
          cx="50"
          cy="50"
          r="14"
          fill="url(#sigil-bio-core)"
          {...(animate
            ? {
                animate: { r: [13, 15, 13] },
                transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' as const },
              }
            : {})}
        />

        {/* Bright photophore center */}
        <motion.circle
          cx="50"
          cy="50"
          r="6"
          fill={`hsl(${hue + 10}, 100%, 90%)`}
          {...(animate
            ? {
                animate: { r: [5, 7, 5], opacity: [0.9, 1, 0.9] },
                transition: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const },
              }
            : {})}
        />

        {/* White-hot point */}
        <circle cx="50" cy="50" r="2.5" fill="white" />

        {/* Orbiting motes — like drifting plankton */}
        {animate &&
          [0, 120, 240].map((startAngle, i) => (
            <motion.g
              key={startAngle}
              animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
              transition={{ duration: 8 + i * 4, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: '50px 50px' }}
            >
              <motion.circle
                cx={50 + 36}
                cy="50"
                r={2.5 - i * 0.3}
                fill={`hsla(${hue + i * 40}, 95%, 78%, 1)`}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.8, delay: i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transform: `rotate(${startAngle}deg)`, transformOrigin: '50px 50px' }}
              />
            </motion.g>
          ))}
      </svg>
    </div>
  );
}
