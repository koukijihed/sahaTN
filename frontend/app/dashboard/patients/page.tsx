'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader
} from '../../../components/ui';

interface PatientWithAccess {
  patientUserId: string;
  permissions: string[];
  hasEmergencyAccess: boolean;
}

export default function PatientsPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<PatientWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/medical-records/patients');
      if (response.status === 401) {
        router.replace('/login');
        return;
      }
      if (!response.ok) {
        setError('Impossible de charger les patients autorisés.');
        return;
      }
      setPatients((await response.json()) as PatientWithAccess[]);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="container">
      <PageHeader
        eyebrow="Espace praticien"
        title="Dossiers autorisés"
        description="Seuls les dossiers pour lesquels le patient a accordé un consentement (ou un accès d’urgence en cours) apparaissent ici."
      />

      {loading ? <LoadingState label="Chargement des dossiers…" /> : null}
      {error ? (
        <ErrorState
          title="Dossiers indisponibles"
          action={<Button onClick={() => void load()}>Réessayer</Button>}
        >
          {error}
        </ErrorState>
      ) : null}

      {!loading && !error && patients.length === 0 ? (
        <EmptyState icon="🔒" title="Aucun dossier autorisé">
          Aucun patient ne vous a accordé d’accès pour le moment.
        </EmptyState>
      ) : null}

      <div className="grid grid--cards">
        {patients.map((patient) => (
          <Card key={patient.patientUserId} className="card--interactive">
            <div className="card__header">
              <h2 className="card__title">Patient</h2>
              {patient.hasEmergencyAccess ? (
                <Badge variant="danger">Accès d’urgence</Badge>
              ) : null}
            </div>
            <p className="card__meta mono">{patient.patientUserId}</p>
            <p className="muted">
              Portées : {patient.permissions.join(', ') || '—'}
            </p>
            <Link
              href={`/dashboard/patients/${patient.patientUserId}`}
              className="btn btn--secondary btn--sm"
            >
              Ouvrir le dossier
            </Link>
          </Card>
        ))}
      </div>
    </main>
  );
}
