"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, API_BASE } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Diamond, Shield, FileCheck, User } from 'lucide-react';

type View = 'login' | 'register' | 'forgot';

// ─── MFA STEP ─────────────────────────────────────────────────────────────────

const mfaSchema = z.object({
  otpCode: z.string().min(6).max(8),
});
type MfaData = z.infer<typeof mfaSchema>;

function MfaForm({ mfaToken, onSuccess }: { mfaToken: string; onSuccess: (data: { user: { id: string; fullName: string; role: string; email: string }; companyId: string }) => void }) {
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<MfaData>({
    resolver: zodResolver(mfaSchema),
  });

  const onSubmit = async (data: MfaData) => {
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/mfa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mfaToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({ token: data.otpCode }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || 'Invalid code');
      }
      const result = await res.json();
      onSuccess({ user: result.user, companyId: result.companyId });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white">Two-factor authentication</h2>
        <p className="text-slate-400 text-sm mt-1">Enter the 6-digit code from your authenticator app, or an 8-character recovery code.</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 flex items-center gap-2" aria-live="polite">
          <span aria-hidden="true">⚠</span> {error}
        </div>
      )}

      <Input
        label="Authentication Code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        error={errors.otpCode?.message}
        {...register("otpCode")}
      />

      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Verify &rarr;
      </Button>
    </form>
  );
}

// ─── SCHEMAS ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});
type LoginData = z.infer<typeof loginSchema>;

const registerSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  emailDomain: z.string().min(3, "Domain is required"),
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string()
    .min(10, "Password must be at least 10 characters")
    .regex(/\d/, "Password must contain at least one number"),
  confirmPassword: z.string(),
  gstin: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
type RegisterData = z.infer<typeof registerSchema>;

const forgotSchema = z.object({
  email: z.string().email("Invalid email address"),
});
type ForgotData = z.infer<typeof forgotSchema>;

// ─── LOGIN ────────────────────────────────────────────────────────────────────

function LoginForm({ onSwitch }: { onSwitch: (v: View) => void }) {
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginData) => {
    setError('');
    try {
      // Fetch the raw response so we can detect mfaRequired before useAuth
      // processes it (useAuth.login() would crash reading data.user when mfaRequired).
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || 'Login failed');
      }
      const result = await res.json();
      if (result.mfaRequired === true) {
        setMfaToken(result.mfaToken as string);
        return;
      }
      // Normal login: delegate to the auth context so it sets user state.
      await login(data.email, data.password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  // MFA step: show inline when mfaToken is set.
  if (mfaToken) {
    return (
      <MfaForm
        mfaToken={mfaToken}
        onSuccess={({ user, companyId }) => {
          // Hydrate auth context by completing a normal login re-fetch via /auth/me.
          // The MFA verify endpoint already set the HttpOnly cookies, so we just
          // call login again — but the cleanest path is to trigger a page reload
          // which causes useAuth's checkAuth to pick up the new cookies.
          window.location.href = '/';
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white">Welcome back</h2>
        <p className="text-slate-400 text-sm mt-1">Sign in to your SpendOS account</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 flex items-center gap-2" aria-live="polite">
          <span aria-hidden="true">⚠</span> {error}
        </div>
      )}

      <Input
        label="Work Email"
        type="email"
        placeholder="you@company.com"
        error={errors.email?.message}
        {...register("email")}
      />

      <Input
        label="Password"
        type="password"
        placeholder="••••••••••"
        error={errors.password?.message}
        {...register("password")}
      />

      <div className="flex justify-end">
        <button type="button" onClick={() => onSwitch('forgot')} className="text-xs text-slate-500 hover:text-emerald-400 transition-colors">
          Forgot password?
        </button>
      </div>

      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Sign In &rarr;
      </Button>

      <p className="text-center text-sm text-slate-500">
        No account?{' '}
        <button type="button" onClick={() => onSwitch('register')} className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
          Register your company
        </button>
      </p>
    </form>
  );
}

// ─── REGISTER ─────────────────────────────────────────────────────────────────

function RegisterForm({ onSwitch }: { onSwitch: (v: View) => void }) {
  const { login } = useAuth();
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterData) => {
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          companyName: data.companyName, 
          emailDomain: data.emailDomain, 
          fullName: data.fullName, 
          email: data.email, 
          password: data.password, 
          gstin: data.gstin || undefined 
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Registration failed');
      }
      await login(data.email, data.password);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-white">Register your company</h2>
        <p className="text-slate-400 text-sm mt-1">You'll be assigned the <span className="text-amber-400 font-medium">◆ Black Card</span> role — full authority.</p>
      </div>
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 flex items-center gap-2" aria-live="polite">
          <span aria-hidden="true">⚠</span> {error}
        </div>
      )}
      
      <Input label="Company Legal Name" placeholder="Acme Technologies Pvt Ltd" error={errors.companyName?.message} {...register("companyName")} />
      <Input label="Company Email Domain" placeholder="acme.com" hint="This becomes your company identity anchor — e.g. acme.com" error={errors.emailDomain?.message} {...register("emailDomain")} />
      
      <div className="grid grid-cols-2 gap-4">
        <Input label="Your Full Name" placeholder="Jane Doe" error={errors.fullName?.message} {...register("fullName")} />
        <Input label="Work Email" type="email" placeholder="jane@acme.com" error={errors.email?.message} {...register("email")} />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <Input label="Password" type="password" placeholder="Min 10 chars + 1 number" error={errors.password?.message} {...register("password")} />
        <Input label="Confirm Password" type="password" placeholder="••••••••••" error={errors.confirmPassword?.message} {...register("confirmPassword")} />
      </div>
      
      <Input label="GSTIN (optional)" placeholder="22AAAAA0000A1Z5" hint="You can add this later in Settings" error={errors.gstin?.message} {...register("gstin")} />
      
      <Button type="submit" isLoading={isSubmitting} className="w-full mt-2">
        Create Company &rarr;
      </Button>
      
      <p className="text-center text-sm text-slate-500">
        Already have an account?{' '}
        <button type="button" onClick={() => onSwitch('login')} className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
          Sign in
        </button>
      </p>
    </form>
  );
}

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────

function ForgotForm({ onSwitch }: { onSwitch: (v: View) => void }) {
  const [sent, setSent] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ForgotData>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotData) => {
    await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email }),
    });
    setSent(true);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white">Reset password</h2>
        <p className="text-slate-400 text-sm mt-1">We'll send a reset link to your email.</p>
      </div>
      
      {sent ? (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl px-4 py-4" aria-live="polite">
          ✅ If that email exists, a reset link has been sent. Check your inbox.
        </div>
      ) : (
        <>
          <Input label="Work Email" type="email" placeholder="you@company.com" error={errors.email?.message} {...register("email")} />
          <Button type="submit" isLoading={isSubmitting} className="w-full">
            Send Reset Link
          </Button>
        </>
      )}
      
      <p className="text-center text-sm text-slate-500">
        <button type="button" onClick={() => onSwitch('login')} className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
          &larr; Back to sign in
        </button>
      </p>
    </form>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [view, setView] = useState<View>('login');
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // Once authenticated (fresh login sets user in the auth context, or an already
  // signed-in user lands here), leave the login screen for the dashboard.
  // Without this the user stays stranded on the login form after a successful
  // sign-in even though the session cookie and auth state are already set.
  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen flex bg-slate-950">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 bg-gradient-to-b from-slate-900 to-slate-950 border-r border-slate-800/60 px-10 py-12">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-base font-black text-slate-900">S</div>
            <span className="text-2xl font-bold text-white tracking-tight">Spend<span className="text-emerald-400">OS</span></span>
          </div>
          <h2 className="text-3xl font-bold text-white leading-snug">The expense platform built for serious teams.</h2>
          <p className="text-slate-400 mt-4 leading-relaxed">Submit, approve, and reimburse — with a full audit trail and role-based access baked in from day one.</p>
        </div>
        <div className="space-y-4">
          {[
            { icon: <Diamond size={18} />, label: 'Black Card', desc: 'Full company authority' },
            { icon: <Shield size={18} />, label: 'Admin', desc: 'Day-to-day operations' },
            { icon: <FileCheck size={18} />, label: 'Manager', desc: 'Approve and review' },
            { icon: <User size={18} />, label: 'User', desc: 'Submit and track' },
          ].map(r => (
            <div key={r.label} className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-emerald-400">{r.icon}</div>
              <div>
                <div className="text-white font-medium">{r.label}</div>
                <div className="text-slate-500">{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg bg-slate-900/60 backdrop-blur border border-slate-800/60 rounded-2xl p-8 shadow-2xl">
          {view === 'login' && <LoginForm onSwitch={setView} />}
          {view === 'register' && <RegisterForm onSwitch={setView} />}
          {view === 'forgot' && <ForgotForm onSwitch={setView} />}
        </div>
      </div>
    </div>
  );
}
