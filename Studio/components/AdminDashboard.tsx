
import React, { useEffect, useMemo, useState } from 'react';
import { Transporter, Vehicle, AuditLog, User, UserRole, ReportRow } from '../types';
import { api } from '../api';
import { SEASON_OPTIONS } from '../constants';

interface AdminDashboardProps {
  season: string;
  setSeason: (s: string) => void;
  transporters: Transporter[];
  setTransporters: React.Dispatch<React.SetStateAction<Transporter[]>>;
  vehicles: Vehicle[];
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  logs: AuditLog[];
  reports: ReportRow[];
  addLog: (action: string) => void;
  onSwitchSeason: () => Promise<void>;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  season, setSeason, transporters, setTransporters, vehicles, setVehicles, logs, reports, addLog, onSwitchSeason
}) => {
  const [tForm, setTForm] = useState({ name: '', season });
  const [vForm, setVForm] = useState({ transporterId: '', vehicle_no: '', truck_type: '', driver_name: '', driver_mobile: '', sl_no: '' });
  const [logSearch, setLogSearch] = useState('');
  const [logDate, setLogDate] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [userForm, setUserForm] = useState({ name: '', login: '', role: UserRole.AUDITOR, password: '' });
  const [userError, setUserError] = useState('');
  const [editingTransporterId, setEditingTransporterId] = useState<string | null>(null);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [tSearch, setTSearch] = useState('');
  const [vSearch, setVSearch] = useState('');
  const [modal, setModal] = useState<null>(null);
  const [isSwitchingSeason, setIsSwitchingSeason] = useState(false);
  const [isSavingTransporter, setIsSavingTransporter] = useState(false);

  useEffect(() => {
    setTForm((prev) => ({ ...prev, season }));
  }, [season]);

  const refreshMaster = async () => {
    try {
      const tRows = await api('/transporters');
      const vRows = await api('/vehicles');
      const tCounts: Record<string, number> = {};
      vRows.forEach((v: any) => {
        const tid = String(v.transporter_id);
        tCounts[tid] = (tCounts[tid] || 0) + 1;
      });
      const mappedT: Transporter[] = tRows.map((t: any) => ({ id: String(t.id), name: t.name, season: t.season, vehicleCount: tCounts[String(t.id)] || 0 }));
      const tLookup = Object.fromEntries(mappedT.map((t) => [t.id, t.name]));
      const mappedV: Vehicle[] = vRows.map((v: any) => ({
        id: String(v.id),
        vehicle_no: v.vehicle_no,
        truck_type: v.truck_type || '',
        driver_name: v.driver_name || '',
        driver_mobile: v.driver_mobile || '',
        sl_no: v.sl_no || '',
        transporter_id: String(v.transporter_id),
        transporter_name: tLookup[String(v.transporter_id)] || '',
      }));
      setTransporters(mappedT);
      setVehicles(mappedV);
    } catch (e) {
      console.error('Failed to refresh master data', e);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      const matchesText = logSearch ? `${l.action} ${l.who} ${l.role}`.toLowerCase().includes(logSearch.toLowerCase()) : true;
      const matchesDate = logDate ? (l.timestamp || '').slice(0, 10) === logDate : true;
      return matchesText && matchesDate;
    });
  }, [logs, logSearch, logDate]);

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

  const seasonReports = useMemo(
    () => reports.filter((r) => !r.season || r.season === season),
    [reports, season]
  );

  const stats = useMemo(() => {
    const totalVehicles = seasonVehicles.length;
    const totalTransporters = seasonTransporters.length;
    const scored = seasonReports.filter((r) => r.eval_score != null);
    const avgScore = scored.length ? (scored.reduce((s, r) => s + (r.eval_score || 0), 0) / scored.length).toFixed(1) : '—';
    const baselineReady = seasonReports.filter((r) => r.doc_score != null && r.age_score != null).length;
    const baselinePct = totalVehicles ? Math.round((baselineReady / totalVehicles) * 100) : 0;
    const evalReady = totalVehicles ? Math.round((scored.length / totalVehicles) * 100) : 0;
    return { totalVehicles, totalTransporters, avgScore, baselinePct, evalReady };
  }, [seasonVehicles, seasonTransporters, seasonReports]);

  const filteredTransporters = useMemo(() => {
    if (!tSearch) return seasonTransporters;
    return seasonTransporters.filter((t) => t.name.toLowerCase().includes(tSearch.toLowerCase()));
  }, [seasonTransporters, tSearch]);

  const filteredVehicles = useMemo(() => {
    if (!vSearch) return seasonVehicles;
    return seasonVehicles.filter((v) => `${v.vehicle_no} ${v.transporter_name}`.toLowerCase().includes(vSearch.toLowerCase()));
  }, [seasonVehicles, vSearch]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const rows = await api('/users');
        setUsers(rows.map((u: any) => ({ id: String(u.id), name: u.name, login: u.login, role: u.role })));
      } catch (e) {
        setUsers([]);
      }
    };
    void loadUsers();
    void refreshMaster();
  }, []);

  const handleAddTransporter = async () => {
    const name = tForm.name.trim();
    const seasonValue = tForm.season.trim();
    if (!name || !seasonValue || isSavingTransporter) return;
    setIsSavingTransporter(true);
    try {
      const res = await api('/transporters', { method: 'POST', body: { name, season: seasonValue } });
      const newT: Transporter = { id: String(res.id), name, season: seasonValue, vehicleCount: 0 };
      setTransporters((prev) => [...prev, newT]);
      setTForm({ name: '', season: seasonValue });
      setEditingTransporterId(null);
      addLog(`Added transporter ${name}`);
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('already exists')) {
        alert('Transporter already exists for this season.');
      } else {
        alert('Unable to add transporter');
      }
    } finally {
      setIsSavingTransporter(false);
    }
  };

  const handleUpdateTransporter = async () => {
    if (!editingTransporterId) return;
    if (!tForm.name || !tForm.season) return;
    try {
      await api(`/transporters/${editingTransporterId}`, { method: 'PUT', body: { name: tForm.name, season: tForm.season } });
      setTransporters((prev) => prev.map((t) => t.id === editingTransporterId ? { ...t, name: tForm.name, season: tForm.season } : t));
      setTForm({ name: '', season });
      setEditingTransporterId(null);
      addLog(`Updated transporter ${tForm.name}`);
    } catch (e) {
      alert('Unable to update transporter');
    }
  };

  const handleDeleteTransporter = async (id: string) => {
    try {
      await api(`/transporters/${id}`, { method: 'DELETE' });
      setTransporters((prev) => prev.filter((t) => t.id !== id));
      setVehicles((prev) => prev.filter((v) => v.transporter_id !== id));
      addLog(`Deleted transporter ${id}`);
    } catch (e) {
      alert('Unable to delete transporter');
    }
  };

  const handleAddVehicle = async () => {
    if (!vForm.transporterId || !vForm.vehicle_no) return;
    try {
      const res = await api(`/transporters/${vForm.transporterId}/vehicles`, { method: 'POST', body: {
        vehicle_no: vForm.vehicle_no,
        year: null,
        sl_no: vForm.sl_no,
        truck_type: vForm.truck_type,
        driver_name: vForm.driver_name,
        driver_mobile: vForm.driver_mobile,
      } });
      const t = transporters.find((x) => x.id === vForm.transporterId);
      const newV: Vehicle = {
        id: String(res.id),
        vehicle_no: vForm.vehicle_no,
        truck_type: vForm.truck_type,
        driver_name: vForm.driver_name,
        driver_mobile: vForm.driver_mobile,
        sl_no: vForm.sl_no,
        transporter_id: vForm.transporterId,
        transporter_name: t?.name || '',
      };
      setVehicles((prev) => [...prev, newV]);
      setTransporters((prev) => prev.map((p) => p.id === vForm.transporterId ? { ...p, vehicleCount: p.vehicleCount + 1 } : p));
      setVForm({ transporterId: '', vehicle_no: '', truck_type: '', driver_name: '', driver_mobile: '', sl_no: '' });
      setEditingVehicleId(null);
      addLog(`Added vehicle ${vForm.vehicle_no}`);
    } catch (e) {
      alert('Unable to add vehicle');
    }
  };

  const handleUpdateVehicle = async () => {
    if (!editingVehicleId) return;
    if (!vForm.transporterId || !vForm.vehicle_no) return;
    try {
      await api(`/vehicles/${editingVehicleId}`, { method: 'PUT', body: {
        vehicle_no: vForm.vehicle_no,
        sl_no: vForm.sl_no,
        truck_type: vForm.truck_type,
        driver_name: vForm.driver_name,
        driver_mobile: vForm.driver_mobile,
      } });
      const t = transporters.find((x) => x.id === vForm.transporterId);
      const prev = vehicles.find((v) => v.id === editingVehicleId);
      setVehicles((prev) => prev.map((v) => v.id === editingVehicleId ? {
        ...v,
        vehicle_no: vForm.vehicle_no,
        sl_no: vForm.sl_no,
        truck_type: vForm.truck_type,
        driver_name: vForm.driver_name,
        driver_mobile: vForm.driver_mobile,
        transporter_id: vForm.transporterId,
        transporter_name: t?.name || v.transporter_name,
      } : v));
      if (prev && prev.transporter_id !== vForm.transporterId) {
        setTransporters((ts) => ts.map((tr) => {
          if (tr.id === prev.transporter_id) return { ...tr, vehicleCount: Math.max(0, tr.vehicleCount - 1) };
          if (tr.id === vForm.transporterId) return { ...tr, vehicleCount: tr.vehicleCount + 1 };
          return tr;
        }));
      }
      setVForm({ transporterId: '', vehicle_no: '', truck_type: '', driver_name: '', driver_mobile: '', sl_no: '' });
      setEditingVehicleId(null);
      addLog(`Updated vehicle ${vForm.vehicle_no}`);
    } catch (e) {
      alert('Unable to update vehicle');
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    try {
      const vehicle = vehicles.find((v) => v.id === id);
      await api(`/vehicles/${id}`, { method: 'DELETE' });
      setVehicles((prev) => prev.filter((v) => v.id !== id));
      if (vehicle) {
        setTransporters((prev) => prev.map((t) => t.id === vehicle.transporter_id ? { ...t, vehicleCount: Math.max(0, t.vehicleCount - 1) } : t));
      }
      addLog(`Deleted vehicle ${id}`);
    } catch (e) {
      alert('Unable to delete vehicle');
    }
  };

  const logCsv = () => {
    const header = 'timestamp,who,role,action\n';
    const rows = filteredLogs.map((l) => `${l.timestamp},${l.who},${l.role},"${(l.action || '').replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'logs.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateUser = async () => {
    if (!userForm.name || !userForm.login || !userForm.password) {
      setUserError('Name, login, and password are required.');
      return;
    }
    setUserError('');
    try {
      const res = await api('/users', { method: 'POST', body: { ...userForm } });
      const newUser: User = { id: String(res.id), name: userForm.name, login: userForm.login, role: userForm.role };
      setUsers((prev) => [...prev, newUser]);
      setUserForm({ name: '', login: '', role: UserRole.AUDITOR, password: '' });
      addLog(`Provisioned user ${newUser.login}`);
    } catch (e: any) {
      setUserError('Unable to create user (check role support on server).');
    }
  };
  return (
    <div className="space-y-12 max-w-7xl mx-auto py-10 px-4 animate-fade-in-up">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div className="space-y-2">
          <h2 className="text-4xl font-extrabold font-heading text-slate-900 tracking-tight">System Controls</h2>
          <p className="text-slate-500 font-medium">Global master data management and seasonal configuration.</p>
        </div>
        
        <div className="flex items-center gap-3 p-2 bg-white rounded-3xl border border-slate-200 shadow-sm">
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="px-6 py-3 rounded-2xl bg-slate-50 border-none text-sm font-black focus:ring-2 focus:ring-blue-500 outline-none w-40"
          >
            {SEASON_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button 
            onClick={async () => {
              setIsSwitchingSeason(true);
              try {
                await onSwitchSeason();
              } finally {
                setIsSwitchingSeason(false);
              }
            }}
            disabled={isSwitchingSeason}
            className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSwitchingSeason ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3.5a4.5 4.5 0 00-4.5 4.5H4z" />
                </svg>
                Switching...
              </span>
            ) : (
              'Switch Season'
            )}
          </button>
          <button 
            onClick={refreshMaster}
            className="bg-white text-slate-700 px-4 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all"
          >
            Refresh Data
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[ 
          { label: 'Fleet Capacity', val: stats.totalVehicles, desc: 'Registered units', color: 'blue', onClick: undefined },
          { label: 'Transporters', val: stats.totalTransporters, desc: 'Active partners', color: 'emerald', onClick: undefined },
          { label: 'Avg Score', val: stats.avgScore, desc: 'Latest eval average', color: 'indigo' },
          { label: 'Baseline Ready', val: `${stats.baselinePct}%`, desc: 'Vehicles with baseline', color: 'slate' },
        ].map((stat, i) => (
          <div
            key={i}
            onClick={stat.onClick}
            className={`bg-white rounded-[32px] p-8 border border-slate-200 shadow-sm group hover:shadow-xl transition-all duration-500 ${stat.onClick ? 'cursor-pointer hover:border-blue-200' : ''}`}
          >
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">{stat.label}</p>
            <div className="flex items-end justify-between">
              <div>
                <h4 className="text-4xl font-black font-heading text-slate-900">{stat.val}</h4>
                <p className="text-xs font-bold text-slate-400 mt-2">{stat.desc}</p>
              </div>
              <div className={`w-12 h-12 rounded-2xl bg-${stat.color}-50 text-${stat.color}-600 flex items-center justify-center`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Transporters</p>
              <h3 className="text-xl font-bold text-slate-900">Add & review partners</h3>
            </div>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-[10px] font-black uppercase text-slate-500">{seasonTransporters.length} total</span>
          </div>

          <input
            className="w-full h-11 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-bold"
            placeholder="Search transporter"
            value={tSearch}
            onChange={(e) => setTSearch(e.target.value)}
          />

          <div className="grid md:grid-cols-2 gap-4">
            <input
              className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100"
              placeholder="Transporter name"
              value={tForm.name}
              onChange={(e) => setTForm({ ...tForm, name: e.target.value })}
            />
            <select
              className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-2 focus:ring-blue-100"
              value={tForm.season}
              onChange={(e) => setTForm({ ...tForm, season: e.target.value })}
            >
              {SEASON_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="md:col-span-2 flex gap-3">
              <button
                onClick={editingTransporterId ? handleUpdateTransporter : handleAddTransporter}
                disabled={isSavingTransporter}
                className="h-12 rounded-2xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest shadow-sm active:scale-[0.99] px-5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {editingTransporterId ? 'Save transporter' : 'Add transporter'}
              </button>
              {editingTransporterId && (
                <button
                  onClick={() => { setEditingTransporterId(null); setTForm({ name: '', season }); }}
                  className="h-12 rounded-2xl bg-white text-slate-600 text-[11px] font-black uppercase tracking-widest border border-slate-200 px-5"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
            {filteredTransporters.map((t) => (
              <div key={t.id} className="py-3 flex items-center justify-between text-sm font-bold text-slate-800">
                <div>
                  <div>{t.name}</div>
                  <div className="text-[11px] text-slate-400">Season {t.season}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-slate-50 text-[11px] font-black text-slate-600">{t.vehicleCount} units</span>
                  <button
                    className="text-[10px] font-black uppercase text-blue-600"
                    onClick={() => { setEditingTransporterId(t.id); setTForm({ name: t.name, season: t.season }); }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-[10px] font-black uppercase text-red-500"
                    onClick={() => handleDeleteTransporter(t.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {filteredTransporters.length === 0 && <p className="text-sm text-slate-400 py-2">No transporters yet.</p>}
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Vehicles</p>
              <h3 className="text-xl font-bold text-slate-900">Register fleet units</h3>
            </div>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-[10px] font-black uppercase text-slate-500">{seasonVehicles.length} total</span>
          </div>
          <input
            className="w-full h-11 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-bold"
            placeholder="Search vehicle or transporter"
            value={vSearch}
            onChange={(e) => setVSearch(e.target.value)}
          />
          <div className="grid md:grid-cols-2 gap-3">
            <select
              className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold"
              value={vForm.transporterId}
              onChange={(e) => setVForm({ ...vForm, transporterId: e.target.value })}
            >
              <option value="">Select transporter</option>
              {seasonTransporters.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold" placeholder="Vehicle number" value={vForm.vehicle_no} onChange={(e) => setVForm({ ...vForm, vehicle_no: e.target.value })} />
            <input className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold" placeholder="Truck type" value={vForm.truck_type} onChange={(e) => setVForm({ ...vForm, truck_type: e.target.value })} />
            <input className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold" placeholder="Driver name" value={vForm.driver_name} onChange={(e) => setVForm({ ...vForm, driver_name: e.target.value })} />
            <input className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold" placeholder="Driver mobile" value={vForm.driver_mobile} onChange={(e) => setVForm({ ...vForm, driver_mobile: e.target.value })} />
            <input className="h-12 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold" placeholder="Serial no." value={vForm.sl_no} onChange={(e) => setVForm({ ...vForm, sl_no: e.target.value })} />
            <div className="md:col-span-2 flex gap-3">
              <button onClick={editingVehicleId ? handleUpdateVehicle : handleAddVehicle} className="h-12 rounded-2xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest shadow-sm active:scale-[0.99] px-5">{editingVehicleId ? 'Save vehicle' : 'Add vehicle'}</button>
              {editingVehicleId && (
                <button onClick={() => { setEditingVehicleId(null); setVForm({ transporterId: '', vehicle_no: '', truck_type: '', driver_name: '', driver_mobile: '', sl_no: '' }); }} className="h-12 rounded-2xl bg-white text-slate-600 text-[11px] font-black uppercase tracking-widest border border-slate-200 px-5">Cancel</button>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-sm">
            {filteredVehicles.map((v) => (
              <div key={v.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900">{v.vehicle_no}</div>
                  <div className="text-[11px] text-slate-400">{v.transporter_name} · {v.truck_type || '—'}</div>
                  <div className="text-[11px] text-slate-400">{v.driver_name || '—'} {v.driver_mobile ? `· ${v.driver_mobile}` : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-[10px] font-black uppercase text-blue-600" onClick={() => { setEditingVehicleId(v.id); setVForm({ transporterId: v.transporter_id, vehicle_no: v.vehicle_no, truck_type: v.truck_type, driver_name: v.driver_name, driver_mobile: v.driver_mobile, sl_no: v.sl_no }); }}>Edit</button>
                  <button className="text-[10px] font-black uppercase text-red-500" onClick={() => handleDeleteVehicle(v.id)}>Delete</button>
                </div>
              </div>
            ))}
            {filteredVehicles.length === 0 && <p className="text-sm text-slate-400 py-2">No vehicles yet.</p>}
          </div>
        </div>
      </div>

      {/* Modals removed now that dedicated pages exist */}

      <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-10 py-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Activity Audit</p>
            <h3 className="text-lg font-bold text-slate-900">Filter and export logs</h3>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold" />
            <input type="text" value={logSearch} onChange={(e) => setLogSearch(e.target.value)} placeholder="Search text" className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold" />
            <button onClick={() => { setLogDate(''); setLogSearch(''); }} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase">Clear</button>
            <button onClick={logCsv} className="h-10 px-4 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase">Export CSV</button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest font-black text-slate-400 bg-slate-50/50">
                <th className="px-10 py-4 text-left">Timestamp</th>
                <th className="px-10 py-4 text-left">Descriptor</th>
                <th className="px-10 py-4 text-left">Origin</th>
                <th className="px-10 py-4 text-right">Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-all group">
                  <td className="px-10 py-3 text-[11px] font-bold text-slate-600 tabular-nums">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-10 py-3 text-sm font-bold text-slate-900">{log.action}</td>
                  <td className="px-10 py-3 text-xs text-slate-500 font-medium">{log.who}</td>
                  <td className="px-10 py-3 text-right">
                    <span className="px-3 py-1 rounded-lg bg-slate-100 text-[9px] font-black uppercase text-slate-600 group-hover:bg-white transition-colors border border-transparent group-hover:border-slate-200">
                      {log.role}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-10 py-12 text-center text-sm font-bold text-slate-300">No matching log entries.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">User Registry</p>
              <h3 className="text-xl font-bold text-slate-900">Create access</h3>
            </div>
            <span className="px-3 py-1 rounded-full bg-slate-100 text-[10px] font-black uppercase text-slate-500">{users.length} users</span>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <input className="h-11 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold" placeholder="Full name" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
            <input className="h-11 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold" placeholder="Login" value={userForm.login} onChange={(e) => setUserForm({ ...userForm, login: e.target.value })} />
            <select className="h-11 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}>
              <option value={UserRole.ADMIN}>Admin</option>
              <option value={UserRole.AUDITOR}>Auditor</option>
              <option value={UserRole.VIEWER}>Viewer</option>
            </select>
            <input className="h-11 px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold" type="password" placeholder="Password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
            <button onClick={handleCreateUser} className="md:col-span-2 h-11 rounded-2xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest">Create user</button>
            {userError && <p className="md:col-span-2 text-[12px] font-semibold text-red-500">{userError}</p>}
          </div>
        </div>

        <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm max-h-[360px] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900">Existing users</h3>
            <span className="text-[11px] font-black uppercase text-slate-400">admin/auditor/viewer</span>
          </div>
          <div className="divide-y divide-slate-100 text-sm">
            {users.map((u) => (
              <div key={u.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900">{u.name}</div>
                  <div className="text-[11px] text-slate-400">{u.login}</div>
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${u.role === UserRole.ADMIN ? 'bg-blue-100 text-blue-700' : u.role === UserRole.AUDITOR ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {u.role}
                </span>
              </div>
            ))}
            {users.length === 0 && <p className="text-sm text-slate-400 py-2">No users found.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
