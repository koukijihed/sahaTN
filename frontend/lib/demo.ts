// Mode demonstration.
//
// SahaTN est deploye comme prototype de demonstration a donnees synthetiques.
// Le bandeau d'avertissement doit etre visible par defaut. On ne le desactive
// que si l'operateur definit explicitement NEXT_PUBLIC_DEMO_MODE=false (cas
// d'un deploiement interne non public). Toute autre valeur (absente, vide,
// "true", "1") active le mode demonstration : le defaut est le plus sur.
export function isDemoMode(): boolean {
  const raw = process.env.NEXT_PUBLIC_DEMO_MODE;
  if (raw === undefined) {
    return true;
  }
  return raw.trim().toLowerCase() !== 'false' && raw.trim() !== '0';
}
