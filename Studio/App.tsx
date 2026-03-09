
import React, { useState, useEffect, useCallback } from 'react';
import { User, UserRole, Transporter, Vehicle, Baseline, Evaluation, AuditLog, ReportRow, ConsolidatedReportRow } from './types';
import Login from './components/Login';
import AuditorDashboard from './components/AuditorDashboard';
import AdminDashboard from './components/AdminDashboard';
import Header from './components/Header';
import { api } from './api';
import Reports from './components/Reports';
import TransportersPage from './components/TransportersPage.tsx';
import ViewerDashboard from './components/ViewerDashboard';
import GenerateReport from './components/GenerateReport';


const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  // Initialize season from localStorage or default to SS26-27
  const [season, setSeason] = useState(() => {
    try {
      const stored = localStorage.getItem('activeSeason');
      return stored || 'SS26-27';
    } catch {
      return 'SS26-27';
    }
  });
  const [transporters, setTransporters] = useState<Transporter[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [windowedReports, setWindowedReports] = useState<ConsolidatedReportRow[]>([]);
  const [view, setView] = useState<'dashboard' | 'reports' | 'transporters' | 'generate-report'>('dashboard');
  const [reportFilter, setReportFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedSeason, setAppliedSeason] = useState<string>('SS26-27');
  const [appliedFromDate, setAppliedFromDate] = useState<string>('');
  const [appliedToDate, setAppliedToDate] = useState<string>('');

  const currentHalfWindowRange = useCallback(() => {
    const now = new Date();
    const day = now.getDate();
    const firstHalf = day <= 15;
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const start = firstHalf
      ? `${year}-${String(month).padStart(2, '0')}-01`
      : `${year}-${String(month).padStart(2, '0')}-16`;
    const endDay = firstHalf ? 15 : new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    return { start, end };
  }, []);

  const normalizeRole = (role: string): UserRole => {
    if (role === 'viewer') return UserRole.VIEWER;
    if (role === 'auditor') return UserRole.AUDITOR;
    return UserRole.ADMIN; // default fallback; legacy superadmin collapses into admin
  };

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        if (parsed && parsed.id && parsed.role) {
          setUser({ ...parsed, role: normalizeRole(parsed.role) as UserRole });
        }
      }
    } catch (e) {
      console.warn('Storage access restricted or invalid data found', e);
    }
  }, []);

  // Save season to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('activeSeason', season);
    } catch (e) {
      console.warn('Failed to save season to localStorage', e);
    }
  }, [season]);

  useEffect(() => {
    if (!user) return;
    // Ensure landing view matches role every time user state changes
    setView(user.role === UserRole.VIEWER ? 'reports' : 'dashboard');
    loadData();
    loadLogs();
    if (user.role === UserRole.VIEWER) {
      setAppliedSeason(season);
      setAppliedFromDate(fromDate);
      setAppliedToDate(toDate);
      loadReports({ season, from: fromDate, to: toDate, withWindowed: true });
    } else if (user.role === UserRole.AUDITOR) {
      const { start, end } = currentHalfWindowRange();
      loadReports({ season, from: start, to: end });
    } else {
      loadReports({ season });
    }
  }, [user]);

  const loadData = useCallback(async () => {
    try {
      const tRows = await api('/transporters');
      const vehiclesAgg: Vehicle[] = [];
      for (const t of tRows) {
        const vRows = await api(`/transporters/${t.id}/vehicles`);
        vRows.forEach((v: any) => {
          vehiclesAgg.push({
            id: String(v.id),
            vehicle_no: v.vehicle_no,
            truck_type: v.truck_type || '',
            driver_name: v.driver_name || '',
            driver_mobile: v.driver_mobile || '',
            sl_no: v.sl_no || '',
            transporter_id: String(v.transporter_id),
            transporter_name: t.name,
          });
        });
      }
      const tWithCounts = tRows.map((t: any) => ({
        id: String(t.id),
        name: t.name,
        season: t.season,
        vehicleCount: vehiclesAgg.filter((v) => v.transporter_id === String(t.id)).length,
      }));
      setTransporters(tWithCounts);
      setVehicles(vehiclesAgg);
    } catch (err) {
      console.error('Failed to load data', err);
    }
  }, []);

  type ReportFilters = { season?: string; from?: string; to?: string; withWindowed?: boolean };

  const buildQuery = (filters?: ReportFilters) => {
    const params = new URLSearchParams();
    if (filters?.season) params.set('season', filters.season);
    if (filters?.from) params.set('from', filters.from);
    if (filters?.to) params.set('to', filters.to);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  };

  const loadReports = useCallback(async (filters?: ReportFilters) => {
    try {
      const query = buildQuery(filters);
      const rows = await api(`/reports/latest${query}`);
      setReports(
        rows.map((r: any) => ({
          vehicle_id: String(r.vehicle_id),
          vehicle_no: r.vehicle_no,
          truck_type: r.truck_type || '',
          driver_name: r.driver_name || '',
          driver_mobile: r.driver_mobile || '',
          sl_no: r.sl_no || '',
          transporter_id: String(r.transporter_id),
          transporter_name: r.transporter_name,
          season: r.season,
          eval_score: r.eval_score == null ? null : Number(r.eval_score),
          eval_rank: r.eval_rank,
          eval_dq: r.eval_dq,
          eval_date: r.eval_date,
          eval_payload: typeof r.eval_payload === 'string' ? (() => { try { return JSON.parse(r.eval_payload || '{}'); } catch { return {}; } })() : (r.eval_payload || {}),
          doc_score: r.doc_score == null ? null : Number(r.doc_score),
          age_score: r.age_score == null ? null : Number(r.age_score),
        }))
      );

      if (filters?.withWindowed) {
        const seasonForWindow = filters.season || season;
        if (seasonForWindow) {
          const windowParams = new URLSearchParams();
          windowParams.set('season', seasonForWindow);
          if (filters.from) windowParams.set('from', filters.from);
          if (filters.to) windowParams.set('to', filters.to);
          const windowed = await api(`/reports/windowed-summary?${windowParams.toString()}`);
          setWindowedReports(
            (windowed || []).map((r: any) => ({
              vehicle_id: String(r.vehicle_id),
              vehicle_no: r.vehicle_no,
              truck_type: r.truck_type || '',
              driver_name: r.driver_name || '',
              driver_mobile: r.driver_mobile || '',
              sl_no: r.sl_no || '',
              transporter_id: String(r.transporter_id),
              transporter_name: r.transporter_name,
              season: r.season,
              eval_avg_score: r.eval_avg_score == null ? null : Number(r.eval_avg_score),
              eval_count: Number(r.eval_count || 0),
              dq_count: Number(r.dq_count || 0),
              last_eval_rank: r.last_eval_rank,
              last_eval_dq: r.last_eval_dq,
              last_eval_date: r.last_eval_date,
              doc_score: r.doc_score == null ? null : Number(r.doc_score),
              age_score: r.age_score == null ? null : Number(r.age_score),
            }))
          );
        }
      }
    } catch (e) {
      /* non-blocking */
    }
  }, [season]);

  const refreshViewerReports = useCallback(async () => {
    setAppliedSeason(season);
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    await loadReports({ season, from: fromDate, to: toDate, withWindowed: true });
  }, [loadReports, season, fromDate, toDate]);

  const refreshSeasonReports = useCallback(async () => {
    await loadReports({ season });
  }, [loadReports, season]);

  const refreshAuditorReports = useCallback(async () => {
    const { start, end } = currentHalfWindowRange();
    await loadReports({ season, from: start, to: end });
  }, [loadReports, season, currentHalfWindowRange]);

  const loadLogs = useCallback(async () => {
    try {
      const rows = await api('/logs');
      setLogs(
        rows.map((r: any) => ({
          id: String(r.id),
          timestamp: r.created_at,
          who: r.who,
          role: r.role,
          action: r.action,
        }))
      );
    } catch (e) {
      /* non-blocking */
    }
  }, []);

  const addLog = useCallback((action: string) => {
    const newLog: AuditLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      who: user?.name || 'Unknown',
      role: (user?.role as UserRole) || UserRole.AUDITOR,
      action,
    };
    setLogs((prev) => [newLog, ...prev]);
    void api('/logs', { method: 'POST', body: { who: user?.name || '', role: user?.role || '', action } }).catch(() => {});
  }, [user]);

  const handleAdminSeasonSwitch = useCallback(async () => {
    addLog(`Updated active season to ${season}`);
    await loadReports({ season });
  }, [addLog, loadReports, season]);

  const handleLogin = (u: User) => {
    const normalized = { ...u, role: normalizeRole(u.role) };
    setUser(normalized);
    setView(normalized.role === UserRole.VIEWER ? 'reports' : 'dashboard');
    try {
      localStorage.setItem('user', JSON.stringify(normalized));
    } catch (e) {
      console.warn('Could not save session to local storage', e);
    }
    addLog(`Logged in as ${normalized.role}`);
  };

  const handleLogout = () => {
    addLog('Logged out');
    setUser(null);
    setView('dashboard');
    try {
      localStorage.removeItem('user');
    } catch (e) {
      // Ignored
    }
  };

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const canViewDashboard = user.role === UserRole.AUDITOR || user.role === UserRole.ADMIN;

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        user={user}
        season={season}
        onLogout={handleLogout}
        view={view}
        canViewDashboard={canViewDashboard}
        onNavigate={(nextView) => setView(nextView)}
      />
      <main className="flex-1 container mx-auto p-4 md:p-6 pb-20">
        {view === 'dashboard' && user.role === UserRole.AUDITOR && (
          <AuditorDashboard 
            transporters={transporters} 
            vehicles={vehicles}
            baselines={baselines}
            setBaselines={setBaselines}
            evaluations={evaluations}
            setEvaluations={setEvaluations}
            season={season}
            addLog={addLog}
            refreshReports={refreshAuditorReports}
          />
        )}
        {view === 'dashboard' && user.role === UserRole.ADMIN && (
          <AdminDashboard 
            season={season} 
            setSeason={setSeason}
            transporters={transporters}
            setTransporters={setTransporters}
            vehicles={vehicles}
            setVehicles={setVehicles}
            logs={logs}
            reports={reports}
            addLog={addLog}
            onSwitchSeason={handleAdminSeasonSwitch}
          />
        )}

        {view === 'transporters' && canViewDashboard && (
          <TransportersPage vehicles={vehicles} transporters={transporters} season={season} />
        )}

        {view === 'reports' && (user.role === UserRole.AUDITOR || user.role === UserRole.ADMIN) && (
          <Reports reports={reports} transporterFilter={reportFilter} setTransporterFilter={setReportFilter} />
        )}
        {view === 'reports' && user.role === UserRole.VIEWER && (
          <ViewerDashboard 
            reports={reports} 
            windowedReports={windowedReports}
            transporterFilter={reportFilter} 
            setTransporterFilter={setReportFilter}
            season={season}
            appliedSeason={appliedSeason}
            appliedFromDate={appliedFromDate}
            appliedToDate={appliedToDate}
            setSeason={setSeason}
            fromDate={fromDate}
            toDate={toDate}
            setFromDate={setFromDate}
            setToDate={setToDate}
            refreshReports={refreshViewerReports}
          />
        )}
        {view === 'generate-report' && (
          <GenerateReport
            season={season}
            setSeason={setSeason}
            userRole={user.role}
          />
        )}
      </main>
      
      <div id="toast-container" className="fixed bottom-4 right-4 z-50"></div>
    </div>
  );
};

export default App;
