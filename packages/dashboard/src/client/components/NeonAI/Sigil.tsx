import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';

/**
 * Sigil — The app's identity mark for the sidebar header.
 *
 * A stylized bioluminescent nautilus / chambered spiral with breathing
 * radial arms and a pulsing core. Designed to feel like a living logo
 * rather than a generic icon — the kind of deep-sea organism you'd find
 * illuminating a volcanic vent.
 *
 * Visually distinct from ThreadMote (thread list icons) by being:
 * - Larger and more detailed (spiral geometry, multiple layers)
 * - Asymmetric and directional (spiral, not radially symmetric)
 * - Warmer bioluminescence (teal/cyan core with secondary magenta)
 */
export function Sigil({ size = 28 }: { size?: number }) {
  const prefersReduced = useReducedMotion();

  // Stable randomized geometry per mount
  const genome = useMemo(() => {
    const spiralTightness = 0.7 + Math.random() * 0.3;
    const armWobble = 0.4 + Math.random() * 0.6;
    return { spiralTightness, armWobble };
  }, []);

  // Generate a chambered spiral path
  const spiralPath = useMemo(() => {
    const cx = 50,
      cy = 50;
    const turns = 1.8 * genome.spiralTightness;
    const points: string[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * turns * Math.PI * 2 - Math.PI / 2;
      const r = 4 + t * 26;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return `M ${points.join(' L ')}`;
  }, [genome.spiralTightness]);

  // Generate radial chamber lines
  const chambers = useMemo(() => {
    const cx = 50,
      cy = 50;
    const count = 5;
    return Array.from({ length: count }, (_, i) => {
      const t = (i + 1) / (count + 1);
      const angle = t * 1.8 * genome.spiralTightness * Math.PI * 2 - Math.PI / 2;
      const rInner = 4 + t * 26 * 0.3;
      const rOuter = 4 + t * 26;
      const wobble = (Math.random() - 0.5) * genome.armWobble * 4;
      const perpAngle = angle + Math.PI / 2;
      return {
        x1: cx + Math.cos(angle) * rInner,
        y1: cy + Math.sin(angle) * rInner,
        x2: cx + Math.cos(angle) * rOuter + Math.cos(perpAngle) * wobble,
        y2: cy + Math.sin(angle) * rOuter + Math.sin(perpAngle) * wobble,
        delay: i * 0.3,
      };
    });
  }, [genome]);

  const breathDuration = prefersReduced ? 0 : 4;

  return (
    <div
      className="relative flex items-center justify-center shrink-0 mr-3"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <defs>
          {/* Core glow gradient */}
          <radialGradient id="sigil-core-grad" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#e0f7fa" />
            <stop offset="35%" stopColor="#06b6d4" />
            <stop offset="70%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#064e3b" stopOpacity="0" />
          </radialGradient>

          {/* Spiral stroke gradient */}
          <linearGradient id="sigil-spiral-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.4" />
          </linearGradient>

          {/* Ambient haze */}
          <filter id="sigil-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
          </filter>
          <filter id="sigil-glow-soft">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
          </filter>
        </defs>

        {/* Background haze — soft ambient light */}
        <motion.circle
          cx="50"
          cy="50"
          r="30"
          fill="url(#sigil-core-grad)"
          filter="url(#sigil-glow-soft)"
          animate={breathDuration ? { opacity: [0.15, 0.3, 0.15], r: [28, 34, 28] } : undefined}
          transition={
            breathDuration
              ? { duration: breathDuration * 1.5, repeat: Infinity, ease: 'easeInOut' }
              : undefined
          }
          opacity={0.2}
        />

        {/* Chamber walls — internal structure lines */}
        {chambers.map((c, i) => (
          <motion.line
            key={i}
            x1={c.x1}
            y1={c.y1}
            x2={c.x2}
            y2={c.y2}
            stroke="#22d3ee"
            strokeWidth="0.8"
            strokeLinecap="round"
            opacity={0.15}
            animate={
              breathDuration
                ? { opacity: [0.08, 0.22, 0.08], x2: [c.x2 - 1, c.x2 + 1, c.x2 - 1] }
                : undefined
            }
            transition={
              breathDuration
                ? { duration: breathDuration, delay: c.delay, repeat: Infinity, ease: 'easeInOut' }
                : undefined
            }
          />
        ))}

        {/* Main spiral — the nautilus shell */}
        <motion.path
          d={spiralPath}
          fill="none"
          stroke="url(#sigil-spiral-grad)"
          strokeWidth="2.2"
          strokeLinecap="round"
          filter="url(#sigil-glow)"
          animate={
            breathDuration ? { opacity: [0.5, 0.85, 0.5], strokeWidth: [2, 2.8, 2] } : undefined
          }
          transition={
            breathDuration
              ? { duration: breathDuration, repeat: Infinity, ease: 'easeInOut' }
              : undefined
          }
          opacity={0.6}
        />
        {/* Crisp spiral overlay */}
        <motion.path
          d={spiralPath}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1"
          strokeLinecap="round"
          animate={breathDuration ? { opacity: [0.4, 0.7, 0.4] } : undefined}
          transition={
            breathDuration
              ? { duration: breathDuration, repeat: Infinity, ease: 'easeInOut' }
              : undefined
          }
          opacity={0.5}
        />

        {/* Central eye / nucleus */}
        <motion.circle
          cx="50"
          cy="50"
          r="5"
          fill="#e0f7fa"
          filter="url(#sigil-glow)"
          animate={breathDuration ? { r: [4, 6, 4], opacity: [0.6, 1, 0.6] } : undefined}
          transition={
            breathDuration
              ? { duration: breathDuration * 0.8, repeat: Infinity, ease: 'easeInOut' }
              : undefined
          }
          opacity={0.8}
        />
        <circle cx="50" cy="50" r="2" fill="white" opacity={0.9} />

        {/* Accent spark — tiny secondary flash at shell tip */}
        <motion.circle
          cx="76"
          cy="50"
          r="1.5"
          fill="#a78bfa"
          animate={breathDuration ? { opacity: [0, 0.8, 0], r: [1, 2.5, 1] } : undefined}
          transition={
            breathDuration
              ? {
                  duration: breathDuration * 1.2,
                  delay: breathDuration * 0.4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }
              : undefined
          }
          opacity={0}
        />
      </svg>
    </div>
  );
}
