'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { Alert, Button, Card, Field } from '../../components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const body: Record<string, string> = { email, password };
    if (phone.trim()) {
      body.phone = phone.trim();
    }

    try {
      const response = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      if (response.status === 409) {
        setError('Un compte existe déjà avec ces identifiants.');
        return;
      }

      if (!response.ok) {
        setError(
          'Inscription refusée. Vérifiez les données (mot de passe ≥ 12 caractères, une lettre et un chiffre).'
        );
        return;
      }

      router.push('/login');
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
          <span className="eyebrow">Nouveau compte</span>
          <h1>Créer un compte patient</h1>
          <p className="muted">
            Quelques informations suffisent pour accéder à votre espace.
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit}>
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

            <Field
              label="Téléphone"
              htmlFor="phone"
              hint="facultatif"
            >
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>

            <Field
              label="Mot de passe"
              htmlFor="password"
              hint="12 caractères minimum, une lettre et un chiffre"
            >
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            {error ? <Alert variant="danger">{error}</Alert> : null}

            <Button type="submit" block loading={loading}>
              {loading ? 'Création…' : "S'inscrire"}
            </Button>
          </form>
        </Card>

        <p className="auth-card__footer muted">
          Déjà inscrit ? <Link href="/login">Se connecter</Link>
        </p>
      </div>
    </main>
  );
}
