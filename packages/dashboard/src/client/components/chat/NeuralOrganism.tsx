import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * Bioluminescent neural organism with deep chaos.
 * Every render randomizes timing, positions, and paths.
 * Spontaneous sparks fire unpredictably. Somas drift. Nothing repeats.
 */

/** Random jitter: returns base ± range */
function jitter(base: number, range: number): number {
  return base + (Math.random() - 0.5) * 2 * range;
}

/** Perturb a bezier Q control point for organic variation */
function perturbPath(d: string, amount: number): string {
  return d.replace(/Q\s+([\d.]+)\s+([\d.]+)/, (_, qx, qy) => {
    const nx = parseFloat(qx) + (Math.random() - 0.5) * 2 * amount;
    const ny = parseFloat(qy) + (Math.random() - 0.5) * 2 * amount;
    return `Q ${nx.toFixed(1)} ${ny.toFixed(1)}`;
  });
}

interface NeuralAxonProps {
  d: string;
  len: number;
  delay: number;
  duration: number;
  color: string;
  repeatDelay?: number;
}

function NeuralAxon({ d, len, delay, duration, color, repeatDelay = 1.5 }: NeuralAxonProps) {
  return (
    <>
      <path d={d} stroke={color} strokeWidth="0.75" opacity="0.12" fill="none" strokeLinecap="round" />
      <motion.path
        d={d}
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`5 ${len + 10}`}
        animate={{ strokeDashoffset: [8, -(len + 8)] }}
        transition={{ duration, delay, repeat: Infinity, ease: 'linear', repeatDelay }}
        style={{ opacity: 0.85 }}
      />
    </>
  );
}

function NeuralSoma({ cx, cy, r, delay, color }: { cx: number; cy: number; r: number; delay: number; color: string }) {
  const drift = useMemo(() => ({
    x: [0, jitter(0, 2.5), jitter(0, 2), jitter(0, 3), 0],
    y: [0, jitter(0, 2), jitter(0, 3), jitter(0, 2.5), 0],
    dur: jitter(8, 4),
  }), []);

  const breathDur = useMemo(() => jitter(2.2, 0.8), []);
  const glowDur = useMemo(() => jitter(2.8, 1.2), []);

  return (
    <motion.g
      animate={{ x: drift.x, y: drift.y }}
      transition={{ duration: drift.dur, repeat: Infinity, ease: 'easeInOut' }}
    >
      <motion.circle
        cx={cx} cy={cy} r={r + 4}
        fill={color}
        animate={{ opacity: [0, jitter(0.14, 0.06), 0], r: [r + 2, r + jitter(7, 2), r + 2] }}
        transition={{ duration: glowDur, delay, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.circle
        cx={cx} cy={cy} r={r}
        fill={color}
        animate={{ opacity: [0.4, 1, 0.4], r: [r * 0.8, r * jitter(1.05, 0.15), r * 0.8] }}
        transition={{ duration: breathDur, delay, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.g>
  );
}

function SpontaneousSpark({ d, len, color }: { d: string; len: number; color: string }) {
  return (
    <motion.path
      d={d}
      stroke={color}
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeDasharray={`3 ${len + 5}`}
      initial={{ strokeDashoffset: 5, opacity: 0 }}
      animate={{ strokeDashoffset: -(len + 5), opacity: [0, 1, 0.8, 0] }}
      transition={{ duration: jitter(0.6, 0.2), ease: 'easeOut' }}
    />
  );
}

function NeuralMembrane({ color }: { color: string }) {
  const center = 28;
  const points = 16; // Even more points for high-fidelity liquid morphing

  const generateSmoothPath = (baseRadius: number, variance: number) => {
    const coords = [];
    for (let i = 0; i < points; i++) {
        const angle = (i / points) * Math.PI * 2;
        // High variance for "lumpy" organic feel
        const r = baseRadius + (Math.random() - 0.5) * variance;
        coords.push({
            x: center + Math.cos(angle) * r,
            y: center + Math.sin(angle) * r
        });
    }

    let d = `M ${coords[0]!.x.toFixed(1)} ${coords[0]!.y.toFixed(1)}`;
    for (let i = 0; i < points; i++) {
        const next = coords[(i + 1) % points]!;
        const curr = coords[i]!;
        const midX = (curr.x + next.x) / 2;
        const midY = (curr.y + next.y) / 2;
        d += ` Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)}`;
    }
    d += ' Z';
    return d;
  };

  // Atmospheric halo layer - extremely soft
  const haloVariants = useMemo(() => {
    return Array.from({ length: 5 }, () => generateSmoothPath(28, 10));
  }, []);

  // Outer membrane layer
  const outerVariants = useMemo(() => {
    return Array.from({ length: 6 }, () => generateSmoothPath(26, 8));
  }, []);

  // Inner cytoplasm layer
  const innerVariants = useMemo(() => {
    return Array.from({ length: 7 }, () => generateSmoothPath(20, 6));
  }, []);

  return (
    <>
      {/* 1. Atmospheric Halo - the fuzzy border expansion */}
      <motion.path
        d={haloVariants[0]}
        animate={{ d: haloVariants }}
        transition={{
          duration: jitter(12, 3),
          repeat: Infinity,
          ease: "easeInOut",
          repeatType: "reverse"
        }}
        fill={color.replace('1)', '0.02)')}
        stroke={color}
        strokeWidth="0.2"
        strokeOpacity="0.05"
        style={{ filter: 'blur(4px)' }}
      />
      {/* 2. Outer Membrane - defining the soft boundary */}
      <motion.path
        d={outerVariants[0]}
        animate={{ d: outerVariants }}
        transition={{
          duration: jitter(8, 2),
          repeat: Infinity,
          ease: "easeInOut",
          repeatType: "reverse"
        }}
        fill={color.replace('1)', '0.03)')}
        stroke={color}
        strokeWidth="0.4"
        strokeOpacity="0.1"
        style={{ filter: 'blur(2.5px)' }}
      />
      {/* 3. Inner Cytoplasm - internal density */}
      <motion.path
        d={innerVariants[0]}
        animate={{ d: innerVariants }}
        transition={{
          duration: jitter(10, 4),
          repeat: Infinity,
          ease: "easeInOut",
          repeatType: "reverse"
        }}
        fill={color.replace('1)', '0.05)')}
        stroke={color}
        strokeWidth="0.6"
        strokeOpacity="0.15"
        style={{ filter: 'blur(1.5px)' }}
      />
    </>
  );
}

const AXON_TEMPLATES = [
  { d: 'M 28 28 Q 20 18 28 6',   baselen: 25, color: 'rgba(167,139,250,1)' },
  { d: 'M 28 28 Q 40 18 49 14',  baselen: 26, color: 'rgba(139,92,246,1)' },
  { d: 'M 28 28 Q 42 30 52 30',  baselen: 26, color: 'rgba(109,40,217,1)' },
  { d: 'M 28 28 Q 38 40 42 50',  baselen: 26, color: 'rgba(167,139,250,1)' },
  { d: 'M 28 28 Q 16 40 12 50',  baselen: 26, color: 'rgba(139,92,246,1)' },
  { d: 'M 28 28 Q 14 30 4 30',   baselen: 26, color: 'rgba(109,40,217,1)' },
  { d: 'M 28 28 Q 16 18 7 14',   baselen: 26, color: 'rgba(167,139,250,1)' },
  { d: 'M 28 6 Q 40 8 49 14',    baselen: 23, color: 'rgba(45,212,191,1)' },
  { d: 'M 49 14 Q 54 22 52 30',  baselen: 20, color: 'rgba(45,212,191,1)' },
  { d: 'M 7 14 Q 4 22 4 30',     baselen: 20, color: 'rgba(34,211,238,1)' },
  { d: 'M 12 50 Q 6 40 4 30',    baselen: 24, color: 'rgba(34,211,238,1)' },
];

const SPARK_COLORS = [
  'rgba(251,191,36,0.9)',
  'rgba(52,211,153,0.9)',
  'rgba(248,113,113,0.8)',
  'rgba(96,165,250,0.9)',
  'rgba(167,139,250,1)',
  'rgba(45,212,191,1)',
];

export function NeuralOrganism({ size = 56 }: { size?: number }) {
  const axons: NeuralAxonProps[] = useMemo(() =>
    AXON_TEMPLATES.map((t) => ({
      d: perturbPath(t.d, 4),
      len: t.baselen,
      delay: Math.random() * 3,
      duration: jitter(1.2, 0.5),
      color: t.color,
      repeatDelay: jitter(2.0, 1.2),
    })),
  []);

  const somaPositions = useMemo(() => [
    { cx: 28, cy: 28, r: jitter(3.5, 0.5), color: 'rgba(167,139,250,1)' },
    { cx: jitter(28, 2), cy: jitter(6, 2),  r: jitter(2, 0.4), color: 'rgba(139,92,246,0.9)' },
    { cx: jitter(49, 2), cy: jitter(14, 2), r: jitter(2, 0.4), color: 'rgba(139,92,246,0.9)' },
    { cx: jitter(52, 2), cy: jitter(30, 2), r: jitter(2, 0.4), color: 'rgba(109,40,217,0.9)' },
    { cx: jitter(42, 2), cy: jitter(50, 2), r: jitter(2, 0.4), color: 'rgba(139,92,246,0.9)' },
    { cx: jitter(12, 2), cy: jitter(50, 2), r: jitter(2, 0.4), color: 'rgba(139,92,246,0.9)' },
    { cx: jitter(4, 2),  cy: jitter(30, 2), r: jitter(2, 0.4), color: 'rgba(109,40,217,0.9)' },
    { cx: jitter(7, 2),  cy: jitter(14, 2), r: jitter(2, 0.4), color: 'rgba(139,92,246,0.9)' },
  ], []);

  const [sparks, setSparks] = useState<Array<{ id: number; d: string; len: number; color: string }>>([]);
  const sparkIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const fire = () => {
      if (cancelled) return;
      const template = AXON_TEMPLATES[Math.floor(Math.random() * AXON_TEMPLATES.length)]!;
      const sparkId = ++sparkIdRef.current;
      setSparks(prev => [...prev, {
        id: sparkId,
        d: perturbPath(template.d, 6),
        len: template.baselen,
        color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)]!,
      }]);
      setTimeout(() => {
        setSparks(prev => prev.filter(s => s.id !== sparkId));
      }, 1200);
      const nextDelay = 800 + Math.random() * 3200;
      setTimeout(fire, nextDelay);
    };
    const initialDelay = setTimeout(fire, 500 + Math.random() * 2000);
    return () => { cancelled = true; clearTimeout(initialDelay); };
  }, []);

  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" className="flex-shrink-0 overflow-visible">
      {/* Cell Membrane Shell */}
      <NeuralMembrane color="rgba(167,139,250,1)" />
      {/* Base axons */}
      {axons.map((a, i) => <NeuralAxon key={i} {...a} />)}
      {sparks.map(s => <SpontaneousSpark key={s.id} d={s.d} len={s.len} color={s.color} />)}
      {somaPositions.map((s, i) => (
        <NeuralSoma key={i} cx={s.cx} cy={s.cy} r={s.r} delay={Math.random() * 2} color={s.color} />
      ))}
    </svg>
  );
}
