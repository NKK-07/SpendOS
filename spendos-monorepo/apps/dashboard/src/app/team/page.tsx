"use client";

import { useEffect, useState } from 'react';
import { useAuth, useApi, isAdminUp, isReviewer, ROLE_LABELS, UserRole } from '@/lib/auth';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'PRINCIPAL', label: '◆ Black Card' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'VIP', label: 'VIP' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'EMPLOYEE', label: 'Employee' },
];

function canInvite(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === 'PRINCIPAL') return true;
  if (actorRole === 'ADMIN') return ['VIP', 'MANAGER', 'EMPLOYEE'].includes(targetRole);
  if (actorRole === 'MANAGER') return targetRole === 'EMPLOYEE';
  return false;
}

function RolePill({ role }: { role: UserRole }) {
  const styles: Record<UserRole, string> = {
    PRINCIPAL: 'bg-amber-100 text-amber-700 border-amber-200',
    ADMIN:      'bg-violet-100 text-violet-700 border-violet-200',
    VIP:        'bg-pink-100 text-pink-700 border-pink-200',
    MANAGER:    'bg-blue-100 text-blue-700 border-blue-200',
    EMPLOYEE:   'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${styles[role]}`}>
      {role === 'PRINCIPAL' ? '◆ Black Card' : ROLE_LABELS[role]}
    </span>
  );
}

function InviteModal({ actorRole, onClose, onSuccess }: {
  actorRole: UserRole; onClose: () => void; onSuccess: (token: string) => void;
}) {
  const api = useApi();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [defaultPassword, setDefaultPassword] = useState('');
  const [role, setRole] = useState<UserRole>('EMPLOYEE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const availableRoles = ROLE_OPTIONS.filter(r => canInvite(actorRole, r.value));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const payload = { email, role, ...(fullName && { fullName }), ...(defaultPassword && { defaultPassword }) };
      const res = await api('/users/invite', { method: 'POST', body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invite failed');
      
      if (data.directCreation) {
        onSuccess('direct_creation');
      } else {
        onSuccess(data.inviteToken);
      }
    } catch (err: any) {
      setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Invite Team Member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full bg-white text-slate-900 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name <span className="text-slate-400 font-normal">(Optional)</span></label>
              <input
                type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full bg-white text-slate-900 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Default Password <span className="text-slate-400 font-normal">(Optional)</span></label>
              <input
                type="password" value={defaultPassword} onChange={e => setDefaultPassword(e.target.value)}
                placeholder="Skip invite email"
                className="w-full bg-white text-slate-900 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
            <div className="flex gap-2 flex-wrap">
              {availableRoles.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all
                    ${role === r.value ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-all">
              {loading ? 'Sending…' : 'Send Invite →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InviteTokenModal({ token, onClose }: { token: string; onClose: () => void }) {
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${token}`;
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
        <div className="text-4xl mb-3">📧</div>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Invite sent!</h2>
        <p className="text-slate-500 text-sm mb-5">Share this link directly (beta — email sending coming soon):</p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 break-all mb-4">{link}</div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm">Close</button>
          <button onClick={copy}
            className={`flex-1 font-semibold py-2.5 rounded-xl text-sm transition-all
              ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
            {copied ? '✓ Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { user } = useAuth();
  const api = useApi();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  const load = (cursor?: string) => {
    if (!cursor) setLoading(true);
    api(cursor ? `/users?cursor=${cursor}` : '/users')
      .then(r => r.json())
      .then(res => {
        const items = res.data || (Array.isArray(res) ? res : []);
        setHasMore(res.meta?.hasMore || false);
        setNextCursor(res.meta?.nextCursor || null);
        if (cursor) setUsers(prev => [...prev, ...items]);
        else setUsers(items);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const freeze = async (id: string) => {
    const reason = prompt('Reason for freezing (optional):');
    if (reason === null) return;
    setActionLoading(id);
    await api(`/users/${id}/freeze`, { method: 'POST', body: JSON.stringify({ reason }) });
    load(); setActionLoading('');
  };

  const unfreeze = async (id: string) => {
    setActionLoading(id);
    await api(`/users/${id}/unfreeze`, { method: 'POST', body: '{}' });
    load(); setActionLoading('');
  };

  const reactivate = async (id: string) => {
    setActionLoading(id);
    const res = await api(`/users/${id}/reactivate`, { method: 'POST', body: '{}' });
    if (res.ok) load();
    else { const d = await res.json(); alert(d.error || 'Failed to reactivate'); }
    setActionLoading('');
  };

  const deactivate = async (id: string) => {
    if (!window.confirm('Deactivate this user? They will lose access immediately.')) return;
    setActionLoading(id);
    const res = await api(`/users/${id}/deactivate`, { method: 'POST', body: '{}' });
    if (res.ok) load();
    else { const d = await res.json(); alert(d.error || 'Failed to deactivate'); }
    setActionLoading('');
  };

  const actorRole = user?.role as UserRole;
  const canDoAdminActions = isAdminUp(actorRole);

  return (
    <div className="max-w-5xl mx-auto">
      {showInvite && (
        <InviteModal
          actorRole={actorRole}
          onClose={() => setShowInvite(false)}
          onSuccess={token => { 
            setShowInvite(false); 
            if (token === 'direct_creation') {
              alert('Account created! They can log in immediately with the default password.');
            } else {
              setInviteToken(token); 
            }
            load(); 
          }}
        />
      )}
      {inviteToken && <InviteTokenModal token={inviteToken} onClose={() => setInviteToken('')} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team</h1>
          <p className="text-slate-400 text-sm mt-0.5">{users.length} member{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all flex items-center gap-2"
        >
          <span>+</span> Invite Member
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm animate-pulse">Loading team…</div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-3xl mb-2">👥</div>
            <p className="text-slate-500 font-medium">No team members yet</p>
            <p className="text-slate-400 text-sm mt-1">Invite your first team member to get started.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Name', 'Role', 'Status', 'Last active', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((u: any) => {
                const isMe = u.id === user?.userId;
                const isBlackCard = u.role === 'PRINCIPAL';
                const isFrozen = u.is_frozen;
                const isInactive = !u.is_active;
                const canAct = canDoAdminActions && !isMe && !(isBlackCard && actorRole !== 'PRINCIPAL');

                return (
                  <tr key={u.id} className={`transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                          ${isBlackCard ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                          {u.full_name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                            {u.full_name}
                            {isMe && <span className="text-xs text-slate-400">(you)</span>}
                            {isBlackCard && actorRole !== 'PRINCIPAL' && <span className="text-xs text-amber-600 font-semibold">🔒</span>}
                          </div>
                          <div className="text-xs text-slate-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <RolePill role={u.role as UserRole} />
                    </td>
                    <td className="px-5 py-4">
                      {isInactive ? (
                        <span className="text-xs font-medium text-slate-400">Deactivated</span>
                      ) : isFrozen ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-orange-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400" /> Frozen
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Never'}
                    </td>
                    <td className="px-5 py-4">
                      {canAct && (
                        <div className="flex items-center gap-2">
                          {isInactive ? (
                            <button
                              disabled={actionLoading === u.id}
                              onClick={() => reactivate(u.id)}
                              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                            >Reactivate</button>
                          ) : (
                            <>
                              {isFrozen ? (
                                <button
                                  disabled={actionLoading === u.id}
                                  onClick={() => unfreeze(u.id)}
                                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                                >Unfreeze</button>
                              ) : (
                                <button
                                  disabled={actionLoading === u.id}
                                  onClick={() => freeze(u.id)}
                                  className="text-xs font-medium text-orange-500 hover:text-orange-600 transition-colors"
                                >Freeze</button>
                              )}
                              <span className="text-slate-200">·</span>
                              <button
                                disabled={actionLoading === u.id}
                                onClick={() => deactivate(u.id)}
                                className="text-xs font-medium text-red-400 hover:text-red-500 transition-colors"
                              >Deactivate</button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
