'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Unhandled route error:', error);
  }, [error]);

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="max-w-md w-full p-8 bg-white/[0.02] border border-white/[0.08] rounded-2xl text-center shadow-2xl">
        <div className="w-12 h-12 bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        </div>
        <h2 className="text-lg font-mono font-bold text-white mb-2 uppercase tracking-wide">Interface Error</h2>
        <p className="text-sm font-sans text-gray-400 mb-6">
          A rendering issue prevented this page from loading. 
        </p>
        <button
          onClick={() => reset()}
          className="w-full py-2.5 px-4 bg-white/10 hover:bg-white/20 text-white rounded-lg font-mono text-xs font-bold uppercase tracking-wider transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
