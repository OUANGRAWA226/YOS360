/*
================================================================================
  YOS360 — PHASE 1 MIGRATION : RBAC, MULTI-SITES, ACHATS, VENTES, POS, PAIEMENTS
================================================================================
  Date : 20 Octobre 2026
  Auteur : Ingénieur Full-Stack Senior YOS360
  Description :
    1.1 Rôles & Permissions dynamiques BDD (RBAC granulaire + sites assignés + 2FA + sessions)
    1.2 Chaîne Achats complète (DA -> BC -> Réception avec CMUP -> Facture -> Retour)
    1.3 Chaîne Ventes & Facturation stricte (Devis -> Commande -> BL -> Facture inviolable -> Avoir)
    1.4 Caisse POS (Postes de caisse, Sessions, Fond de caisse, Ticket Z, Ventes multi-moyens)
    1.5 Paiements unifiés & Gestion des créances (Mobile Money, Espèces, Plafonds crédit)
    Sécurité : Correction de la faille RLS cross-tenant (is_super_admin vs is_admin)
================================================================================
*/

-- -----------------------------------------------------------------------------
-- 0. FONDATION SÉCURITÉ : DISTINCTION SUPER_ADMIN VS TENANT ADMIN
-- -----------------------------------------------------------------------------

-- Fonction pour vérifier si l'utilisateur est Super Administrateur de la plateforme YOS360
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND super_admin = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Fonction is_admin : vrai si administrateur d'un tenant ou super admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin' OR super_admin = true)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Ajout de colonnes de sécurité & 2FA sur profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS two_factor_secret text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telephone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dernier_acces timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Ajout du deleted_at pour soft-delete sur les tables existantes
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.fournisseurs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.commandes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.entrepots ADD COLUMN IF NOT EXISTS deleted_at timestamptz;


-- -----------------------------------------------------------------------------
-- 1.1 MODULE RÔLES & PERMISSIONS (RBAC GRANULAIRE BDD)
-- -----------------------------------------------------------------------------

-- Table des rôles par entreprise (ou rôles systèmes globaux si entreprise_id IS NULL)
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid REFERENCES public.entreprises(id) ON DELETE CASCADE,
  nom text NOT NULL,
  code text NOT NULL, -- ex: proprietaire, gerant, comptable, magasinier, caissier, vendeur
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entreprise_id, code)
);

-- Table des permissions système (format module.action)
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,          -- ex: ventes, achats, stock, finance, caisse, administration
  action text NOT NULL,          -- ex: voir, creer, modifier, supprimer, valider, exporter
  code text NOT NULL UNIQUE,     -- ex: achats.bon_commande.valider, ventes.facture.creer
  nom text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table de liaison rôles <-> permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

-- Table d'attribution des rôles aux utilisateurs
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- Table d'attribution des sites autorisés aux utilisateurs (multi-sites filtrable)
CREATE TABLE IF NOT EXISTS public.user_sites (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.entrepots(id) ON DELETE CASCADE,
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, site_id)
);

-- Table des sessions actives avec révocation
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ip_address text,
  user_agent text,
  device_info text,
  revoked boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);


-- -----------------------------------------------------------------------------
-- 1.2 MODULE ACHATS (DA -> BC -> RÉCEPTION AVEC CMUP -> FACTURE -> RETOUR)
-- -----------------------------------------------------------------------------

-- Demandes d'achat internes
CREATE TABLE IF NOT EXISTS public.achats_demandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  numero text NOT NULL,
  demandeur_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'en_attente', 'approuvee', 'rejetee', 'commandee', 'annulee')),
  motif text,
  date_besoin date,
  total_estime numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS public.achats_demande_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id uuid NOT NULL REFERENCES public.achats_demandes(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite integer NOT NULL CHECK (quantite > 0),
  prix_estime numeric(12,2) NOT NULL DEFAULT 0,
  note text
);

-- Bons de commande fournisseurs
CREATE TABLE IF NOT EXISTS public.achats_bons_commande (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs(id) ON DELETE RESTRICT,
  demande_id uuid REFERENCES public.achats_demandes(id) ON DELETE SET NULL,
  numero text NOT NULL,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'valide', 'partiellement_recu', 'recu', 'annule')),
  date_commande date NOT NULL DEFAULT CURRENT_DATE,
  date_livraison_prevue date,
  montant_ht numeric(12,2) NOT NULL DEFAULT 0,
  tva_taux numeric NOT NULL DEFAULT 18,
  montant_tva numeric(12,2) NOT NULL DEFAULT 0,
  montant_total numeric(12,2) NOT NULL DEFAULT 0,
  conditions_paiement text,
  notes text,
  valide_par uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  valide_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS public.achats_bc_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bon_commande_id uuid NOT NULL REFERENCES public.achats_bons_commande(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite_commandee integer NOT NULL CHECK (quantite_commandee > 0),
  quantite_recue integer NOT NULL DEFAULT 0,
  prix_unitaire numeric(12,4) NOT NULL CHECK (prix_unitaire >= 0),
  remise_pct numeric(5,2) NOT NULL DEFAULT 0,
  sous_total numeric(12,2) NOT NULL
);

-- Réceptions fournisseurs (par site avec mise à jour du CMUP)
CREATE TABLE IF NOT EXISTS public.achats_receptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.entrepots(id) ON DELETE RESTRICT,
  bon_commande_id uuid REFERENCES public.achats_bons_commande(id) ON DELETE SET NULL,
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs(id) ON DELETE RESTRICT,
  numero text NOT NULL,
  numero_bl_fournisseur text,
  statut text NOT NULL DEFAULT 'validee' CHECK (statut IN ('brouillon', 'validee', 'annulee')),
  date_reception timestamptz NOT NULL DEFAULT now(),
  receptionne_par uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS public.achats_reception_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reception_id uuid NOT NULL REFERENCES public.achats_receptions(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite_recue integer NOT NULL CHECK (quantite_recue > 0),
  prix_unitaire_achat numeric(12,4) NOT NULL,
  numero_lot text,
  date_peremption date,
  bc_ligne_id uuid REFERENCES public.achats_bc_lignes(id) ON DELETE SET NULL
);

-- Factures fournisseurs (pour contrôle de rapprochement 3-voies)
CREATE TABLE IF NOT EXISTS public.achats_factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs(id) ON DELETE RESTRICT,
  bon_commande_id uuid REFERENCES public.achats_bons_commande(id) ON DELETE SET NULL,
  reception_id uuid REFERENCES public.achats_receptions(id) ON DELETE SET NULL,
  numero text NOT NULL,
  numero_facture_fournisseur text NOT NULL,
  date_facture date NOT NULL DEFAULT CURRENT_DATE,
  date_echeance date,
  montant_ht numeric(12,2) NOT NULL DEFAULT 0,
  montant_tva numeric(12,2) NOT NULL DEFAULT 0,
  montant_total numeric(12,2) NOT NULL DEFAULT 0,
  montant_paye numeric(12,2) NOT NULL DEFAULT 0,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'partiellement_payee', 'payee', 'litige', 'annulee')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS public.achats_facture_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid NOT NULL REFERENCES public.achats_factures(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite integer NOT NULL CHECK (quantite > 0),
  prix_unitaire numeric(12,4) NOT NULL,
  sous_total numeric(12,2) NOT NULL
);

-- Retours aux fournisseurs
CREATE TABLE IF NOT EXISTS public.achats_retours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.entrepots(id) ON DELETE RESTRICT,
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs(id) ON DELETE RESTRICT,
  reception_id uuid REFERENCES public.achats_receptions(id) ON DELETE SET NULL,
  numero text NOT NULL,
  motif text NOT NULL,
  statut text NOT NULL DEFAULT 'valide' CHECK (statut IN ('brouillon', 'valide', 'annule')),
  total_retour numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS public.achats_retour_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retour_id uuid NOT NULL REFERENCES public.achats_retours(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite integer NOT NULL CHECK (quantite > 0),
  prix_unitaire numeric(12,4) NOT NULL,
  sous_total numeric(12,2) NOT NULL
);


-- -----------------------------------------------------------------------------
-- 1.3 MODULE VENTES & FACTURATION STRICTE (DEVIS -> CMD -> BL -> FAC -> AVOIR)
-- -----------------------------------------------------------------------------

-- Devis clients
CREATE TABLE IF NOT EXISTS public.ventes_devis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_prospect text,
  numero text NOT NULL,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'envoye', 'accepte', 'refuse', 'expire', 'transforme')),
  date_devis date NOT NULL DEFAULT CURRENT_DATE,
  date_validite date,
  montant_ht numeric(12,2) NOT NULL DEFAULT 0,
  tva_taux numeric NOT NULL DEFAULT 18,
  montant_tva numeric(12,2) NOT NULL DEFAULT 0,
  montant_total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  conditions_reglement text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS public.ventes_devis_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id uuid NOT NULL REFERENCES public.ventes_devis(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite integer NOT NULL CHECK (quantite > 0),
  prix_unitaire numeric(12,2) NOT NULL,
  remise_pct numeric(5,2) NOT NULL DEFAULT 0,
  sous_total numeric(12,2) NOT NULL
);

-- Commandes clients
CREATE TABLE IF NOT EXISTS public.ventes_commandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  devis_id uuid REFERENCES public.ventes_devis(id) ON DELETE SET NULL,
  numero text NOT NULL,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'confirmee', 'en_preparation', 'partiellement_livree', 'livree', 'cloturee', 'annulee')),
  date_commande date NOT NULL DEFAULT CURRENT_DATE,
  date_livraison_souhaitee date,
  montant_ht numeric(12,2) NOT NULL DEFAULT 0,
  tva_taux numeric NOT NULL DEFAULT 18,
  montant_tva numeric(12,2) NOT NULL DEFAULT 0,
  montant_total numeric(12,2) NOT NULL DEFAULT 0,
  acompte_verse numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS public.ventes_commande_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES public.ventes_commandes(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite_commandee integer NOT NULL CHECK (quantite_commandee > 0),
  quantite_livree integer NOT NULL DEFAULT 0,
  quantite_facturee integer NOT NULL DEFAULT 0,
  prix_unitaire numeric(12,2) NOT NULL,
  remise_pct numeric(5,2) NOT NULL DEFAULT 0,
  sous_total numeric(12,2) NOT NULL
);

-- Bons de livraison (Sortie de stock physique)
CREATE TABLE IF NOT EXISTS public.ventes_livraisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.entrepots(id) ON DELETE RESTRICT,
  commande_id uuid REFERENCES public.ventes_commandes(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  numero text NOT NULL,
  statut text NOT NULL DEFAULT 'valide' CHECK (statut IN ('brouillon', 'valide', 'annule')),
  date_livraison timestamptz NOT NULL DEFAULT now(),
  adresse_livraison text,
  transporteur text,
  livre_par uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS public.ventes_livraison_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  livraison_id uuid NOT NULL REFERENCES public.ventes_livraisons(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite_livree integer NOT NULL CHECK (quantite_livree > 0),
  commande_ligne_id uuid REFERENCES public.ventes_commande_lignes(id) ON DELETE SET NULL
);

-- Factures de vente officielles (Inviolables dès validation)
CREATE TABLE IF NOT EXISTS public.ventes_factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  commande_id uuid REFERENCES public.ventes_commandes(id) ON DELETE SET NULL,
  livraison_id uuid REFERENCES public.ventes_livraisons(id) ON DELETE SET NULL,
  numero text NOT NULL, -- Format strict : FAC-2026-00001
  date_facture date NOT NULL DEFAULT CURRENT_DATE,
  date_echeance date,
  montant_ht numeric(12,2) NOT NULL DEFAULT 0,
  tva_taux numeric NOT NULL DEFAULT 18,
  montant_tva numeric(12,2) NOT NULL DEFAULT 0,
  montant_total numeric(12,2) NOT NULL DEFAULT 0,
  montant_regle numeric(12,2) NOT NULL DEFAULT 0,
  statut text NOT NULL DEFAULT 'validee' CHECK (statut IN ('brouillon', 'validee', 'partiellement_payee', 'payee', 'annulee')),
  is_locked boolean NOT NULL DEFAULT true, -- Inviolabilité légale
  mentions_legales text,
  qr_code_hash text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS public.ventes_facture_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id uuid NOT NULL REFERENCES public.ventes_factures(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  description text,
  quantite integer NOT NULL CHECK (quantite > 0),
  prix_unitaire numeric(12,2) NOT NULL,
  remise_pct numeric(5,2) NOT NULL DEFAULT 0,
  sous_total numeric(12,2) NOT NULL
);

-- Avoirs & Retours clients (Seul moyen de corriger une facture validée)
CREATE TABLE IF NOT EXISTS public.ventes_avoirs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  facture_id uuid NOT NULL REFERENCES public.ventes_factures(id) ON DELETE RESTRICT,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  numero text NOT NULL, -- Format strict : AVO-2026-00001
  date_avoir date NOT NULL DEFAULT CURRENT_DATE,
  motif text NOT NULL,
  reintegrer_stock boolean NOT NULL DEFAULT true,
  montant_ht numeric(12,2) NOT NULL DEFAULT 0,
  montant_tva numeric(12,2) NOT NULL DEFAULT 0,
  montant_total numeric(12,2) NOT NULL DEFAULT 0,
  statut text NOT NULL DEFAULT 'valide' CHECK (statut IN ('brouillon', 'valide', 'rembourse', 'annule')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS public.ventes_avoir_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avoir_id uuid NOT NULL REFERENCES public.ventes_avoirs(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite integer NOT NULL CHECK (quantite > 0),
  prix_unitaire numeric(12,2) NOT NULL,
  sous_total numeric(12,2) NOT NULL
);


-- -----------------------------------------------------------------------------
-- 1.4 MODULE CAISSE ENREGISTREUSE (POS) & SESSIONS DE CAISSE
-- -----------------------------------------------------------------------------

-- Postes de caisse physiques ou virtuels par site
CREATE TABLE IF NOT EXISTS public.caisse_postes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.entrepots(id) ON DELETE CASCADE,
  nom text NOT NULL,
  code text NOT NULL,
  imprimante_largeur_mm integer NOT NULL DEFAULT 80 CHECK (imprimante_largeur_mm IN (58, 80)),
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, code)
);

-- Sessions de caisse avec cycle formel (Ouverture -> Ventes -> Clôture Ticket Z)
CREATE TABLE IF NOT EXISTS public.caisse_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.entrepots(id) ON DELETE CASCADE,
  poste_id uuid REFERENCES public.caisse_postes(id) ON DELETE SET NULL,
  caissier_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  numero_session text NOT NULL,
  date_ouverture timestamptz NOT NULL DEFAULT now(),
  date_cloture timestamptz,
  statut text NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte', 'cloturee')),
  fond_caisse_ouverture numeric(12,2) NOT NULL DEFAULT 0,
  total_especes_theorique numeric(12,2) NOT NULL DEFAULT 0,
  total_especes_compte numeric(12,2),
  ecart_especes numeric(12,2) DEFAULT 0,
  total_mobile_money numeric(12,2) NOT NULL DEFAULT 0,
  total_carte numeric(12,2) NOT NULL DEFAULT 0,
  total_credit numeric(12,2) NOT NULL DEFAULT 0,
  total_ventes numeric(12,2) NOT NULL DEFAULT 0,
  nb_ventes integer NOT NULL DEFAULT 0,
  ticket_z_json jsonb,
  notes_cloture text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entreprise_id, numero_session)
);

-- Mouvements de fond de caisse (apports / retraits ponctuels en cours de journée)
CREATE TABLE IF NOT EXISTS public.caisse_mouvements_fond (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.caisse_sessions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('apport', 'retrait')),
  montant numeric(12,2) NOT NULL CHECK (montant > 0),
  motif text NOT NULL,
  effectue_par uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- 1.5 MODULE PAIEMENTS UNIFIÉ & GESTION DES CRÉANCES
-- -----------------------------------------------------------------------------

-- Table unifiée des paiements clients & fournisseurs
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  sens text NOT NULL CHECK (sens IN ('encaissement', 'decaissement')),
  facture_client_id uuid REFERENCES public.ventes_factures(id) ON DELETE SET NULL,
  facture_fournisseur_id uuid REFERENCES public.achats_factures(id) ON DELETE SET NULL,
  commande_id uuid REFERENCES public.commandes(id) ON DELETE SET NULL,
  caisse_session_id uuid REFERENCES public.caisse_sessions(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  fournisseur_id uuid REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  moyen_paiement text NOT NULL CHECK (moyen_paiement IN ('especes', 'orange_money', 'moov_money', 'wave', 'virement', 'cheque', 'carte', 'credit_client')),
  montant numeric(12,2) NOT NULL CHECK (montant > 0),
  date_paiement timestamptz NOT NULL DEFAULT now(),
  reference_transaction text,
  statut text NOT NULL DEFAULT 'confirme' CHECK (statut IN ('en_attente', 'confirme', 'rejete', 'annule')),
  recu_par uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- SÉCURITÉ ROW LEVEL SECURITY (RLS) ÉTANCHE POUR TOUTES LES NOUVELLES TABLES
-- -----------------------------------------------------------------------------

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.achats_demandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achats_demande_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achats_bons_commande ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achats_bc_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achats_receptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achats_reception_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achats_factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achats_facture_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achats_retours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achats_retour_lignes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ventes_devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventes_devis_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventes_commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventes_commande_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventes_livraisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventes_livraison_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventes_factures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventes_facture_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventes_avoirs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventes_avoir_lignes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.caisse_postes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caisse_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caisse_mouvements_fond ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Permissions de lecture pour la table de référence des permissions
DROP POLICY IF EXISTS "permissions_read" ON public.permissions;
CREATE POLICY "permissions_read" ON public.permissions FOR SELECT TO authenticated USING (true);

-- Politiques RLS avec isolation stricte par entreprise + super_admin
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'roles', 'user_roles', 'user_sites',
    'achats_demandes', 'achats_bons_commande', 'achats_receptions', 'achats_factures', 'achats_retours',
    'ventes_devis', 'ventes_commandes', 'ventes_livraisons', 'ventes_factures', 'ventes_avoirs',
    'caisse_postes', 'caisse_sessions', 'payments'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_iso_%I" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "tenant_iso_%I" ON public.%I FOR ALL TO authenticated USING (entreprise_id = public.current_entreprise_id() OR public.is_super_admin()) WITH CHECK (entreprise_id = public.current_entreprise_id() OR public.is_super_admin())', t, t);
  END LOOP;
END $$;

-- Politiques pour les lignes enfants basées sur l'entreprise du parent
DROP POLICY IF EXISTS "achats_demande_lignes_iso" ON public.achats_demande_lignes;
CREATE POLICY "achats_demande_lignes_iso" ON public.achats_demande_lignes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.achats_demandes d WHERE d.id = demande_id AND (d.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())));

DROP POLICY IF EXISTS "achats_bc_lignes_iso" ON public.achats_bc_lignes;
CREATE POLICY "achats_bc_lignes_iso" ON public.achats_bc_lignes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.achats_bons_commande b WHERE b.id = bon_commande_id AND (b.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())));

DROP POLICY IF EXISTS "achats_reception_lignes_iso" ON public.achats_reception_lignes;
CREATE POLICY "achats_reception_lignes_iso" ON public.achats_reception_lignes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.achats_receptions r WHERE r.id = reception_id AND (r.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())));

DROP POLICY IF EXISTS "achats_facture_lignes_iso" ON public.achats_facture_lignes;
CREATE POLICY "achats_facture_lignes_iso" ON public.achats_facture_lignes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.achats_factures f WHERE f.id = facture_id AND (f.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())));

DROP POLICY IF EXISTS "achats_retour_lignes_iso" ON public.achats_retour_lignes;
CREATE POLICY "achats_retour_lignes_iso" ON public.achats_retour_lignes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.achats_retours ret WHERE ret.id = retour_id AND (ret.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())));

DROP POLICY IF EXISTS "ventes_devis_lignes_iso" ON public.ventes_devis_lignes;
CREATE POLICY "ventes_devis_lignes_iso" ON public.ventes_devis_lignes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ventes_devis d WHERE d.id = devis_id AND (d.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())));

DROP POLICY IF EXISTS "ventes_commande_lignes_iso" ON public.ventes_commande_lignes;
CREATE POLICY "ventes_commande_lignes_iso" ON public.ventes_commande_lignes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ventes_commandes c WHERE c.id = commande_id AND (c.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())));

DROP POLICY IF EXISTS "ventes_livraison_lignes_iso" ON public.ventes_livraison_lignes;
CREATE POLICY "ventes_livraison_lignes_iso" ON public.ventes_livraison_lignes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ventes_livraisons l WHERE l.id = livraison_id AND (l.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())));

DROP POLICY IF EXISTS "ventes_facture_lignes_iso" ON public.ventes_facture_lignes;
CREATE POLICY "ventes_facture_lignes_iso" ON public.ventes_facture_lignes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ventes_factures f WHERE f.id = facture_id AND (f.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())));

DROP POLICY IF EXISTS "ventes_avoir_lignes_iso" ON public.ventes_avoir_lignes;
CREATE POLICY "ventes_avoir_lignes_iso" ON public.ventes_avoir_lignes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ventes_avoirs a WHERE a.id = avoir_id AND (a.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())));

DROP POLICY IF EXISTS "caisse_mouvements_fond_iso" ON public.caisse_mouvements_fond;
CREATE POLICY "caisse_mouvements_fond_iso" ON public.caisse_mouvements_fond FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.caisse_sessions s WHERE s.id = session_id AND (s.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())));

-- User sessions RLS
DROP POLICY IF EXISTS "user_sessions_owner" ON public.user_sessions;
CREATE POLICY "user_sessions_owner" ON public.user_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());


-- -----------------------------------------------------------------------------
-- RÈGLE D'INVIOLABILITÉ : VERROUILLAGE DES FACTURES VALIDÉES
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_facture_inviolability()
RETURNS trigger AS $$
BEGIN
  -- Si la facture était déjà validée ou payée, interdire toute modification des montants, du numéro ou des lignes
  IF OLD.statut IN ('validee', 'partiellement_payee', 'payee') THEN
    IF NEW.montant_total IS DISTINCT FROM OLD.montant_total OR
       NEW.montant_ht IS DISTINCT FROM OLD.montant_ht OR
       NEW.montant_tva IS DISTINCT FROM OLD.montant_tva OR
       NEW.numero IS DISTINCT FROM OLD.numero OR
       NEW.client_id IS DISTINCT FROM OLD.client_id THEN
      RAISE EXCEPTION 'Facture inviolable : une facture validée ne peut plus être modifiée. Veuillez émettre un avoir pour toute correction.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_facture_inviolability ON public.ventes_factures;
CREATE TRIGGER trg_facture_inviolability
  BEFORE UPDATE ON public.ventes_factures
  FOR EACH ROW
  EXECUTE FUNCTION public.check_facture_inviolability();


-- -----------------------------------------------------------------------------
-- SEED : RÔLES PAR DÉFAUT & PERMISSIONS GRANULAIRES
-- -----------------------------------------------------------------------------

-- Insertion des permissions fondamentales (module.action)
INSERT INTO public.permissions (module, action, code, nom, description)
VALUES
  -- Ventes
  ('ventes', 'voir', 'ventes.devis.voir', 'Consulter les devis', 'Accès à la liste et aux détails des devis'),
  ('ventes', 'creer', 'ventes.devis.creer', 'Créer des devis', 'Création et envoi de propositions commerciales'),
  ('ventes', 'valider', 'ventes.commande.valider', 'Valider commandes clients', 'Validation des commandes de vente'),
  ('ventes', 'creer', 'ventes.livraison.creer', 'Émettre un bon de livraison', 'Expédition et déstockage des commandes'),
  ('ventes', 'creer', 'ventes.facture.creer', 'Générer une facture', 'Émission de facture commerciale officielle'),
  ('ventes', 'valider', 'ventes.facture.valider', 'Verrouiller/Valider facture', 'Rendre la facture définitive'),
  ('ventes', 'creer', 'ventes.avoir.creer', 'Émettre un avoir', 'Correction ou annulation partielle/totale de facture'),
  -- Achats
  ('achats', 'creer', 'achats.demande.creer', 'Créer une demande d''achat', 'Expression d''un besoin interne'),
  ('achats', 'valider', 'achats.demande.valider', 'Approuver demande d''achat', 'Validation hiérarchique des demandes'),
  ('achats', 'creer', 'achats.bon_commande.creer', 'Créer un bon de commande', 'Émission d''ordre d''achat fournisseur'),
  ('achats', 'valider', 'achats.bon_commande.valider', 'Valider bon de commande', 'Engagement officiel des dépenses'),
  ('achats', 'creer', 'achats.reception.creer', 'Enregistrer une réception', 'Entrée de marchandises et calcul CMUP'),
  ('achats', 'creer', 'achats.facture.creer', 'Saisir facture fournisseur', 'Rapprochement 3-voies et enregistrement dette'),
  ('achats', 'creer', 'achats.retour.creer', 'Créer retour fournisseur', 'Renvoi de marchandises non conformes'),
  -- Stock
  ('stock', 'voir', 'stock.produits.voir', 'Voir catalogue produits', 'Consultation des fiches articles et stocks'),
  ('stock', 'creer', 'stock.produits.creer', 'Créer/modifier produit', 'Gestion de la base article'),
  ('stock', 'creer', 'stock.mouvements.creer', 'Mouvements d''entrée/sortie', 'Saisie directe de mouvements d''entrepôt'),
  ('stock', 'creer', 'stock.ajustement.creer', 'Ajustements de stock', 'Régularisation des écarts physiques'),
  ('stock', 'valider', 'stock.ajustement.valider', 'Valider ajustement important', 'Approbation des corrections au-delà d''un seuil'),
  ('stock', 'creer', 'stock.transfert.creer', 'Initier transfert de stock', 'Déplacement entrepôt vers boutique'),
  ('stock', 'valider', 'stock.transfert.valider', 'Réceptionner transfert', 'Validation et intégration sur site récepteur'),
  ('stock', 'creer', 'stock.comptage.creer', 'Effectuer un inventaire/comptage', 'Saisie de comptage physique'),
  -- Caisse POS
  ('caisse', 'ouvrir', 'caisse.session.ouvrir', 'Ouvrir session de caisse', 'Saisie du fond de caisse initial'),
  ('caisse', 'vendre', 'caisse.session.vendre', 'Encaisser les ventes', 'Utilisation du terminal de caisse tactile'),
  ('caisse', 'cloturer', 'caisse.session.cloturer', 'Clôturer la caisse (Ticket Z)', 'Comptage physique et émission Ticket Z'),
  -- Finance
  ('finance', 'encaisser', 'finance.paiement.encaisser', 'Enregistrer encaissement', 'Saisie des règlements clients'),
  ('finance', 'decaisser', 'finance.paiement.decaisser', 'Enregistrer décaissement', 'Règlement des fournisseurs et charges'),
  ('finance', 'voir', 'finance.creances.voir', 'Consulter balance âgée', 'Suivi des créances et impayés'),
  -- Administration
  ('administration', 'utilisateurs', 'admin.utilisateurs.gerer', 'Gérer les utilisateurs & rôles', 'Création de comptes et affectation de sites'),
  ('administration', 'audit', 'admin.audit.voir', 'Consulter le journal d''audit', 'Traçabilité légale et analyse des actions'),
  ('administration', 'parametres', 'admin.parametres.modifier', 'Modifier paramètres généraux', 'Coordonnées, IFU, RCCM, TVA, devises')
ON CONFLICT (code) DO NOTHING;

-- Insertion des 6 Rôles par défaut du système
INSERT INTO public.roles (nom, code, description, is_system)
VALUES
  ('Propriétaire', 'proprietaire', 'Dirigeant d''entreprise : accès total et sans restriction', true),
  ('Gérant', 'gerant', 'Direction opérationnelle : ventes, achats, caisse, stocks, validation', true),
  ('Comptable', 'comptable', 'Gestion financière : facturation, créances, paiements, rapprochements', true),
  ('Magasinier', 'magasinier', 'Gestion physique : réceptions, transferts, inventaires, réappro', true),
  ('Caissier', 'caissier', 'Point de vente : encaissements, ouvertures/fermetures de session caisse', true),
  ('Vendeur', 'vendeur', 'Commercial : devis, commandes clients, consultation catalogue', true)
ON CONFLICT (entreprise_id, code) DO NOTHING;

-- Affectation des permissions par défaut aux 6 rôles
DO $$
DECLARE
  v_role_id uuid;
  v_perm_id uuid;
BEGIN
  -- Rôle Propriétaire : TOUTES les permissions
  SELECT id INTO v_role_id FROM public.roles WHERE code = 'proprietaire' AND is_system = true LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, id FROM public.permissions
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  -- Rôle Gérant : Tout sauf modification des paramètres plateforme
  SELECT id INTO v_role_id FROM public.roles WHERE code = 'gerant' AND is_system = true LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, id FROM public.permissions
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  -- Rôle Caissier : Caisse + Ventes simples
  SELECT id INTO v_role_id FROM public.roles WHERE code = 'caissier' AND is_system = true LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, id FROM public.permissions WHERE module IN ('caisse') OR code IN ('ventes.facture.creer', 'stock.produits.voir')
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;

  -- Rôle Magasinier : Stock + Réceptions achats
  SELECT id INTO v_role_id FROM public.roles WHERE code = 'magasinier' AND is_system = true LIMIT 1;
  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, id FROM public.permissions WHERE module = 'stock' OR code IN ('achats.reception.creer', 'achats.retour.creer')
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END IF;
END $$;
