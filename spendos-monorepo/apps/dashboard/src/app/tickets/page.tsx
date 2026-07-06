"use client";

import { useEffect, useState } from 'react';
import { useApi, useAuth, isAdminUp } from '@/lib/auth';
import { ReasonModal } from '../../components/ReasonModal';

function formatRupees(paise: string | number) {
  const p = typeof paise === 'string' ? parseInt(paise) : paise;
  return '₹' + (p / 100).toLocaleString('en-IN');
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  open:     { label: 'Open',     cls: 'bg-red-100 text-red-700' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-100 text-emerald-700' },
  extended: { label: 'Extended', cls: 'bg-blue-100 text-blue-700' },
  disputed: { label: 'Disputed', cls: 'bg-orange-100 text-orange-700' },
};

export default function TicketsPage() {
  const api = useApi();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // State for inline actions
  const [modalState, setModalState] = useState<{ open: boolean; action: 'mark_paid' | 'extend' | 'dispute' | ''; ticket: any | null }>({ open: false, action: '', ticket: null });

  const load = (cursor?: string) => {
    if (!cursor) setLoading(true);
    api(cursor ? `/tickets?cursor=${cursor}` : '/tickets').then(r => r.json()).then(d => {
      const items = d.data || (Array.isArray(d) ? d : []);
      setHasMore(d.meta?.hasMore || false);
      setNextCursor(d.meta?.nextCursor || null);
      if (cursor) setTickets(prev => [...prev, ...items]);
      else setTickets(items);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleResolve = async (reasonText: string) => {
    const { action, ticket } = modalState;
    if (!ticket) return;

    let payload: any = { action };
    
    if (action === 'mark_paid') {
      payload.paymentNote = reasonText;
    } else if (action === 'extend') {
      payload.reason = reasonText;
      // Default to +7 days extension since ReasonModal only collects text
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      payload.newDeadlineDate = nextWeek.toISOString().slice(0, 10);
    } else if (action === 'dispute') {
      payload.reason = reasonText;
    }

    try {
      const res = await api(`/tickets/${ticket.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      setModalState({ open: false, action: '', ticket: null });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const open = tickets.filter(t => t.status === 'open');
  const resolved = tickets.filter(t => t.status !== 'open');
  
  const canAct = user && isAdminUp(user.role as any);

  let modalProps = { title: '', placeholder: '', submitLabel: 'Submit' };
  if (modalState.action === 'mark_paid') {
    modalProps = { title: 'Mark Paid', placeholder: 'Payment details (UPI ref, NEFT, optional)', submitLabel: 'Mark Paid' };
  } else if (modalState.action === 'extend') {
    modalProps = { title: 'Request Extension', placeholder: 'Reason for extension (required)', submitLabel: 'Extend by 7 Days' };
  } else if (modalState.action === 'dispute') {
    modalProps = { title: 'Dispute Ticket', placeholder: 'Reason for dispute (required)', submitLabel: 'Dispute' };
  }

  return (
    <div className="max-w-4xl mx-auto">
      <ReasonModal
        isOpen={modalState.open}
        title={modalProps.title}
        placeholder={modalProps.placeholder}
        submitLabel={modalProps.submitLabel}
        onClose={() => setModalState({ open: false, action: '', ticket: null })}
        onSubmit={handleResolve}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Tickets</h1>
        <p className="text-slate-400 text-sm mt-0.5">SLA overdue payment requests</p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm animate-pulse">Loading tickets...</div>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-16 text-center">
          <div className="text-3xl mb-2">🎫</div>
          <p className="text-slate-500 font-medium">No tickets yet</p>
          <p className="text-slate-400 text-sm mt-1">Tickets appear when approved expenses exceed the SLA deadline.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {open.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Open · {open.length}</div>
              <div className="space-y-3">
                {open.map(t => (
                  <div key={t.id} className="bg-white rounded-2xl border border-red-200/60 shadow-sm p-5 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-lg shrink-0">🎫</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{t.raiser?.full_name}</span>
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Open</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatRupees(t.expense?.amount_paise)} · {t.expense?.category?.replace('_', ' ')} ·{' '}
                        Raised {new Date(t.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </div>
                      {t.employee_note && (
                        <div className="text-xs text-slate-400 mt-1 italic">"{t.employee_note}"</div>
                      )}
                    </div>
                    {canAct && (
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => setModalState({ open: true, action: 'mark_paid', ticket: t })} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">Mark Paid</button>
                        <button onClick={() => setModalState({ open: true, action: 'extend', ticket: t })} className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">Extend</button>
                        <button onClick={() => setModalState({ open: true, action: 'dispute', ticket: t })} className="text-xs bg-orange-600 hover:bg-orange-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">Dispute</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {resolved.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Resolved · {resolved.length}</div>
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm divide-y divide-slate-50">
                {resolved.map(t => {
                  const st = STATUS_STYLES[t.status] || { label: t.status, cls: 'bg-slate-100 text-slate-600' };
                  return (
                    <div key={t.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">{t.raiser?.full_name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {formatRupees(t.expense?.amount_paise)} ·{' '}
                          {t.resolved_at ? new Date(t.resolved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                        </div>
                        {t.resolver && <div className="text-xs text-slate-500 mt-1">Resolved by {t.resolver.full_name}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => load(nextCursor!)}
            className="px-6 py-2 bg-white border border-slate-200 text-slate-600 font-medium rounded-xl text-sm hover:bg-slate-50 transition-colors"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
