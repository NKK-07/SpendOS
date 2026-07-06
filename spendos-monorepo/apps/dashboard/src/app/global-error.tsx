'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global unhandled error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="h-full bg-[#050505] text-white antialiased flex items-center justify-center">
        <div className="max-w-md w-full p-6 bg-white/[0.05] border border-white/[0.1] rounded-2xl text-center space-y-6">
          <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
          </div>
          <h2 className="text-xl font-mono font-bold">CRITICAL SYSTEM FAILURE</h2>
          <p className="text-sm font-sans text-gray-400">
            A fatal error occurred at the application root. Our engineers have been notified.
          </p>
          <button
            onClick={() => reset()}
            className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 text-white rounded-lg font-mono font-bold uppercase tracking-wider transition-colors"
          >
            Attempt Recovery
          </button>
        </div>
      </body>
    </html>
  );
}
