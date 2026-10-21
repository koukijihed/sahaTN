'use client';

import { useEffect } from 'react';
import { Button, ErrorState } from '../components/ui';

// Frontiere d'erreur au niveau de l'application : capture les erreurs de
// rendu non gerees et propose une reprise. Aucun detail technique n'est
// affiche a l'utilisateur (pas de stack, pas de message brut).
export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Journalisation cote client minimale, sans donnee sensible.
    console.error('Unhandled UI error', error.digest ?? '');
  }, [error]);

  return (
    <main className="container">
      <ErrorState
        title="Une erreur inattendue est survenue"
        action={<Button onClick={() => reset()}>Réessayer</Button>}
      >
        La page n’a pas pu être affichée. Vous pouvez réessayer ou revenir à
        l’accueil.
      </ErrorState>
    </main>
  );
}
