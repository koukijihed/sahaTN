import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <p className="site-footer__title">SahaTN</p>
          <p className="site-footer__note">
            Prototype de démonstration : toutes les données sont fictives
            (aucune donnée médicale réelle). Ne pas utiliser pour des soins.
          </p>
        </div>
        <nav aria-label="Liens de pied de page">
          <p className="site-footer__title">Explorer</p>
          <p>
            <Link href="/search">Recherche</Link>
          </p>
          <p>
            <Link href="/doctors">Annuaire des médecins</Link>
          </p>
          <p>
            <Link href="/facilities">Annuaire des établissements</Link>
          </p>
          <p>
            <Link href="/demo">À propos de la démo</Link>
          </p>
        </nav>
        <div>
          <p className="site-footer__title">Compte</p>
          <p>
            <Link href="/login">Se connecter</Link>
          </p>
          <p>
            <Link href="/register">Créer un compte</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
