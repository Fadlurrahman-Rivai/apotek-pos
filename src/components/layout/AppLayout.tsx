'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import Sidebar from '@/components/layout/Sidebar';
import AppInitializer from '@/components/layout/AppInitializer';

function MainLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (!loading && !user && !isLoginPage) {
      router.replace('/login');
    }
  }, [user, loading, isLoginPage, router]);

  // Jika di halaman login, tampilkan langsung tanpa sidebar
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Jika masih memuat data sesi dari storage
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          color: 'var(--teal-700)',
          fontWeight: 600,
          fontSize: '0.95rem',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3px solid var(--teal-200)',
              borderTopColor: 'var(--teal-600)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          <div>Memverifikasi sesi kasir &amp; login...</div>
          <style jsx>{`
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
          `}</style>
        </div>
      </div>
    );
  }

  // Jika belum login dan bukan halaman login, tahan render sebelum diarahkan
  if (!user) {
    return null;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-wrapper">
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppInitializer />
        <MainLayoutContent>{children}</MainLayoutContent>
      </AuthProvider>
    </ThemeProvider>
  );
}
