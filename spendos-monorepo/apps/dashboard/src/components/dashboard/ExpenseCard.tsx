import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Plane, Utensils, Paperclip, Laptop, Zap, Package } from 'lucide-react';

function formatRupees(paise: number | string) {
  const p = typeof paise === 'string' ? parseInt(paise, 10) : paise;
  if (isNaN(p)) return '₹0';
  return '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getCategoryIcon(category: string, className?: string) {
  const map: Record<string, any> = {
    travel: Plane, food: Utensils, office_supplies: Paperclip,
    software: Laptop, utilities: Zap, other: Package,
  };
  const Icon = map[category] || Package;
  return <Icon className={className} />;
}

const STATUS_STYLES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  submitted:       { label: 'Submitted',       variant: 'secondary' },
  proof_requested: { label: 'Proof Requested', variant: 'warning' },
  proof_submitted: { label: 'Under Review',    variant: 'info' },
  approved:        { label: 'Approved',         variant: 'success' },
  paid:            { label: 'Paid',             variant: 'default' },
  rejected:        { label: 'Rejected',         variant: 'destructive' },
  disputed:        { label: 'Disputed',         variant: 'warning' },
};

export function ExpenseCard({ expense, href }: { expense: any; href: string }) {
  const st = STATUS_STYLES[expense.status] || { label: expense.status, variant: 'secondary' };
  return (
    <Link
      href={href}
      className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group border-b border-slate-100 dark:border-slate-800 last:border-0"
    >
      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
        {getCategoryIcon(expense.category, "w-5 h-5")}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-emerald-600 transition-colors">
            {expense.submitter?.full_name || 'You'}
          </span>
          <Badge variant={st.variant} className="text-[10px] px-1.5 py-0 border-transparent shrink-0">
            {st.label}
          </Badge>
        </div>
        <div className="text-xs text-slate-400 mt-0.5 truncate">
          {expense.category.replace('_', ' ')} · {new Date(expense.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          {expense.description && ` · ${expense.description}`}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{formatRupees(expense.amount_paise)}</div>
        <div className="text-xs text-slate-400">{timeAgo(expense.created_at)}</div>
      </div>
    </Link>
  );
}
