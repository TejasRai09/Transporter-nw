import React, { useEffect, useMemo, useState } from 'react';
import { ConsolidatedReportRow } from '../types';

interface ConsolidatedReportsProps {
  reports: ConsolidatedReportRow[];
  transporterFilter: string;
  setTransporterFilter: (v: string) => void;
}

const KNOWN_RANKS = ['EXEMPLARY', 'STANDARD', 'NEEDS IMPROVEMENT'] as const;

const normalizeToken = (value?: string | null) => String(value ?? '').trim().toUpperCase();

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split(/\s+/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const prettyRank = (token: string) => {
  if (token === 'NEEDS IMPROVEMENT') return 'Needs Improvement';
  if (token === 'EXEMPLARY') return 'Exemplary';
  if (token === 'STANDARD') return 'Standard';
  return titleCase(token);
};

const rankBadge = (rank?: string | null, dqCount?: number | null) => {
  if (dqCount && dqCount > 0) return 'bg-red-100 text-red-700';
  const token = normalizeToken(rank);
  if (!token) return 'bg-slate-100 text-slate-500';
  if (token === 'EXEMPLARY') return 'bg-emerald-100 text-emerald-700';
  if (token === 'STANDARD') return 'bg-blue-100 text-blue-700';
  return 'bg-amber-100 text-amber-700';
};

const ConsolidatedReports: React.FC<ConsolidatedReportsProps> = ({ reports, transporterFilter, setTransporterFilter }) => {
  const PAGE_SIZE = 20;

  const [sortBy, setSortBy] = useState<'avg' | 'status' | 'updated'>('avg');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);

  const transporters = useMemo(
    () => Array.from(new Set(reports.map((r) => r.transporter_name))).filter(Boolean).sort(),
    [reports]
  );

  const rankOptions = useMemo(() => {
    const tokens = new Set<string>(KNOWN_RANKS);

    reports.forEach((r) => {
      const token = normalizeToken(r.last_eval_rank);
      if (!token) return;
      if (token === 'DISQUALIFIED' || token === 'DQ') return;
      if (token === 'PENDING') return;
      tokens.add(token);
    });

    const ordered = [...KNOWN_RANKS, ...Array.from(tokens).filter((t) => !KNOWN_RANKS.includes(t as any)).sort()];
    return ordered.map((t) => ({ value: t, label: prettyRank(t) }));
  }, [reports]);

  const filtered = useMemo(
    () => (transporterFilter ? reports.filter((r) => r.transporter_name === transporterFilter) : reports),
    [reports, transporterFilter]
  );

  const filteredByStatus = useMemo(() => {
    if (statusFilter === 'ALL') return filtered;
    if (statusFilter === 'PENDING') return filtered.filter((r) => (r.eval_count || 0) === 0 && (r.dq_count || 0) === 0);
    if (statusFilter === 'DQ') return filtered.filter((r) => (r.dq_count || 0) > 0);
    return filtered.filter((r) => (r.dq_count || 0) === 0 && normalizeToken(r.last_eval_rank) === statusFilter);
  }, [filtered, statusFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredByStatus].sort((a, b) => {
      if (sortBy === 'avg') {
        const aHas = a.eval_avg_score != null;
        const bHas = b.eval_avg_score != null;
        if (aHas !== bHas) return aHas ? -1 : 1; // nulls last
        if (a.eval_avg_score != null && b.eval_avg_score != null && a.eval_avg_score !== b.eval_avg_score) {
          return (a.eval_avg_score - b.eval_avg_score) * dir;
        }
      } else if (sortBy === 'updated') {
        const aT = a.last_eval_date ? new Date(a.last_eval_date).getTime() : -Infinity;
        const bT = b.last_eval_date ? new Date(b.last_eval_date).getTime() : -Infinity;
        if (aT !== bT) return (aT - bT) * dir;
      } else if (sortBy === 'status') {
        const statusKey = (r: ConsolidatedReportRow) => {
          if ((r.dq_count || 0) > 0) return '0_DQ';
          if ((r.eval_count || 0) === 0) return '1_PENDING';
          return `2_${normalizeToken(r.last_eval_rank || 'RECORDED')}`;
        };
        const cmp = statusKey(a).localeCompare(statusKey(b));
        if (cmp !== 0) return cmp * dir;
      }

      const t = (a.transporter_name || '').toString().localeCompare((b.transporter_name || '').toString());
      if (t !== 0) return t;
      return (a.vehicle_no || '').toString().localeCompare((b.vehicle_no || '').toString());
    });
  }, [filteredByStatus, sortBy, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [transporterFilter, statusFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, sorted.length);
  const pageRows = useMemo(() => sorted.slice(startIndex, endIndex), [sorted, startIndex, endIndex]);

  const toggleSort = (col: 'avg' | 'status' | 'updated') => {
    if (sortBy !== col) {
      setSortBy(col);
      setSortDir('desc');
      return;
    }
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  };

  const sortIcon = (col: 'avg' | 'status' | 'updated') => {
    if (sortBy !== col) return <span className="text-slate-300">⇅</span>;
    return sortDir === 'asc' ? <span>▲</span> : <span>▼</span>;
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-6 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Consolidated Report</p>
          <h2 className="text-3xl font-extrabold font-heading text-slate-900">Season Averages by Vehicle</h2>
          <p className="text-slate-500 text-sm font-medium">Average score across the selected season (with counts and last update).</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-bold focus:ring-4 focus:ring-blue-100"
            title="Status"
          >
            <option value="ALL">All status</option>
            <option value="PENDING">Pending</option>
            <option value="DQ">DQ in season</option>
            {rankOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={transporterFilter}
            onChange={(e) => setTransporterFilter(e.target.value)}
            className="h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-bold focus:ring-4 focus:ring-blue-100"
          >
            <option value="">All transporters</option>
            {transporters.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm text-slate-500 font-semibold">
          <div>
            Showing <span className="text-slate-900 font-black">{sorted.length === 0 ? 0 : startIndex + 1}</span>–
            <span className="text-slate-900 font-black">{endIndex}</span> of{' '}
            <span className="text-slate-900 font-black">{sorted.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="h-10 px-4 rounded-xl border border-slate-200 bg-white font-bold disabled:opacity-40"
            >
              Prev
            </button>
            <div className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center font-black text-slate-900">
              Page {safePage} / {totalPages}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="h-10 px-4 rounded-xl border border-slate-200 bg-white font-bold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest font-black text-slate-400 bg-slate-50/50">
                <th className="px-6 py-4 text-left">Transporter</th>
                <th className="px-6 py-4 text-left">Vehicle</th>
                <th className="px-6 py-4 text-left">Driver</th>
                <th className="px-6 py-4 text-center">Baseline</th>
                <th className="px-6 py-4 text-center">
                  <button
                    type="button"
                    onClick={() => toggleSort('avg')}
                    className="inline-flex items-center gap-2 hover:text-slate-600"
                    title="Sort by average score"
                  >
                    Avg Score {sortIcon('avg')}
                  </button>
                </th>
                <th className="px-6 py-4 text-center">Evals</th>
                <th className="px-6 py-4 text-left">
                  <button
                    type="button"
                    onClick={() => toggleSort('status')}
                    className="inline-flex items-center gap-2 hover:text-slate-600"
                    title="Sort by status"
                  >
                    Status {sortIcon('status')}
                  </button>
                </th>
                <th className="px-6 py-4 text-left">
                  <button
                    type="button"
                    onClick={() => toggleSort('updated')}
                    className="inline-flex items-center gap-2 hover:text-slate-600"
                    title="Sort by last updated"
                  >
                    Last Updated {sortIcon('updated')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((row) => {
                const baseline = row.doc_score != null && row.age_score != null ? row.doc_score + row.age_score : null;
                const avg = row.eval_avg_score == null ? null : Number(row.eval_avg_score);
                const statusLabel =
                  row.dq_count && row.dq_count > 0
                    ? 'DQ IN SEASON'
                    : normalizeToken(row.last_eval_rank) || (row.eval_count ? 'RECORDED' : 'PENDING');

                return (
                  <tr key={row.vehicle_id} className="hover:bg-slate-50 transition-all">
                    <td className="px-6 py-4 text-sm font-bold text-slate-900">{row.transporter_name}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900">{row.vehicle_no}</div>
                      <div className="text-[11px] font-semibold text-slate-400">{row.truck_type || '—'} · {row.sl_no || '—'}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      <div className="font-bold">{row.driver_name || '—'}</div>
                      <div className="text-[11px] text-slate-400">{row.driver_mobile || '—'}</div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm font-bold text-slate-700">{baseline ?? '—'}</td>
                    <td className="px-6 py-4 text-center text-lg font-black text-slate-900">{avg == null ? '—' : avg.toFixed(1)}</td>
                    <td className="px-6 py-4 text-center text-sm font-bold text-slate-700">{row.eval_count || 0}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${rankBadge(row.last_eval_rank, row.dq_count)}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{row.last_eval_date ? new Date(row.last_eval_date).toLocaleString() : '—'}</td>
                  </tr>
                );
              })}

              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-400 font-bold">No records yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ConsolidatedReports;
