import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Bioluminescent neural organism — the system's living avatar.
 *
 * Disney's 12 Principles applied throughout. See individual components.
 *
 * Fidelity tiers:
 *   ≤ 40px  →  compact: core soma + membrane only
 *   ≤ 72px  →  standard: + axons, sparks, plankton (6)
 *   > 72px  →  full: + halo, heartbeat, all somas, plankton (14)
 */

/* ── Utilities ─────────────────────────────────────────────── */

function jitter(base: number, range: number): number {
  return base + (Math.random() - 0.5) * 2 * range;
}

function perturbPath(d: string, amount: number): string {
  return d.replace(/Q\s+([\d.]+)\s+([\d.]+)/, (_, qx, qy) => {
    const nx = parseFloat(qx) + (Math.random() - 0.5) * 2 * amount;
    const ny = parseFloat(qy) + (Math.random() - 0.5) * 2 * amount;
    return `Q ${nx.toFixed(1)} ${ny.toFixed(1)}`;
  });
}

function generateSmoothPath(
  center: number,
  points: number,
  baseRadius: number,
  variance: number
): string {
  const coords = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = baseRadius + (Math.random() - 0.5) * variance;
    coords.push({
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
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
}

/* ── Easing ────────────────────────────────────────────────── */

const BREATH_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
const SPARK_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const AXON_EASE: [number, number, number, number] = [0.7, 0, 0.3, 1];

/* ── Sub-components ────────────────────────────────────────── */

interface NeuralAxonProps {
  d: string;
  len: number;
  delay: number;
  duration: number;
  color: string;
  repeatDelay: number;
  weight: number;
  /** Increments each time a spark hits this axon, triggering a wobble */
  hitCount: number;
}

function NeuralAxon({
  d,
  len,
  delay,
  duration,
  color,
  repeatDelay,
  weight,
  hitCount,
}: NeuralAxonProps) {
  const traceOpacity = 0.04 + weight * 0.08;
  const traceWidth = 0.4 + weight * 0.4;
  const pulseWidth = 0.8 + weight * 0.6;

  return (
    <>
      <path
        d={d}
        stroke={color}
        strokeWidth={traceWidth}
        opacity={traceOpacity}
        fill="none"
        strokeLinecap="round"
      />
      {/* Spark-induced whip wobble — energy wave propagates down the axon.
          Two overlapping waves at different phases create the ripple effect.
          Remounts on each hit via key, plays once then fades. */}
      {hitCount > 0 && (
        <>
          {/* Primary wave — fast, bright, short dash */}
          <motion.path
            key={`whip-a-${hitCount}`}
            d={d}
            stroke="rgba(255,255,255,1)"
            strokeWidth={traceWidth + 1.5}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`2 4`}
            initial={{ strokeDashoffset: 0, opacity: 0.5 }}
            animate={{
              strokeDashoffset: [0, -(len + 10)],
              opacity: [0.5, 0.35, 0.15, 0],
            }}
            transition={{ duration: 0.35, ease: SPARK_EASE }}
            style={{ filter: 'blur(0.5px)' }}
          />
          {/* Secondary wave — slower, wider, softer. Follow-through. */}
          <motion.path
            key={`whip-b-${hitCount}`}
            d={d}
            stroke={color}
            strokeWidth={traceWidth + 2.5}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`3 5`}
            initial={{ strokeDashoffset: 2, opacity: 0.3 }}
            animate={{
              strokeDashoffset: [2, -(len + 8)],
              opacity: [0.3, 0.2, 0.08, 0],
            }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.06 }}
            style={{ filter: 'blur(1.5px)' }}
          />
        </>
      )}
      <motion.path
        d={d}
        stroke={color}
        strokeWidth={pulseWidth + 2}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`6 ${len + 6}`}
        animate={{ strokeDashoffset: [8, -(len + 8)] }}
        transition={{ duration, delay, repeat: Infinity, ease: AXON_EASE, repeatDelay }}
        style={{ opacity: 0.15, filter: 'blur(1.5px)' }}
      />
      <motion.path
        d={d}
        stroke={color}
        strokeWidth={pulseWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`3.5 ${len + 8}`}
        animate={{ strokeDashoffset: [8, -(len + 8)] }}
        transition={{ duration, delay, repeat: Infinity, ease: AXON_EASE, repeatDelay }}
        style={{ opacity: 0.75 }}
      />
    </>
  );
}

function CoreSoma({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const breathDur = useMemo(() => jitter(4, 0.8), []);
  const glowDur = useMemo(() => jitter(4.5, 1), []);
  const drift = useMemo(
    () => ({
      x: [0, jitter(0, 1.2), jitter(0, 0.8), jitter(0, 1), 0],
      y: [0, jitter(0, 0.8), jitter(0, 1.2), jitter(0, 1), 0],
    }),
    []
  );

  return (
    <motion.g
      animate={{ x: drift.x, y: drift.y }}
      transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
    >
      <motion.circle
        cx={cx}
        cy={cy}
        r={r + 4}
        fill="rgba(196,167,255,1)"
        animate={{
          opacity: [0, 0.18, 0.06, 0.14, 0],
          r: [r + 2, r + 9, r + 4, r + 7, r + 2],
        }}
        transition={{ duration: glowDur, repeat: Infinity, ease: BREATH_EASE }}
      />
      <motion.circle
        cx={cx}
        cy={cy}
        r={r}
        fill="rgba(196,167,255,1)"
        animate={{
          opacity: [0.3, 1, 0.45, 0.85, 0.3],
          scaleX: [1, 0.92, 1.06, 0.96, 1],
          scaleY: [1, 1.1, 0.94, 1.05, 1],
        }}
        transition={{ duration: breathDur, repeat: Infinity, ease: BREATH_EASE }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      <motion.circle
        cx={cx}
        cy={cy}
        r={r * 0.4}
        fill="rgba(255,255,255,1)"
        animate={{ opacity: [0.15, 0.5, 0.2, 0.4, 0.15] }}
        transition={{ duration: breathDur, repeat: Infinity, ease: BREATH_EASE }}
      />
    </motion.g>
  );
}

function RingSoma({
  cx,
  cy,
  r,
  delay,
  color,
}: {
  cx: number;
  cy: number;
  r: number;
  delay: number;
  color: string;
}) {
  const drift = useMemo(
    () => ({
      x: [0, jitter(0, 2), jitter(0, 1.5), jitter(0, 2.5), 0],
      y: [0, jitter(0, 1.5), jitter(0, 2.5), jitter(0, 2), 0],
      dur: jitter(8, 3),
    }),
    []
  );
  const breathDur = useMemo(() => jitter(2, 0.5), []);

  return (
    <motion.g
      animate={{ x: drift.x, y: drift.y }}
      transition={{ duration: drift.dur, repeat: Infinity, ease: 'easeInOut' }}
    >
      <motion.circle
        cx={cx}
        cy={cy}
        r={r + 2.5}
        fill={color}
        animate={{
          opacity: [0, jitter(0.1, 0.04), 0],
          r: [r + 1.5, r + jitter(5, 1), r + 1.5],
        }}
        transition={{ duration: breathDur * 1.3, delay, repeat: Infinity, ease: BREATH_EASE }}
      />
      <motion.circle
        cx={cx}
        cy={cy}
        r={r}
        fill={color}
        animate={{
          opacity: [0.35, 0.9, 0.35],
          r: [r * 0.85, r * jitter(1.08, 0.1), r * 0.85],
        }}
        transition={{ duration: breathDur, delay, repeat: Infinity, ease: BREATH_EASE }}
      />
    </motion.g>
  );
}

function SpontaneousSpark({
  d,
  len,
  color,
  speed,
  intensity,
}: {
  d: string;
  len: number;
  color: string;
  speed: number;
  intensity: number;
}) {
  const width = 1 + intensity * 1.5;
  return (
    <>
      <motion.path
        d={d}
        stroke={color}
        strokeWidth={width + 2.5}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`5 ${len + 4}`}
        initial={{ strokeDashoffset: 6, opacity: 0 }}
        animate={{ strokeDashoffset: -(len + 4), opacity: [0, intensity * 0.35, 0] }}
        transition={{ duration: speed * 1.3, ease: 'easeOut' }}
        style={{ filter: 'blur(2px)' }}
      />
      <motion.path
        d={d}
        stroke={color}
        strokeWidth={width}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`3 ${len + 5}`}
        initial={{ strokeDashoffset: 5, opacity: 0 }}
        animate={{ strokeDashoffset: -(len + 5), opacity: [0, intensity, intensity * 0.7, 0] }}
        transition={{ duration: speed, ease: SPARK_EASE }}
      />
    </>
  );
}

function HeartbeatPulse() {
  const dur = useMemo(() => jitter(7, 1.5), []);
  return (
    <>
      <motion.circle
        cx="28"
        cy="28"
        r="3"
        fill="none"
        stroke="rgba(196,167,255,1)"
        strokeWidth="0.8"
        animate={{ r: [3, 28], opacity: [0.35, 0], strokeWidth: [0.8, 0.15] }}
        transition={{ duration: 2.5, repeat: Infinity, repeatDelay: dur, ease: SPARK_EASE }}
      />
      <motion.circle
        cx="28"
        cy="28"
        r="3"
        fill="none"
        stroke="rgba(34,211,238,1)"
        strokeWidth="0.5"
        animate={{ r: [3, 24], opacity: [0.2, 0], strokeWidth: [0.5, 0.08] }}
        transition={{
          duration: 2,
          repeat: Infinity,
          repeatDelay: dur + 0.5,
          delay: 0.4,
          ease: SPARK_EASE,
        }}
      />
    </>
  );
}

/**
 * Plankton — tiny bioluminescent particles drifting through the space.
 * Each mote has its own drift path, blink rhythm, and size.
 * They drift lazily, flickering in and out like marine snow.
 */
function Plankton({ count }: { count: number }) {
  const motes = useMemo(
    () =>
      Array.from({ length: count }, () => {
        // Scatter in the full viewbox, weighted toward the periphery
        const angle = Math.random() * Math.PI * 2;
        const dist = 12 + Math.random() * 18;
        const cx = 28 + Math.cos(angle) * dist;
        const cy = 28 + Math.sin(angle) * dist;
        const r = 0.25 + Math.random() * 0.55;

        // Lazy drift — wanders a small area
        const driftX = [0, jitter(0, 4), jitter(0, 3), jitter(0, 5), 0];
        const driftY = [0, jitter(0, 5), jitter(0, 3), jitter(0, 4), 0];
        const driftDur = jitter(18, 8);

        // Blink — some fast flickers, some slow pulses
        const blinkDur = jitter(3, 1.5);
        const blinkPeak = jitter(0.5, 0.25);
        const blinkDelay = Math.random() * 6;

        // Color — mostly violet/cyan family, dim
        const colors = [
          'rgba(167,139,250,1)',
          'rgba(139,92,246,1)',
          'rgba(34,211,238,1)',
          'rgba(45,212,191,1)',
          'rgba(196,167,255,1)',
        ];
        const color = colors[Math.floor(Math.random() * colors.length)]!;

        return { cx, cy, r, driftX, driftY, driftDur, blinkDur, blinkPeak, blinkDelay, color };
      }),
    [count]
  );

  return (
    <>
      {motes.map((m, i) => (
        <motion.circle
          key={`plankton-${i}`}
          cx={m.cx}
          cy={m.cy}
          r={m.r}
          fill={m.color}
          animate={{
            x: m.driftX,
            y: m.driftY,
            opacity: [0, m.blinkPeak, 0.05, m.blinkPeak * 0.6, 0],
          }}
          transition={{
            x: { duration: m.driftDur, repeat: Infinity, ease: 'easeInOut' },
            y: { duration: m.driftDur * 1.1, repeat: Infinity, ease: 'easeInOut' },
            opacity: {
              duration: m.blinkDur,
              delay: m.blinkDelay,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          }}
        />
      ))}
    </>
  );
}

function NeuralMembrane({ color, tier }: { color: string; tier: 'compact' | 'standard' | 'full' }) {
  const center = 28;
  const pts = 14;

  const innerVariants = useMemo(
    () => Array.from({ length: 8 }, () => generateSmoothPath(center, pts, 18, 5)),
    []
  );
  const outerVariants = useMemo(
    () => Array.from({ length: 8 }, () => generateSmoothPath(center, pts, 24, 7)),
    []
  );
  const haloVariants = useMemo(
    () => Array.from({ length: 8 }, () => generateSmoothPath(center, pts, 27, 9)),
    []
  );

  const innerDur = useMemo(() => jitter(12, 2), []);
  const outerDur = useMemo(() => jitter(15, 2), []);
  const haloDur = useMemo(() => jitter(18, 3), []);

  return (
    <>
      {tier === 'full' && (
        <motion.path
          d={haloVariants[0]}
          animate={{ d: haloVariants }}
          transition={{
            duration: haloDur,
            repeat: Infinity,
            ease: 'easeInOut',
            repeatType: 'reverse',
          }}
          fill={color.replace('1)', '0.012)')}
          stroke={color}
          strokeWidth="0.15"
          strokeOpacity="0.04"
          style={{ filter: 'blur(3px)' }}
        />
      )}

      {tier !== 'compact' && (
        <motion.path
          d={outerVariants[0]}
          animate={{ d: outerVariants }}
          transition={{
            duration: outerDur,
            repeat: Infinity,
            ease: 'easeInOut',
            repeatType: 'reverse',
          }}
          fill={color.replace('1)', '0.02)')}
          stroke={color}
          strokeWidth="0.3"
          strokeOpacity="0.07"
          style={{ filter: 'blur(2px)' }}
        />
      )}

      <motion.path
        d={innerVariants[0]}
        animate={{ d: innerVariants }}
        transition={{
          duration: innerDur,
          repeat: Infinity,
          ease: 'easeInOut',
          repeatType: 'reverse',
        }}
        fill={color.replace('1)', '0.035)')}
        stroke={color}
        strokeWidth={tier === 'compact' ? '0.4' : '0.5'}
        strokeOpacity={tier === 'compact' ? '0.12' : '0.14'}
        style={{ filter: tier === 'compact' ? 'blur(1px)' : 'blur(1.5px)' }}
      />
    </>
  );
}

/* ── Constants ─────────────────────────────────────────────── */

const AXON_TEMPLATES = [
  { d: 'M 28 28 Q 20 18 28 6', baselen: 25, color: 'rgba(167,139,250,1)', weight: 0.9 },
  { d: 'M 28 28 Q 40 18 49 14', baselen: 26, color: 'rgba(139,92,246,1)', weight: 0.8 },
  { d: 'M 28 28 Q 42 30 52 30', baselen: 26, color: 'rgba(109,40,217,1)', weight: 0.7 },
  { d: 'M 28 28 Q 38 40 42 50', baselen: 26, color: 'rgba(167,139,250,1)', weight: 0.8 },
  { d: 'M 28 28 Q 16 40 12 50', baselen: 26, color: 'rgba(139,92,246,1)', weight: 0.7 },
  { d: 'M 28 28 Q 14 30 4 30', baselen: 26, color: 'rgba(109,40,217,1)', weight: 0.8 },
  { d: 'M 28 28 Q 16 18 7 14', baselen: 26, color: 'rgba(167,139,250,1)', weight: 0.9 },
  { d: 'M 28 6 Q 40 8 49 14', baselen: 23, color: 'rgba(45,212,191,1)', weight: 0.4 },
  { d: 'M 49 14 Q 54 22 52 30', baselen: 20, color: 'rgba(45,212,191,1)', weight: 0.3 },
  { d: 'M 7 14 Q 4 22 4 30', baselen: 20, color: 'rgba(34,211,238,1)', weight: 0.35 },
  { d: 'M 12 50 Q 6 40 4 30', baselen: 24, color: 'rgba(34,211,238,1)', weight: 0.4 },
];

const SPARK_COLORS = [
  'rgba(251,191,36,0.95)',
  'rgba(52,211,153,0.9)',
  'rgba(248,113,113,0.85)',
  'rgba(96,165,250,0.9)',
  'rgba(167,139,250,1)',
  'rgba(45,212,191,1)',
];

/* ── Main component ────────────────────────────────────────── */

export function NeuralOrganism({ size = 56 }: { size?: number }) {
  const tier = size <= 40 ? 'compact' : size <= 80 ? 'standard' : 'full';

  /**
   * Wandering rotation — the organism slowly drifts rotationally,
   * reversing direction unpredictably. Multi-keyframe path through
   * random angles prevents mechanical spinning.
   */
  const rotation = useMemo(
    () => ({
      angles: [0, jitter(12, 8), jitter(-6, 5), jitter(18, 10), jitter(-10, 8), jitter(8, 6), 0],
      dur: jitter(40, 12),
    }),
    []
  );

  const axons = useMemo(
    () =>
      tier === 'compact'
        ? []
        : AXON_TEMPLATES.map((t) => ({
            d: perturbPath(t.d, 4),
            len: t.baselen,
            delay: Math.random() * 4,
            duration: jitter(1.4, 0.6),
            color: t.color,
            repeatDelay: jitter(2.5, 1.5),
            weight: t.weight,
          })),
    [tier]
  );

  const ringSomas = useMemo(() => {
    if (tier === 'compact') return [];
    return [
      {
        cx: jitter(28, 1.5),
        cy: jitter(6, 1.5),
        r: jitter(1.6, 0.3),
        color: 'rgba(139,92,246,0.9)',
      },
      {
        cx: jitter(49, 1.5),
        cy: jitter(14, 1.5),
        r: jitter(1.6, 0.3),
        color: 'rgba(139,92,246,0.9)',
      },
      {
        cx: jitter(52, 1.5),
        cy: jitter(30, 1.5),
        r: jitter(1.6, 0.3),
        color: 'rgba(109,40,217,0.9)',
      },
      {
        cx: jitter(42, 1.5),
        cy: jitter(50, 1.5),
        r: jitter(1.6, 0.3),
        color: 'rgba(139,92,246,0.9)',
      },
      {
        cx: jitter(12, 1.5),
        cy: jitter(50, 1.5),
        r: jitter(1.6, 0.3),
        color: 'rgba(139,92,246,0.9)',
      },
      {
        cx: jitter(4, 1.5),
        cy: jitter(30, 1.5),
        r: jitter(1.6, 0.3),
        color: 'rgba(109,40,217,0.9)',
      },
      {
        cx: jitter(7, 1.5),
        cy: jitter(14, 1.5),
        r: jitter(1.6, 0.3),
        color: 'rgba(139,92,246,0.9)',
      },
    ];
  }, [tier]);

  const planktonCount = tier === 'full' ? 14 : tier === 'standard' ? 6 : 0;

  // Sparks with anticipation + axon hit tracking
  const [sparks, setSparks] = useState<
    Array<{ id: number; d: string; len: number; color: string; speed: number; intensity: number }>
  >([]);
  const [anticipate, setAnticipate] = useState(false);
  // Counts how many times each axon template has been hit by a spark.
  // Incrementing triggers the wobble animation via key remount.
  const [axonHits, setAxonHits] = useState<number[]>(() => AXON_TEMPLATES.map(() => 0));
  const sparkIdRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (tier === 'compact') return;
    cancelledRef.current = false;

    const fire = () => {
      if (cancelledRef.current) return;

      setAnticipate(true);
      setTimeout(() => {
        if (cancelledRef.current) return;
        setAnticipate(false);

        const templateIdx = Math.floor(Math.random() * AXON_TEMPLATES.length);
        const template = AXON_TEMPLATES[templateIdx]!;
        const sparkId = ++sparkIdRef.current;
        const speed = jitter(0.5, 0.2);
        const intensity = jitter(0.8, 0.2);

        // Register hit on this axon — triggers wobble
        setAxonHits((prev) => {
          const next = [...prev];
          next[templateIdx] = (next[templateIdx] ?? 0) + 1;
          return next;
        });

        setSparks((prev) => [
          ...prev,
          {
            id: sparkId,
            d: perturbPath(template.d, 6),
            len: template.baselen,
            color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)]!,
            speed,
            intensity,
          },
        ]);
        setTimeout(
          () => {
            setSparks((prev) => prev.filter((s) => s.id !== sparkId));
          },
          speed * 1.3 * 1000 + 400
        );
      }, 180);

      const nextDelay = tier === 'full' ? 600 + Math.random() * 2000 : 1000 + Math.random() * 3500;
      setTimeout(fire, nextDelay);
    };

    const initialDelay = setTimeout(fire, 400 + Math.random() * 1500);
    return () => {
      cancelledRef.current = true;
      clearTimeout(initialDelay);
    };
  }, [tier]);

  const coreR = useMemo(() => jitter(3.8, 0.3), []);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      className="flex-shrink-0 overflow-visible"
    >
      {/* Plankton — behind everything, drifting in the medium */}
      {planktonCount > 0 && <Plankton count={planktonCount} />}

      {/* Wandering rotation wrapper — organism body rotates slowly, changing direction */}
      <motion.g
        animate={{ rotate: rotation.angles }}
        transition={{
          duration: rotation.dur,
          repeat: Infinity,
          ease: 'easeInOut',
          repeatType: 'reverse',
        }}
        style={{ transformOrigin: '28px 28px' }}
      >
        <NeuralMembrane color="rgba(167,139,250,1)" tier={tier} />

        {tier === 'full' && <HeartbeatPulse />}

        {axons.map((a, i) => (
          <NeuralAxon key={i} {...a} hitCount={axonHits[i] ?? 0} />
        ))}

        {sparks.map((s) => (
          <SpontaneousSpark
            key={s.id}
            d={s.d}
            len={s.len}
            color={s.color}
            speed={s.speed}
            intensity={s.intensity}
          />
        ))}

        {ringSomas.map((s, i) => (
          <RingSoma key={i} cx={s.cx} cy={s.cy} r={s.r} delay={Math.random() * 2} color={s.color} />
        ))}

        <CoreSoma cx={28} cy={28} r={coreR} />

        <AnimatePresence>
          {anticipate && tier !== 'compact' && (
            <motion.circle
              key="anticipation"
              cx="28"
              cy="28"
              r={coreR + 3}
              fill="rgba(255,255,255,1)"
              initial={{ opacity: 0, r: coreR }}
              animate={{ opacity: 0.35, r: coreR + 3 }}
              exit={{ opacity: 0, r: coreR + 5 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            />
          )}
        </AnimatePresence>
      </motion.g>
    </svg>
  );
}
