import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';

export function StatCard({ label, value, sub, accentClass, href }: {
  label: string; value: string; sub?: string; accentClass?: string; href?: string;
}) {
  const router = useRouter();
  
  return (
    <Card 
      className={`transition-all duration-200 h-full ${href ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}`}
      onClick={() => href && router.push(href)}
    >
      <CardContent className="p-5">
        <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">{label}</div>
        <div className={`text-2xl font-bold mt-1 ${accentClass || 'text-slate-900 dark:text-slate-100'}`}>{value}</div>
        {sub && <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
