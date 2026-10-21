import Link from 'next/link';
import { buttonClass } from '../components/ui';

// Page 404 : aucune fuite d'information (pas de piste sur l'existence d'une
// ressource), avec une reprise vers les pages publiques.
export default function NotFound() {
  return (
    <main className="container">
      <section className="card" aria-label="Page introuvable">
        <span className="eyebrow">Erreur 404</span>
        <h1 style={{ marginTop: 0 }}>Page introuvable</h1>
        <p className="muted">
          La page demandée n’existe pas ou a été déplacée.
        </p>
        <div className="btn-row">
          <Link href="/" className={buttonClass('primary', { size: 'sm' })}>
            Retour à l’accueil
          </Link>
          <Link
            href="/search"
            className={buttonClass('secondary', { size: 'sm' })}
          >
            Rechercher un professionnel
          </Link>
        </div>
      </section>
    </main>
  );
}
