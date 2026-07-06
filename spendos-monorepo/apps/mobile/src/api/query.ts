import { QueryClient } from '@tanstack/react-query';

// Configure the QueryClient with default options tailored for mobile (offline persistence will be configured in App.tsx)
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours (for offline capability)
      retry: 2,
    },
  },
});
