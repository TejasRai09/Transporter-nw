import React, { useMemo, useState } from 'react';
import { Transporter, Vehicle } from '../types';

interface TransportersPageProps {
  vehicles: Vehicle[];
  transporters: Transporter[];
  season: string;
}

const TransportersPage: React.FC<TransportersPageProps> = ({ vehicles, transporters, season }) => {
  const [search, setSearch] = useState('');
  const [transporterId, setTransporterId] = useState('');
  const [truckType, setTruckType] = useState('');

  const truckTypes = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach((v) => {
      const type = (v.truck_type || '').trim();
      if (type) set.add(type);
    });
    return Array.from(set).sort();
  }, [vehicles]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const transporterIdNorm = String(transporterId).trim();
    const truckTypeNorm = String(truckType).trim();
    return vehicles
      .filter((v) => (transporterIdNorm ? String(v.transporter_id || '').trim() === transporterIdNorm : true))
      .filter((v) => (truckTypeNorm ? (v.truck_type || '').trim() === truckTypeNorm : true))
      .filter((v) => {
        if (!query) return true;
        return (
          v.vehicle_no.toLowerCase().includes(query) ||
          (v.driver_name || '').toLowerCase().includes(query) ||
          (v.driver_mobile || '').toLowerCase().includes(query) ||
          (v.truck_type || '').toLowerCase().includes(query) ||
          (v.transporter_name || '').toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const nameA = `${a.transporter_name || ''}-${a.vehicle_no || ''}`.toLowerCase();
        const nameB = `${b.transporter_name || ''}-${b.vehicle_no || ''}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [vehicles, search, transporterId, truckType]);

  const stats = useMemo(() => {
    const truckSet = new Set(vehicles.map((v) => v.truck_type).filter(Boolean));
    return {
      vehicles: vehicles.length,
      transporters: new Set(vehicles.map((v) => v.transporter_id)).size,
      truckTypes: truckSet.size,
    };
  }, [vehicles]);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 space-y-8 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Fleet Inventory</p>
          <h2 className="text-3xl font-extrabold font-heading text-slate-900">All Vehicles by Transporter</h2>
          <p className="text-slate-500 text-sm font-medium">Season {season} · search, filter, and browse every registered unit.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-2xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-slate-900/10">Live</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600">Vehicles</p>
          <div className="mt-2 text-3xl font-black text-slate-900">{stats.vehicles}</div>
          <p className="text-sm font-medium text-slate-500">Total registered units</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600">Transporters</p>
          <div className="mt-2 text-3xl font-black text-slate-900">{stats.transporters}</div>
          <p className="text-sm font-medium text-slate-500">Active partners</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-600">Truck Types</p>
          <div className="mt-2 text-3xl font-black text-slate-900">{stats.truckTypes}</div>
          <p className="text-sm font-medium text-slate-500">Configurations in fleet</p>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
          <div className="flex-1">
            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-2">Search</label>
            <div className="relative">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by vehicle, driver, type, transporter"
                className="w-full h-12 px-4 pl-11 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white text-sm font-semibold text-slate-800 focus:ring-4 focus:ring-blue-100 outline-none"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 105.64 5.64a7.5 7.5 0 0011.01 11.01z" />
                </svg>
              </span>
            </div>
          </div>
          <div className="w-full lg:w-52">
            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-2">Transporter</label>
            <select
              value={transporterId}
              onChange={(e) => setTransporterId(e.target.value)}
              className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-800 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">All</option>
              {transporters.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="w-full lg:w-52">
            <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 block mb-2">Truck Type</label>
            <select
              value={truckType}
              onChange={(e) => setTruckType(e.target.value)}
              className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-800 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">All</option>
              {truckTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Vehicle List</p>
            <h3 className="text-xl font-extrabold text-slate-900">{filtered.length} vehicles</h3>
          </div>
          <div className="text-[11px] font-bold text-slate-500">Sorted by transporter & vehicle</div>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400 font-bold">No vehicles match these filters.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((v) => (
              <div key={v.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-md transition-all duration-200 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Vehicle</div>
                    <div className="text-2xl font-black text-slate-900 leading-tight">{v.vehicle_no || '—'}</div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-700">{v.truck_type || 'NA'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="font-bold text-slate-900">{v.transporter_name || 'Unknown'}</div>
                  <div className="text-[11px] font-semibold text-slate-400">SL #{v.sl_no || '—'}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-semibold">Driver</span>
                    <span className="font-bold text-slate-900">{v.driver_name || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 font-semibold">Contact</span>
                    <span className="font-bold text-blue-700">{v.driver_mobile || '—'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span>Transporter ID: {v.transporter_id}</span>
                  <span className="px-2 py-1 rounded-lg bg-slate-900 text-white">{season}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TransportersPage;
