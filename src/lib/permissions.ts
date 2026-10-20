export type Role =
  | 'proprietaire'
  | 'admin'
  | 'gerant'
  | 'gestionnaire'
  | 'comptable'
  | 'magasinier'
  | 'caissier'
  | 'vendeur';

export const ROLE_LABELS: Record<Role, string> = {
  proprietaire: 'Propriétaire (Dirigeant)',
  admin: 'Administrateur',
  gerant: 'Gérant',
  gestionnaire: 'Gestionnaire',
  comptable: 'Comptable',
  magasinier: 'Magasinier',
  caissier: 'Caissier',
  vendeur: 'Vendeur',
};

export const DEFAULT_ROLES = [
  { code: 'proprietaire', label: 'Propriétaire', description: 'Accès intégral à l\'entreprise et tous les sites' },
  { code: 'gerant', label: 'Gérant', description: 'Direction opérationnelle : ventes, achats, caisse, stock, validations' },
  { code: 'comptable', label: 'Comptable', description: 'Gestion financière : facturation, créances, paiements, rapprochements' },
  { code: 'magasinier', label: 'Magasinier', description: 'Gestion physique : réceptions, transferts, comptages, réappro' },
  { code: 'caissier', label: 'Caissier', description: 'Point de vente : encaissements, sessions de caisse, ticket Z' },
  { code: 'vendeur', label: 'Vendeur', description: 'Commercial : devis, commandes clients, catalogue' },
];

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
  | 'achats'
  | 'ventes'
  | 'paiements'
  | 'caisse'
  | 'rapports'
  | 'audit'
  | 'parametres'
  | 'import_export'
  | 'tarifs'
  | 'validations'
  | 'comptabilite'
  | 'tresorerie'
  | 'equipe';

export type Permission = {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
};

const FULL: Permission = { view: true, create: true, edit: true, delete: true };
const READ_ONLY: Permission = { view: true, create: false, edit: false, delete: false };
const NONE: Permission = { view: false, create: false, edit: false, delete: false };

// Matrice statique de repli par rôle
export const ROLE_PERMISSIONS: Record<Role, Record<Module, Permission>> = {
  proprietaire: {
    dashboard: FULL, produits: FULL, categories: FULL, mouvements: FULL,
    entrepots: FULL, transferts: FULL, inventaires: FULL, lots: FULL, scan: FULL, reappro: FULL,
    fournisseurs: FULL, clients: FULL, commandes: FULL, achats: FULL, ventes: FULL,
    paiements: FULL, caisse: FULL, rapports: FULL, audit: FULL, parametres: FULL, import_export: FULL,
    tarifs: FULL, validations: FULL,
    comptabilite: FULL, tresorerie: FULL, equipe: FULL,
  },
  admin: {
    dashboard: FULL, produits: FULL, categories: FULL, mouvements: FULL,
    entrepots: FULL, transferts: FULL, inventaires: FULL, lots: FULL, scan: FULL, reappro: FULL,
    fournisseurs: FULL, clients: FULL, commandes: FULL, achats: FULL, ventes: FULL,
    paiements: FULL, caisse: FULL, rapports: FULL, audit: FULL, parametres: FULL, import_export: FULL,
    tarifs: FULL, validations: FULL,
    comptabilite: FULL, tresorerie: FULL, equipe: FULL,
  },
  gerant: {
    dashboard: FULL, produits: FULL, categories: FULL, mouvements: FULL,
    entrepots: FULL, transferts: FULL, inventaires: FULL, lots: FULL, scan: FULL, reappro: FULL,
    fournisseurs: FULL, clients: FULL, commandes: FULL, achats: FULL, ventes: FULL,
    paiements: FULL, caisse: FULL, rapports: FULL,
    audit: { view: true, create: false, edit: false, delete: false },
    parametres: { view: true, create: true, edit: true, delete: false },
    import_export: FULL,
    tarifs: FULL,
    validations: FULL,
    comptabilite: FULL, tresorerie: FULL, equipe: FULL,
  },
  gestionnaire: {
    dashboard: FULL, produits: FULL, categories: FULL, mouvements: FULL,
    entrepots: FULL, transferts: FULL, inventaires: FULL, lots: FULL, scan: FULL, reappro: FULL,
    fournisseurs: FULL, clients: FULL, commandes: FULL, achats: FULL, ventes: FULL,
    paiements: FULL, caisse: FULL, rapports: FULL,
    audit: { view: true, create: false, edit: false, delete: false },
    parametres: { view: true, create: false, edit: false, delete: false },
    import_export: READ_ONLY,
    tarifs: FULL,
    validations: { view: true, create: true, edit: false, delete: false },
    comptabilite: READ_ONLY, tresorerie: READ_ONLY, equipe: READ_ONLY,
  },
  comptable: {
    dashboard: FULL, produits: READ_ONLY, categories: READ_ONLY, mouvements: READ_ONLY,
    entrepots: READ_ONLY, transferts: READ_ONLY, inventaires: READ_ONLY, lots: READ_ONLY, scan: NONE, reappro: READ_ONLY,
    fournisseurs: FULL, clients: FULL, commandes: FULL, achats: FULL, ventes: FULL,
    paiements: FULL, caisse: READ_ONLY, rapports: FULL,
    audit: { view: true, create: false, edit: false, delete: false },
    parametres: NONE,
    import_export: FULL,
    tarifs: READ_ONLY,
    validations: { view: true, create: true, edit: false, delete: false },
    comptabilite: FULL, tresorerie: FULL, equipe: { view: true, create: true, edit: true, delete: false },
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
    achats: { view: true, create: true, edit: true, delete: false },
    ventes: NONE,
    paiements: NONE,
    caisse: NONE,
    rapports: READ_ONLY,
    audit: NONE,
    parametres: NONE,
    import_export: NONE,
    tarifs: NONE,
    validations: { view: true, create: true, edit: false, delete: false },
    comptabilite: NONE, tresorerie: NONE, equipe: NONE,
  },
  caissier: {
    dashboard: { view: true, create: false, edit: false, delete: false },
    produits: READ_ONLY,
    categories: READ_ONLY,
    mouvements: NONE,
    entrepots: NONE,
    transferts: NONE,
    inventaires: NONE,
    lots: NONE,
    scan: FULL,
    reappro: NONE,
    fournisseurs: NONE,
    clients: { view: true, create: true, edit: false, delete: false },
    commandes: { view: true, create: true, edit: false, delete: false },
    achats: NONE,
    ventes: { view: true, create: true, edit: false, delete: false },
    paiements: { view: true, create: true, edit: false, delete: false },
    caisse: FULL,
    rapports: NONE,
    audit: NONE,
    parametres: NONE,
    import_export: NONE,
    tarifs: READ_ONLY,
    validations: NONE,
    comptabilite: NONE, tresorerie: NONE, equipe: NONE,
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
    achats: NONE,
    ventes: { view: true, create: true, edit: true, delete: false },
    paiements: { view: true, create: true, edit: false, delete: false },
    caisse: { view: true, create: true, edit: false, delete: false },
    rapports: READ_ONLY,
    audit: NONE,
    parametres: NONE,
    import_export: NONE,
    tarifs: READ_ONLY,
    validations: { view: true, create: true, edit: false, delete: false },
    comptabilite: NONE, tresorerie: NONE,
    equipe: { view: true, create: false, edit: false, delete: false },
  },
};

export function can(role: Role | null, module: Module, action: keyof Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.[module]?.[action] ?? false;
}

// Vérification de permission granulaire BDD (module.action) avec portée multi-sites
export function hasPermission(
  role: Role | null,
  permissionCode: string,
  userSites?: string[],
  targetSiteId?: string | null
): boolean {
  if (!role) return false;
  if (role === 'proprietaire' || role === 'admin') return true;

  // Filtrage multi-sites : si l'utilisateur a des sites assignés et que l'action cible un site
  if (userSites && userSites.length > 0 && targetSiteId) {
    if (!userSites.includes(targetSiteId)) {
      return false;
    }
  }

  // Décomposition module.action
  const parts = permissionCode.split('.');
  if (parts.length >= 2) {
    const mod = parts[0] as Module;
    const act = parts[parts.length - 1];
    let permKey: keyof Permission = 'view';
    if (act.includes('creer') || act.includes('ouvrir')) permKey = 'create';
    else if (act.includes('modifier') || act.includes('valider') || act.includes('cloturer')) permKey = 'edit';
    else if (act.includes('supprimer')) permKey = 'delete';

    if (ROLE_PERMISSIONS[role]?.[mod]) {
      return ROLE_PERMISSIONS[role][mod][permKey];
    }
  }

  return false;
}

export function canEditPrixAchat(role: Role | null): boolean {
  return role === 'admin' || role === 'proprietaire' || role === 'gerant' || role === 'gestionnaire' || role === 'comptable';
}

export function canManageUsers(role: Role | null): boolean {
  return role === 'admin' || role === 'proprietaire' || role === 'gerant';
}
