'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, readCookie } from '../../../../lib/api';
import { ConfirmDialog } from '../../../../components/confirm-dialog';
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  Stat,
  StatGrid,
  StatusBadge
} from '../../../../components/ui';

const DOCUMENT_CATEGORIES = [
  'LAB_RESULT',
  'IMAGING',
  'REPORT',
  'PRESCRIPTION',
  'OTHER'
];

const OBSERVATION_CATEGORIES = [
  'VITAL_SIGN',
  'LABORATORY',
  'SYMPTOM',
  'MEASUREMENT',
  'EXAM_RESULT',
  'OTHER'
];

const ENCOUNTER_TYPES = [
  'CONSULTATION',
  'FOLLOW_UP',
  'TELECONSULTATION',
  'EMERGENCY',
  'OTHER'
];

interface AccessStatus {
  verified: boolean;
  recordExists: boolean;
  readAllowed: boolean;
  writeAllowed: boolean;
  permissions: string[];
  basis: string | null;
  emergencyActive: boolean;
  grantExpiresAt: string | null;
  emergencyExpiresAt: string | null;
}

interface RecordSummary {
  recordId: string;
  status: string;
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
  recordStatus: string;
}

interface Observation {
  id: string;
  category: string;
  label: string;
  valueText: string | null;
  valueNumeric: number | null;
  unit: string | null;
  observedAt: string;
}

interface Diagnosis {
  id: string;
  code: string | null;
  label: string;
  status: string;
  diagnosedAt: string;
}

interface Allergy {
  id: string;
  allergen: string;
  reaction: string | null;
  severity: string | null;
  status: string;
  recordedAt: string;
}

interface PatientDocument {
  id: string;
  category: string;
  originalName: string;
  detectedMimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  status: string;
  encounterId: string | null;
  uploadedByUserId: string;
  uploaderDoctorProfileId: string | null;
  createdAt: string;
  archivedAt: string | null;
  archiveReason: string | null;
}

export default function PatientRecordPage() {
  const params = useParams<{ patientUserId: string }>();
  const patientUserId = params?.patientUserId;
  const router = useRouter();

  const [access, setAccess] = useState<AccessStatus | null>(null);
  const [summary, setSummary] = useState<RecordSummary | null>(null);
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [observations, setObservations] = useState<Observation[] | null>(null);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[] | null>(null);
  const [allergies, setAllergies] = useState<Allergy[] | null>(null);
  const [documents, setDocuments] = useState<PatientDocument[] | null>(null);
  const [documentCategory, setDocumentCategory] = useState('LAB_RESULT');
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [justification, setJustification] = useState('');
  const [encounterForm, setEncounterForm] = useState({
    type: 'CONSULTATION',
    chiefComplaint: '',
    notes: ''
  });
  const [diagnosisForm, setDiagnosisForm] = useState({ label: '', code: '' });
  const [allergyForm, setAllergyForm] = useState({ allergen: '', reaction: '' });
  const [observationForm, setObservationForm] = useState({
    encounterId: '',
    category: 'VITAL_SIGN',
    label: '',
    valueText: ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PatientDocument | null>(
    null
  );
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    if (!patientUserId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const accessRes = await apiFetch(
        `/api/medical-records/patients/${patientUserId}/access`
      );
      if (accessRes.status === 401) {
        router.replace('/login');
        return;
      }
      if (!accessRes.ok) {
        setError('Impossible de vérifier vos droits d’accès.');
        return;
      }
      const accessBody = (await accessRes.json()) as AccessStatus;
      setAccess(accessBody);

      if (accessBody.readAllowed) {
        const [summaryRes, encountersRes, documentsRes] = await Promise.all([
          apiFetch(`/api/medical-records/patients/${patientUserId}`),
          apiFetch(`/api/medical-records/patients/${patientUserId}/encounters`),
          apiFetch(`/api/medical-records/patients/${patientUserId}/documents`)
        ]);
        if (summaryRes.ok) {
          setSummary((await summaryRes.json()) as RecordSummary);
        }
        if (encountersRes.ok) {
          setEncounters((await encountersRes.json()) as EncounterSummary[]);
        }
        if (documentsRes.ok) {
          setDocuments((await documentsRes.json()) as PatientDocument[]);
        } else {
          setDocuments(null);
        }
      } else {
        setSummary(null);
        setEncounters([]);
        setDocuments(null);
      }
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [patientUserId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const permissions = access?.permissions ?? [];
  const can = (permission: string) => permissions.includes(permission);

  async function requestEmergencyAccess() {
    if (!patientUserId) {
      return;
    }
    setMessage(null);
    const response = await apiFetch(
      `/api/medical-records/patients/${patientUserId}/emergency-access`,
      {
        method: 'POST',
        body: JSON.stringify({ justification })
      }
    );
    if (!response.ok) {
      setMessage(
        'Justification requise (au moins 20 caractères) ou accès refusé.'
      );
      return;
    }
    setJustification('');
    await load();
  }

  async function loadSection(
    section: 'observations' | 'diagnoses' | 'allergies'
  ) {
    if (!patientUserId) {
      return;
    }
    const response = await apiFetch(
      `/api/medical-records/patients/${patientUserId}/${section}`
    );
    if (!response.ok) {
      setMessage('Accès refusé pour cette section.');
      return;
    }
    const body = await response.json();
    if (section === 'observations') setObservations(body as Observation[]);
    if (section === 'diagnoses') setDiagnoses(body as Diagnosis[]);
    if (section === 'allergies') setAllergies(body as Allergy[]);
  }

  async function createEncounter() {
    if (!patientUserId) {
      return;
    }
    setMessage(null);
    const response = await apiFetch(
      `/api/medical-records/patients/${patientUserId}/encounters`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: encounterForm.type,
          occurredAt: new Date().toISOString(),
          chiefComplaint: encounterForm.chiefComplaint || undefined,
          notes: encounterForm.notes || undefined
        })
      }
    );
    if (!response.ok) {
      setMessage('Impossible de créer la consultation.');
      return;
    }
    setEncounterForm({ type: 'CONSULTATION', chiefComplaint: '', notes: '' });
    await load();
  }

  async function createDiagnosis() {
    if (!patientUserId) {
      return;
    }
    setMessage(null);
    const response = await apiFetch(
      `/api/medical-records/patients/${patientUserId}/diagnoses`,
      {
        method: 'POST',
        body: JSON.stringify({
          label: diagnosisForm.label,
          code: diagnosisForm.code || undefined,
          diagnosedAt: new Date().toISOString()
        })
      }
    );
    if (!response.ok) {
      setMessage('Impossible d’ajouter le diagnostic.');
      return;
    }
    setDiagnosisForm({ label: '', code: '' });
    await loadSection('diagnoses');
  }

  async function createAllergy() {
    if (!patientUserId) {
      return;
    }
    setMessage(null);
    const response = await apiFetch(
      `/api/medical-records/patients/${patientUserId}/allergies`,
      {
        method: 'POST',
        body: JSON.stringify({
          allergen: allergyForm.allergen,
          reaction: allergyForm.reaction || undefined,
          recordedAt: new Date().toISOString()
        })
      }
    );
    if (!response.ok) {
      setMessage('Impossible d’ajouter l’allergie.');
      return;
    }
    setAllergyForm({ allergen: '', reaction: '' });
    await loadSection('allergies');
  }

  async function createObservation() {
    if (!patientUserId || !observationForm.encounterId) {
      setMessage('Sélectionnez une consultation.');
      return;
    }
    setMessage(null);
    const response = await apiFetch(
      `/api/medical-records/patients/${patientUserId}/encounters/${observationForm.encounterId}/observations`,
      {
        method: 'POST',
        body: JSON.stringify({
          category: observationForm.category,
          label: observationForm.label,
          valueText: observationForm.valueText || undefined,
          observedAt: new Date().toISOString()
        })
      }
    );
    if (!response.ok) {
      setMessage('Impossible d’ajouter l’observation.');
      return;
    }
    setObservationForm({
      encounterId: observationForm.encounterId,
      category: 'VITAL_SIGN',
      label: '',
      valueText: ''
    });
    await loadSection('observations');
  }

  async function uploadDocument(file: File) {
    if (!patientUserId) {
      return;
    }
    setUploadingDocument(true);
    setMessage(null);
    const form = new FormData();
    form.append('category', documentCategory);
    form.append('file', file);
    const csrf = readCookie('sahatn_csrf');
    try {
      // FormData : on n'utilise pas apiFetch (qui fixerait un Content-Type JSON).
      const response = await fetch(
        `/api/medical-records/patients/${patientUserId}/documents`,
        {
          method: 'POST',
          credentials: 'include',
          headers: csrf ? { 'x-csrf-token': csrf } : undefined,
          body: form
        }
      );
      if (!response.ok) {
        setMessage(
          response.status === 413
            ? 'Fichier trop volumineux (5 Mo maximum).'
            : 'Dépôt refusé : format non supporté (PDF, PNG, JPEG, WEBP).'
        );
        return;
      }
      if (documentInputRef.current) {
        documentInputRef.current.value = '';
      }
      await load();
    } catch {
      setMessage('Impossible de contacter le serveur.');
    } finally {
      setUploadingDocument(false);
    }
  }

  async function archiveDocument() {
    if (!patientUserId || !archiveTarget) {
      return;
    }
    setArchiving(true);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/api/medical-records/patients/${patientUserId}/documents/${archiveTarget.id}/archive`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      if (!response.ok) {
        setMessage('Impossible d’archiver ce document.');
        return;
      }
      setArchiveTarget(null);
      await load();
    } finally {
      setArchiving(false);
    }
  }

  if (loading) {
    return (
      <main className="container">
        <PageHeader eyebrow="Espace praticien" title="Dossier du patient" />
        <p className="skeleton" style={{ width: '45%' }} />
        <p className="skeleton" style={{ width: '85%' }} />
        <p className="skeleton" style={{ width: '70%' }} />
      </main>
    );
  }

  return (
    <main className="container">
      <Breadcrumb
        items={[
          { href: '/dashboard/patients', label: 'Dossiers autorisés' },
          { label: 'Dossier patient' }
        ]}
      />

      <PageHeader
        eyebrow="Espace praticien"
        title="Dossier du patient"
        description={<span className="mono">{patientUserId}</span>}
      />

      {error ? (
        <ErrorState
          title="Dossier indisponible"
          action={<Button onClick={() => void load()}>Réessayer</Button>}
        >
          {error}
        </ErrorState>
      ) : null}
      {message ? <Alert variant="danger">{message}</Alert> : null}

      {access ? (
        <Card>
          <div className="card__header">
            <div className="btn-row">
              <Badge variant={access.readAllowed ? 'success' : 'neutral'}>
                {access.readAllowed ? 'Accès lecture' : 'Aucun accès'}
              </Badge>
              {access.writeAllowed ? (
                <Badge variant="warning">Accès écriture</Badge>
              ) : null}
              {access.emergencyActive ? (
                <Badge variant="danger">Urgence</Badge>
              ) : null}
            </div>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            Origine : {access.basis ?? '—'} · portées :{' '}
            {access.permissions.join(', ') || '—'}
          </p>
        </Card>
      ) : null}

      {!access?.readAllowed ? (
        <Card>
          <h2 className="card__title">Accès d’urgence (lecture seule)</h2>
          <p className="muted">
            Réservé aux situations d’urgence ; tracé et notifié au patient.
          </p>
          <Field
            label="Justification"
            htmlFor="justification"
            hint="20 caractères minimum"
          >
            <input
              id="justification"
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              placeholder="Patient inconscient admis aux urgences…"
            />
          </Field>
          <Button
            variant="danger"
            onClick={() => void requestEmergencyAccess()}
          >
            Déclencher l’accès d’urgence
          </Button>
        </Card>
      ) : null}

      {access?.readAllowed ? (
        <>
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

          <section className="section">
            <h2>Consultations</h2>
            {encounters.length === 0 ? (
              <EmptyState icon="🩺" title="Aucune consultation">
                Aucune consultation visible.
              </EmptyState>
            ) : (
              <ul className="muted">
                {encounters.map((encounter) => (
                  <li key={encounter.id}>
                    {new Date(encounter.occurredAt).toLocaleString('fr-FR')} ·{' '}
                    <Badge variant="info">{encounter.type}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {can('VIEW_OBSERVATIONS') ? (
            <Card>
              <div className="card__header">
                <h2 className="card__title">Observations</h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadSection('observations')}
                >
                  Charger les observations
                </Button>
              </div>
              {observations ? (
                observations.length === 0 ? (
                  <p className="muted">Aucune observation.</p>
                ) : (
                  <ul>
                    {observations.map((observation) => (
                      <li key={observation.id}>
                        {observation.label}
                        {observation.valueText
                          ? ` : ${observation.valueText}`
                          : ''}
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </Card>
          ) : null}

          {can('VIEW_DIAGNOSES') ? (
            <Card>
              <div className="card__header">
                <h2 className="card__title">Diagnostics</h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadSection('diagnoses')}
                >
                  Charger les diagnostics
                </Button>
              </div>
              {diagnoses ? (
                diagnoses.length === 0 ? (
                  <p className="muted">Aucun diagnostic.</p>
                ) : (
                  <ul>
                    {diagnoses.map((diagnosis) => (
                      <li key={diagnosis.id}>
                        {diagnosis.label}{' '}
                        <StatusBadge status={diagnosis.status} />
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </Card>
          ) : null}

          {can('VIEW_ALLERGIES') ? (
            <Card>
              <div className="card__header">
                <h2 className="card__title">Allergies</h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadSection('allergies')}
                >
                  Charger les allergies
                </Button>
              </div>
              {allergies ? (
                allergies.length === 0 ? (
                  <p className="muted">Aucune allergie.</p>
                ) : (
                  <ul>
                    {allergies.map((allergy) => (
                      <li key={allergy.id}>
                        {allergy.allergen}
                        {allergy.reaction ? ` — ${allergy.reaction}` : ''}
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </Card>
          ) : null}

          {can('VIEW_DOCUMENTS') ? (
            <section className="section">
              <h2>Documents médicaux</h2>
              {!documents || documents.length === 0 ? (
                <EmptyState icon="📄" title="Aucun document">
                  Aucun document visible.
                </EmptyState>
              ) : (
                <div className="grid grid--cards">
                  {documents.map((document) => (
                    <Card key={document.id}>
                      <div className="card__header">
                        <h3
                          className="card__title truncate"
                          title={document.originalName}
                        >
                          {document.originalName}
                        </h3>
                        <StatusBadge status={document.status} />
                      </div>
                      <p className="card__meta">
                        <Badge variant="info">{document.category}</Badge> ·{' '}
                        {document.detectedMimeType} ·{' '}
                        {new Date(document.createdAt).toLocaleString('fr-FR')}
                      </p>
                      {document.status === 'ARCHIVED' ? (
                        <p className="muted" style={{ marginBottom: 0 }}>
                          Archivé
                          {document.archiveReason
                            ? ` — ${document.archiveReason}`
                            : ''}
                        </p>
                      ) : (
                        <div className="btn-row">
                          <a
                            className="btn btn--secondary btn--sm"
                            href={`/api/medical-records/patients/${patientUserId}/documents/${document.id}/content`}
                            download
                          >
                            Télécharger
                          </a>
                          {can('WRITE_DOCUMENTS') ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setArchiveTarget(document)}
                            >
                              Archiver
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {access?.writeAllowed ? (
        <>
          <h2>Ajouter au dossier</h2>

          {can('WRITE_ENCOUNTERS') ? (
            <Card>
              <h3>Nouvelle consultation</h3>
              <Field label="Type" htmlFor="encounterType">
                <select
                  id="encounterType"
                  value={encounterForm.type}
                  onChange={(event) =>
                    setEncounterForm({
                      ...encounterForm,
                      type: event.target.value
                    })
                  }
                >
                  {ENCOUNTER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Motif" htmlFor="chiefComplaint">
                <input
                  id="chiefComplaint"
                  value={encounterForm.chiefComplaint}
                  onChange={(event) =>
                    setEncounterForm({
                      ...encounterForm,
                      chiefComplaint: event.target.value
                    })
                  }
                />
              </Field>
              <Field label="Notes" htmlFor="notes">
                <input
                  id="notes"
                  value={encounterForm.notes}
                  onChange={(event) =>
                    setEncounterForm({
                      ...encounterForm,
                      notes: event.target.value
                    })
                  }
                />
              </Field>
              <Button onClick={() => void createEncounter()}>
                Créer la consultation
              </Button>
            </Card>
          ) : null}

          {can('WRITE_OBSERVATIONS') ? (
            <Card>
              <h3>Nouvelle observation</h3>
              <Field label="Consultation" htmlFor="observationEncounter">
                <select
                  id="observationEncounter"
                  value={observationForm.encounterId}
                  onChange={(event) =>
                    setObservationForm({
                      ...observationForm,
                      encounterId: event.target.value
                    })
                  }
                >
                  <option value="">— Sélectionner —</option>
                  {encounters.map((encounter) => (
                    <option key={encounter.id} value={encounter.id}>
                      {new Date(encounter.occurredAt).toLocaleString('fr-FR')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Catégorie" htmlFor="observationCategory">
                <select
                  id="observationCategory"
                  value={observationForm.category}
                  onChange={(event) =>
                    setObservationForm({
                      ...observationForm,
                      category: event.target.value
                    })
                  }
                >
                  {OBSERVATION_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Libellé" htmlFor="observationLabel">
                <input
                  id="observationLabel"
                  value={observationForm.label}
                  onChange={(event) =>
                    setObservationForm({
                      ...observationForm,
                      label: event.target.value
                    })
                  }
                />
              </Field>
              <Field label="Valeur" htmlFor="observationValue">
                <input
                  id="observationValue"
                  value={observationForm.valueText}
                  onChange={(event) =>
                    setObservationForm({
                      ...observationForm,
                      valueText: event.target.value
                    })
                  }
                />
              </Field>
              <Button onClick={() => void createObservation()}>
                Ajouter l’observation
              </Button>
            </Card>
          ) : null}

          {can('WRITE_DIAGNOSES') ? (
            <Card>
              <h3>Nouveau diagnostic</h3>
              <Field label="Libellé" htmlFor="diagnosisLabel">
                <input
                  id="diagnosisLabel"
                  value={diagnosisForm.label}
                  onChange={(event) =>
                    setDiagnosisForm({
                      ...diagnosisForm,
                      label: event.target.value
                    })
                  }
                />
              </Field>
              <Field label="Code" htmlFor="diagnosisCode" hint="facultatif">
                <input
                  id="diagnosisCode"
                  value={diagnosisForm.code}
                  onChange={(event) =>
                    setDiagnosisForm({
                      ...diagnosisForm,
                      code: event.target.value
                    })
                  }
                />
              </Field>
              <Button onClick={() => void createDiagnosis()}>
                Ajouter le diagnostic
              </Button>
            </Card>
          ) : null}

          {can('WRITE_ALLERGIES') ? (
            <Card>
              <h3>Nouvelle allergie</h3>
              <Field label="Allergène" htmlFor="allergen">
                <input
                  id="allergen"
                  value={allergyForm.allergen}
                  onChange={(event) =>
                    setAllergyForm({
                      ...allergyForm,
                      allergen: event.target.value
                    })
                  }
                />
              </Field>
              <Field label="Réaction" htmlFor="reaction">
                <input
                  id="reaction"
                  value={allergyForm.reaction}
                  onChange={(event) =>
                    setAllergyForm({
                      ...allergyForm,
                      reaction: event.target.value
                    })
                  }
                />
              </Field>
              <Button onClick={() => void createAllergy()}>
                Ajouter l’allergie
              </Button>
            </Card>
          ) : null}

          {can('WRITE_DOCUMENTS') ? (
            <Card>
              <h3>Déposer un document</h3>
              <p className="muted">
                Formats acceptés : PDF, PNG, JPEG, WEBP · 5 Mo maximum.
              </p>
              <Field label="Catégorie" htmlFor="documentCategory">
                <select
                  id="documentCategory"
                  value={documentCategory}
                  onChange={(event) => setDocumentCategory(event.target.value)}
                >
                  {DOCUMENT_CATEGORIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fichier" htmlFor="documentFile">
                <input
                  id="documentFile"
                  ref={documentInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void uploadDocument(file);
                    }
                  }}
                />
              </Field>
              {uploadingDocument ? (
                <p className="muted" role="status">
                  Dépôt en cours…
                </p>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        open={archiveTarget !== null}
        title="Archiver ce document ?"
        description={
          archiveTarget
            ? `« ${archiveTarget.originalName} » ne sera plus proposé au téléchargement.`
            : undefined
        }
        confirmLabel="Archiver"
        danger
        loading={archiving}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void archiveDocument()}
      />
    </main>
  );
}
