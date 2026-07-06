'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { QueryClientProvider } from '@tanstack/react-query';
import { CommandMenu } from '@/components/CommandMenu';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { NAV_ITEMS } from './NavConfig';
import { motion, LazyMotion, domAnimation } from 'framer-motion';


/* ─── Titan loading screen ─── */
function TitanLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#050505]">
      <div className="relative">
        {/* Outer glow ring */}
        <div
          className="absolute inset-0 rounded-lg opacity-40"
          style={{
            boxShadow: '0 0 24px 8px rgba(99,102,241,0.35)',
            animation: 'pulseIndigo 2s ease-in-out infinite',
          }}
        />
        {/* Logo square */}
        <div
          className="relative w-8 h-8 rounded-lg bg-[#6366f1] flex items-center justify-center"
          style={{
            animation: 'spinSlow 1.8s linear infinite',
            boxShadow: '0 0 16px rgba(99,102,241,0.5)',
          }}
        >
          <span className="text-white font-bold text-sm font-sans">S</span>
        </div>
      </div>
      <p
        className="mt-4 text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-widest"
        style={{ letterSpacing: '0.2em' }}
      >
        Initializing Command Plane…
      </p>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  /* ─── Mobile sidebar ─── */
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  /* ─── Desktop sidebar expansion (hover) ─── */
  const [isExpanded, setIsExpanded] = useState(false);

  /* ─── Role-based route protection ─── */
  useEffect(() => {
    if (isLoading || !user) return;
    const currentNavItem = NAV_ITEMS.find(
      (item) =>
        item.href &&
        (pathname === item.href || pathname.startsWith(item.href + '/'))
    );
    if (
      currentNavItem &&
      currentNavItem.roles &&
      !currentNavItem.roles.includes(user.role)
    ) {
      router.replace('/');
    }
  }, [user, isLoading, pathname, router]);

  /* ─── Close mobile sidebar on route change ─── */
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  if (isLoading) return <TitanLoader />;
  
  if (!user) {
    if (pathname === '/login' || pathname.startsWith('/reset-password')) {
      return <>{children}</>;
    }
    // Use a timeout to avoid React state updates during render warnings
    setTimeout(() => {
      router.replace('/login');
    }, 0);
    return <TitanLoader />;
  }

  return (
    <>
      <LazyMotion features={domAnimation}>
        <div className="flex h-screen bg-[#050505] text-foreground overflow-hidden">
          {/* ── Desktop sidebar (md: relative, always visible) ── */}
          {/* ── Mobile sidebar (fixed overlay, via Sidebar component) ── */}
          <Sidebar
            isOpen={isSidebarOpen}
            setOpen={setIsSidebarOpen}
            isExpanded={isExpanded}
            setExpanded={setIsExpanded}
          />

          {/* ── Main content area ── */}
          <motion.div
            className="flex-1 flex flex-col overflow-hidden min-w-0"
            animate={{
              marginLeft: 0, // Desktop ml is managed by the sidebar's width via flex
            }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <TopNav setSidebarOpen={() => setIsSidebarOpen(true)} />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
              {children}
            </main>
          </motion.div>

          <CommandMenu />
        </div>
      </LazyMotion>
    </>
  );
}
