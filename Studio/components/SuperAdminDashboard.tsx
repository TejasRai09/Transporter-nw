
import React, { useState } from 'react';
import { AuditLog, User, UserRole } from '../types';

interface SuperAdminDashboardProps {
  logs: AuditLog[];
  addLog: (action: string) => void;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ logs, addLog }) => {
  const [users, setUsers] = useState<User[]>([
    { id: '1', name: 'System Super', login: 'superadmin', role: UserRole.SUPERADMIN },
    { id: '2', name: 'Master Admin', login: 'admin', role: UserRole.ADMIN },
    { id: '3', name: 'Audit Officer 1', login: 'auditor', role: UserRole.AUDITOR },
  ]);

  const [form, setForm] = useState({ name: '', login: '', role: UserRole.AUDITOR });

  const handleCreateUser = () => {
    if (!form.name || !form.login) return;
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      ...form
    };
    setUsers([...users, newUser]);
    addLog(`System provisioned: ${form.login}`);
    setForm({ name: '', login: '', role: UserRole.AUDITOR });
  };

  const handleRevoke = (id: string) => {
    const user = users.find(u => u.id === id);
    setUsers(users.filter(u => u.id !== id));
    addLog(`Access revoked: ${user?.login}`);
  };

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 animate-fade-in-up space-y-12">
      <div className="space-y-2">
        <h2 className="text-4xl font-extrabold font-heading text-slate-900 tracking-tight">Access Registry</h2>
        <p className="text-slate-500 font-medium">Provision portal identities and monitor high-level system compliance.</p>
      </div>

      <div className="grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4 bg-white rounded-[40px] border border-slate-200 p-10 shadow-sm space-y-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
            </div>
            <h3 className="text-xl font-bold font-heading text-slate-900">Provision User</h3>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Legal Name</label>
              <input 
                type="text" 
                className="w-full h-14 px-6 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                placeholder="Ex: Marcus Aurelius"
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Identity Login</label>
              <input 
                type="text" 
                className="w-full h-14 px-6 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                placeholder="Ex: ma_trans_24"
                value={form.login}
                onChange={e => setForm({...form, login: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Privilege Tier</label>
              <select 
                className="w-full h-14 px-6 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold focus:ring-4 focus:ring-blue-100 outline-none transition-all appearance-none cursor-pointer"
                value={form.role}
                onChange={e => setForm({...form, role: e.target.value as UserRole})}
              >
                <option value={UserRole.AUDITOR}>Auditor (Field Operative)</option>
                <option value={UserRole.ADMIN}>Admin (Management)</option>
                <option value={UserRole.SUPERADMIN}>Superadmin (Full Access)</option>
              </select>
            </div>
            <button 
              onClick={handleCreateUser}
              className="w-full py-5 bg-slate-900 text-white font-black uppercase tracking-widest rounded-[28px] hover:bg-slate-800 transition-all shadow-2xl active:scale-[0.98]"
            >
              Authorize Account
            </button>
          </div>
        </div>

        <div className="lg:col-span-8 bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="px-10 py-8 border-b border-slate-100">
            <h3 className="text-xl font-bold font-heading text-slate-900">Active Registry</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest font-black text-slate-400 bg-slate-50/50">
                  <th className="px-10 py-5 text-left">Identity</th>
                  <th className="px-10 py-5 text-left">Login</th>
                  <th className="px-10 py-5 text-left">Tier</th>
                  <th className="px-10 py-5 text-right">Commands</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="group hover:bg-slate-50 transition-all">
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-200">
                          {u.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="text-sm font-bold text-slate-900">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-10 py-6 text-xs text-slate-500 font-medium tabular-nums">{u.login}</td>
                    <td className="px-10 py-6">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        u.role === UserRole.SUPERADMIN ? 'bg-purple-100 text-purple-700' :
                        u.role === UserRole.ADMIN ? 'bg-blue-100 text-blue-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-10 py-6 text-right">
                      <button 
                        onClick={() => handleRevoke(u.id)}
                        className="text-[10px] font-black text-red-400 hover:text-red-600 uppercase tracking-widest transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Revoke Access
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
