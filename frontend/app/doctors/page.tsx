'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import {
  GOVERNORATES,
  LANG_LABELS,
  NAME_SORTS,
  SECTORS,
  SUPPORTED_LANGUAGES,
  type DoctorPublicView,
  type Paged,
  type SpecialtyReference
} from '../../lib/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  Pagination
} from '../../components/ui';

const PAGE_SIZE = 20;

export default function DoctorsPage() {
  const [items, setItems] = useState<DoctorPublicView[]>([]);
  const [total, setTotal] = useState(0);
  const [specialties, setSpecialties] = useState<SpecialtyReference[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState({
    q: '',
    specialtyId: '',
    governorate: '',
    sector: '',
    language: '',
    sort: ''
  });
  const [draft, setDraft] = useState({
    q: '',
    specialtyId: '',
    governorate: '',
    sector: '',
    language: '',
    sort: ''
  });

  const loadSpecialties = useCallback(async () => {
    try {
      const response = await apiFetch('/api/specialties');
      if (!response.ok) {
        return;
      }
      setSpecialties((await response.json()) as SpecialtyReference[]);
    } catch {
      // Référentiel indisponible : le filtre par spécialité est masqué.
    }
  }, []);

  useEffect(() => {
    void loadSpecialties();
  }, [loadSpecialties]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE)
      });
      if (committed.q.trim()) {
        params.set('q', committed.q.trim());
      }
      if (committed.specialtyId) {
        params.set('specialtyId', committed.specialtyId);
      }
      if (committed.governorate) {
        params.set('governorate', committed.governorate);
      }
      if (committed.sector) {
        params.set('sector', committed.sector);
      }
      if (committed.language) {
        params.set('language', committed.language);
      }
      if (committed.sort) {
        params.set('sort', committed.sort);
      }
      const response = await apiFetch(`/api/doctors?${params.toString()}`);
      if (!response.ok) {
        setError("Impossible de charger l'annuaire des médecins.");
        return;
      }
      const data = (await response.json()) as Paged<DoctorPublicView>;
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }, [page, committed]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPage(1);
    setCommitted({ ...draft });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="container">
      <PageHeader
        eyebrow="Annuaire public"
        title="Médecins"
        description="Médecins vérifiés et publiés dans l’annuaire public. Environnement de développement : données fictives uniquement."
      />

      <Card>
        <form onSubmit={applyFilters}>
          <Field label="Recherche" htmlFor="doctors-q">
            <input
              id="doctors-q"
              type="search"
              value={draft.q}
              onChange={(event) =>
                setDraft({ ...draft, q: event.target.value })
              }
              placeholder="Nom, spécialité ou ville…"
            />
          </Field>
          <div className="form-grid">
            <Field label="Spécialité" htmlFor="doctors-specialty">
              <select
                id="doctors-specialty"
                value={draft.specialtyId}
                onChange={(event) =>
                  setDraft({ ...draft, specialtyId: event.target.value })
                }
              >
                <option value="">Toutes</option>
                {specialties.map((specialty) => (
                  <option key={specialty.id} value={specialty.id}>
                    {specialty.labelFr}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Gouvernorat" htmlFor="doctors-governorate">
              <select
                id="doctors-governorate"
                value={draft.governorate}
                onChange={(event) =>
                  setDraft({ ...draft, governorate: event.target.value })
                }
              >
                <option value="">Tous</option>
                {GOVERNORATES.map((governorate) => (
                  <option key={governorate} value={governorate}>
                    {governorate}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Secteur" htmlFor="doctors-sector">
              <select
                id="doctors-sector"
                value={draft.sector}
                onChange={(event) =>
                  setDraft({ ...draft, sector: event.target.value })
                }
              >
                <option value="">Tous</option>
                {SECTORS.map((sector) => (
                  <option key={sector} value={sector}>
                    {sector}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Langue" htmlFor="doctors-language">
              <select
                id="doctors-language"
                value={draft.language}
                onChange={(event) =>
                  setDraft({ ...draft, language: event.target.value })
                }
              >
                <option value="">Toutes</option>
                {SUPPORTED_LANGUAGES.map((language) => (
                  <option key={language} value={language}>
                    {LANG_LABELS[language]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tri" htmlFor="doctors-sort">
              <select
                id="doctors-sort"
                value={draft.sort}
                onChange={(event) =>
                  setDraft({ ...draft, sort: event.target.value })
                }
              >
                <option value="">Par défaut</option>
                {NAME_SORTS.map((sort) => (
                  <option key={sort} value={sort}>
                    {sort === 'name' ? 'Nom (A-Z)' : 'Plus récents'}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button type="submit">Appliquer les filtres</Button>
        </form>
      </Card>

      {error ? (
        <ErrorState
          title="Annuaire indisponible"
          action={<Button onClick={() => void load()}>Réessayer</Button>}
        >
          {error}
        </ErrorState>
      ) : null}

      {loading ? (
        <LoadingState label="Chargement des médecins…" />
      ) : items.length === 0 ? (
        <EmptyState icon="🔎" title="Aucun médecin">
          Aucun médecin ne correspond à ces critères.
        </EmptyState>
      ) : (
        <>
          <p className="muted">{total} médecin(s).</p>
          <div className="grid grid--cards">
            {items.map((item) => (
              <Card key={item.id} className="card--interactive">
                <h2 className="card__title">
                  <Link href={`/doctors/${item.id}`}>{item.displayName}</Link>
                </h2>
                <p className="card__meta">
                  {item.specialties
                    .map((specialty) => specialty.labelFr)
                    .join(', ')}
                </p>
                {item.professionalDescription ? (
                  <p>{item.professionalDescription}</p>
                ) : null}
                <p className="muted">
                  {`${item.yearsOfExperience ?? 0} ans d'expérience`} ·{' '}
                  {`Langues : ${item.languages.join(', ') || 'non précisées'}`}
                </p>
                {item.practiceFacilities.length > 0 ? (
                  <p className="muted">
                    Exerce :{' '}
                    {item.practiceFacilities.map((facility, index) => (
                      <span key={facility.id}>
                        {index > 0 && ', '}
                        <Link href={`/facilities/${facility.id}`}>
                          {facility.displayName}
                        </Link>
                      </span>
                    ))}
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      )}

      {!loading && totalPages > 1 ? (
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      ) : null}
    </main>
  );
}
