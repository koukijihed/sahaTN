'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../../lib/api';
import { ConfirmDialog } from '../../../../components/confirm-dialog';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  StatusBadge
} from '../../../../components/ui';

const PERMISSIONS = [
  'VIEW_RECORD',
  'VIEW_ENCOUNTERS',
  'VIEW_OBSERVATIONS',
  'VIEW_DIAGNOSES',
  'VIEW_ALLERGIES',
  'WRITE_ENCOUNTERS',
  'WRITE_OBSERVATIONS',
  'WRITE_DIAGNOSES',
  'WRITE_ALLERGIES'
];

interface Grant {
  id: string;
  doctorProfileId: string;
  doctorDisplayName: string | null;
  permissions: string[];
  status: string;
  expired: boolean;
  effectiveAt: string;
  expiresAt: string | null;
  reason: string | null;
  revokedAt: string | null;
}

interface Relation {
  id: string;
  doctorProfileId: string;
  doctorDisplayName: string | null;
  status: string;
  source: string;
  establishedAt: string;
  endedAt: string | null;
}

interface AccessEvent {
  id: string;
  action: string;
  purpose: string;
  reason: string | null;
  actor: string;
  actorDisplayName: string | null;
  createdAt: string;
}

interface EmergencyAccess {
  id: string;
  doctorDisplayName: string | null;
  status: string;
  justification: string;
  grantedAt: string;
  expiresAt: string;
}

type PendingAction =
  | { kind: 'revoke'; grant: Grant }
  | { kind: 'end'; relation: Relation }
  | null;

export default function RecordAccessPage() {
  const router = useRouter();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [emergencies, setEmergencies] = useState<EmergencyAccess[]>([]);
  const [doctorProfileId, setDoctorProfileId] = useState('');
  const [selected, setSelected] = useState<string[]>(['VIEW_RECORD']);
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [grantsRes, relationsRes, eventsRes, emergencyRes] =
        await Promise.all([
          apiFetch('/api/medical-records/me/grants'),
          apiFetch('/api/medical-records/me/relations'),
          apiFetch('/api/medical-records/me/access'),
          apiFetch('/api/medical-records/me/emergency-access')
        ]);
      if (grantsRes.status === 401) {
        router.replace('/login');
        return;
      }
      if (!grantsRes.ok) {
        setError('Impossible de charger les autorisations.');
        return;
      }
      setGrants((await grantsRes.json()) as Grant[]);
      setRelations((await relationsRes.json()) as Relation[]);
      setEvents((await eventsRes.json()) as AccessEvent[]);
      setEmergencies((await emergencyRes.json()) as EmergencyAccess[]);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function togglePermission(permission: string) {
    setSelected((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission]
    );
  }

  async function createGrant() {
    setMessage(null);
    if (selected.length === 0) {
      setMessage('Sélectionnez au moins une portée.');
      return;
    }
    const response = await apiFetch('/api/medical-records/me/grants', {
      method: 'POST',
      body: JSON.stringify({
        doctorProfileId,
        permissions: selected,
        reason: reason || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined
      })
    });
    if (!response.ok) {
      setMessage('Impossible de créer l’autorisation.');
      return;
    }
    setDoctorProfileId('');
    setReason('');
    setExpiresAt('');
    setSelected(['VIEW_RECORD']);
    await load();
  }

  async function confirmPending() {
    if (!pending) {
      return;
    }
    setWorking(true);
    setMessage(null);
    try {
      const response =
        pending.kind === 'revoke'
          ? await apiFetch(
              `/api/medical-records/me/grants/${pending.grant.id}/revoke`,
              {
                method: 'POST',
                body: JSON.stringify({ reason: 'Retrait du consentement' })
              }
            )
          : await apiFetch(
              `/api/medical-records/me/relations/${pending.relation.id}/end`,
              { method: 'POST' }
            );
      if (!response.ok) {
        setMessage(
          pending.kind === 'revoke'
            ? 'Impossible de révoquer cette autorisation.'
            : 'Impossible de mettre fin à cette relation.'
        );
        return;
      }
      setPending(null);
      await load();
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <main className="container">
        <PageHeader eyebrow="Espace patient" title="Accès à mon dossier" />
        <LoadingState label="Chargement des autorisations…" />
      </main>
    );
  }

  return (
    <main className="container">
      <PageHeader
        eyebrow="Espace patient"
        title="Accès à mon dossier"
        description="Accordez, révoquez et consultez qui a eu accès à votre dossier médical."
      />

      {error ? (
        <ErrorState
          title="Autorisations indisponibles"
          action={<Button onClick={() => void load()}>Réessayer</Button>}
        >
          {error}
        </ErrorState>
      ) : null}
      {message ? <Alert variant="danger">{message}</Alert> : null}

      <Card>
        <h2 className="card__title">Accorder une autorisation</h2>
        <Field
          label="Identifiant du profil praticien"
          htmlFor="doctorProfileId"
          hint="UUID du praticien"
        >
          <input
            id="doctorProfileId"
            value={doctorProfileId}
            onChange={(event) => setDoctorProfileId(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        </Field>

        <fieldset
          style={{ border: 0, padding: 0, margin: '0 0 1rem' }}
        >
          <legend className="field__label">Portées accordées</legend>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {PERMISSIONS.map((permission) => (
              <label key={permission} className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.includes(permission)}
                  onChange={() => togglePermission(permission)}
                />
                {permission}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="form-grid">
          <Field label="Expiration" htmlFor="expiresAt" hint="facultatif">
            <input
              id="expiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </Field>
          <Field label="Motif" htmlFor="reason" hint="facultatif">
            <input
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </div>

        <Button onClick={() => void createGrant()}>Accorder l’accès</Button>
      </Card>

      <section className="section">
        <h2>Autorisations</h2>
        {grants.length === 0 ? (
          <EmptyState icon="🔑" title="Aucune autorisation">
            Aucune autorisation accordée.
          </EmptyState>
        ) : (
          grants.map((grant) => (
            <Card key={grant.id}>
              <div className="card__header">
                <strong>
                  {grant.doctorDisplayName ?? grant.doctorProfileId}
                </strong>
                <span>
                  <StatusBadge status={grant.status} />{' '}
                  {grant.expired ? <Badge variant="warning">Expirée</Badge> : null}
                </span>
              </div>
              <p className="muted">{grant.permissions.join(', ')}</p>
              {grant.reason ? (
                <p className="muted">Motif : {grant.reason}</p>
              ) : null}
              {grant.status === 'ACTIVE' ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setPending({ kind: 'revoke', grant })}
                >
                  Révoquer
                </Button>
              ) : null}
            </Card>
          ))
        )}
      </section>

      <section className="section">
        <h2>Relations de soins</h2>
        {relations.length === 0 ? (
          <EmptyState icon="🤝" title="Aucune relation de soins" />
        ) : (
          relations.map((relation) => (
            <Card key={relation.id}>
              <div className="card__header">
                <strong>
                  {relation.doctorDisplayName ?? relation.doctorProfileId}
                </strong>
                <span>
                  <StatusBadge status={relation.status} />{' '}
                  <span className="muted">{relation.source}</span>
                </span>
              </div>
              {relation.status === 'ACTIVE' ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setPending({ kind: 'end', relation })}
                >
                  Mettre fin
                </Button>
              ) : null}
            </Card>
          ))
        )}
      </section>

      <section className="section">
        <h2>Accès d’urgence</h2>
        {emergencies.length === 0 ? (
          <EmptyState icon="🚑" title="Aucun accès d’urgence" />
        ) : (
          emergencies.map((emergency) => (
            <Card key={emergency.id}>
              <div className="card__header">
                <strong>{emergency.doctorDisplayName ?? 'Praticien'}</strong>
                <StatusBadge status={emergency.status} />
              </div>
              <p className="muted">{emergency.justification}</p>
              <p className="muted" style={{ marginBottom: 0 }}>
                Du {new Date(emergency.grantedAt).toLocaleString('fr-FR')} au{' '}
                {new Date(emergency.expiresAt).toLocaleString('fr-FR')}
              </p>
            </Card>
          ))
        )}
      </section>

      <section className="section">
        <h2>Journal des accès</h2>
        {events.length === 0 ? (
          <EmptyState icon="📝" title="Aucun accès enregistré" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Action</th>
                  <th scope="col">Finalité</th>
                  <th scope="col">Acteur</th>
                  <th scope="col">Motif</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="muted">
                      {new Date(event.createdAt).toLocaleString('fr-FR')}
                    </td>
                    <td>
                      <strong>{event.action}</strong>
                    </td>
                    <td>
                      <Badge variant="info">{event.purpose}</Badge>
                    </td>
                    <td>
                      {event.actorDisplayName ?? event.actor}
                    </td>
                    <td className="muted">{event.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'revoke'
            ? 'Révoquer cette autorisation ?'
            : 'Mettre fin à cette relation ?'
        }
        description={
          pending?.kind === 'revoke'
            ? `L’accès de ${
                pending.grant.doctorDisplayName ?? pending.grant.doctorProfileId
              } sera retiré.`
            : pending?.kind === 'end'
              ? `La relation avec ${
                  pending.relation.doctorDisplayName ??
                  pending.relation.doctorProfileId
                } sera terminée.`
              : undefined
        }
        confirmLabel={pending?.kind === 'revoke' ? 'Révoquer' : 'Mettre fin'}
        danger
        loading={working}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmPending()}
      />
    </main>
  );
}
