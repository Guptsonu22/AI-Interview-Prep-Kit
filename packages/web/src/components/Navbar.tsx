'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  IconSparkles,
  IconBriefcase,
  IconUpload,
  IconSettings,
  IconLogout,
  IconPlus,
} from './Icons';

export function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // If on login/register pages, show minimal header
  const isAuthPage = pathname.startsWith('/auth');

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <Link href={isAuthenticated ? '/dashboard' : '/'} className="flex items-center space-x-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
                <IconSparkles className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
                PrepKit<span className="text-cyan-400">.ai</span>
              </span>
            </Link>

            {isAuthenticated && !isAuthPage && (
              <nav className="hidden md:flex items-center space-x-1 ml-8">
                <Link
                  href="/dashboard"
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    pathname === '/dashboard' || pathname === '/'
                      ? 'bg-slate-800 text-cyan-400'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  href="/kits/new"
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center space-x-1.5 ${
                    pathname === '/kits/new'
                      ? 'bg-slate-800 text-cyan-400'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <IconPlus className="w-4 h-4" />
                  <span>New Kit</span>
                </Link>
                <Link
                  href="/kits/batch"
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center space-x-1.5 ${
                    pathname === '/kits/batch'
                      ? 'bg-slate-800 text-cyan-400'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <IconUpload className="w-4 h-4" />
                  <span>Multi-Role Batch</span>
                </Link>
              </nav>
            )}
          </div>

          {/* Right Header: User Menu or Login Actions */}
          <div className="flex items-center space-x-3">
            {isAuthenticated ? (
              <div className="flex items-center space-x-3">
                <Link
                  href="/kits/new"
                  className="hidden sm:inline-flex btn-primary !py-1.5 !px-3 text-xs items-center space-x-1.5"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  <span>Create Kit</span>
                </Link>

                <div className="h-6 w-px bg-slate-800 hidden sm:block" />

                <div className="flex items-center space-x-2">
                  <Link
                    href="/settings"
                    title="Account Settings"
                    className={`p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors ${
                      pathname === '/settings' ? 'text-cyan-400 bg-slate-800' : ''
                    }`}
                  >
                    <IconSettings className="w-4 h-4" />
                  </Link>

                  <button
                    onClick={() => logout()}
                    title="Log out"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                  >
                    <IconLogout className="w-4 h-4" />
                  </button>

                  <div className="hidden lg:flex flex-col text-left pl-1">
                    <span className="text-xs font-semibold text-slate-200 leading-tight">
                      {user?.name || user?.email?.split('@')[0] || 'User'}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight truncate max-w-[120px]">
                      {user?.email}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  href="/auth/login"
                  className="px-3.5 py-1.5 text-sm font-medium text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/register"
                  className="btn-primary !py-1.5 !px-3.5 text-xs"
                >
                  Get Started
                </Link>
              </div>
            )}

            {/* Mobile menu toggle */}
            {isAuthenticated && !isAuthPage && (
              <button
                type="button"
                className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle mobile menu"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && isAuthenticated && !isAuthPage && (
          <div className="md:hidden py-3 px-2 border-t border-slate-800 space-y-1 bg-slate-900/95">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              Dashboard
            </Link>
            <Link
              href="/kits/new"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              New Kit
            </Link>
            <Link
              href="/kits/batch"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              Multi-Role Batch
            </Link>
            <Link
              href="/settings"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800"
            >
              Account Settings
            </Link>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                logout();
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-rose-400 hover:bg-slate-800"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
