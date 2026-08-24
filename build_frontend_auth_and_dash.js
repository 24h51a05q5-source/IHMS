const fs = require('fs');
const path = require('path');

function write(p, c) {
  const fp = path.join(__dirname, p);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, c.trim() + '\n', 'utf8');
  console.log('Wrote ' + p);
}

// 1. Login Page
write('frontend/src/app/auth/login/page.tsx', `
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../context/AuthContext';
import { Building2, Lock, Mail, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('owner@ihms.com');
  const [password, setPassword] = useState('Admin@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const setDemoUser = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Admin@123');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 font-extrabold text-2xl text-white shadow-xl shadow-emerald-600/30">
            IH
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-white">
            IHMS ERP PLATFORM
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Integrated Hostel Management System • Enterprise SaaS
          </p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur">
          {error && (
            <div className="mb-4 rounded-lg bg-rose-950/60 p-3 text-xs font-medium text-rose-300 border border-rose-800/60">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@organization.com"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 transition disabled:opacity-50"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Switcher */}
          <div className="mt-6 border-t border-slate-800 pt-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Quick Role-Based Login Presets:
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => setDemoUser('owner@ihms.com')}
                className="rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-left hover:border-emerald-500 transition"
              >
                <div className="font-bold text-white">Owner</div>
                <div className="text-slate-400 text-[10px]">Full Access & P&L</div>
              </button>
              <button
                type="button"
                onClick={() => setDemoUser('accountant@ihms.com')}
                className="rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-left hover:border-emerald-500 transition"
              >
                <div className="font-bold text-white">Accountant</div>
                <div className="text-slate-400 text-[10px]">Fees & Ledgers</div>
              </button>
              <button
                type="button"
                onClick={() => setDemoUser('warden@ihms.com')}
                className="rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-left hover:border-emerald-500 transition"
              >
                <div className="font-bold text-white">Warden</div>
                <div className="text-slate-400 text-[10px]">Beds & Leaves</div>
              </button>
              <button
                type="button"
                onClick={() => setDemoUser('student@ihms.com')}
                className="rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-left hover:border-emerald-500 transition"
              >
                <div className="font-bold text-white">Student</div>
                <div className="text-slate-400 text-[10px]">HYD001-ST000001</div>
              </button>
              <button
                type="button"
                onClick={() => setDemoUser('security@ihms.com')}
                className="rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-left hover:border-emerald-500 transition"
              >
                <div className="font-bold text-white">Security</div>
                <div className="text-slate-400 text-[10px]">QR Passes & Gate</div>
              </button>
              <button
                type="button"
                onClick={() => setDemoUser('superadmin@ihms.com')}
                className="rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-left hover:border-emerald-500 transition"
              >
                <div className="font-bold text-white">Super Admin</div>
                <div className="text-slate-400 text-[10px]">Global Multi-Org</div>
              </button>
            </div>
          </div>

          <div className="mt-4 text-center">
            <Link href="/auth/register" className="text-xs text-emerald-400 hover:underline">
              New Organization? Register Enterprise Account →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
`);

// 2. Register Page
write('frontend/src/app/auth/register/page.tsx', `
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../context/AuthContext';
import { Building2, Lock, Mail, User, Phone, ArrowRight } from 'lucide-react';

export default function RegisterPage() {
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    orgName: '',
    orgEmail: '',
    orgPhone: '',
    currency: 'INR',
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
    ownerPhone: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await register(formData);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check inputs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 font-extrabold text-xl text-white shadow-xl shadow-emerald-600/30">
            IH
          </div>
          <h2 className="mt-3 text-2xl font-black text-white">
            Register New Hostel Organization
          </h2>
          <p className="text-xs text-slate-400">
            Set up your multi-branch enterprise hostel network with MongoDB NoSQL
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur">
          {error && (
            <div className="mb-4 rounded-lg bg-rose-950/60 p-3 text-xs font-medium text-rose-300 border border-rose-800/60">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 border-b border-slate-800 pb-1">
              Organization Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Company / Group Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Royal Living Hostels Group"
                  value={formData.orgName}
                  onChange={(e) => setFormData({ ...formData, orgName: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Official Org Email</label>
                <input
                  type="email"
                  required
                  placeholder="admin@royalliving.com"
                  value={formData.orgEmail}
                  onChange={(e) => setFormData({ ...formData, orgEmail: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 border-b border-slate-800 pb-1 pt-2">
              Owner Account Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Owner Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="Sanjay Sharma"
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Owner Phone</label>
                <input
                  type="tel"
                  placeholder="+91 9876543210"
                  value={formData.ownerPhone}
                  onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Login Email</label>
                <input
                  type="email"
                  required
                  placeholder="owner@royalliving.com"
                  value={formData.ownerEmail}
                  onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={formData.ownerPassword}
                  onChange={(e) => setFormData({ ...formData, ownerPassword: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 transition disabled:opacity-50 mt-4"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              ) : (
                <>
                  <span>Create Organization & Launch ERP</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link href="/auth/login" className="text-xs text-emerald-400 hover:underline">
              Already registered? Sign In →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
`);