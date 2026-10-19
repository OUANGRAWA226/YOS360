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

export type Lot = {
  id: string;
  produit_id: string;
  numero_lot: string;
  numero_serie: string | null;
  date_peremption: string | null;
  quantite: number;
  prix_unitaire: number;
  entrepot_id: string | null;
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
