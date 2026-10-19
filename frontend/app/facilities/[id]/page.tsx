'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { facilityTypeLabel, governorateLabel, sectorLabel } from '../../../lib/labels';
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader
} from '../../../components/ui';

interface AffiliatedDoctor {
  id: string;
  displayName: string;
  specialties: {
    id: string;
    code: string;
    labelFr: string;
    labelAr: string | null;
  }[];
}

interface FacilityDetail {
  id: string;
  displayName: string;
  officialName: string | null;
  description: string | null;
  sector: string;
  type: string;
  addressLine: string;
  city: string;
  governorate: string;
  delegation: string | null;
  postalCode: string | null;
  phone: string | null;
  websiteUrl: string | null;
  verifiedAffiliations: { id: string; doctorProfile: AffiliatedDoctor }[];
}

export default function FacilityDetailPage() {
  const params = useParams<{ id: string }>();
  const [facility, setFacility] = useState<FacilityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/facilities/${params.id}`);
      if (response.status === 404) {
        setError('Établissement introuvable ou non public.');
        return;
      }
      if (!response.ok) {
        setError('Impossible de charger cet établissement.');
        return;
      }
      const data = (await response.json()) as FacilityDetail;
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

  return (
    <main className="container">
      <Breadcrumb
        items={[
          { href: '/', label: 'Accueil' },
          { href: '/facilities', label: 'Établissements' },
          { label: facility?.displayName ?? 'Fiche' }
        ]}
      />

      {loading ? <LoadingState label="Chargement de l’établissement…" /> : null}

      {error ? (
        <ErrorState
          title="Établissement indisponible"
          action={
            <>
              <Button onClick={() => void load()}>Réessayer</Button>
              <Link href="/facilities" className="btn btn--secondary">
                Retour à l’annuaire
              </Link>
            </>
          }
        >
          {error}
        </ErrorState>
      ) : null}

      {facility ? (
        <>
          <PageHeader
            eyebrow="Annuaire public"
            title={facility.displayName}
            description={facility.officialName ?? undefined}
          />

          {facility.description ? <p>{facility.description}</p> : null}

          <Card>
            <p>
              <Badge variant="info">{facilityTypeLabel(facility.type)}</Badge>{' '}
              <Badge variant="teal">{sectorLabel(facility.sector)}</Badge>
            </p>
            <p>
              {facility.addressLine}
              <br />
              {facility.postalCode ? `${facility.postalCode} ` : ''}
              {facility.city}, {governorateLabel(facility.governorate)}
            </p>
            {facility.phone ? (
              <p>
                <strong>Téléphone :</strong> {facility.phone}
              </p>
            ) : null}
            {facility.websiteUrl ? (
              <p style={{ marginBottom: 0 }}>
                <strong>Site web :</strong>{' '}
                <a href={facility.websiteUrl} target="_blank" rel="noreferrer">
                  {facility.websiteUrl}
                </a>
              </p>
            ) : null}
          </Card>

          <section className="section">
            <h2>Professionnels affiliés (vérifiés)</h2>
            {facility.verifiedAffiliations.length === 0 ? (
              <EmptyState icon="👩‍⚕️" title="Aucun professionnel affilié">
                Aucun professionnel affilié pour le moment.
              </EmptyState>
            ) : (
              <div className="grid grid--cards">
                {facility.verifiedAffiliations.map((affiliation) => (
                  <Card key={affiliation.id} className="card--interactive">
                    <h3 className="card__title">
                      <Link href={`/doctors/${affiliation.doctorProfile.id}`}>
                        {affiliation.doctorProfile.displayName}
                      </Link>
                    </h3>
                    <p className="card__meta">
                      {affiliation.doctorProfile.specialties
                        .map((specialty) => specialty.labelFr)
                        .join(', ') || 'Spécialité non précisée'}
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
