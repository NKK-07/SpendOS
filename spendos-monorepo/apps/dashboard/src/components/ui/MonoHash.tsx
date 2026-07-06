'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { truncateHash } from '@/lib/format';

interface MonoHashProps {
  hash: string;
  label?: string;
  truncate?: number; // chars to show, default 8
  copyable?: boolean;
  showFull?: boolean; // show full on hover
  size?: 'xs' | 'sm';
}

export function MonoHash({
  hash,
  label,
  truncate = 8,
  copyable = false,
  showFull = true,
  size = 'xs',
}: MonoHashProps) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);

  const displayHash =
    hovered && showFull ? hash : truncateHash(hash, truncate) + '...';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sizeClass = size === 'xs' ? 'text-[10px]' : 'text-xs';

  return (
    <div className="flex items-center gap-1.5">
      {label && (
        <span
          className={`${sizeClass} text-[var(--text-muted)] uppercase tracking-widest font-mono`}
        >
          {label}:
        </span>
      )}
      <span
        className={`${sizeClass} font-mono text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-default select-all`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={hash}
      >
        {displayHash}
      </span>
      {copyable && (
        <button
          onClick={handleCopy}
          className="text-[var(--text-muted)] hover:text-[var(--indigo)] transition-colors"
          title="Copy hash"
        >
          {copied ? (
            <Check size={10} className="text-[var(--signal)]" />
          ) : (
            <Copy size={10} />
          )}
        </button>
      )}
    </div>
  );
}
