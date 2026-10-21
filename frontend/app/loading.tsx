import { LoadingState } from '../components/ui';

// Etat de chargement au niveau de l'application (navigation entre routes).
export default function Loading() {
  return (
    <main className="container">
      <LoadingState label="Chargement de la page…" />
    </main>
  );
}
