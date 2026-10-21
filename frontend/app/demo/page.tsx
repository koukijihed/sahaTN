import Link from 'next/link';
import { buttonClass } from '../../components/ui';

export const metadata = {
  title: 'À propos de la démonstration — SahaTN'
};

interface DemoAccount {
  role: string;
  email: string;
  description: string;
}

// Comptes de démonstration NON privilégiés (données fictives). Les comptes
// administrateur ne sont jamais publiés ici : leur accès est réservé à
// l'exploitation et créé hors du seed public.
const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'Patient',
    email: 'demo.patient@sahatn.example',
    description:
      'Profil patient avec dossier médical, documents et autorisations de démonstration.'
  },
  {
    role: 'Médecin',
    email: 'demo.doctor@sahatn.example',
    description:
      'Praticien vérifié avec affiliations et patients ayant consenti.'
  },
  {
    role: 'Personnel d’établissement',
    email: 'demo.staff@sahatn.example',
    description:
      'Gestionnaire d’un établissement de santé de démonstration.'
  }
];

export default function DemoPage() {
  return (
    <main className="container">
      <section className="card" aria-label="À propos de la démonstration">
        <span className="eyebrow">Prototype</span>
        <h1 style={{ marginTop: 0 }}>À propos de cette démonstration</h1>
        <p className="muted">
          SahaTN est présenté ici sous forme de <strong>prototype de
          démonstration</strong>. Toutes les données (comptes, établissements,
          dossiers, documents) sont <strong>fictives et générées</strong> :
          aucune donnée médicale réelle n’est utilisée ni exposée.
        </p>
        <p className="muted">
          Cette démonstration sert à illustrer les parcours (annuaire, prise de
          rendez-vous, dossier médical, documents, consentement). Elle{' '}
          <strong>ne doit pas</strong> être utilisée pour des soins ou des
          décisions médicales.
        </p>
      </section>

      <section className="card" aria-label="Limites connues">
        <h2 style={{ marginTop: 0 }}>Limites de la démonstration</h2>
        <ul className="muted">
          <li>
            Certains contrôles de production ne sont pas encore opérationnels
            (par exemple MFA/2FA, chiffrement au repos, antivirus, sauvegardes).
          </li>
          <li>
            Aucune revendication de conformité réglementaire ou de disponibilité
            pour un usage clinique réel.
          </li>
          <li>
            Les référentiels (spécialités, terminologies) sont des exemples
            internes et ne remplacent pas des sources institutionnelles.
          </li>
        </ul>
      </section>

      <section className="card" aria-label="Comptes de démonstration">
        <h2 style={{ marginTop: 0 }}>Comptes de démonstration</h2>
        <p className="muted">
          Comptes synthétiques, à des fins de démonstration uniquement. Mot de
          passe commun à ces comptes :{' '}
          <code className="mono">DemoPassw0rd!2024</code>.
        </p>
        <div className="grid grid--cards">
          {DEMO_ACCOUNTS.map((account) => (
            <article className="card" key={account.email}>
              <h3>{account.role}</h3>
              <p className="muted mono">{account.email}</p>
              <p className="muted">{account.description}</p>
            </article>
          ))}
        </div>
        <div className="btn-row">
          <Link href="/login" className={buttonClass('primary', { size: 'sm' })}>
            Se connecter
          </Link>
          <Link href="/search" className={buttonClass('secondary', { size: 'sm' })}>
            Explorer l’annuaire
          </Link>
        </div>
        <hr className="divider" />
        <p className="muted" style={{ margin: 0 }}>
          Ces comptes et leurs données peuvent être réinitialisés à tout moment.
          N’y saisissez jamais d’information réelle ou personnelle.
        </p>
      </section>
    </main>
  );
}
