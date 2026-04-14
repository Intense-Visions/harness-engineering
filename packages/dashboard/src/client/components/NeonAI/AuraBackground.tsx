import { motion } from 'framer-motion';

export function AuraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-neutral-bg">
      {/* Top Left Aura */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.15, 0.1],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -left-[10%] -top-[10%] h-[50%] w-[50%] rounded-full bg-primary-500/20 blur-[120px]"
      />
      {/* Bottom Right Aura */}
      <motion.div
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -bottom-[20%] -right-[10%] h-[60%] w-[60%] rounded-full bg-secondary-400/10 blur-[150px]"
      />
    </div>
  );
}
