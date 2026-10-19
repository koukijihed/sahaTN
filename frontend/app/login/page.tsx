'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../components/auth-context';
import { Alert, Button, Card, Field } from '../../components/ui';

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        setError('Identifiants invalides ou tentative refusée.');
        return;
      }

      await refresh();
      router.push('/dashboard');
    } catch {
      setError('Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-card__header">
          <span className="eyebrow">Espace personnel</span>
          <h1>Connexion</h1>
          <p className="muted">Accédez à votre espace SahaTN.</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} noValidate={false}>
            <Field label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>

            <Field label="Mot de passe" htmlFor="password">
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {error ? <Alert variant="danger">{error}</Alert> : null}

            <Button type="submit" block loading={loading}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </Button>
          </form>
        </Card>

        <p className="auth-card__footer muted">
          Pas de compte ? <Link href="/register">Créer un compte patient</Link>
        </p>
      </div>
    </main>
  );
}
