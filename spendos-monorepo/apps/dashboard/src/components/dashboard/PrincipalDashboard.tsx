'use client';

import { useMemo } from 'react';
import { AdminDashboard } from './AdminDashboard';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { m } from 'framer-motion';
import { staggerContainer } from '@/lib/motion';
import { Shield, Users, ScrollText, Settings, CreditCard, Activity } from 'lucide-react';
import Link from 'next/link';

function QuickAction({ href, icon: Icon, label, description, accentColor }: {
  href: string;
  icon: any;
  label: string;
  description: string;
  accentColor: string;
}) {
  return (
    <Link href={href}>
      <GlassCard variant="raised" className="p-4 group cursor-pointer hover:border-[var(--indigo)]/30 transition-all duration-300">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accentColor}`}>
            <Icon size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--indigo)] transition-colors">{label}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{description}</p>
          </div>
        </div>
      </GlassCard>
    </Link>
  );
}

export function PrincipalDashboard({ data }: { data: any }) {
  const systemStats = useMemo(() => ({
    activePolicies: data?.activePolicies || 0,
    flaggedItems: data?.flaggedItems || 0,
    pendingApprovals: data?.pendingApprovals || 0,
  }), [data]);

  return (
    <div className="space-y-8">
      {/* ── Principal System Strip ── */}
      <m.div variants={staggerContainer} className="space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={14} className="text-amber-400" />
          <span className="font-mono text-[10px] text-amber-400 uppercase tracking-widest font-bold">Black Card · System Overview</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group border-amber-500/10">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-25 transition-opacity">
              <Activity size={48} className="text-amber-400" />
            </div>
            <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Pending Approvals</p>
            <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
              <AnimatedNumber value={systemStats.pendingApprovals} />
            </div>
          </GlassCard>

          <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group border-amber-500/10">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-25 transition-opacity">
              <Shield size={48} className="text-amber-400" />
            </div>
            <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Active Policies</p>
            <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
              <AnimatedNumber value={systemStats.activePolicies} />
            </div>
          </GlassCard>

          <GlassCard animate variant="raised" className="p-5 relative overflow-hidden group border-amber-500/10">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-25 transition-opacity">
              <CreditCard size={48} className="text-amber-400" />
            </div>
            <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2">Flagged / Rejected</p>
            <div className="font-mono text-2xl font-bold text-[var(--text-primary)]">
              <AnimatedNumber value={systemStats.flaggedItems} />
            </div>
          </GlassCard>
        </div>

        {/* ── Quick Actions ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <QuickAction
            href="/team"
            icon={Users}
            label="Manage Roles"
            description="Invite, freeze, or deactivate users"
            accentColor="bg-indigo-600"
          />
          <QuickAction
            href="/ledger"
            icon={ScrollText}
            label="View Audit Log"
            description="Immutable ledger & audit trail"
            accentColor="bg-emerald-600"
          />
          <QuickAction
            href="/settings"
            icon={Settings}
            label="System Settings"
            description="SLA, policies, session timeout"
            accentColor="bg-amber-600"
          />
        </div>
      </m.div>

      {/* ── Full Admin Dashboard Below ── */}
      <AdminDashboard data={data} />
    </div>
  );
}
