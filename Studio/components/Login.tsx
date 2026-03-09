
import React, { useState } from 'react';
import { User } from '../types';
import { api } from '../api';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const performLogin = async (u: string, p: string) => {
    const userLogin = u.trim();
    const userPass = p.trim();
    if (!userLogin || !userPass) {
      setError('Enter username and password');
      setIsLoggingIn(false);
      return;
    }
    try {
      const res = await api('/auth/login', { method: 'POST', body: { login: userLogin, password: userPass } });
      onLogin({ ...res.user, login: userLogin, token: res.token });
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);
    // Add artificial delay for UX feedback
    setTimeout(() => void performLogin(login, password), 200);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(circle_at_14%_14%,rgba(6,182,212,0.08),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(29,78,216,0.08),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)]">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-3xl bg-gradient-to-tr from-blue-600 to-emerald-500 shadow-2xl shadow-blue-200 flex items-center justify-center text-white mb-6 animate-bounce-subtle">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <h1 className="text-4xl font-black font-heading tracking-tight text-slate-900">CaneTransporter</h1>
          <p className="text-slate-500 font-medium tracking-wide">Performance Framework Portal</p>
        </div>

        <div className="bg-white/70 backdrop-blur-xl p-8 rounded-[40px] border border-white/50 shadow-[0_32px_80px_-20px_rgba(0,0,0,0.1)] space-y-6">
          <form onSubmit={handleFormSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Account Login</label>
              <input 
                type="text" 
                required
                disabled={isLoggingIn}
                className="w-full px-6 py-4 rounded-3xl border border-slate-200 bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-medium text-slate-900 disabled:opacity-50"
                placeholder="Username"
                value={login}
                onChange={e => setLogin(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</label>
              <input 
                type="password" 
                required
                disabled={isLoggingIn}
                className="w-full px-6 py-4 rounded-3xl border border-slate-200 bg-white focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all font-medium text-slate-900 disabled:opacity-50"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="p-3 rounded-2xl bg-red-50 text-red-600 text-xs font-bold text-center border border-red-100 animate-shake">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-4 bg-gradient-to-tr from-blue-700 to-blue-500 hover:from-blue-600 hover:to-blue-400 text-white font-black rounded-3xl shadow-xl shadow-blue-200 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Verifying...
                </>
              ) : 'Sign In to Portal'}
            </button>
          </form>

          <div className="pt-2"></div>
        </div>

        <div className="text-center">
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">System Security Policy Active</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
