import { MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  isOpen: boolean;
  onClick: () => void;
}

export function ChatPanelTrigger({ isOpen, onClick }: Props) {
  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onClick}
          className="fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-primary-500 text-white shadow-2xl backdrop-blur-xl transition-all duration-500 shadow-[0_0_20px_rgba(79,70,229,0.4)]"
        >
          <MessageSquare size={24} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
