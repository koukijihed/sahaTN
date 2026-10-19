import Link from 'next/link';
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode
} from 'react';

type BadgeVariant =
  | 'neutral'
  | 'info'
  | 'teal'
  | 'success'
  | 'warning'
  | 'danger';

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmé',
  CANCELLED: 'Annulé',
  COMPLETED: 'Terminé',
  NO_SHOW: 'Non présent',
  REQUESTED: 'Demandée',
  VERIFIED: 'Vérifiée',
  REJECTED: 'Refusée',
  ENDED: 'Terminée',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  EXPIRED: 'Expirée',
  REVOKED: 'Révoquée',
  ARCHIVED: 'Archivé',
  PROCESSED: 'Traité',
  UPLOADED: 'Déposé',
  APPROVED: 'Approuvé',
  DECLINED: 'Refusé',
  DRAFT: 'Brouillon'
};

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  CONFIRMED: 'success',
  VERIFIED: 'success',
  ACTIVE: 'success',
  COMPLETED: 'success',
  APPROVED: 'success',
  PROCESSED: 'success',
  PENDING: 'warning',
  REQUESTED: 'warning',
  DRAFT: 'warning',
  CANCELLED: 'danger',
  REJECTED: 'danger',
  REVOKED: 'danger',
  EXPIRED: 'danger',
  NO_SHOW: 'danger',
  DECLINED: 'danger',
  ARCHIVED: 'danger'
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusVariant(status: string): BadgeVariant {
  return STATUS_VARIANTS[status] ?? 'info';
}

export function Badge({
  variant = 'neutral',
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={['badge', `badge--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  status,
  className
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge variant={statusVariant(status)} className={className}>
      {statusLabel(status)}
    </Badge>
  );
}

export function Alert({
  variant = 'info',
  title,
  children,
  className
}: {
  variant?: AlertVariant;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const icon =
    variant === 'success'
      ? '✓'
      : variant === 'danger'
        ? '!'
        : variant === 'warning'
          ? '!'
          : 'i';
  return (
    <div
      className={['alert', `alert--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      role={variant === 'danger' ? 'alert' : undefined}
    >
      <span className="alert__icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        {title ? <strong>{title} </strong> : null}
        {children}
      </span>
    </div>
  );
}

export function buttonClass(
  variant: ButtonVariant = 'primary',
  options: { size?: 'sm' | 'md'; block?: boolean } = {}
): string {
  return [
    'btn',
    variant === 'primary' ? null : `btn--${variant}`,
    options.size === 'sm' ? 'btn--sm' : null,
    options.block ? 'btn--block' : null
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  block?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      className={[buttonClass(variant, { size, block }), className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['card', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header__text">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? (
          <p className="page-header__description">{description}</p>
        ) : null}
      </div>
      {children ? <div className="page-header__actions">{children}</div> : null}
    </div>
  );
}

export function Breadcrumb({
  items
}: {
  items: { href?: string; label: string }[];
}) {
  return (
    <nav className="breadcrumb" aria-label="Fil d'ariane">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.href ? <Link href={item.href}>{item.label}</Link> : item.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function EmptyState({
  icon = '—',
  title,
  children
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        {icon}
      </div>
      <p className="empty-state__title">{title}</p>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Une erreur est survenue',
  children,
  action
}: {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="error-state" role="alert">
      <p className="error-state__title">{title}</p>
      {children ? <p>{children}</p> : null}
      {action ? <div className="btn-row">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <Button
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Précédent
      </Button>
      <span className="pagination__status">
        Page {page} / {totalPages}
      </span>
      <Button
        variant="secondary"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Suivant
      </Button>
    </nav>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {hint ? <span className="field__hint"> — {hint}</span> : null}
      </label>
      {children}
      {error ? <span className="field__error">{error}</span> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}
