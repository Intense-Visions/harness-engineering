import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import { useProjectPulse } from '../../hooks/useProjectPulse';

interface Props {
  mouseX: number;
  mouseY: number;
}

export function AuraBackground({ mouseX, mouseY }: Props) {
  const { pulse } = useProjectPulse();
  const springConfig = { damping: 50, stiffness: 100 };
  const x = useSpring(0, springConfig);
  const y = useSpring(0, springConfig);

  useEffect(() => {
    x.set(mouseX);
    y.set(mouseY);
  }, [mouseX, mouseY, x, y]);

  // Transform mouse movement into subtle parallax shifts
  const moveX = useTransform(x, [0, 2000], [20, -20]);
  const moveY = useTransform(y, [0, 1200], [20, -20]);
  const moveXDeep = useTransform(x, [0, 2000], [40, -40]);
  const moveYDeep = useTransform(y, [0, 1200], [40, -40]);

  // Dynamic Palette Shifting based on System Stress
  // 0 stress = Indigo (#4f46e5) -> 1 stress = Crimson (#ef4444)
  const primaryColor =
    pulse.stressLevel > 0.5 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(79, 70, 229, 0.2)';
  const secondaryColor =
    pulse.stressLevel > 0.5 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 211, 238, 0.1)';

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-neutral-bg transition-colors duration-1000">
      {/* Top Left Aura (Shallow layer) */}
      <motion.div
        style={{ x: moveX, y: moveY, backgroundColor: primaryColor }}
        animate={{
          scale: [1, 1.1, 1],
          opacity: pulse.stressLevel > 0.5 ? [0.2, 0.3, 0.2] : [0.15, 0.2, 0.15],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -left-[10%] -top-[10%] h-[60%] w-[60%] rounded-full blur-[120px] transition-colors duration-1000"
      />
      {/* Bottom Right Aura (Deep layer) */}
      <motion.div
        style={{ x: moveXDeep, y: moveYDeep, backgroundColor: secondaryColor }}
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.1, 0.15, 0.1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -bottom-[20%] -right-[10%] h-[70%] w-[70%] rounded-full blur-[150px] transition-colors duration-1000"
      />

      {/* Dynamic Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-50" />

      {/* Stress Pulse Overlay */}
      {pulse.stressLevel > 0.7 && (
        <motion.div
          animate={{ opacity: [0, 0.05, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute inset-0 bg-red-500/10 pointer-events-none"
        />
      )}
    </div>
  );
}
