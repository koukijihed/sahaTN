'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  StatGrid,
  StatusBadge,
  buttonClass
} from '../../../components/ui';

interface RecordSummary {
  patientUserId: string;
  recordId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  counts: {
    encounters: number;
    observations: number;
    diagnoses: number;
    allergies: number;
  };
}

interface EncounterSummary {
  id: string;
  type: string;
  occurredAt: string;
  doctor: { id: string; displayName: string };
  facility: { id: string; displayName: string } | null;
  appointmentId: string | null;
  recordStatus: string;
}

interface Observation {
  id: string;
  category: string;
  code: string | null;
  label: string;
  valueText: string | null;
  valueNumeric: number | null;
  unit: string | null;
  certainty: string;
  observedAt: string;
}

interface Diagnosis {
  id: string;
  code: string | null;
  label: string;
  description: string | null;
  status: string;
  diagnosedAt: string;
}

interface EncounterDetail extends EncounterSummary {
  chiefComplaint: string | null;
  notes: string | null;
  observations: Observation[];
  diagnoses: Diagnosis[];
}

interface Allergy {
  id: string;
  allergen: string;
  reaction: string | null;
  severity: string | null;
  source: string;
  certainty: string;
  status: string;
  recordedAt: string;
}

function formatObservation(observation: Observation): string {
  const value =
    observation.valueText ?? observation.valueNumeric ?? null;
  if (value === null) {
    return '';
  }
  return ` : ${value}${observation.unit ? ` ${observation.unit}` : ''}`;
}

export default function MedicalRecordPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<RecordSummary | null>(null);
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [detail, setDetail] = useState<EncounterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, encountersRes, diagnosesRes, allergiesRes] =
        await Promise.all([
          apiFetch('/api/medical-records/me'),
          apiFetch('/api/medical-records/me/encounters'),
          apiFetch('/api/medical-records/me/diagnoses'),
          apiFetch('/api/medical-records/me/allergies')
        ]);
      if (summaryRes.status === 401) {
        router.replace('/login');
        return;
      }
      if (!summaryRes.ok) {
        setError('Impossible de charger votre dossier médical.');
        return;
      }
      setSummary((await summaryRes.json()) as RecordSummary);
      setEncounters((await encountersRes.json()) as EncounterSummary[]);
      setDiagnoses((await diagnosesRes.json()) as Diagnosis[]);
      setAllergies((await allergiesRes.json()) as Allergy[]);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openEncounter(encounterId: string) {
    setDetail(null);
    const response = await apiFetch(
      `/api/medical-records/me/encounters/${encounterId}`
    );
    if (response.ok) {
      setDetail((await response.json()) as EncounterDetail);
    }
  }

  if (loading) {
    return (
      <main className="container">
        <PageHeader eyebrow="Espace patient" title="Mon dossier médical" />
        <p className="skeleton" style={{ width: '60%' }} />
        <p className="skeleton" style={{ width: '90%' }} />
        <p className="skeleton" style={{ width: '75%' }} />
      </main>
    );
  }

  return (
    <main className="container">
      <PageHeader
        eyebrow="Espace patient"
        title="Mon dossier médical"
        description={
          <span className="mono">
            Dossier {summary?.recordId ?? '—'} · statut{' '}
            {summary?.status ?? '—'}
          </span>
        }
      />

      {error ? (
        <Alert variant="danger" title="Dossier indisponible">
          {error}
        </Alert>
      ) : null}

      {summary ? (
        <Card>
          <StatGrid>
            <Stat value={summary.counts.encounters} label="Consultations" />
            <Stat value={summary.counts.observations} label="Observations" />
            <Stat value={summary.counts.diagnoses} label="Diagnostics" />
            <Stat value={summary.counts.allergies} label="Allergies" />
          </StatGrid>
        </Card>
      ) : null}

      <div className="btn-row" style={{ marginBottom: '1.5rem' }}>
        <Link
          href="/dashboard/records/access"
          className={buttonClass('secondary', { size: 'sm' })}
        >
          Accès & consentements
        </Link>
        <Link
          href="/dashboard/records/documents"
          className={buttonClass('secondary', { size: 'sm' })}
        >
          Mes documents
        </Link>
      </div>

      <section className="section">
        <h2>Consultations</h2>
        {encounters.length === 0 ? (
          <EmptyState icon="🩺" title="Aucune consultation">
            Aucune consultation enregistrée.
          </EmptyState>
        ) : (
          encounters.map((encounter) => (
            <Card key={encounter.id}>
              <div className="card__header">
                <h3 className="card__title">
                  {new Date(encounter.occurredAt).toLocaleString('fr-FR')}
                </h3>
                <Badge variant="info">{encounter.type}</Badge>
              </div>
              <p className="card__meta">
                {encounter.doctor.displayName}
                {encounter.facility
                  ? ` · ${encounter.facility.displayName}`
                  : ''}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void openEncounter(encounter.id)}
              >
                Voir le détail
              </Button>
            </Card>
          ))
        )}
      </section>

      {detail ? (
        <Card>
          <h3>Détail de la consultation</h3>
          {detail.chiefComplaint ? (
            <p>
              <strong>Motif :</strong> {detail.chiefComplaint}
            </p>
          ) : null}
          {detail.notes ? (
            <p>
              <strong>Notes :</strong> {detail.notes}
            </p>
          ) : null}
          <h4>Observations</h4>
          {detail.observations.length === 0 ? (
            <p className="muted">Aucune observation.</p>
          ) : (
            <ul>
              {detail.observations.map((observation) => (
                <li key={observation.id}>
                  {observation.label}
                  {formatObservation(observation)}
                </li>
              ))}
            </ul>
          )}
          <h4>Diagnostics</h4>
          {detail.diagnoses.length === 0 ? (
            <p className="muted">Aucun diagnostic.</p>
          ) : (
            <ul>
              {detail.diagnoses.map((diagnosis) => (
                <li key={diagnosis.id}>
                  {diagnosis.label} <StatusBadge status={diagnosis.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <section className="section">
        <h2>Diagnostics</h2>
        {diagnoses.length === 0 ? (
          <p className="muted">Aucun diagnostic.</p>
        ) : (
          <ul>
            {diagnoses.map((diagnosis) => (
              <li key={diagnosis.id}>
                {diagnosis.label} <StatusBadge status={diagnosis.status} />{' '}
                <span className="muted">
                  {new Date(diagnosis.diagnosedAt).toLocaleDateString('fr-FR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>Allergies</h2>
        {allergies.length === 0 ? (
          <p className="muted">Aucune allergie déclarée.</p>
        ) : (
          <ul>
            {allergies.map((allergy) => (
              <li key={allergy.id}>
                {allergy.allergen}
                {allergy.reaction ? ` — ${allergy.reaction}` : ''}{' '}
                {allergy.severity ? (
                  <Badge variant="warning">{allergy.severity}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
