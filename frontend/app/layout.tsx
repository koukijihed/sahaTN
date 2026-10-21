import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '../components/auth-context';
import { DemoBanner } from '../components/demo-banner';
import { SiteFooter } from '../components/site-footer';
import { SiteHeader } from '../components/site-header';
import './globals.css';

export const metadata: Metadata = {
  title: 'SahaTN — démonstration',
  description:
    'Prototype de démonstration (données fictives, aucune donnée médicale réelle).'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          <a className="skip-link" href="#main-content">
            Aller au contenu principal
          </a>
          <DemoBanner />
          <SiteHeader />
          <div id="main-content" className="site-content" tabIndex={-1}>
            {children}
          </div>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
