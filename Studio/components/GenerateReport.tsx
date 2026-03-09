import React, { useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { EVAL_CONFIG, SEASON_OPTIONS } from '../constants';
import { UserRole } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvalEntry {
  eval_id: number;
  score: number;
  rank_label: string;
  dq: boolean;
  payload: Record<string, string | number | string[]>;
  eval_date: string;
}

interface DetailedVehicle {
  vehicle_id: number;
  vehicle_no: string;
  truck_type: string;
  driver_name: string;
  driver_mobile: string;
  sl_no: string;
  transporter_id: number;
  transporter_name: string;
  season: string;
  doc_score: number | null;
  age_score: number | null;
  fitness_expiry: string | null;
  insurance_expiry: string | null;
  evaluations: EvalEntry[];
  eval_count: number;
  dq_count: number;
  avg_score: number | null;
}

interface GenerateReportProps {
  season: string;
  setSeason: (v: string) => void;
  userRole: UserRole;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rankBadgeClass = (rank: string | null, dq: boolean) => {
  if (dq) return 'bg-red-100 text-red-700';
  const t = (rank || '').toUpperCase();
  if (t === 'EXEMPLARY') return 'bg-emerald-100 text-emerald-700';
  if (t === 'STANDARD') return 'bg-blue-100 text-blue-700';
  if (t === 'NEEDS IMPROVEMENT') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-500';
};

const rankLabel = (rank: string | null, dq: boolean) => {
  if (dq) return 'DISQUALIFIED';
  if (!rank) return 'PENDING';
  const t = rank.toUpperCase();
  if (t === 'NEEDS IMPROVEMENT') return 'Needs Improvement';
  if (t === 'EXEMPLARY') return 'Exemplary';
  if (t === 'STANDARD') return 'Standard';
  return rank;
};

/** Look up the human label for a payload value from EVAL_CONFIG */
const getOptionLabel = (itemId: string, value: unknown): string => {
  for (const section of EVAL_CONFIG) {
    const item = section.items.find((i) => i.id === itemId);
    if (item) {
      const opt = item.options.find((o) => String(o.val) === String(value));
      return opt ? opt.label : String(value);
    }
  }
  return String(value);
};

const getItemLabel = (itemId: string): string => {
  for (const section of EVAL_CONFIG) {
    const item = section.items.find((i) => i.id === itemId);
    if (item) return item.label;
  }
  return itemId;
};

const getSectionForItem = (itemId: string): string => {
  for (const section of EVAL_CONFIG) {
    if (section.items.some((i) => i.id === itemId)) return section.title;
  }
  return '';
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const EvalBreakdown: React.FC<{ eval: EvalEntry; baseline: { doc: number | null; age: number | null } }> = ({
  eval: e,
  baseline,
}) => {
  // Build section-grouped breakdown
  const sections = EVAL_CONFIG.map((section) => {
    const items = section.items
      .filter((item) => item.id !== 'accident_reason') // meta field, handled in rto block
      .map((item) => {
        const rawValue = e.payload[item.id];
        if (rawValue === undefined) return null;

        if (item.id === 'rto') {
          // multi-select checkbox field scored via rto_document
          const rtoDoc = e.payload['rto_document'];
          const selections: string[] = Array.isArray(rtoDoc)
            ? rtoDoc
            : typeof rtoDoc === 'string'
            ? [rtoDoc]
            : [];
          const score = typeof rawValue === 'number' ? rawValue : null;
          const labels = selections.map((s) => {
            const opt = item.options.find((o) => String(o.val) === s);
            return opt ? opt.label : s;
          });
          return {
            id: item.id,
            label: item.label,
            valueLabel: labels.length ? labels.join(', ') : 'No instances',
            score,
          };
        }

        if (item.id === 'acc') {
          const score = typeof rawValue === 'number' ? rawValue : rawValue === 'DQ' ? '−15 (DQ)' : rawValue;
          const label = getOptionLabel(item.id, rawValue);
          // also show accident reasons if present
          const reasonList = e.payload['accident_reason_list'] || e.payload['accident_reason'];
          const reasons: string[] = Array.isArray(reasonList)
            ? reasonList
            : typeof reasonList === 'string'
            ? [reasonList]
            : [];
          const reasonsText = reasons.length
            ? ` — Reasons: ${reasons.map((r) => getOptionLabel('accident_reason', r)).join(', ')}`
            : '';
          return {
            id: item.id,
            label: item.label,
            valueLabel: label + reasonsText,
            score: typeof score === 'number' ? score : null,
          };
        }

        const score = typeof rawValue === 'number' ? rawValue : null;
        return {
          id: item.id,
          label: item.label,
          valueLabel: getOptionLabel(item.id, rawValue),
          score,
        };
      })
      .filter(Boolean) as { id: string; label: string; valueLabel: string; score: number | null }[];

    if (!items.length) return null;
    return { title: section.title, points: section.points, items };
  }).filter(Boolean) as { title: string; points: number; items: { id: string; label: string; valueLabel: string; score: number | null }[] }[];

  const baselineTotal = (baseline.doc ?? 0) + (baseline.age ?? 0);

  return (
    <div className="space-y-4 pt-2">
      {/* Baseline row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
          <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Doc Score</div>
          <div className="text-lg font-black text-slate-900">{baseline.doc ?? '—'}<span className="text-xs font-bold text-slate-400">/10</span></div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
          <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Age Score</div>
          <div className="text-lg font-black text-slate-900">{baseline.age ?? '—'}<span className="text-xs font-bold text-slate-400">/2</span></div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
          <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Baseline Total</div>
          <div className="text-lg font-black text-slate-900">{baselineTotal}<span className="text-xs font-bold text-slate-400">/12</span></div>
        </div>
        <div className={`rounded-xl p-3 border ${e.dq ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
          <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Final Score</div>
          <div className={`text-lg font-black ${e.dq ? 'text-red-700' : 'text-blue-700'}`}>{e.score}<span className="text-xs font-bold opacity-60">/100</span></div>
        </div>
      </div>

      {/* Section-wise breakdown */}
      {sections.map((sec) => (
        <div key={sec.title} className="rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">{sec.title}</span>
            <span className="text-[10px] font-bold text-slate-400">{sec.points} pts max</span>
          </div>
          <div className="divide-y divide-slate-50">
            {sec.items.map((item) => (
              <div key={item.id} className="px-4 py-2.5 flex items-start justify-between gap-4">
                <span className="text-xs font-semibold text-slate-600 flex-1">{item.label}</span>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold text-slate-800">{item.valueLabel}</div>
                  {item.score !== null && (
                    <div className="text-[10px] font-black text-blue-600">{item.score >= 0 ? `+${item.score}` : item.score} pts</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const GenerateReport: React.FC<GenerateReportProps> = ({ season, setSeason, userRole }) => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [localSeason, setLocalSeason] = useState(season);
  const [transporterFilter, setTransporterFilter] = useState('');
  const [data, setData] = useState<DetailedVehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [expandedEvalIds, setExpandedEvalIds] = useState<Set<number>>(new Set());
  const [showOnlyWithEvals, setShowOnlyWithEvals] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handleGenerate = async () => {
    if (!localSeason) return;
    setLoading(true);
    setGenerated(false);
    setExpandedIds(new Set());
    setExpandedEvalIds(new Set());
    try {
      const params = new URLSearchParams({ season: localSeason });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const rows: DetailedVehicle[] = await api(`/reports/detailed?${params.toString()}`);
      setData(rows);
      setGenerated(true);
    } catch (e) {
      alert('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const transporters = useMemo(
    () => Array.from(new Set(data.map((d) => d.transporter_name))).filter(Boolean).sort(),
    [data]
  );

  const filteredData = useMemo(() => {
    let rows = transporterFilter ? data.filter((d) => d.transporter_name === transporterFilter) : data;
    if (showOnlyWithEvals) rows = rows.filter((d) => d.eval_count > 0);
    return rows;
  }, [data, transporterFilter, showOnlyWithEvals]);

  const summary = useMemo(() => {
    const total = filteredData.length;
    const withEvals = filteredData.filter((d) => d.eval_count > 0).length;
    const allScores = filteredData.flatMap((d) => d.evaluations.filter((e) => !e.dq).map((e) => e.score));
    const avg = allScores.length ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1) : '—';
    const totalEvals = filteredData.reduce((s, d) => s + d.eval_count, 0);
    const totalDq = filteredData.reduce((s, d) => s + d.dq_count, 0);
    return { total, withEvals, avg, totalEvals, totalDq };
  }, [filteredData]);

  const toggleVehicle = (id: number) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleEval = (id: number) =>
    setExpandedEvalIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handlePrint = () => {
    window.print();
  };

  const dateRangeLabel = fromDate || toDate
    ? `${fromDate || '…'} → ${toDate || '…'}`
    : 'Full season';

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Report Generator</p>
          <h2 className="text-3xl font-extrabold font-heading text-slate-900">Generate Detailed Report</h2>
          <p className="text-slate-500 text-sm font-medium">Select a season and date range to generate a full vehicle evaluation report.</p>
        </div>
      </div>

      {/* Filter Form */}
      <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm space-y-6 no-print">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Report Parameters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Season</label>
            <select
              value={localSeason}
              onChange={(e) => { setLocalSeason(e.target.value); setSeason(e.target.value); }}
              className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
            >
              {SEASON_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Transporter Filter</label>
            <select
              value={transporterFilter}
              onChange={(e) => setTransporterFilter(e.target.value)}
              className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
            >
              <option value="">All Transporters</option>
              {transporters.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="h-12 px-8 rounded-2xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3.5a4.5 4.5 0 00-4.5 4.5H4z" />
                </svg>
                Generating…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Generate Report
              </>
            )}
          </button>
          {generated && (
            <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOnlyWithEvals}
                onChange={(e) => setShowOnlyWithEvals(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              Show only evaluated vehicles
            </label>
          )}
        </div>
      </div>

      {/* Report Output */}
      {generated && !loading && (
        <div ref={printRef} className="space-y-6">
          {/* Summary Bar */}
          <div className="bg-white rounded-[32px] border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 no-print">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Report Summary</p>
                <h3 className="text-lg font-bold text-slate-900">
                  Season {localSeason} · {dateRangeLabel}
                </h3>
              </div>
              <div className="flex items-center gap-3 no-print">
                <button
                  onClick={() => {
                    const allIds = new Set(filteredData.map((d) => d.vehicle_id));
                    setExpandedIds((prev) => prev.size === allIds.size ? new Set() : allIds);
                  }}
                  className="h-10 px-5 rounded-xl border border-slate-200 bg-white text-[11px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50"
                >
                  {expandedIds.size > 0 ? 'Collapse All' : 'Expand All'}
                </button>
                <button
                  onClick={handlePrint}
                  className="h-10 px-5 rounded-xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-700"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print / PDF
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'Total Vehicles', value: summary.total, color: 'text-slate-900' },
                { label: 'Evaluated', value: summary.withEvals, color: 'text-blue-700' },
                { label: 'Total Evals', value: summary.totalEvals, color: 'text-slate-900' },
                { label: 'Avg Score', value: summary.avg, color: 'text-emerald-700' },
                { label: 'DQ Count', value: summary.totalDq, color: 'text-red-600' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl bg-slate-50 p-4 border border-slate-100">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{stat.label}</p>
                  <p className={`text-2xl font-black mt-1 ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Print-only header */}
          <div className="print-only hidden print:block mb-6">
            <h1 className="text-2xl font-black text-slate-900">CaneTransporter — Evaluation Report</h1>
            <p className="text-sm text-slate-600 mt-1">Season: {localSeason} &nbsp;|&nbsp; Period: {dateRangeLabel} &nbsp;|&nbsp; Generated: {new Date().toLocaleString()}</p>
            <hr className="mt-4 border-slate-300" />
          </div>

          {/* Vehicles */}
          {filteredData.length === 0 ? (
            <div className="text-center py-16 rounded-[32px] border-2 border-dashed border-slate-200 text-slate-400 font-bold">
              No vehicles found for the selected criteria.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredData.map((vehicle) => {
                const isExpanded = expandedIds.has(vehicle.vehicle_id);
                const baselineTotal = (vehicle.doc_score ?? 0) + (vehicle.age_score ?? 0);
                const hasEvals = vehicle.eval_count > 0;

                return (
                  <div
                    key={vehicle.vehicle_id}
                    className="bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden print:border print:rounded-none print:shadow-none print:mb-4"
                  >
                    {/* Vehicle Header Row */}
                    <div
                      className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-6 py-5 cursor-pointer hover:bg-slate-50 transition-colors no-print"
                      onClick={() => toggleVehicle(vehicle.vehicle_id)}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="shrink-0 w-10 h-10 rounded-2xl bg-slate-900 flex items-center justify-center text-white">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l3 2h4l3-2zm0 0l2-6h5l1 6h-8z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-black text-slate-900">{vehicle.vehicle_no}</span>
                            {vehicle.truck_type && (
                              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{vehicle.truck_type}</span>
                            )}
                            {vehicle.sl_no && (
                              <span className="text-[10px] font-semibold text-slate-400">SL #{vehicle.sl_no}</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 font-medium mt-0.5 truncate">
                            {vehicle.transporter_name} &nbsp;·&nbsp; {vehicle.driver_name || '—'}
                            {vehicle.driver_mobile ? ` · ${vehicle.driver_mobile}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="text-center px-3">
                          <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Baseline</div>
                          <div className="text-sm font-black text-slate-700">{vehicle.doc_score != null && vehicle.age_score != null ? baselineTotal : '—'}<span className="text-[10px] text-slate-400">/12</span></div>
                        </div>
                        <div className="text-center px-3 border-l border-slate-100">
                          <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Evals</div>
                          <div className="text-sm font-black text-slate-900">{vehicle.eval_count}</div>
                        </div>
                        <div className="text-center px-3 border-l border-slate-100">
                          <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Avg Score</div>
                          <div className="text-sm font-black text-emerald-700">{vehicle.avg_score != null ? vehicle.avg_score.toFixed(1) : '—'}</div>
                        </div>
                        {vehicle.dq_count > 0 && (
                          <span className="text-[10px] font-black bg-red-100 text-red-700 px-2 py-1 rounded-full">{vehicle.dq_count} DQ</span>
                        )}
                        {!hasEvals && (
                          <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-1 rounded-full">Not Evaluated</span>
                        )}
                        <div className={`w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Print-only compact header */}
                    <div className="hidden print:block px-6 py-4 border-b border-slate-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-base font-black text-slate-900">{vehicle.vehicle_no}</span>
                          {vehicle.truck_type && <span className="text-xs text-slate-500 ml-2">{vehicle.truck_type}</span>}
                          {vehicle.sl_no && <span className="text-xs text-slate-400 ml-2">SL #{vehicle.sl_no}</span>}
                        </div>
                        <div className="text-xs text-slate-600">
                          Transporter: <strong>{vehicle.transporter_name}</strong>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Driver: {vehicle.driver_name || '—'} · {vehicle.driver_mobile || '—'} &nbsp;|&nbsp;
                        Baseline: {baselineTotal}/12 (Doc {vehicle.doc_score ?? '—'}, Age {vehicle.age_score ?? '—'}) &nbsp;|&nbsp;
                        Evals in period: {vehicle.eval_count} &nbsp;|&nbsp;
                        Avg Score: {vehicle.avg_score != null ? vehicle.avg_score.toFixed(1) : '—'}
                        {vehicle.fitness_expiry ? ` | Fitness Expiry: ${String(vehicle.fitness_expiry).slice(0, 10)}` : ''}
                        {vehicle.insurance_expiry ? ` | Insurance Expiry: ${String(vehicle.insurance_expiry).slice(0, 10)}` : ''}
                      </div>
                    </div>

                    {/* Expanded Detail */}
                    {(isExpanded || false) && (
                      <div className="border-t border-slate-100 px-6 py-6 space-y-6 no-print">
                        {/* Baseline Details */}
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Baseline Information</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                              <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Documentation</div>
                              <div className="text-lg font-black text-slate-900">{vehicle.doc_score ?? '—'}<span className="text-xs font-bold text-slate-400">/10</span></div>
                              <div className="text-[10px] text-slate-500">{vehicle.doc_score === 10 ? 'All docs present' : vehicle.doc_score === 0 ? 'Docs missing' : '—'}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                              <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Asset Age</div>
                              <div className="text-lg font-black text-slate-900">{vehicle.age_score ?? '—'}<span className="text-xs font-bold text-slate-400">/2</span></div>
                              <div className="text-[10px] text-slate-500">{vehicle.age_score === 2 ? 'Prime (<5y)' : vehicle.age_score === 1 ? 'Mid (5-10y)' : vehicle.age_score === 0 ? 'Vintage (>10y)' : '—'}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                              <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Fitness Expiry</div>
                              <div className="text-sm font-bold text-slate-700">{vehicle.fitness_expiry ? String(vehicle.fitness_expiry).slice(0, 10) : '—'}</div>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100">
                              <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Insurance Expiry</div>
                              <div className="text-sm font-bold text-slate-700">{vehicle.insurance_expiry ? String(vehicle.insurance_expiry).slice(0, 10) : '—'}</div>
                            </div>
                          </div>
                        </div>

                        {/* Evaluations */}
                        {vehicle.evaluations.length === 0 ? (
                          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-slate-400 text-sm font-bold">
                            No evaluations found in the selected date range.
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{vehicle.eval_count} Evaluation{vehicle.eval_count !== 1 ? 's' : ''} in Period</p>
                            {vehicle.evaluations.map((evalEntry, idx) => {
                              const evalExpanded = expandedEvalIds.has(evalEntry.eval_id);
                              return (
                                <div key={evalEntry.eval_id} className="rounded-2xl border border-slate-200 overflow-hidden">
                                  <div
                                    className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                                    onClick={() => toggleEval(evalEntry.eval_id)}
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-[11px] font-black shrink-0">
                                        {idx + 1}
                                      </div>
                                      <div>
                                        <div className="text-xs font-black text-slate-500 uppercase tracking-wider">
                                          {new Date(evalEntry.eval_date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div className="text-sm font-bold text-slate-800">
                                          Evaluation #{idx + 1}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="text-center hidden sm:block">
                                        <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Score</div>
                                        <div className={`text-base font-black ${evalEntry.dq ? 'text-red-600' : 'text-slate-900'}`}>{evalEntry.score}</div>
                                      </div>
                                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${rankBadgeClass(evalEntry.rank_label, evalEntry.dq)}`}>
                                        {rankLabel(evalEntry.rank_label, evalEntry.dq)}
                                      </span>
                                      <div className={`w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center transition-transform ${evalExpanded ? 'rotate-180' : ''}`}>
                                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                                        </svg>
                                      </div>
                                    </div>
                                  </div>
                                  {evalExpanded && (
                                    <div className="border-t border-slate-100 px-5 py-5">
                                      <EvalBreakdown
                                        eval={evalEntry}
                                        baseline={{ doc: vehicle.doc_score, age: vehicle.age_score }}
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Average Summary */}
                            {vehicle.eval_count > 1 && (
                              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 px-5 py-4 flex items-center justify-between">
                                <div>
                                  <div className="text-[9px] font-black uppercase tracking-wider text-emerald-600">Period Average</div>
                                  <div className="text-xs text-slate-600 font-semibold mt-0.5">
                                    Based on {vehicle.eval_count - vehicle.dq_count} valid eval{vehicle.eval_count - vehicle.dq_count !== 1 ? 's' : ''}
                                    {vehicle.dq_count > 0 ? `, ${vehicle.dq_count} DQ excluded` : ''}
                                  </div>
                                </div>
                                <div className="text-3xl font-black text-emerald-700">
                                  {vehicle.avg_score != null ? vehicle.avg_score.toFixed(1) : '—'}
                                  <span className="text-sm font-bold opacity-60">/100</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Print-only expanded content (always shown on print) */}
                    <div className="hidden print:block px-6 py-4 space-y-4">
                      <div className="text-xs font-semibold text-slate-600">
                        Baseline — Doc: {vehicle.doc_score ?? '—'}/10 | Age: {vehicle.age_score ?? '—'}/2 | Total: {baselineTotal}/12
                        {vehicle.fitness_expiry ? ` | Fitness: ${String(vehicle.fitness_expiry).slice(0, 10)}` : ''}
                        {vehicle.insurance_expiry ? ` | Insurance: ${String(vehicle.insurance_expiry).slice(0, 10)}` : ''}
                      </div>
                      {vehicle.evaluations.length === 0 ? (
                        <div className="text-xs text-slate-400 italic">No evaluations in selected period.</div>
                      ) : (
                        vehicle.evaluations.map((evalEntry, idx) => (
                          <div key={evalEntry.eval_id} className="border border-slate-200 rounded p-3 text-xs space-y-2">
                            <div className="flex items-center justify-between font-bold">
                              <span>Eval {idx + 1} — {new Date(evalEntry.eval_date).toLocaleString()}</span>
                              <span>Score: {evalEntry.score} | {evalEntry.dq ? 'DISQUALIFIED' : evalEntry.rank_label}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                              {EVAL_CONFIG.flatMap((section) =>
                                section.items
                                  .filter((item) => item.id !== 'accident_reason')
                                  .map((item) => {
                                    const raw = evalEntry.payload[item.id];
                                    if (raw === undefined) return null;
                                    let displayVal = '';
                                    if (item.id === 'rto') {
                                      const doc = evalEntry.payload['rto_document'];
                                      const arr: string[] = Array.isArray(doc) ? doc : typeof doc === 'string' ? [doc] : [];
                                      displayVal = arr.length ? arr.map((s) => { const o = item.options.find((x) => String(x.val) === s); return o ? o.label : s; }).join(', ') : 'No instances';
                                    } else {
                                      displayVal = getOptionLabel(item.id, raw);
                                    }
                                    const score = typeof raw === 'number' ? raw : null;
                                    return (
                                      <div key={item.id} className="flex justify-between border-b border-slate-50 py-0.5">
                                        <span className="text-slate-500 truncate pr-2">{item.label}</span>
                                        <span className="font-semibold text-slate-800 shrink-0">{displayVal}{score !== null ? ` (${score >= 0 ? '+' : ''}${score})` : ''}</span>
                                      </div>
                                    );
                                  })
                                  .filter(Boolean)
                              )}
                            </div>
                          </div>
                        ))
                      )}
                      {vehicle.eval_count > 1 && vehicle.avg_score != null && (
                        <div className="font-bold text-sm text-emerald-700 border-t border-slate-200 pt-2">
                          Period Average Score: {vehicle.avg_score.toFixed(1)} / 100
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!generated && !loading && (
        <div className="flex flex-col items-center justify-center py-20 rounded-[32px] border-2 border-dashed border-slate-200 text-slate-400">
          <svg className="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-bold">Select season and date range, then click Generate Report</p>
        </div>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media screen {
          .print-only { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default GenerateReport;
