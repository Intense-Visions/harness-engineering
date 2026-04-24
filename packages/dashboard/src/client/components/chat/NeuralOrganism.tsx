import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Bioluminescent neural organism — the system's living avatar.
 *
 * Disney's 12 Principles applied throughout. See individual components.
 *
 * Each mount generates a unique genome (random hue, axon subset, proportions)
 * so no two conversations produce the same creature. The organism starts as a
 * glowing egg and evolves into its mature form over `growthDuration` seconds.
 *
 * Fidelity tiers (once mature):
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

/** Clamp a linear ramp: returns 0 below `start`, 1 above `start + span`, linear between. */
function ramp(value: number, start: number, span: number): number {
  return Math.min(Math.max((value - start) / span, 0), 1);
}

/** Replace the alpha channel of an hsla/rgba color string. */
function withAlpha(color: string, alpha: number): string {
  return color.replace(/,\s*[\d.]+\)$/, `, ${alpha})`);
}

/* ── Genome & Palette ─────────────────────────────────────── */

interface Genome {
  hue: number;
  accentHue: number;
  eggAspect: number;
  coreScale: number;
  growthOffset: number;
  clusterAngle: number;
  clusterSpread: number;
  /** Rounds of mitosis: 3 → 8 cells, 4 → 16 cells */
  divisionRounds: number;
  /** Membrane boundary point count: 8 = blobby amoeba, 18 = smooth sphere */
  membraneLobes: number;
  /** Spark firing rate multiplier: 0.5 = calm, 2.0 = hyperactive */
  sparkRate: number;
  /** Number of main arms radiating from center (4-9) */
  armCount: number;
  /** Per-arm angle in radians */
  armAngles: number[];
  /** Per-arm length multiplier (0.6-1.3) */
  armLengths: number[];
  /** Per-arm signed curvature (-1.5 to 1.5) */
  armCurves: number[];
  /** Which adjacent arm pairs get connector arcs (~55% each) */
  connectorMask: boolean[];
  /** Body radius scale (0.75-1.2), multiplies membrane radii */
  bodyRadius: number;
  /**
   * Rare mutations — surprise traits that appear in ~10-15% of creatures.
   * Each is independently rolled, so a creature might have zero, one, or
   * (very rarely) multiple mutations stacked.
   */
  mutation: {
    /** Twin nucleus: two cores orbit each other instead of one cluster */
    twinCore: boolean;
    /** Bioluminescent rings: concentric pulsing rings around the body */
    rings: boolean;
    /** Comet tail: trailing particles when the organism drifts */
    cometTail: boolean;
    /** Ghost membrane: a second translucent membrane drifts offset */
    ghostMembrane: boolean;
  };
}

interface Palette {
  primary: string;
  primarySoft: string;
  primaryDeep: string;
  accent: string;
  accentAlt: string;
  core: string;
  sparkColors: string[];
  planktonColors: string[];
}

/** Arm data produced by generateArmData for each arm/connector. */
interface ArmDatum {
  d: string;
  baselen: number;
  weight: number;
  endX: number;
  endY: number;
}

function generateGenome(): Genome {
  const hue = Math.random() * 360;
  const accentHue = (hue + 140 + Math.random() * 40) % 360;

  const armCount = 4 + Math.floor(Math.random() * 6); // 4–9
  const baseSpacing = (Math.PI * 2) / armCount;
  const startAngle = Math.random() * Math.PI * 2;
  const armAngles = Array.from({ length: armCount }, (_, i) => {
    const symmetryJitter = (Math.random() - 0.5) * baseSpacing * 0.35;
    return startAngle + i * baseSpacing + symmetryJitter;
  });
  const armLengths = Array.from({ length: armCount }, () => 0.6 + Math.random() * 0.7);
  const armCurves = Array.from({ length: armCount }, () => (Math.random() - 0.5) * 3); // -1.5 to 1.5
  const connectorMask = Array.from({ length: armCount }, () => Math.random() < 0.55);

  return {
    hue,
    accentHue,
    eggAspect: 0.6 + Math.random() * 0.25,
    coreScale: 0.8 + Math.random() * 0.4,
    growthOffset: (Math.random() - 0.5) * 0.1,
    clusterAngle: Math.random() * Math.PI * 2,
    clusterSpread: 4 + Math.random() * 3.5,
    divisionRounds: 3 + Math.floor(Math.random() * 2), // 3–4 rounds → 8–16 cells
    membraneLobes: 8 + Math.floor(Math.random() * 11), // 8–18 boundary points
    sparkRate: 0.5 + Math.random() * 1.5, // 0.5–2.0 firing rate
    armCount,
    armAngles,
    armLengths,
    armCurves,
    connectorMask,
    bodyRadius: 0.75 + Math.random() * 0.45, // 0.75–1.2
    mutation: {
      twinCore: Math.random() < 0.12,
      rings: Math.random() < 0.1,
      cometTail: Math.random() < 0.1,
      ghostMembrane: Math.random() < 0.1,
    },
  };
}

/**
 * Generate procedural arm and connector path data from genome parameters.
 * Arms radiate from center (28,28) as quadratic bezier curves.
 * Connectors arc between adjacent arm endpoints.
 */
function generateArmData(genome: Genome): { arms: ArmDatum[]; connectors: ArmDatum[] } {
  const cx = 28;
  const cy = 28;
  const baseReach = 22;

  const arms: ArmDatum[] = [];
  for (let i = 0; i < genome.armCount; i++) {
    const angle = genome.armAngles[i]!;
    const lengthMul = genome.armLengths[i]!;
    const curvature = genome.armCurves[i]!;
    const reach = Math.min(baseReach * lengthMul, 24); // cap to stay in viewBox

    // Endpoint
    const endX = cx + Math.cos(angle) * reach;
    const endY = cy + Math.sin(angle) * reach;

    // Control point — perpendicular offset for curvature
    const midX = (cx + endX) / 2;
    const midY = (cy + endY) / 2;
    const perpAngle = angle + Math.PI / 2;
    const curveMag = curvature * reach * 0.35;
    const qx = midX + Math.cos(perpAngle) * curveMag;
    const qy = midY + Math.sin(perpAngle) * curveMag;

    const d = `M ${cx} ${cy} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`;
    const baselen = Math.sqrt((endX - cx) ** 2 + (endY - cy) ** 2) * 1.15; // path is longer than straight

    arms.push({ d, baselen, weight: 0.7 + Math.random() * 0.25, endX, endY });
  }

  const connectors: ArmDatum[] = [];
  for (let i = 0; i < genome.armCount; i++) {
    if (!genome.connectorMask[i]) continue;
    const a = arms[i]!;
    const b = arms[(i + 1) % genome.armCount]!;

    // Arc between the two endpoints via a control point pushed outward
    const arcMidX = (a.endX + b.endX) / 2;
    const arcMidY = (a.endY + b.endY) / 2;
    const toCenterX = cx - arcMidX;
    const toCenterY = cy - arcMidY;
    const dist = Math.sqrt(toCenterX ** 2 + toCenterY ** 2) || 1;
    // Push control point away from center for a convex arc
    const pushDist = dist * 0.4;
    const qx = arcMidX - (toCenterX / dist) * pushDist;
    const qy = arcMidY - (toCenterY / dist) * pushDist;

    const d = `M ${a.endX.toFixed(1)} ${a.endY.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${b.endX.toFixed(1)} ${b.endY.toFixed(1)}`;
    const baselen = Math.sqrt((b.endX - a.endX) ** 2 + (b.endY - a.endY) ** 2) * 1.1;

    connectors.push({ d, baselen, weight: 0.3 + Math.random() * 0.15, endX: b.endX, endY: b.endY });
  }

  return { arms, connectors };
}

function generatePalette(hue: number, accentHue: number): Palette {
  const accAlt = (accentHue + 20) % 360;
  return {
    primary: `hsla(${hue}, 68%, 73%, 1)`,
    primarySoft: `hsla(${hue}, 55%, 82%, 1)`,
    primaryDeep: `hsla(${hue}, 75%, 50%, 1)`,
    accent: `hsla(${accentHue}, 62%, 58%, 1)`,
    accentAlt: `hsla(${accAlt}, 55%, 55%, 1)`,
    core: `hsla(${hue}, 60%, 80%, 1)`,
    sparkColors: [
      `hsla(${(hue + 45) % 360}, 85%, 56%, 0.95)`,
      `hsla(${accentHue}, 70%, 55%, 0.9)`,
      `hsla(${(hue - 25 + 360) % 360}, 65%, 62%, 0.85)`,
      `hsla(${(hue + 90) % 360}, 60%, 60%, 0.9)`,
      `hsla(${hue}, 70%, 73%, 1)`,
      `hsla(${accAlt}, 60%, 58%, 1)`,
    ],
    planktonColors: [
      `hsla(${hue}, 55%, 73%, 1)`,
      `hsla(${hue}, 68%, 55%, 1)`,
      `hsla(${accentHue}, 62%, 58%, 1)`,
      `hsla(${accAlt}, 55%, 55%, 1)`,
      `hsla(${hue}, 55%, 82%, 1)`,
    ],
  };
}

/* ── Easing ────────────────────────────────────────────────── */

const BREATH_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
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
  const traceOpacity = 0.03 + weight * 0.06;
  const traceWidth = 0.4 + weight * 0.35;
  const pulseWidth = 0.6 + weight * 0.5;

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
      {hitCount > 0 && (
        <>
          {/* Primary whip — softer, colored, travels the axon */}
          <motion.path
            key={`whip-a-${hitCount}`}
            d={d}
            stroke={color}
            strokeWidth={traceWidth + 0.8}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`3 5`}
            initial={{ strokeDashoffset: 0, opacity: 0.25 }}
            animate={{
              strokeDashoffset: [0, -(len + 10)],
              opacity: [0.25, 0.18, 0.06, 0],
            }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ filter: 'blur(0.5px)' }}
          />
          {/* Secondary glow — wider, dimmer, follow-through */}
          <motion.path
            key={`whip-b-${hitCount}`}
            d={d}
            stroke={color}
            strokeWidth={traceWidth + 2}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`4 6`}
            initial={{ strokeDashoffset: 2, opacity: 0.12 }}
            animate={{
              strokeDashoffset: [2, -(len + 8)],
              opacity: [0.12, 0.08, 0.03, 0],
            }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: 0.08 }}
            style={{ filter: 'blur(2px)' }}
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
        style={{ opacity: 0.1, filter: 'blur(1.5px)' }}
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
        style={{ opacity: 0.4 }}
      />
    </>
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
  const breathDur = useMemo(() => jitter(3.5, 1.5), []);

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
          opacity: [0, jitter(0.07, 0.03), 0],
          r: [r + 1, r + jitter(4, 1), r + 1],
        }}
        transition={{ duration: breathDur * 1.3, delay, repeat: Infinity, ease: BREATH_EASE }}
      />
      <motion.circle
        cx={cx}
        cy={cy}
        r={r}
        fill={color}
        animate={{
          opacity: [0.2, 0.65, 0.2],
          r: [r * 0.9, r * jitter(1.06, 0.06), r * 0.9],
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
  const width = 0.8 + intensity * 1;
  return (
    <>
      {/* Soft glow halo */}
      <motion.path
        d={d}
        stroke={color}
        strokeWidth={width + 2}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`5 ${len + 4}`}
        initial={{ strokeDashoffset: 6, opacity: 0 }}
        animate={{ strokeDashoffset: -(len + 4), opacity: [0, intensity * 0.2, 0] }}
        transition={{ duration: speed * 1.5, ease: 'easeOut' }}
        style={{ filter: 'blur(2px)' }}
      />
      {/* Core spark */}
      <motion.path
        d={d}
        stroke={color}
        strokeWidth={width}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`3 ${len + 5}`}
        initial={{ strokeDashoffset: 5, opacity: 0 }}
        animate={{
          strokeDashoffset: -(len + 5),
          opacity: [0, intensity * 0.6, intensity * 0.35, 0],
        }}
        transition={{ duration: speed * 1.2, ease: 'easeOut' }}
      />
    </>
  );
}

/**
 * HeartbeatPulse — slow, breathing expansion/contraction.
 * Feels like a deep inhale/exhale rather than a sharp flash.
 */
function HeartbeatPulse({ primary, accent }: { primary: string; accent: string }) {
  const cycleDur = useMemo(() => jitter(6, 1.5), []);
  return (
    <>
      {/* Primary breath — slow expand then fade */}
      <motion.circle
        cx="28"
        cy="28"
        r="3"
        fill="none"
        stroke={primary}
        strokeWidth="0.8"
        animate={{
          r: [4, 18, 26],
          opacity: [0, 0.2, 0],
          strokeWidth: [0.6, 0.35, 0.1],
        }}
        transition={{
          duration: cycleDur,
          repeat: Infinity,
          ease: [0.25, 0.1, 0.25, 1],
        }}
      />
      {/* Accent breath — offset, slightly smaller, softer */}
      <motion.circle
        cx="28"
        cy="28"
        r="3"
        fill="none"
        stroke={accent}
        strokeWidth="0.5"
        animate={{
          r: [5, 15, 22],
          opacity: [0, 0.12, 0],
          strokeWidth: [0.4, 0.25, 0.06],
        }}
        transition={{
          duration: cycleDur * 0.85,
          repeat: Infinity,
          delay: cycleDur * 0.35,
          ease: [0.25, 0.1, 0.25, 1],
        }}
      />
    </>
  );
}

/**
 * Plankton — tiny bioluminescent particles drifting through the space.
 * Generates a stable pool of `pool` motes; renders only the first `count`.
 */
function Plankton({ count, pool, colors }: { count: number; pool: number; colors: string[] }) {
  const motes = useMemo(
    () =>
      Array.from({ length: pool }, () => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 12 + Math.random() * 18;
        const cx = 28 + Math.cos(angle) * dist;
        const cy = 28 + Math.sin(angle) * dist;
        // Bimodal size: mostly tiny marine snow, occasional larger motes
        const isLarge = Math.random() > 0.8;
        const r = isLarge ? 0.5 + Math.random() * 0.4 : 0.15 + Math.random() * 0.35;

        // Larger motes drift slower, smaller faster
        const driftScale = isLarge ? 0.6 : 1;
        const driftX = [
          0,
          jitter(0, 4 * driftScale),
          jitter(0, 3 * driftScale),
          jitter(0, 5 * driftScale),
          0,
        ];
        const driftY = [
          0,
          jitter(0, 5 * driftScale),
          jitter(0, 3 * driftScale),
          jitter(0, 4 * driftScale),
          0,
        ];
        const driftDur = isLarge ? jitter(28, 10) : jitter(16, 6);

        const blinkDur = isLarge ? jitter(5, 2) : jitter(2.5, 1);
        const blinkPeak = isLarge ? jitter(0.35, 0.15) : jitter(0.5, 0.2);
        const blinkDelay = Math.random() * 6;

        const color = colors[Math.floor(Math.random() * colors.length)]!;

        return { cx, cy, r, driftX, driftY, driftDur, blinkDur, blinkPeak, blinkDelay, color };
      }),
    [pool, colors]
  );

  return (
    <>
      {motes.slice(0, count).map((m, i) => (
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

function NeuralMembrane({
  color,
  tier,
  points = 14,
  scale = 1,
}: {
  color: string;
  tier: 'compact' | 'standard' | 'full';
  points?: number;
  /** Multiplies the base radii (18, 24, 27) for body size variation */
  scale?: number;
}) {
  const center = 28;
  const pts = points;

  const innerVariants = useMemo(
    () => Array.from({ length: 8 }, () => generateSmoothPath(center, pts, 18 * scale, 5 * scale)),
    [scale]
  );
  const outerVariants = useMemo(
    () => Array.from({ length: 8 }, () => generateSmoothPath(center, pts, 24 * scale, 7 * scale)),
    [scale]
  );
  const haloVariants = useMemo(
    () => Array.from({ length: 8 }, () => generateSmoothPath(center, pts, 27 * scale, 9 * scale)),
    [scale]
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

/**
 * Egg — the organism's initial form before hatching.
 * A bioluminescent ovoid with a gentle pulse and inner glow.
 * Wobbles increasingly as the organism prepares to emerge.
 */
function Egg({ growth, color, aspect }: { growth: number; color: string; aspect: number }) {
  const cx = 28;
  const cy = 28;
  const ry = 7;
  const rx = ry * aspect;
  const breathDur = useMemo(() => jitter(3.5, 0.5), []);

  const wobble = ramp(growth, 0.12, 0.1);

  return (
    <motion.g
      initial={{ scale: 0.2, opacity: 0 }}
      animate={{
        scale: 1,
        opacity: 1,
        rotate: wobble > 0 ? [0, -3 * wobble, 2.5 * wobble, -4 * wobble, 3 * wobble, 0] : 0,
      }}
      transition={{
        scale: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
        opacity: { duration: 0.8, ease: 'easeOut' },
        rotate: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
      }}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    >
      {/* Ambient glow field */}
      <motion.ellipse
        cx={cx}
        cy={cy}
        rx={rx + 6}
        ry={ry + 6}
        fill={withAlpha(color, 0.06)}
        animate={{
          rx: [rx + 4, rx + 9, rx + 4],
          ry: [ry + 4, ry + 9, ry + 4],
          opacity: [0.03, 0.1, 0.03],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: BREATH_EASE }}
        style={{ filter: 'blur(4px)' }}
      />
      {/* Shell glow */}
      <motion.ellipse
        cx={cx}
        cy={cy}
        rx={rx + 2}
        ry={ry + 2}
        fill={withAlpha(color, 0.12)}
        animate={{
          rx: [rx + 1, rx + 4, rx + 1],
          ry: [ry + 1, ry + 4, ry + 1],
          opacity: [0.06, 0.18, 0.06],
        }}
        transition={{ duration: breathDur, repeat: Infinity, ease: BREATH_EASE }}
        style={{ filter: 'blur(2.5px)' }}
      />
      {/* Egg shell */}
      <motion.ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill={withAlpha(color, 0.65)}
        stroke={withAlpha(color, 0.25)}
        strokeWidth={0.5}
        animate={{
          scaleX: [1, 0.94, 1.05, 0.97, 1],
          scaleY: [1, 1.07, 0.95, 1.04, 1],
          opacity: [0.55, 0.8, 0.6, 0.75, 0.55],
        }}
        transition={{ duration: breathDur, repeat: Infinity, ease: BREATH_EASE }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      {/* Inner luminescence — life stirring inside */}
      <motion.ellipse
        cx={cx}
        cy={cy}
        rx={rx * 0.4}
        ry={ry * 0.45}
        fill="rgba(255,255,255,0.45)"
        animate={{
          opacity: [0.12, 0.4, 0.18, 0.32, 0.12],
          rx: [rx * 0.3, rx * 0.5, rx * 0.35, rx * 0.45, rx * 0.3],
          ry: [ry * 0.35, ry * 0.55, ry * 0.4, ry * 0.5, ry * 0.35],
        }}
        transition={{ duration: breathDur * 0.7, repeat: Infinity, ease: BREATH_EASE }}
      />
    </motion.g>
  );
}

/**
 * DividingCells — the organism's core undergoes repeated mitosis.
 *
 * Uses an SVG goo filter (blur + color-matrix threshold) so that nearby
 * circles merge into a single organic blob. Each division round doubles
 * the cell count: 1 → 2 → 4 → 8 → 16. Positions are computed via
 * binary subdivision — each cell's ancestry determines its offset path.
 *
 * After maturity, cells continue to slowly drift and pulse, keeping
 * the organism feeling alive during long sessions.
 */
function DividingCells({
  growth,
  baseR,
  color,
  divisionRounds,
  clusterAngle,
  clusterSpread,
  growthOffset,
}: {
  growth: number;
  baseR: number;
  color: string;
  divisionRounds: number;
  clusterAngle: number;
  clusterSpread: number;
  growthOffset: number;
}) {
  const filterId = useMemo(() => `goo-${Math.random().toString(36).slice(2, 8)}`, []);
  const breathDur = useMemo(() => jitter(8, 2.5), []); // jellyfish-slow: 5.5–10.5s
  const drift = useMemo(
    () => ({
      x: [0, jitter(0, 1.2), jitter(0, 0.8), jitter(0, 1), 0],
      y: [0, jitter(0, 0.8), jitter(0, 1.2), jitter(0, 1), 0],
    }),
    []
  );

  // Division axes — each roughly perpendicular to the previous
  const axes = useMemo(() => {
    const a: number[] = [clusterAngle];
    for (let g = 1; g < divisionRounds; g++) {
      a.push(a[g - 1]! + Math.PI * (0.4 + Math.random() * 0.2));
    }
    return a;
  }, [clusterAngle, divisionRounds]);

  // Per-cell micro-drift offsets for long-session vitality
  const cellCount = 1 << divisionRounds; // 2^rounds
  const microDrifts = useMemo(
    () =>
      Array.from({ length: cellCount }, () => ({
        dx: [0, jitter(0, 0.6), jitter(0, 0.4), jitter(0, 0.5), 0],
        dy: [0, jitter(0, 0.4), jitter(0, 0.6), jitter(0, 0.5), 0],
        dur: jitter(14, 5),
      })),
    [cellCount]
  );

  const go = growthOffset;
  const cellAppear = ramp(growth, 0.15 + go, 0.12);

  if (cellAppear <= 0) return null;

  // Division progress per generation — staggered across growth timeline
  const divisionStart = 0.28;
  const divisionSpacing = 0.12;
  const divs: number[] = [];
  for (let g = 0; g < divisionRounds; g++) {
    divs.push(ramp(growth, divisionStart + g * divisionSpacing + go, 0.1));
  }

  // Spread per generation — decreases to keep cluster contained
  const spreads: number[] = [];
  let s = clusterSpread;
  for (let g = 0; g < divisionRounds; g++) {
    spreads.push(s);
    s *= 0.6;
  }

  // Cell radius — shrinks with each completed division
  const totalDivProgress = divs.reduce((sum, d) => sum + d, 0);
  const cellR = baseR * Math.pow(0.85, totalDivProgress);

  // Goo filter blur scales with cell size
  const gooBlur = (0.8 + cellR * 0.25).toFixed(1);

  // Generate cell positions via binary subdivision.
  // Each cell ID is a bitmask — bit g determines left/right at division g.
  const center = 28;
  const cells: Array<{ x: number; y: number; r: number }> = [];
  for (let id = 0; id < cellCount; id++) {
    let x = center;
    let y = center;
    for (let g = 0; g < divisionRounds; g++) {
      const bit = (id >> g) & 1;
      const sign = bit ? 1 : -1;
      const half = spreads[g]! * divs[g]! * 0.5;
      x += sign * Math.cos(axes[g]!) * half;
      y += sign * Math.sin(axes[g]!) * half;
    }
    cells.push({ x, y, r: cellR });
  }

  return (
    <motion.g
      animate={{ x: drift.x, y: drift.y }}
      transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      style={{ opacity: cellAppear, transition: 'opacity 0.5s ease-out' }}
    >
      <defs>
        <filter id={filterId}>
          <feGaussianBlur in="SourceGraphic" stdDeviation={gooBlur} result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -9"
          />
        </filter>
      </defs>

      {/* Goo-filtered cell bodies — organic merge / pinch / separate */}
      <motion.g
        filter={`url(#${filterId})`}
        animate={{
          scaleX: [1, 1.015, 0.985, 1.01, 0.99, 1],
          scaleY: [1, 0.99, 1.02, 0.985, 1.01, 1],
        }}
        transition={{ duration: breathDur, repeat: Infinity, ease: BREATH_EASE }}
        style={{ transformOrigin: '28px 28px' }}
      >
        {cells.map((c, i) => (
          <motion.circle
            key={i}
            cx={c.x}
            cy={c.y}
            r={c.r}
            animate={{ cx: c.x, cy: c.y, r: c.r }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            fill={color}
          />
        ))}
      </motion.g>

      {/* Per-cell overlays — glow + nucleus (capped at 6 for performance) */}
      {cells.slice(0, 6).map((c, i) => {
        const md = microDrifts[i]!;
        return (
          <motion.g
            key={`ov-${i}`}
            animate={{
              x: c.x - center + (md.dx as number[])[0]!,
              y: c.y - center + (md.dy as number[])[0]!,
            }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {/* Micro-drift — each cell wanders independently for long-session life */}
            <motion.g
              animate={{ x: md.dx, y: md.dy }}
              transition={{ duration: md.dur, repeat: Infinity, ease: 'easeInOut' }}
            >
              <motion.circle
                cx={center}
                cy={center}
                r={c.r + 2}
                fill={color}
                animate={{ opacity: [0, 0.08, 0.02, 0.06, 0] }}
                transition={{
                  duration: breathDur * 1.1,
                  repeat: Infinity,
                  ease: BREATH_EASE,
                  delay: (i * 0.37) % breathDur,
                }}
                style={{ filter: 'blur(1.5px)' }}
              />
              <motion.circle
                cx={center}
                cy={center}
                r={c.r * 0.25}
                fill="rgba(255,255,255,1)"
                animate={{ opacity: [0.04, 0.18, 0.06, 0.14, 0.04] }}
                transition={{
                  duration: breathDur * 0.8,
                  repeat: Infinity,
                  ease: BREATH_EASE,
                  delay: (i * 0.29) % breathDur,
                }}
              />
            </motion.g>
          </motion.g>
        );
      })}
    </motion.g>
  );
}

/* ── Main component ────────────────────────────────────────── */

export function NeuralOrganism({
  size = 56,
  growthDuration = 20,
}: {
  size?: number;
  /** Seconds for the organism to evolve from egg to full maturity. */
  growthDuration?: number;
}) {
  const tier = size <= 40 ? 'compact' : size <= 80 ? 'standard' : 'full';

  /* ── Unique genome + palette (once per mount) ──────────────── */

  const { genome, palette, armData } = useMemo(() => {
    const g = generateGenome();
    const p = generatePalette(g.hue, g.accentHue);
    const ad = generateArmData(g);
    return { genome: g, palette: p, armData: ad };
  }, []);

  /* ── Growth + age tracking ───────────────────────────────────
   *  `growth` ramps 0→1 over `growthDuration` (egg to mature).
   *  `age` keeps ticking (seconds since mount) so the organism
   *  stays alive during long sessions — slow color drift, spark
   *  frequency changes, and membrane undulation keep it fresh.
   */

  const [growth, setGrowth] = useState(0);
  const [age, setAge] = useState(0);

  useEffect(() => {
    const start = performance.now();
    // Tick at ~10 fps during growth, then slow to ~1 fps for age
    const timer = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      const linear = Math.min(elapsed / growthDuration, 1);
      const g = 1 - (1 - linear) * (1 - linear);
      setGrowth(g);
      setAge(elapsed);
      // Once mature, slow the tick rate to save CPU
      if (linear >= 1 && elapsed > growthDuration + 1) {
        clearInterval(timer);
        // Switch to slow ticks for long-session vitality
        const slow = setInterval(() => {
          setAge((performance.now() - start) / 1000);
        }, 2000);
        timerRef.current = slow;
      }
    }, 100);
    const timerRef = { current: timer };
    return () => clearInterval(timerRef.current);
  }, [growthDuration]);

  const growthRef = useRef(growth);
  growthRef.current = growth;

  /* ── Growth-derived visibility ──────────────────────────────── */

  const go = genome.growthOffset;
  const gr = (start: number, span: number) => ramp(growth, start + go, span);

  const eggOpacity = 1 - gr(0.2, 0.12);
  const membraneOpacity = gr(0.22, 0.18);

  const membraneTier: 'compact' | 'standard' | 'full' =
    tier === 'compact'
      ? 'compact'
      : growth < 0.5 + go
        ? 'compact'
        : growth < 0.75 + go || tier !== 'full'
          ? 'standard'
          : 'full';

  const planktonBase = tier === 'full' ? 14 : tier === 'standard' ? 6 : 0;
  const planktonPool = planktonBase + 4; // stable max pool — motes generated once
  // Visible count varies: grows during evolution, oscillates in long sessions
  const planktonBonus = growth >= 1 ? Math.floor(Math.sin(age * 0.03) * 2 + 2) : 0;
  const visiblePlankton = Math.floor((planktonBase + planktonBonus) * gr(0.65, 0.25));
  const showHeartbeat = growth >= 0.85 + go && tier === 'full';

  // Slow hue drift over long sessions — organism "ages" subtly
  // Shifts ±8° over ~10 minutes with a sine wave
  const hueDrift = growth >= 1 ? Math.sin(age * 0.005) * 8 : 0;
  const agedPalette = useMemo(() => {
    if (hueDrift === 0) return palette;
    const h = genome.hue + hueDrift;
    return generatePalette(h, genome.accentHue + hueDrift * 0.5);
  }, [Math.round(hueDrift * 2), genome.hue, genome.accentHue, palette]);

  /**
   * Two-layer rotation for complex, never-repeating organic motion:
   *  • Outer: slow continuous drift (full revolution in 50–130s)
   *  • Inner: faster wobble overlay (±20–70° oscillation, 15–35s)
   * Combined, these create Lissajous-like rotation that feels alive.
   */
  const rotation = useMemo(
    () => ({
      // Slow drift — one full revolution every 2–5 minutes
      driftDir: Math.random() > 0.5 ? 360 : -360,
      driftDur: jitter(200, 80), // 120–280 seconds per revolution
      // Gentle wobble with occasional larger swings
      wobbleAngles: [
        0,
        jitter(8, 5),
        jitter(-5, 4),
        jitter(25, 15), // occasional larger swing
        jitter(-6, 5),
        jitter(10, 6),
        jitter(-20, 12), // another occasional larger swing
        jitter(6, 4),
        0,
      ],
      wobbleDur: jitter(40, 15), // 25–55 seconds per wobble cycle
    }),
    []
  );

  // Keep a ref to armData for the spark effect to reference
  const armDataRef = useRef(armData);
  armDataRef.current = armData;

  const axons = useMemo(() => {
    if (tier === 'compact') return [];
    const allData = [...armData.arms, ...armData.connectors];
    const armCount = armData.arms.length;
    return allData.map((t, idx) => {
      const isConnector = idx >= armCount;
      return {
        origIdx: idx,
        d: perturbPath(t.d, 4),
        len: t.baselen,
        delay: Math.random() * 4,
        duration: jitter(1.4, 0.6),
        color: isConnector
          ? idx % 2 === 0
            ? agedPalette.accent
            : agedPalette.accentAlt
          : t.weight > 0.75
            ? agedPalette.primary
            : agedPalette.primaryDeep,
        repeatDelay: jitter(2.5, 1.5),
        weight: t.weight,
      };
    });
  }, [tier, armData, agedPalette]);

  const ringSomas = useMemo(() => {
    if (tier === 'compact') return [];
    const ringColor = withAlpha(agedPalette.primary, 0.9);
    const ringDeep = withAlpha(agedPalette.primaryDeep, 0.9);
    return armData.arms.map((arm, i) => ({
      cx: jitter(arm.endX, 1.5),
      cy: jitter(arm.endY, 1.5),
      r: jitter(1.6, 0.3),
      color: i % 3 === 2 ? ringDeep : ringColor,
      delay: Math.random() * 2,
    }));
  }, [tier, armData, agedPalette]);

  // Sparks — gated by growth
  const [sparks, setSparks] = useState<
    Array<{ id: number; d: string; len: number; color: string; speed: number; intensity: number }>
  >([]);
  const [anticipate, setAnticipate] = useState(false);
  const [axonHits, setAxonHits] = useState<number[]>(() => Array(20).fill(0) as number[]);
  const sparkIdRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (tier === 'compact') return;
    cancelledRef.current = false;

    const fire = () => {
      if (cancelledRef.current) return;

      const currentArmData = armDataRef.current;
      const allPaths = [...currentArmData.arms, ...currentArmData.connectors];

      if (growthRef.current < 0.55 + genome.growthOffset || allPaths.length === 0) {
        setTimeout(fire, 300 + Math.random() * 700);
        return;
      }

      setAnticipate(true);
      setTimeout(() => {
        if (cancelledRef.current) return;
        setAnticipate(false);

        const templateIdx = Math.floor(Math.random() * allPaths.length);
        const template = allPaths[templateIdx]!;
        const sparkId = ++sparkIdRef.current;
        const speed = jitter(0.5, 0.2);
        const intensity = jitter(0.8, 0.2);

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
            color:
              agedPalette.sparkColors[Math.floor(Math.random() * agedPalette.sparkColors.length)]!,
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

      const baseDelay = tier === 'full' ? 600 + Math.random() * 2000 : 1000 + Math.random() * 3500;
      const nextDelay = baseDelay / genome.sparkRate;
      setTimeout(fire, nextDelay);
    };

    const initialDelay = setTimeout(fire, 400 + Math.random() * 1500);
    return () => {
      cancelledRef.current = true;
      clearTimeout(initialDelay);
    };
  }, [tier, genome, agedPalette]);

  const coreR = useMemo(() => jitter(3.8, 0.3) * genome.coreScale, [genome.coreScale]);

  // Ring somas grow larger as the organism matures, becoming full cells
  const ringSomaScale = 1 + gr(0.7, 0.2) * 0.6;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      className="flex-shrink-0 overflow-visible"
      style={{ filter: size >= 80 ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' : undefined }}
    >
      {/* Depth gradient — subtle 3D volume lighting */}
      {size >= 80 && (
        <defs>
          <radialGradient id="depth-glow" cx="0.4" cy="0.35" r="0.6">
            <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
      )}
      {size >= 80 && (
        <circle
          cx="28"
          cy="28"
          r="22"
          fill="url(#depth-glow)"
          opacity={growth > 0.3 ? 0.7 : 0}
          style={{ transition: 'opacity 1s' }}
        />
      )}

      {/* Plankton — progressively appears in the medium */}
      {planktonPool > 0 && visiblePlankton > 0 && (
        <Plankton count={visiblePlankton} pool={planktonPool} colors={agedPalette.planktonColors} />
      )}

      {/* Slow continuous drift — like floating in a current */}
      <motion.g
        animate={{ rotate: [0, rotation.driftDir] }}
        transition={{ duration: rotation.driftDur, repeat: Infinity, ease: 'linear' }}
        style={{ transformOrigin: '28px 28px' }}
      >
        {/* Faster wobble overlay — organic oscillation */}
        <motion.g
          animate={{ rotate: rotation.wobbleAngles }}
          transition={{ duration: rotation.wobbleDur, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '28px 28px' }}
        >
          {/* Egg — visible in early growth, fades as organism emerges */}
          {eggOpacity > 0 && (
            <g style={{ opacity: eggOpacity, transition: 'opacity 0.5s ease-out' }}>
              <Egg growth={growth} color={agedPalette.primary} aspect={genome.eggAspect} />
            </g>
          )}

          {/* Membrane — fades in as the egg dissolves */}
          {membraneOpacity > 0 && (
            <g style={{ opacity: membraneOpacity, transition: 'opacity 0.5s ease-out' }}>
              <NeuralMembrane
                color={agedPalette.primary}
                tier={membraneTier}
                points={genome.membraneLobes}
                scale={genome.bodyRadius}
              />
            </g>
          )}

          {showHeartbeat && (
            <HeartbeatPulse primary={agedPalette.primary} accent={agedPalette.accent} />
          )}

          {/* Axons — staggered appearance as the organism develops */}
          {axons.map((a, i) => {
            const appearAt = 0.3 + go + (i / Math.max(axons.length - 1, 1)) * 0.3;
            const opacity = ramp(growth, appearAt, 0.1);
            if (opacity <= 0) return null;
            return (
              <g key={a.origIdx} style={{ opacity, transition: 'opacity 0.5s ease-out' }}>
                <NeuralAxon
                  d={a.d}
                  len={a.len}
                  delay={a.delay}
                  duration={a.duration}
                  color={a.color}
                  repeatDelay={a.repeatDelay}
                  weight={a.weight}
                  hitCount={axonHits[a.origIdx] ?? 0}
                />
              </g>
            );
          })}

          {/* Sparks — only when organism has developed enough */}
          {growth >= 0.55 + go &&
            sparks.map((s) => (
              <SpontaneousSpark
                key={s.id}
                d={s.d}
                len={s.len}
                color={s.color}
                speed={s.speed}
                intensity={s.intensity}
              />
            ))}

          {/* Ring somas — staggered appearance at axon tips */}
          {ringSomas.map((s, i) => {
            const appearAt = 0.5 + go + (i / Math.max(ringSomas.length - 1, 1)) * 0.2;
            const opacity = ramp(growth, appearAt, 0.1);
            if (opacity <= 0) return null;
            return (
              <g key={i} style={{ opacity, transition: 'opacity 0.5s ease-out' }}>
                <RingSoma
                  cx={s.cx}
                  cy={s.cy}
                  r={s.r * ringSomaScale}
                  delay={s.delay}
                  color={s.color}
                />
              </g>
            );
          })}

          {/* Dividing cells — mitosis from single cell to morula */}
          <DividingCells
            growth={growth}
            baseR={coreR}
            color={agedPalette.core}
            divisionRounds={genome.divisionRounds}
            clusterAngle={genome.clusterAngle}
            clusterSpread={genome.clusterSpread}
            growthOffset={go}
          />

          {/* Subtle inner warmth when a spark is about to fire */}
          <AnimatePresence>
            {anticipate && growth >= 0.55 + go && tier !== 'compact' && (
              <motion.circle
                key="anticipation"
                cx="28"
                cy="28"
                r={coreR + 2}
                fill="rgba(255,255,255,1)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.08 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{ filter: 'blur(2px)' }}
              />
            )}
          </AnimatePresence>

          {/* ── Rare mutations ─────────────────────────────────── */}

          {/* Bioluminescent rings — concentric pulsing halos */}
          {genome.mutation.rings && growth > 0.7 && (
            <>
              <motion.circle
                cx="28" cy="28" r="12"
                fill="none" stroke={agedPalette.primary}
                strokeWidth="0.3"
                animate={{
                  r: [10, 14, 10],
                  opacity: [0, 0.12, 0],
                  strokeWidth: [0.2, 0.4, 0.2],
                }}
                transition={{ duration: 7, repeat: Infinity, ease: BREATH_EASE }}
              />
              <motion.circle
                cx="28" cy="28" r="20"
                fill="none" stroke={agedPalette.accent}
                strokeWidth="0.2"
                animate={{
                  r: [17, 22, 17],
                  opacity: [0, 0.08, 0],
                  strokeWidth: [0.15, 0.3, 0.15],
                }}
                transition={{ duration: 9.5, repeat: Infinity, ease: BREATH_EASE, delay: 2 }}
              />
            </>
          )}

          {/* Ghost membrane — a second translucent membrane drifts offset */}
          {genome.mutation.ghostMembrane && growth > 0.6 && (
            <motion.g
              animate={{ x: [0, 2.5, -1.5, 3, 0], y: [0, -2, 3, -1, 0] }}
              transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
              style={{ opacity: 0.3 }}
            >
              <NeuralMembrane
                color={agedPalette.accent}
                tier="compact"
                points={Math.max(6, genome.membraneLobes - 3)}
                scale={genome.bodyRadius * 0.85}
              />
            </motion.g>
          )}

          {/* Comet tail — trailing particles when the organism drifts */}
          {genome.mutation.cometTail && growth > 0.5 && (
            <>
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.circle
                  key={`tail-${i}`}
                  cx="28" cy="28"
                  r={0.5 + i * 0.15}
                  fill={agedPalette.primary}
                  animate={{
                    x: [0, -(4 + i * 3), -(2 + i * 2), -(5 + i * 2.5), 0],
                    y: [0, (2 + i * 1.5), -(1 + i), (3 + i * 0.8), 0],
                    opacity: [0, 0.2 - i * 0.03, 0.05, 0.15 - i * 0.02, 0],
                  }}
                  transition={{
                    duration: 12 + i * 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.8,
                  }}
                  style={{ filter: 'blur(1px)' }}
                />
              ))}
            </>
          )}
        </motion.g>
        {/* /wobble */}
      </motion.g>
      {/* /drift */}
    </svg>
  );
}
