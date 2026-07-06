'use client';

import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { Activity, CreditCard, ShieldCheck, AlertTriangle } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { OnboardingOverlay } from './OnboardingOverlay';
import { m } from 'framer-motion';
import { staggerContainer } from '@/lib/motion';

export function AdminDashboard({ data }: { data: any }) {
  const spendTrendData = useMemo(() => data?.spend_trend || [], [data]);
  const categoryData = useMemo(() => {
    if (!Array.isArray(data?.categories)) return [];
    return data.categories.map((c: any) => ({
      name: (c.category || 'Unknown').replace(/_/g, ' '),
      value: Number(c.amount || 0)
    }));
  }, [data]);

  const recentDisbursals = useMemo(() => data?.recent_disbursals || [], [data]);

  // Founder setup checklist — only for the roles that actually configure the
  // company (Admin, and Principal via its embed of this dashboard).
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const hasTeam = (data?.teamSize ?? 0) > 1;
  const hasFirstExpense = (data?.recent_disbursals?.length ?? 0) > 0 || (data?.pendingApprovals ?? 0) > 0;

  return (
    <div className="space-y-6">
      {!onboardingDismissed && (
        <OnboardingOverlay
          hasExpenses={hasFirstExpense}
          hasTeam={hasTeam}
          onDismiss={() => setOnboardingDismissed(true)}
        />
      )}
      <m.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <CreditCard size={48} className="text-[var(--indigo)]" />
          </div>
          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Total Spend (MTD)</p>
          <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
            <AnimatedNumber value={Number(data?.velocity || 0) / 100} formatter={(v) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
          </div>
        </GlassCard>

        <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <Activity size={48} className="text-[var(--signal)]" />
          </div>
          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Pending Approvals</p>
          <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
            <AnimatedNumber value={data?.pendingApprovals || 0} />
          </div>
        </GlassCard>

        <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <AlertTriangle size={48} className="text-[var(--amber)]" />
          </div>
          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Flagged Items</p>
          <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
            <AnimatedNumber value={data?.flaggedItems || 0} />
          </div>
        </GlassCard>

        <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <ShieldCheck size={48} className="text-[var(--indigo)]" />
          </div>
          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Active Policies</p>
          <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
            <AnimatedNumber value={data?.activePolicies || 0} />
          </div>
        </GlassCard>
      </m.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassCard animate variant="elevated" className="lg:col-span-2 p-5 flex flex-col min-h-[350px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-mono text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest">30-Day Outflow Velocity</h3>
            <span className="font-mono text-[10px] px-2 py-1 bg-[var(--indigo)]/10 text-[var(--indigo)] rounded border border-[var(--indigo)]/20">REALTIME</span>
          </div>
          <div className="flex-1 w-full h-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spendTrendData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--indigo)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--indigo)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.1)" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} dy={10} minTickGap={30} />
                <YAxis stroke="rgba(255,255,255,0.1)" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontFamily: 'monospace' }} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${(val / 1000).toFixed(0)}k`} dx={-10} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'rgba(5,5,5,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                  itemStyle={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '12px' }}
                  labelStyle={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '10px', marginBottom: '4px' }}
                  formatter={(value: any) => [`₹${Number(value || 0).toLocaleString('en-IN')}`, 'Spend']}
                />
                <Area type="monotone" dataKey="amount" stroke="var(--indigo)" strokeWidth={2} fillOpacity={1} fill="url(#spendGradient)" activeDot={{ r: 6, fill: 'var(--indigo)', stroke: '#000', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

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
      </div>

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
  );
}
