'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../../components/auth-context';
import { Button, ErrorState, LoadingState } from '../../components/ui';
import { dashboardNav, isActive } from '../../lib/nav';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading, error, refresh } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !error && !user) {
      router.replace('/login');
    }
  }, [loading, error, user, router]);

  if (loading) {
    return (
      <div className="container">
        <LoadingState label="Chargement de votre espace…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <ErrorState title="Espace indisponible" action={
          <Button variant="secondary" onClick={() => void refresh()}>
            Réessayer
          </Button>
        }>
          {error}
        </ErrorState>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const groups = dashboardNav(user.roles);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <nav aria-label="Navigation de l'espace connecté">
          {groups.map((group) => (
            <div key={group.section}>
              <p className="app-sidebar__heading">{group.section}</p>
              <ul className="side-nav">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="side-nav__link"
                      aria-current={
                        isActive(pathname, item) ? 'page' : undefined
                      }
                    >
                      {item.label}
                      {item.description ? (
                        <span className="side-nav__desc">
                          {item.description}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="app-main">{children}</div>
    </div>
  );
}
