'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, useApi, isReviewer } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { formatINR, formatDate, formatDateTime } from '@/lib/format';
import { pageVariants, springTitan } from '@/lib/motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MonoHash } from '@/components/ui/MonoHash';
import { ChevronLeft, FileText, CheckCircle2, XCircle, AlertCircle, FileUp, CreditCard } from 'lucide-react';
import { ReasonModal } from '@/components/ReasonModal';

export default function ExpenseDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const { data: expense, isLoading } = useQuery({
    queryKey: ['expenses', id, user?.userId],
    queryFn: async () => {
      const res = await api(`/expenses/${id}`);
      if (!res.ok) throw new Error('Failed to fetch expense');
      const data = await res.json();
      return data;
    },
    enabled: !!user && !!id,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await api(`/expenses/${id}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to approve');
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await api(`/expenses/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
      if (!res.ok) throw new Error('Failed to reject');
      return res.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setShowRejectInput(false);
    }
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[500px]">
        <div className="skeleton w-12 h-12 rounded-full"></div>
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px]">
        <h2 className="font-mono text-xl text-[var(--text-primary)]">EXPENSE NOT FOUND</h2>
        <button onClick={() => router.back()} className="mt-4 text-[var(--indigo)] font-mono text-sm">Return</button>
      </div>
    );
  }

  const isPending = ['submitted', 'proof_submitted'].includes(expense.status);
  const canReview = user?.role && isReviewer(user.role) && isPending;

  return (
    <LazyMotion features={domAnimation}>
      <m.div variants={pageVariants} initial="hidden" animate="visible" className="max-w-[1000px] mx-auto p-4 md:p-8 space-y-8">
        
        <button onClick={() => router.back()} className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors font-mono text-[10px] uppercase tracking-widest">
          <ChevronLeft size={14} /> BACK TO LIST
        </button>

        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-white/[0.06]">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-sans text-3xl font-bold text-[var(--text-primary)]">{formatINR(expense.amount_paise)}</h1>
              <StatusBadge status={expense.status} size="md" />
            </div>
            <p className="font-mono text-xs text-[var(--text-secondary)]">{expense.description || 'No description provided'}</p>
          </div>
          
          {canReview && (
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button 
                onClick={() => setShowRejectInput(true)}
                className="flex-1 md:flex-none px-4 py-2.5 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/10 font-mono text-xs font-bold uppercase transition-all"
              >
                Reject
              </button>
              <button 
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                className="flex-1 md:flex-none px-6 py-2.5 rounded-lg bg-[var(--signal)] hover:bg-[var(--signal-bright)] text-black font-mono text-xs font-bold uppercase transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-50"
              >
                {approveMutation.isPending ? 'Processing...' : 'Approve'}
              </button>
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <GlassCard className="p-6">
              <h3 className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-6">Details</h3>
              
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <dt className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-1">Submitter</dt>
                  <dd className="font-sans text-sm text-[var(--text-primary)]">{expense.submitter?.full_name}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-1">Category</dt>
                  <dd className="font-mono text-xs text-[var(--text-secondary)] uppercase bg-white/5 px-2 py-1 rounded inline-block">
                    {expense.category?.replace(/_/g, ' ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)] mb-1">Date of Expense</dt>
                  <dd className="text-sm text-[var(--text-primary)]">{formatDate(expense.expense_date)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)] mb-1">Created At</dt>
                  <dd className="text-sm text-[var(--text-secondary)]">{formatDateTime(expense.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)] mb-1">GST Verification</dt>
                  <dd className="text-sm font-medium">
                    {expense.gst_status === 'failed' ? (
                      <span className="text-[var(--danger)]">Failed Validation</span>
                    ) : expense.gst_status === 'pending' ? (
                      <span className="text-[var(--amber)]">Pending</span>
                    ) : (
                      <span className="text-[var(--signal)]">GSTIN Verified</span>
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2 mt-4 pt-4 border-t border-white/[0.06]">
                  <dt className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-2">Tracking ID</dt>
                  <dd><MonoHash hash={expense.id} showFull copyable size="sm" /></dd>
                </div>
              </dl>
            </GlassCard>

            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-widest">Receipt Documentation</h3>
              </div>
              
              {expense.receipt_url ? (
                <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl group hover:bg-white/[0.04] transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-[var(--indigo)]/10 flex items-center justify-center text-[var(--indigo)]">
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="font-sans text-sm text-[var(--text-primary)]">Receipt Document</p>
                      <p className="font-mono text-[10px] text-[var(--text-muted)]">Stored in S3</p>
                    </div>
                  </div>
                  <a href={expense.receipt_url && /^https?:\/\//i.test(expense.receipt_url) ? expense.receipt_url : '#'} target="_blank" rel="noreferrer" className="text-[var(--indigo)] opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-[var(--indigo)]/10 rounded-lg" onClick={(e) => { if (!expense.receipt_url || !/^https?:\/\//i.test(expense.receipt_url)) { e.preventDefault(); alert('Security: Unsafe URL blocked'); } }}>
                    View
                  </a>
                </div>
              ) : (
                <div className="py-8 text-center bg-white/[0.02] border border-white/[0.06] border-dashed rounded-xl">
                  <FileUp size={24} className="text-[var(--text-muted)] mx-auto mb-3" />
                  <p className="font-mono text-xs text-[var(--text-secondary)]">No receipt attached</p>
                </div>
              )}
            </GlassCard>
          </div>

          <div className="space-y-6">
            <GlassCard className="p-6 bg-[rgba(15,15,20,0.95)]">
              <h3 className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-6">Audit Trail</h3>
              <div className="space-y-6">
                <div className="relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-[-24px] before:w-px before:bg-white/[0.1] last:before:hidden">
                  <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-[rgba(255,255,255,0.1)] border-2 border-[#050505]" />
                  <p className="font-mono text-[10px] text-[var(--text-muted)]">{formatDateTime(expense.created_at)}</p>
                  <p className="font-sans text-sm text-[var(--text-primary)] mt-1">Expense Submitted</p>
                  <p className="font-mono text-[10px] text-[var(--text-secondary)] mt-0.5">by {expense.submitter?.full_name}</p>
                </div>
                
                {expense.status === 'approved' || expense.status === 'paid' ? (
                  <div className="relative pl-6">
                    <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-[var(--signal)] border-2 border-[#050505] shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <p className="font-mono text-[10px] text-[var(--text-muted)]">{formatDateTime(expense.updated_at)}</p>
                    <p className="font-sans text-sm text-[var(--signal)] font-medium mt-1">Approved</p>
                  </div>
                ) : null}

                {expense.status === 'rejected' ? (
                  <div className="relative pl-6">
                    <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-[var(--danger)] border-2 border-[#050505] shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                    <p className="font-mono text-[10px] text-[var(--text-muted)]">{formatDateTime(expense.updated_at)}</p>
                    <p className="font-sans text-sm text-[var(--danger)] font-medium mt-1">Rejected</p>
                  </div>
                ) : null}
              </div>
            </GlassCard>
          </div>
        </div>
      </m.div>

      <ReasonModal 
        isOpen={showRejectInput}
        title="Reject Expense"
        placeholder="Please provide a reason for rejection..."
        submitLabel="Reject"
        onClose={() => setShowRejectInput(false)}
        onSubmit={(reason) => rejectMutation.mutate(reason)}
      />
    </LazyMotion>
  );
}
