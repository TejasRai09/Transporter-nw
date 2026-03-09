
import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  LayoutDashboard,
  Download,
  Filter,
  TrendingUp,
  Truck,
  ClipboardCheck,
  ShieldAlert,
  ChevronRight,
} from 'lucide-react';
import { ConsolidatedReportRow, ReportRow } from '../types';
import { EVAL_CONFIG, SEASON_OPTIONS } from '../constants';
import Reports from './Reports';

interface ViewerDashboardProps {
  reports: ReportRow[];
  windowedReports: ConsolidatedReportRow[];
  transporterFilter: string;
  setTransporterFilter: (v: string) => void;
  season: string;
  appliedSeason: string;
  appliedFromDate: string;
  appliedToDate: string;
  setSeason: (v: string) => void;
  fromDate: string;
  toDate: string;
  setFromDate: (v: string) => void;
  setToDate: (v: string) => void;
  refreshReports: () => Promise<void>;
}

type StatCardProps = {
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  trend?: number;
};

const formatPercent = (num: number, denom: number) =>
  denom > 0 && Number.isFinite(num) ? `${Math.round((num / denom) * 100)}%` : '—';

type RankToken = 'EXEMPLARY' | 'STANDARD' | 'NEEDS IMPROVEMENT';

const normalizeRankToken = (value: unknown): RankToken | null => {
  const token = String(value ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
  if (token === 'EXEMPLARY') return 'EXEMPLARY';
  if (token === 'STANDARD') return 'STANDARD';
  if (token === 'NEEDS IMPROVEMENT') return 'NEEDS IMPROVEMENT';
  return null;
};

const deriveRankFromScore = (score: unknown): RankToken | null => {
  const s = Number(score);
  if (!Number.isFinite(s)) return null;
  if (s >= 85) return 'EXEMPLARY';
  if (s >= 70) return 'STANDARD';
  return 'NEEDS IMPROVEMENT';
};

type StatusCounts = {
  exemplary: number;
  standard: number;
  needsImprovement: number;
  dq: number;
  pending: number;
};

type Metrics = {
  total: number;
  evaluated: number;
  pending: number;
  baselines: number;
  avgScore: string;
  complianceRate: string;
  assessmentProgress: string;
  statusCounts: StatusCounts;
};

// Reusable Metric Card with polished styling
const StatCard = ({ label, value, sub, icon: Icon, colorClass, trend }: StatCardProps) => (
  <div className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden relative">
    <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-5 group-hover:opacity-10 transition-opacity ${colorClass}`} />
    <div className="flex items-start justify-between relative z-10">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colorClass} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
      </div>
      {trend && (
        <span className={`text-xs font-bold flex items-center gap-1 ${trend > 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
          <TrendingUp className={`w-3 h-3 ${trend < 0 && 'rotate-180'}`} />
          {Math.abs(trend)}%
        </span>
      )}
    </div>
    <div className="mt-4 relative z-10">
      <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{label}</p>
      <h3 className="text-3xl font-extrabold text-slate-900 mt-1">{value}</h3>
      {sub && (typeof sub === 'string' ? <p className="text-slate-500 text-xs mt-1 font-medium">{sub}</p> : sub)}
    </div>
  </div>
);

const StatusCard = ({ counts, colorClass }: { counts: StatusCounts; colorClass: string }) => {
  const items = [
    { label: 'Exemplary', value: counts.exemplary, dot: 'bg-emerald-500', text: 'text-emerald-700' },
    { label: 'Standard', value: counts.standard, dot: 'bg-blue-500', text: 'text-blue-700' },
    { label: 'Needs Improvement', value: counts.needsImprovement, dot: 'bg-amber-500', text: 'text-amber-800' },
  ];

  return (
    <div className="group bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden relative">
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-5 group-hover:opacity-10 transition-opacity ${colorClass}`} />

      <div className="flex items-start justify-between relative z-10">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colorClass} bg-opacity-10`}>
          <ShieldAlert className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
        </div>
      </div>

      <div className="mt-3 relative z-10">
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Status</p>
        <div className="mt-2 space-y-1.5">
          {items.map((it) => (
            <div
              key={it.label}
              className="flex items-center justify-between rounded-xl px-1"
            >
              <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${it.text}`}>
                <span className={`inline-block w-2 h-2 rounded-full ${it.dot}`} />
                <span className="truncate">{it.label}</span>
              </div>
              <div className="text-base font-black text-slate-900 leading-none tabular-nums">{it.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ViewerDashboard: React.FC<ViewerDashboardProps> = ({ reports, windowedReports, transporterFilter, setTransporterFilter, season, appliedSeason, appliedFromDate, appliedToDate, setSeason, fromDate, toDate, setFromDate, setToDate, refreshReports }) => {
  const [paramId, setParamId] = useState<string>(EVAL_CONFIG[0]?.items[0]?.id || 'eval_score');
  const [isFiltering, setIsFiltering] = useState(false);

  const months = useMemo(
    () => [
      { value: 1, label: 'Jan' },
      { value: 2, label: 'Feb' },
      { value: 3, label: 'Mar' },
      { value: 4, label: 'Apr' },
      { value: 5, label: 'May' },
      { value: 6, label: 'Jun' },
      { value: 7, label: 'Jul' },
      { value: 8, label: 'Aug' },
      { value: 9, label: 'Sep' },
      { value: 10, label: 'Oct' },
      { value: 11, label: 'Nov' },
      { value: 12, label: 'Dec' },
    ],
    []
  );

  const [selectedMonth, setSelectedMonth] = useState<number>(1);
  const [selectedHalf, setSelectedHalf] = useState<'H1' | 'H2'>('H1');
  const [dateMode, setDateMode] = useState<'CUSTOM' | 'PERIOD'>('CUSTOM');

  const seasonStartYear = useMemo(() => {
    const m = /^SS(\d{2})-(\d{2})$/.exec(season);
    if (!m) return null;
    const yy = Number(m[1]);
    if (!Number.isFinite(yy)) return null;
    return 2000 + yy;
  }, [season]);

  const seasonMinDate = seasonStartYear ? `${seasonStartYear}-01-01` : undefined;
  const seasonMaxDate = seasonStartYear ? `${seasonStartYear}-12-31` : undefined;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const monthEnd = (y: number, m: number) => new Date(y, m, 0).getDate(); // m is 1-based

  const applyHalfMonthWindow = (year: number, month: number, half: 'H1' | 'H2') => {
    const last = monthEnd(year, month);
    const from = half === 'H1' ? `${year}-${pad2(month)}-01` : `${year}-${pad2(month)}-16`;
    const to = half === 'H1' ? `${year}-${pad2(month)}-15` : `${year}-${pad2(month)}-${pad2(last)}`;
    setFromDate(from);
    setToDate(to);
  };

  const handleSeasonChange = (nextSeason: string) => {
    setSeason(nextSeason);
    const m = /^SS(\d{2})-(\d{2})$/.exec(nextSeason);
    if (!m) return;
    const startYear = 2000 + Number(m[1]);
    if (!Number.isFinite(startYear)) return;
    // Default the draft window to the full year for that season.
    setFromDate(`${startYear}-01-01`);
    setToDate(`${startYear}-12-31`);
    setSelectedMonth(1);
    setSelectedHalf('H1');
  };

  // Keep dropdowns roughly in sync with the currently selected draft "from" date.
  useEffect(() => {
    if (!fromDate) return;
    const m = /^SS(\d{2})-(\d{2})$/.exec(season);
    const startYear = m ? 2000 + Number(m[1]) : null;
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromDate);
    if (!dm) return;
    const y = Number(dm[1]);
    const month = Number(dm[2]);
    const day = Number(dm[3]);
    if (!Number.isFinite(y) || !Number.isFinite(month) || !Number.isFinite(day)) return;
    if (startYear && y !== startYear) return;
    if (month >= 1 && month <= 12) setSelectedMonth(month);
    setSelectedHalf(day <= 15 ? 'H1' : 'H2');
  }, [fromDate, season]);

  const seasonReports = useMemo(
    () => reports.filter((r) => !r.season || r.season === appliedSeason),
    [reports, appliedSeason]
  );

  const seasonWindowedReports = useMemo(
    () => windowedReports.filter((r) => !r.season || r.season === appliedSeason),
    [windowedReports, appliedSeason]
  );

  // Logic: 1. Filter reports for analysis
  // Filtering by transporter is local; season is applied here.
  const filteredData = useMemo(() => {
    return transporterFilter
      ? seasonReports.filter((r) => r.transporter_name === transporterFilter)
      : seasonReports;
  }, [seasonReports, transporterFilter]);

  const filteredWindowed = useMemo(() => {
    return transporterFilter
      ? seasonWindowedReports.filter((r) => r.transporter_name === transporterFilter)
      : seasonWindowedReports;
  }, [transporterFilter, seasonWindowedReports]);

  // ...existing code...

  // Logic: 2. Compute Metrics
  const metrics = useMemo<Metrics>(() => {
    // Prefer backend-computed windowed averages. If backend hasn't been restarted yet and
    // windowedReports is empty, fall back to latest-report rows so the UI doesn't look broken.
    const useWindowed = filteredWindowed.length > 0;

    const emptyCounts: StatusCounts = { exemplary: 0, standard: 0, needsImprovement: 0, dq: 0, pending: 0 };

    if (!useWindowed) {
      const total = filteredData.length;
      const evaluated = filteredData.filter((r) => r.eval_score != null).length;
      const pending = Math.max(total - evaluated, 0);
      const baselines = filteredData.filter((r) => r.doc_score != null && r.age_score != null).length;
      const scores = filteredData.map((r) => r.eval_score).filter((s): s is number => s != null);
      const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
      const dqCount = filteredData.filter((r) => !!r.eval_dq).length;
      const complianceRate = formatPercent(total - dqCount, total);
      const assessmentProgress = formatPercent(evaluated, total);

      const statusCounts = filteredData.reduce<StatusCounts>((acc, r) => {
        const isDq = !!r.eval_dq;
        const isPending = !isDq && (r.eval_score == null && !r.eval_rank);
        if (isDq) {
          acc.dq += 1;
          return acc;
        }
        if (isPending) {
          acc.pending += 1;
          return acc;
        }

        const token = normalizeRankToken(r.eval_rank) ?? deriveRankFromScore(r.eval_score);
        if (token === 'EXEMPLARY') acc.exemplary += 1;
        else if (token === 'STANDARD') acc.standard += 1;
        else if (token === 'NEEDS IMPROVEMENT') acc.needsImprovement += 1;
        else acc.pending += 1;
        return acc;
      }, { ...emptyCounts });

      return { total, evaluated, pending, baselines, avgScore, complianceRate, assessmentProgress, statusCounts };
    }

    const total = filteredWindowed.length;
    const evaluated = filteredWindowed.filter((r) => (r.eval_count || 0) > 0).length;
    const pending = Math.max(total - evaluated, 0);
    const baselines = filteredWindowed.filter((r) => r.doc_score != null && r.age_score != null).length;

    const weightedSum = filteredWindowed.reduce((sum, r) => {
      if (r.eval_avg_score == null) return sum;
      const count = Number(r.eval_count || 0);
      if (!Number.isFinite(count) || count <= 0) return sum;
      return sum + Number(r.eval_avg_score) * count;
    }, 0);
    const weightedDenom = filteredWindowed.reduce((sum, r) => sum + Number(r.eval_count || 0), 0);
    const avgScore = weightedDenom > 0 ? (weightedSum / weightedDenom).toFixed(1) : '—';

    const dqWindows = filteredWindowed.reduce((sum, r) => sum + Number(r.dq_count || 0), 0);
    const totalWindows = weightedDenom + dqWindows;
    const complianceRate = totalWindows > 0 ? formatPercent(totalWindows - dqWindows, totalWindows) : '—';
    const assessmentProgress = formatPercent(evaluated, total);

    const statusCounts = filteredWindowed.reduce<StatusCounts>((acc, r) => {
      const hasAnyEval = Number(r.eval_count || 0) > 0 || Number(r.dq_count || 0) > 0;
      if (!hasAnyEval) {
        acc.pending += 1;
        return acc;
      }

      const isDq = Number(r.last_eval_dq || 0) === 1 || Number(r.dq_count || 0) > 0;
      if (isDq) {
        acc.dq += 1;
        return acc;
      }

      const token = normalizeRankToken(r.last_eval_rank) ?? deriveRankFromScore(r.eval_avg_score);
      if (token === 'EXEMPLARY') acc.exemplary += 1;
      else if (token === 'STANDARD') acc.standard += 1;
      else if (token === 'NEEDS IMPROVEMENT') acc.needsImprovement += 1;
      else acc.pending += 1;
      return acc;
    }, { ...emptyCounts });

    return { total, evaluated, pending, baselines, avgScore, complianceRate, assessmentProgress, statusCounts };
  }, [filteredData, filteredWindowed]);

  // Logic: 3. Prepare Charts Data (Recharts format)
  const chartData = useMemo(() => {
    // Histogram
    const buckets = [
      { name: '0-40', count: 0, color: '#f43f5e', range: [0, 40] },
      { name: '40-60', count: 0, color: '#f59e0b', range: [40, 60] },
      { name: '60-80', count: 0, color: '#3b82f6', range: [60, 80] },
      { name: '80-100', count: 0, color: '#10b981', range: [80, 101] },
    ];
    
    const useWindowed = filteredWindowed.length > 0;

    if (useWindowed) {
      filteredWindowed.forEach(r => {
        if (r.eval_avg_score == null) return;
        const s = Number(r.eval_avg_score);
        const b = buckets.find(x => s >= x.range[0] && s < x.range[1]);
        if (b) b.count++;
      });
    } else {
      filteredData.forEach(r => {
        if (r.eval_score == null) return;
        const s = Number(r.eval_score);
        const b = buckets.find(x => s >= x.range[0] && s < x.range[1]);
        if (b) b.count++;
      });
    }

    // Top Transporters Pie
    const tMap = new Map<string, number>();
    (useWindowed ? filteredWindowed : filteredData).forEach((r: any) => {
      if (!r.transporter_name) return;
      tMap.set(r.transporter_name, (tMap.get(r.transporter_name) || 0) + 1);
    });
    
    const topTransporters = Array.from(tMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return { buckets, topTransporters };
  }, [filteredData, filteredWindowed]);

  // Parameter distribution logic
  const paramMeta = useMemo(() => {
    const options: { id: string; label: string; section: string; options: { label: string; val: number | string }[] }[] = [];
    EVAL_CONFIG.forEach((section) => {
      section.items.forEach((item) => {
        if (item.id === 'accident_reason') return;
        if (item.id === 'rto') {
          options.push({
            id: item.id,
            label: item.label,
            section: section.title,
            options: [
              { label: 'No instances', val: 10 },
              { label: '1 violation', val: 8 },
              { label: '2 violations', val: 6 },
              { label: '3 violations', val: 4 },
              { label: '4 violations', val: 0 },
            ],
          });
          return;
        }
        options.push({ id: item.id, label: item.label, section: section.title, options: item.options });
      });
    });
    options.push({ id: 'doc_score', label: 'Documentation Score', section: 'Baseline', options: [ { label: 'Complete', val: 10 }, { label: 'Missing', val: 0 } ] });
    options.push({ id: 'age_score', label: 'Asset Age Score', section: 'Baseline', options: [ { label: 'Prime', val: 2 }, { label: 'Mid', val: 1 }, { label: 'Vintage', val: 0 } ] });
    return options;
  }, []);

  const selectedParam = paramMeta.find((p) => p.id === paramId) || paramMeta[0];

  const paramDistData = useMemo(() => {
    if (!selectedParam) return [];
    
    const distribution = selectedParam.options
      .filter((o) => o.val !== 'DQ')
      .map((opt) => ({
        name: opt.label,
        val: opt.val,
        count: 0,
      }));

    const missingObj = { name: 'Not Recorded', val: 'missing', count: 0 };

    filteredData.forEach((r) => {
      let value: string | number | string[] | null | undefined = null;
      if (selectedParam.id === 'doc_score') value = r.doc_score;
      else if (selectedParam.id === 'age_score') value = r.age_score;
      else value = r.eval_payload ? r.eval_payload[selectedParam.id] : null;

      if (value === null || value === undefined) {
        missingObj.count++;
        return;
      }

      if (Array.isArray(value)) {
        if (value.length === 0) {
          missingObj.count++;
          return;
        }
        for (const v of value) {
          const match = distribution.find((d) => String(d.val) === String(v));
          if (match) match.count++;
          else missingObj.count++;
        }
        return;
      }

      const match = distribution.find((d) => String(d.val) === String(value));
      if (match) match.count++;
      else missingObj.count++;
    });

    return [...distribution, missingObj].filter((d) => d.count > 0 || d.name !== 'Not Recorded');
  }, [filteredData, selectedParam]);

  const downloadCsv = () => {
    const header = ['transporter', 'vehicle_no', 'truck_type', 'driver_name', 'eval_score', 'compliance_status'];
    const rows = filteredData.map((r) => [
      r.transporter_name,
      r.vehicle_no,
      r.truck_type,
      r.driver_name,
      r.eval_score ?? 'N/A',
      r.eval_dq ? 'DQ' : 'OK'
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fleet_analysis_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto py-10 px-6 space-y-10 animate-fade-in-up">
      {/* Header Section */}
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 p-3 rounded-2xl shadow-lg shadow-slate-200">
              <LayoutDashboard className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                Fleet Insights
                <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-bold uppercase tracking-widest">v3.0 Live</span>
              </h1>
              <p className="text-slate-500 font-medium mt-1">
                Analyzing <span className="text-slate-900 font-bold">{metrics.total} vehicles</span> across {transporterFilter || 'all'} transporters.
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={downloadCsv}
              className="group bg-white border border-slate-200 hover:border-slate-900 text-slate-900 px-6 py-3 rounded-2xl font-bold transition-all flex items-center gap-2 shadow-sm"
            >
              <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
              Export CSV
            </button>
            <div className="h-12 w-[1px] bg-slate-200 mx-2 hidden lg:block" />
            <div className="flex items-center bg-white border border-slate-200 rounded-2xl px-4 py-1.5 shadow-sm">
              <Filter className="w-4 h-4 text-slate-400 mr-2" />
              <select 
                value={transporterFilter}
                onChange={(e) => setTransporterFilter(e.target.value)}
                className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 outline-none min-w-[140px]"
              >
                <option value="">Global Filter</option>
                {Array.from(new Set(reports.map(r => r.transporter_name))).map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Season</label>
            <select
              value={season}
              onChange={(e) => handleSeasonChange(e.target.value)}
              className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100"
            >
              {SEASON_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Date Mode</label>
            <select
              value={dateMode}
              onChange={(e) => {
                const next = e.target.value === 'PERIOD' ? 'PERIOD' : 'CUSTOM';
                setDateMode(next);
                if (next === 'PERIOD' && seasonStartYear) {
                  applyHalfMonthWindow(seasonStartYear, selectedMonth, selectedHalf);
                }
              }}
              className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100"
            >
              <option value="CUSTOM">Custom</option>
              <option value="PERIOD">Half-month</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => {
                const m = Number(e.target.value);
                if (!Number.isFinite(m)) return;
                setSelectedMonth(m);
                if (dateMode === 'PERIOD' && seasonStartYear) applyHalfMonthWindow(seasonStartYear, m, selectedHalf);
              }}
              className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100"
              disabled={!seasonStartYear || dateMode !== 'PERIOD'}
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Period</label>
            <select
              value={selectedHalf}
              onChange={(e) => {
                const half = e.target.value === 'H2' ? 'H2' : 'H1';
                setSelectedHalf(half);
                if (dateMode === 'PERIOD' && seasonStartYear) applyHalfMonthWindow(seasonStartYear, selectedMonth, half);
              }}
              className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100"
              disabled={!seasonStartYear || dateMode !== 'PERIOD'}
            >
              <option value="H1">1–15</option>
              <option value="H2">16–EOM</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setDateMode('CUSTOM');
              }}
              min={seasonMinDate}
              max={seasonMaxDate}
              className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setDateMode('CUSTOM');
              }}
              min={seasonMinDate}
              max={seasonMaxDate}
              className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={async () => {
                setIsFiltering(true);
                try {
                  await refreshReports();
                } finally {
                  setIsFiltering(false);
                }
              }}
              disabled={isFiltering}
              className="w-full h-11 bg-slate-900 text-white rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isFiltering ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3.5a4.5 4.5 0 00-4.5 4.5H4z" />
                  </svg>
                  Applying…
                </span>
              ) : (
                'Apply Filters'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Active Fleet" 
          value={metrics.total} 
          sub={`${metrics.baselines} baseline finalized`}
          colorClass="bg-blue-500"
          icon={Truck}
        />
        <StatCard 
          label="Assessment Progress" 
          value={metrics.assessmentProgress}
          sub={`${metrics.evaluated} evaluated, ${metrics.pending} pending`}
          colorClass="bg-indigo-500"
          icon={ClipboardCheck}
        />
        <StatCard 
          label="Health Score" 
          value={metrics.avgScore} 
          sub="Fleet-wide mean score"
          colorClass="bg-emerald-500"
          icon={TrendingUp}
          trend={+4.2}
        />
        <StatusCard counts={metrics.statusCounts} colorClass="bg-rose-500" />
      </div>

      {/* Main Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Score Distribution Chart */}
        <div className="lg:col-span-8 bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col">
          <div className="mb-8 flex justify-between items-start">
            <div>
              <h3 className="text-xl font-bold text-slate-900">Health Distribution</h3>
              <p className="text-slate-500 text-sm">Quantile breakdown of vehicle safety scores.</p>
            </div>
            <div className="flex gap-2">
              <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><div className="w-2 h-2 rounded-full bg-emerald-500" /> High</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><div className="w-2 h-2 rounded-full bg-rose-500" /> Low</span>
            </div>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData.buckets} margin={{ top: 20, right: 30, left: 0, bottom: 0 }} barGap={0}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} 
                  dy={10}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                />
                <Bar dataKey="count" radius={[12, 12, 0, 0]} barSize={60}>
                  {chartData.buckets.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between text-sm text-slate-500 font-medium">
             <div className="flex items-center gap-4">
               <span>Total Evaluations: <strong className="text-slate-900">{metrics.evaluated}</strong></span>
               <div className="w-[1px] h-4 bg-slate-200" />
               <span>Avg Score: <strong className="text-slate-900">{metrics.avgScore}</strong></span>
             </div>
             <button className="text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 group">
               View Raw Data <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
             </button>
          </div>
        </div>

        {/* Fleet Composition */}
        <div className="lg:col-span-4 bg-slate-900 p-8 rounded-[40px] shadow-2xl flex flex-col text-white">
          <div className="mb-6">
            <h3 className="text-xl font-bold">Top Partners</h3>
            {/* <p className="text-slate-400 text-sm">Market share by transporter.</p> */}
          </div>
          <div className="flex-1 flex flex-col justify-center gap-6">
            <div className="h-48 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData.topTransporters}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.topTransporters.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#f43f5e'][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', background: '#1e293b', border: 'none', color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-black">{metrics.total}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Trucks</span>
              </div>
            </div>
            <div className="space-y-3">
              {chartData.topTransporters.map((t, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#f43f5e'][i % 5] }} />
                    <span className="text-sm font-semibold text-slate-300 truncate max-w-[120px]">{t.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">{t.value}</span>
                    <div className="w-16 bg-slate-800 h-1 rounded-full overflow-hidden">
                            <div className="bg-white h-full" style={{ width: `${metrics.total ? (t.value / metrics.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* Advanced Parameters Section */}
      <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm space-y-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="max-w-xl">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Granular Parameter Analysis</h3>
            <p className="text-slate-500 font-medium mt-1 leading-relaxed">
              Drill down into specific inspection items to identify systemic weaknesses or excellence in your fleet operations.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Select Measurement</span>
            <select
              value={paramId}
              onChange={(e) => setParamId(e.target.value)}
              className="min-w-[260px] h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 text-sm font-bold text-slate-800 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all cursor-pointer"
            >
              {EVAL_CONFIG.map((section) => (
                <optgroup key={section.title} label={section.title}>
                  {section.items.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </optgroup>
              ))}
              <optgroup label="Baseline Dimensions">
                <option value="doc_score">Documentation Score</option>
                <option value="age_score">Asset Age Score</option>
              </optgroup>
            </select>
          </div>
        </div>

        <div className="bg-slate-50 rounded-[32px] p-8">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paramDistData} layout="vertical" margin={{ left: 40, right: 40 }}>
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
                  width={140}
                />
                <Tooltip cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                <Bar dataKey="count" radius={[0, 10, 10, 0]} barSize={32}>
                  {paramDistData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.name === 'Not Recorded' ? '#cbd5e1' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
             {paramDistData.map((d, i) => (
               <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{d.name}</span>
                  <div className="flex items-end justify-between mt-1">
                    <span className="text-xl font-black text-slate-900">{d.count}</span>
                    <span className="text-xs font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-lg">
                      {formatPercent(d.count, filteredData.length)}
                    </span>
                  </div>
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* Reports Table Section */}
      <div className="pt-8 relative">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
        <Reports 
          reports={reports} 
          transporterFilter={transporterFilter}
          setTransporterFilter={setTransporterFilter}
        />
      </div>

      {/* Footer Branding */}
      <footer className="text-center py-10 opacity-50 flex items-center justify-center gap-2 grayscale">
         <Truck className="w-5 h-5" />
         <span className="text-xs font-bold tracking-widest uppercase">Intelligent Fleet Logistics &bull; System Monitoring</span>
      </footer>
    </div>
  );
};

export default ViewerDashboard;
