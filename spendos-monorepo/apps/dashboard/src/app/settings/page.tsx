"use client";

import { useEffect, useState } from 'react';
import { useAuth, useApi, isAdminUp, ROLE_LABELS, UserRole } from '@/lib/auth';
import { Shield, Building2, Clock, Wallet, CreditCard, User, Lock, ChevronRight } from 'lucide-react';

function Section({ title, icon: Icon, children, badge }: { title: string; icon?: any; children: React.ReactNode; badge?: string }) {
  return (
    <div className="bg-[#111113] rounded-xl border border-[#27272a] overflow-hidden animate-fade-in">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#27272a]">
        {Icon && <Icon size={18} className="text-emerald-400" />}
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide">{title}</h2>
        {badge && <span className="ml-auto text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full">{badge}</span>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-3 border-b border-[#1e1e22] last:border-0">
      <div>
        <div className="text-sm font-medium text-zinc-300">{label}</div>
        {value && <div className="text-sm text-zinc-500 mt-0.5">{value}</div>}
      </div>
      {children && <div className="ml-4">{children}</div>}
    </div>
  );
}

function InputField({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1.5">{label}</label>
      <input
        {...props}
        className="w-full bg-[#0a0a0c] text-zinc-100 border border-[#27272a] rounded-lg px-4 py-2.5 text-sm placeholder-zinc-600 focus:border-emerald-500/50 transition-colors"
      />
      {hint && <p className="text-xs text-zinc-600 mt-1.5">{hint}</p>}
    </div>
  );
}

function PrimaryButton({ children, loading, ...props }: { children: React.ReactNode; loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-all duration-200 flex items-center gap-2"
    >
      {loading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
      {children}
    </button>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const api = useApi();
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [slaValue, setSlaValue] = useState(14);
  const [timeoutValue, setTimeoutValue] = useState(30);

  const [policy, setPolicy] = useState<any>(null);
  const [autoApproveValue, setAutoApproveValue] = useState('');
  const [receiptRequiredValue, setReceiptRequiredValue] = useState('');
  const [savingPolicy, setSavingPolicy] = useState(false);

  const actorRole = user?.role as UserRole;
  const isAdmin = isAdminUp(actorRole);
  const isBlackCard = actorRole === 'PRINCIPAL';

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const cRes = await api('/company');
        const cData = await cRes.json();
        setCompany(cData);
        setSlaValue(cData?.sla_days ?? 14);
        setTimeoutValue(cData?.session_timeout_minutes ?? 30);
        
        if (isAdmin) {
          const pRes = await api('/policies');
          const pData = await pRes.json();
          setPolicy(pData);
          setAutoApproveValue(pData?.auto_approve_threshold ? (Number(pData.auto_approve_threshold) / 100).toString() : '0');
          setReceiptRequiredValue(pData?.receipt_required_above ? (Number(pData.receipt_required_above) / 100).toString() : '0');
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [isAdmin, api]);

  const saveCompany = async (data: object) => {
    setSaving('company');
    try {
      const res = await api('/company', { method: 'PATCH', body: JSON.stringify(data) });
      if (res.ok) { const d = await res.json(); setCompany(d); }
    } finally { setSaving(''); }
  };

  // Own profile
  const [newName, setNewName] = useState(user?.fullName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setSaving('profile');
    try {
      if (newName && newName !== user?.fullName) {
        await api(`/users/${user?.userId}`, { method: 'PATCH', body: JSON.stringify({ fullName: newName }) });
      }
      if (newPassword) {
        if (!currentPassword) { setProfileMsg('Current password is required'); return; }
        if (newPassword !== confirmPassword) { setProfileMsg('Passwords do not match'); return; }
        if (newPassword.length < 10 || !/\d/.test(newPassword)) {
          setProfileMsg('Password must be at least 10 chars and contain a number');
          return;
        }
        const res = await api('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword, ...(mfaCode ? { mfaCode } : {}) }),
        });
        if (!res.ok) {
          const d = await res.json();
          // Step-up required: reveal the authenticator field and let the user retry.
          if (d.mfaRequired) {
            setNeedsMfa(true);
            setProfileMsg('Enter your authenticator code to confirm this password change.');
            return;
          }
          setProfileMsg(d.error || 'Failed');
          return;
        }
      }
      setProfileMsg('Saved ✓');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setMfaCode(''); setNeedsMfa(false);
    } finally { setSaving(''); }
  };

  const savePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPolicy(true);
    try {
      const payload = {
        autoApproveThreshold: Math.round(Number(autoApproveValue) * 100).toString(),
        receiptRequiredAbove: Math.round(Number(receiptRequiredValue) * 100).toString()
      };
      const res = await api('/policies', { method: 'PUT', body: JSON.stringify(payload) });
      if (res.ok) {
        const d = await res.json();
        setPolicy(d);
        setProfileMsg('Policies updated ✓');
      }
    } finally {
      setSavingPolicy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 animate-spin" />
          <span className="text-zinc-500 text-sm">Loading settings…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">Manage your account and company preferences</p>
      </div>

      {/* Profile */}
      <Section title="My Profile" icon={User}>
        <form onSubmit={saveProfile} className="space-y-4">
          {profileMsg && (
            <div className={`text-sm rounded-lg px-4 py-3 border ${profileMsg.includes('✓') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              {profileMsg}
            </div>
          )}
          <InputField label="Display Name" value={newName} onChange={e => setNewName(e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email</label>
            <input value={user?.email} disabled className="w-full border border-[#27272a] bg-[#0a0a0c] text-zinc-600 rounded-lg px-4 py-2.5 text-sm cursor-not-allowed" />
          </div>
          <InputField
            label="Current Password"
            hint="Required to change your password"
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            placeholder="Your current password"
          />
          <InputField
            label="New Password"
            hint="Leave blank to keep current"
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Min 10 chars + 1 number"
          />
          {newPassword && (
            <InputField label="Confirm Password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          )}
          {needsMfa && (
            <InputField
              label="Authenticator Code"
              hint="Your account has MFA enabled — enter the current 6-digit code to confirm this change."
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={e => setMfaCode(e.target.value)}
              placeholder="000000"
            />
          )}
          <PrimaryButton type="submit" disabled={saving === 'profile'} loading={saving === 'profile'}>
            Save Changes
          </PrimaryButton>
        </form>
      </Section>

      {/* Company Settings */}
      {isAdmin && company && (
        <Section title="Company Profile" icon={Building2} badge={company.email_domain}>
          <Field label="Company Name" value={company.name} />
          <Field label="Email Domain" value={company.email_domain} />
          <Field label="GSTIN" value={company.gstin || 'Not configured'} />
        </Section>
      )}

      {/* SLA */}
      {isAdmin && (
        <Section title="Reimbursement SLA" icon={Clock}>
          <p className="text-sm text-zinc-500 mb-5">
            Employees can raise a ticket if their approved expense isn't paid within this period.
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">SLA Period</span>
              <span className="text-sm font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">{slaValue} days</span>
            </div>
            <input
              type="range" min={7} max={60} value={slaValue}
              onChange={e => setSlaValue(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-zinc-600">
              <span>7 days</span><span>60 days</span>
            </div>
            <PrimaryButton
              onClick={() => saveCompany({ sla_days: slaValue })}
              disabled={saving === 'company' || slaValue === company?.sla_days}
              loading={saving === 'company'}
            >
              Save SLA
            </PrimaryButton>
          </div>
        </Section>
      )}

      {/* Spend Policies */}
      {isAdmin && policy && (
        <Section title="Spend Policies" icon={Shield}>
          <p className="text-sm text-zinc-500 mb-5">
            Configure rules to automatically approve low-risk expenses and enforce receipt uploads.
          </p>
          <form onSubmit={savePolicy} className="space-y-4">
            <InputField 
              label="Auto-Approve Threshold (₹)" 
              hint="Expenses below this amount are instantly approved. Set to 0 to disable."
              type="number" min={0} step={0.01} 
              value={autoApproveValue} 
              onChange={e => setAutoApproveValue(e.target.value)} 
            />
            <InputField 
              label="Receipt Required Above (₹)" 
              hint="Require a document upload if expense exceeds this amount."
              type="number" min={0} step={0.01} 
              value={receiptRequiredValue} 
              onChange={e => setReceiptRequiredValue(e.target.value)} 
            />
            <PrimaryButton type="submit" disabled={savingPolicy} loading={savingPolicy}>
              Save Policies
            </PrimaryButton>
          </form>
        </Section>
      )}

      {/* Session Timeout */}
      {isAdmin && (
        <Section title="Session Timeout" icon={Lock}>
          <p className="text-sm text-zinc-500 mb-5">How long before inactive sessions are automatically signed out.</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">Timeout</span>
              <span className="text-sm font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">{timeoutValue} min</span>
            </div>
            <input
              type="range" min={10} max={120} value={timeoutValue}
              onChange={e => setTimeoutValue(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-zinc-600">
              <span>10 min</span><span>120 min</span>
            </div>
            <PrimaryButton
              onClick={() => saveCompany({ session_timeout_minutes: timeoutValue })}
              disabled={saving === 'company' || timeoutValue === company?.session_timeout_minutes}
              loading={saving === 'company'}
            >
              Save Timeout
            </PrimaryButton>
          </div>
        </Section>
      )}

      {/* Billing */}
      {isBlackCard && (
        <Section title="Billing & Subscription" icon={CreditCard}>
          <div className="bg-[#0a0a0c] rounded-xl p-6 text-center border border-[#27272a]">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400/20 to-amber-600/20 flex items-center justify-center mx-auto mb-3">
              <Wallet size={20} className="text-amber-400" />
            </div>
            <p className="text-zinc-200 font-medium text-sm">Beta Plan — Free</p>
            <p className="text-zinc-600 text-xs mt-1">Billing management coming in the next release.</p>
          </div>
        </Section>
      )}
    </div>
  );
}
