import { motion } from 'framer-motion';
import { useProjectPulse } from '../../hooks/useProjectPulse';

interface Props {
  size?: number;
  className?: string;
}

/**
 * Biolume — A small, organic, deep-ocean inspired icon for thread items.
 * Designed for high visibility at small scales (18-20px).
 */
export function Biolume({ size = 18, className = '' }: Props) {
  const { pulse } = useProjectPulse();
  const isStressed = pulse.stressLevel > 0.5;

  // Deep ocean bioluminescence colors
  const primaryColor = isStressed ? '#f59e0b' : '#06b6d4'; // Amber-500 vs Cyan-500
  const secondaryColor = isStressed ? '#ea580c' : '#0891b2'; // Orange-600 vs Cyan-600
  const glowColor = isStressed ? 'rgba(245, 158, 11, 0.5)' : 'rgba(6, 182, 212, 0.5)';

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Outer glow ring */}
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute inset-0 rounded-full blur-[2px]"
        style={{ backgroundColor: glowColor }}
      />

      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
        <defs>
          <radialGradient id={`biolumeGradient-${isStressed}`}>
            <stop offset="0%" stopColor="white" />
            <stop offset="40%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={secondaryColor} />
          </radialGradient>
        </defs>

        {/* Organic Blob Body */}
        <motion.path
          animate={{
            d: [
              'M 50 25 Q 75 25 75 50 Q 75 75 50 75 Q 25 75 25 50 Q 25 25 50 25',
              'M 50 20 Q 85 30 80 50 Q 75 70 50 80 Q 25 70 20 50 Q 15 30 50 20',
              'M 50 25 Q 75 25 75 50 Q 75 75 50 75 Q 25 75 25 50 Q 25 25 50 25',
            ],
            scale: isStressed ? [1, 1.1, 1] : [1, 1.05, 1],
          }}
          transition={{
            duration: isStressed ? 0.8 : 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          fill={`url(#biolumeGradient-${isStressed})`}
        />

        {/* Nucleus/Core */}
        <motion.circle
          cx="50"
          cy="50"
          r="8"
          fill="white"
          animate={{
            opacity: [0.7, 1, 0.7],
            scale: [0.9, 1.2, 0.9],
          }}
          transition={{
            duration: isStressed ? 0.4 : 1.5,
            repeat: Infinity,
          }}
        />

        {/* Tiny Filaments (simplified) */}
        {[0, 120, 240].map((angle, i) => (
          <motion.path
            key={angle}
            d="M 50 75 Q 50 85 45 95"
            stroke={secondaryColor}
            strokeWidth="4"
            strokeLinecap="round"
            style={{ originX: '50px', originY: '50px', rotate: angle }}
            animate={{
              d: ['M 50 75 Q 50 85 45 95', 'M 50 75 Q 55 90 50 100', 'M 50 75 Q 50 85 45 95'],
            }}
            transition={{
              duration: 2 + i * 0.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </svg>
    </div>
  );
}
