import { isDemoMode } from '../lib/demo';

// Bandeau d'avertissement affiche en haut de toutes les pages lorsque
// l'environnement est un prototype de demonstration (donnees synthetiques).
// Objectif : empecher toute confusion avec un service de sante reel.
export function DemoBanner() {
  if (!isDemoMode()) {
    return null;
  }

  return (
    <div className="demo-banner" role="note" aria-label="Avertissement démonstration">
      <strong>Environnement de démonstration</strong>
      <span>
        Données fictives, aucune donnée médicale réelle. Ne pas utiliser pour des
        soins. ({' '}
        <a href="/demo">à propos de cette démo</a> )
      </span>
    </div>
  );
}
