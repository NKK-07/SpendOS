import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';

export function OnboardingOverlay({ hasExpenses, hasTeam, onDismiss }: {
  hasExpenses: boolean; hasTeam: boolean; onDismiss: () => void;
}) {
  const allDone = hasExpenses && hasTeam;
  if (allDone) { onDismiss(); return null; }

  return (
    <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-6 mb-6 border border-slate-700/50">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-white font-semibold text-lg">Get started</h3>
          <p className="text-slate-400 text-sm">Complete these steps to unlock the full platform.</p>
        </div>
        <button onClick={onDismiss} className="text-slate-600 hover:text-slate-400 text-xl leading-none mt-1" aria-label="Dismiss">&times;</button>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <span className="text-emerald-400 font-medium">Company registered</span>
        </div>
        
        <Link href="/team" className={`flex items-center gap-3 text-sm p-3 rounded-xl transition-colors ${hasTeam ? 'opacity-50' : 'hover:bg-white/5 cursor-pointer'}`}>
          {hasTeam ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <Circle className="w-5 h-5 text-slate-600 shrink-0" />}
          <span className={hasTeam ? 'text-emerald-400 font-medium' : 'text-slate-300'}>
            {hasTeam ? 'Team member invited' : 'Add your first Admin or team member →'}
          </span>
        </Link>
        
        <div className={`flex items-center gap-3 text-sm p-3 rounded-xl ${hasExpenses ? 'opacity-50' : ''}`}>
          {hasExpenses ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <Circle className="w-5 h-5 text-slate-600 shrink-0" />}
          <span className={hasExpenses ? 'text-emerald-400 font-medium' : 'text-slate-400'}>
            First expense submission will appear here
          </span>
        </div>
      </div>
    </div>
  );
}
