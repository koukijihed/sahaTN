'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isActive, PUBLIC_NAV } from '../lib/nav';
import { useAuth } from './auth-context';
import { buttonClass } from './ui';

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function handleLogout() {
    // Navigue d'abord vers une page publique pour ne pas entrer en conflit avec
    // la redirection de l'espace connecté (sinon l'utilisateur atterrit sur
    // /login au lieu de l'accueil).
    router.push('/');
    await logout();
    router.refresh();
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand" href="/" aria-label="SahaTN — accueil">
          <span className="brand__mark" aria-hidden="true">
            +
          </span>
          <span>
            SahaTN
            <span className="brand__sub">Santé Tunisie</span>
          </span>
        </Link>

        <button
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Fermer' : 'Menu'}
        </button>

        <nav
          id="primary-navigation"
          className={`site-nav${open ? ' is-open' : ''}`}
          aria-label="Navigation principale"
        >
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-link"
              aria-current={isActive(pathname, item) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}

          <div className="header-actions">
            {loading ? null : user ? (
              <>
                <Link
                  href="/dashboard"
                  className="nav-link"
                  aria-current={
                    pathname.startsWith('/dashboard') ? 'page' : undefined
                  }
                >
                  Tableau de bord
                </Link>
                <button
                  type="button"
                  className={buttonClass('secondary', { size: 'sm' })}
                  onClick={() => void handleLogout()}
                >
                  Se déconnecter
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className={buttonClass('secondary', { size: 'sm' })}
                >
                  Se connecter
                </Link>
                <Link
                  href="/register"
                  className={buttonClass('primary', { size: 'sm' })}
                >
                  Créer un compte
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
