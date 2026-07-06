"use client";

import { AuthProvider } from '@/lib/auth';
import { AuthGate } from '@/components/layout/AuthGate';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGate>{children}</AuthGate>
    </AuthProvider>
  );
}
