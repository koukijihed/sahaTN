'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../../lib/api';
import { facilityTypeLabel, governorateLabel, sectorLabel } from '../../../../lib/labels';
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge
} from '../../../../components/ui';

interface FacilityEvent {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  createdAt: string;
}

interface FacilityRequest {
  id: string;
  status: string;
  submittedAt: string | null;
  decisionAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  events: FacilityEvent[];
}

interface FacilityManage {
  id: string;
  displayName: string;
  officialName: string | null;
  sector: string;
  type: string;
  governorate: string;
  city: string;
  addressLine: string;
  phone: string | null;
  websiteUrl: string | null;
  verificationStatus: string;
  isPubliclyListed: boolean;
  managers: { id: string; userId: string; createdAt: string }[];
  latestVerificationRequest: FacilityRequest | null;
}

export default function FacilityManagePage() {
  const params = useParams<{ id: string }>();
  const [facility, setFacility] = useState<FacilityManage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/facilities/${params.id}/manage`);
      if (response.status === 401) {
        setError('Connectez-vous pour accéder à cet espace.');
        return;
      }
      if (response.status === 403) {
        setError('Vous ne gérez pas cet établissement.');
        return;
      }
      if (!response.ok) {
        setError('Impossible de charger cet établissement.');
        return;
      }
      const data = (await response.json()) as FacilityManage;
      setFacility(data);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitVerification() {
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/api/facilities/${params.id}/verification`,
        {
          method: 'POST',
          body: JSON.stringify({ submit: true })
        }
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setMessage(data?.message ?? 'Impossible de soumettre la demande.');
        return;
      }
      await load();
    } catch {
      setMessage('Erreur réseau.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container">
      <Breadcrumb
        items={[
          { href: '/facilities', label: 'Établissements' },
          { href: `/facilities/${params.id}`, label: facility?.displayName ?? 'Fiche' },
          { label: 'Gestion' }
        ]}
      />

      {loading ? <LoadingState label="Chargement de l’espace de gestion…" /> : null}

      {error ? (
        <ErrorState
          title="Espace de gestion indisponible"
          action={<Button onClick={() => void load()}>Réessayer</Button>}
        >
          {error}
        </ErrorState>
      ) : null}

      {facility ? (
        <>
          <PageHeader
            eyebrow="Espace de gestion"
            title={facility.displayName}
            description={`${facilityTypeLabel(facility.type)} · ${sectorLabel(
              facility.sector
            )} · ${governorateLabel(facility.governorate)}, ${facility.city}`}
          />

          <Card>
            <div className="card__header">
              <h2 className="card__title">Vérification</h2>
              <StatusBadge status={facility.verificationStatus} />
            </div>
            <p className="muted">
              Référencé dans l’annuaire public :{' '}
              <strong>{facility.isPubliclyListed ? 'Oui' : 'Non'}</strong>
            </p>

            {facility.latestVerificationRequest ? (
              <>
                <p>
                  Dernière demande :{' '}
                  <StatusBadge
                    status={facility.latestVerificationRequest.status}
                  />{' '}
                  <span className="muted">
                    {facility.latestVerificationRequest.submittedAt
                      ? `soumise le ${new Date(
                          facility.latestVerificationRequest.submittedAt
                        ).toLocaleDateString('fr-FR')}`
                      : 'brouillon'}
                  </span>
                </p>
                {facility.latestVerificationRequest.events.length > 0 ? (
                  <ul className="muted">
                    {facility.latestVerificationRequest.events.map((event) => (
                      <li key={event.id}>
                        <strong>{event.action}</strong>
                        {event.toStatus ? ` → ${event.toStatus}` : ''}
                        {event.reason ? ` (${event.reason})` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="muted">Aucune demande de vérification.</p>
            )}

            {message ? <Alert variant="danger">{message}</Alert> : null}

            <Button loading={submitting} onClick={() => void submitVerification()}>
              {submitting ? 'Envoi…' : 'Soumettre la demande de vérification'}
            </Button>
          </Card>

          <Card>
            <h2 className="card__title">Gestionnaires</h2>
            {facility.managers.length === 0 ? (
              <EmptyState icon="👤" title="Aucun gestionnaire nommé" />
            ) : (
              <ul className="muted">
                {facility.managers.map((manager) => (
                  <li key={manager.id}>
                    <span className="mono">{manager.userId}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </main>
  );
}
