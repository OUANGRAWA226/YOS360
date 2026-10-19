export type Role = 'admin' | 'gestionnaire' | 'magasinier' | 'vendeur';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  magasinier: 'Magasinier',
  vendeur: 'Vendeur',
};

export type Module =
  | 'dashboard'
  | 'produits'
  | 'categories'
  | 'mouvements'
  | 'entrepots'
  | 'transferts'
  | 'inventaires'
  | 'lots'
  | 'scan'
  | 'reappro'
  | 'fournisseurs'
  | 'clients'
  | 'commandes'
  | 'paiements'
  | 'caisse'
  | 'rapports'
  | 'audit'
  | 'parametres';

export type Permission = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
};

const FULL: Permission = { view: true, create: true, edit: true, delete: true };
const READ_ONLY: Permission = { view: true, create: false, edit: false, delete: false };
const NONE: Permission = { view: false, create: false, edit: false, delete: false };

// Matrice des permissions par rôle.
// - Admin: tout.
// - Gestionnaire: tout sauf la gestion des utilisateurs (paramètres limités).
// - Magasinier: stock (produits, mouvements, commandes d'achat) sans toucher aux prix d'achat ni aux partenaires.
// - Vendeur: lecture + ventes uniquement, jamais les prix d'achat.
export const ROLE_PERMISSIONS: Record<Role, Record<Module, Permission>> = {
  admin: {
    dashboard: FULL, produits: FULL, categories: FULL, mouvements: FULL,
    entrepots: FULL, transferts: FULL, inventaires: FULL, lots: FULL, scan: FULL, reappro: FULL,
    fournisseurs: FULL, clients: FULL, commandes: FULL,
    paiements: FULL, caisse: FULL,
    rapports: FULL,
    audit: FULL, parametres: FULL,
  },
  gestionnaire: {
    dashboard: FULL, produits: FULL, categories: FULL, mouvements: FULL,
    entrepots: FULL, transferts: FULL, inventaires: FULL, lots: FULL, scan: FULL, reappro: FULL,
    fournisseurs: FULL, clients: FULL, commandes: FULL,
    paiements: FULL, caisse: FULL,
    rapports: FULL,
    audit: { view: true, create: false, edit: false, delete: false },
    parametres: { view: true, create: false, edit: false, delete: false },
  },
  magasinier: {
    dashboard: { view: true, create: false, edit: false, delete: false },
    produits: { view: true, create: true, edit: true, delete: false },
    categories: READ_ONLY,
    mouvements: FULL,
    entrepots: READ_ONLY,
    transferts: { view: true, create: true, edit: true, delete: false },
    inventaires: { view: true, create: true, edit: true, delete: false },
    lots: { view: true, create: true, edit: true, delete: false },
    scan: FULL,
    reappro: READ_ONLY,
    fournisseurs: READ_ONLY,
    clients: NONE,
    commandes: { view: true, create: true, edit: true, delete: false },
    paiements: { view: true, create: true, edit: false, delete: false },
    caisse: { view: true, create: true, edit: false, delete: false },
    rapports: READ_ONLY,
    audit: NONE,
    parametres: NONE,
  },
  vendeur: {
    dashboard: { view: true, create: false, edit: false, delete: false },
    produits: READ_ONLY,
    categories: READ_ONLY,
    mouvements: { view: true, create: true, edit: false, delete: false },
    entrepots: READ_ONLY,
    transferts: READ_ONLY,
    inventaires: READ_ONLY,
    lots: READ_ONLY,
    scan: { view: true, create: true, edit: false, delete: false },
    reappro: READ_ONLY,
    fournisseurs: NONE,
    clients: { view: true, create: true, edit: true, delete: false },
    commandes: { view: true, create: true, edit: true, delete: false },
    paiements: { view: true, create: true, edit: false, delete: false },
    caisse: { view: true, create: true, edit: false, delete: false },
    rapports: READ_ONLY,
    audit: NONE,
    parametres: NONE,
  },
};

export function can(role: Role | null, module: Module, action: keyof Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.[module]?.[action] ?? false;
}

// Le prix d'achat est un champ sensible: réservé à admin et gestionnaire.
export function canEditPrixAchat(role: Role | null): boolean {
  return role === 'admin' || role === 'gestionnaire';
}

export function canManageUsers(role: Role | null): boolean {
  return role === 'admin';
}
