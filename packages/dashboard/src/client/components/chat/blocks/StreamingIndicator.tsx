import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NeuralOrganism } from '../NeuralOrganism';

const PROCESSING_PHRASES = [
  'Thinking deeply…',
  'Analyzing the codebase…',
  'Connecting the dots…',
  'Weaving through the code…',
  'Exploring possibilities…',
  'Building a mental model…',
  'Following the thread…',
  'Mapping dependencies…',
  'Tracing the logic…',
  'Piecing it together…',
  'Diving into the details…',
  'Reasoning through options…',
  'Scanning for patterns…',
  'Synthesizing insights…',
  'Crafting a response…',
  'Running the numbers…',
  'Almost there…',
  'Working through it…',
  'Processing your request…',
  'Engineering a solution…',
];

/**
 * ─── STREAMING INDICATOR ───
 *
 * The NeuralOrganism radiates energy while processing. Activity bars
 * emanate outward from the creature, and a bioluminescent glow field
 * pulses behind it. The composition should feel like the creature is
 * *working* — alive, focused, radiating.
 */

/** Activity bars — radiate outward from the organism with staggered organic timing */
function ActivityBar({ index, total }: { index: number; total: number }) {
  const centerFactor = 1 - Math.abs(index - total / 2) / (total / 2);
  const maxHeight = 0.4 + centerFactor * 0.6;
  const baseHeight = 0.1 + centerFactor * 0.1;
  const duration = 1.2 + (1 - centerFactor) * 2;
  const opacity = 0.3 + centerFactor * 0.5;

  return (
    <motion.div
      animate={{
        scaleY: [baseHeight, maxHeight, baseHeight * 1.3, maxHeight * 0.7, baseHeight],
        opacity: [opacity * 0.6, opacity, opacity * 0.7, opacity * 0.9, opacity * 0.6],
      }}
      transition={{
        duration,
        repeat: Infinity,
        delay: index * 0.08,
        ease: 'easeInOut',
      }}
      className="w-[1.5px] h-5 rounded-full origin-bottom"
      style={{
        background: `linear-gradient(to top, rgba(139,92,246,0.8), rgba(34,211,238,0.6))`,
      }}
    />
  );
}

export function StreamingIndicator() {
  const [phraseIndex, setPhraseIndex] = useState(() =>
    Math.floor(Math.random() * PROCESSING_PHRASES.length)
  );
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(
      () => {
        setPhraseIndex((prev) => {
          let next: number;
          do {
            next = Math.floor(Math.random() * PROCESSING_PHRASES.length);
          } while (next === prev && PROCESSING_PHRASES.length > 1);
          return next;
        });
      },
      4500 + Math.random() * 2000
    );
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      className="relative flex items-center gap-4 py-5 px-4"
    >
      {/* Ambient glow field behind organism */}
      <motion.div
        className="absolute left-0 top-1/2 w-20 h-20 -translate-x-1/4 -translate-y-1/2 rounded-full pointer-events-none"
        animate={{
          opacity: [0.05, 0.1, 0.07, 0.09, 0.05],
          scale: [0.95, 1.08, 0.98, 1.04, 0.95],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background:
            'radial-gradient(circle, rgba(139,92,246,0.35) 0%, rgba(79,70,229,0.08) 50%, transparent 70%)',
          filter: 'blur(12px)',
        }}
      />

      {/* The creature — gentle hover */}
      <motion.div
        animate={{ y: [0, -2, 1, -1.5, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="shrink-0 relative z-10"
      >
        <NeuralOrganism size={80} />
      </motion.div>

      {/* Activity bars + text — connected composition */}
      <div className="relative flex-1 min-w-0 flex items-center h-10">
        {/* Activity bars — ghostly, behind text */}
        <div className="absolute inset-0 flex items-end justify-start gap-[2.5px] opacity-[0.15] pointer-events-none overflow-hidden blur-[0.5px]">
          {Array.from({ length: 20 }).map((_, i) => (
            <ActivityBar key={i} index={i} total={20} />
          ))}
        </div>

        {/* Phrase + elapsed */}
        <div className="relative z-10 flex flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.span
              key={phraseIndex}
              initial={{ opacity: 0, x: -4, filter: 'blur(3px)' }}
              animate={{ opacity: 0.9, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 4, filter: 'blur(2px)' }}
              transition={{ duration: 0.4 }}
              className="text-[11px] font-semibold tracking-[0.08em] text-neutral-muted uppercase leading-none"
            >
              {PROCESSING_PHRASES[phraseIndex]}
            </motion.span>
          </AnimatePresence>
          <div className="h-3.5 flex items-center mt-1">
            {elapsed > 2 && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                className="text-[8px] font-mono text-neutral-muted/60 tabular-nums tracking-[0.15em]"
              >
                T+{formatElapsed(elapsed)}
              </motion.span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
