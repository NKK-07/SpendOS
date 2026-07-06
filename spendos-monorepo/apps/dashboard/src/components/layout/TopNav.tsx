'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, useApi, ROLE_LABELS, UserRole } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { Menu, Bell, Search, ChevronRight, CheckCircle2, XCircle, AlertCircle, FileCheck, CreditCard, Sun, Moon, Plus } from 'lucide-react';
import { AnimatePresence, motion, LazyMotion, domAnimation } from 'framer-motion';
import { fadeInScale, springTitan } from '@/lib/motion';
import { formatDate } from '@/lib/format';
import { NAV_ITEMS } from './NavConfig';

/* ─── Role gradient rings ─── */
const ROLE_RING: Record<UserRole, string> = {
  PRINCIPAL: 'from-[#6366f1] to-[#818cf8]',
  ADMIN:      'from-[#8b5cf6] to-[#a78bfa]',
  VIP:        'from-[#ec4899] to-[#f472b6]',
  MANAGER:    'from-[#f59e0b] to-[#fbbf24]',
  EMPLOYEE:   'from-[#10b981] to-[#34d399]',
};

const ROLE_AVATAR_BG: Record<UserRole, string> = {
  PRINCIPAL: 'bg-[rgba(99,102,241,0.15)]',
  ADMIN:      'bg-[rgba(139,92,246,0.15)]',
  VIP:        'bg-[rgba(236,72,153,0.15)]',
  MANAGER:    'bg-[rgba(245,158,11,0.15)]',
  EMPLOYEE:   'bg-[rgba(16,185,129,0.15)]',
};

/* ─── Notification type styling ─── */
type NotifType =
  | 'approved'
  | 'rejected'
  | 'proof_requested'
  | 'proof_submitted'
  | 'paid'
  | string;

function notifIcon(type: NotifType) {
  switch (type) {
    case 'approved':        return <CheckCircle2 size={14} className="text-[var(--signal)]" strokeWidth={2} />;
    case 'rejected':        return <XCircle      size={14} className="text-[var(--danger)]"  strokeWidth={2} />;
    case 'proof_requested': return <AlertCircle  size={14} className="text-[var(--amber)]"   strokeWidth={2} />;
    case 'proof_submitted': return <FileCheck    size={14} className="text-[var(--info)]"    strokeWidth={2} />;
    case 'paid':            return <CreditCard   size={14} className="text-[var(--signal-bright)]" strokeWidth={2} />;
    default:                return <Bell         size={14} className="text-[var(--text-muted)]"    strokeWidth={2} />;
  }
}

function notifDot(type: NotifType) {
  switch (type) {
    case 'approved':        return 'bg-[var(--signal)]';
    case 'rejected':        return 'bg-[var(--danger)]';
    case 'proof_requested': return 'bg-[var(--amber)]';
    case 'proof_submitted': return 'bg-[var(--info)]';
    case 'paid':            return 'bg-[var(--signal-bright)]';
    default:                return 'bg-[var(--text-muted)]';
  }
}

function getInitials(name?: string | null): string {
  if (!name) return '??';
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase();
}

interface Notification {
  id: string;
  type: NotifType;
  message: string;
  createdAt: string;
  read?: boolean;
}

interface TopNavProps {
  setSidebarOpen: () => void;
}

export function TopNav({ setSidebarOpen }: TopNavProps) {
  const { user } = useAuth();
  const api = useApi();
  const pathname = usePathname();
  const router = useRouter();

  const [notifOpen, setNotifOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    if (localStorage.theme === 'light' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: light)').matches)) {
      setIsLight(true);
      root.classList.add('light');
    } else {
      setIsLight(false);
      root.classList.remove('light');
    }
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    if (isLight) {
      root.classList.remove('light');
      localStorage.theme = 'dark';
      setIsLight(false);
    } else {
      root.classList.add('light');
      localStorage.theme = 'light';
      setIsLight(true);
    }
  };

  const { data: notifData = [], isLoading: notifLoading } = useQuery({
    queryKey: ['notifications', 'list', user?.userId],
    queryFn: async () => {
      const res = await api('/notifications?unread=true');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data?.notifications ?? data?.items ?? []);
    },
    enabled: !!user && notifOpen
  });

  const safeNotifData = Array.isArray(notifData) ? notifData : [];
  const notifications = safeNotifData.slice(0, 5);
  const unreadCount = safeNotifData.filter((n: any) => !n.read).length || safeNotifData.length;

  /* ─── Derive page title from pathname ─── */
  const currentNav = NAV_ITEMS.find((item) => {
    if (!item.href) return false;
    if (item.href === '/') return pathname === '/';
    return pathname === item.href || pathname.startsWith(item.href + '/');
  });

  const pageTitle = currentNav?.label ?? 'SpendOS';

  /* ─── Breadcrumb segments ─── */
  const crumbs = pathname
    .split('/')
    .filter(Boolean)
    .map((seg, i, arr) => ({
      label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
      href: '/' + arr.slice(0, i + 1).join('/'),
    }));

  /* ─── Open bell dropdown ─── */
  const handleBellClick = () => {
    setNotifOpen((v) => !v);
  };

  /* ─── Close on outside click ─── */
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  /* ─── Close dropdown on navigation ─── */
  useEffect(() => {
    setNotifOpen(false);
  }, [pathname]);

  if (!user) return null;

  return (
    <LazyMotion features={domAnimation}>
      <header
        className={[
          'flex items-center h-14 px-4 gap-3 flex-shrink-0',
          'bg-[rgba(5,5,5,0.80)] backdrop-blur-xl border-b border-white/[0.06]',
          'z-[var(--z-topnav)] relative',
        ].join(' ')}
      >
        {/* ── Mobile hamburger ── */}
        <button
          onClick={setSidebarOpen}
          className={[
            'md:hidden w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0',
            'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)]',
            'transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo)]',
          ].join(' ')}
          aria-label="Open sidebar"
        >
          <Menu size={18} strokeWidth={1.8} />
        </button>

        {/* ── Page title + breadcrumb ── */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[var(--text-muted)] text-xs font-mono overflow-hidden">
            <Link
              href="/"
              className="hover:text-[var(--text-secondary)] transition-colors whitespace-nowrap"
            >
              Home
            </Link>
            {crumbs.map((crumb, i) => (
              <span key={crumb.href} className="flex items-center gap-1.5 min-w-0">
                <ChevronRight size={10} className="flex-shrink-0" />
                {i === crumbs.length - 1 ? (
                  <span className="text-[var(--text-secondary)] truncate">{crumb.label}</span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="hover:text-[var(--text-secondary)] transition-colors truncate"
                  >
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </div>
          <h1 className="text-[var(--text-primary)] text-sm font-semibold font-sans leading-tight truncate mt-0.5">
            {pageTitle}
          </h1>
        </div>

        {/* ── Right: actions + bell + avatar ── */}
        <div className="flex items-center gap-2 flex-shrink-0">
          
          <button
            onClick={() => { router.push('/submit'); }}
            className={[
              'hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium font-sans',
              'bg-[var(--indigo)] text-white hover:bg-[var(--indigo-bright)] transition-colors btn-titan'
            ].join(' ')}
          >
            <Plus size={16} strokeWidth={2} />
            New Claim
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className={[
              'relative w-8 h-8 flex items-center justify-center rounded-lg',
              'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)]',
              'transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo)]',
            ].join(' ')}
            aria-label="Toggle theme"
          >
            {isLight ? <Moon size={16} strokeWidth={1.8} /> : <Sun size={16} strokeWidth={1.8} />}
          </button>

          {/* Bell */}
          <div ref={bellRef} className="relative">
            <button
              onClick={handleBellClick}
              className={[
                'relative w-8 h-8 flex items-center justify-center rounded-lg',
                'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.06)]',
                'transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--indigo)]',
                notifOpen ? 'bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]' : '',
              ].join(' ')}
              aria-label="Notifications"
              aria-expanded={notifOpen}
            >
              <Bell size={16} strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--danger)]" />
              )}
            </button>

            {/* ── Notification dropdown ── */}
            <AnimatePresence>
              {notifOpen && (
                <motion.div
                  key="notif-dropdown"
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={fadeInScale}
                  transition={springTitan}
                  role="dialog"
                  aria-label="Notifications Dropdown"
                  className={[
                    'absolute top-full right-0 mt-2 w-[340px]',
                    'bg-[rgba(5,5,5,0.95)] backdrop-blur-xl',
                    'border border-white/[0.08] rounded-xl shadow-2xl',
                    'overflow-hidden z-[var(--z-modal)]',
                  ].join(' ')}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <span className="text-[var(--text-primary)] text-sm font-semibold font-sans">
                      Notifications
                    </span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded-full" aria-live="polite">
                        {unreadCount} unread
                      </span>
                    )}
                  </div>

                  {/* Notification list */}
                  <div className="max-h-[320px] overflow-y-auto">
                    {notifLoading ? (
                      <div className="flex flex-col gap-2 p-3">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="skeleton h-12 rounded-lg" />
                        ))}
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 px-4">
                        <Bell size={24} className="text-[var(--text-muted)] mb-3" strokeWidth={1.4} />
                        <p className="text-[var(--text-muted)] text-[11px] font-mono tracking-wider uppercase text-center">
                          Signal clear. No new events.
                        </p>
                      </div>
                    ) : (
                      <div className="py-1">
                        {notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className="flex items-start gap-3 px-4 py-3 hover:bg-[rgba(255,255,255,0.03)] transition-colors cursor-default"
                          >
                            {/* Type dot */}
                            <div className="flex-shrink-0 mt-0.5">
                              <span
                                className={`block w-1.5 h-1.5 rounded-full mt-1.5 ${notifDot(notif.type)}`}
                              />
                            </div>

                            {/* Icon */}
                            <div className="flex-shrink-0 mt-0.5">
                              {notifIcon(notif.type)}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <p className="text-[var(--text-secondary)] text-xs font-sans leading-relaxed line-clamp-2">
                                {notif.message}
                              </p>
                              <span className="text-[var(--text-muted)] text-[10px] font-mono mt-1 block">
                                {formatDate(notif.createdAt, 'relative')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-white/[0.06] px-4 py-2.5">
                    <Link
                      href="/notifications"
                      onClick={() => setNotifOpen(false)}
                      className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-[var(--text-muted)] hover:text-[var(--indigo-bright)] transition-colors"
                    >
                      View all notifications
                      <ChevronRight size={10} />
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── User avatar ── */}
          <div
            className={`relative w-8 h-8 rounded-full p-[2px] bg-gradient-to-br ${ROLE_RING[user.role]} flex-shrink-0 cursor-pointer`}
            title={`${user.fullName} · ${ROLE_LABELS[user.role]}`}
            onClick={() => router.push('/settings')}
          >
            <div
              className={`w-full h-full rounded-full flex items-center justify-center text-[11px] font-bold font-sans text-white ${ROLE_AVATAR_BG[user.role]}`}
            >
              {getInitials(user.fullName)}
            </div>
          </div>

          {/* Role label – desktop only */}
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-[var(--text-primary)] text-xs font-semibold font-sans leading-tight">
              {user.fullName?.split(' ')[0] ?? '—'}
            </span>
            <span className="text-[var(--text-muted)] text-[10px] font-mono leading-tight">
              {ROLE_LABELS[user.role]}
            </span>
          </div>
        </div>
      </header>
    </LazyMotion>
  );
}
