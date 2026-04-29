import { motion } from 'framer-motion';
import { useProjectPulse } from '../../hooks/useProjectPulse';

interface Props {
  size?: number;
  className?: string;
}

/**
 * CorePulse — a bioluminescent 'heart' that reflects system stress and health.
 * Redesigned to be highly visible and organic, like a deep-sea creature.
 */
export function CorePulse({ size = 24, className = '' }: Props) {
  const { pulse } = useProjectPulse();

  // Stress shifts bioluminescence from cool blue to warning amber
  const isStressed = pulse.stressLevel > 0.5;
  const primaryColor = isStressed ? '#ea580c' : '#0ea5e9'; // Orange-600 vs Sky-500
  const secondaryColor = isStressed ? '#f59e0b' : '#0c6a9e'; // Amber-500 vs Primary-500
  const filamentColor = isStressed ? 'rgba(234, 88, 12, 0.6)' : 'rgba(14, 165, 233, 0.6)';

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full overflow-visible"
        style={{
          filter: `drop-shadow(0 0 ${size / 4}px ${isStressed ? 'rgba(234, 88, 12, 0.4)' : 'rgba(14, 165, 233, 0.4)'})`,
        }}
      >
        <defs>
          <radialGradient id={`organicPulseGradient-${isStressed}`}>
            <stop offset="0%" stopColor="white" />
            <stop offset="30%" stopColor={primaryColor} />
            <stop offset="100%" stopColor={secondaryColor} stopOpacity="0.6" />
          </radialGradient>
        </defs>

        {/* Trailing filaments (tentacles) */}
        {[0, 72, 144, 216, 288].map((angle, i) => (
          <motion.path
            key={`${angle}-${i}`}
            d="M 50 50 Q 50 70 45 90"
            fill="none"
            stroke={filamentColor}
            strokeWidth="3"
            strokeLinecap="round"
            style={{ originX: '50px', originY: '50px', rotate: angle }}
            animate={{
              d: [
                'M 50 50 Q 50 70 45 90',
                'M 50 50 Q 55 75 50 95',
                'M 50 50 Q 45 70 55 90',
                'M 50 50 Q 50 70 45 90',
              ],
              strokeOpacity: [0.3, 0.7, 0.3],
            }}
            transition={{
              duration: (isStressed ? 1.5 : 3) + i * 0.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}

        {/* Main Body (Organic Blob/Membrane) */}
        <motion.path
          animate={{
            d: [
              'M 50 22 Q 78 22 78 50 Q 78 78 50 78 Q 22 78 22 50 Q 22 22 50 22',
              'M 50 25 Q 75 25 75 50 Q 75 75 50 75 Q 25 75 25 50 Q 25 25 50 25',
              'M 50 18 Q 85 25 82 50 Q 78 75 50 82 Q 22 75 18 50 Q 15 25 50 18',
              'M 50 22 Q 78 22 78 50 Q 78 78 50 78 Q 22 78 22 50 Q 22 22 50 22',
            ],
            scale: isStressed ? [1, 1.1, 1] : [1, 1.05, 1],
          }}
          transition={{
            duration: isStressed ? 0.8 : 2.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          fill={`url(#organicPulseGradient-${isStressed})`}
          className="cursor-pointer"
        />

        {/* Nucleus (Central Hot Spot) */}
        <motion.circle
          cx="50"
          cy="50"
          r="10"
          fill="white"
          animate={{
            scale: [0.8, 1.4, 0.8],
            opacity: [0.6, 1, 0.6],
            filter: ['blur(1px)', 'blur(3px)', 'blur(1px)'],
          }}
          transition={{
            duration: isStressed ? 0.6 : 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </svg>
    </div>
  );
}
