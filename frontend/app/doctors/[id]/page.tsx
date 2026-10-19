'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { facilityTypeLabel, governorateLabel, sectorLabel } from '../../../lib/labels';
import type { DoctorPublicView } from '../../../lib/types';
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

export default function DoctorDetailPage() {
  const params = useParams<{ id: string }>();
  const [doctor, setDoctor] = useState<DoctorPublicView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/doctors/${params.id}`);
      if (response.status === 404) {
        setError('Médecin introuvable ou non public.');
        return;
      }
      if (!response.ok) {
        setError('Impossible de charger ce médecin.');
        return;
      }
      const data = (await response.json()) as { profile: DoctorPublicView };
      setDoctor(data.profile);
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
          { href: '/doctors', label: 'Médecins' },
          { label: doctor?.displayName ?? 'Fiche' }
        ]}
      />

      {loading ? <LoadingState label="Chargement du profil…" /> : null}

      {error ? (
        <ErrorState
          title="Profil indisponible"
          action={
            <>
              <Button onClick={() => void load()}>Réessayer</Button>
              <Link href="/doctors" className="btn btn--secondary">
                Retour à l’annuaire
              </Link>
            </>
          }
        >
          {error}
        </ErrorState>
      ) : null}

      {doctor ? (
        <>
          <PageHeader
            eyebrow="Annuaire public"
            title={doctor.displayName}
            description={
              doctor.specialties.length > 0 ? (
                <span>
                  {doctor.specialties.map((specialty) => (
                    <Badge key={specialty.id} variant="teal">
                      {specialty.labelFr}
                    </Badge>
                  ))}
                </span>
              ) : (
                'Spécialité non précisée'
              )
            }
          />

          {doctor.professionalDescription ? (
            <p>{doctor.professionalDescription}</p>
          ) : null}

          <Card>
            <p>
              <strong>Expérience :</strong>{' '}
              {`${doctor.yearsOfExperience ?? 0} ans`}
            </p>
            <p style={{ marginBottom: 0 }}>
              <strong>Langues :</strong>{' '}
              {doctor.languages.join(', ') || 'non précisées'}
            </p>
          </Card>

          <section className="section">
            <h2>Lieux d’exercice (vérifiés)</h2>
            {doctor.practiceFacilities.length === 0 ? (
              <EmptyState icon="🏥" title="Aucun lieu d’exercice">
                Aucun lieu d’exercice publié pour le moment.
              </EmptyState>
            ) : (
              <div className="grid grid--cards">
                {doctor.practiceFacilities.map((facility) => (
                  <Card key={facility.id} className="card--interactive">
                    <h3 className="card__title">
                      <Link href={`/facilities/${facility.id}`}>
                        {facility.displayName}
                      </Link>
                    </h3>
                    <p className="card__meta">
                      {facilityTypeLabel(facility.type)} ·{' '}
                      {sectorLabel(facility.sector)} ·{' '}
                      {governorateLabel(facility.governorate)}, {facility.city}
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
