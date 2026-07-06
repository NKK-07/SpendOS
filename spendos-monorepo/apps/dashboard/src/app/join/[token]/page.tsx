"use client";

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth, API_BASE } from '@/lib/auth';

export default function JoinPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const { login } = useAuth();

  const [loading, setLoading] = useState(true);
  const [inviteData, setInviteData] = useState<any>(null);
  const [error, setError] = useState('');
  
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/auth/invite/${token}`)
      .then(res => {
        if (!res.ok) throw new Error('Invalid or expired invite link');
        return res.json();
      })
      .then(data => {
        setInviteData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 10 || !/\d/.test(password)) {
      setError('Password must be at least 10 characters and contain at least one number');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create account');
      }
      
      // Auto-login
      await login(inviteData.email, password);
      // Wait for navigation
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-emerald-500 font-medium animate-pulse">Verifying invite…</div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6 py-12">
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur border border-slate-800/60 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-sm font-black text-slate-900">S</div>
          <span className="text-xl font-bold text-white tracking-tight">Spend<span className="text-emerald-400">OS</span></span>
        </div>

        {error && !inviteData ? (
          <div className="text-center">
            <div className="text-4xl mb-4">🔗</div>
            <h2 className="text-xl font-bold text-white mb-2">Invite Invalid</h2>
            <p className="text-slate-400 text-sm mb-6">{error}</p>
            <button onClick={() => router.push('/login')} className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
              Return to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white">Join your team</h2>
              <p className="text-slate-400 text-sm mt-1">Set up your profile to accept the invite.</p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                <span>⚠</span> {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input value={inviteData.email} disabled className="w-full bg-slate-800 border border-slate-700/50 text-slate-400 rounded-xl px-4 py-3 text-sm cursor-not-allowed" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
              <input
                value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="Jane Doe"
                className="w-full bg-slate-800/60 border border-slate-700/60 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/40"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Create Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min 10 chars + 1 number"
                className="w-full bg-slate-800/60 border border-slate-700/60 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/40"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm Password</label>
              <input
                type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="••••••••••"
                className="w-full bg-slate-800/60 border border-slate-700/60 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/40"
              />
            </div>

            <button
              type="submit" disabled={submitting}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all duration-200 text-sm shadow-lg shadow-emerald-500/20 mt-2"
            >
              {submitting ? 'Creating account…' : 'Join SpendOS →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
