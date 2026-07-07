'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import { 
  CheckSquare, XCircle, CheckCircle2, AlertCircle, 
  ChevronRight, Search, Clock, FileText, FileCheck, X, 
  MoreVertical, Layers 
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import FocusTrap from 'focus-trap-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, useApi } from '@/lib/auth';
import { formatINR, formatDate, formatDateTime, truncateHash } from '@/lib/format';
import { pageVariants, staggerContainer, rowVariants, springTitan, slideInRight } from '@/lib/motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MonoHash } from '@/components/ui/MonoHash';

export default function ReviewQueuePage() {
  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<'pending' | 'approved' | 'paid' | 'rejected'>('pending');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [proofDrawerExpense, setProofDrawerExpense] = useState<any | null>(null);
  
  const [proofType, setProofType] = useState('receipt');
  const [proofNote, setProofNote] = useState('');

  const { data: allExpenses = [], isLoading, isError } = useQuery({
    queryKey: ['expenses', user?.userId],
    queryFn: async () => {
      const res = await api('/expenses');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return data.data || (Array.isArray(data) ? data : []);
    },
    enabled: !!user,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api(`/expenses/${id}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to approve');
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['expenses', user?.userId] });
      const previous = queryClient.getQueryData(['expenses', user?.userId]);
      queryClient.setQueryData(['expenses', user?.userId], (old: any) => 
        old ? old.map((e: any) => e.id === id ? { ...e, status: 'approved' } : e) : old
      );
      return { previous };
    },
    onError: (err, id, context: any) => {
      if (context?.previous) queryClient.setQueryData(['expenses', user?.userId], context.previous);
      alert('Approval failed: ' + err.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await api(`/expenses/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
      if (!res.ok) throw new Error('Reject failed');
      return res.json();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
    onError: (err) => alert('Reject failed: ' + err.message),
  });

  const requestProofMutation = useMutation({
    mutationFn: async ({ id, proofType, note }: { id: string; proofType: string; note: string }) => {
      const res = await api(`/expenses/${id}/request-proof`, { method: 'POST', body: JSON.stringify({ note: `[${proofType}] ${note}` }) });
      if (!res.ok) throw new Error('Request failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setProofDrawerExpense(null);
      setProofType('receipt');
      setProofNote('');
    },
    onError: (err) => {
      alert('Action failed: ' + err.message);
    }
  });

  const safeAllExpenses = Array.isArray(allExpenses) ? allExpenses : [];
  const filteredExpenses = useMemo(() => {
    return safeAllExpenses.filter((e: any) => {
      let statusMatch = false;
      if (filter === 'pending') statusMatch = ['submitted', 'proof_submitted', 'proof_requested'].includes(e.status);
      else if (filter === 'approved') statusMatch = e.status === 'approved';
      else if (filter === 'paid') statusMatch = e.status === 'paid';
      else if (filter === 'rejected') statusMatch = ['rejected', 'disputed'].includes(e.status);

      if (!statusMatch) return false;

      if (searchQuery) {
        const sq = searchQuery.toLowerCase();
        const searchMatch = 
          e.submitter?.full_name?.toLowerCase().includes(sq) ||
          e.category?.toLowerCase().includes(sq) ||
          e.description?.toLowerCase().includes(sq) ||
          e.id?.toLowerCase().includes(sq);
        return searchMatch;
      }
      
      return true;
    });
  }, [safeAllExpenses, filter, searchQuery]);

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkApprove = async () => {
    for (const id of Array.from(selectedIds)) {
      await approveMutation.mutateAsync(id);
    }
    setSelectedIds(new Set());
  };

  const pendingCount = safeAllExpenses.filter((e:any) => ['submitted', 'proof_submitted', 'proof_requested'].includes(e.status)).length;

  return (
    <LazyMotion features={domAnimation}>
      <m.div variants={pageVariants} initial="hidden" animate="visible" className="space-y-6 pb-8 relative">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">Approval Queue</h1>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
              <input 
                type="text" 
                placeholder="Search queue..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 bg-[rgba(255,255,255,0.04)] border border-white/[0.08] rounded-lg pl-9 pr-3 py-2 text-sm text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] focus:border-[var(--indigo)] focus:bg-[rgba(255,255,255,0.06)] transition-all"
              />
            </div>
          </div>
          
          <div className="flex space-x-2">
            {[
              { id: 'pending', label: `Pending · ${pendingCount}` },
              { id: 'approved', label: 'Approved' },
              { id: 'paid', label: 'Paid' },
              { id: 'rejected', label: 'Rejected' },
            ].map(tab => {
              const isActive = filter === tab.id;
              const isPending = tab.id === 'pending';
              const activeClass = isPending 
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25' 
                : 'bg-[var(--indigo)]/10 text-[var(--indigo)] border border-[var(--indigo)]/20';
              const inactiveClass = 'bg-white/5 text-[var(--text-muted)] border border-transparent hover:text-[var(--text-primary)]';
              
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setFilter(tab.id as any);
                    setSelectedIds(new Set());
                  }}
                  className={`px-4 py-2 text-sm font-medium rounded-full transition-all ${isActive ? activeClass : inactiveClass}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </header>

        <main className="flex gap-6 items-start relative">
          <div className="flex-1">
            <GlassCard className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[rgba(5,5,5,0.9)] backdrop-blur-xl sticky top-0 z-10 border-b border-white/[0.06]">
                    <tr>
                      {filter === 'pending' && <th className="px-4 py-3 w-12"></th>}
                      <th className="px-4 py-3 text-xs font-semibold text-[var(--text-muted)]">Date</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[var(--text-muted)]">Submitter</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[var(--text-muted)]">Amount</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[var(--text-muted)]">Category</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[var(--text-muted)]">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold text-[var(--text-muted)] text-right">Actions</th>
                    </tr>
                  </thead>
                  
                  <tbody className="divide-y divide-white/[0.04]">
                    {isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <tr key={`skeleton-${i}`}>
                          <td colSpan={filter === 'pending' ? 7 : 6} className="p-0">
                            <div className="skeleton h-14 w-full rounded-none"></div>
                          </td>
                        </tr>
                      ))
                    ) : isError ? (
                      <tr>
                        <td colSpan={filter === 'pending' ? 7 : 6} className="px-5 py-24 text-center">
                          <AlertCircle size={32} className="text-[var(--danger)] mx-auto mb-4" />
                          <p className="font-mono font-bold text-[var(--text-primary)] uppercase tracking-wider">FAILED TO LOAD QUEUE</p>
                          <p className="font-mono text-[11px] text-[var(--text-muted)] mt-1">An error occurred while fetching the review queue. Please refresh to try again.</p>
                        </td>
                      </tr>
                    ) : filteredExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={filter === 'pending' ? 7 : 6} className="px-5 py-24 text-center">
                          <CheckSquare size={32} className="text-[var(--text-muted)] mx-auto mb-4" />
                          <p className="font-mono font-bold text-[var(--text-primary)] uppercase tracking-wider">QUEUE IS CLEAR</p>
                          <p className="font-mono text-[11px] text-[var(--text-muted)] mt-1">No anomalous activities detected.</p>
                        </td>
                      </tr>
                    ) : (
                      <AnimatePresence initial={false}>
                        {filteredExpenses.map((e: any) => {
                          const isSelected = selectedIds.has(e.id);
                          const isApproving = approveMutation.isPending && approveMutation.variables === e.id;
                          const isRejecting = rejectMutation.isPending && rejectMutation.variables?.id === e.id;
                          
                          const rowBg = isApproving ? 'bg-[rgba(16,185,129,0.05)]' : isRejecting ? 'bg-[rgba(239,68,68,0.05)]' : isSelected ? 'bg-white/[0.04]' : '';
                          
                          return (
                            <m.tr 
                              key={e.id}
                              variants={rowVariants}
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                              className={`table-row-titan ${rowBg}`}
                            >
                              {filter === 'pending' && (
                                <td className="px-4 py-3 w-12 text-center">
                                  <input 
                                    type="checkbox" 
                                    checked={isSelected}
                                    onChange={() => handleToggleSelect(e.id)}
                                    className="w-4 h-4 rounded bg-white/5 border-white/10 text-[var(--indigo)] focus:ring-[var(--indigo)]/50 focus:ring-offset-[#050505] cursor-pointer"
                                  />
                                </td>
                              )}
                              <td className="px-4 py-3 text-sm text-[var(--text-muted)]">
                                {formatDate(e.expense_date || e.created_at)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.15)] text-[var(--indigo)] flex items-center justify-center text-xs font-medium">
                                    {e.submitter?.full_name?.substring(0, 2).toUpperCase() || 'UK'}
                                  </div>
                                  <span className="text-sm text-[var(--text-primary)]">{e.submitter?.full_name || 'Unknown'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-[var(--text-primary)]">
                                {formatINR(e.amount_paise)}
                              </td>
                              <td className="px-4 py-3 text-sm text-[var(--text-secondary)] capitalize">
                                {e.category?.replace(/_/g, ' ')}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge status={e.status} size="sm" />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-3">
                                  {filter === 'pending' && (
                                    <div className="flex items-center gap-2 mr-2">
                                      <button 
                                        title="Approve"
                                        onClick={() => approveMutation.mutate(e.id)}
                                        disabled={approveMutation.isPending}
                                        className="w-7 h-7 rounded-full bg-[var(--signal)]/10 text-[var(--signal)] border border-[var(--signal)]/20 hover:bg-[var(--signal)] hover:text-black flex items-center justify-center transition-all disabled:opacity-50"
                                      >
                                        <CheckCircle2 size={14} />
                                      </button>
                                      <button 
                                        title="Request Proof"
                                        onClick={() => setProofDrawerExpense(e)}
                                        className="w-7 h-7 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 flex items-center justify-center transition-all"
                                      >
                                        <AlertCircle size={14} />
                                      </button>
                                      <button 
                                        title="Reject"
                                        onClick={() => rejectMutation.mutate({ id: e.id, reason: 'Rejected via quick action' })}
                                        disabled={rejectMutation.isPending}
                                        className="w-7 h-7 rounded-full bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/20 hover:bg-[var(--danger)] hover:text-white flex items-center justify-center transition-all disabled:opacity-50"
                                      >
                                        <XCircle size={14} />
                                      </button>
                                    </div>
                                  )}
                                  <button 
                                    onClick={() => router.push(`/expenses/${e.id}`)}
                                    className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] font-mono text-[10px] uppercase transition-colors"
                                  >
                                    REVIEW <ChevronRight size={14} />
                                  </button>
                                </div>
                              </td>
                            </m.tr>
                          );
                        })}
                      </AnimatePresence>
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>

          <AnimatePresence>
            {selectedIds.size > 0 && (
              <m.div 
                variants={slideInRight}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="fixed right-0 top-14 bottom-0 w-[280px] bg-[rgba(5,5,5,0.95)] backdrop-blur-xl border-l border-white/[0.08] z-20 shadow-2xl p-6 flex flex-col"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-mono font-bold text-[var(--text-primary)]">{selectedIds.size} SELECTED</h2>
                  <button onClick={() => setSelectedIds(new Set())} className="font-mono text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">Clear</button>
                </div>
                
                <div className="flex-1 overflow-y-auto mb-6 space-y-3">
                  {Array.from(selectedIds).map(id => {
                    const exp = safeAllExpenses.find((e:any) => e.id === id);
                    if (!exp) return null;
                    return (
                      <div key={id} className="flex justify-between items-center text-sm font-mono border-b border-white/[0.04] pb-2">
                        <span className="text-[var(--text-secondary)] truncate pr-2">{exp.submitter?.full_name}</span>
                        <span className="text-[var(--text-primary)] font-bold">{formatINR(exp.amount_paise)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-auto">
                  <button 
                    onClick={handleBulkApprove}
                    disabled={approveMutation.isPending}
                    className="w-full bg-[var(--signal)] text-black font-mono text-xs font-bold px-4 py-3 rounded-lg hover:bg-[var(--signal-bright)] transition-all disabled:opacity-50 mb-3"
                  >
                    {approveMutation.isPending ? 'APPROVING...' : 'APPROVE ALL'}
                  </button>
                  <button 
                    onClick={() => {
                      // Simulating a bulk reject with a default reason for now
                      Array.from(selectedIds).forEach(id => rejectMutation.mutate({ id, reason: 'Bulk rejected' }));
                      setSelectedIds(new Set());
                    }}
                    disabled={rejectMutation.isPending}
                    className="w-full bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--danger)] font-mono text-xs px-4 py-3 rounded-lg hover:bg-[var(--danger)]/20 transition-all disabled:opacity-50"
                  >
                    REJECT ALL
                  </button>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </main>

        <AnimatePresence>
          {proofDrawerExpense && (
            <>
              <m.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setProofDrawerExpense(null)}
                className="titan-backdrop"
              />
              <FocusTrap>
                <m.div 
                  variants={slideInRight}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="fixed right-0 top-0 bottom-0 w-[400px] bg-[rgba(5,5,5,0.98)] backdrop-blur-2xl border-l border-white/[0.08] p-6 z-[60] flex flex-col shadow-2xl"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="proof-drawer-title"
                >
                  <div className="flex items-center justify-between mb-8">
                    <h2 id="proof-drawer-title" className="font-mono font-bold text-lg text-[var(--text-primary)]">REQUEST PROOF</h2>
                    <button onClick={() => setProofDrawerExpense(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Close drawer">
                    <X size={20} />
                  </button>
                </div>

                <div className="mb-6 p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase">EXPENSE AMOUNT</span>
                    <span className="font-mono font-bold text-lg text-[var(--text-primary)]">{formatINR(proofDrawerExpense.amount_paise)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase">SUBMITTER</span>
                    <span className="font-sans text-sm text-[var(--text-secondary)]">{proofDrawerExpense.submitter?.full_name}</span>
                  </div>
                </div>

                <div className="space-y-5 flex-1">
                  <div>
                    <label className="block font-mono text-[10px] text-[var(--text-muted)] uppercase mb-2">Proof Type Required</label>
                    <select 
                      value={proofType}
                      onChange={(e) => setProofType(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 font-mono text-sm rounded-lg p-3 text-[var(--text-primary)] focus:border-[var(--indigo)] focus:outline-none transition-colors"
                    >
                      <option value="receipt">Original Receipt</option>
                      <option value="invoice">Tax Invoice</option>
                      <option value="purchase_order">Purchase Order</option>
                      <option value="contract">Signed Contract</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block font-mono text-[10px] text-[var(--text-muted)] uppercase mb-2">Additional Note (Optional)</label>
                    <textarea 
                      value={proofNote}
                      onChange={(e) => setProofNote(e.target.value)}
                      placeholder="Explain what is missing..."
                      className="w-full bg-white/5 border border-white/[0.08] focus:border-[var(--indigo)] rounded-lg p-3 text-sm font-sans text-[var(--text-primary)] h-32 resize-none focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-white/[0.06] flex gap-3">
                  <button 
                    onClick={() => setProofDrawerExpense(null)}
                    className="flex-1 py-3 font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={() => requestProofMutation.mutate({ id: proofDrawerExpense.id, proofType, note: proofNote })}
                    disabled={requestProofMutation.isPending}
                    className="flex-[2] bg-amber-500/90 hover:bg-amber-400 text-black font-mono text-sm font-bold py-3 rounded-lg transition-all disabled:opacity-50"
                  >
                    {requestProofMutation.isPending ? 'SENDING...' : 'SEND REQUEST'}
                  </button>
                </div>
                </m.div>
              </FocusTrap>
            </>
          )}
        </AnimatePresence>
      </m.div>
    </LazyMotion>
  );
}
