'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import DatabaseConfigModal from '@/components/common/DatabaseConfigModal';
import { isSupabaseReady } from '@/lib/supabase';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  adminOnly?: boolean;
}

// SVG icons matching the exact iconography in the reference screenshot
const icons = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="7" height="8" rx="1.5" />
      <rect x="11" y="2" width="7" height="5" rx="1.5" />
      <rect x="2" y="12" width="7" height="6" rx="1.5" />
      <rect x="11" y="9" width="7" height="9" rx="1.5" />
    </svg>
  ),
  pos: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="16" height="14" rx="2" />
      <line x1="2" y1="8" x2="18" y2="8" />
      <line x1="8" y1="8" x2="8" y2="17" />
    </svg>
  ),
  inventory: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2L3 6v8l7 4 7-4V6l-7-4z" />
      <path d="M3 6l7 4" />
      <path d="M17 6l-7 4" />
      <line x1="10" y1="10" x2="10" y2="18" />
    </svg>
  ),
  warehouse: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10L10 4l7 6" />
      <rect x="4" y="10" width="12" height="7" rx="1" />
      <line x1="8" y1="13" x2="12" y2="13" />
    </svg>
  ),
  barangDatang: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 17h12" />
      <path d="M10 3v10" />
      <path d="M6 9l4 4 4-4" />
    </svg>
  ),
  prescription: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="12" height="16" rx="2" />
      <line x1="7" y1="6" x2="13" y2="6" />
      <line x1="7" y1="9" x2="13" y2="9" />
      <line x1="7" y1="12" x2="10" y2="12" />
    </svg>
  ),
  expiry: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7.5" />
      <line x1="10" y1="6" x2="10" y2="10" />
      <line x1="10" y1="10" x2="13" y2="12" />
    </svg>
  ),
  pricing: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="3" x2="10" y2="17" />
      <path d="M13 5.5H8.5a2 2 0 000 4h3a2 2 0 010 4H7" />
    </svg>
  ),
  menu: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="19" y2="6" />
      <line x1="3" y1="11" x2="19" y2="11" />
      <line x1="3" y1="16" x2="19" y2="16" />
    </svg>
  ),
  close: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </svg>
  ),
  sun: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  moon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  ),
};

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: icons.dashboard },
  { href: '/pos', label: 'Kasir POS', icon: icons.pos },
  { href: '/inventory', label: 'Katalog Obat', icon: icons.inventory },
  { href: '/gudang', label: 'Gudang', icon: icons.warehouse },
  { href: '/warehouse', label: 'Barang Datang', icon: icons.barangDatang },
  { href: '/prescription', label: 'Pengeluaran Resep', icon: icons.prescription, badge: 'Rx' },
  { href: '/expiry', label: 'Kedaluwarsa', icon: icons.expiry },
  { href: '/pricing', label: 'Harga & Import', icon: icons.pricing, adminOnly: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showDbModal, setShowDbModal] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const { user, logout, isAdmin } = useAuth();
  const { toggleTheme, isDark } = useTheme();

  useEffect(() => {
    setIsDbConnected(isSupabaseReady());
    const handleSync = () => setIsDbConnected(isSupabaseReady());
    window.addEventListener('apotek-cloud-synced', handleSync);
    return () => window.removeEventListener('apotek-cloud-synced', handleSync);
  }, []);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  // Pegawai hanya melihat menu operasional, menu khusus admin disembunyikan
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <>
      {/* Mobile Top Header */}
      <header className="mobile-top-bar">
        <button
          type="button"
          className="mobile-top-menu-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="Buka menu navigasi"
        >
          {icons.menu}
        </button>

        <Link href="/" className="mobile-top-brand">
          <div className="mobile-top-logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div>
            <div className="mobile-top-title">Apotek POS</div>
            <div className="mobile-top-subtitle">Sistem Kasir</div>
          </div>
        </Link>

        {/* Database Status Button Mobile (Khusus Admin) */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowDbModal(true)}
            style={{
              background: isDbConnected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${isDbConnected ? 'rgba(34, 197, 94, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
              borderRadius: '16px',
              padding: '3px 8px',
              fontSize: '0.72rem',
              fontWeight: 600,
              color: isDbConnected ? '#15803d' : '#b45309',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer',
              marginLeft: 'auto',
              marginRight: '6px',
            }}
            title={isDbConnected ? 'Database Cloud Supabase Terhubung' : 'Mode Penyimpanan Lokal - Klik untuk Hubungkan Cloud'}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: isDbConnected ? '#22c55e' : '#f59e0b',
                boxShadow: isDbConnected ? '0 0 6px rgba(34, 197, 94, 0.8)' : 'none',
              }}
            />
            <span>{isDbConnected ? '1 DB' : 'Lokal'}</span>
          </button>
        )}

        {/* Tombol Dark Mode Mobile */}
        <button
          type="button"
          onClick={toggleTheme}
          style={{
            background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'var(--slate-100)',
            border: '1px solid var(--slate-200)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isDark ? '#fbbf24' : 'var(--slate-700)',
            cursor: 'pointer',
            marginRight: '6px',
            marginLeft: isAdmin ? '0' : 'auto',
          }}
          title={isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
          aria-label="Toggle tema gelap/terang"
        >
          {isDark ? icons.sun : icons.moon}
        </button>

        {user && (
          <div className="mobile-top-user">
            <span className="mobile-top-role">{user.role === 'ADMIN' ? 'Admin' : 'Kasir'}</span>
            <span className="mobile-top-avatar">{user.avatar || (user.role === 'ADMIN' ? '👨‍⚕️' : '👩‍💼')}</span>
          </div>
        )}
      </header>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        <Link
          href="/"
          className={`mobile-bottom-item ${pathname === '/' ? 'active' : ''}`}
          onClick={() => setMobileOpen(false)}
        >
          <span className="mobile-bottom-icon">{icons.dashboard}</span>
          <span className="mobile-bottom-label">Dashboard</span>
        </Link>
        <Link
          href="/pos"
          className={`mobile-bottom-item ${pathname.startsWith('/pos') ? 'active' : ''}`}
          onClick={() => setMobileOpen(false)}
        >
          <span className="mobile-bottom-icon">{icons.pos}</span>
          <span className="mobile-bottom-label">Kasir</span>
        </Link>
        <Link
          href="/gudang"
          className={`mobile-bottom-item ${pathname.startsWith('/gudang') ? 'active' : ''}`}
          onClick={() => setMobileOpen(false)}
        >
          <span className="mobile-bottom-icon">{icons.warehouse}</span>
          <span className="mobile-bottom-label">Gudang</span>
        </Link>
        <Link
          href="/inventory"
          className={`mobile-bottom-item ${pathname.startsWith('/inventory') ? 'active' : ''}`}
          onClick={() => setMobileOpen(false)}
        >
          <span className="mobile-bottom-icon">{icons.inventory}</span>
          <span className="mobile-bottom-label">Katalog</span>
        </Link>
        <button
          type="button"
          className={`mobile-bottom-item ${mobileOpen ? 'active' : ''}`}
          onClick={() => setMobileOpen(true)}
          aria-label="Menu navigasi lengkap"
        >
          <span className="mobile-bottom-icon">{icons.menu}</span>
          <span className="mobile-bottom-label">Menu</span>
        </button>
      </nav>

      {/* Overlay for mobile view */}
      {mobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        {/* Header Branding — Apotek POS & Sistem Kasir */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div>
              <div className="sidebar-title">Apotek POS</div>
              <div className="sidebar-subtitle">Sistem Kasir</div>
            </div>
          </div>
          <button
            className="sidebar-close-mobile"
            onClick={() => setMobileOpen(false)}
            aria-label="Tutup menu"
          >
            {icons.close}
          </button>
        </div>

        {/* Navigation Links — Horizontal Flex layout (Icon + Text) */}
        <nav className="sidebar-nav">
          {visibleNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link ${active ? 'sidebar-link-active' : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="sidebar-link-icon">{item.icon}</span>
                <span className="sidebar-link-text">{item.label}</span>
                {item.badge && (
                  <span className="sidebar-badge sidebar-badge-teal">
                    {item.badge}
                  </span>
                )}
                {item.adminOnly && (
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: 'rgba(20, 184, 166, 0.2)',
                      color: 'var(--teal-300)',
                      marginLeft: 'auto',
                      marginRight: '6px',
                    }}
                  >
                    Admin
                  </span>
                )}
                <span className="sidebar-active-indicator" />
              </Link>
            );
          })}
        </nav>

        {/* Footer Info & User Profile */}
        <div className="sidebar-footer" style={{ flexDirection: 'column', gap: '10px', alignItems: 'stretch' }}>
          {user && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                <span style={{ fontSize: '1.2rem' }}>{user.avatar || (user.role === 'ADMIN' ? '👨‍⚕️' : '👩‍💼')}</span>
                <div style={{ overflow: 'hidden' }}>
                  <div
                    style={{
                      color: '#ffffff',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '120px',
                    }}
                    title={user.name}
                  >
                    {user.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: user.role === 'ADMIN' ? 'rgba(13, 148, 136, 0.3)' : 'rgba(59, 130, 246, 0.3)',
                        color: user.role === 'ADMIN' ? 'var(--teal-300)' : '#93c5fd',
                        border: user.role === 'ADMIN' ? '1px solid rgba(20, 184, 166, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {user.role}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  borderRadius: '6px',
                  padding: '5px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                title="Keluar dari akun"
              >
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 17H4a2 2 0 01-2-2V5a2 2 0 012-2h3M13 14l4-4-4-4M17 10H7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Keluar</span>
              </button>
            </div>
          )}

          {/* Tombol Status & Konfigurasi Database Cloud (1 DB) - Khusus Admin */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowDbModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 10px',
                background: isDbConnected ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                border: `1px solid ${isDbConnected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                borderRadius: '8px',
                color: isDbConnected ? '#86efac' : '#fde047',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: isDbConnected ? '#22c55e' : '#f59e0b',
                    boxShadow: isDbConnected ? '0 0 6px rgba(34, 197, 94, 0.8)' : 'none',
                    flexShrink: 0,
                  }}
                />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {isDbConnected ? 'Database Cloud (1 DB)' : 'Hubungkan Cloud DB'}
                </span>
              </div>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
            </button>
          )}

          {/* Tombol Pengalih Tema (Dark / Light Mode) */}
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 10px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              color: '#cbd5e1',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
              transition: 'all 0.15s ease',
            }}
            title={isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: isDark ? '#fbbf24' : '#94a3b8', display: 'flex' }}>
                {isDark ? icons.sun : icons.moon}
              </span>
              <span>{isDark ? 'Mode Terang' : 'Mode Gelap'}</span>
            </div>
            <span
              style={{
                fontSize: '0.68rem',
                padding: '2px 7px',
                borderRadius: '12px',
                background: isDark ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                color: isDark ? '#fde047' : '#94a3b8',
                fontWeight: 700,
              }}
            >
              {isDark ? 'Dark' : 'Light'}
            </span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--slate-400)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="sidebar-status-dot" />
              <span>Sistem Kasir Aktif</span>
            </div>
            <span>v1.0</span>
          </div>
        </div>
      </aside>

      {/* Modal Konfigurasi Database Supabase (Khusus Admin) */}
      {isAdmin && (
        <DatabaseConfigModal
          isOpen={showDbModal}
          onClose={() => {
            setShowDbModal(false);
            setIsDbConnected(isSupabaseReady());
          }}
        />
      )}
    </>
  );
}
