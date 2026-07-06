'use client';

import { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip } from 'recharts';
import { Activity, CreditCard } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { m } from 'framer-motion';
import { staggerContainer } from '@/lib/motion';
import Link from 'next/link';

export function EmployeeDashboard({ data }: { data: any }) {
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const categoryData = useMemo(() => {
    if (!Array.isArray(data?.categories)) return [];
    return data.categories.map((c: any) => ({
      name: (c.category || 'Unknown').replace(/_/g, ' '),
      value: Number(c.amount || 0)
    }));
  }, [data]);

  const recentDisbursals = useMemo(() => data?.recent_disbursals || [], [data]);

  // Employees can only submit expenses — so their first-run nudge points at
  // exactly that, never at company-setup steps they have no permission for.
  const hasFirstExpense =
    (data?.recent_disbursals?.length ?? 0) > 0 || (data?.pendingApprovals ?? 0) > 0;

  return (
    <div className="space-y-6">
      {!nudgeDismissed && !hasFirstExpense && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <div>
            <h3 className="text-[var(--text-primary)] font-semibold">Welcome to SpendOS</h3>
            <p className="text-[var(--text-muted)] text-sm mt-0.5">
              Submit your first expense to get reimbursed — it&apos;ll show up here once it&apos;s in.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/submit"
              className="px-4 py-2 bg-[var(--indigo)] text-white text-sm font-medium rounded-lg hover:bg-[var(--indigo-bright)] transition-colors"
            >
              Submit an expense →
            </Link>
            <button
              onClick={() => setNudgeDismissed(true)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl leading-none px-1"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      )}
      <m.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <CreditCard size={48} className="text-[var(--indigo)]" />
          </div>
          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">My Spend (MTD)</p>
          <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
            <AnimatedNumber value={Number(data?.velocity || 0) / 100} formatter={(v) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
          </div>
        </GlassCard>

        <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <Activity size={48} className="text-[var(--signal)]" />
          </div>
          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">My Pending Claims</p>
          <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
            <AnimatedNumber value={data?.pendingApprovals || 0} />
          </div>
        </GlassCard>
      </m.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard animate variant="elevated" className="p-5 flex flex-col min-h-[350px]">
          <h3 className="font-mono text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest mb-6">Spend Topology</h3>
          <div className="flex-1 w-full h-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-primary)', fontSize: 11, fontWeight: 500 }} width={100} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{ backgroundColor: 'rgba(5,5,5,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '12px' }}
                  formatter={(value: any) => [`₹${Number(value || 0).toLocaleString('en-IN')}`, 'Amount']}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                  {categoryData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--indigo)' : index === 1 ? 'var(--indigo-bright)' : 'var(--slate-600)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard animate variant="elevated" className="p-5 overflow-hidden">
          <h3 className="font-mono text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest mb-6">Recent Disbursals</h3>
          {recentDisbursals.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-muted)] font-mono text-xs uppercase tracking-wider">
              No recent disbursals detected
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="pb-3 font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Merchant</th>
                    <th className="pb-3 font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Category</th>
                    <th className="pb-3 font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {recentDisbursals.map((d: any, i: number) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 text-sm text-[var(--text-primary)] font-medium">{d.merchant}</td>
                      <td className="py-3 text-xs text-[var(--text-muted)] capitalize">{d.category.replace(/_/g, ' ')}</td>
                      <td className="py-3 text-sm text-[var(--text-primary)] font-mono font-semibold">
                        ₹{(d.amount / 100).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
