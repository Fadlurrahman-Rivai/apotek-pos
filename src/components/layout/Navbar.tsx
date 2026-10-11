'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';

export default function Navbar() {
  const pathname = usePathname();
  const { toggleTheme, isDark } = useTheme();

  const navLinks = [
    { href: '/', label: 'Dashboard' },
    { href: '/pos', label: 'Kasir POS' },
    { href: '/prescription', label: 'Pengeluaran Resep' },
    { href: '/inventory', label: 'Katalog Obat' },
    { href: '/warehouse', label: 'Barang Datang' },
    { href: '/expiry', label: 'Kedaluwarsa' },
    { href: '/pricing', label: 'Harga & Import' },
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="top-navbar">
      {/* Brand & Store Name */}
      <div className="navbar-brand">
        <div className="navbar-store-name">APOTEK SEHAT SENTOSA</div>
        <div className="navbar-store-tag">Sistem Terpadu POS &amp; Resep</div>
      </div>

      {/* Nav Links Bar */}
      <nav className="navbar-links">
        {navLinks.map((link) => {
          const active = isActive(link.href);
          const isPrescription = link.href === '/prescription';

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`navbar-link ${active ? 'navbar-link-active' : ''} ${
                isPrescription ? 'navbar-link-prescription' : ''
              }`}
            >
              <span>{link.label}</span>
              {isPrescription && <span className="navbar-rx-badge">Rx</span>}
            </Link>
          );
        })}
      </nav>

      {/* Right Side Status & Theme Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          onClick={toggleTheme}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: '6px',
            border: '1px solid var(--slate-200)',
            background: 'var(--slate-50)',
            color: isDark ? '#fbbf24' : 'var(--slate-600)',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title={isDark ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
        >
          {isDark ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
          <span>{isDark ? 'Gelap' : 'Terang'}</span>
        </button>

        <div className="navbar-status">
          <span className="navbar-status-dot" />
          <span className="navbar-status-text">Kasir &amp; Resep Online</span>
        </div>
      </div>
    </header>
  );
}
