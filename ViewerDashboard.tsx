import React, { useMemo } from 'react';
import { ReportRow } from '../types';
import Reports from './Reports';

interface ViewerDashboardProps {
  reports: ReportRow[];
  transporterFilter: string;
  setTransporterFilter: (v: string) => void;
}

const StatCard = ({ label, value, sub, icon, colorClass }: any) => (
  <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex items-start justify-between hover:shadow-md transition-shadow">
    <div>
      <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">{label}</p>
      <h3 className="text-3xl font-extrabold text-slate-900 mt-1">{value}</h3>
      {sub && <p className="text-slate-500 text-sm mt-1 font-medium">{sub}</p>}
    </div>
    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colorClass}`}>
      {icon}
    </div>
  </div>
);

const ViewerDashboard: React.FC<ViewerDashboardProps> = ({ reports, transporterFilter, setTransporterFilter }) => {
  // 1. Filter reports for analysis based on current selection
  const filteredData = useMemo(() => {
    return transporterFilter 
      ? reports.filter(r => r.transporter_name === transporterFilter) 
      : reports;
  }, [reports, transporterFilter]);

  // 2. Compute Metrics
  const metrics = useMemo(() => {
    const total = filteredData.length;
    const evaluated = filteredData.filter(r => r.eval_score != null).length;
    const pending = total - evaluated;
    const baselines = filteredData.filter(r => r.doc_score != null && r.age_score != null).length;
    
    // Avg Score
    const scores = filteredData.map(r => r.eval_score).filter(s => s != null) as number[];
    const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';

    // Compliance (arbitrary definition: not DQ)
    const dqCount = filteredData.filter(r => r.eval_dq).length;
    const complianceRate = total > 0 ? ((total - dqCount) / total * 100).toFixed(1) + '%' : '-';

    return { total, evaluated, pending, baselines, avgScore, complianceRate };
  }, [filteredData]);

  // 3. Compute Chart Data
  const chartData = useMemo(() => {
    // Histogram
    const buckets = [
      { label: '0-40', min: 0, max: 40, count: 0, color: '#ef4444' }, // Red
      { label: '40-60', min: 40, max: 60, count: 0, color: '#f59e0b' }, // Amber
      { label: '60-80', min: 60, max: 80, count: 0, color: '#3b82f6' }, // Blue
      { label: '80-100', min: 80, max: 101, count: 0, color: '#10b981' }, // Green
    ];
    
    filteredData.forEach(r => {
      if (r.eval_score == null) return;
      const s = Number(r.eval_score);
      const b = buckets.find(x => s >= x.min && s < x.max);
      if (b) b.count++;
    });
    
    const maxBucketVal = Math.max(...buckets.map(b => b.count), 1);

    // Top Transporters (only if no filter selected, otherwise show just the one)
    const tMap = new Map<string, number>();
    filteredData.forEach(r => {
      tMap.set(r.transporter_name, (tMap.get(r.transporter_name) || 0) + 1);
    });
    
    const topTransporters = Array.from(tMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
      
    const maxTransporterVal = Math.max(...topTransporters.map(t => t.count), 1);

    return { buckets, maxBucketVal, topTransporters, maxTransporterVal };
  }, [filteredData]);

  const downloadCsv = () => {
    const header = ['transporter', 'vehicle_no', 'truck_type', 'driver_name', 'driver_mobile', 'sl_no', 'season', 'eval_score', 'eval_rank', 'eval_dq', 'eval_date', 'doc_score', 'age_score'];
    const rows = filteredData.map((r) => [
      r.transporter_name,
      r.vehicle_no,
      r.truck_type,
      r.driver_name,
      r.driver_mobile,
      r.sl_no,
      r.season,
      r.eval_score ?? '',
      r.eval_rank ?? '',
      r.eval_dq ?? '',
      r.eval_date ?? '',
      r.doc_score ?? '',
      r.age_score ?? '',
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transporter_report_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8 animate-fade-in-up">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
           <h1 className="text-4xl font-extrabold font-heading text-slate-900 tracking-tight">Dashboard</h1>
           <p className="text-slate-500 font-medium mt-2">Real-time performance analytics and fleet insights.</p>
        </div>
        <button 
          onClick={downloadCsv}
          className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-slate-200 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Export Data
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Total Fleet" 
          value={metrics.total} 
          sub={`${metrics.baselines} baselines set`}
          colorClass="bg-blue-100 text-blue-600"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 012-2v0a2 2 0 10-4 0v0a2 2 0 012 2z" /></svg>}
        />
        <StatCard 
          label="Evaluated" 
          value={metrics.evaluated} 
          sub={`${metrics.pending} pending`}
          colorClass="bg-purple-100 text-purple-600"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard 
          label="Avg Score" 
          value={metrics.avgScore} 
          sub="Across evaluations"
          colorClass="bg-emerald-100 text-emerald-600"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
        />
        <StatCard 
          label="Compliance" 
          value={metrics.complianceRate} 
          sub="Vehicles active"
          colorClass="bg-amber-100 text-amber-600"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score Distribution */}
        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
          <div className="mb-6">
            <h3 className="text-xl font-bold font-heading text-slate-900">Score Distribution</h3>
            <p className="text-slate-500 text-sm">Frequency of evaluation scores.</p>
          </div>
          <div className="h-64 flex items-end justify-between gap-2">
            {chartData.buckets.map((b, i) => {
               const heightPct = chartData.maxBucketVal > 0 ? (b.count / chartData.maxBucketVal) * 100 : 0;
               return (
                 <div key={i} className="flex-1 flex flex-col items-center group h-full justify-end">
                   <div className="relative w-full bg-slate-50 rounded-t-xl overflow-hidden flex items-end h-full">
                     <div 
                        className="w-full transition-all duration-1000 ease-out relative group-hover:opacity-90"
                        style={{ height: `${heightPct}%`, backgroundColor: b.color }}
                     >
                       <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs font-bold py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                         {b.count} vehicles
                       </div>
                     </div>
                   </div>
                   <p className="text-xs font-bold text-slate-400 mt-3">{b.label}</p>
                 </div>
               )
            })}
          </div>
        </div>

        {/* Top Transporters */}
        <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
          <div className="mb-6">
            <h3 className="text-xl font-bold font-heading text-slate-900">Fleet Composition</h3>
            <p className="text-slate-500 text-sm">Vehicles by transporter (Top 5).</p>
          </div>
          <div className="h-64 flex flex-col justify-center gap-4">
            {chartData.topTransporters.map((t, i) => {
              const widthPct = chartData.maxTransporterVal > 0 ? (t.count / chartData.maxTransporterVal) * 100 : 0;
              return (
                <div key={i} className="w-full group">
                  <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                    <span className="truncate max-w-[70%]">{t.name}</span>
                    <span>{t.count}</span>
                  </div>
                  <div className="h-3 w-full bg-slate-50 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out" 
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {chartData.topTransporters.length === 0 && (
              <p className="text-center text-slate-400 text-sm flex items-center justify-center h-full">No data available for current selection.</p>
            )}
          </div>
        </div>
      </div>

      {/* Reports Table */}
      <div className="border-t border-slate-200 pt-4">
        <Reports 
          reports={reports} 
          transporterFilter={transporterFilter}
          setTransporterFilter={setTransporterFilter}
        />
      </div>
    </div>
  );
};

export default ViewerDashboard;