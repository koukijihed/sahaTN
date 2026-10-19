'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { facilityTypeLabel, governorateLabel, sectorLabel } from '../../lib/labels';
import {
  FACILITY_TYPES,
  GOVERNORATES,
  NAME_SORTS,
  SECTORS,
  type FacilityPublicView,
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

export default function FacilitiesPage() {
  const [items, setItems] = useState<FacilityPublicView[]>([]);
  const [total, setTotal] = useState(0);
  const [specialties, setSpecialties] = useState<SpecialtyReference[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState({
    q: '',
    governorate: '',
    sector: '',
    type: '',
    specialtyId: '',
    sort: ''
  });
  const [draft, setDraft] = useState({
    q: '',
    governorate: '',
    sector: '',
    type: '',
    specialtyId: '',
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
      if (committed.governorate) {
        params.set('governorate', committed.governorate);
      }
      if (committed.sector) {
        params.set('sector', committed.sector);
      }
      if (committed.type) {
        params.set('type', committed.type);
      }
      if (committed.specialtyId) {
        params.set('specialtyId', committed.specialtyId);
      }
      if (committed.sort) {
        params.set('sort', committed.sort);
      }
      const response = await apiFetch(`/api/facilities?${params.toString()}`);
      if (!response.ok) {
        setError("Impossible de charger l'annuaire.");
        return;
      }
      const data = (await response.json()) as Paged<FacilityPublicView>;
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
        title="Établissements de santé"
        description="Établissements publics et privés vérifiés. Environnement de développement : données fictives uniquement."
      />

      <Card>
        <form onSubmit={applyFilters}>
          <Field label="Recherche" htmlFor="facilities-q">
            <input
              id="facilities-q"
              type="search"
              value={draft.q}
              onChange={(event) =>
                setDraft({ ...draft, q: event.target.value })
              }
              placeholder="Nom ou ville…"
            />
          </Field>
          <div className="form-grid">
            <Field label="Gouvernorat" htmlFor="facilities-governorate">
              <select
                id="facilities-governorate"
                value={draft.governorate}
                onChange={(event) =>
                  setDraft({ ...draft, governorate: event.target.value })
                }
              >
                <option value="">Tous</option>
                {GOVERNORATES.map((governorate) => (
                  <option key={governorate} value={governorate}>
                    {governorateLabel(governorate)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Secteur" htmlFor="facilities-sector">
              <select
                id="facilities-sector"
                value={draft.sector}
                onChange={(event) =>
                  setDraft({ ...draft, sector: event.target.value })
                }
              >
                <option value="">Tous</option>
                {SECTORS.map((sector) => (
                  <option key={sector} value={sector}>
                    {sectorLabel(sector)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type" htmlFor="facilities-type">
              <select
                id="facilities-type"
                value={draft.type}
                onChange={(event) =>
                  setDraft({ ...draft, type: event.target.value })
                }
              >
                <option value="">Tous</option>
                {FACILITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {facilityTypeLabel(type)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Spécialité" htmlFor="facilities-specialty">
              <select
                id="facilities-specialty"
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
            <Field label="Tri" htmlFor="facilities-sort">
              <select
                id="facilities-sort"
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
        <LoadingState label="Chargement des établissements…" />
      ) : items.length === 0 ? (
        <EmptyState icon="🏥" title="Aucun établissement">
          Aucun établissement ne correspond à ces critères.
        </EmptyState>
      ) : (
        <>
          <p className="muted">{total} établissement(s).</p>
          <div className="grid grid--cards">
            {items.map((item) => (
              <Card key={item.id} className="card--interactive">
                <h2 className="card__title">
                  <Link href={`/facilities/${item.id}`}>{item.displayName}</Link>
                </h2>
                <p className="card__meta">
                  {facilityTypeLabel(item.type)} · {sectorLabel(item.sector)} ·{' '}
                  {governorateLabel(item.governorate)}, {item.city}
                </p>
                {item.description ? <p>{item.description}</p> : null}
                <p className="muted">{item.addressLine}</p>
                {item.phone ? (
                  <p className="muted">Téléphone : {item.phone}</p>
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
