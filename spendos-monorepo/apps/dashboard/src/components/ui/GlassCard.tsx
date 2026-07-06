'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cardVariants, springTitan } from '@/lib/motion';

type GlassVariant = 'default' | 'raised' | 'elevated' | 'indigo' | 'signal' | 'amber' | 'danger';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: GlassVariant;
  animate?: boolean;
  onClick?: () => void;
  hover?: boolean;
}

const variantClasses: Record<GlassVariant, string> = {
  default:  'bg-[rgba(255,255,255,0.03)] border border-white/[0.06] backdrop-blur-xl',
  raised:   'bg-[rgba(255,255,255,0.055)] border border-white/[0.10] backdrop-blur-xl',
  elevated: 'bg-[rgba(255,255,255,0.08)] border border-white/[0.15] backdrop-blur-2xl',
  indigo:   'bg-[rgba(99,102,241,0.07)] border border-[rgba(99,102,241,0.2)] backdrop-blur-xl',
  signal:   'bg-[rgba(16,185,129,0.07)] border border-[rgba(16,185,129,0.2)] backdrop-blur-xl',
  amber:    'bg-[rgba(245,158,11,0.07)] border border-[rgba(245,158,11,0.2)] backdrop-blur-xl',
  danger:   'bg-[rgba(239,68,68,0.07)] border border-[rgba(239,68,68,0.2)] backdrop-blur-xl',
};

export function GlassCard({
  children,
  className = '',
  variant = 'default',
  animate = false,
  onClick,
  hover = false,
}: GlassCardProps) {
  const base = `rounded-xl ${variantClasses[variant]} ${className}`;
  const hoverClass = hover
    ? 'cursor-pointer transition-all duration-300 hover:border-white/[0.12] hover:bg-[rgba(255,255,255,0.05)] hover:shadow-[0_0_20px_rgba(255,255,255,0.05)]'
    : '';

  if (animate) {
    return (
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        className={`${base} ${hoverClass}`}
        onClick={onClick}
        whileHover={
          hover
            ? { scale: 1.005, transition: { ...springTitan } }
            : undefined
        }
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div
      className={`${base} ${hoverClass}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
