'use client';

import { useState, useMemo } from 'react';
import { useAuth, useApi } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { formatINR, formatDate } from '@/lib/format';
import { pageVariants, rowVariants, staggerContainer, springTitan } from '@/lib/motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Search, Filter, Plus, FileText, Download, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ExpensesPage() {
  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: expenses = [], isLoading, isError } = useQuery({
    queryKey: ['expenses', 'my', user?.userId],
    queryFn: async () => {
      const res = await api('/expenses');
      if (!res.ok) throw new Error('Failed to fetch expenses');
      const data = await res.json();
      return Array.isArray(data) ? data : (data.data || []);
    },
    enabled: !!user,
  });

  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const filtered = useMemo(() => {
    return safeExpenses.filter((e: any) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!e.category?.toLowerCase().includes(q) && !e.description?.toLowerCase().includes(q) && !e.id?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [safeExpenses, statusFilter, search]);

  return (
    <LazyMotion features={domAnimation}>
      <m.div variants={pageVariants} initial="hidden" animate="visible" className="max-w-[1200px] mx-auto p-4 md:p-6 space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="font-mono text-2xl font-bold text-[var(--text-primary)] uppercase tracking-tight">
              My Expenses
            </h1>
            <p className="font-mono text-[11px] text-[var(--text-muted)] uppercase tracking-widest mt-1">
              {filtered.length} total records
            </p>
          </div>
          <Link href="/submit" className="px-5 py-2.5 bg-[var(--indigo)] text-white font-mono text-[11px] uppercase font-bold rounded-lg shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:bg-[var(--indigo-bright)] hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] transition-all flex items-center gap-2">
            <Plus size={14} /> NEW CLAIM
          </Link>
        </header>

        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input 
              type="text" 
              placeholder="Search claims..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-9 pr-4 py-2.5 text-sm font-mono text-[var(--text-primary)] focus:border-[var(--indigo)] focus:bg-white/[0.06] outline-none transition-all"
            />
          </div>
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
            {['all', 'submitted', 'approved', 'paid', 'rejected'].map(status => (
              <button 
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-full font-mono text-[10px] uppercase tracking-wider whitespace-nowrap transition-colors border ${
                  statusFilter === status 
                  ? 'bg-[rgba(99,102,241,0.1)] text-[var(--indigo)] border-[rgba(99,102,241,0.2)]' 
                  : 'bg-white/[0.02] text-[var(--text-muted)] border-transparent hover:bg-white/[0.05] hover:text-[var(--text-primary)]'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <GlassCard className="p-0 overflow-hidden relative">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-[rgba(5,5,5,0.9)] backdrop-blur-xl border-b border-white/[0.06]">
                <tr>
                  <th className="px-5 py-4 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">DATE</th>
                  <th className="px-5 py-4 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">CATEGORY</th>
                  <th className="px-5 py-4 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">DESCRIPTION</th>
                  <th className="px-5 py-4 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] text-right">AMOUNT</th>
                  <th className="px-5 py-4 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)]">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="p-0"><div className="skeleton h-16 w-full rounded-none"></div></td>
                    </tr>
                  ))
                ) : isError ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-24 text-center">
                      <AlertCircle size={32} className="text-[var(--danger)] mx-auto mb-4" />
                      <p className="font-mono font-bold text-[var(--text-primary)] uppercase tracking-wider">FAILED TO LOAD CLAIMS</p>
                      <p className="font-mono text-[11px] text-[var(--text-muted)] mt-1">An error occurred while fetching your data. Please refresh to try again.</p>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-24 text-center">
                      <FileText size={32} className="text-[var(--text-muted)] mx-auto mb-4" />
                      <p className="font-mono font-bold text-[var(--text-primary)] uppercase tracking-wider">NO CLAIMS FOUND</p>
                      <p className="font-mono text-[11px] text-[var(--text-muted)] mt-1">Adjust your filters or submit a new claim.</p>
                    </td>
                  </tr>
                ) : (
                  <AnimatePresence>
                    {filtered.map((e: any) => (
                      <m.tr 
                        key={e.id}
                        variants={rowVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        onClick={() => router.push(`/expenses/${e.id}`)}
                        className="group hover:bg-[rgba(255,255,255,0.03)] cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-4 font-mono text-[11px] text-[var(--text-muted)]">
                          {formatDate(e.expense_date || e.created_at)}
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-mono text-xs uppercase text-[var(--text-secondary)] bg-white/5 px-2 py-1 rounded">
                            {e.category?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-sans text-sm text-[var(--text-primary)] max-w-md truncate">{e.description || '—'}</p>
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-sm font-bold text-[var(--text-primary)]">
                          {formatINR(e.amount_paise)}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={e.status} />
                        </td>
                      </m.tr>
                    ))}
                  </AnimatePresence>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </m.div>
    </LazyMotion>
  );
}
