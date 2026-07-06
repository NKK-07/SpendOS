"use client";

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              // Do not retry on explicit client errors
              if (error instanceof Error) {
                if (error.message.includes('401') || error.message.includes('403') || error.message.includes('404')) return false;
              }
              return failureCount < 3;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
          },
          mutations: {
            retry: (failureCount, error) => {
              if (error instanceof Error && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
                return failureCount < 2;
              }
              return false; // Don't retry other mutations by default
            }
          }
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
