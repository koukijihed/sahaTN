/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

// Politique CSP du frontend. Next.js App Router injecte des scripts inline de
// bootstrap (donnees de vol / hydratation) et des styles en ligne : sans
// pipeline de nonces, `script-src` et `style-src` doivent tolerer
// `'unsafe-inline'`, sinon l'hydratation est bloquee (les formulaires
// retombent sur leur soumission native). Aucun `eval` n'est autorise
// (`'unsafe-eval'` absent). Les scripts et styles restent confines a
// l'origine ; `connect-src` inclut l'API backend via le rewrite same-origin
// `/api`, donc `'self'` suffit. Aucune iframe, aucun objet embarque.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`
      }
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy }
        ]
      }
    ];
  }
};

export default nextConfig;
