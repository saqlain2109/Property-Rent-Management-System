import React, { useState } from 'react';
import API from '../services/api';
import { Lock, User, ShieldCheck, KeyRound, ArrowLeft, Mail } from 'lucide-react';

export default function LoginModal({ onLoginSuccess, isSetupMode = false }) {
  const [isSetup, setIsSetup] = useState(isSetupMode);
  const [step, setStep] = useState('credentials'); // 'credentials' | '2fa'

  // Credentials State - Clean and NOT pre-filled as requested
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // 2FA State
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [pendingUserIdentifier, setPendingUserIdentifier] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSetup) {
        const payload = { name, username, email, password };
        const res = await API.post('/auth/setup-admin', payload);
        if (res.data.success) {
          localStorage.setItem('property_rent_token', res.data.token);
          localStorage.setItem('property_rent_user', JSON.stringify(res.data.user));
          onLoginSuccess(res.data.user);
        }
      } else {
        const payload = { username: username.trim(), email: username.trim(), password };
        const res = await API.post('/auth/login', payload);

        if (res.data.require2FA) {
          // Switch to Step 2: 2FA Verification
          setTempToken(res.data.tempToken);
          setPendingUserIdentifier(res.data.username || username);
          setStep('2fa');
          setTwoFactorCode('');
        } else if (res.data.success) {
          localStorage.setItem('property_rent_token', res.data.token);
          localStorage.setItem('property_rent_user', JSON.stringify(res.data.user));
          onLoginSuccess(res.data.user);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await API.post('/auth/verify-2fa-login', {
        tempToken,
        token: twoFactorCode.trim()
      });

      if (res.data.success) {
        localStorage.setItem('property_rent_token', res.data.token);
        localStorage.setItem('property_rent_user', JSON.stringify(res.data.user));
        onLoginSuccess(res.data.user);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid 6-digit code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-8 overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
        
        {/* Step 1: Username & Password / Setup */}
        {step === 'credentials' && (
          <>
            <div className="text-center mb-7">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 mb-4 shadow-inner">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-800">
                {isSetup ? 'Setup Administrator' : 'Property & Rent OS'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {isSetup ? 'Initialize the first administrator account' : 'Sign in with your username and password'}
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              {isSetup && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Administrator"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@propertyrent.com"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm transition-all shadow-md shadow-emerald-600/25 disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : isSetup ? 'Complete Setup & Sign In' : 'Sign In'}
              </button>
            </form>
          </>
        )}

        {/* Step 2: Two-Factor Authentication (TOTP Code) */}
        {step === '2fa' && (
          <>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 mb-3 shadow-inner">
                <KeyRound className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-800">
                Two-Factor Verification
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Enter the 6-digit security code generated by your Authenticator app for <span className="font-bold text-slate-700">{pendingUserIdentifier}</span>
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-center">
                {error}
              </div>
            )}

            <form onSubmit={handle2FASubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2 text-center">
                  6-Digit Authenticator Code
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full py-3 text-center tracking-[0.5em] text-2xl font-mono font-bold rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading || twoFactorCode.length !== 6}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm transition-all shadow-md shadow-indigo-600/25 disabled:opacity-50"
              >
                {loading ? 'Verifying Code...' : 'Verify & Continue'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('credentials');
                  setError('');
                  setTwoFactorCode('');
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Login</span>
              </button>
            </form>
          </>
        )}

      </div>
    </div>
  );
}
