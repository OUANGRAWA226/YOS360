import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder-key');

export type Role = 'admin' | 'gestionnaire' | 'magasinier' | 'vendeur';

export type Categorie = {
  id: string;
  nom: string;
  description: string | null;
  couleur: string;
  created_at: string;
};

export type Produit = {
  id: string;
  nom: string;
  sku: string | null;
  description: string | null;
  categorie_id: string | null;
  quantite: number;
  seuil_alerte: number;
  prix_unitaire: number;
  prix_vente: number;
  unite: string;
  emplacement: string | null;
  code_barres: string | null;
  perissable: boolean;
  alerte_peremption_jours: number;
  methode_valorisation: 'cmup' | 'fifo';
  cmup: number;
  quantite_economique: number;
  type_produit?: 'simple' | 'compose' | 'service' | 'variante_parent';
  created_at: string;
  updated_at: string;
};

export type Mouvement = {
  id: string;
  produit_id: string;
  type: 'entree' | 'sortie';
  quantite: number;
  motif: string | null;
  fournisseur: string | null;
  destinataire: string | null;
  reference: string | null;
  entrepot_id: string | null;
  lot_id: string | null;
  prix_unitaire: number;
  created_at: string;
};

export type Entrepot = {
  id: string;
  nom: string;
  code: string | null;
  adresse: string | null;
  ville: string | null;
  responsable: string | null;
  actif: boolean;
  created_at: string;
};

export type StockEntrepot = {
  id: string;
  produit_id: string;
  entrepot_id: string;
  quantite: number;
  updated_at: string;
};

export type TransfertStatut = 'en_preparation' | 'envoye' | 'recu' | 'annule';

export type Transfert = {
  id: string;
  reference: string;
  produit_id: string;
  quantite: number;
  entrepot_source_id: string;
  entrepot_dest_id: string;
  statut: TransfertStatut;
  note: string | null;
  envoye_at: string | null;
  recu_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type InventaireStatut = 'en_cours' | 'valide' | 'annule';

export type Inventaire = {
  id: string;
  reference: string;
  entrepot_id: string | null;
  statut: InventaireStatut;
  date_debut: string;
  date_cloture: string | null;
  note: string | null;
};

export type InventaireLigne = {
  id: string;
  inventaire_id: string;
  produit_id: string;
  stock_theorique: number;
  stock_compte: number | null;
  created_at: string;
};

export type LotStatut = 'actif' | 'quarantaine' | 'rejete' | 'epuise';

export type Lot = {
  id: string;
  entreprise_id?: string;
  produit_id: string;
  numero_lot: string;
  numero_serie: string | null;
  date_peremption: string | null;
  quantite: number;
  prix_unitaire: number;
  entrepot_id: string | null;
  statut?: LotStatut;
  fabricant?: string | null;
  date_fabrication?: string | null;
  notes?: string | null;
  created_at: string;
};

export type Fournisseur = {
  id: string;
  nom: string;
  contact: string | null;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  pays: string;
  note: string | null;
  created_at: string;
};

export type Client = {
  id: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  pays: string;
  note: string | null;
  created_at: string;
};

export type CommandeStatut = 'en_attente' | 'confirmee' | 'expediee' | 'recue' | 'annulee';
export type CommandeType = 'achat' | 'vente';

export type Commande = {
  id: string;
  type: CommandeType;
  fournisseur_id: string | null;
  client_id: string | null;
  statut: CommandeStatut;
  reference: string | null;
  montant_total: number;
  date_commande: string;
  date_livraison: string | null;
  note: string | null;
  type_document: 'devis' | 'facture' | 'bon_livraison' | 'avoir' | null;
  numero_document: string | null;
  tva_taux: number | null;
  montant_ht: number | null;
  montant_tva: number | null;
  date_echeance: string | null;
  client_walkin: string | null;
  created_at: string;
};

export type CommandeItem = {
  id: string;
  commande_id: string;
  produit_id: string | null;
  quantite: number;
  quantite_recue: number;
  prix_unitaire: number;
  sous_total: number;
  created_at: string;
};

// Compound types with relations
export type ProduitWithCategorie = Produit & {
  categories: Categorie | null;
};

export type TransfertWithRelations = Transfert & {
  produits: { nom: string; sku: string | null; unite: string } | null;
  entrepots_source: { nom: string } | null;
  entrepots_dest: { nom: string } | null;
};

export type InventaireWithRelations = Inventaire & {
  entrepots: { nom: string } | null;
  inventaire_lignes: (InventaireLigne & { produits: { nom: string; sku: string | null; unite: string } | null })[];
};

export type LotWithProduit = Lot & {
  produits: { nom: string; sku: string | null; unite: string; perissable: boolean; alerte_peremption_jours: number } | null;
};

export type MouvementWithProduit = Mouvement & {
  produits: { nom: string; sku: string | null } | null;
};

export type CommandeWithRelations = Commande & {
  fournisseurs: { nom: string } | null;
  clients: { nom: string; telephone: string | null; adresse: string | null; ville: string | null } | null;
  commande_items: (CommandeItem & { produits: { nom: string; sku: string | null } | null })[];
};

export type CommandeItemWithProduit = CommandeItem & {
  produits: { nom: string; sku: string | null } | null;
};

export type JournalAudit = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  table_name: string;
  record_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  champ: string | null;
  ancienne_valeur: string | null;
  nouvelle_valeur: string | null;
  donnees: Record<string, unknown> | null;
  created_at: string;
};

export type Entreprise = {
  id: string;
  nom: string;
  slogan: string | null;
  adresse: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  logo_url: string | null;
  tva_taux: number;
  tva_active: boolean;
  devise: string;
  mention_bas: string | null;
  modules: string[];
  ifu?: string | null;
  rccm?: string | null;
  division_fiscale?: string | null;
  pack: string | null;
  suspendue: boolean;
  actif: boolean;
  created_at: string;
  updated_at: string;
};

export type SensPaiement = 'encaissement' | 'decaissement';
export type ModePaiement = 'especes' | 'orange_money' | 'moov_money' | 'wave' | 'virement' | 'cheque' | 'carte';

export type Paiement = {
  id: string;
  commande_id: string | null;
  client_id: string | null;
  fournisseur_id: string | null;
  sens: SensPaiement;
  montant: number;
  mode: ModePaiement;
  reference: string | null;
  date_paiement: string;
  note: string | null;
};

export type PaiementWithRelations = Paiement & {
  clients: { nom: string } | null;
  fournisseurs: { nom: string } | null;
  commandes: { reference: string | null; numero_document: string | null } | null;
};

// =============================================================================
// TYPES PHASE 1 : RBAC, ACHATS, VENTES STRICTES, CAISSE POS, PAIEMENTS
// =============================================================================

export type RoleDefinition = {
  id: string;
  nom: string;
  code: string;
  description: string | null;
  is_system: boolean;
};

export type PermissionDefinition = {
  id: string;
  module: string;
  action: string;
  code: string;
  nom: string;
  description: string | null;
};

export type UserSite = {
  user_id: string;
  site_id: string;
  entreprise_id: string;
  is_default: boolean;
  entrepots?: { nom: string; code: string | null } | null;
};

export type UserSession = {
  id: string;
  user_id: string;
  ip_address: string | null;
  user_agent: string | null;
  device_info: string | null;
  revoked: boolean;
  revoked_at: string | null;
  created_at: string;
  expires_at: string;
};

// --- ACHATS ---
export type AchatsDemande = {
  id: string;
  entreprise_id: string;
  site_id: string | null;
  numero: string;
  demandeur_id: string | null;
  statut: 'brouillon' | 'en_attente' | 'approuvee' | 'rejetee' | 'commandee' | 'annulee';
  motif: string | null;
  date_besoin: string | null;
  total_estime: number;
  created_at: string;
};

export type AchatsBonCommande = {
  id: string;
  entreprise_id: string;
  site_id: string | null;
  fournisseur_id: string;
  demande_id: string | null;
  numero: string;
  statut: 'brouillon' | 'valide' | 'partiellement_recu' | 'recu' | 'annule';
  date_commande: string;
  date_livraison_prevue: string | null;
  montant_ht: number;
  tva_taux: number;
  montant_tva: number;
  montant_total: number;
  conditions_paiement: string | null;
  notes: string | null;
  valide_par: string | null;
  valide_at: string | null;
  created_at: string;
  fournisseurs?: { nom: string; telephone: string | null } | null;
  entrepots?: { nom: string } | null;
  achats_bc_lignes?: AchatsBcLigne[];
};

export type AchatsBcLigne = {
  id: string;
  bon_commande_id: string;
  produit_id: string;
  quantite_commandee: number;
  quantite_recue: number;
  prix_unitaire: number;
  remise_pct: number;
  sous_total: number;
  produits?: { nom: string; sku: string | null; unite: string } | null;
};

export type AchatsReception = {
  id: string;
  entreprise_id: string;
  site_id: string;
  bon_commande_id: string | null;
  fournisseur_id: string;
  numero: string;
  numero_bl_fournisseur: string | null;
  statut: 'brouillon' | 'validee' | 'annulee';
  date_reception: string;
  receptionne_par: string | null;
  notes: string | null;
  created_at: string;
  fournisseurs?: { nom: string } | null;
  entrepots?: { nom: string } | null;
  achats_reception_lignes?: AchatsReceptionLigne[];
};

export type AchatsReceptionLigne = {
  id: string;
  reception_id: string;
  produit_id: string;
  quantite_recue: number;
  prix_unitaire_achat: number;
  numero_lot: string | null;
  date_peremption: string | null;
  produits?: { nom: string; sku: string | null } | null;
};

export type AchatsFacture = {
  id: string;
  entreprise_id: string;
  site_id: string | null;
  fournisseur_id: string;
  bon_commande_id: string | null;
  reception_id: string | null;
  numero: string;
  numero_facture_fournisseur: string;
  date_facture: string;
  date_echeance: string | null;
  montant_ht: number;
  montant_tva: number;
  montant_total: number;
  montant_paye: number;
  statut: 'en_attente' | 'partiellement_payee' | 'payee' | 'litige' | 'annulee';
  notes: string | null;
  created_at: string;
  fournisseurs?: { nom: string } | null;
};

export type AchatsRetour = {
  id: string;
  entreprise_id: string;
  site_id: string;
  fournisseur_id: string;
  reception_id: string | null;
  numero: string;
  motif: string;
  statut: 'brouillon' | 'valide' | 'annule';
  total_retour: number;
  created_at: string;
  fournisseurs?: { nom: string } | null;
};

// --- VENTES STRICTES ---
export type VentesDevis = {
  id: string;
  entreprise_id: string;
  site_id: string | null;
  client_id: string | null;
  client_prospect: string | null;
  numero: string;
  statut: 'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'expire' | 'transforme';
  date_devis: string;
  date_validite: string | null;
  montant_ht: number;
  tva_taux: number;
  montant_tva: number;
  montant_total: number;
  notes: string | null;
  created_at: string;
  clients?: { nom: string; telephone: string | null } | null;
  ventes_devis_lignes?: VentesDevisLigne[];
};

export type VentesDevisLigne = {
  id: string;
  devis_id: string;
  produit_id: string;
  quantite: number;
  prix_unitaire: number;
  remise_pct: number;
  sous_total: number;
  produits?: { nom: string; sku: string | null } | null;
};

export type VentesFacture = {
  id: string;
  entreprise_id: string;
  site_id: string | null;
  client_id: string | null;
  commande_id: string | null;
  livraison_id: string | null;
  numero: string;
  date_facture: string;
  date_echeance: string | null;
  montant_ht: number;
  tva_taux: number;
  montant_tva: number;
  montant_total: number;
  montant_regle: number;
  statut: 'brouillon' | 'validee' | 'partiellement_payee' | 'payee' | 'annulee';
  is_locked: boolean;
  mentions_legales: string | null;
  qr_code_hash: string | null;
  created_at: string;
  clients?: { nom: string; telephone: string | null; adresse: string | null } | null;
  ventes_facture_lignes?: VentesFactureLigne[];
};

export type VentesFactureLigne = {
  id: string;
  facture_id: string;
  produit_id: string;
  description: string | null;
  quantite: number;
  prix_unitaire: number;
  remise_pct: number;
  sous_total: number;
  produits?: { nom: string; sku: string | null } | null;
};

export type VentesAvoir = {
  id: string;
  entreprise_id: string;
  site_id: string | null;
  facture_id: string;
  client_id: string | null;
  numero: string;
  date_avoir: string;
  motif: string;
  reintegrer_stock: boolean;
  montant_ht: number;
  montant_tva: number;
  montant_total: number;
  statut: 'brouillon' | 'valide' | 'rembourse' | 'annule';
  created_at: string;
  clients?: { nom: string } | null;
  factures?: { numero: string } | null;
};

// --- CAISSE SESSIONS ---
export type CaissePoste = {
  id: string;
  entreprise_id: string;
  site_id: string;
  nom: string;
  code: string;
  imprimante_largeur_mm: 58 | 80;
  actif: boolean;
  created_at: string;
};

export type CaisseSession = {
  id: string;
  entreprise_id: string;
  site_id: string;
  poste_id: string | null;
  caissier_id: string;
  numero_session: string;
  date_ouverture: string;
  date_cloture: string | null;
  statut: 'ouverte' | 'cloturee';
  fond_caisse_ouverture: number;
  total_especes_theorique: number;
  total_especes_compte: number | null;
  ecart_especes: number | null;
  total_mobile_money: number;
  total_carte: number;
  total_credit: number;
  total_ventes: number;
  nb_ventes: number;
  ticket_z_json: Record<string, unknown> | null;
  notes_cloture: string | null;
  created_at: string;
  profiles?: { nom_complet: string | null; email: string } | null;
  entrepots?: { nom: string } | null;
};

export type CaisseMouvementFond = {
  id: string;
  session_id: string;
  type: 'apport' | 'retrait';
  montant: number;
  motif: string;
  effectue_par: string;
  created_at: string;
};

// --- UNIFIED PAYMENTS & MOBILE MONEY ---
export type PaymentMoyen = 'especes' | 'orange_money' | 'moov_money' | 'wave' | 'virement' | 'cheque' | 'carte' | 'credit_client';

export type Payment = {
  id: string;
  entreprise_id: string;
  site_id: string | null;
  sens: 'encaissement' | 'decaissement';
  facture_client_id: string | null;
  facture_fournisseur_id: string | null;
  commande_id: string | null;
  caisse_session_id: string | null;
  client_id: string | null;
  fournisseur_id: string | null;
  moyen_paiement: PaymentMoyen;
  montant: number;
  date_paiement: string;
  reference_transaction: string | null;
  statut: 'en_attente' | 'confirme' | 'rejete' | 'annule';
  recu_par: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

// ============================================================================
// PHASE 2 : UNITÉS, VARIANTES, COMPOSANTS, AJUSTEMENTS, TARIFS & WORKFLOWS
// ============================================================================

export type ProduitUnite = {
  id: string;
  entreprise_id: string;
  produit_id: string;
  nom_unite: string;
  code_court: string | null;
  coefficient: number;
  est_unite_base: boolean;
  code_barres: string | null;
  prix_vente_suggere: number | null;
  created_at: string;
};

export type ProduitVariante = {
  id: string;
  entreprise_id: string;
  produit_id: string;
  sku: string;
  nom_variante: string;
  attributs: Record<string, string>;
  code_barres: string | null;
  prix_vente: number;
  prix_achat: number;
  quantite: number;
  actif: boolean;
  created_at: string;
};

export type ProduitComposant = {
  id: string;
  entreprise_id: string;
  produit_parent_id: string;
  composant_produit_id: string;
  quantite_composant: number;
  perte_pourcentage: number;
  instructions: string | null;
  created_at: string;
  composant?: Produit;
};

export type MotifAjustement = 'casse' | 'vol' | 'echantillon' | 'peremption' | 'ecart_inventaire' | 'revalorisation' | 'autre';
export type StatutAjustement = 'brouillon' | 'en_attente' | 'approuve' | 'rejete';

export type StockAjustement = {
  id: string;
  entreprise_id: string;
  site_id: string | null;
  numero_document: string;
  motif: MotifAjustement;
  description: string | null;
  statut: StatutAjustement;
  valeur_totale: number;
  exige_approbation: boolean;
  created_by: string | null;
  approuve_par: string | null;
  approuve_at: string | null;
  motif_rejet: string | null;
  created_at: string;
  updated_at: string;
  site?: Entrepot;
  lignes?: StockAjustementLigne[];
};

export type StockAjustementLigne = {
  id: string;
  ajustement_id: string;
  produit_id: string;
  lot_id: string | null;
  type_ajustement: 'positif' | 'negatif';
  quantite: number;
  cout_unitaire: number;
  valeur_ligne: number;
  created_at: string;
  produit?: Produit;
  lot?: Lot;
};

export type CategorieClient = 'detail' | 'demi_gros' | 'grossiste' | 'vip' | 'partenaire';

export type GrilleTarifaire = {
  id: string;
  entreprise_id: string;
  nom: string;
  categorie_client: CategorieClient;
  remise_globale_pourcentage: number;
  description: string | null;
  actif: boolean;
  created_at: string;
  lignes?: GrilleTarifaireLigne[];
};

export type GrilleTarifaireLigne = {
  id: string;
  grille_id: string;
  produit_id: string;
  prix_specifique: number | null;
  remise_pourcentage: number | null;
  quantite_min: number;
  created_at: string;
  produit?: Produit;
};

export type Promotion = {
  id: string;
  entreprise_id: string;
  code: string | null;
  nom: string;
  type_remise: 'pourcentage' | 'montant_fixe';
  valeur_remise: number;
  montant_minimum_achat: number;
  date_debut: string;
  date_fin: string;
  nb_utilisations_max: number | null;
  nb_utilisations_actuel: number;
  site_id: string | null;
  actif: boolean;
  created_at: string;
};

export type TypeDemandeWorkflow = 'ajustement_stock' | 'bon_commande' | 'remise_exceptionnelle' | 'transfert_stock';

export type ValidationWorkflow = {
  id: string;
  entreprise_id: string;
  site_id: string | null;
  type_demande: TypeDemandeWorkflow;
  reference_id: string;
  reference_numero: string;
  demandeur_id: string | null;
  statut: 'en_attente' | 'approuve' | 'rejete';
  valeur_estimee: number;
  details: Record<string, unknown>;
  valide_par: string | null;
  valide_at: string | null;
  motif_rejet: string | null;
  created_at: string;
};

export type NotificationQueue = {
  id: string;
  entreprise_id: string;
  canal: 'in_app' | 'email' | 'sms' | 'whatsapp';
  destinataire: string;
  titre: string;
  message: string;
  statut: 'en_attente' | 'envoye' | 'echec';
  tentatives: number;
  erreur_dernier_envoi?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  envoye_at?: string | null;
};


