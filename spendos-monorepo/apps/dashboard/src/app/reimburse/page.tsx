"use client";

import { useState, useEffect } from 'react';
import { useApi, useAuth } from '@/lib/auth';

export default function ReimbursePage() {
  const api = useApi();
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => { fetchExpenses(); }, []);

  const fetchExpenses = async () => {
    if (!user) return;
    setLoading(true);
    const res = await api('/expenses');
    if (res.ok) {
      const data = await res.json();
      const items = data.data || (Array.isArray(data) ? data : []);
      setExpenses(items.filter((e: any) => e.status === 'approved'));
    }
    setLoading(false);
  };

  const handleReimburse = async (id: string) => {
    if (!user) return;
    setProcessing(id);
    try {
      const res = await api(`/expenses/${id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ paymentDate: new Date().toISOString() }),
      });
      if (res.ok) {
        fetchExpenses();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Reimbursement failed');
      }
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Process Reimbursements</h1>
        <p className="text-slate-500 text-sm mt-1">Approved expenses awaiting finance payout. Each reimbursement creates a ledger entry.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-slate-400">Loading...</div>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <div className="text-4xl mb-2">💰</div>
            No approved expenses awaiting reimbursement.
          </div>
        ) : (
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3">Approved Date</th>
              <th className="px-6 py-3">User</th>
              <th className="px-6 py-3">Amount</th>
              <th className="px-6 py-3">Description</th>
              <th className="px-6 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expenses.map(e => (
              <tr key={e.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 text-sm text-slate-600">{new Date(e.approved_at || e.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{e.submitter?.full_name || '—'}</td>
                <td className="px-6 py-4 text-sm font-semibold text-slate-900">₹{(Number(e.amount_paise) / 100).toFixed(2)}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{e.description}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleReimburse(e.id)}
                    disabled={processing === e.id}
                    className="text-xs bg-violet-600 text-white px-4 py-1.5 rounded-lg hover:bg-violet-500 disabled:bg-violet-300 font-medium transition-colors"
                  >
                    {processing === e.id ? 'Processing...' : '💸 Reimburse'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}

