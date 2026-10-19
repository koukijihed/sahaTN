'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/api';
import { ConfirmDialog } from '../../../components/confirm-dialog';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge
} from '../../../components/ui';

interface AppointmentEvent {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  createdAt: string;
}

interface Appointment {
  id: string;
  status: string;
  reason: string | null;
  createdAt: string;
  slot: { id: string; startsAt: string; endsAt: string; status: string };
  doctor: { id: string; displayName: string };
  facility: { id: string; displayName: string };
  events: AppointmentEvent[];
}

interface NotificationItem {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  appointmentId: string | null;
}

const CANCELLABLE = ['PENDING', 'CONFIRMED'];

export default function AppointmentsPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appointmentsResponse, notificationsResponse] = await Promise.all([
        apiFetch('/api/appointments/me'),
        apiFetch('/api/notifications/me')
      ]);
      if (appointmentsResponse.status === 401) {
        router.replace('/login');
        return;
      }
      if (!appointmentsResponse.ok) {
        setError('Impossible de charger vos rendez-vous.');
        return;
      }
      setAppointments((await appointmentsResponse.json()) as Appointment[]);
      if (notificationsResponse.ok) {
        setNotifications(
          (await notificationsResponse.json()) as NotificationItem[]
        );
      }
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(reason: string) {
    if (!cancelTarget) {
      return;
    }
    setCancelling(true);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/api/appointments/${cancelTarget.id}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: reason || undefined })
        }
      );
      if (!response.ok) {
        setMessage('Impossible d’annuler ce rendez-vous.');
        return;
      }
      setCancelTarget(null);
      await load();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main className="container">
      <PageHeader
        eyebrow="Espace patient"
        title="Mes rendez-vous"
        description="Suivez vos consultations à venir et vos notifications."
      />

      {loading ? <LoadingState label="Chargement de vos rendez-vous…" /> : null}
      {error ? (
        <ErrorState
          title="Rendez-vous indisponibles"
          action={<Button onClick={() => void load()}>Réessayer</Button>}
        >
          {error}
        </ErrorState>
      ) : null}
      {message ? <Alert variant="danger">{message}</Alert> : null}

      {!loading && !error && appointments.length === 0 ? (
        <EmptyState icon="📅" title="Aucun rendez-vous">
          Aucun rendez-vous pour le moment.
        </EmptyState>
      ) : null}

      {appointments.map((appointment) => (
        <Card key={appointment.id}>
          <div className="card__header">
            <h2 className="card__title">
              {new Date(appointment.slot.startsAt).toLocaleString('fr-FR')}
            </h2>
            <StatusBadge status={appointment.status} />
          </div>
          <p className="card__meta">
            {appointment.doctor.displayName} · {appointment.facility.displayName}
          </p>
          {appointment.reason ? (
            <p className="muted">Motif : {appointment.reason}</p>
          ) : null}
          {CANCELLABLE.includes(appointment.status) ? (
            <div className="btn-row">
              <Button
                variant="danger"
                size="sm"
                onClick={() => setCancelTarget(appointment)}
              >
                Annuler le rendez-vous
              </Button>
            </div>
          ) : null}
        </Card>
      ))}

      <section className="section">
        <h2>Notifications</h2>
        {notifications.length === 0 ? (
          <EmptyState icon="🔔" title="Aucune notification" />
        ) : (
          <ul>
            {notifications.map((notification) => (
              <li key={notification.id}>
                <strong>{notification.type}</strong>{' '}
                <StatusBadge status={notification.status} />{' '}
                <span className="muted">
                  {new Date(notification.createdAt).toLocaleString('fr-FR')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Annuler ce rendez-vous ?"
        description={
          cancelTarget
            ? `${cancelTarget.doctor.displayName} · ${cancelTarget.facility.displayName} · ${new Date(
                cancelTarget.slot.startsAt
              ).toLocaleString('fr-FR')}`
            : undefined
        }
        confirmLabel="Annuler le rendez-vous"
        cancelLabel="Conserver"
        danger
        requireReason
        reasonLabel="Motif d’annulation (facultatif)"
        loading={cancelling}
        onCancel={() => setCancelTarget(null)}
        onConfirm={(reason) => void cancel(reason)}
      />
    </main>
  );
}
