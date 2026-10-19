'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { facilityTypeLabel, governorateLabel, sectorLabel } from '../../../lib/labels';
import { ConfirmDialog } from '../../../components/confirm-dialog';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  buttonClass
} from '../../../components/ui';

interface Affiliation {
  id: string;
  status: string;
  requestedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  endDate: string | null;
  createdAt: string;
  facility: {
    id: string;
    displayName: string;
    sector: string;
    type: string;
    governorate: string;
    city: string;
    verificationStatus: string;
    isPubliclyListed: boolean;
  };
}

const ACTIVE_STATUSES = ['REQUESTED', 'VERIFIED'];

export default function MyAffiliationsPage() {
  const router = useRouter();
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [endTarget, setEndTarget] = useState<Affiliation | null>(null);
  const [ending, setEnding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/doctors/me/affiliations');
      if (response.status === 401) {
        router.replace('/login');
        return;
      }
      if (!response.ok) {
        setError('Impossible de charger vos affiliations.');
        return;
      }
      const data = (await response.json()) as Affiliation[];
      setAffiliations(data);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function endAffiliation() {
    if (!endTarget) {
      return;
    }
    setEnding(true);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/api/facilities/${endTarget.facility.id}/affiliations/${endTarget.id}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        setMessage('Impossible de mettre fin à cette affiliation.');
        return;
      }
      setEndTarget(null);
      await load();
    } finally {
      setEnding(false);
    }
  }

  return (
    <main className="container">
      <PageHeader
        eyebrow="Espace médecin"
        title="Mes affiliations"
        description="Établissements où vous exercez et agendas de consultation associés."
      >
        <Link href="/facilities" className={buttonClass('secondary')}>
          Demander une affiliation
        </Link>
      </PageHeader>

      {loading ? <LoadingState label="Chargement de vos affiliations…" /> : null}
      {error ? (
        <ErrorState
          title="Affiliations indisponibles"
          action={<Button onClick={() => void load()}>Réessayer</Button>}
        >
          {error}
        </ErrorState>
      ) : null}
      {message ? <Alert variant="danger">{message}</Alert> : null}

      {!loading && !error && affiliations.length === 0 ? (
        <EmptyState icon="🏥" title="Aucune affiliation">
          Aucune affiliation pour le moment.
        </EmptyState>
      ) : null}

      {affiliations.map((affiliation) => (
        <Card key={affiliation.id}>
          <div className="card__header">
            <h2 className="card__title">
              <Link href={`/facilities/${affiliation.facility.id}`}>
                {affiliation.facility.displayName}
              </Link>
            </h2>
            <StatusBadge status={affiliation.status} />
          </div>
          <p className="card__meta">
            {facilityTypeLabel(affiliation.facility.type)} ·{' '}
            {sectorLabel(affiliation.facility.sector)} ·{' '}
            {governorateLabel(affiliation.facility.governorate)},{' '}
            {affiliation.facility.city}
          </p>
          <p className="muted">
            Demandée le{' '}
            {new Date(affiliation.requestedAt).toLocaleDateString('fr-FR')}
          </p>
          {affiliation.decisionReason ? (
            <p className="muted">Motif : {affiliation.decisionReason}</p>
          ) : null}
          {ACTIVE_STATUSES.includes(affiliation.status) ? (
            <div className="btn-row">
              <Link
                href={`/dashboard/schedules/${affiliation.id}`}
                className={buttonClass('secondary', { size: 'sm' })}
              >
                Gérer l’agenda de consultation
              </Link>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setEndTarget(affiliation)}
              >
                Mettre fin à l’affiliation
              </Button>
            </div>
          ) : null}
        </Card>
      ))}

      <ConfirmDialog
        open={endTarget !== null}
        title="Mettre fin à cette affiliation ?"
        description={
          endTarget
            ? `L’affiliation avec ${endTarget.facility.displayName} sera terminée.`
            : undefined
        }
        confirmLabel="Mettre fin"
        cancelLabel="Conserver"
        danger
        loading={ending}
        onCancel={() => setEndTarget(null)}
        onConfirm={() => void endAffiliation()}
      />
    </main>
  );
}
