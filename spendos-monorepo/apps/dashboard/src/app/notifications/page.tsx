"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/lib/auth';

export default function NotificationsPage() {
  const api = useApi();
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (cursor?: string) => {
    if (!cursor) setLoading(true);
    api(cursor ? `/notifications?cursor=${cursor}` : '/notifications').then(r => r.json()).then(d => {
      const items = d.data || (Array.isArray(d) ? d : []);
      setHasMore(d.meta?.hasMore || false);
      setNextCursor(d.meta?.nextCursor || null);
      if (cursor) setNotifications(prev => [...prev, ...items]);
      else setNotifications(items);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    await api(`/notifications/${id}/read`, { method: 'PATCH', body: '{}' });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    await api('/notifications/read-all', { method: 'POST', body: '{}' });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const unread = notifications.filter(n => !n.is_read).length;

  const TYPE_ICONS: Record<string, string> = {
    expense_submitted: '📤',
    expense_approved:  '✅',
    expense_rejected:  '❌',
    expense_paid:      '💰',
    proof_requested:   '📋',
    proof_submitted:   '📎',
    ticket_raised:     '🎫',
    ticket_resolved:   '✓',
    account_frozen:    '🔒',
    account_unfrozen:  '🔓',
    invite_accepted:   '👋',
  };

  function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          {unread > 0 && <p className="text-slate-400 text-sm mt-0.5">{unread} unread</p>}
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="text-sm text-emerald-600 hover:text-emerald-500 font-medium transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm animate-pulse">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-3xl mb-2">🔔</div>
            <p className="text-slate-500 font-medium">All caught up</p>
            <p className="text-slate-400 text-sm mt-1">Notifications from your company will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {notifications.map(n => (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.is_read) markRead(n.id);
                  if (n.reference_type === 'expense') router.push('/expenses');
                  if (n.reference_type === 'ticket') router.push('/tickets');
                }}
                className={`flex items-start gap-4 px-5 py-4 transition-colors
                  ${!n.is_read ? 'bg-emerald-50/40 cursor-pointer hover:bg-emerald-50/60' : 'cursor-pointer hover:bg-slate-50/50'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 mt-0.5
                  ${!n.is_read ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                  {TYPE_ICONS[n.type] || '🔔'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${!n.is_read ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
                    {n.message}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                </div>
                {!n.is_read && (
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-2" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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
