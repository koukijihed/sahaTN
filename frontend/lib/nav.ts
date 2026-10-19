export interface NavItem {
  href: string;
  label: string;
  description?: string;
  exact?: boolean;
}

export interface NavGroup {
  section: string;
  items: NavItem[];
}

export const PUBLIC_NAV: NavItem[] = [
  { href: '/search', label: 'Recherche' },
  { href: '/doctors', label: 'Médecins' },
  { href: '/facilities', label: 'Établissements' }
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function dashboardNav(roles: string[]): NavGroup[] {
  const groups: NavGroup[] = [
    {
      section: 'Général',
      items: [
        {
          href: '/dashboard',
          label: 'Tableau de bord',
          description: 'Vue d’ensemble du compte',
          exact: true
        }
      ]
    }
  ];

  if (roles.includes('PATIENT')) {
    groups.push({
      section: 'Espace patient',
      items: [
        {
          href: '/dashboard/appointments',
          label: 'Mes rendez-vous',
          description: 'Consultations et notifications'
        },
        {
          href: '/dashboard/records',
          label: 'Mon dossier médical',
          description: 'Consultations, diagnostics, allergies'
        },
        {
          href: '/dashboard/records/documents',
          label: 'Mes documents',
          description: 'Analyses, imagerie, comptes rendus'
        },
        {
          href: '/dashboard/records/access',
          label: 'Accès & consentements',
          description: 'Autorisations et journal d’accès'
        }
      ]
    });
  }

  if (roles.includes('DOCTOR')) {
    groups.push({
      section: 'Espace praticien',
      items: [
        {
          href: '/dashboard/affiliations',
          label: 'Mes affiliations',
          description: 'Établissements et agendas'
        },
        {
          href: '/dashboard/patients',
          label: 'Dossiers autorisés',
          description: 'Patients ayant consenti'
        }
      ]
    });
  }

  if (roles.includes('FACILITY_STAFF')) {
    groups.push({
      section: 'Établissements',
      items: [
        {
          href: '/facilities',
          label: 'Annuaire des établissements',
          description: 'Gérer vos fiches et vérifications'
        }
      ]
    });
  }

  return groups;
}
