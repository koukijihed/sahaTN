'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../../lib/api';
import { ConfirmDialog } from '../../../../components/confirm-dialog';
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  StatusBadge
} from '../../../../components/ui';

type ConfirmationMode = 'AUTOMATIC' | 'MANUAL' | 'DISABLED';
type ScheduleStatus = 'ACTIVE' | 'INACTIVE';

interface Schedule {
  id: string;
  affiliationId: string;
  timezone: string;
  visitDurationMinutes: number;
  confirmationMode: ConfirmationMode;
  status: ScheduleStatus;
  doctor: { id: string; displayName: string };
  facility: { id: string; displayName: string };
}

interface Slot {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

interface ScheduleItem {
  slot: Slot;
  appointment: {
    id: string;
    status: string;
    reason: string | null;
    patient: { id: string; email: string | null; phone: string | null } | null;
  } | null;
}

const DECIDE_ACTIONS: Record<string, { action: string; label: string }[]> = {
  PENDING: [
    { action: 'CONFIRM', label: 'Confirmer' },
    { action: 'REJECT', label: 'Refuser' }
  ],
  CONFIRMED: [
    { action: 'COMPLETE', label: 'Terminer' },
    { action: 'NO_SHOW', label: 'Absent' }
  ]
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SchedulePage() {
  const params = useParams<{ affiliationId: string }>();
  const router = useRouter();

  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [timezone, setTimezone] = useState('Africa/Tunis');
  const [visitDurationMinutes, setVisitDurationMinutes] = useState(30);
  const [confirmationMode, setConfirmationMode] =
    useState<ConfirmationMode>('MANUAL');
  const [status, setStatus] = useState<ScheduleStatus>('ACTIVE');

  const [date, setDate] = useState(today());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');

  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [rejectTarget, setRejectTarget] = useState<ScheduleItem | null>(null);
  const [deciding, setDeciding] = useState(false);

  const applySchedule = useCallback((loaded: Schedule) => {
    setSchedule(loaded);
    setTimezone(loaded.timezone);
    setVisitDurationMinutes(loaded.visitDurationMinutes);
    setConfirmationMode(loaded.confirmationMode);
    setStatus(loaded.status);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(
        `/api/appointments/schedules/${params.affiliationId}`
      );
      if (response.status === 401) {
        router.replace('/login');
        return;
      }
      if (response.status === 403) {
        setError('Vous ne gérez pas cette affiliation.');
        return;
      }
      if (response.status === 404) {
        setSchedule(null);
        return;
      }
      if (!response.ok) {
        setError('Impossible de charger cet agenda.');
        return;
      }
      applySchedule((await response.json()) as Schedule);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [params.affiliationId, router, applySchedule]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadItems = useCallback(
    async (scheduleId: string) => {
      const response = await apiFetch(
        `/api/appointments/schedules/${scheduleId}/appointments?from=${from}&to=${to}`
      );
      if (!response.ok) {
        setErrorMessage('Impossible de charger les créneaux.');
        return;
      }
      const data = (await response.json()) as { items: ScheduleItem[] };
      setItems(data.items);
    },
    [from, to]
  );

  async function saveSchedule() {
    setMessage(null);
    setErrorMessage(null);
    const response = await apiFetch(
      `/api/appointments/schedules/${params.affiliationId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          timezone,
          visitDurationMinutes,
          confirmationMode,
          status
        })
      }
    );
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setErrorMessage(data?.message ?? 'Impossible d’enregistrer l’agenda.');
      return;
    }
    applySchedule((await response.json()) as Schedule);
    setMessage('Agenda enregistré.');
  }

  async function generateSlots() {
    if (!schedule) {
      return;
    }
    setMessage(null);
    setErrorMessage(null);
    const response = await apiFetch(
      `/api/appointments/schedules/${schedule.id}/slots/generate`,
      {
        method: 'POST',
        body: JSON.stringify({
          date,
          startTime,
          endTime,
          replaceExisting: true
        })
      }
    );
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setErrorMessage(data?.message ?? 'Impossible de générer les créneaux.');
      return;
    }
    const result = (await response.json()) as {
      created: number;
      skipped: number;
    };
    setMessage(
      `${result.created} créneau(x) créé(s), ${result.skipped} ignoré(s).`
    );
    await loadItems(schedule.id);
  }

  async function decide(item: ScheduleItem, action: string, reason?: string) {
    if (!item.appointment || !schedule) {
      return;
    }
    setDeciding(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      const response = await apiFetch(
        `/api/appointments/${item.appointment.id}/decide`,
        { method: 'POST', body: JSON.stringify({ action, reason }) }
      );
      if (!response.ok) {
        setErrorMessage('Impossible d’appliquer cette décision.');
        return;
      }
      setRejectTarget(null);
      await loadItems(schedule.id);
    } finally {
      setDeciding(false);
    }
  }

  return (
    <main className="container">
      <Breadcrumb
        items={[
          { href: '/dashboard/affiliations', label: 'Mes affiliations' },
          { label: 'Agenda de consultation' }
        ]}
      />

      <PageHeader
        eyebrow="Espace médecin"
        title="Agenda de consultation"
        description={
          schedule
            ? `${schedule.doctor.displayName} · ${schedule.facility.displayName}`
            : 'Configurez votre agenda et vos créneaux de consultation.'
        }
      />

      {loading ? <LoadingState label="Chargement de l’agenda…" /> : null}
      {error ? (
        <ErrorState
          title="Agenda indisponible"
          action={<Button onClick={() => void load()}>Réessayer</Button>}
        >
          {error}
        </ErrorState>
      ) : null}
      {message ? <Alert variant="success">{message}</Alert> : null}
      {errorMessage ? <Alert variant="danger">{errorMessage}</Alert> : null}

      {!loading && !error ? (
        <Card>
          <h2 className="card__title">
            {schedule ? 'Paramètres de l’agenda' : 'Créer un agenda'}
          </h2>
          <div className="form-grid">
            <Field label="Fuseau horaire" htmlFor="timezone">
              <input
                id="timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              />
            </Field>
            <Field
              label="Durée d’une consultation"
              htmlFor="duration"
              hint="en minutes"
            >
              <input
                id="duration"
                type="number"
                min={5}
                max={240}
                value={visitDurationMinutes}
                onChange={(event) =>
                  setVisitDurationMinutes(Number(event.target.value))
                }
              />
            </Field>
            <Field label="Mode de confirmation" htmlFor="mode">
              <select
                id="mode"
                value={confirmationMode}
                onChange={(event) =>
                  setConfirmationMode(event.target.value as ConfirmationMode)
                }
              >
                <option value="AUTOMATIC">Automatique (confirmation immédiate)</option>
                <option value="MANUAL">Manuel (décision du praticien)</option>
                <option value="DISABLED">Désactivé (pas de réservation en ligne)</option>
              </select>
            </Field>
            <Field label="Statut" htmlFor="status">
              <select
                id="status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ScheduleStatus)
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </Field>
          </div>
          <Button onClick={() => void saveSchedule()}>
            {schedule ? 'Enregistrer' : 'Créer l’agenda'}
          </Button>
        </Card>
      ) : null}

      {schedule ? (
        <Card>
          <h2 className="card__title">Générer des créneaux</h2>
          <div className="form-grid">
            <Field label="Date" htmlFor="date">
              <input
                id="date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field label="Début" htmlFor="startTime">
              <input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </Field>
            <Field label="Fin" htmlFor="endTime">
              <input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </Field>
          </div>
          <Button onClick={() => void generateSlots()}>Générer</Button>
        </Card>
      ) : null}

      {schedule ? (
        <Card>
          <h2 className="card__title">Créneaux et rendez-vous</h2>
          <div className="btn-row" style={{ marginBottom: '1rem' }}>
            <Field label="Du" htmlFor="from">
              <input
                id="from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field label="Au" htmlFor="to">
              <input
                id="to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>
            <Button variant="secondary" onClick={() => void loadItems(schedule.id)}>
              Afficher
            </Button>
          </div>

          {items.length === 0 ? (
            <EmptyState icon="📅" title="Aucun créneau">
              Aucun créneau sur cette période.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Créneau</th>
                    <th scope="col">Statut</th>
                    <th scope="col">Rendez-vous</th>
                    <th scope="col">Patient</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.slot.id}>
                      <td>
                        {new Date(item.slot.startsAt).toLocaleString('fr-FR')}
                      </td>
                      <td>
                        <StatusBadge status={item.slot.status} />
                      </td>
                      <td>
                        {item.appointment ? (
                          <StatusBadge status={item.appointment.status} />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="muted">
                        {item.appointment?.patient?.email ??
                          item.appointment?.patient?.phone ??
                          '—'}
                      </td>
                      <td>
                        {item.appointment ? (
                          <div className="btn-row">
                            {(DECIDE_ACTIONS[item.appointment.status] ?? []).map(
                              (decision) =>
                                decision.action === 'REJECT' ? (
                                  <Button
                                    key={decision.action}
                                    variant="danger"
                                    size="sm"
                                    onClick={() => setRejectTarget(item)}
                                  >
                                    {decision.label}
                                  </Button>
                                ) : (
                                  <Button
                                    key={decision.action}
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                      void decide(item, decision.action)
                                    }
                                  >
                                    {decision.label}
                                  </Button>
                                )
                            )}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      <ConfirmDialog
        open={rejectTarget !== null}
        title="Refuser ce rendez-vous ?"
        confirmLabel="Refuser"
        cancelLabel="Conserver"
        danger
        requireReason
        reasonLabel="Motif du refus (facultatif)"
        loading={deciding}
        onCancel={() => setRejectTarget(null)}
        onConfirm={(reason) =>
          rejectTarget ? void decide(rejectTarget, 'REJECT', reason) : undefined
        }
      />
    </main>
  );
}
