'use client';

import Link from 'next/link';
import { useAuth } from '../../components/auth-context';
import {
  Badge,
  Card,
  PageHeader,
  StatusBadge
} from '../../components/ui';
import { dashboardNav } from '../../lib/nav';

const ROLE_LABELS: Record<string, string> = {
  PATIENT: 'Patient',
  DOCTOR: 'Praticien',
  FACILITY_STAFF: 'Établissement',
  ADMIN: 'Administrateur'
};

export default function DashboardPage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const groups = dashboardNav(user.roles).filter(
    (group) => group.section !== 'Général'
  );

  return (
    <main className="container">
      <PageHeader
        eyebrow="Espace connecté"
        title="Tableau de bord"
        description="Vue d’ensemble de votre compte et accès rapides à vos espaces."
      />

      <Card>
        <div className="card__header">
          <h2 className="card__title">Mon compte</h2>
          <StatusBadge status={user.status} />
        </div>
        <div className="stat-grid">
          <div className="stat">
            <span className="stat__label">Email</span>
            <span className="mono">{user.email ?? '—'}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Téléphone</span>
            <span className="mono">{user.phone ?? '—'}</span>
          </div>
        </div>
        <p style={{ marginTop: '1rem', marginBottom: 0 }}>
          <span className="muted">Rôles : </span>
          {user.roles.length === 0
            ? '—'
            : user.roles.map((role) => (
                <Badge key={role} variant="teal">
                  {ROLE_LABELS[role] ?? role}
                </Badge>
              ))}
        </p>
      </Card>

      {groups.map((group) => (
        <section className="section" key={group.section}>
          <h2>{group.section}</h2>
          <div className="grid grid--cards">
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="card card--interactive"
              >
                <h3 className="card__title">{item.label}</h3>
                {item.description ? (
                  <p className="card__meta">{item.description}</p>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
