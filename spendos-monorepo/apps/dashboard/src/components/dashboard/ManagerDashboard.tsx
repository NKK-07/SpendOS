'use client';

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { Activity, CreditCard, Users, ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { m } from 'framer-motion';
import { staggerContainer } from '@/lib/motion';

export function ManagerDashboard({ data }: { data: any }) {
  const categoryData = useMemo(() => {
    if (!Array.isArray(data?.categories)) return [];
    return data.categories.map((c: any) => ({
      name: (c.category || 'Unknown').replace(/_/g, ' '),
      value: Number(c.amount || 0)
    }));
  }, [data]);

  return (
    <div className="space-y-6">
      <m.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <Activity size={48} className="text-[var(--signal)]" />
          </div>
          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Team Pending Approvals</p>
          <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
            <AnimatedNumber value={data?.pendingApprovals || 0} />
          </div>
        </GlassCard>

        <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <CreditCard size={48} className="text-[var(--indigo)]" />
          </div>
          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">My Total Spend (MTD)</p>
          <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
            <AnimatedNumber value={Number(data?.velocity || 0) / 100} formatter={(v) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} />
          </div>
        </GlassCard>

        <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <Users size={48} className="text-[var(--amber)]" />
          </div>
          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Dept Budget Utilised</p>
          <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
            {data?.limitUtilization || "0%"}
          </div>
        </GlassCard>

        <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <ShieldCheck size={48} className="text-[var(--indigo)]" />
          </div>
          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Personal Limit Utilised</p>
          <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
            {data?.limitUtilization || "0%"}
          </div>
        </GlassCard>
      </m.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard animate variant="elevated" className="p-5 flex flex-col min-h-[350px]">
          <h3 className="font-mono text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest mb-6">My Spend Topology</h3>
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
          <h3 className="font-mono text-xs font-bold text-[var(--text-primary)] uppercase tracking-widest mb-6">Needs Review</h3>
          <div className="py-8 text-center text-[var(--text-muted)] font-mono text-xs uppercase tracking-wider">
            All caught up! No pending approvals for your team.
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
