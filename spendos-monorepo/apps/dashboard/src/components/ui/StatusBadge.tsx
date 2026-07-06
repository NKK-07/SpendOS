'use client';

type StatusKey =
  | 'submitted'
  | 'proof_requested'
  | 'proof_submitted'
  | 'approved'
  | 'paid'
  | 'rejected'
  | 'disputed';

interface StatusConfig {
  label: string;
  dot: string;
  text: string;
  bg: string;
  border: string;
  glow?: string;
}

const STATUS_MAP: Record<StatusKey, StatusConfig> = {
  submitted: {
    label:  'Submitted',
    dot:    'bg-white/30',
    text:   'text-[var(--text-muted)]',
    bg:     'bg-white/5',
    border: 'border-white/10',
  },
  proof_requested: {
    label:  'Proof Req.',
    dot:    'bg-amber-400',
    text:   'text-amber-400',
    bg:     'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  proof_submitted: {
    label:  'Under Review',
    dot:    'bg-[var(--indigo)]',
    text:   'text-[var(--indigo)]',
    bg:     'bg-[rgba(99,102,241,0.1)]',
    border: 'border-[rgba(99,102,241,0.2)]',
  },
  approved: {
    label:  'Approved',
    dot:    'bg-emerald-400',
    text:   'text-[--signal-bright,#34d399]',
    bg:     'bg-[rgba(16,185,129,0.1)]',
    border: 'border-[rgba(16,185,129,0.25)]',
  },
  paid: {
    label:  'Paid',
    dot:    'bg-emerald-300',
    text:   'text-emerald-300',
    bg:     'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    glow:   'shadow-[0_0_8px_rgba(16,185,129,0.25)]',
  },
  rejected: {
    label:  'Rejected',
    dot:    'bg-red-400',
    text:   'text-red-400',
    bg:     'bg-red-500/10',
    border: 'border-red-500/20',
  },
  disputed: {
    label:  'Disputed',
    dot:    'bg-orange-400',
    text:   'text-orange-400',
    bg:     'bg-orange-500/10',
    border: 'border-orange-500/20',
  },
};

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = STATUS_MAP[status as StatusKey];

  const sizeClasses =
    size === 'sm'
      ? 'text-[10px] px-2 py-0.5'
      : 'text-xs px-2.5 py-1';

  if (!config) {
    // Fallback for unknown statuses
    const fallbackLabel = status.replace(/_/g, ' ');
    return (
      <span
        className={[
          'inline-flex items-center gap-1.5 rounded-full border',
          'font-mono font-medium uppercase tracking-wide',
          'text-[var(--text-muted)] bg-white/5 border-white/10',
          sizeClasses,
        ].join(' ')}
      >
        <span className="h-[5px] w-[5px] rounded-full bg-white/30 shrink-0" />
        {fallbackLabel}
      </span>
    );
  }

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border',
        'font-mono font-medium uppercase tracking-wide',
        config.text,
        config.bg,
        config.border,
        config.glow ?? '',
        sizeClasses,
      ].join(' ')}
    >
      <span className={`h-[5px] w-[5px] rounded-full shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  );
}
