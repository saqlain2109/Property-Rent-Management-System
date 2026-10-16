import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { 
  User, Lock, Shield, ShieldCheck, ShieldAlert, KeyRound, 
  X, Check, Copy, Phone, Mail, CheckCircle2, AlertCircle, RefreshCw 
} from 'lucide-react';

export default function ProfileModal({ user, onUpdateUser, onClose }) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'password' | '2fa'

  // Profile form state
  const [name, setName] = useState(user?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ text: '', type: '' });

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ text: '', type: '' });

  // 2FA state
  const [is2FAEnabled, setIs2FAEnabled] = useState(!!user?.twoFactorEnabled);
  const [qrCodeData, setQrCodeData] = useState(null);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState({ text: '', type: '' });
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  // Sync user prop if updated
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setUsername(user.username || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setIs2FAEnabled(!!user.twoFactorEnabled);
    }
  }, [user]);

  // Handle Profile Update
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileMessage({ text: '', type: '' });
    setProfileLoading(true);

    try {
      const res = await API.put('/auth/profile', {
        name,
        username,
        email,
        phone
      });

      if (res.data.success) {
        setProfileMessage({ text: 'Profile updated successfully!', type: 'success' });
        localStorage.setItem('property_rent_user', JSON.stringify(res.data.user));
        if (onUpdateUser) onUpdateUser(res.data.user);
      }
    } catch (err) {
      setProfileMessage({
        text: err.response?.data?.message || err.response?.data?.errors?.[0]?.msg || 'Failed to update profile',
        type: 'error'
      });
    } finally {
      setProfileLoading(false);
    }
  };

  // Handle Password Change
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMessage({ text: '', type: '' });

    if (newPassword.length < 6) {
      setPasswordMessage({ text: 'New password must be at least 6 characters long', type: 'error' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: 'New password and confirmation do not match', type: 'error' });
      return;
    }

    setPasswordLoading(true);

    try {
      const res = await API.put('/auth/change-password', {
        currentPassword,
        newPassword
      });

      if (res.data.success) {
        setPasswordMessage({ text: 'Password changed successfully!', type: 'success' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setPasswordMessage({
        text: err.response?.data?.message || 'Failed to change password',
        type: 'error'
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  // Generate 2FA Secret & QR Code
  const handleStart2FASetup = async () => {
    setTwoFactorMessage({ text: '', type: '' });
    setTwoFactorLoading(true);

    try {
      const res = await API.post('/auth/2fa/generate');
      if (res.data.success) {
        setQrCodeData(res.data);
        setTwoFactorToken('');
      }
    } catch (err) {
      setTwoFactorMessage({
        text: err.response?.data?.message || 'Failed to generate 2FA setup details',
        type: 'error'
      });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  // Verify code and enable 2FA
  const handleEnable2FA = async (e) => {
    e.preventDefault();
    setTwoFactorMessage({ text: '', type: '' });
    setTwoFactorLoading(true);

    try {
      const res = await API.post('/auth/2fa/enable', {
        token: twoFactorToken.trim()
      });

      if (res.data.success) {
        setIs2FAEnabled(true);
        setQrCodeData(null);
        setTwoFactorToken('');
        setTwoFactorMessage({ text: 'Two-Factor Authentication is now enabled on your account!', type: 'success' });

        const updatedUser = { ...user, twoFactorEnabled: true };
        localStorage.setItem('property_rent_user', JSON.stringify(updatedUser));
        if (onUpdateUser) onUpdateUser(updatedUser);
      }
    } catch (err) {
      setTwoFactorMessage({
        text: err.response?.data?.message || 'Invalid code. Check your app and try again.',
        type: 'error'
      });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  // Disable 2FA
  const handleDisable2FA = async (e) => {
    e.preventDefault();
    setTwoFactorMessage({ text: '', type: '' });
    setTwoFactorLoading(true);

    try {
      const res = await API.post('/auth/2fa/disable', {
        password: disablePassword
      });

      if (res.data.success) {
        setIs2FAEnabled(false);
        setShowDisableConfirm(false);
        setDisablePassword('');
        setTwoFactorMessage({ text: 'Two-Factor Authentication has been turned off.', type: 'info' });

        const updatedUser = { ...user, twoFactorEnabled: false };
        localStorage.setItem('property_rent_user', JSON.stringify(updatedUser));
        if (onUpdateUser) onUpdateUser(updatedUser);
      }
    } catch (err) {
      setTwoFactorMessage({
        text: err.response?.data?.message || 'Failed to disable 2FA. Incorrect password.',
        type: 'error'
      });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const copySecretToClipboard = () => {
    if (qrCodeData?.secret) {
      navigator.clipboard.writeText(qrCodeData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-base">Account & Security</h3>
              <p className="text-xs text-slate-500">Manage your profile, password, and two-factor authentication</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Pills */}
        <div className="flex border-b border-slate-200 px-5 pt-3 gap-2 bg-white">
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'profile'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profile Details</span>
          </button>

          <button
            onClick={() => setActiveTab('password')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'password'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Change Password</span>
          </button>

          <button
            onClick={() => setActiveTab('2fa')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === '2fa'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Two-Factor (2FA)</span>
            {is2FAEnabled && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block ml-0.5"></span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">

          {/* TAB 1: Profile Details */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              {profileMessage.text && (
                <div className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  profileMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {profileMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{profileMessage.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Username *</label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address *</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={profileLoading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
                >
                  {profileLoading ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Change Password */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {passwordMessage.text && (
                <div className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  passwordMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {passwordMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{passwordMessage.text}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Current Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">New Password *</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Confirm New Password *</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {passwordLoading ? 'Updating Password...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: Two-Factor Authentication (2FA) */}
          {activeTab === '2fa' && (
            <div className="space-y-5">
              {twoFactorMessage.text && (
                <div className={`p-3.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  twoFactorMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : twoFactorMessage.type === 'error'
                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                }`}>
                  {twoFactorMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{twoFactorMessage.text}</span>
                </div>
              )}

              {/* Status Header */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    is2FAEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {is2FAEnabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">Two-Factor Authentication (TOTP)</h4>
                    <p className="text-xs text-slate-500">
                      {is2FAEnabled 
                        ? '2FA is active. Authenticator app security code required upon login.'
                        : '2FA is disabled. Login requires only username & password.'}
                    </p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  is2FAEnabled 
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {is2FAEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {/* Case 1: 2FA is currently ENABLED */}
              {is2FAEnabled && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100 text-xs text-slate-600 space-y-2">
                    <p className="font-semibold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Your account is protected by Two-Factor Authentication</span>
                    </p>
                    <p>
                      Every time you log in, you will be prompted for a 6-digit code from Google Authenticator, Microsoft Authenticator, or another TOTP app.
                    </p>
                  </div>

                  {!showDisableConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowDisableConfirm(true)}
                      className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors"
                    >
                      Turn Off / Disable 2FA
                    </button>
                  ) : (
                    <form onSubmit={handleDisable2FA} className="p-4 rounded-xl bg-rose-50/50 border border-rose-200 space-y-3">
                      <p className="text-xs font-bold text-rose-900">
                        Confirm Disabling Two-Factor Authentication
                      </p>
                      <p className="text-xs text-slate-600">
                        Please enter your current password to confirm disabling 2FA:
                      </p>
                      <input
                        type="password"
                        required
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                        placeholder="Current password"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={twoFactorLoading}
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          {twoFactorLoading ? 'Disabling...' : 'Confirm Disable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowDisableConfirm(false); setDisablePassword(''); }}
                          className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Case 2: 2FA is DISABLED and Setup has not started */}
              {!is2FAEnabled && !qrCodeData && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Scan a QR code using Google Authenticator, Microsoft Authenticator, Authy, or any TOTP app to protect your administrator account against unauthorized access.
                  </p>

                  <button
                    type="button"
                    onClick={handleStart2FASetup}
                    disabled={twoFactorLoading}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
                  >
                    <Shield className="w-4 h-4" />
                    <span>{twoFactorLoading ? 'Generating QR Code...' : 'Turn ON Two-Factor Authentication'}</span>
                  </button>
                </div>
              )}

              {/* Case 3: Setup is active (QR Code displayed) */}
              {!is2FAEnabled && qrCodeData && (
                <form onSubmit={handleEnable2FA} className="space-y-4 pt-2">
                  <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex flex-col sm:flex-row items-center gap-5">
                    {/* QR Code */}
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm shrink-0">
                      <img
                        src={qrCodeData.qrCode}
                        alt="2FA QR Code"
                        className="w-36 h-36 rounded-lg"
                      />
                    </div>

                    {/* Step-by-step instructions */}
                    <div className="space-y-2 text-xs text-slate-600 min-w-0">
                      <p className="font-bold text-indigo-950 text-sm">
                        Step 1: Scan with Authenticator App
                      </p>
                      <p>
                        Open <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> on your phone and tap <strong>Add account (+)</strong> ➔ <strong>Scan a QR code</strong>.
                      </p>
                      <div className="pt-1">
                        <p className="text-[11px] text-slate-500 mb-1">Or enter manual key:</p>
                        <div className="flex items-center gap-1.5">
                          <code className="px-2 py-1 bg-white border border-slate-300 rounded font-mono text-[11px] text-slate-800 select-all truncate">
                            {qrCodeData.secret}
                          </code>
                          <button
                            type="button"
                            onClick={copySecretToClipboard}
                            className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors shrink-0"
                            title="Copy secret"
                          >
                            {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Verification Input */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-800">
                      Step 2: Enter the 6-digit code shown in the app to activate:
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        required
                        autoFocus
                        maxLength={6}
                        value={twoFactorToken}
                        onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        className="py-2.5 px-3 text-center tracking-[0.4em] font-mono font-bold text-lg rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-44"
                      />
                      <button
                        type="submit"
                        disabled={twoFactorLoading || twoFactorToken.length !== 6}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50 shrink-0"
                      >
                        {twoFactorLoading ? 'Activating...' : 'Verify & Enable 2FA'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setQrCodeData(null)}
                        className="px-3 py-2.5 rounded-xl text-slate-500 hover:text-slate-700 text-xs font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
