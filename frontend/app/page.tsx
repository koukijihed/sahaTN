import Link from 'next/link';
import { buttonClass } from '../components/ui';

const FEATURES = [
  {
    icon: '🔎',
    title: 'Annuaire vérifié',
    text: 'Médecins et établissements de santé publiés après vérification de leur profil.'
  },
  {
    icon: '🛡️',
    title: 'Dossier médical sécurisé',
    text: 'Accès fondé sur le consentement du patient, tracé et journalisé à chaque consultation.'
  },
  {
    icon: '📅',
    title: 'Rendez-vous en ligne',
    text: 'Consultez les agendas de consultation et réservez un créneau auprès des praticiens.'
  }
];

const AUDIENCES = [
  {
    title: 'Patients',
    items: [
      'Rechercher un médecin ou un établissement',
      'Consulter son dossier médical et ses documents',
      'Gérer les autorisations d’accès et ses rendez-vous'
    ]
  },
  {
    title: 'Professionnels de santé',
    items: [
      'Gérer ses affiliations et son agenda de consultation',
      'Accéder aux dossiers des patients ayant consenti',
      'Journaliser chaque accès au dossier médical'
    ]
  },
  {
    title: 'Établissements',
    items: [
      'Tenir à jour la fiche de l’établissement',
      'Suivre la demande de vérification',
      'Publier les lieux d’exercice vérifiés'
    ]
  }
];

export default function HomePage() {
  return (
    <div className="container">
      <section className="hero">
        <span className="eyebrow">Plateforme nationale de santé</span>
        <h1 className="hero__title">
          Trouvez un médecin ou un établissement de santé en Tunisie
        </h1>
        <p className="hero__lead">
          SahaTN rassemble l&apos;annuaire des professionnels et des
          établissements, le dossier médical partagé et la prise de rendez-vous,
          dans un cadre sécurisé et consenti.
        </p>
        <div className="hero__actions">
          <Link href="/search" className={buttonClass('primary')}>
            Rechercher un professionnel
          </Link>
          <Link href="/register" className={buttonClass('secondary')}>
            Créer un compte patient
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="features">
          {FEATURES.map((feature) => (
            <article className="feature" key={feature.title}>
              <span className="feature__icon" aria-hidden="true">
                {feature.icon}
              </span>
              <h2>{feature.title}</h2>
              <p className="muted">{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Un espace pour chaque besoin</h2>
        <div className="grid grid--cards">
          {AUDIENCES.map((audience) => (
            <article className="card" key={audience.title}>
              <h3>{audience.title}</h3>
              <ul className="muted">
                {audience.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="card" aria-label="Périmètre de la plateforme">
        <h2 style={{ marginTop: 0 }}>Accéder à la plateforme</h2>
        <p className="muted">
          Explorez l&apos;annuaire public, ou connectez-vous pour accéder à
          votre espace personnel.
        </p>
        <div className="btn-row">
          <Link href="/doctors" className={buttonClass('secondary', { size: 'sm' })}>
            Annuaire des médecins
          </Link>
          <Link
            href="/facilities"
            className={buttonClass('secondary', { size: 'sm' })}
          >
            Annuaire des établissements
          </Link>
          <Link href="/login" className={buttonClass('ghost', { size: 'sm' })}>
            Se connecter
          </Link>
        </div>
        <hr className="divider" />
        <p className="muted" style={{ margin: 0 }}>
          Environnement de développement : aucune donnée médicale réelle
          n&apos;est utilisée.
        </p>
      </section>
    </div>
  );
}
