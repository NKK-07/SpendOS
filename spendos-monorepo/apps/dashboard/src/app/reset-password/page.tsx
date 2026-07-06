"use client";

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { API_BASE } from '@/lib/auth';

const resetSchema = z.object({
  password: z.string()
    .min(10, "Password must be at least 10 characters")
    .regex(/\d/, "Password must contain at least one number"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ResetData = z.infer<typeof resetSchema>;

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const router = useRouter();
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetData>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetData) => {
    if (!token) {
      setError("Missing reset token. Please check your email link.");
      return;
    }
    
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: data.password }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Password reset failed');
      }
      
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!token) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Invalid Link</h2>
        <p className="text-slate-400 text-sm">The password reset link is invalid or missing the token.</p>
        <Button onClick={() => router.push('/login')} className="mt-6 w-full">Back to Login</Button>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold text-emerald-400 mb-2">Password Reset!</h2>
        <p className="text-slate-400 text-sm">Your password has been successfully changed. Redirecting to login...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white">Create new password</h2>
        <p className="text-slate-400 text-sm mt-1">Please enter your new password below.</p>
      </div>
      
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3 flex items-center gap-2" aria-live="polite">
          <span aria-hidden="true">⚠</span> {error}
        </div>
      )}
      
      <Input
        label="New Password"
        type="password"
        placeholder="Min 10 chars + 1 number"
        error={errors.password?.message}
        {...register("password")}
      />
      
      <Input
        label="Confirm Password"
        type="password"
        placeholder="••••••••••"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />
      
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Reset Password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex bg-slate-950 items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur border border-slate-800/60 rounded-2xl p-8 shadow-2xl">
        <Suspense fallback={<div className="text-white text-center">Loading...</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
