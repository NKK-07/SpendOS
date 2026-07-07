'use client';

import { useEffect, useState, useCallback } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Download,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
} from 'lucide-react';
import { useApi } from '@/lib/auth';
import {
  formatINR,
  formatINRPrecise,
  formatDate,
  formatDateTime,
  truncateHash,
} from '@/lib/format';
import { pageVariants, springTitan, rowVariants } from '@/lib/motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { MonoHash } from '@/components/ui/MonoHash';

/* ─── Types ─── */

type EntryType = 'DEBIT' | 'CREDIT';
type FilterStatus = 'all' | 'DEBIT' | 'CREDIT';

interface LedgerEntry {
  id: string;
  journal_group_id: string | null;
  entry_type: EntryType;
  amount_paise: number;
  running_balance: number;
  created_at: string;
  account?: { id: string; name: string };
  journal_group?: {
    id: string;
    transaction_type: string;
    created_at: string;
  };
}

interface GroupedEntry {
  key: string;
  entries: LedgerEntry[];
  transactionType: string;
  totalAmount: number;
  createdAt: string;
}

/* ─── CSV Export ─── */

const exportToCsv = (entries: LedgerEntry[]) => {
  if (!entries.length) return;
  const headers = ['Date', 'TXN_ID', 'Account', 'Type', 'Amount (Paise)', 'Running Balance'];
  const rows = entries.map((e) => [
    new Date(e.created_at).toISOString(),
    e.journal_group_id || '',
    e.account?.name || '',
    e.entry_type,
    e.amount_paise,
    e.running_balance,
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${c}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spendos_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

/* ─── Skeleton Rows ─── */

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i}>
          <td colSpan={7} className="px-5 py-1">
            <div className="skeleton h-12 rounded-none" />
          </td>
        </tr>
      ))}
    </>
  );
}

/* ─── Empty State ─── */

function EmptyState() {
  return (
    <tr>
      <td colSpan={7}>
        <div className="flex flex-col items-center justify-center py-24 px-8">
          <BookOpen size={32} className="text-[var(--text-muted)]" />
          <p className="font-mono text-sm text-[var(--text-muted)] uppercase tracking-wider mt-4">
            LEDGER IS EMPTY
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-2 text-center max-w-xs">
            Double-entry postings will appear here once expenses are processed.
          </p>
        </div>
      </td>
    </tr>
  );
}

/* ─── Group Header Row ─── */

interface GroupHeaderRowProps {
  group: GroupedEntry;
  isExpanded: boolean;
  onToggle: () => void;
}

function GroupHeaderRow({ group, isExpanded, onToggle }: GroupHeaderRowProps) {
  return (
    <tr
      className="border-b border-white/[0.04] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] cursor-pointer transition-colors"
      onClick={onToggle}
    >
      {/* Expand/Collapse */}
      <td className="px-5 py-3 w-10">
        <span
          className="inline-flex text-[var(--text-muted)] transition-transform duration-200"
          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <ChevronRight size={14} />
        </span>
      </td>

      {/* Date */}
      <td className="px-5 py-3">
        <span className="font-mono text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
          {formatDateTime(group.createdAt)}
        </span>
      </td>

      {/* TXN ID */}
      <td className="px-5 py-3">
        <MonoHash hash={group.key} truncate={8} showFull copyable={false} />
      </td>

      {/* Description */}
      <td className="px-5 py-3">
        <span className="font-mono text-[10px] uppercase text-[var(--text-muted)] px-1.5 py-0.5 bg-white/5 rounded">
          {group.transactionType || 'JOURNAL'}
        </span>
      </td>

      {/* Account */}
      <td className="px-5 py-3">
        <span className="font-mono text-[10px] text-[var(--text-muted)]">—</span>
      </td>

      {/* Type */}
      <td className="px-5 py-3">
        <span className="font-mono text-[10px] text-[var(--text-muted)]">—</span>
      </td>

      {/* Total Amount */}
      <td className="px-5 py-3 text-right">
        <span className="font-mono text-sm text-[var(--text-primary)]">
          {formatINRPrecise(group.totalAmount)}
        </span>
      </td>
    </tr>
  );
}

/* ─── Child Entry Row ─── */

interface EntryRowProps {
  entry: LedgerEntry;
  index: number;
}

function EntryRow({ entry, index }: EntryRowProps) {
  const isDebit = entry.entry_type === 'DEBIT';

  return (
    <m.tr
      key={entry.id}
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="border-b border-white/[0.02] bg-[rgba(99,102,241,0.03)] transition-colors hover:bg-[rgba(99,102,241,0.05)]"
    >
      {/* Indent spacer */}
      <td className="w-10" />

      {/* Date */}
      <td className="px-5 py-2.5">
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          {formatDate(entry.created_at)}
        </span>
      </td>

      {/* Entry ID */}
      <td className="px-5 py-2.5 pl-10">
        <MonoHash hash={entry.id} truncate={8} showFull copyable={false} />
      </td>

      {/* Description (account name) */}
      <td className="px-5 py-2.5">
        <span className="text-sm text-[var(--text-secondary)] font-sans">
          {entry.account?.name || <span className="text-[var(--text-muted)]">—</span>}
        </span>
      </td>

      {/* Account */}
      <td className="px-5 py-2.5">
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          {entry.account?.name || '—'}
        </span>
      </td>

      {/* Type badge */}
      <td className="px-5 py-2.5">
        {isDebit ? (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
            <ArrowUpRight size={9} />
            DEBIT
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-[var(--indigo)] bg-[rgba(99,102,241,0.1)] px-1.5 py-0.5 rounded">
            <ArrowDownLeft size={9} />
            CREDIT
          </span>
        )}
      </td>

      {/* Amount + Balance */}
      <td className="px-5 py-2.5 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span
            className={`font-mono text-sm ${
              isDebit ? 'text-amber-300' : 'text-[var(--indigo)]'
            }`}
          >
            {formatINRPrecise(entry.amount_paise)}
          </span>
          <span className="font-mono text-[10px] text-[var(--signal)]">
            {formatINRPrecise(entry.running_balance)}
          </span>
        </div>
      </td>
    </m.tr>
  );
}

/* ─── Main Page ─── */

export default function LedgerPage() {
  const api = useApi();

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  /* ─── Load entries ─── */

  const loadEntries = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      try {
        const url = cursor ? `/ledger?cursor=${cursor}` : '/ledger';
        const res = await api(url);
        // api() returns a Response — must parse the JSON body (this was the bug:
        // treating the Response as the payload left the ledger permanently empty).
        const data: any = await res.json();
        const newEntries: LedgerEntry[] = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.entries) ? data.entries : (Array.isArray(data) ? data : []));
        setEntries((prev) => (cursor ? [...(Array.isArray(prev) ? prev : []), ...newEntries] : newEntries));
        setNextCursor(data?.meta?.nextCursor ?? null);
        setHasMore(!!data?.meta?.hasMore);
      } catch {
        // Silent — empty state renders
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  /* ─── Filtering ─── */

  const safeEntries = Array.isArray(entries) ? entries : [];
  const filteredEntries = safeEntries.filter((entry) => {
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = entry.account?.name?.toLowerCase().includes(q);
      const matchType = entry.journal_group?.transaction_type?.toLowerCase().includes(q);
      const matchId = entry.id?.toLowerCase().includes(q);
      if (!matchName && !matchType && !matchId) return false;
    }
    // Type filter
    if (filterStatus !== 'all' && entry.entry_type !== filterStatus) return false;
    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (new Date(entry.created_at) < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(entry.created_at) > to) return false;
    }
    return true;
  });

  /* ─── Client-side grouping ─── */

  const grouped = filteredEntries.reduce(
    (acc, entry) => {
      const key = entry.journal_group_id || entry.id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(entry);
      return acc;
    },
    {} as Record<string, LedgerEntry[]>
  );

  const groupList: GroupedEntry[] = Object.entries(grouped).map(([key, grpEntries]) => ({
    key,
    entries: grpEntries,
    transactionType:
      grpEntries[0]?.journal_group?.transaction_type ||
      grpEntries[0]?.entry_type ||
      'JOURNAL',
    totalAmount: grpEntries.reduce((sum, e) => sum + (e.amount_paise ?? 0), 0),
    createdAt: grpEntries[0]?.journal_group?.created_at || grpEntries[0]?.created_at,
  }));

  /* ─── Group toggle ─── */

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  /* ─── Active filter count ─── */

  const activeFilterCount = [
    searchQuery !== '',
    filterStatus !== 'all',
    dateFrom !== '',
    dateTo !== '',
  ].filter(Boolean).length;

  /* ─── Render ─── */

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="min-h-screen bg-[#050505] px-6 py-8 max-w-[1440px] mx-auto"
      >
        {/* ── Header ── */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <BookOpen size={22} className="text-[var(--indigo)]" />
            <h1 className="font-mono text-2xl font-bold text-[var(--text-primary)] tracking-tight">
              GLOBAL LEDGER
            </h1>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] font-mono mt-1 ml-[34px]">
            Double-entry general ledger — all debits and credits across every account.
          </p>

          {/* ── Filters Row ── */}
          <div className="flex flex-wrap items-center gap-3 mt-5">
            {/* Search */}
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                type="text"
                placeholder="Search account, type, ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-3 py-2 text-sm font-mono text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] focus:border-[var(--indigo)] focus:bg-white/[0.06] focus:outline-none transition-all"
              />
            </div>

            {/* Type filter */}
            <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-full p-1">
              {(['all', 'DEBIT', 'CREDIT'] as FilterStatus[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterStatus(f)}
                  className={`px-3 py-1 text-[10px] font-mono uppercase tracking-wide rounded-full transition-all ${
                    filterStatus === f
                      ? 'bg-[var(--indigo)] text-white'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {f === 'all' ? 'ALL' : f}
                </button>
              ))}
            </div>

            {/* Date From */}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-secondary)] focus:border-[var(--indigo)] focus:bg-white/[0.06] focus:outline-none transition-all [color-scheme:dark]"
            />
            <span className="font-mono text-[10px] text-[var(--text-muted)]">→</span>
            {/* Date To */}
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-secondary)] focus:border-[var(--indigo)] focus:bg-white/[0.06] focus:outline-none transition-all [color-scheme:dark]"
            />

            {/* Active filter badge */}
            {activeFilterCount > 0 && (
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--indigo)] bg-[rgba(99,102,241,0.1)] border border-[rgba(99,102,241,0.2)] px-2 py-1 rounded-full">
                <Filter size={9} />
                {activeFilterCount} active
              </span>
            )}

            <div className="ml-auto flex items-center gap-2">
              {/* Refresh */}
              <button
                onClick={() => loadEntries()}
                disabled={loading}
                className="flex items-center gap-2 border border-white/[0.1] text-[var(--text-muted)] hover:border-white/[0.2] hover:text-[var(--text-secondary)] px-3 py-2 rounded-lg text-xs font-mono uppercase transition-all disabled:opacity-40"
                title="Refresh"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>

              {/* Export CSV */}
              <button
                onClick={() => exportToCsv(filteredEntries)}
                disabled={!filteredEntries.length}
                className="flex items-center gap-2 border border-white/[0.1] text-[var(--text-secondary)] hover:border-[var(--signal)] hover:text-[var(--signal)] px-4 py-2 rounded-lg text-xs font-mono uppercase transition-all disabled:opacity-40"
              >
                <Download size={12} />
                Export CSV
              </button>
            </div>
          </div>
        </header>

        {/* ── Table ── */}
        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              {/* Sticky Header */}
              <thead>
                <tr className="sticky top-0 bg-[rgba(5,5,5,0.9)] backdrop-blur-xl z-10 border-b border-white/[0.06]">
                  {/* Expand col */}
                  <th className="w-10" />
                  <th className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] px-5 py-4 text-left whitespace-nowrap">
                    DATE
                  </th>
                  <th className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] px-5 py-4 text-left whitespace-nowrap">
                    TXN_ID
                  </th>
                  <th className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] px-5 py-4 text-left whitespace-nowrap">
                    DESCRIPTION
                  </th>
                  <th className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] px-5 py-4 text-left whitespace-nowrap">
                    ACCOUNT
                  </th>
                  <th className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] px-5 py-4 text-left whitespace-nowrap">
                    TYPE
                  </th>
                  <th className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-muted)] px-5 py-4 text-right whitespace-nowrap">
                    AMOUNT / BALANCE
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <SkeletonRows />
                ) : groupList.length === 0 ? (
                  <EmptyState />
                ) : (
                  groupList.map((group) => (
                    <>
                      {/* Group header */}
                      <GroupHeaderRow
                        key={`gh-${group.key}`}
                        group={group}
                        isExpanded={expandedGroups.has(group.key)}
                        onToggle={() => toggleGroup(group.key)}
                      />

                      {/* Child entries */}
                      <AnimatePresence>
                        {expandedGroups.has(group.key) &&
                          group.entries.map((entry, i) => (
                            <EntryRow key={entry.id} entry={entry} index={i} />
                          ))}
                      </AnimatePresence>
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>

        {/* ── Load More ── */}
        {hasMore && !loading && (
          <div className="flex justify-center mt-6">
            <button
              onClick={() => loadEntries(nextCursor ?? undefined)}
              className="border border-[var(--indigo)]/30 text-[var(--indigo)] hover:bg-[var(--indigo)] hover:text-white font-mono text-xs uppercase px-6 py-2 transition-all rounded-lg"
            >
              Load More
            </button>
          </div>
        )}

        {/* ── Summary strip ── */}
        {!loading && filteredEntries.length > 0 && (
          <div className="flex items-center justify-between mt-4 px-1">
            <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-widest">
              {groupList.length} journal group{groupList.length !== 1 ? 's' : ''} ·{' '}
              {filteredEntries.length} entr{filteredEntries.length !== 1 ? 'ies' : 'y'}
            </span>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              Net:{' '}
              <span className="text-[var(--signal)]">
                {formatINRPrecise(
                  filteredEntries.reduce((s, e) => {
                    return e.entry_type === 'CREDIT'
                      ? s + e.amount_paise
                      : s - e.amount_paise;
                  }, 0)
                )}
              </span>
            </span>
          </div>
        )}
      </m.div>
    </LazyMotion>
  );
}
