"use client";

import { useEffect, useState } from 'react';
import { useAuth, useApi, isAdminUp, UserRole } from '@/lib/auth';

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const api = useApi();
  const [logs, setLogs] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const isAuthorized = isAdminUp(user?.role as UserRole);

  const loadLogs = (page: number = 1) => {
    if (page === 1) setLoading(true);
    api(`/audit-log?page=${page}`).then(r => r.json()).then(data => {
      const items = data.data || (Array.isArray(data) ? data : []);
      setHasMore(data.meta?.hasMore || false);
      setNextPage(data.meta?.nextPage || null);
      if (page > 1) setLogs(prev => [...prev, ...items]);
      else setLogs(items);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isAuthorized) { setLoading(false); return; }
    loadLogs(1);
  }, [isAuthorized]);

  if (!isAuthorized) {
    return (
      <div className="py-16 text-center">
        <div className="text-3xl mb-2">🔒</div>
        <p className="text-slate-500 font-medium">Access Denied</p>
        <p className="text-slate-400 text-sm mt-1">Only Black Card and Admin accounts can view the full audit log.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
        <p className="text-slate-400 text-sm mt-0.5">Chronological trail of all company and expense actions</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm animate-pulse">Loading audit trail…</div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-slate-500 font-medium">No activity yet</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Timestamp</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actor</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">
                    <div className="font-medium text-slate-700">{new Date(log.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                    <div className="text-xs">{new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                        ${log.actor?.role === 'PRINCIPAL' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {log.actor?.full_name?.charAt(0) || '?'}
                      </div>
                      <span className="text-sm font-medium text-slate-900">{log.actor?.full_name || 'System'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-block px-2 py-1 bg-slate-100 text-slate-700 text-xs font-mono rounded border border-slate-200">
                      {log.action}
                    </span>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="text-[10px] text-slate-400 mt-1 max-w-xs truncate">
                        {JSON.stringify(log.metadata)}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500">
                    {log.target_type && (
                      <div className="capitalize">{log.target_type} <span className="text-xs font-mono bg-slate-50 px-1 rounded border border-slate-100">{log.target_id?.slice(0, 8)}</span></div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => loadLogs(nextPage!)}
            className="px-6 py-2 bg-white border border-slate-200 text-slate-600 font-medium rounded-xl text-sm hover:bg-slate-50 transition-colors"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
