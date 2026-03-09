
import React from 'react';
import { Crown, Eye, ShieldCheck } from 'lucide-react';
import { User, UserRole } from '../types';

interface HeaderProps {
  user: User;
  season: string;
  onLogout: () => void;
  view: 'dashboard' | 'reports' | 'transporters';
  canViewDashboard: boolean;
  onNavigate: (view: 'dashboard' | 'reports' | 'transporters') => void;
}

const Header: React.FC<HeaderProps> = ({ user, season, onLogout, view, canViewDashboard, onNavigate }) => {
  const roleMeta: Record<UserRole, { label: string; badge: string; chip: string; avatarBg: string; ring: string; Icon: React.ComponentType<{ className?: string }> }> = {
    [UserRole.VIEWER]: {
      label: 'Viewer',
      badge: 'bg-amber-100 text-amber-700 border border-amber-200',
      chip: 'text-amber-700 bg-amber-50',
      avatarBg: 'bg-gradient-to-br from-amber-500 to-orange-500',
      ring: 'ring-amber-100',
      Icon: Eye,
    },
    [UserRole.AUDITOR]: {
      label: 'Auditor',
      badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      chip: 'text-emerald-700 bg-emerald-50',
      avatarBg: 'bg-gradient-to-br from-emerald-500 to-teal-500',
      ring: 'ring-emerald-100',
      Icon: ShieldCheck,
    },
    [UserRole.ADMIN]: {
      label: 'Admin',
      badge: 'bg-blue-100 text-blue-700 border border-blue-200',
      chip: 'text-blue-700 bg-blue-50',
      avatarBg: 'bg-gradient-to-br from-blue-600 to-indigo-500',
      ring: 'ring-blue-100',
      Icon: Crown,
    },
  };

  const currentRole = roleMeta[user.role as UserRole] || roleMeta[UserRole.VIEWER];

  return (
    <header className="sticky top-0 z-40 w-full glass border-b border-slate-200/50">
      <div className="container mx-auto px-4 md:px-8 h-20 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="group relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-emerald-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold font-heading tracking-tight text-slate-900 leading-none">CaneTransporter</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Operational Hub</span>
              <span className="h-1 w-1 rounded-full bg-slate-300"></span>
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{season}</span>
              <span className={`text-[10px] font-black px-2 py-1 rounded-md ${currentRole.badge}`}>{currentRole.label}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-8 mr-4">
            <nav className="flex items-center gap-6">
              {canViewDashboard && (
                <button
                  onClick={() => onNavigate('dashboard')}
                  className={`text-xs font-bold pb-1 border-b-2 transition-colors ${
                    view === 'dashboard'
                      ? 'text-slate-900 border-blue-600'
                      : 'text-slate-400 hover:text-slate-600 border-transparent'
                  }`}
                >
                  Dashboard
                </button>
              )}
              <button
                onClick={() => onNavigate('reports')}
                className={`text-xs font-bold pb-1 border-b-2 transition-colors ${
                  view === 'reports'
                    ? 'text-slate-900 border-blue-600'
                    : 'text-slate-400 hover:text-slate-600 border-transparent'
                }`}
              >
                Reports
              </button>
              {canViewDashboard && (
                <button
                  onClick={() => onNavigate('transporters')}
                  className={`text-xs font-bold pb-1 border-b-2 transition-colors ${
                    view === 'transporters'
                      ? 'text-slate-900 border-blue-600'
                      : 'text-slate-400 hover:text-slate-600 border-transparent'
                  }`}
                  title="Go to transporter management"
                >
                  Transporters
                </button>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-4 pl-6 border-l border-slate-200">
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-black text-slate-900 leading-none">{user.name || 'User'}</p>
                <p className={`text-[9px] font-bold uppercase mt-1.5 tracking-tighter px-1.5 py-0.5 rounded-md inline-block ${currentRole.chip}`}>{currentRole.label}</p>
              </div>
              <div className={`w-11 h-11 rounded-full border-2 border-white shadow-sm flex items-center justify-center overflow-hidden ring-4 ${currentRole.ring}`}>
                <div className={`w-full h-full flex items-center justify-center text-white ${currentRole.avatarBg}`}>
                  <currentRole.Icon className="w-5 h-5" />
                </div>
              </div>
            </div>
            <button 
              onClick={onLogout}
              className="p-2.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 hover:shadow-inner transition-all duration-300"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
