
import React, { useEffect, useMemo, useState } from 'react';
import { Transporter, Vehicle, Baseline, Evaluation, UserRole } from '../types';
import { EVAL_CONFIG } from '../constants';
import { api } from '../api';

interface AuditorDashboardProps {
  transporters: Transporter[];
  vehicles: Vehicle[];
  baselines: Baseline[];
  setBaselines: React.Dispatch<React.SetStateAction<Baseline[]>>;
  evaluations: Evaluation[];
  setEvaluations: React.Dispatch<React.SetStateAction<Evaluation[]>>;
  season: string;
  addLog: (action: string) => void;
  refreshReports?: () => Promise<void>;
}

const AuditorDashboard: React.FC<AuditorDashboardProps> = ({ 
  transporters, vehicles, baselines, setBaselines, evaluations, setEvaluations, season, addLog, refreshReports 
}) => {
  const [activeTab, setActiveTab] = useState<'landing' | 'baseline' | 'evaluation'>('landing');
  const [selectedTransporter, setSelectedTransporter] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [evalPayload, setEvalPayload] = useState<Record<string, string | number | string[]>>({});
  const [incidentNote, setIncidentNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [rtoSelections, setRtoSelections] = useState<string[]>([]);
  const [accidentReasons, setAccidentReasons] = useState<string[]>([]);
  const docOptions = ['RC Status', 'Fitness Valid', 'Insurance Active', 'Permit Holder'];
  const [docChecks, setDocChecks] = useState<string[]>([]);
  const [ageSelection, setAgeSelection] = useState<number | null>(null);
  const [isEditingBaseline, setIsEditingBaseline] = useState<boolean>(true);
  const [fitnessExpiry, setFitnessExpiry] = useState<string>('');
  const [insuranceExpiry, setInsuranceExpiry] = useState<string>('');
  const [evalHistory, setEvalHistory] = useState<Evaluation[]>([]);
  const [selectedEvalId, setSelectedEvalId] = useState<string | null>(null);
  const [showEvalModal, setShowEvalModal] = useState<boolean>(false);
  const [historyPage, setHistoryPage] = useState<number>(0);
  const [historyDateFilter, setHistoryDateFilter] = useState<string>('');

  const currentHalfWindowRange = () => {
    const now = new Date();
    const day = now.getDate();
    const firstHalf = day <= 15;
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const start = firstHalf ? `${year}-${String(month).padStart(2, '0')}-01` : `${year}-${String(month).padStart(2, '0')}-16`;
    const endDay = firstHalf ? 15 : new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    return { start, end };
  };

  const normalizeEvals = (rows: any[]): Evaluation[] => {
    const mapped = rows.map((r: any) => ({
      id: String(r.id),
      vehicle_id: String(r.vehicle_id),
      season: r.season,
      score: Number(r.score),
      rank: r.rank_label || r.rank,
      dq: !!r.dq,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload || '{}') : r.payload || {},
      incidents: [],
      created_at: r.created_at || new Date().toISOString(),
    }));
    return mapped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 px-6 py-4 rounded-2xl shadow-2xl z-[100] text-white font-bold text-sm transition-all ${type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  useEffect(() => {
    const loadBaseline = async () => {
      if (!selectedVehicleId) return;
      try {
        const row = await api(`/vehicles/${selectedVehicleId}/baseline?season=${encodeURIComponent(season)}`);
        if (row && row.doc_score !== undefined) {
          const b: Baseline = {
            vehicle_id: selectedVehicleId,
            season: row.season,
            doc_score: row.doc_score,
            age_score: row.age_score,
            fitness_expiry: row.fitness_expiry ?? null,
            insurance_expiry: row.insurance_expiry ?? null,
          };
          setBaselines((prev) => [...prev.filter((x) => x.vehicle_id !== selectedVehicleId), b]);
          setDocChecks(row.doc_score === 10 ? [...docOptions] : []);
          setAgeSelection(row.age_score);
          setFitnessExpiry(row.fitness_expiry ? String(row.fitness_expiry).slice(0, 10) : '');
          setInsuranceExpiry(row.insurance_expiry ? String(row.insurance_expiry).slice(0, 10) : '');
          setIsEditingBaseline(false);
        }
      } catch (e) {
        // no baseline yet
        setDocChecks([]);
        setAgeSelection(null);
        setFitnessExpiry('');
        setInsuranceExpiry('');
        setIsEditingBaseline(true);
      }
    };
    void loadBaseline();
    const loadEvals = async () => {
      if (!selectedVehicleId) return;
      try {
        const rows = await api(`/vehicles/${selectedVehicleId}/evaluations?season=${encodeURIComponent(season)}`);
        const normalized = normalizeEvals(rows);
        setEvalHistory(normalized);
        setSelectedEvalId(null);
      } catch (e) {
        setEvalHistory([]);
        setSelectedEvalId(null);
      }
    };
    void loadEvals();
  }, [selectedVehicleId, setBaselines]);

  const seasonTransporters = useMemo(
    () => transporters.filter((t) => t.season === season),
    [transporters, season]
  );

  const seasonTransporterIds = useMemo(
    () => new Set(seasonTransporters.map((t) => t.id)),
    [seasonTransporters]
  );

  const seasonVehicles = useMemo(
    () => vehicles.filter((v) => seasonTransporterIds.has(v.transporter_id)),
    [vehicles, seasonTransporterIds]
  );

  const filteredVehicles = useMemo(() => {
    if (!selectedTransporter) return [];
    return seasonVehicles.filter(v => v.transporter_name === selectedTransporter);
  }, [selectedTransporter, seasonVehicles]);

  const currentVehicle = useMemo(() => {
    return seasonVehicles.find(v => v.id === selectedVehicleId);
  }, [selectedVehicleId, seasonVehicles]);

  const currentBaseline = useMemo(() => baselines.find((b) => b.vehicle_id === selectedVehicleId), [baselines, selectedVehicleId]);

  const currentEvaluation = useMemo(() => {
    if (!evalHistory.length) return null;
    const { start, end } = currentHalfWindowRange();
    return evalHistory.find((e) => {
      const evalDate = new Date(e.created_at).toISOString().slice(0, 10);
      return evalDate >= start && evalDate <= end;
    });
  }, [evalHistory]);

  const currentScore = useMemo(() => {
    let s = 0;
    if (currentBaseline) s += (currentBaseline.doc_score || 0) + (currentBaseline.age_score || 0);
    Object.values(evalPayload).forEach((val) => {
      if (typeof val === 'number') s += val;
    });
    return Math.min(100, Math.max(0, s));
  }, [evalPayload, currentBaseline]);

  const filteredHistory = useMemo(() => {
    return evalHistory.filter((e) => {
      if (!historyDateFilter) return true;
      const day = new Date(e.created_at).toISOString().slice(0, 10);
      return day === historyDateFilter;
    });
  }, [evalHistory, historyDateFilter]);

  const historyPageSize = 8;
  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistory.length / historyPageSize));
  const visibleHistory = useMemo(() => {
    const start = historyPage * historyPageSize;
    return filteredHistory.slice(start, start + historyPageSize);
  }, [filteredHistory, historyPage]);

  useEffect(() => {
    if (historyPage > totalHistoryPages - 1) {
      setHistoryPage(Math.max(0, totalHistoryPages - 1));
    }
  }, [filteredHistory, totalHistoryPages, historyPage]);

  const handleBaselineSave = async () => {
    if (!selectedVehicleId) return;
    if (ageSelection === null) {
      alert('Select vehicle age');
      return;
    }
    const docScore = docChecks.length === docOptions.length ? 10 : 0;
    const ageScore = ageSelection;
    try {
      await api(`/vehicles/${selectedVehicleId}/baseline`, {
        method: 'POST',
        body: {
          season,
          doc_score: docScore,
          age_score: ageScore,
          fitness_expiry: fitnessExpiry || null,
          insurance_expiry: insuranceExpiry || null,
        },
      });
      const newBaseline: Baseline = {
        vehicle_id: selectedVehicleId,
        season,
        doc_score: docScore,
        age_score: ageScore,
        fitness_expiry: fitnessExpiry || null,
        insurance_expiry: insuranceExpiry || null,
      };
      setBaselines((prev) => [...prev.filter((b) => b.vehicle_id !== selectedVehicleId), newBaseline]);
      addLog(`Saved baseline for ${currentVehicle?.vehicle_no}`);
      setIsEditingBaseline(false);
    } catch (e) {
      alert('Unable to save baseline');
    }
  };

  const handleEvalSubmit = async () => {
    if (!selectedVehicleId || !currentVehicle) return;
    const baseline = currentBaseline;
    if (!baseline) return showToast('Please complete Baseline Audit first!', 'error');

    setIsSubmitting(true);
    let dq = false;
    const allItems = EVAL_CONFIG.flatMap((s) => s.items);
    const requiredItems = allItems.filter((item) => item.id !== 'accident_reason');
    if (!requiredItems.every((item) => evalPayload[item.id] !== undefined)) {
      showToast('Please complete all scoring fields.', 'error');
      setIsSubmitting(false);
      return;
    }

    Object.values(evalPayload).forEach((val) => {
      if (val === 'DQ') dq = true;
    });
    let total = (baseline.doc_score || 0) + (baseline.age_score || 0);
    Object.values(evalPayload).forEach((val) => { if (typeof val === 'number') total += val; });
    if (dq) total -= 15;
    const rank = dq ? 'DISQUALIFIED' : total >= 85 ? 'EXEMPLARY' : total >= 70 ? 'STANDARD' : 'NEEDS IMPROVEMENT';

    const newEval: Evaluation = {
      id: Math.random().toString(36).substr(2, 9),
      vehicle_id: selectedVehicleId,
      season,
      score: total,
      rank,
      dq,
      payload: evalPayload,
      incidents: incidentNote ? [{ note: incidentNote, severity: 'user' }] : [],
      created_at: new Date().toISOString(),
    };

    try {
      console.log('Submitting evaluation with payload:', evalPayload);
      console.log('RTO selections:', rtoSelections);
      console.log('Accident reasons:', accidentReasons);
      const result = await api(`/vehicles/${selectedVehicleId}/evaluations`, {
        method: 'POST',
        body: { season, score: total, rank, dq, payload: evalPayload, incidents: incidentNote ? [{ note: incidentNote, severity: 'user' }] : [] },
      });
      setEvaluations((prev) => [...prev, newEval]);
      addLog(`${result.updated ? 'Updated' : 'Submitted'} evaluation for ${currentVehicle.vehicle_no}: ${total} pts`);
      showToast(result.updated ? 'Evaluation updated successfully!' : 'Evaluation submitted successfully!', 'success');
      setAiInsight('Insights disabled (AI calls removed).');
      refreshReports && refreshReports();
      const rows = await api(`/vehicles/${selectedVehicleId}/evaluations?season=${encodeURIComponent(season)}`);
      const normalized = normalizeEvals(rows);
      setEvalHistory(normalized);
      setEvalPayload({});
      setRtoSelections([]);
      setAccidentReasons([]);
      setIncidentNote('');
      setShowEvalModal(false);
      setSelectedEvalId(null);
    } catch (e) {
      console.error('Evaluation submission error:', e);
      showToast('Unable to save evaluation', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!accidentReasons.length) {
      setEvalPayload((prev) => {
        const next = { ...prev };
        delete next.accident_reason;
        delete next.accident_reason_list;
        return next;
      });
      return;
    }
    setEvalPayload((prev) => ({ ...prev, accident_reason: [...accidentReasons], accident_reason_list: [...accidentReasons] }));
  }, [accidentReasons]);

  useEffect(() => {
    const RTO_NONE = 'none';
    if (!rtoSelections.length) {
      setEvalPayload((prev) => {
        const next = { ...prev };
        delete next.rto;
        delete next.rto_document;
        return next;
      });
      return;
    }

    const hasNone = rtoSelections.includes(RTO_NONE);
    const violationCount = hasNone ? 0 : rtoSelections.filter((v) => v !== RTO_NONE).length;
    const score = hasNone ? 10 : (violationCount >= 4 ? 0 : 10 - 2 * violationCount);

    setEvalPayload((prev) => ({ ...prev, rto: score, rto_document: [...rtoSelections] }));
  }, [rtoSelections]);
  const resetForm = () => {
    setSelectedTransporter('');
    setSelectedVehicleId('');
    setEvalPayload({});
    setRtoSelections([]);
    setAccidentReasons([]);
    setIncidentNote('');
    setAiInsight(null);
    setActiveTab('landing');
  };

  if (activeTab === 'landing') {
    return (
      <div className="max-w-5xl mx-auto space-y-12 py-10 animate-fade-in-up">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-extrabold font-heading text-slate-900 tracking-tight">Audit Control Center</h2>
          {/* <p className="text-slate-500 max-w-lg mx-auto font-medium">Streamline fleet evaluations with real-time scoring and AI-driven performance intelligence.</p> */}
        </div>

        <div className="grid md:grid-cols-2 gap-8 px-4">
          <button 
            onClick={() => setActiveTab('baseline')}
            className="group relative flex flex-col p-10 rounded-[40px] bg-white border border-slate-200 card-shadow hover:border-blue-500 transition-all duration-500 text-left overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-50/50 rounded-full -mr-24 -mt-24 transition-transform group-hover:scale-125 duration-700"></div>
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200 mb-8 transition-transform group-hover:scale-110">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
              <h3 className="text-2xl font-bold font-heading mb-3 text-slate-900">Baseline Audit</h3>
              <p className="text-slate-500 mb-8 leading-relaxed">Establish the technical foundation. Verify vehicle age, registration, and seasonal compliance documents.</p>
              <div className="flex items-center text-sm font-black text-blue-600 uppercase tracking-widest group-hover:gap-4 transition-all">
                Initiate Audit <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </div>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('evaluation')}
            className="group relative flex flex-col p-10 rounded-[40px] bg-white border border-slate-200 card-shadow hover:border-emerald-500 transition-all duration-500 text-left overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-50/50 rounded-full -mr-24 -mt-24 transition-transform group-hover:scale-125 duration-700"></div>
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-200 mb-8 transition-transform group-hover:scale-110">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <h3 className="text-2xl font-bold font-heading mb-3 text-slate-900">Performance Eval</h3>
              <p className="text-slate-500 mb-8 leading-relaxed">Score dynamic operational metrics. Assess safety, punctuality, and reliability for seasonal rankings.</p>
              <div className="flex items-center text-sm font-black text-emerald-600 uppercase tracking-widest group-hover:gap-4 transition-all">
                Begin Evaluation <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 animate-fade-in-up">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <button onClick={resetForm} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
          Exit Session
        </button>
        <div className="flex items-center gap-3">
          <div className="px-4 py-1.5 rounded-full bg-white border border-slate-200 shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2">Session Type</span>
            <span className={`text-[10px] font-bold uppercase ${activeTab === 'baseline' ? 'text-blue-600' : 'text-emerald-600'}`}>
              {activeTab === 'baseline' ? 'Baseline Audit' : 'Periodic Eval'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Selection Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Transporter</label>
              <select 
                className="w-full h-14 px-5 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer"
                value={selectedTransporter}
                onChange={(e) => { setSelectedTransporter(e.target.value); setSelectedVehicleId(''); }}
              >
                <option value="">Select Transporter...</option>
                {seasonTransporters.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vehicle Unit</label>
              <select 
                className="w-full h-14 px-5 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                value={selectedVehicleId}
                disabled={!selectedTransporter}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <option value="">Choose Plate No...</option>
                {filteredVehicles.map(v => <option key={v.id} value={v.id}>{v.vehicle_no}</option>)}
              </select>
            </div>
          </div>

          {currentVehicle && (
            <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 transition-transform group-hover:scale-110">
                <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
              </div>
              <div className="relative z-10 space-y-6">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Selected Unit</span>
                  <h4 className="text-3xl font-bold font-heading">{currentVehicle.vehicle_no}</h4>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-6">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Operator</span>
                    <p className="text-xs font-bold truncate">{currentVehicle.driver_name}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Chassis Type</span>
                    <p className="text-xs font-bold">{currentVehicle.truck_type}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-8">
          {!selectedVehicleId ? (
            <div className="h-[400px] flex flex-col items-center justify-center rounded-[40px] border-2 border-dashed border-slate-200 bg-white/50 text-slate-400 group">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              </div>
              <p className="text-sm font-bold tracking-tight text-slate-500">Await unit selection to proceed...</p>
            </div>
          ) : activeTab === 'baseline' ? (
            <div className="bg-white rounded-[40px] border border-slate-200 p-10 shadow-sm space-y-10">
               <div className="flex items-center justify-between">
                 <h3 className="text-2xl font-bold font-heading text-slate-900">Documentation Matrix</h3>
                 <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-3 py-1 rounded-full uppercase">One-Time Check</span>
               </div>
               
               <div className="space-y-8">
                 <div className="grid sm:grid-cols-2 gap-4">
                   {docOptions.map(doc => (
                     <label key={doc} className={`flex items-center p-5 rounded-[24px] border ${docChecks.includes(doc) ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-slate-50'} cursor-pointer transition-all group`}>
                       <input
                         type="checkbox"
                         className="w-5 h-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                         checked={docChecks.includes(doc)}
                         disabled={!isEditingBaseline}
                         onChange={(e) => {
                           if (e.target.checked) {
                             setDocChecks([...docChecks, doc]);
                           } else {
                             setDocChecks(docChecks.filter((d) => d !== doc));
                           }
                         }}
                       />
                       <span className="ml-4 text-sm font-bold text-slate-700 group-hover:text-slate-900">{doc}</span>
                     </label>
                   ))}
                 </div>

                 <div className="space-y-4">
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Asset Age Factor</p>
                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                       {[
                       { label: 'Prime (<5y)', val: 2, color: 'emerald' },
                       { label: 'Mid (5-10y)', val: 1, color: 'blue' },
                       { label: 'Vintage (>10y)', val: 0, color: 'slate' }
                     ].map(age => (
                       <label 
                        key={age.label}
                        className={`p-6 rounded-[28px] border-2 ${ageSelection === age.val ? 'border-slate-900 bg-slate-900 text-white' : 'border-transparent bg-slate-50'} hover:border-blue-500 transition-all text-center group cursor-pointer`}
                       >
                         <input
                           type="radio"
                           name="age-band"
                           value={age.val}
                           className="hidden"
                           disabled={!isEditingBaseline}
                           checked={ageSelection === age.val}
                           onChange={() => setAgeSelection(age.val)}
                         />
                         <div className={`text-[10px] font-black uppercase mb-2 ${ageSelection === age.val ? 'text-white/80' : 'text-slate-400 group-hover:text-blue-600'}`}>Weight: {age.val}</div>
                         <div className={`text-sm font-bold ${ageSelection === age.val ? 'text-white' : 'text-slate-900'}`}>{age.label}</div>
                       </label>
                     ))}
                   </div>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <label className="flex flex-col gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                     Fitness expiry
                     <input
                       type="date"
                       value={fitnessExpiry}
                       disabled={!isEditingBaseline}
                       onChange={(e) => setFitnessExpiry(e.target.value)}
                       className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none disabled:opacity-50"
                     />
                   </label>
                   <label className="flex flex-col gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                     Insurance expiry
                     <input
                       type="date"
                       value={insuranceExpiry}
                       disabled={!isEditingBaseline}
                       onChange={(e) => setInsuranceExpiry(e.target.value)}
                       className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none disabled:opacity-50"
                     />
                   </label>
                 </div>

                 <div className="flex items-center justify-between gap-3">
                   {currentBaseline && !isEditingBaseline ? (
                     <>
                       <div className="text-sm font-bold text-slate-600">
                         Saved: docs {currentBaseline.doc_score}/10 · age {currentBaseline.age_score}
                         {currentBaseline.fitness_expiry ? ` · fitness ${String(currentBaseline.fitness_expiry).slice(0, 10)}` : ''}
                         {currentBaseline.insurance_expiry ? ` · insurance ${String(currentBaseline.insurance_expiry).slice(0, 10)}` : ''}
                       </div>
                       <div className="flex gap-2">
                         <button
                           type="button"
                           onClick={() => setIsEditingBaseline(true)}
                           className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border bg-white text-slate-600 border-slate-200"
                         >
                           Edit baseline
                         </button>
                       </div>
                     </>
                   ) : (
                     <button
                       type="button"
                       onClick={handleBaselineSave}
                       disabled={ageSelection === null}
                       className="px-5 py-3 rounded-2xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50"
                     >
                       Submit baseline
                     </button>
                   )}
                 </div>
               </div>
            </div>
          ) : (
            <div className="space-y-6 pb-12">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">15-day cycle</p>
                  <h4 className="text-2xl font-bold text-slate-900">Evaluation Workspace</h4>
                </div>
                <button
                  className="relative overflow-hidden px-6 py-4 rounded-[18px] bg-gradient-to-r from-slate-900 via-blue-700 to-emerald-500 text-white text-xs font-black uppercase tracking-[0.25em] shadow-2xl active:scale-[0.98] transition-all"
                  onClick={() => {
                    setSelectedEvalId(null);
                    if (currentEvaluation) {
                      // Edit mode - pre-fill form
                      setEvalPayload(currentEvaluation.payload || {});
                      setRtoSelections((currentEvaluation.payload?.rto_document as string[]) || []);
                      setAccidentReasons((currentEvaluation.payload?.accident_reason_list as string[]) || (currentEvaluation.payload?.accident_reason as string[]) || []);
                      setIncidentNote(currentEvaluation.incidents?.[0]?.note || '');
                    } else {
                      // New mode - clear form
                      setEvalPayload({});
                      setRtoSelections([]);
                      setAccidentReasons([]);
                      setIncidentNote('');
                    }
                    setShowEvalModal(true);
                  }}
                >
                  <span className="relative z-10 flex items-center gap-3">{currentEvaluation ? 'Edit Evaluation' : 'Start Evaluation'} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg></span>
                  <div className="absolute inset-0 bg-white/10 backdrop-blur-sm opacity-0 hover:opacity-100 transition-opacity"></div>
                </button>
              </div>

              <div className="bg-white rounded-[32px] border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">History</p>
                    <h4 className="text-lg font-bold text-slate-900">Current 15-day period evaluation</h4>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="date"
                      value={historyDateFilter}
                      onChange={(e) => setHistoryDateFilter(e.target.value)}
                      className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none"
                    />
                    {historyDateFilter && (
                      <button
                        className="px-3 py-2 text-[10px] font-black uppercase tracking-widest border rounded-xl bg-white text-slate-600 border-slate-200"
                        onClick={() => setHistoryDateFilter('')}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest font-black text-slate-400 bg-slate-50">
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Score</th>
                        <th className="px-4 py-3 text-left">Rank</th>
                        <th className="px-4 py-3 text-left">DQ</th>
                        <th className="px-4 py-3 text-left">View</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleHistory.map((e) => {
                        const { start, end } = currentHalfWindowRange();
                        const evalDate = new Date(e.created_at).toISOString().slice(0, 10);
                        const isCurrent = evalDate >= start && evalDate <= end;
                        return (
                          <tr key={e.id} className={`hover:bg-slate-50 transition-all ${isCurrent ? 'bg-blue-50' : ''}`}>
                            <td className="px-4 py-3 text-sm font-bold text-slate-900">
                              {new Date(e.created_at).toLocaleString()}
                              {isCurrent && <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-500 text-white text-[9px] font-black uppercase">Current</span>}
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-slate-900">{e.score}</td>
                            <td className="px-4 py-3 text-sm font-bold text-slate-700">{e.rank}</td>
                            <td className={`px-4 py-3 text-sm font-bold ${e.dq ? 'text-red-600' : 'text-slate-600'}`}>{e.dq ? 'Yes' : 'No'}</td>
                            <td className="px-4 py-3">
                              <button
                                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${selectedEvalId === e.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}
                                onClick={() => setSelectedEvalId(e.id)}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {visibleHistory.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-sm font-bold text-slate-400">No evaluations in this range.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="text-sm text-slate-500 font-medium">{filteredHistory.length} record(s) · records are expected every 15 days.</div>
              </div>

              {showEvalModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                  <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-white/40 bg-white/70 shadow-[0_20px_120px_rgba(15,23,42,0.35)]">
                    <button
                      className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/80 border border-slate-200 text-slate-600 hover:bg-white shadow-sm"
                      onClick={() => setShowEvalModal(false)}
                    >
                      ✕
                    </button>
                    <div className="p-8 space-y-8">
                      <div className="sticky top-0 z-10 bg-white/70 backdrop-blur border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="relative w-14 h-14 rounded-full flex items-center justify-center text-white font-black font-heading text-lg bg-white">
                            <svg className="absolute inset-0 w-full h-full -rotate-90">
                              <circle cx="28" cy="28" r="24" fill="transparent" stroke="#e2e8f0" strokeWidth="6" />
                              <circle cx="28" cy="28" r="24" fill="transparent" stroke={currentScore >= 70 ? '#10b981' : '#3b82f6'} strokeWidth="6" strokeDasharray={`${2 * Math.PI * 24}`} strokeDashoffset={`${2 * Math.PI * 24 * (1 - currentScore / 100)}`} strokeLinecap="round" />
                            </svg>
                            <span className="text-slate-900">{currentScore}</span>
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Real-Time Score</p>
                            <p className="text-xs font-bold text-slate-700 mt-1">Aggregated performance index</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Season</p>
                          <p className="text-sm font-bold text-slate-900 mt-1">{season}</p>
                        </div>
                      </div>

                      <div className="bg-white/70 backdrop-blur rounded-[28px] border border-slate-100 p-8 shadow-sm space-y-10">
                        {EVAL_CONFIG.map((section, idx) => (
                          <div key={idx} className="space-y-6">
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs font-black">
                                {idx + 1}
                              </div>
                              <h4 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">{section.title}</h4>
                            </div>
                            <div className="grid gap-8 pl-12 border-l border-slate-100">
                              {section.items.map(item => (
                                <div key={item.id} className="space-y-4">
                                  <p className="text-sm font-bold text-slate-800">{item.label}</p>
                                  {item.id === 'rto' ? (
                                    <div className="grid sm:grid-cols-2 gap-3">
                                      {item.options.map((opt, oIdx) => {
                                        const value = String(opt.val);
                                        const isNone = value === 'none';
                                        const checked = rtoSelections.includes(value);
                                        return (
                                          <label
                                            key={oIdx}
                                            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                              checked
                                                ? 'bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-200'
                                                : 'bg-white/80 border-slate-100 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => {
                                                setRtoSelections((prev) => {
                                                  if (isNone) {
                                                    return checked ? [] : ['none'];
                                                  }
                                                  const next = prev.filter((v) => v !== 'none');
                                                  if (checked) return next.filter((v) => v !== value);
                                                  return [...next, value];
                                                });
                                              }}
                                              className="w-4 h-4 rounded border-slate-300 text-slate-900"
                                            />
                                            <span>{opt.label}</span>
                                          </label>
                                        );
                                      })}
                                      {rtoSelections.length > 0 && (
                                        <div className="sm:col-span-2 text-[11px] font-semibold text-slate-500">
                                          Score: {
                                            rtoSelections.includes('none')
                                              ? 10
                                              : (rtoSelections.length >= 4 ? 0 : 10 - 2 * rtoSelections.length)
                                          }
                                        </div>
                                      )}
                                    </div>
                                  ) : item.id === 'accident_reason' ? (
                                    <div className="grid sm:grid-cols-2 gap-3">
                                      {item.options.map((opt, oIdx) => {
                                        const value = String(opt.val);
                                        const checked = accidentReasons.includes(value);
                                        return (
                                          <label
                                            key={oIdx}
                                            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                              checked
                                                ? 'bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-200'
                                                : 'bg-white/80 border-slate-100 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() => {
                                                setAccidentReasons((prev) =>
                                                  checked ? prev.filter((v) => v !== value) : [...prev, value]
                                                );
                                              }}
                                              className="w-4 h-4 rounded border-slate-300 text-slate-900"
                                            />
                                            <span>{opt.label}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap gap-2.5">
                                      {item.options.map((opt, oIdx) => (
                                        <button
                                          key={oIdx}
                                          onClick={() => setEvalPayload(prev => ({ ...prev, [item.id]: opt.val }))}
                                          className={`px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-wider border-2 transition-all ${
                                            evalPayload[item.id] === opt.val 
                                              ? 'bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-200' 
                                              : 'bg-white/80 border-slate-100 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                                          }`}
                                        >
                                          {opt.label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        <div className="pt-8 border-t border-slate-100 space-y-4">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Incident Ledger</label>
                          </div>
                          <textarea 
                            className="w-full px-6 py-5 rounded-[28px] border border-slate-200 bg-white/80 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all text-sm min-h-[140px] font-medium placeholder:text-slate-300"
                            placeholder="Record safety violations, mechanical failures, or noteworthy delays..."
                            value={incidentNote}
                            onChange={(e) => setIncidentNote(e.target.value)}
                          />
                        </div>

                        <button 
                          onClick={handleEvalSubmit}
                          disabled={isSubmitting}
                          className="w-full relative group overflow-hidden bg-slate-900 text-white font-black uppercase tracking-[0.2em] py-5 rounded-[28px] shadow-2xl transition-all active:scale-[0.98] disabled:opacity-50"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                          <span className="relative z-10 flex items-center justify-center gap-3">
                            {isSubmitting ? 'Computing Final Rank...' : 'Submit Evaluation'}
                            {!isSubmitting && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                          </span>
                        </button>

                        {aiInsight && (
                          <div className="mt-8 relative animate-fade-in-up">
                            <div className="absolute -inset-2 bg-gradient-to-r from-blue-500 to-emerald-400 rounded-[32px] blur-xl opacity-20"></div>
                            <div className="relative bg-white/80 border border-slate-100 p-8 rounded-[28px] shadow-2xl space-y-6">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-emerald-500 flex items-center justify-center text-white shadow-lg">
                                     <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/></svg>
                                  </div>
                                  <div>
                                    <h5 className="text-lg font-bold font-heading text-slate-900 leading-none">AI Insight Report</h5>
                                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Intelligent Analysis Active</p>
                                  </div>
                                </div>
                              </div>
                              <div className="text-slate-600 text-sm leading-relaxed prose prose-slate">
                                {aiInsight}
                              </div>
                              <button 
                               onClick={resetForm}
                               className="w-full py-4 bg-slate-50 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-colors"
                              >
                                Close Analysis & Finish
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedEvalId && (
                <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                  <div className="relative w-full max-w-4xl max-h-[80vh] overflow-y-auto bg-white/80 backdrop-blur rounded-[28px] border border-slate-200 shadow-[0_20px_120px_rgba(15,23,42,0.35)] p-8">
                    <button
                      className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 border border-slate-200 text-slate-600 hover:bg-white"
                      onClick={() => setSelectedEvalId(null)}
                    >
                      ✕
                    </button>
                    {(() => {
                      const e = evalHistory.find((x) => x.id === selectedEvalId);
                      if (!e) return null;
                      return (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Evaluation Detail</p>
                              <h4 className="text-lg font-bold text-slate-900">{new Date(e.created_at).toLocaleString()}</h4>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${e.dq ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{e.dq ? 'DQ' : e.rank}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-700 font-bold">
                            <span>Score: {e.score}</span>
                            <span className="text-slate-400">|</span>
                            <span>Rank: {e.rank}</span>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-3">
                            {Object.entries(e.payload || {}).map(([k, v]) => (
                              <div key={k} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-700">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{k}</div>
                                <div className="font-bold">{String(v)}</div>
                              </div>
                            ))}
                            {(!e.payload || Object.keys(e.payload).length === 0) && (
                              <div className="text-sm text-slate-400">No payload recorded.</div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditorDashboard;
