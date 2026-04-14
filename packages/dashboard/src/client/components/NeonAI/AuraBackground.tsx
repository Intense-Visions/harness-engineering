import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

interface Props {
  mouseX: number;
  mouseY: number;
}

export function AuraBackground({ mouseX, mouseY }: Props) {
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

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-neutral-bg">
      {/* Top Left Aura (Shallow layer) */}
      <motion.div
        style={{ x: moveX, y: moveY }}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.15, 0.2, 0.15],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -left-[10%] -top-[10%] h-[60%] w-[60%] rounded-full bg-primary-500/20 blur-[120px]"
      />
      {/* Bottom Right Aura (Deep layer) */}
      <motion.div
        style={{ x: moveXDeep, y: moveYDeep }}
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.1, 0.15, 0.1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -bottom-[20%] -right-[10%] h-[70%] w-[70%] rounded-full bg-secondary-400/10 blur-[150px]"
      />

      {/* Dynamic Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
    </div>
  );
}
