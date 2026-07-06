'use client';

import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth, useApi, isReviewer, isAdminUp } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { 
  formatINR, 
  formatINRCompact,
  formatDate
} from '@/lib/format';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { pageVariants, cardVariants, staggerContainer, springTitan } from '@/lib/motion';
import Link from 'next/link';

const PrincipalDashboard = dynamic(() => import('@/components/dashboard/PrincipalDashboard').then(mod => mod.PrincipalDashboard));
const AdminDashboard = dynamic(() => import('@/components/dashboard/AdminDashboard').then(mod => mod.AdminDashboard));
const ManagerDashboard = dynamic(() => import('@/components/dashboard/ManagerDashboard').then(mod => mod.ManagerDashboard));
const VipDashboard = dynamic(() => import('@/components/dashboard/VipDashboard').then(mod => mod.VipDashboard));
const EmployeeDashboard = dynamic(() => import('@/components/dashboard/EmployeeDashboard').then(mod => mod.EmployeeDashboard));

export default function OperationsDashboard() {
  const { user } = useAuth();
  const api = useApi();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, isLoading: loading, isError } = useQuery({
    queryKey: ['dashboard', 'pulse', user?.userId],
    queryFn: async () => {
      const res = await api('/dashboard/pulse');
      if (!res.ok) throw new Error('Failed to fetch pulse data');
      return res.json();
    },
    enabled: !!user
  });

  const showMetrics = user?.role && ['ADMIN', 'MANAGER'].includes(user.role);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px]">
        <div className="w-8 h-8 rounded-lg bg-[var(--indigo)] animate-spin-slow"></div>
        <p className="mt-4 text-sm text-[var(--text-muted)]">Loading dashboard...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px]">
        <div className="w-8 h-8 rounded-lg bg-[var(--danger)] flex items-center justify-center">
          <span className="text-white font-bold">!</span>
        </div>
        <p className="mt-4 text-sm text-[var(--danger)]">Failed to load data</p>
      </div>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <m.div 
        variants={pageVariants} 
        initial="hidden" 
        animate="visible" 
        className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6"
      >
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
              Dashboard
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Overview {mounted ? `· ${formatDate(new Date().toISOString())}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/submit" className="px-4 py-2 bg-[var(--indigo)] text-white text-sm font-medium rounded-lg hover:bg-[var(--indigo-bright)] transition-all btn-titan">
              New Claim
            </Link>
          </div>
        </header>
        <div className="mt-6">
          {user?.role === 'PRINCIPAL' && <PrincipalDashboard data={data} />}
          {user?.role === 'ADMIN' && <AdminDashboard data={data} />}
          {user?.role === 'VIP' && <VipDashboard data={data} />}
          {user?.role === 'MANAGER' && <ManagerDashboard data={data} />}
          {user?.role === 'EMPLOYEE' && <EmployeeDashboard data={data} />}
        </div>

      </m.div>
    </LazyMotion>
  );
}
