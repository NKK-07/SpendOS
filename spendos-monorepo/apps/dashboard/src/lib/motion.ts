/**
 * lib/motion.ts
 * Shared Framer Motion animation variants for the Titan Edition.
 * 
 * Spring spec: stiffness 300, damping 30 — "High-tension deterministic"
 */

import type { Transition, Variants } from 'framer-motion';

/* ─── Spring presets ─── */

export const springTitan: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
};

export const springBouncy: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 25,
};

export const springSlide: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 32,
};

/* ─── Page transition ─── */

export const pageVariants: Variants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { ...springTitan, staggerChildren: 0.05 }
  },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.18 } },
};

/* ─── Stagger container ─── */

export const staggerContainer: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

/* ─── Card entrance (stagger child) ─── */

export const cardVariants: Variants = {
  hidden:  { opacity: 0, y: 20, scale: 0.98 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: springTitan,
  },
};

/* ─── Slide in from right (drawers, panels) ─── */

export const slideInRight: Variants = {
  hidden:  { opacity: 0, x: '100%' },
  visible: { opacity: 1, x: 0, transition: springSlide },
  exit:    { opacity: 0, x: '100%', transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } },
};

/* ─── Slide in from left (sidebar expand) ─── */

export const slideInLeft: Variants = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: springTitan },
  exit:    { opacity: 0, x: -16, transition: { duration: 0.18 } },
};

/* ─── Fade in scale (modals, dropdowns) ─── */

export const fadeInScale: Variants = {
  hidden:  { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: springTitan },
  exit:    { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
};

/* ─── Row entrance (table rows, list items) ─── */

export const rowVariants: Variants = {
  hidden:  { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: springTitan },
  exit:    { opacity: 0, x: 8, transition: { duration: 0.15 } },
};

/* ─── KPI count-up wrapper ─── */

export const kpiVariants: Variants = {
  hidden:  { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { ...springTitan, delay: 0.1 } },
};

/* ─── Sidebar label (collapsed → expanded text) ─── */

export const sidebarLabelVariants: Variants = {
  hidden:  { opacity: 0, width: 0, x: -4 },
  visible: { opacity: 1, width: 'auto', x: 0, transition: { ...springTitan, duration: 0.2 } },
  exit:    { opacity: 0, width: 0, x: -4, transition: { duration: 0.1 } },
};

/* ─── Hover button lift ─── */

export const hoverLift = {
  whileHover: { y: -2, transition: springBouncy },
  whileTap:   { y: 1,  scale: 0.98, transition: { duration: 0.08 } },
};

/* ─── Approval row actions ─── */

export const approvalRowVariants: Variants = {
  initial: { opacity: 1 },
  approved: { 
    opacity: 0.5, 
    x: 8,
    transition: springTitan 
  },
  rejected: { 
    opacity: 0.5, 
    x: 8,
    transition: springTitan 
  },
};
