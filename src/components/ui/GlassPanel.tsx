import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function GlassPanel({ children, className = "", delay = 0 }: GlassPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`glass glass-panel-3d rounded-[18px] ${className}`}
    >
      {children}
    </motion.div>
  );
}
