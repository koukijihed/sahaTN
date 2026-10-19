'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { facilityTypeLabel, governorateLabel, sectorLabel } from '../../lib/labels';
import {
  GOVERNORATES,
  LANG_LABELS,
  SECTORS,
  SEARCH_TYPES,
  SUPPORTED_LANGUAGES,
  type SearchResult,
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

const PAGE_SIZE = 10;

const TYPE_LABELS: Record<string, string> = {
  all: 'Tout',
  doctors: 'Médecins',
  facilities: 'Établissements'
};

export default function SearchPage() {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [specialties, setSpecialties] = useState<SpecialtyReference[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState({
    type: 'all',
    q: '',
    governorate: '',
    sector: '',
    specialtyId: '',
    language: ''
  });
  const [draft, setDraft] = useState({
    type: 'all',
    q: '',
    governorate: '',
    sector: '',
    specialtyId: '',
    language: ''
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
      if (committed.type !== 'all') {
        params.set('type', committed.type);
      }
      if (committed.governorate) {
        params.set('governorate', committed.governorate);
      }
      if (committed.sector) {
        params.set('sector', committed.sector);
      }
      if (committed.specialtyId) {
        params.set('specialtyId', committed.specialtyId);
      }
      if (committed.language) {
        params.set('language', committed.language);
      }
      const response = await apiFetch(`/api/search?${params.toString()}`);
      if (!response.ok) {
        setError("Impossible d'exécuter la recherche.");
        return;
      }
      const data = (await response.json()) as SearchResult;
      setResult(data);
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

  const selectType = (nextType: string) => {
    setDraft((prev) => ({ ...prev, type: nextType }));
    setCommitted((prev) => ({ ...prev, type: nextType }));
    setPage(1);
  };

  const doctors = result?.doctors ?? null;
  const facilities = result?.facilities ?? null;
  const shownTotal =
    committed.type === 'all'
      ? (doctors?.total ?? 0) + (facilities?.total ?? 0)
      : committed.type === 'doctors'
        ? doctors?.total ?? 0
        : facilities?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(shownTotal / PAGE_SIZE));

  return (
    <main className="container">
      <PageHeader
        eyebrow="Recherche nationale"
        title="Recherche"
        description="Recherche combinée sur les médecins et les établissements vérifiés. Environnement de développement : données fictives uniquement."
      />

      <div className="btn-row" role="group" aria-label="Type de recherche">
        {SEARCH_TYPES.map((searchType) => (
          <Button
            key={searchType}
            size="sm"
            variant={committed.type === searchType ? 'primary' : 'secondary'}
            aria-pressed={committed.type === searchType}
            onClick={() => selectType(searchType)}
          >
            {TYPE_LABELS[searchType]}
          </Button>
        ))}
      </div>

      <Card>
        <form onSubmit={applyFilters}>
          <Field label="Recherche" htmlFor="search-q">
            <input
              id="search-q"
              type="search"
              value={draft.q}
              onChange={(event) =>
                setDraft({ ...draft, q: event.target.value })
              }
              placeholder="Nom, spécialité ou ville…"
            />
          </Field>
          <div className="form-grid">
            <Field label="Spécialité" htmlFor="search-specialty">
              <select
                id="search-specialty"
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
            <Field label="Gouvernorat" htmlFor="search-governorate">
              <select
                id="search-governorate"
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
            <Field label="Secteur" htmlFor="search-sector">
              <select
                id="search-sector"
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
            <Field label="Langue" htmlFor="search-language">
              <select
                id="search-language"
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
          </div>
          <Button type="submit">Rechercher</Button>
        </form>
      </Card>

      {error ? (
        <ErrorState
          title="Recherche impossible"
          action={<Button onClick={() => void load()}>Réessayer</Button>}
        >
          {error}
        </ErrorState>
      ) : null}

      {loading ? (
        <LoadingState label="Recherche en cours…" />
      ) : result ? (
        <>
          <p className="muted">{shownTotal} résultat(s).</p>

          {doctors && committed.type !== 'facilities' ? (
            <section className="section">
              <h2>Médecins</h2>
              {doctors.items.length === 0 ? (
                <EmptyState icon="🔎" title="Aucun médecin">
                  Aucun médecin ne correspond à la recherche.
                </EmptyState>
              ) : (
                <div className="grid grid--cards">
                  {doctors.items.map((item) => (
                    <Card key={item.id} className="card--interactive">
                      <h3 className="card__title">
                        <Link href={`/doctors/${item.id}`}>
                          {item.displayName}
                        </Link>
                      </h3>
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
                        {`Langues : ${
                          item.languages.join(', ') || 'non précisées'
                        }`}
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
              )}
            </section>
          ) : null}

          {facilities && committed.type !== 'doctors' ? (
            <section className="section">
              <h2>Établissements</h2>
              {facilities.items.length === 0 ? (
                <EmptyState icon="🏥" title="Aucun établissement">
                  Aucun établissement ne correspond à la recherche.
                </EmptyState>
              ) : (
                <div className="grid grid--cards">
                  {facilities.items.map((item) => (
                    <Card key={item.id} className="card--interactive">
                      <h3 className="card__title">
                        <Link href={`/facilities/${item.id}`}>
                          {item.displayName}
                        </Link>
                      </h3>
                      <p className="card__meta">
                        {facilityTypeLabel(item.type)} ·{' '}
                        {sectorLabel(item.sector)} ·{' '}
                        {governorateLabel(item.governorate)}, {item.city}
                      </p>
                      {item.description ? <p>{item.description}</p> : null}
                    </Card>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {!loading && result && totalPages > 1 ? (
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      ) : null}
    </main>
  );
}
