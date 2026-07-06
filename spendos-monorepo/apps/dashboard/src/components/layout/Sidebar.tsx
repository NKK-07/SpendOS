'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth, useApi, ROLE_LABELS, UserRole } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import FocusTrap from 'focus-trap-react';
import { AnimatePresence, motion, LazyMotion, domAnimation } from 'framer-motion';
import { NAV_ITEMS, NavItem } from './NavConfig';
import { LogOut, X, ChevronRight } from 'lucide-react';
import { springTitan, sidebarLabelVariants } from '@/lib/motion';

/* ─── Role accent colours ─── */
const ROLE_RING: Record<UserRole, string> = {
  PRINCIPAL: 'from-[#6366f1] to-[#818cf8]',
  ADMIN:      'from-[#8b5cf6] to-[#a78bfa]',
  VIP:        'from-[#ec4899] to-[#f472b6]',
  MANAGER:    'from-[#f59e0b] to-[#fbbf24]',
  EMPLOYEE:   'from-[#10b981] to-[#34d399]',
};

const ROLE_INITIALS_BG: Record<UserRole, string> = {
  PRINCIPAL: 'bg-[rgba(99,102,241,0.15)]',
  ADMIN:      'bg-[rgba(139,92,246,0.15)]',
  VIP:        'bg-[rgba(236,72,153,0.15)]',
  MANAGER:    'bg-[rgba(245,158,11,0.15)]',
  EMPLOYEE:   'bg-[rgba(16,185,129,0.15)]',
};

function getInitials(name?: string | null): string {
  if (!name) return '??';
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

interface SidebarProps {
  isOpen: boolean;
  setOpen: (v: boolean) => void;
  isExpanded: boolean;
  setExpanded: (v: boolean) => void;
}

export function Sidebar({ isOpen, setOpen, isExpanded, setExpanded }: SidebarProps) {
  const { user, logout } = useAuth();
  const api = useApi();
  const pathname = usePathname();

  const { data: notifCount = 0 } = useQuery({
    queryKey: ['notifications', 'count', user?.userId],
    queryFn: async () => {
      const res = await api('/notifications?unread=true');
      if (!res.ok) return 0;
      const data = await res.json();
      return Array.isArray(data) ? data.filter((n: any) => !n.read).length || data.length : (data?.count ?? data?.total ?? 0);
    },
    enabled: !!user
  });

  if (!user) return null;

  /* ─── Role-based nav filter ─── */
  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role)
  );

  const isActive = (href?: string) => {
    if (!href) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  /* ─── Desktop sidebar content (shared between mobile & desktop) ─── */
  const SidebarContent = (
    <div className="flex flex-col h-full">
      {/* ── Logo ── */}
      <div
        className="flex items-center gap-3 px-4 h-14 border-b border-white/[0.06] flex-shrink-0 overflow-hidden"
        style={{ minWidth: 0 }}
      >
        <div
          className="w-8 h-8 rounded-lg bg-[#6366f1] flex items-center justify-center flex-shrink-0"
          style={{ boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}
        >
          <span className="text-white font-bold text-sm font-sans">S</span>
        </div>
        <AnimatePresence>
          {isExpanded && (
            <motion.span
              key="logo-label"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={sidebarLabelVariants}
              className="text-[var(--text-primary)] font-semibold text-sm font-sans whitespace-nowrap overflow-hidden"
            >
              SpendOS
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-0.5">
        {visibleNav.map((item: NavItem) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          const hasNotifBadge = item.badge === 'notifications' && notifCount > 0;

          return (
            <Link
              key={item.href ?? item.label}
              href={item.href ?? '#'}
              onClick={() => setOpen(false)}
              className={[
                'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                'transition-colors duration-150',
                'group outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo)]',
                active
                  ? 'bg-[rgba(99,102,241,0.10)] text-[var(--indigo-bright)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.04)]',
              ].join(' ')}
            >
              {/* Active bar */}
              {active && <span className="nav-active-bar" />}

              {/* Icon + badge */}
              <span className="relative flex-shrink-0">
                {Icon && (
                  <Icon
                    size={18}
                    className={active ? 'text-[var(--indigo)]' : 'text-current'}
                    strokeWidth={active ? 2.5 : 1.8}
                  />
                )}
                {hasNotifBadge && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--danger)]" />
                )}
              </span>

              {/* Label */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.span
                    key={`label-${item.label}`}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    variants={sidebarLabelVariants}
                    className="whitespace-nowrap overflow-hidden leading-none"
                  >
                    {item.label}
                    {hasNotifBadge && (
                      <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--danger)] text-white text-[9px] font-bold font-mono">
                        {notifCount > 9 ? '9+' : notifCount}
                      </span>
                    )}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* ── User section ── */}
      <div className="flex-shrink-0 border-t border-white/[0.06] p-3 space-y-2">
        <div className="flex items-center gap-3 overflow-hidden">
          {/* Avatar with role ring */}
          <div
            className={`relative flex-shrink-0 w-8 h-8 rounded-full p-[2px] bg-gradient-to-br ${ROLE_RING[user.role]}`}
          >
            <div
              className={`w-full h-full rounded-full flex items-center justify-center text-[11px] font-bold font-sans text-white ${ROLE_INITIALS_BG[user.role]}`}
            >
              {getInitials(user.fullName)}
            </div>
          </div>

          {/* Name + role */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                key="user-info"
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={sidebarLabelVariants}
                className="flex flex-col min-w-0 overflow-hidden"
              >
                <span className="text-[var(--text-primary)] text-xs font-semibold font-sans truncate leading-tight">
                  {user.fullName}
                </span>
                <span className="text-[var(--text-muted)] text-[10px] font-mono leading-tight mt-0.5">
                  {ROLE_LABELS[user.role]}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className={[
            'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-xs text-[var(--text-muted)]',
            'hover:text-[var(--danger)] hover:bg-[rgba(239,68,68,0.06)]',
            'transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]',
          ].join(' ')}
        >
          <LogOut size={14} strokeWidth={1.8} className="flex-shrink-0" />
          <AnimatePresence>
            {isExpanded && (
              <motion.span
                key="logout-label"
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={sidebarLabelVariants}
                className="whitespace-nowrap overflow-hidden"
              >
                Sign out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );

  return (
    <LazyMotion features={domAnimation}>
      {/* ════════════════════════════════════
          DESKTOP — always visible, hover-expand
          ════════════════════════════════════ */}
      <motion.aside
        className={[
          'hidden md:flex flex-col h-full flex-shrink-0',
          'bg-[rgba(5,5,5,0.95)] border-r border-white/[0.06]',
          'overflow-hidden relative z-[var(--z-sidebar)]',
        ].join(' ')}
        animate={{ width: isExpanded ? 240 : 64 }}
        transition={springTitan}
        onHoverStart={() => setExpanded(true)}
        onHoverEnd={() => setExpanded(false)}
      >
        {SidebarContent}
      </motion.aside>

      {/* ════════════════════════════════════
          MOBILE — slide-in overlay
          ════════════════════════════════════ */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 bg-[rgba(5,5,5,0.75)] backdrop-blur-sm z-[var(--z-sidebar)]"
              onClick={() => setOpen(false)}
            />

            {/* Drawer */}
            <FocusTrap
              active={isOpen}
              focusTrapOptions={{ allowOutsideClick: true }}
            >
              <motion.aside
                key="mobile-sidebar"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={springTitan}
                className={[
                  'md:hidden fixed left-0 top-0 h-full w-[240px] flex flex-col',
                  'bg-[rgba(5,5,5,0.98)] border-r border-white/[0.06]',
                  'z-[calc(var(--z-sidebar)+1)]',
                ].join(' ')}
              >
                {/* Close button */}
                <button
                  onClick={() => setOpen(false)}
                  className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                  aria-label="Close sidebar"
                >
                  <X size={14} />
                </button>

                {/* Force expanded in mobile */}
                <div className="flex flex-col h-full">
                  {/* Logo */}
                  <div className="flex items-center gap-3 px-4 h-14 border-b border-white/[0.06] flex-shrink-0">
                    <div
                      className="w-8 h-8 rounded-lg bg-[#6366f1] flex items-center justify-center flex-shrink-0"
                      style={{ boxShadow: '0 0 12px rgba(99,102,241,0.4)' }}
                    >
                      <span className="text-white font-bold text-sm font-sans">S</span>
                    </div>
                    <span className="text-[var(--text-primary)] font-semibold text-sm font-sans">SpendOS</span>
                  </div>

                  {/* Nav */}
                  <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
                    {visibleNav.map((item: NavItem) => {
                      const active = isActive(item.href);
                      const Icon = item.icon;
                      const hasNotifBadge = item.badge === 'notifications' && notifCount > 0;

                      return (
                        <Link
                          key={item.href ?? item.label}
                          href={item.href ?? '#'}
                          onClick={() => setOpen(false)}
                          className={[
                            'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                            'transition-colors duration-150',
                            'outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo)]',
                            active
                              ? 'bg-[rgba(99,102,241,0.10)] text-[var(--indigo-bright)]'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.04)]',
                          ].join(' ')}
                        >
                          {active && <span className="nav-active-bar" />}
                          <span className="relative flex-shrink-0">
                            {Icon && (
                              <Icon
                                size={18}
                                className={active ? 'text-[var(--indigo)]' : 'text-current'}
                                strokeWidth={active ? 2.5 : 1.8}
                              />
                            )}
                            {hasNotifBadge && (
                              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--danger)]" />
                            )}
                          </span>
                          <span className="flex items-center gap-2">
                            {item.label}
                            {hasNotifBadge && (
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[var(--danger)] text-white text-[9px] font-bold font-mono">
                                {notifCount > 9 ? '9+' : notifCount}
                              </span>
                            )}
                          </span>
                        </Link>
                      );
                    })}
                  </nav>

                  {/* User section */}
                  <div className="flex-shrink-0 border-t border-white/[0.06] p-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <div
                        className={`relative flex-shrink-0 w-8 h-8 rounded-full p-[2px] bg-gradient-to-br ${ROLE_RING[user.role]}`}
                      >
                        <div
                          className={`w-full h-full rounded-full flex items-center justify-center text-[11px] font-bold font-sans text-white ${ROLE_INITIALS_BG[user.role]}`}
                        >
                          {getInitials(user.fullName)}
                        </div>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[var(--text-primary)] text-xs font-semibold font-sans truncate leading-tight">
                          {user.fullName}
                        </span>
                        <span className="text-[var(--text-muted)] text-[10px] font-mono leading-tight mt-0.5">
                          {ROLE_LABELS[user.role]}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={logout}
                      className={[
                        'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-xs text-[var(--text-muted)]',
                        'hover:text-[var(--danger)] hover:bg-[rgba(239,68,68,0.06)]',
                        'transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)]',
                      ].join(' ')}
                    >
                      <LogOut size={14} strokeWidth={1.8} />
                      Sign out
                    </button>
                  </div>
                </div>
              </motion.aside>
            </FocusTrap>
          </>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
