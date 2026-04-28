import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import { useProjectPulse } from '../../hooks/useProjectPulse';

interface PlanktonData {
  id: number;
  left: string;
  top: string;
  size: number;
  color: string;
  driftX: string;
  driftY: string;
  driftScale: number;
  duration: string;
  delay: string;
}

const PLANKTON_COLORS = [
  'rgba(12, 106, 158, 0.4)',
  'rgba(14, 143, 160, 0.35)',
  'rgba(10, 80, 120, 0.3)',
  'rgba(16, 185, 129, 0.25)',
  'rgba(8, 104, 120, 0.3)',
];

function generatePlankton(count: number): PlanktonData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: 1.5 + Math.random() * 3,
    color: PLANKTON_COLORS[i % PLANKTON_COLORS.length]!,
    driftX: `${(Math.random() - 0.5) * 120}px`,
    driftY: `${(Math.random() - 0.5) * 80 - 30}px`,
    driftScale: 0.6 + Math.random() * 0.8,
    duration: `${15 + Math.random() * 25}s`,
    delay: `${Math.random() * -20}s`,
  }));
}

interface Props {
  mouseX: number;
  mouseY: number;
}

export function AuraBackground({ mouseX, mouseY }: Props) {
  const { pulse } = useProjectPulse();
  const plankton = useMemo(() => generatePlankton(18), []);
  const springConfig = { damping: 50, stiffness: 100 };
  const x = useSpring(0, springConfig);
  const y = useSpring(0, springConfig);

  useEffect(() => {
    x.set(mouseX);
    y.set(mouseY);
  }, [mouseX, mouseY, x, y]);

  const moveX = useTransform(x, [0, 2000], [20, -20]);
  const moveY = useTransform(y, [0, 1200], [20, -20]);
  const moveXDeep = useTransform(x, [0, 2000], [40, -40]);
  const moveYDeep = useTransform(y, [0, 1200], [40, -40]);
  const moveXAbyss = useTransform(x, [0, 2000], [10, -10]);
  const moveYAbyss = useTransform(y, [0, 1200], [10, -10]);

  // Stress shifts bioluminescence from cool blue to warning amber
  const isStressed = pulse.stressLevel > 0.5;

  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden transition-colors duration-1000"
      style={{
        background: 'linear-gradient(180deg, #010408 0%, #020a14 30%, #030e1c 60%, #010610 100%)',
      }}
    >
      {/* Deep bioluminescent glow — drifting upper left */}
      <motion.div
        style={{
          x: moveX,
          y: moveY,
          background: isStressed
            ? 'radial-gradient(ellipse, rgba(180, 80, 20, 0.08) 0%, rgba(120, 40, 10, 0.03) 50%, transparent 70%)'
            : 'radial-gradient(ellipse, rgba(12, 106, 158, 0.08) 0%, rgba(8, 104, 120, 0.03) 50%, transparent 70%)',
        }}
        animate={{
          scale: [1, 1.12, 0.95, 1.05, 1],
          opacity: [0.5, 0.7, 0.4, 0.65, 0.5],
          x: [0, 30, -20, 15, 0],
          y: [0, -25, 10, -15, 0],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -left-[10%] -top-[10%] h-[65%] w-[65%] rounded-full blur-[120px] transition-all duration-[2s]"
      />

      {/* Abyssal glow — drifting bottom right */}
      <motion.div
        style={{
          x: moveXDeep,
          y: moveYDeep,
          background: isStressed
            ? 'radial-gradient(ellipse, rgba(120, 40, 10, 0.06) 0%, rgba(180, 80, 20, 0.02) 50%, transparent 70%)'
            : 'radial-gradient(ellipse, rgba(8, 104, 120, 0.06) 0%, rgba(10, 80, 60, 0.02) 50%, transparent 70%)',
        }}
        animate={{
          scale: [1.1, 0.9, 1.15, 0.95, 1.1],
          opacity: [0.3, 0.5, 0.25, 0.45, 0.3],
          x: [0, -40, 20, -10, 0],
          y: [0, 20, -30, 15, 0],
        }}
        transition={{
          duration: 32,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -bottom-[15%] -right-[10%] h-[70%] w-[70%] rounded-full blur-[140px] transition-all duration-[2s]"
      />

      {/* Mid-depth wandering glow */}
      <motion.div
        style={{
          x: moveXAbyss,
          y: moveYAbyss,
          background:
            'radial-gradient(ellipse, rgba(12, 106, 158, 0.04) 0%, rgba(8, 68, 80, 0.015) 50%, transparent 70%)',
        }}
        animate={{
          scale: [1, 1.3, 0.85, 1.15, 1],
          opacity: [0.2, 0.4, 0.15, 0.35, 0.2],
          x: [0, 50, -30, 20, 0],
          y: [0, -40, 30, -20, 0],
        }}
        transition={{
          duration: 40,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute left-[15%] top-[25%] h-[55%] w-[55%] rounded-full blur-[160px]"
      />

      {/* Drifting shadow mass — large, slow, dark */}
      <motion.div
        animate={{
          x: [0, 80, -60, 40, 0],
          y: [0, -50, 30, -20, 0],
          scale: [1, 1.2, 0.9, 1.1, 1],
          opacity: [0.15, 0.25, 0.1, 0.2, 0.15],
        }}
        transition={{
          duration: 50,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute left-[40%] top-[50%] h-[40%] w-[50%] rounded-full blur-[180px]"
        style={{
          background:
            'radial-gradient(ellipse, rgba(2, 8, 20, 0.6) 0%, rgba(1, 4, 8, 0.3) 50%, transparent 70%)',
        }}
      />

      {/* Secondary drifting shadow — opposite direction */}
      <motion.div
        animate={{
          x: [0, -70, 50, -30, 0],
          y: [0, 40, -50, 25, 0],
          scale: [1.1, 0.85, 1.2, 0.95, 1.1],
          opacity: [0.1, 0.2, 0.08, 0.18, 0.1],
        }}
        transition={{
          duration: 38,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 8,
        }}
        className="absolute left-[-5%] top-[10%] h-[50%] w-[45%] rounded-full blur-[160px]"
        style={{
          background:
            'radial-gradient(ellipse, rgba(2, 12, 24, 0.5) 0%, rgba(1, 6, 12, 0.2) 50%, transparent 70%)',
        }}
      />

      {/* Faint caustic shimmer — very subtle surface light traces */}
      <motion.div
        animate={{
          backgroundPosition: ['0% 0%', '50% 100%', '100% 0%'],
          opacity: [0.015, 0.03, 0.015],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 400px 120px at 25% 8%, rgba(12, 106, 158, 0.15), transparent),
            radial-gradient(ellipse 300px 90px at 55% 4%, rgba(8, 104, 120, 0.1), transparent),
            radial-gradient(ellipse 350px 100px at 75% 12%, rgba(12, 106, 158, 0.08), transparent)
          `,
          backgroundSize: '200% 200%',
        }}
      />

      {/* Depth gradient — abyss at the bottom */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, transparent 40%, rgba(1, 4, 8, 0.5) 100%)',
        }}
      />

      {/* Plankton — CSS-animated particles, zero JS overhead */}
      {plankton.map((p) => (
        <div
          key={p.id}
          className="plankton"
          style={
            {
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              '--drift-x': p.driftX,
              '--drift-y': p.driftY,
              '--drift-scale': p.driftScale,
              '--drift-duration': p.duration,
              '--drift-delay': p.delay,
            } as React.CSSProperties
          }
        />
      ))}

      {/* Stress pulse overlay */}
      {pulse.stressLevel > 0.7 && (
        <motion.div
          animate={{ opacity: [0, 0.04, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="absolute inset-0 bg-red-500/10 pointer-events-none"
        />
      )}
    </div>
  );
}
