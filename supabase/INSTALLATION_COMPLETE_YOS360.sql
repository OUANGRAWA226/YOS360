/*
================================================================================
  YOS360 — SCRIPT D'INSTALLATION COMPLÈTE DU SCHÉMA SUPABASE
================================================================================
Ce script initialise l'ensemble de la base de données YOS360 en une seule fois :
  - Tables & Relations (Multi-tenant)
  - Fonctions & Procédures stockées (CMUP, Audit, Auth, Caisse POS atomique)
  - Sécurité Row-Level Security (RLS) étanche
  - Déclencheurs & Triggers automatiques
  - Données initiales (Entreprises d'exemple & Sites)
================================================================================
*/

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. TABLES FONDATION
-- =============================================================================

-- Table des entreprises (multi-tenant)
CREATE TABLE IF NOT EXISTS public.entreprises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  slogan text,
  adresse text,
  ville text,
  telephone text,
  email text,
  logo_url text,
  tva_taux numeric NOT NULL DEFAULT 18,
  tva_active boolean NOT NULL DEFAULT true,
  devise text NOT NULL DEFAULT 'XOF',
  mention_bas text,
  modules text[] NOT NULL DEFAULT '{dashboard,produits,categories,mouvements,entrepots,transferts,inventaires,lots,scan,reappro,fournisseurs,clients,commandes,paiements,caisse,rapports,audit,parametres}',
  pack text NOT NULL DEFAULT 'pro',
  max_utilisateurs integer NOT NULL DEFAULT 10,
  max_produits integer NOT NULL DEFAULT 5000,
  suspendue boolean NOT NULL DEFAULT false,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table des profils utilisateurs
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  nom_complet text,
  role text NOT NULL DEFAULT 'vendeur' CHECK (role IN ('admin', 'gestionnaire', 'magasinier', 'vendeur')),
  entreprise_id uuid REFERENCES public.entreprises(id),
  super_admin boolean NOT NULL DEFAULT false,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. FONCTIONS DE SÉCURITÉ DE BASE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND super_admin = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin' OR super_admin = true)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_entreprise_id()
RETURNS uuid AS $$
  SELECT entreprise_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_entreprise_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.entreprise_id IS NULL THEN
    NEW.entreprise_id := public.current_entreprise_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Seul un administrateur peut modifier le rôle d''un profil utilisateur.';
    END IF;
    IF NEW.super_admin IS DISTINCT FROM OLD.super_admin THEN
      RAISE EXCEPTION 'Seul un administrateur peut modifier le privilège super_admin.';
    END IF;
    IF NEW.entreprise_id IS DISTINCT FROM OLD.entreprise_id AND NOT COALESCE(OLD.super_admin, false) THEN
      RAISE EXCEPTION 'Vous ne pouvez pas modifier votre entreprise de rattachement.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- =============================================================================
-- 3. TABLES MÉTIER
-- =============================================================================

-- Catégories
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  nom text NOT NULL,
  description text,
  couleur text DEFAULT '#0ea5e9',
  created_at timestamptz DEFAULT now()
);

-- Produits
CREATE TABLE IF NOT EXISTS public.produits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  nom text NOT NULL,
  sku text,
  description text,
  categorie_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  quantite integer NOT NULL DEFAULT 0,
  seuil_alerte integer NOT NULL DEFAULT 10,
  prix_unitaire numeric(12,2) NOT NULL DEFAULT 0,
  prix_vente numeric(12,2) NOT NULL DEFAULT 0,
  unite text NOT NULL DEFAULT 'pièce',
  emplacement text,
  code_barres text,
  perissable boolean NOT NULL DEFAULT false,
  alerte_peremption_jours integer NOT NULL DEFAULT 30,
  methode_valorisation text NOT NULL DEFAULT 'cmup' CHECK (methode_valorisation IN ('cmup', 'fifo')),
  cmup numeric(12,4) NOT NULL DEFAULT 0,
  quantite_economique integer NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Entrepôts & Boutiques
CREATE TABLE IF NOT EXISTS public.entrepots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  nom text NOT NULL,
  code text,
  adresse text,
  ville text,
  responsable text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Stocks par entrepôt
CREATE TABLE IF NOT EXISTS public.stocks_entrepot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  entrepot_id uuid NOT NULL REFERENCES public.entrepots(id) ON DELETE CASCADE,
  quantite integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (produit_id, entrepot_id)
);

-- Lots et DLUO
CREATE TABLE IF NOT EXISTS public.lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  numero_lot text NOT NULL,
  numero_serie text,
  date_peremption date,
  quantite integer NOT NULL DEFAULT 0,
  prix_unitaire numeric(12,2) NOT NULL DEFAULT 0,
  entrepot_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Mouvements de stock
CREATE TABLE IF NOT EXISTS public.mouvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('entree', 'sortie')),
  quantite integer NOT NULL CHECK (quantite > 0),
  motif text,
  fournisseur text,
  destinataire text,
  reference text,
  entrepot_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  prix_unitaire numeric(12,4) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Fournisseurs
CREATE TABLE IF NOT EXISTS public.fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  nom text NOT NULL,
  contact text,
  telephone text,
  email text,
  adresse text,
  delai_livraison_jours integer DEFAULT 7,
  conditions_paiement text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Clients
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  nom text NOT NULL,
  contact text,
  telephone text,
  email text,
  adresse text,
  categorie text DEFAULT 'particulier',
  encours_max numeric(12,2) DEFAULT 0,
  delai_reglement_jours integer DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Commandes & Documents commerciaux
CREATE TABLE IF NOT EXISTS public.commandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('achat', 'vente')),
  fournisseur_id uuid REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_walkin text,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'confirmee', 'expediee', 'recue', 'annulee')),
  date_commande timestamptz NOT NULL DEFAULT now(),
  date_livraison_prevue timestamptz,
  reference text NOT NULL,
  numero_document text,
  type_document text CHECK (type_document IN ('devis', 'facture', 'bon_livraison', 'avoir')),
  tva_taux numeric,
  montant_ht numeric(12,2) NOT NULL DEFAULT 0,
  montant_tva numeric(12,2) NOT NULL DEFAULT 0,
  montant_total numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  date_echeance timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Lignes de commandes
CREATE TABLE IF NOT EXISTS public.commande_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  commande_id uuid NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite integer NOT NULL,
  quantite_recue integer NOT NULL DEFAULT 0,
  prix_unitaire numeric(12,2) NOT NULL,
  sous_total numeric(12,2) NOT NULL
);

-- Paiements & Règlements
CREATE TABLE IF NOT EXISTS public.paiements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  commande_id uuid REFERENCES public.commandes(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  fournisseur_id uuid REFERENCES public.fournisseurs(id) ON DELETE SET NULL,
  sens text NOT NULL CHECK (sens IN ('encaissement', 'decaissement')),
  montant numeric(12,2) NOT NULL,
  date_paiement timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL CHECK (mode IN ('especes', 'orange_money', 'moov_money', 'wave', 'virement', 'cheque', 'carte')),
  reference text,
  note text,
  created_at timestamptz DEFAULT now()
);

-- Transferts de stock inter-sites
CREATE TABLE IF NOT EXISTS public.transferts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  reference text NOT NULL,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite integer NOT NULL CHECK (quantite > 0),
  entrepot_source_id uuid NOT NULL REFERENCES public.entrepots(id),
  entrepot_dest_id uuid NOT NULL REFERENCES public.entrepots(id),
  statut text NOT NULL DEFAULT 'en_preparation' CHECK (statut IN ('en_preparation', 'envoye', 'recu', 'annule')),
  note text,
  envoye_at timestamptz,
  recu_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  CHECK (entrepot_source_id <> entrepot_dest_id)
);

-- Inventaires
CREATE TABLE IF NOT EXISTS public.inventaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  reference text NOT NULL,
  entrepot_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  statut text NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'valide', 'annule')),
  date_debut timestamptz NOT NULL DEFAULT now(),
  date_cloture timestamptz,
  note text
);

CREATE TABLE IF NOT EXISTS public.inventaire_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  inventaire_id uuid NOT NULL REFERENCES public.inventaires(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  stock_theorique integer NOT NULL DEFAULT 0,
  stock_compte integer,
  created_at timestamptz DEFAULT now()
);

-- Journal d'audit
CREATE TABLE IF NOT EXISTS public.journal_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  champ text,
  ancienne_valeur text,
  nouvelle_valeur text,
  donnees jsonb,
  created_at timestamptz DEFAULT now()
);

-- Intégrations & API Keys
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid REFERENCES public.entreprises(id) ON DELETE CASCADE,
  nom text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text NOT NULL DEFAULT 'read',
  actif boolean NOT NULL DEFAULT true,
  dernier_utilise timestamptz,
  manage_token text NOT NULL DEFAULT encode(gen_random_uuid()::text::bytea, 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid REFERENCES public.entreprises(id) ON DELETE CASCADE,
  nom text NOT NULL,
  url text NOT NULL,
  evenements text[] NOT NULL DEFAULT '{commande.creee}',
  secret text NOT NULL DEFAULT encode(gen_random_uuid()::text::bytea, 'hex'),
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  evenement text NOT NULL,
  payload jsonb NOT NULL,
  statut text NOT NULL DEFAULT 'pending',
  code_http integer,
  reponse text,
  tentatives integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Compteurs de documents
CREATE TABLE IF NOT EXISTS public.document_counters (
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  type_document text NOT NULL,
  annee integer NOT NULL,
  compteur integer NOT NULL DEFAULT 0,
  PRIMARY KEY (entreprise_id, type_document, annee)
);

-- =============================================================================
-- 4. TRIGGERS MÉTIER & AUTOMATISATIONS
-- =============================================================================

-- Mise à jour automatique de la quantité de produit lors d'un mouvement
CREATE OR REPLACE FUNCTION public.adjust_stock_on_movement()
RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'entree' THEN
    UPDATE public.produits SET quantite = quantite + NEW.quantite WHERE id = NEW.produit_id;
  ELSIF NEW.type = 'sortie' THEN
    UPDATE public.produits SET quantite = quantite - NEW.quantite WHERE id = NEW.produit_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_adjust_stock ON public.mouvements;
CREATE TRIGGER trigger_adjust_stock
  AFTER INSERT ON public.mouvements
  FOR EACH ROW EXECUTE FUNCTION public.adjust_stock_on_movement();

-- Mise à jour automatique des stocks par entrepôt
CREATE OR REPLACE FUNCTION public.adjust_stock_entrepot_on_movement()
RETURNS trigger AS $$
BEGIN
  IF NEW.entrepot_id IS NOT NULL THEN
    IF NEW.type = 'entree' THEN
      INSERT INTO public.stocks_entrepot (entreprise_id, produit_id, entrepot_id, quantite)
      VALUES (NEW.entreprise_id, NEW.produit_id, NEW.entrepot_id, NEW.quantite)
      ON CONFLICT (produit_id, entrepot_id)
      DO UPDATE SET quantite = stocks_entrepot.quantite + EXCLUDED.quantite, updated_at = now();
    ELSE
      INSERT INTO public.stocks_entrepot (entreprise_id, produit_id, entrepot_id, quantite)
      VALUES (NEW.entreprise_id, NEW.produit_id, NEW.entrepot_id, -NEW.quantite)
      ON CONFLICT (produit_id, entrepot_id)
      DO UPDATE SET quantite = stocks_entrepot.quantite - EXCLUDED.quantite, updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_adjust_stock_entrepot ON public.mouvements;
CREATE TRIGGER trigger_adjust_stock_entrepot
  AFTER INSERT ON public.mouvements
  FOR EACH ROW EXECUTE FUNCTION public.adjust_stock_entrepot_on_movement();

-- Calcul automatique du CMUP à l'entrée valorisée
CREATE OR REPLACE FUNCTION public.compute_cmup_on_entry()
RETURNS trigger AS $$
DECLARE
  v_stock_avant integer;
  v_cmup_avant numeric(12,4);
BEGIN
  IF NEW.type = 'entree' AND NEW.prix_unitaire > 0 THEN
    SELECT quantite, cmup INTO v_stock_avant, v_cmup_avant FROM public.produits WHERE id = NEW.produit_id;
    IF (v_stock_avant + NEW.quantite) > 0 THEN
      UPDATE public.produits SET cmup = ROUND(
        ((v_stock_avant * COALESCE(v_cmup_avant, 0)) + (NEW.quantite * NEW.prix_unitaire))
        / (v_stock_avant + NEW.quantite), 4)
      WHERE id = NEW.produit_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_compute_cmup ON public.mouvements;
CREATE TRIGGER trigger_compute_cmup
  BEFORE INSERT ON public.mouvements
  FOR EACH ROW EXECUTE FUNCTION public.compute_cmup_on_entry();

-- Fonction du Journal d'Audit
CREATE OR REPLACE FUNCTION public.audit_log()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_changed boolean;
BEGIN
  v_user_id := auth.uid();
  v_user_email := COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'email',
    'system'
  );

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_changed := false;
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key IN ('updated_at', 'created_at') THEN CONTINUE; END IF;
      IF v_old -> v_key IS DISTINCT FROM v_new -> v_key THEN
        v_changed := true;
        INSERT INTO public.journal_audit (user_id, user_email, table_name, record_id, action, champ, ancienne_valeur, nouvelle_valeur)
        VALUES (
          v_user_id, v_user_email, TG_TABLE_NAME, NEW.id, 'UPDATE',
          v_key,
          LEFT(COALESCE(v_old ->> v_key, ''), 5000),
          LEFT(COALESCE(v_new ->> v_key, ''), 5000)
        );
      END IF;
    END LOOP;
    IF NOT v_changed THEN RETURN NULL; END IF;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.journal_audit (user_id, user_email, table_name, record_id, action, donnees)
    VALUES (v_user_id, v_user_email, TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.journal_audit (user_id, user_email, table_name, record_id, action, donnees)
    VALUES (v_user_id, v_user_email, TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS audit_produits ON public.produits;
CREATE TRIGGER audit_produits AFTER INSERT OR UPDATE OR DELETE ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

DROP TRIGGER IF EXISTS audit_commandes ON public.commandes;
CREATE TRIGGER audit_commandes AFTER INSERT OR UPDATE OR DELETE ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

DROP TRIGGER IF EXISTS audit_mouvements ON public.mouvements;
CREATE TRIGGER audit_mouvements AFTER INSERT OR DELETE ON public.mouvements
  FOR EACH ROW EXECUTE FUNCTION public.audit_log();

-- Trigger automatique de création de profil à l'inscription auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_first_ent uuid;
  v_is_first boolean;
BEGIN
  SELECT id INTO v_first_ent FROM public.entreprises ORDER BY created_at ASC LIMIT 1;
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO v_is_first;

  INSERT INTO public.profiles (
    id,
    email,
    nom_complet,
    role,
    super_admin,
    entreprise_id
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data ->> 'nom_complet', ''),
    CASE WHEN v_is_first THEN 'admin' ELSE 'vendeur' END,
    v_is_first,
    v_first_ent
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    nom_complet = COALESCE(EXCLUDED.nom_complet, profiles.nom_complet);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Numérotation atomique
CREATE OR REPLACE FUNCTION public.next_numero_document_atomic(
  p_entreprise_id uuid,
  p_type text
) RETURNS text AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_count int;
  v_prefix text;
BEGIN
  IF p_type = 'facture' THEN v_prefix := 'FAC';
  ELSIF p_type = 'devis' THEN v_prefix := 'DEV';
  ELSIF p_type = 'bon_livraison' THEN v_prefix := 'BL';
  ELSIF p_type = 'avoir' THEN v_prefix := 'AVO';
  ELSE v_prefix := 'DOC';
  END IF;

  INSERT INTO public.document_counters (entreprise_id, type_document, annee, compteur)
  VALUES (p_entreprise_id, p_type, v_year, 1)
  ON CONFLICT (entreprise_id, type_document, annee)
  DO UPDATE SET compteur = document_counters.compteur + 1
  RETURNING compteur INTO v_count;

  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_count::text, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Encaissement atomique POS (Caisse)
CREATE OR REPLACE FUNCTION public.encaisser_vente_pos(
  p_client_id uuid DEFAULT NULL,
  p_client_walkin text DEFAULT 'Client comptoir',
  p_mode_paiement text DEFAULT 'especes',
  p_reference text DEFAULT NULL,
  p_montant_recu numeric DEFAULT 0,
  p_panier jsonb DEFAULT '[]'::jsonb,
  p_tva_taux numeric DEFAULT 18,
  p_tva_active boolean DEFAULT true
) RETURNS jsonb AS $$
DECLARE
  v_ent_id uuid;
  v_numero_doc text;
  v_cmd_id uuid;
  v_total numeric := 0;
  v_ht numeric := 0;
  v_tva numeric := 0;
  v_rendu numeric := 0;
  v_statut text;
  v_item jsonb;
  v_prod_id uuid;
  v_qte int;
  v_prix numeric;
  v_stock_actuel int;
  v_prod_nom text;
BEGIN
  v_ent_id := public.current_entreprise_id();
  IF v_ent_id IS NULL THEN
    RAISE EXCEPTION 'Aucune entreprise active identifiée pour l''utilisateur.';
  END IF;

  IF jsonb_array_length(p_panier) = 0 THEN
    RAISE EXCEPTION 'Le panier est vide.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_panier)
  LOOP
    v_prod_id := (v_item->>'produit_id')::uuid;
    v_qte := (v_item->>'quantite')::int;
    v_prix := (v_item->>'prix_vente')::numeric;

    IF v_qte <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour un article : %', v_qte;
    END IF;

    SELECT quantite, nom INTO v_stock_actuel, v_prod_nom
    FROM public.produits
    WHERE id = v_prod_id AND entreprise_id = v_ent_id
    FOR UPDATE;

    IF v_stock_actuel IS NULL THEN
      RAISE EXCEPTION 'Article introuvable dans cette entreprise.';
    END IF;

    IF v_stock_actuel < v_qte THEN
      RAISE EXCEPTION 'Stock insuffisant pour "%" (Disponible: %, Demandé: %)', v_prod_nom, v_stock_actuel, v_qte;
    END IF;

    v_total := v_total + (v_qte * v_prix);
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Le montant total doit être supérieur à zéro.';
  END IF;

  IF p_tva_active AND p_tva_taux > 0 THEN
    v_ht := ROUND(v_total / (1 + (p_tva_taux / 100)), 2);
    v_tva := v_total - v_ht;
  ELSE
    v_ht := v_total;
    v_tva := 0;
  END IF;

  IF p_mode_paiement = 'especes' THEN
    v_rendu := GREATEST(COALESCE(p_montant_recu, 0) - v_total, 0);
  ELSE
    v_rendu := 0;
  END IF;
  v_statut := 'recue';

  v_numero_doc := public.next_numero_document_atomic(v_ent_id, 'facture');

  INSERT INTO public.commandes (
    entreprise_id, type, client_id, client_walkin, statut,
    reference, numero_document, type_document, tva_taux,
    montant_ht, montant_tva, montant_total, note
  ) VALUES (
    v_ent_id, 'vente', p_client_id,
    CASE WHEN p_client_id IS NULL THEN COALESCE(NULLIF(TRIM(p_client_walkin), ''), 'Client comptoir') ELSE NULL END,
    v_statut, REPLACE(v_numero_doc, 'FAC', 'VEN'), v_numero_doc, 'facture',
    CASE WHEN p_tva_active THEN p_tva_taux ELSE NULL END,
    v_ht, v_tva, v_total,
    CASE WHEN p_mode_paiement <> 'especes' THEN 'Paiement ' || p_mode_paiement || COALESCE(' — réf ' || NULLIF(TRIM(p_reference), ''), '') ELSE NULL END
  ) RETURNING id INTO v_cmd_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_panier)
  LOOP
    v_prod_id := (v_item->>'produit_id')::uuid;
    v_qte := (v_item->>'quantite')::int;
    v_prix := (v_item->>'prix_vente')::numeric;

    INSERT INTO public.commande_items (entreprise_id, commande_id, produit_id, quantite, prix_unitaire, sous_total)
    VALUES (v_ent_id, v_cmd_id, v_prod_id, v_qte, v_prix, v_qte * v_prix);

    INSERT INTO public.mouvements (entreprise_id, produit_id, type, quantite, motif, reference)
    VALUES (v_ent_id, v_prod_id, 'sortie', v_qte, 'Vente comptoir ' || v_numero_doc, v_numero_doc);
  END LOOP;

  INSERT INTO public.paiements (entreprise_id, commande_id, client_id, sens, montant, mode, reference, note)
  VALUES (v_ent_id, v_cmd_id, p_client_id, 'encaissement', v_total, p_mode_paiement, NULLIF(TRIM(p_reference), ''), 'Vente caisse');

  RETURN jsonb_build_object(
    'commande_id', v_cmd_id,
    'numero_document', v_numero_doc,
    'montant_ht', v_ht,
    'montant_tva', v_tva,
    'montant_total', v_total,
    'rendu', v_rendu
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 5. ROW-LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE public.entreprises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mouvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrepots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocks_entrepot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commande_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventaire_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;

-- Entreprises
DROP POLICY IF EXISTS "entreprises_read" ON public.entreprises;
CREATE POLICY "entreprises_read" ON public.entreprises FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "entreprises_admin_write" ON public.entreprises;
CREATE POLICY "entreprises_admin_write" ON public.entreprises FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles_delete" ON public.profiles;
CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
  USING (public.is_admin());

-- Tables cloisonnées par entreprise (Macro RLS)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories', 'produits', 'mouvements', 'entrepots', 'stocks_entrepot',
    'lots', 'fournisseurs', 'clients', 'commandes', 'commande_items',
    'paiements', 'transferts', 'inventaires', 'inventaire_lignes',
    'api_keys', 'webhook_endpoints', 'document_counters'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_all_%I" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "tenant_all_%I" ON public.%I FOR ALL TO authenticated USING (entreprise_id = public.current_entreprise_id() OR public.is_super_admin()) WITH CHECK (entreprise_id = public.current_entreprise_id() OR public.is_super_admin())', t, t);
  END LOOP;
END $$;

-- Journal Audit
DROP POLICY IF EXISTS "audit_read" ON public.journal_audit;
CREATE POLICY "audit_read" ON public.journal_audit FOR SELECT TO authenticated
  USING (public.is_admin());

-- Webhook Deliveries
DROP POLICY IF EXISTS "deliveries_read" ON public.webhook_deliveries;
CREATE POLICY "deliveries_read" ON public.webhook_deliveries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.webhook_endpoints e WHERE e.id = endpoint_id AND (e.entreprise_id = public.current_entreprise_id() OR public.is_admin())));

-- =============================================================================
-- 6. DONNÉES INITIALES (SEED)
-- =============================================================================

INSERT INTO public.entreprises (nom, slogan, adresse, ville, telephone, email, devise, tva_taux, tva_active, modules)
SELECT 
  'Boutique Supérette YOS360',
  'Commerce général & alimentation',
  'Avenue de la Nation',
  'Ouagadougou',
  '+226 25 00 00 00',
  'contact@yos360.com',
  'XOF',
  18,
  true,
  '{dashboard,produits,categories,mouvements,entrepots,transferts,inventaires,lots,scan,reappro,fournisseurs,clients,commandes,paiements,caisse,rapports,audit,parametres}'
WHERE NOT EXISTS (SELECT 1 FROM public.entreprises);

INSERT INTO public.entreprises (nom, slogan, devise, tva_taux, modules)
SELECT 
  'Quincaillerie Moderne',
  'Matériaux & Outillage professionnel',
  'XOF',
  18,
  '{dashboard,produits,categories,mouvements,entrepots,transferts,inventaires,lots,scan,reappro,fournisseurs,clients,commandes,paiements,rapports,audit,parametres}'
WHERE NOT EXISTS (SELECT 1 FROM public.entreprises WHERE nom = 'Quincaillerie Moderne');

INSERT INTO public.entreprises (nom, slogan, devise, tva_taux, modules)
SELECT 
  'Maquis & Bar Le 360',
  'Restauration & Boissons fraîches',
  'XOF',
  0,
  '{dashboard,produits,categories,mouvements,inventaires,lots,scan,fournisseurs,clients,commandes,caisse,paiements,rapports,audit,parametres}'
WHERE NOT EXISTS (SELECT 1 FROM public.entreprises WHERE nom = 'Maquis & Bar Le 360');

-- Dépôt initial
INSERT INTO public.entrepots (entreprise_id, nom, code)
SELECT id, 'Boutique Principale', 'BOUTIQUE-01'
FROM public.entreprises
WHERE NOT EXISTS (SELECT 1 FROM public.entrepots WHERE entrepots.entreprise_id = entreprises.id);

-- Catégories par défaut
INSERT INTO public.categories (entreprise_id, nom, couleur)
SELECT id, 'Général', '#0ea5e9'
FROM public.entreprises
WHERE NOT EXISTS (SELECT 1 FROM public.categories WHERE categories.entreprise_id = entreprises.id);

-- =============================================================================
-- PHASE 2 EXTENSIONS : FEFO, VARIANTES, COMPOSANTS, AJUSTEMENTS, TARIFS, WORKFLOW
-- =============================================================================

ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'actif' 
  CHECK (statut IN ('actif', 'quarantaine', 'rejete', 'epuise'));
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS fabricant text;
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS date_fabrication date;
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS methode_valorisation text NOT NULL DEFAULT 'cmup'
  CHECK (methode_valorisation IN ('cmup', 'fifo'));
ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS seuil_validation_ajustement numeric(12,2) NOT NULL DEFAULT 50000;

ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS type_produit text NOT NULL DEFAULT 'simple'
  CHECK (type_produit IN ('simple', 'compose', 'service', 'variante_parent'));

CREATE TABLE IF NOT EXISTS public.produit_unites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  nom_unite text NOT NULL,
  code_court text,
  coefficient numeric(10,4) NOT NULL CHECK (coefficient > 0),
  est_unite_base boolean NOT NULL DEFAULT false,
  code_barres text,
  prix_vente_suggere numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produit_id, nom_unite)
);

CREATE TABLE IF NOT EXISTS public.produit_variantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  sku text NOT NULL,
  nom_variante text NOT NULL,
  attributs jsonb NOT NULL DEFAULT '{}'::jsonb,
  code_barres text,
  prix_vente numeric(12,2) NOT NULL DEFAULT 0,
  prix_achat numeric(12,2) NOT NULL DEFAULT 0,
  quantite integer NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entreprise_id, sku)
);

CREATE TABLE IF NOT EXISTS public.produit_composants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  produit_parent_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  composant_produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite_composant numeric(10,3) NOT NULL CHECK (quantite_composant > 0),
  perte_pourcentage numeric(5,2) NOT NULL DEFAULT 0,
  instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produit_parent_id, composant_produit_id)
);

CREATE TABLE IF NOT EXISTS public.stock_ajustements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  numero_document text NOT NULL,
  motif text NOT NULL CHECK (motif IN ('casse', 'vol', 'echantillon', 'peremption', 'ecart_inventaire', 'revalorisation', 'autre')),
  description text,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'en_attente', 'approuve', 'rejete')),
  valeur_totale numeric(12,2) NOT NULL DEFAULT 0,
  exige_approbation boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approuve_par uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approuve_at timestamptz,
  motif_rejet text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (entreprise_id, numero_document)
);

CREATE TABLE IF NOT EXISTS public.stock_ajustement_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ajustement_id uuid NOT NULL REFERENCES public.stock_ajustements(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  type_ajustement text NOT NULL CHECK (type_ajustement IN ('positif', 'negatif')),
  quantite integer NOT NULL CHECK (quantite > 0),
  cout_unitaire numeric(12,2) NOT NULL DEFAULT 0,
  valeur_ligne numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.grilles_tarifaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  nom text NOT NULL,
  categorie_client text NOT NULL CHECK (categorie_client IN ('detail', 'demi_gros', 'grossiste', 'vip', 'partenaire')),
  remise_globale_pourcentage numeric(5,2) NOT NULL DEFAULT 0,
  description text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (entreprise_id, nom)
);

CREATE TABLE IF NOT EXISTS public.grille_tarifaire_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grille_id uuid NOT NULL REFERENCES public.grilles_tarifaires(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  prix_specifique numeric(12,2),
  remise_pourcentage numeric(5,2),
  quantite_min integer NOT NULL DEFAULT 1 CHECK (quantite_min >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grille_id, produit_id, quantite_min)
);

CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  code text,
  nom text NOT NULL,
  type_remise text NOT NULL CHECK (type_remise IN ('pourcentage', 'montant_fixe')),
  valeur_remise numeric(12,2) NOT NULL CHECK (valeur_remise > 0),
  montant_minimum_achat numeric(12,2) NOT NULL DEFAULT 0,
  date_debut timestamptz NOT NULL,
  date_fin timestamptz NOT NULL,
  nb_utilisations_max integer,
  nb_utilisations_actuel integer NOT NULL DEFAULT 0,
  site_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (entreprise_id, code)
);

CREATE TABLE IF NOT EXISTS public.validations_workflow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  type_demande text NOT NULL CHECK (type_demande IN ('ajustement_stock', 'bon_commande', 'remise_exceptionnelle', 'transfert_stock')),
  reference_id uuid NOT NULL,
  reference_numero text NOT NULL,
  demandeur_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'approuve', 'rejete')),
  valeur_estimee numeric(12,2) NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  valide_par uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  valide_at timestamptz,
  motif_rejet text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  canal text NOT NULL CHECK (canal IN ('in_app', 'email', 'sms', 'whatsapp')),
  destinataire text NOT NULL,
  titre text NOT NULL,
  message text NOT NULL,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'envoye', 'echec')),
  tentatives integer NOT NULL DEFAULT 0,
  erreur_dernier_envoi text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  envoye_at timestamptz
);

ALTER TABLE public.produit_unites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produit_variantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produit_composants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ajustements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ajustement_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grilles_tarifaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grille_tarifaire_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validations_workflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications_queue ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- SECTION PHASE 3 : FINANCE SYSCOHADA, ÉQUIPE & COMMISSIONS, FIDÉLITÉ CLIENT
-- ==============================================================================

ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS points_fidelite INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS palier_fidelite TEXT NOT NULL DEFAULT 'bronze' CHECK (palier_fidelite IN ('bronze', 'argent', 'or', 'platine')),
ADD COLUMN IF NOT EXISTS total_depense_cumule NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS date_dernier_achat TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.fidelite_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    commande_id UUID REFERENCES public.commandes(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('gain', 'utilisation', 'ajustement', 'bonus', 'expiration')),
    points INT NOT NULL,
    solde_apres INT NOT NULL,
    valeur_fcfa_equivalente NUMERIC DEFAULT 0,
    motif TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compta_exercices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    annee INT NOT NULL,
    libelle TEXT NOT NULL,
    date_debut DATE NOT NULL,
    date_fin DATE NOT NULL,
    statut TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'cloture')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, annee)
);

CREATE TABLE IF NOT EXISTS public.compta_comptes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    numero TEXT NOT NULL,
    libelle TEXT NOT NULL,
    classe INT NOT NULL CHECK (classe BETWEEN 1 AND 8),
    type TEXT NOT NULL DEFAULT 'ordinaire' CHECK (type IN ('actif', 'passif', 'charge', 'produit', 'tresorerie', 'tiers', 'ordinaire')),
    lettrable BOOLEAN DEFAULT false,
    actif BOOLEAN DEFAULT true,
    parent_numero TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, numero)
);

CREATE TABLE IF NOT EXISTS public.compta_journaux (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    libelle TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ventes', 'achats', 'banque', 'caisse', 'mobile_money', 'operations_diverses')),
    compte_contrepartie_defaut TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, code)
);

CREATE TABLE IF NOT EXISTS public.compta_pieces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.entrepots(id) ON DELETE SET NULL,
    journal_id UUID NOT NULL REFERENCES public.compta_journaux(id) ON DELETE CASCADE,
    exercice_id UUID REFERENCES public.compta_exercices(id) ON DELETE SET NULL,
    numero_piece TEXT NOT NULL,
    date_piece DATE NOT NULL DEFAULT CURRENT_DATE,
    libelle TEXT NOT NULL,
    reference_document TEXT,
    origine_type TEXT,
    origine_id UUID,
    statut TEXT NOT NULL DEFAULT 'valide' CHECK (statut IN ('brouillon', 'valide', 'annule')),
    total_debit NUMERIC NOT NULL DEFAULT 0,
    total_credit NUMERIC NOT NULL DEFAULT 0,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compta_ecritures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    piece_id UUID NOT NULL REFERENCES public.compta_pieces(id) ON DELETE CASCADE,
    compte_numero TEXT NOT NULL,
    compte_libelle TEXT NOT NULL,
    site_id UUID REFERENCES public.entrepots(id) ON DELETE SET NULL,
    debit NUMERIC NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit NUMERIC NOT NULL DEFAULT 0 CHECK (credit >= 0),
    libelle_ligne TEXT,
    lettrage TEXT,
    tiers_id UUID,
    tiers_nom TEXT,
    date_ecriture DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tresorerie_comptes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.entrepots(id) ON DELETE SET NULL,
    nom TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('banque', 'caisse_physique', 'orange_money', 'moov_money', 'wave', 'autre')),
    numero_compte TEXT,
    etablissement TEXT,
    devise TEXT NOT NULL DEFAULT 'XOF',
    solde_initial NUMERIC NOT NULL DEFAULT 0,
    solde_actuel NUMERIC NOT NULL DEFAULT 0,
    compte_comptable_numero TEXT DEFAULT '521000',
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tresorerie_mouvements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.entrepots(id) ON DELETE SET NULL,
    compte_id UUID NOT NULL REFERENCES public.tresorerie_comptes(id) ON DELETE CASCADE,
    date_mouvement DATE NOT NULL DEFAULT CURRENT_DATE,
    type TEXT NOT NULL CHECK (type IN ('encaissement', 'decaissement', 'virement_interne')),
    montant NUMERIC NOT NULL CHECK (montant > 0),
    solde_avant NUMERIC DEFAULT 0,
    solde_apres NUMERIC DEFAULT 0,
    motif TEXT NOT NULL,
    tiers_nom TEXT,
    reference_operation TEXT,
    statut_rapprochement TEXT NOT NULL DEFAULT 'non_rapproche' CHECK (statut_rapprochement IN ('non_rapproche', 'rapproche', 'en_suspens')),
    date_rapprochement DATE,
    piece_jointe_url TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.depenses_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    code_comptable TEXT NOT NULL DEFAULT '605000',
    budget_mensuel_max NUMERIC DEFAULT 0,
    couleur TEXT DEFAULT '#3b82f6',
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.depenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.entrepots(id) ON DELETE SET NULL,
    categorie_id UUID NOT NULL REFERENCES public.depenses_categories(id) ON DELETE RESTRICT,
    compte_tresorerie_id UUID REFERENCES public.tresorerie_comptes(id) ON DELETE SET NULL,
    numero_depense TEXT NOT NULL,
    date_depense DATE NOT NULL DEFAULT CURRENT_DATE,
    montant NUMERIC NOT NULL CHECK (montant > 0),
    beneficiaire TEXT NOT NULL,
    motif TEXT NOT NULL,
    mode_reglement TEXT NOT NULL DEFAULT 'especes' CHECK (mode_reglement IN ('especes', 'orange_money', 'moov_money', 'wave', 'virement', 'cheque', 'autre')),
    numero_facture_fournisseur TEXT,
    justificatif_url TEXT,
    statut TEXT NOT NULL DEFAULT 'payee' CHECK (statut IN ('en_attente', 'validee', 'payee', 'rejetee')),
    piece_comptable_id UUID REFERENCES public.compta_pieces(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.equipe_collaborateurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.entrepots(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    matricule TEXT NOT NULL,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    poste TEXT NOT NULL,
    telephone TEXT,
    email TEXT,
    date_embauche DATE DEFAULT CURRENT_DATE,
    salaire_base NUMERIC DEFAULT 0,
    taux_commission_pct NUMERIC NOT NULL DEFAULT 2.0,
    base_calcul_commission TEXT NOT NULL DEFAULT 'ca_encaisse' CHECK (base_calcul_commission IN ('ca_encaisse', 'ca_facture', 'marge_brute')),
    statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'conge', 'suspendu', 'sorti')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, matricule)
);

CREATE TABLE IF NOT EXISTS public.equipe_objectifs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    collaborateur_id UUID NOT NULL REFERENCES public.equipe_collaborateurs(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.entrepots(id) ON DELETE SET NULL,
    periode TEXT NOT NULL,
    objectif_ca NUMERIC NOT NULL DEFAULT 0,
    objectif_marge NUMERIC NOT NULL DEFAULT 0,
    realise_ca NUMERIC NOT NULL DEFAULT 0,
    realise_marge NUMERIC NOT NULL DEFAULT 0,
    prime_objectif NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, collaborateur_id, periode)
);

CREATE TABLE IF NOT EXISTS public.equipe_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    collaborateur_id UUID NOT NULL REFERENCES public.equipe_collaborateurs(id) ON DELETE CASCADE,
    periode TEXT NOT NULL,
    total_ventes_base NUMERIC NOT NULL DEFAULT 0,
    taux_applique NUMERIC NOT NULL DEFAULT 0,
    montant_commission NUMERIC NOT NULL DEFAULT 0,
    prime_bonus NUMERIC NOT NULL DEFAULT 0,
    retenues NUMERIC NOT NULL DEFAULT 0,
    net_a_payer NUMERIC NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'calcule' CHECK (statut IN ('calcule', 'valide', 'paye')),
    date_reglement DATE,
    mode_reglement TEXT,
    valide_par UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, collaborateur_id, periode)
);

ALTER TABLE public.fidelite_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compta_exercices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compta_comptes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compta_journaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compta_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compta_ecritures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tresorerie_comptes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tresorerie_mouvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depenses_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_collaborateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_objectifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_commissions ENABLE ROW LEVEL SECURITY;

-- Mise à jour automatique des modules pour les entreprises
UPDATE public.entreprises
SET modules = ARRAY(
    SELECT DISTINCT unnest(modules || ARRAY['comptabilite', 'tresorerie', 'equipe', 'lots', 'tarifs', 'validations'])
)
WHERE modules IS NOT NULL;

-- ==============================================================================
-- SECTION PHASE 4 : ÉTATS FINANCIERS SYSCOHADA, FACTURE NORMALISÉE UEMOA & CLÔTURE
-- ==============================================================================

ALTER TABLE public.commandes 
ADD COLUMN IF NOT EXISTS hash_facture TEXT,
ADD COLUMN IF NOT EXISTS hash_precedent TEXT,
ADD COLUMN IF NOT EXISTS signature_dgi TEXT,
ADD COLUMN IF NOT EXISTS qr_code_fiscal_data TEXT;

CREATE TABLE IF NOT EXISTS public.compta_clotures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
    exercice_id UUID NOT NULL REFERENCES public.compta_exercices(id) ON DELETE CASCADE,
    annee INT NOT NULL,
    date_cloture TIMESTAMPTZ NOT NULL DEFAULT now(),
    cloture_par UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    total_debit NUMERIC NOT NULL,
    total_credit NUMERIC NOT NULL,
    total_produits NUMERIC NOT NULL DEFAULT 0,
    total_charges NUMERIC NOT NULL DEFAULT 0,
    resultat_net NUMERIC NOT NULL DEFAULT 0,
    sens_resultat TEXT NOT NULL CHECK (sens_resultat IN ('benefice', 'perte', 'equilibre')),
    piece_cloture_id UUID REFERENCES public.compta_pieces(id) ON DELETE SET NULL,
    piece_a_nouveaux_id UUID REFERENCES public.compta_pieces(id) ON DELETE SET NULL,
    exercice_suivant_id UUID REFERENCES public.compta_exercices(id) ON DELETE SET NULL,
    paf_hash_archive TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, exercice_id)
);

ALTER TABLE public.compta_clotures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compta_clotures_tenant_isolation ON public.compta_clotures;
CREATE POLICY compta_clotures_tenant_isolation ON public.compta_clotures
    FOR ALL
    USING (
        public.is_super_admin()
        OR entreprise_id IN (
            SELECT p.entreprise_id FROM public.profiles p WHERE p.id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_super_admin()
        OR entreprise_id IN (
            SELECT p.entreprise_id FROM public.profiles p WHERE p.id = auth.uid()
        )
    );

-- Procédure de clôture d'exercice comptable (PAF)
CREATE OR REPLACE FUNCTION public.rpc_cloturer_exercice_comptable(
    p_entreprise_id UUID,
    p_exercice_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_exo RECORD;
    v_next_exo_id UUID;
    v_next_annee INT;
    v_journal_od_id UUID;
    v_piece_cloture_id UUID;
    v_piece_anouveaux_id UUID;
    v_tot_debit NUMERIC := 0;
    v_tot_credit NUMERIC := 0;
    v_tot_produits NUMERIC := 0;
    v_tot_charges NUMERIC := 0;
    v_resultat_net NUMERIC := 0;
    v_sens TEXT;
    v_cloture_id UUID;
    v_paf_hash TEXT;
    r RECORD;
BEGIN
    SELECT * INTO v_exo
    FROM public.compta_exercices
    WHERE id = p_exercice_id AND entreprise_id = p_entreprise_id;

    IF v_exo IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Exercice comptable introuvable');
    END IF;

    IF v_exo.statut = 'cloture' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cet exercice est déjà clôturé');
    END IF;

    SELECT id INTO v_journal_od_id
    FROM public.compta_journaux
    WHERE entreprise_id = p_entreprise_id AND code = 'OD'
    LIMIT 1;

    IF v_journal_od_id IS NULL THEN
        RAISE EXCEPTION 'Journal des Opérations Diverses (OD) manquant';
    END IF;

    SELECT
        COALESCE(SUM(e.debit), 0),
        COALESCE(SUM(e.credit), 0)
    INTO v_tot_debit, v_tot_credit
    FROM public.compta_ecritures e
    JOIN public.compta_pieces p ON p.id = e.piece_id
    WHERE e.entreprise_id = p_entreprise_id
      AND p.exercice_id = p_exercice_id
      AND p.statut = 'valide';

    IF v_tot_debit <> v_tot_credit THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Balance déséquilibrée ! Débit = %s, Crédit = %s. Écart : %s FCFA', v_tot_debit, v_tot_credit, (v_tot_debit - v_tot_credit))
        );
    END IF;

    SELECT COALESCE(SUM(e.debit - e.credit), 0) INTO v_tot_charges
    FROM public.compta_ecritures e
    JOIN public.compta_pieces p ON p.id = e.piece_id
    WHERE e.entreprise_id = p_entreprise_id
      AND p.exercice_id = p_exercice_id
      AND e.compte_numero LIKE '6%'
      AND p.statut = 'valide';

    SELECT COALESCE(SUM(e.credit - e.debit), 0) INTO v_tot_produits
    FROM public.compta_ecritures e
    JOIN public.compta_pieces p ON p.id = e.piece_id
    WHERE e.entreprise_id = p_entreprise_id
      AND p.exercice_id = p_exercice_id
      AND e.compte_numero LIKE '7%'
      AND p.statut = 'valide';

    v_resultat_net := v_tot_produits - v_tot_charges;

    IF v_resultat_net > 0 THEN
        v_sens := 'benefice';
    ELSIF v_resultat_net < 0 THEN
        v_sens := 'perte';
    ELSE
        v_sens := 'equilibre';
    END IF;

    INSERT INTO public.compta_pieces (
        entreprise_id, journal_id, exercice_id,
        numero_piece, date_piece, libelle, reference_document,
        origine_type, total_debit, total_credit, statut, created_by
    ) VALUES (
        p_entreprise_id, v_journal_od_id, p_exercice_id,
        'PC-CLOT-' || v_exo.annee, v_exo.date_fin,
        'Clôture des comptes de gestion — Exercice ' || v_exo.annee,
        'CLOTURE-' || v_exo.annee, 'cloture_exercice',
        GREATEST(v_tot_charges, v_tot_produits), GREATEST(v_tot_charges, v_tot_produits),
        'valide', p_user_id
    ) RETURNING id INTO v_piece_cloture_id;

    IF v_sens = 'benefice' THEN
        INSERT INTO public.compta_ecritures (
            entreprise_id, piece_id, compte_numero, compte_libelle,
            debit, credit, libelle_ligne, date_ecriture
        ) VALUES (
            p_entreprise_id, v_piece_cloture_id, '131000', 'Résultat net de l''exercice (Bénéfice)',
            0, v_resultat_net, 'Affectation Résultat Bénéficiaire ' || v_exo.annee, v_exo.date_fin
        );
    ELSIF v_sens = 'perte' THEN
        INSERT INTO public.compta_ecritures (
            entreprise_id, piece_id, compte_numero, compte_libelle,
            debit, credit, libelle_ligne, date_ecriture
        ) VALUES (
            p_entreprise_id, v_piece_cloture_id, '139000', 'Résultat net de l''exercice (Perte)',
            ABS(v_resultat_net), 0, 'Affectation Résultat Déficitaire ' || v_exo.annee, v_exo.date_fin
        );
    END IF;

    v_next_annee := v_exo.annee + 1;
    SELECT id INTO v_next_exo_id
    FROM public.compta_exercices
    WHERE entreprise_id = p_entreprise_id AND annee = v_next_annee;

    IF v_next_exo_id IS NULL THEN
        INSERT INTO public.compta_exercices (
            entreprise_id, annee, libelle, date_debut, date_fin, statut
        ) VALUES (
            p_entreprise_id, v_next_annee, 'Exercice ' || v_next_annee,
            (v_next_annee || '-01-01')::DATE, (v_next_annee || '-12-31')::DATE, 'ouvert'
        ) RETURNING id INTO v_next_exo_id;
    END IF;

    INSERT INTO public.compta_pieces (
        entreprise_id, journal_id, exercice_id,
        numero_piece, date_piece, libelle, reference_document,
        origine_type, total_debit, total_credit, statut, created_by
    ) VALUES (
        p_entreprise_id, v_journal_od_id, v_next_exo_id,
        'PC-AN-' || v_next_annee, (v_next_annee || '-01-01')::DATE,
        'À-Nouveaux (Bilan d''Ouverture) — Exercice ' || v_next_annee,
        'ANOUVEAUX-' || v_next_annee, 'a_nouveaux',
        0, 0, 'valide', p_user_id
    ) RETURNING id INTO v_piece_anouveaux_id;

    FOR r IN
        SELECT
            e.compte_numero,
            MAX(e.compte_libelle) AS compte_libelle,
            SUM(e.debit) - SUM(e.credit) AS solde
        FROM public.compta_ecritures e
        JOIN public.compta_pieces p ON p.id = e.piece_id
        WHERE e.entreprise_id = p_entreprise_id
          AND p.exercice_id = p_exercice_id
          AND substring(e.compte_numero from 1 for 1) IN ('1', '2', '3', '4', '5')
          AND p.statut = 'valide'
        GROUP BY e.compte_numero
        HAVING (SUM(e.debit) - SUM(e.credit)) <> 0
    LOOP
        IF r.solde > 0 THEN
            INSERT INTO public.compta_ecritures (
                entreprise_id, piece_id, compte_numero, compte_libelle,
                debit, credit, libelle_ligne, date_ecriture
            ) VALUES (
                p_entreprise_id, v_piece_anouveaux_id, r.compte_numero, r.compte_libelle,
                r.solde, 0, 'À-Nouveaux ' || r.compte_numero, (v_next_annee || '-01-01')::DATE
            );
        ELSE
            INSERT INTO public.compta_ecritures (
                entreprise_id, piece_id, compte_numero, compte_libelle,
                debit, credit, libelle_ligne, date_ecriture
            ) VALUES (
                p_entreprise_id, v_piece_anouveaux_id, r.compte_numero, r.compte_libelle,
                0, ABS(r.solde), 'À-Nouveaux ' || r.compte_numero, (v_next_annee || '-01-01')::DATE
            );
        END IF;
    END LOOP;

    UPDATE public.compta_pieces
    SET total_debit = (SELECT COALESCE(SUM(debit), 0) FROM public.compta_ecritures WHERE piece_id = v_piece_anouveaux_id),
        total_credit = (SELECT COALESCE(SUM(credit), 0) FROM public.compta_ecritures WHERE piece_id = v_piece_anouveaux_id)
    WHERE id = v_piece_anouveaux_id;

    UPDATE public.compta_exercices
    SET statut = 'cloture'
    WHERE id = p_exercice_id;

    v_paf_hash := encode(digest(
        p_entreprise_id::TEXT || '|' || p_exercice_id::TEXT || '|' ||
        v_exo.annee::TEXT || '|' || v_tot_debit::TEXT || '|' ||
        v_resultat_net::TEXT || '|' || now()::TEXT,
        'sha256'
    ), 'hex');

    INSERT INTO public.compta_clotures (
        entreprise_id, exercice_id, annee, date_cloture, cloture_par,
        total_debit, total_credit, total_produits, total_charges,
        resultat_net, sens_resultat, piece_cloture_id, piece_a_nouveaux_id,
        exercice_suivant_id, paf_hash_archive, notes
    ) VALUES (
        p_entreprise_id, p_exercice_id, v_exo.annee, now(), p_user_id,
        v_tot_debit, v_tot_credit, v_tot_produits, v_tot_charges,
        v_resultat_net, v_sens, v_piece_cloture_id, v_piece_anouveaux_id,
        v_next_exo_id, v_paf_hash,
        format('Clôture officielle arrêtée au résultat net de %s FCFA (%s)', v_resultat_net, v_sens)
    ) RETURNING id INTO v_cloture_id;

    RETURN jsonb_build_object(
        'success', true,
        'cloture_id', v_cloture_id,
        'annee', v_exo.annee,
        'total_produits', v_tot_produits,
        'total_charges', v_tot_charges,
        'resultat_net', v_resultat_net,
        'sens_resultat', v_sens,
        'paf_hash', v_paf_hash,
        'exercice_suivant_id', v_next_exo_id,
        'annee_suivante', v_next_annee
    );
END;
$$;

-- ==============================================================================
-- SECTION SÉCURITÉ : CLOISONNEMENT DES COMPTES ET DES ENTREPRISES
-- (identique à migrations/20261023000005_securite_cloisonnement_profils.sql)
-- Doit rester EN DERNIER : elle remplace les fonctions et règles d'accès définies plus haut.
-- ==============================================================================

/*
# Sécurité : cloisonnement des comptes et des entreprises

Corrige quatre failles critiques relevées à l'audit des profils.

1. Inscription publique rattachée à la première entreprise
   - Avant : le trigger `profiles_fill_entreprise` rattachait tout nouveau compte
     à l'entreprise la plus ancienne (rôle vendeur). Un inconnu qui s'inscrivait
     voyait donc les données de ce client.
   - Après : un compte créé par inscription n'est rattaché à aucune entreprise et
     n'a aucun privilège. Un administrateur le rattache ensuite à SON entreprise
     avec la fonction `rattacher_utilisateur` ; le super administrateur peut tout faire.

2. Administrateurs d'entreprise devenus administrateurs de toute la plateforme
   - Avant : `is_admin()` valait « rôle = admin » sans regarder l'entreprise. L'admin
     d'un client pouvait lire tous les profils de la plateforme, modifier n'importe
     lequel (rôle, entreprise, super_admin), lire les clés API et webhooks des autres
     entreprises, et modifier n'importe quelle entreprise (modules, suspension).
   - Après :
     • `is_admin()` (accès inter-entreprises) est réservé au super administrateur ;
     • `is_tenant_admin()` = propriétaire ou administrateur actif de SON entreprise ;
     • profils et entreprises sont cloisonnés par entreprise ;
     • seul le super administrateur change `super_admin`, le rattachement d'un compte
       existant, les modules, le pack ou la suspension d'une entreprise ;
     • un administrateur ne change pas son propre rôle, et seul un propriétaire
       attribue ou retire le rôle Propriétaire.

3. Rôles refusés par la base
   - Avant : la contrainte n'acceptait que admin, gestionnaire, magasinier, vendeur.
   - Après : les 8 rôles de l'application sont acceptés.

   • le journal d'audit est cloisonné par entreprise (il était lisible en entier
     par tout administrateur dans le schéma d'installation complète).

4. Secret de double authentification lisible
   - Avant : `profiles.two_factor_secret`, lisible par quiconque pouvait lire le profil.
   - Après : déplacé dans `profils_secrets`, sans aucun accès depuis l'application
     (réservé aux fonctions serveur). `profiles.two_factor_enabled` reste en place.

À VÉRIFIER APRÈS APPLICATION (non automatisé, pour ne détacher personne par erreur) :
comptes rattachés à la première entreprise par l'ancien trigger, à contrôler un par un :

  SELECT p.email, p.role, p.created_at
  FROM public.profiles p
  WHERE p.entreprise_id = (SELECT id FROM public.entreprises ORDER BY created_at LIMIT 1)
  ORDER BY p.created_at DESC;

Un compte inconnu se détache par le super administrateur :
  UPDATE public.profiles SET entreprise_id = NULL, actif = false WHERE email = '...';

Idempotente : peut être rejouée sans effet de bord.
*/

-- =============================================================================
-- 0. FONCTIONS D'AIDE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND super_admin = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Accès inter-entreprises : réservé au super administrateur de la plateforme.
-- Les politiques existantes « entreprise_id = current_entreprise_id() OR is_admin() »
-- (clés API, webhooks, compteurs de documents) deviennent ainsi cloisonnées.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT public.is_super_admin();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_entreprise_id()
RETURNS uuid AS $$
  SELECT entreprise_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Propriétaire ou administrateur actif, rattaché à une entreprise
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('proprietaire', 'admin')
      AND actif = true
      AND entreprise_id IS NOT NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 1. LES 8 RÔLES DE L'APPLICATION
-- =============================================================================

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
  role IN ('proprietaire', 'admin', 'gerant', 'gestionnaire', 'comptable', 'magasinier', 'caissier', 'vendeur')
);

-- =============================================================================
-- 2. INSCRIPTION : AUCUN RATTACHEMENT NI PRIVILÈGE AUTOMATIQUE
-- =============================================================================

DROP TRIGGER IF EXISTS trigger_profiles_fill_entreprise ON public.profiles;
DROP TRIGGER IF EXISTS trigger_first_admin ON public.profiles;

CREATE OR REPLACE FUNCTION public.profiles_before_insert()
RETURNS trigger AS $$
BEGIN
  -- Tout premier compte de la plateforme (installation neuve) : administrateur
  IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
    NEW.role := 'admin';
    RETURN NEW;
  END IF;

  -- Inscription (trigger d'auth.users) ou insertion par un utilisateur : compte neutre
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    NEW.role := 'vendeur';
    NEW.super_admin := false;
    NEW.entreprise_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_profiles_before_insert ON public.profiles;
CREATE TRIGGER trg_profiles_before_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_before_insert();

-- =============================================================================
-- 3. PROFILS : RÈGLES D'ACCÈS CLOISONNÉES PAR ENTREPRISE
-- =============================================================================

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Chacun voit son profil ; l'admin voit les comptes de son entreprise ; le super admin voit tout
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR (public.is_tenant_admin() AND entreprise_id = public.current_entreprise_id())
  );

CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_super_admin());

-- WITH CHECK empêche aussi un admin de déplacer un compte vers une autre entreprise
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR (public.is_tenant_admin() AND entreprise_id = public.current_entreprise_id())
  )
  WITH CHECK (
    id = auth.uid()
    OR public.is_super_admin()
    OR (public.is_tenant_admin() AND entreprise_id = public.current_entreprise_id())
  );

CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_tenant_admin() AND entreprise_id = public.current_entreprise_id() AND id <> auth.uid())
  );

-- Garde-fou sur les colonnes sensibles (s'applique en plus des règles ci-dessus)
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger AS $$
DECLARE
  v_role text;
  v_entreprise uuid;
BEGIN
  -- Processus internes (sans utilisateur) et super administrateur : pas de restriction
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.super_admin IS DISTINCT FROM OLD.super_admin THEN
    RAISE EXCEPTION 'Seul le super administrateur peut modifier ce privilège.';
  END IF;

  -- Rattachement d'un nouveau compte : contrôlé par rattacher_utilisateur()
  IF COALESCE(current_setting('yos360.rattachement', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.entreprise_id IS DISTINCT FROM OLD.entreprise_id THEN
    RAISE EXCEPTION 'Le rattachement d''un compte à une entreprise ne peut pas être modifié ainsi.';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.actif IS DISTINCT FROM OLD.actif THEN
    SELECT role, entreprise_id INTO v_role, v_entreprise FROM public.profiles WHERE id = auth.uid();
    IF NOT public.is_tenant_admin() OR OLD.entreprise_id IS DISTINCT FROM v_entreprise THEN
      RAISE EXCEPTION 'Seul un administrateur de l''entreprise peut modifier le rôle ou l''activation d''un compte.';
    END IF;
    IF NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte.';
    END IF;
    IF v_role <> 'proprietaire' AND (OLD.role = 'proprietaire' OR NEW.role = 'proprietaire') THEN
      RAISE EXCEPTION 'Seul un propriétaire peut attribuer ou retirer le rôle Propriétaire.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Rattacher un compte encore sans entreprise à l'entreprise de l'administrateur
CREATE OR REPLACE FUNCTION public.rattacher_utilisateur(p_user_id uuid, p_role text)
RETURNS void AS $$
DECLARE
  v_role text;
  v_entreprise uuid;
  v_cible public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_tenant_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur d''entreprise peut rattacher un compte.';
  END IF;
  SELECT role, entreprise_id INTO v_role, v_entreprise FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO v_cible FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compte introuvable.';
  END IF;
  IF v_cible.entreprise_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ce compte est déjà rattaché à une entreprise.';
  END IF;
  IF v_cible.super_admin THEN
    RAISE EXCEPTION 'Ce compte ne peut pas être rattaché.';
  END IF;
  IF p_role NOT IN ('proprietaire', 'admin', 'gerant', 'gestionnaire', 'comptable', 'magasinier', 'caissier', 'vendeur') THEN
    RAISE EXCEPTION 'Rôle inconnu : %', p_role;
  END IF;
  IF p_role = 'proprietaire' AND v_role <> 'proprietaire' THEN
    RAISE EXCEPTION 'Seul un propriétaire peut attribuer le rôle Propriétaire.';
  END IF;

  PERFORM set_config('yos360.rattachement', 'on', true);
  UPDATE public.profiles SET entreprise_id = v_entreprise, role = p_role WHERE id = p_user_id;
  PERFORM set_config('yos360.rattachement', 'off', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.rattacher_utilisateur(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rattacher_utilisateur(uuid, text) TO authenticated;

-- =============================================================================
-- 4. ENTREPRISES : CHACUN LA SIENNE, GOUVERNANCE AU SUPER ADMIN
-- =============================================================================

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'entreprises' LOOP
    EXECUTE format('DROP POLICY %I ON public.entreprises', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.entreprises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entreprises_select" ON public.entreprises FOR SELECT TO authenticated
  USING (id = public.current_entreprise_id() OR public.is_super_admin());

CREATE POLICY "entreprises_insert" ON public.entreprises FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "entreprises_update" ON public.entreprises FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (public.is_tenant_admin() AND id = public.current_entreprise_id()))
  WITH CHECK (public.is_super_admin() OR (public.is_tenant_admin() AND id = public.current_entreprise_id()));

CREATE POLICY "entreprises_delete" ON public.entreprises FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- Modules, pack et suspension : décidés par le propriétaire du SaaS uniquement
CREATE OR REPLACE FUNCTION public.protect_entreprise_governance()
RETURNS trigger AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.modules IS DISTINCT FROM OLD.modules
     OR NEW.pack IS DISTINCT FROM OLD.pack
     OR NEW.suspendue IS DISTINCT FROM OLD.suspendue THEN
    RAISE EXCEPTION 'Les modules, le pack et la suspension sont gérés par l''éditeur de YOS360.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_entreprise_governance ON public.entreprises;
CREATE TRIGGER trg_protect_entreprise_governance
  BEFORE UPDATE ON public.entreprises
  FOR EACH ROW EXECUTE FUNCTION public.protect_entreprise_governance();

-- =============================================================================
-- 5. JOURNAL D'AUDIT : CHAQUE ENTREPRISE LIT LE SIEN
-- =============================================================================
-- Le schéma d'installation complète n'a pas de colonne entreprise_id sur le journal
-- et le laissait lire en entier par tout administrateur.

ALTER TABLE public.journal_audit ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES public.entreprises(id);
ALTER TABLE public.journal_audit ALTER COLUMN entreprise_id SET DEFAULT public.current_entreprise_id();

-- Entrées existantes : entreprise de l'auteur de l'action
UPDATE public.journal_audit j
SET entreprise_id = p.entreprise_id
FROM public.profiles p
WHERE j.entreprise_id IS NULL AND p.id = j.user_id;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_audit' AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.journal_audit', pol.policyname);
  END LOOP;
END $$;

-- Mêmes rôles que la matrice de l'application (module audit : lecture)
CREATE POLICY "journal_audit_select" ON public.journal_audit FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      entreprise_id = public.current_entreprise_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND actif = true
          AND role IN ('proprietaire', 'admin', 'gerant', 'gestionnaire', 'comptable')
      )
    )
  );

-- =============================================================================
-- 6. SECRET DE DOUBLE AUTHENTIFICATION HORS DU PROFIL
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profils_secrets (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  two_factor_secret text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS activée sans aucune politique et droits retirés : inaccessible depuis l'application
ALTER TABLE public.profils_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profils_secrets FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'two_factor_secret'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.profils_secrets (profile_id, two_factor_secret)
      SELECT id, two_factor_secret FROM public.profiles WHERE two_factor_secret IS NOT NULL
      ON CONFLICT (profile_id) DO UPDATE SET two_factor_secret = EXCLUDED.two_factor_secret, updated_at = now()
    $sql$;
    ALTER TABLE public.profiles DROP COLUMN two_factor_secret;
  END IF;
END $$;

-- ==============================================================================
-- SECTION MODÈLES MÉTIER : SUPÉRETTE / ALIMENTATION ET GROSSISTE / DISTRIBUTEUR
-- (identique à migrations/20261024000006_modeles_metier.sql)
-- ==============================================================================

/*
# Modèles métier : Supérette / Alimentation et Grossiste / Distributeur

Le super administrateur configure une entreprise cliente pour son métier en un clic,
depuis le cockpit (Gouvernance des entreprises clientes).

1. Nouvelle colonne
   - `entreprises.secteur` : 'superette', 'grossiste' ou NULL (configuration libre par packs).
     Décidée par l'éditeur uniquement (ajoutée au garde-fou de gouvernance).

2. Nouvelle fonction `appliquer_modele_metier(p_entreprise, p_secteur)` — super admin uniquement
   - active les modules du métier (remplace la liste de modules) ;
   - ajoute les catégories de produits types, les grilles tarifaires et un premier
     point de vente ou dépôt, SANS RIEN SUPPRIMER NI ÉCRASER : ce qui existe déjà
     (même nom) est conservé ;
   - renvoie le détail de ce qui a été créé.

Idempotente : rejouer la migration ou réappliquer un modèle ne crée pas de doublons.
*/

-- =============================================================================
-- 1. SECTEUR D'ACTIVITÉ DE L'ENTREPRISE
-- =============================================================================

ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS secteur text;

ALTER TABLE public.entreprises DROP CONSTRAINT IF EXISTS entreprises_secteur_check;
ALTER TABLE public.entreprises ADD CONSTRAINT entreprises_secteur_check
  CHECK (secteur IS NULL OR secteur IN ('superette', 'grossiste'));

-- Le secteur rejoint les réglages réservés à l'éditeur (modules, pack, suspension)
CREATE OR REPLACE FUNCTION public.protect_entreprise_governance()
RETURNS trigger AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.modules IS DISTINCT FROM OLD.modules
     OR NEW.pack IS DISTINCT FROM OLD.pack
     OR NEW.suspendue IS DISTINCT FROM OLD.suspendue
     OR NEW.secteur IS DISTINCT FROM OLD.secteur THEN
    RAISE EXCEPTION 'Les modules, le pack, le secteur et la suspension sont gérés par l''éditeur de YOS360.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 2. APPLICATION D'UN MODÈLE MÉTIER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.appliquer_modele_metier(p_entreprise uuid, p_secteur text)
RETURNS jsonb AS $$
DECLARE
  v_modules text[];
  v_categories text[];
  v_couleurs text[] := ARRAY['#16a34a', '#0284c7', '#f59e0b', '#db2777', '#7c3aed', '#0d9488', '#ea580c', '#64748b'];
  v_grilles jsonb;
  v_site_nom text;
  v_site_code text;
  v_cat_creees int := 0;
  v_grilles_creees int := 0;
  v_site_cree boolean := false;
  v_n int;
  i int;
  g jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Réservé au super administrateur de la plateforme.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.entreprises WHERE id = p_entreprise) THEN
    RAISE EXCEPTION 'Entreprise introuvable.';
  END IF;

  IF p_secteur = 'superette' THEN
    -- Commerce de détail alimentaire : caisse rapide, codes-barres, péremptions, fidélité
    v_modules := ARRAY[
      'dashboard', 'produits', 'categories', 'mouvements', 'entrepots', 'inventaires', 'lots',
      'scan', 'reappro', 'fournisseurs', 'clients', 'commandes', 'achats', 'paiements', 'caisse',
      'tarifs', 'rapports', 'audit', 'parametres'
    ];
    v_categories := ARRAY[
      'Épicerie sèche', 'Boissons', 'Produits frais', 'Produits laitiers',
      'Boulangerie & petit-déjeuner', 'Hygiène & beauté', 'Entretien de la maison', 'Bébé'
    ];
    v_grilles := '[
      {"nom": "Prix détail", "categorie": "detail", "remise": 0, "description": "Prix affiché en rayon"},
      {"nom": "Client fidèle", "categorie": "vip", "remise": 3, "description": "Clients réguliers inscrits"}
    ]'::jsonb;
    v_site_nom := 'Boutique principale';
    v_site_code := 'BOUTIQUE-01';

  ELSIF p_secteur = 'grossiste' THEN
    -- Négoce en volume : tarifs par type de client, crédit, plusieurs dépôts, commerciaux
    v_modules := ARRAY[
      'dashboard', 'produits', 'categories', 'mouvements', 'entrepots', 'transferts', 'inventaires',
      'lots', 'scan', 'reappro', 'fournisseurs', 'clients', 'commandes', 'achats', 'paiements',
      'caisse', 'tarifs', 'validations', 'tresorerie', 'comptabilite', 'equipe', 'import_export',
      'rapports', 'audit', 'parametres'
    ];
    v_categories := ARRAY[
      'Boissons & eaux', 'Riz, céréales & farines', 'Huiles & condiments', 'Sucre & conserves',
      'Pâtes & produits secs', 'Hygiène & entretien', 'Lait & produits laitiers', 'Emballages'
    ];
    v_grilles := '[
      {"nom": "Prix détail", "categorie": "detail", "remise": 0, "description": "Vente à l''unité au comptoir"},
      {"nom": "Demi-gros", "categorie": "demi_gros", "remise": 5, "description": "Boutiquiers et revendeurs de quartier"},
      {"nom": "Gros", "categorie": "grossiste", "remise": 10, "description": "Achats en volume et distributeurs"}
    ]'::jsonb;
    v_site_nom := 'Dépôt principal';
    v_site_code := 'DEPOT-01';

  ELSE
    RAISE EXCEPTION 'Modèle métier inconnu : % (attendu : superette ou grossiste)', p_secteur;
  END IF;

  UPDATE public.entreprises
  SET secteur = p_secteur, modules = v_modules, pack = p_secteur, updated_at = now()
  WHERE id = p_entreprise;

  -- Catégories : ajoutées seulement si le nom n'existe pas déjà
  FOR i IN 1 .. array_length(v_categories, 1) LOOP
    INSERT INTO public.categories (entreprise_id, nom, couleur)
    SELECT p_entreprise, v_categories[i], v_couleurs[1 + (i - 1) % array_length(v_couleurs, 1)]
    WHERE NOT EXISTS (
      SELECT 1 FROM public.categories
      WHERE entreprise_id = p_entreprise AND lower(nom) = lower(v_categories[i])
    );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_cat_creees := v_cat_creees + v_n;
  END LOOP;

  -- Grilles tarifaires : remises par défaut, modifiables ensuite par le client
  FOR g IN SELECT * FROM jsonb_array_elements(v_grilles) LOOP
    INSERT INTO public.grilles_tarifaires (entreprise_id, nom, categorie_client, remise_globale_pourcentage, description)
    VALUES (p_entreprise, g->>'nom', g->>'categorie', (g->>'remise')::numeric, g->>'description')
    ON CONFLICT (entreprise_id, nom) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_grilles_creees := v_grilles_creees + v_n;
  END LOOP;

  -- Premier point de vente ou dépôt, seulement si l'entreprise n'en a aucun
  IF NOT EXISTS (SELECT 1 FROM public.entrepots WHERE entreprise_id = p_entreprise) THEN
    INSERT INTO public.entrepots (entreprise_id, nom, code) VALUES (p_entreprise, v_site_nom, v_site_code);
    v_site_cree := true;
  END IF;

  RETURN jsonb_build_object(
    'secteur', p_secteur,
    'modules', array_length(v_modules, 1),
    'categories_creees', v_cat_creees,
    'grilles_creees', v_grilles_creees,
    'site_cree', v_site_cree
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.appliquer_modele_metier(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.appliquer_modele_metier(uuid, text) TO authenticated;

-- ==============================================================================
-- SECTION VENTES SOUS LE COÛT ET MODÈLES MÉTIER CUMULATIFS
-- (identique à migrations/20261025000007_vente_sous_cout_modeles_cumulatifs.sql)
-- ==============================================================================

/*
# Ventes sous le coût d'achat et modèles métier cumulatifs

1. Ventes sous le coût d'achat moyen (CMUP) bloquées
   - Une ligne de vente (caisse, commande, devis, facture) dont le prix unitaire est
     inférieur au coût d'achat moyen pondéré du produit est refusée.
   - Exception : le propriétaire, un administrateur, un gérant (ou le super
     administrateur) peut l'enregistrer lui-même : c'est la « validation d'un responsable ».
   - Non concernés : les avoirs (remboursements), les achats, les produits sans coût
     connu (CMUP à 0) et les traitements internes sans utilisateur connecté.
   - Le prix comparé est le prix unitaire enregistré sur la ligne, sans retraitement de TVA.

2. Modèles métier cumulatifs (et suppression de l'unicité globale des noms de catégories,
   héritée d'avant le multi-entreprises, qui bloquait les catégories types)
   - `appliquer_modele_metier` AJOUTE désormais les modules du modèle à ceux déjà actifs,
     sans en retirer. Paramètre `p_remplacer => true` pour l'ancien comportement.

Idempotente.
*/

-- =============================================================================
-- 1. BLOCAGE DES VENTES SOUS LE COÛT D'ACHAT MOYEN
-- =============================================================================

CREATE OR REPLACE FUNCTION public.bloquer_vente_sous_cout()
RETURNS trigger AS $$
DECLARE
  v_type text;
  v_document text;
  v_cmup numeric;
  v_nom text;
  v_devise text;
  v_role text;
BEGIN
  -- Traitements internes (sans utilisateur connecté) : pas de contrôle
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.type, c.type_document INTO v_type, v_document
  FROM public.commandes c WHERE c.id = NEW.commande_id;
  IF v_type IS DISTINCT FROM 'vente' OR v_document = 'avoir' THEN
    RETURN NEW;
  END IF;

  SELECT p.cmup, p.nom INTO v_cmup, v_nom FROM public.produits p WHERE p.id = NEW.produit_id;
  IF COALESCE(v_cmup, 0) <= 0 OR NEW.prix_unitaire >= v_cmup THEN
    RETURN NEW;
  END IF;

  -- Validation d'un responsable : il enregistre lui-même la vente
  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IN ('proprietaire', 'admin', 'gerant') THEN
    RETURN NEW;
  END IF;

  SELECT CASE WHEN e.devise = 'XOF' THEN 'FCFA' ELSE e.devise END INTO v_devise
  FROM public.entreprises e WHERE e.id = NEW.entreprise_id;

  RAISE EXCEPTION 'Vente sous le coût refusée : « % » à % % alors qu''il revient à % % (coût d''achat moyen). Un gérant ou un administrateur doit valider ce prix.',
    v_nom, round(NEW.prix_unitaire), COALESCE(v_devise, 'FCFA'), round(v_cmup), COALESCE(v_devise, 'FCFA');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_bloquer_vente_sous_cout ON public.commande_items;
CREATE TRIGGER trg_bloquer_vente_sous_cout
  BEFORE INSERT OR UPDATE OF prix_unitaire, produit_id ON public.commande_items
  FOR EACH ROW EXECUTE FUNCTION public.bloquer_vente_sous_cout();

-- =============================================================================
-- 2. MODÈLES MÉTIER : AJOUTER LES MODULES SANS RETIRER CEUX DÉJÀ ACTIFS
-- =============================================================================

-- Héritage d'avant le multi-entreprises (schéma des migrations) : un nom de catégorie
-- unique sur TOUTE la plateforme empêchait deux entreprises d'avoir « Boissons ».
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_nom_key;

-- Nouvelle signature (paramètre optionnel) : l'ancienne est supprimée pour éviter l'ambiguïté
DROP FUNCTION IF EXISTS public.appliquer_modele_metier(uuid, text);

CREATE OR REPLACE FUNCTION public.appliquer_modele_metier(p_entreprise uuid, p_secteur text, p_remplacer boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
  v_modules text[];
  v_actuels text[];
  v_categories text[];
  v_couleurs text[] := ARRAY['#16a34a', '#0284c7', '#f59e0b', '#db2777', '#7c3aed', '#0d9488', '#ea580c', '#64748b'];
  v_grilles jsonb;
  v_site_nom text;
  v_site_code text;
  v_cat_creees int := 0;
  v_grilles_creees int := 0;
  v_site_cree boolean := false;
  v_modules_ajoutes int;
  v_n int;
  i int;
  g jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Réservé au super administrateur de la plateforme.';
  END IF;
  SELECT modules INTO v_actuels FROM public.entreprises WHERE id = p_entreprise;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entreprise introuvable.';
  END IF;

  IF p_secteur = 'superette' THEN
    v_modules := ARRAY[
      'dashboard', 'produits', 'categories', 'mouvements', 'entrepots', 'inventaires', 'lots',
      'scan', 'reappro', 'fournisseurs', 'clients', 'commandes', 'achats', 'paiements', 'caisse',
      'tarifs', 'rapports', 'audit', 'parametres'
    ];
    v_categories := ARRAY[
      'Épicerie sèche', 'Boissons', 'Produits frais', 'Produits laitiers',
      'Boulangerie & petit-déjeuner', 'Hygiène & beauté', 'Entretien de la maison', 'Bébé'
    ];
    v_grilles := '[
      {"nom": "Prix détail", "categorie": "detail", "remise": 0, "description": "Prix affiché en rayon"},
      {"nom": "Client fidèle", "categorie": "vip", "remise": 3, "description": "Clients réguliers inscrits"}
    ]'::jsonb;
    v_site_nom := 'Boutique principale';
    v_site_code := 'BOUTIQUE-01';

  ELSIF p_secteur = 'grossiste' THEN
    v_modules := ARRAY[
      'dashboard', 'produits', 'categories', 'mouvements', 'entrepots', 'transferts', 'inventaires',
      'lots', 'scan', 'reappro', 'fournisseurs', 'clients', 'commandes', 'achats', 'paiements',
      'caisse', 'tarifs', 'validations', 'tresorerie', 'comptabilite', 'equipe', 'import_export',
      'rapports', 'audit', 'parametres'
    ];
    v_categories := ARRAY[
      'Boissons & eaux', 'Riz, céréales & farines', 'Huiles & condiments', 'Sucre & conserves',
      'Pâtes & produits secs', 'Hygiène & entretien', 'Lait & produits laitiers', 'Emballages'
    ];
    v_grilles := '[
      {"nom": "Prix détail", "categorie": "detail", "remise": 0, "description": "Vente à l''unité au comptoir"},
      {"nom": "Demi-gros", "categorie": "demi_gros", "remise": 5, "description": "Boutiquiers et revendeurs de quartier"},
      {"nom": "Gros", "categorie": "grossiste", "remise": 10, "description": "Achats en volume et distributeurs"}
    ]'::jsonb;
    v_site_nom := 'Dépôt principal';
    v_site_code := 'DEPOT-01';

  ELSE
    RAISE EXCEPTION 'Modèle métier inconnu : % (attendu : superette ou grossiste)', p_secteur;
  END IF;

  -- Par défaut : union des modules actuels et de ceux du modèle (aucun retrait)
  IF NOT p_remplacer THEN
    v_modules := ARRAY(
      SELECT DISTINCT m FROM unnest(COALESCE(v_actuels, '{}'::text[]) || v_modules) AS m ORDER BY m
    );
  END IF;
  v_modules_ajoutes := (
    SELECT count(*) FROM unnest(v_modules) AS m WHERE NOT (m = ANY (COALESCE(v_actuels, '{}'::text[])))
  );

  UPDATE public.entreprises
  SET secteur = p_secteur, modules = v_modules, pack = p_secteur, updated_at = now()
  WHERE id = p_entreprise;

  FOR i IN 1 .. array_length(v_categories, 1) LOOP
    INSERT INTO public.categories (entreprise_id, nom, couleur)
    SELECT p_entreprise, v_categories[i], v_couleurs[1 + (i - 1) % array_length(v_couleurs, 1)]
    WHERE NOT EXISTS (
      SELECT 1 FROM public.categories
      WHERE entreprise_id = p_entreprise AND lower(nom) = lower(v_categories[i])
    );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_cat_creees := v_cat_creees + v_n;
  END LOOP;

  FOR g IN SELECT * FROM jsonb_array_elements(v_grilles) LOOP
    INSERT INTO public.grilles_tarifaires (entreprise_id, nom, categorie_client, remise_globale_pourcentage, description)
    VALUES (p_entreprise, g->>'nom', g->>'categorie', (g->>'remise')::numeric, g->>'description')
    ON CONFLICT (entreprise_id, nom) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_grilles_creees := v_grilles_creees + v_n;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.entrepots WHERE entreprise_id = p_entreprise) THEN
    INSERT INTO public.entrepots (entreprise_id, nom, code) VALUES (p_entreprise, v_site_nom, v_site_code);
    v_site_cree := true;
  END IF;

  RETURN jsonb_build_object(
    'secteur', p_secteur,
    'modules', array_length(v_modules, 1),
    'modules_ajoutes', v_modules_ajoutes,
    'categories_creees', v_cat_creees,
    'grilles_creees', v_grilles_creees,
    'site_cree', v_site_cree
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.appliquer_modele_metier(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.appliquer_modele_metier(uuid, text, boolean) TO authenticated;

-- ==============================================================================
-- SECTION CAISSE : PRIX CALCULÉS PAR LA BASE, VENTE EN UNE SEULE OPÉRATION
-- (identique à migrations/20261026000008_caisse_prix_serveur.sql)
-- ==============================================================================

/*
# Caisse : prix calculés par la base, vente enregistrée en une seule opération

Avant :
- l'écran de caisse écrivait lui-même la vente, ses lignes (au prix envoyé par le
  navigateur), les sorties de stock et les paiements, en 4 envois séparés. Si une ligne
  était refusée, la vente sans lignes, la sortie de stock et le paiement restaient
  enregistrés ;
- en hors-ligne, seuls l'en-tête et les paiements étaient mis en file d'attente : ni les
  lignes ni les sorties de stock, et une colonne inexistante faisait échouer la reprise ;
- n'importe quel utilisateur pouvait écrire une ligne de vente au prix de son choix
  (au-dessus du coût) ;
- la grille tarifaire du client n'était pas appliquée en caisse.

Après :
1. `tarifer_panier(client, panier)` : prix de chaque article calculé par la base
   (prix catalogue, grille tarifaire de la catégorie du client, prix spécifique ou remise
   par produit selon la quantité). L'écran affiche exactement ce que la base appliquera.
2. `encaisser_vente_caisse(...)` : calcule les prix, vérifie le stock et les paiements,
   puis enregistre vente, lignes, sorties de stock et paiements dans UNE transaction
   (tout ou rien). Le prix envoyé par le navigateur est ignoré. Numérotation par la base.
   Rejouable sans doublon grâce à `vente_uuid` (reprise des ventes hors-ligne).
   En reprise hors-ligne (`p_hors_ligne`) : la vente a déjà eu lieu, elle est enregistrée
   même si le stock est devenu insuffisant ; un écart de paiement est noté sur la vente.
3. Ligne de vente sous le tarif du client (hors avoir) : refusée, sauf si un propriétaire,
   un administrateur ou un gérant l'enregistre lui-même.
4. L'ancienne fonction `encaisser_vente_pos`, qui faisait confiance au prix envoyé,
   n'est plus exécutable depuis l'application.

Idempotente.
*/

-- =============================================================================
-- 0. IDENTIFIANT DE VENTE (REPRISE HORS-LIGNE SANS DOUBLON)
-- =============================================================================

ALTER TABLE public.commandes ADD COLUMN IF NOT EXISTS vente_uuid uuid;
CREATE UNIQUE INDEX IF NOT EXISTS commandes_vente_uuid_key ON public.commandes (vente_uuid) WHERE vente_uuid IS NOT NULL;

-- =============================================================================
-- 1. CALCUL DU PRIX D'UN ARTICLE
-- =============================================================================

-- Catégorie tarifaire du client : l'application l'enregistre dans `categorie_client`, que le
-- schéma d'installation complète n'avait pas (il n'a que `categorie`) ; le schéma des
-- migrations, lui, n'a pas `categorie`. Les deux colonnes sont garanties ici.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS categorie_client text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS categorie text;

-- Grille tarifaire applicable au client (sans catégorie, ou « particulier » : détail)
CREATE OR REPLACE FUNCTION public.grille_du_client(p_entreprise uuid, p_client uuid)
RETURNS uuid AS $$
  SELECT g.id
  FROM public.grilles_tarifaires g
  WHERE g.entreprise_id = p_entreprise
    AND g.actif = true
    AND g.deleted_at IS NULL
    AND g.categorie_client = COALESCE(
      (SELECT COALESCE(NULLIF(c.categorie_client, ''), NULLIF(NULLIF(c.categorie, ''), 'particulier'))
       FROM public.clients c
       WHERE c.id = p_client AND c.entreprise_id = p_entreprise),
      'detail')
  ORDER BY g.created_at
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Prix d'un article pour une quantité et une grille (même règle que l'écran Tarifs)
CREATE OR REPLACE FUNCTION public.prix_article(p_produit uuid, p_quantite integer, p_grille uuid, OUT prix numeric, OUT motif text)
AS $$
DECLARE
  v_base numeric;
  v_ligne record;
  v_grille record;
BEGIN
  SELECT prix_vente INTO v_base FROM public.produits WHERE id = p_produit;
  prix := COALESCE(v_base, 0);
  motif := 'Prix catalogue';
  IF p_grille IS NULL THEN
    RETURN;
  END IF;

  SELECT nom, remise_globale_pourcentage INTO v_grille FROM public.grilles_tarifaires WHERE id = p_grille;

  -- Ligne spécifique au produit : celle du plus grand palier de quantité atteint
  SELECT prix_specifique, remise_pourcentage INTO v_ligne
  FROM public.grille_tarifaire_lignes
  WHERE grille_id = p_grille AND produit_id = p_produit AND quantite_min <= GREATEST(p_quantite, 1)
  ORDER BY quantite_min DESC
  LIMIT 1;

  IF FOUND AND COALESCE(v_ligne.prix_specifique, 0) > 0 THEN
    prix := v_ligne.prix_specifique;
    motif := 'Grille ' || v_grille.nom || ' (prix négocié)';
  ELSIF FOUND AND COALESCE(v_ligne.remise_pourcentage, 0) > 0 THEN
    prix := round(prix * (1 - v_ligne.remise_pourcentage / 100));
    motif := 'Grille ' || v_grille.nom || ' (-' || v_ligne.remise_pourcentage || ' %)';
  ELSIF COALESCE(v_grille.remise_globale_pourcentage, 0) > 0 THEN
    prix := round(prix * (1 - v_grille.remise_globale_pourcentage / 100));
    motif := 'Remise ' || v_grille.nom || ' (-' || v_grille.remise_globale_pourcentage || ' %)';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.grille_du_client(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prix_article(uuid, integer, uuid) FROM PUBLIC;

-- =============================================================================
-- 2. PRIX DU PANIER (AFFICHAGE EN CAISSE)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tarifer_panier(p_client_id uuid, p_panier jsonb)
RETURNS jsonb AS $$
DECLARE
  v_entreprise uuid := public.current_entreprise_id();
  v_grille uuid;
  v_item jsonb;
  v_qte integer;
  v_prix record;
  v_lignes jsonb := '[]'::jsonb;
  v_total numeric := 0;
BEGIN
  IF v_entreprise IS NULL THEN
    RAISE EXCEPTION 'Aucune entreprise active.';
  END IF;
  v_grille := public.grille_du_client(v_entreprise, p_client_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_panier, '[]'::jsonb)) LOOP
    v_qte := GREATEST(COALESCE((v_item->>'quantite')::integer, 1), 1);
    IF NOT EXISTS (SELECT 1 FROM public.produits WHERE id = (v_item->>'produit_id')::uuid AND entreprise_id = v_entreprise) THEN
      CONTINUE;
    END IF;
    SELECT * INTO v_prix FROM public.prix_article((v_item->>'produit_id')::uuid, v_qte, v_grille);
    v_lignes := v_lignes || jsonb_build_object('produit_id', v_item->>'produit_id', 'prix', v_prix.prix, 'motif', v_prix.motif);
    v_total := v_total + v_qte * v_prix.prix;
  END LOOP;

  RETURN jsonb_build_object('lignes', v_lignes, 'total', v_total);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.tarifer_panier(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tarifer_panier(uuid, jsonb) TO authenticated;

-- =============================================================================
-- 3. ENCAISSEMENT EN UNE SEULE OPÉRATION
-- =============================================================================

CREATE OR REPLACE FUNCTION public.encaisser_vente_caisse(
  p_client_id uuid,
  p_client_walkin text,
  p_panier jsonb,
  p_paiements jsonb,
  p_vente_uuid uuid DEFAULT NULL,
  p_hors_ligne boolean DEFAULT false,
  p_note text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_entreprise uuid := public.current_entreprise_id();
  v_role text;
  v_ent record;
  v_grille uuid;
  v_item jsonb;
  v_pay jsonb;
  v_produit record;
  v_prix record;
  v_qte integer;
  v_lignes jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_paye numeric := 0;
  v_excedent numeric;
  v_rendu numeric := 0;
  v_montant numeric;
  v_ht numeric;
  v_tva numeric;
  v_numero text;
  v_cmd uuid;
  v_existante record;
  v_notes text[] := '{}';
  v_paiements jsonb := '[]'::jsonb;
  i integer;
BEGIN
  IF v_entreprise IS NULL THEN
    RAISE EXCEPTION 'Aucune entreprise active.';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF NOT public.is_super_admin() AND COALESCE(v_role, '') NOT IN ('proprietaire', 'admin', 'gerant', 'gestionnaire', 'caissier', 'vendeur') THEN
    RAISE EXCEPTION 'Votre rôle ne permet pas d''encaisser des ventes.';
  END IF;
  SELECT tva_active, tva_taux, suspendue INTO v_ent FROM public.entreprises WHERE id = v_entreprise;
  IF v_ent.suspendue AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'L''accès de cette entreprise est suspendu.';
  END IF;

  -- Vente déjà enregistrée (reprise hors-ligne rejouée) : on renvoie la même
  IF p_vente_uuid IS NOT NULL THEN
    SELECT id, numero_document, montant_ht, montant_tva, montant_total INTO v_existante
    FROM public.commandes WHERE vente_uuid = p_vente_uuid AND entreprise_id = v_entreprise;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'commande_id', v_existante.id, 'numero_document', v_existante.numero_document,
        'montant_ht', v_existante.montant_ht, 'montant_tva', v_existante.montant_tva,
        'montant_total', v_existante.montant_total, 'deja_enregistree', true
      );
    END IF;
  END IF;

  IF jsonb_array_length(COALESCE(p_panier, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Le panier est vide.';
  END IF;
  IF p_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id AND entreprise_id = v_entreprise) THEN
    RAISE EXCEPTION 'Client introuvable.';
  END IF;
  v_grille := public.grille_du_client(v_entreprise, p_client_id);

  -- Prix et stock, article par article
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_panier) LOOP
    v_qte := (v_item->>'quantite')::integer;
    IF v_qte IS NULL OR v_qte <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide.';
    END IF;
    SELECT id, nom, quantite INTO v_produit
    FROM public.produits
    WHERE id = (v_item->>'produit_id')::uuid AND entreprise_id = v_entreprise
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Article introuvable dans cette entreprise.';
    END IF;
    IF v_produit.quantite < v_qte THEN
      IF p_hors_ligne THEN
        v_notes := v_notes || ('Stock insuffisant pour ' || v_produit.nom || ' au moment de la synchronisation');
      ELSE
        RAISE EXCEPTION 'Stock insuffisant pour « % » (disponible : %, demandé : %)', v_produit.nom, v_produit.quantite, v_qte;
      END IF;
    END IF;
    SELECT * INTO v_prix FROM public.prix_article(v_produit.id, v_qte, v_grille);
    v_lignes := v_lignes || jsonb_build_object(
      'produit_id', v_produit.id, 'nom', v_produit.nom, 'quantite', v_qte,
      'prix_unitaire', v_prix.prix, 'sous_total', v_qte * v_prix.prix, 'motif', v_prix.motif
    );
    v_total := v_total + v_qte * v_prix.prix;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Le montant total doit être supérieur à zéro.';
  END IF;

  -- Paiements : l'excédent en espèces devient de la monnaie rendue
  FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(p_paiements, '[]'::jsonb)) LOOP
    v_montant := COALESCE((v_pay->>'montant')::numeric, 0);
    IF v_montant > 0 THEN
      v_paiements := v_paiements || jsonb_build_object('mode', v_pay->>'mode', 'montant', v_montant, 'reference', NULLIF(trim(COALESCE(v_pay->>'reference', '')), ''));
      v_paye := v_paye + v_montant;
    END IF;
  END LOOP;

  v_excedent := v_paye - v_total;
  IF v_excedent > 0 THEN
    FOR i IN 0 .. jsonb_array_length(v_paiements) - 1 LOOP
      EXIT WHEN v_excedent <= 0;
      IF v_paiements->i->>'mode' = 'especes' THEN
        v_montant := LEAST(v_excedent, (v_paiements->i->>'montant')::numeric);
        v_paiements := jsonb_set(v_paiements, ARRAY[i::text, 'montant'], to_jsonb((v_paiements->i->>'montant')::numeric - v_montant));
        v_excedent := v_excedent - v_montant;
        v_rendu := v_rendu + v_montant;
      END IF;
    END LOOP;
    IF v_excedent > 0 THEN
      IF p_hors_ligne THEN
        v_notes := v_notes || ('Trop-perçu hors espèces de ' || v_excedent);
      ELSE
        RAISE EXCEPTION 'Le montant payé dépasse le total de la vente (% de trop, hors espèces).', v_excedent;
      END IF;
    END IF;
  ELSIF v_excedent < 0 THEN
    IF p_hors_ligne THEN
      v_notes := v_notes || ('Reste dû après synchronisation : ' || (-v_excedent));
    ELSE
      RAISE EXCEPTION 'Reste à payer : %', -v_excedent;
    END IF;
  END IF;

  IF v_ent.tva_active AND COALESCE(v_ent.tva_taux, 0) > 0 THEN
    v_ht := round(v_total / (1 + v_ent.tva_taux / 100), 2);
    v_tva := v_total - v_ht;
  ELSE
    v_ht := v_total;
    v_tva := 0;
  END IF;

  v_numero := public.next_numero_document_atomic(v_entreprise, 'facture');
  IF p_hors_ligne THEN
    v_notes := ARRAY['Vente hors ligne synchronisée'] || v_notes;
  END IF;

  INSERT INTO public.commandes (
    entreprise_id, type, client_id, client_walkin, statut, reference, numero_document, type_document,
    tva_taux, montant_ht, montant_tva, montant_total, note, vente_uuid
  ) VALUES (
    v_entreprise, 'vente', p_client_id,
    CASE WHEN p_client_id IS NULL THEN COALESCE(NULLIF(trim(COALESCE(p_client_walkin, '')), ''), 'Client comptoir') END,
    'recue', replace(v_numero, 'FAC', 'VEN'), v_numero, 'facture',
    CASE WHEN v_ent.tva_active THEN v_ent.tva_taux END, v_ht, v_tva, v_total,
    NULLIF(array_to_string(ARRAY[NULLIF(trim(COALESCE(p_note, '')), '')] || v_notes, ' — '), ''),
    p_vente_uuid
  ) RETURNING id INTO v_cmd;

  -- En reprise hors-ligne, la vente a déjà eu lieu : les contrôles de prix sont levés
  -- (le prix appliqué reste celui calculé par la base)
  IF p_hors_ligne THEN
    PERFORM set_config('yos360.vente_hors_ligne', 'on', true);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_lignes) LOOP
    INSERT INTO public.commande_items (entreprise_id, commande_id, produit_id, quantite, prix_unitaire, sous_total)
    VALUES (v_entreprise, v_cmd, (v_item->>'produit_id')::uuid, (v_item->>'quantite')::integer,
            (v_item->>'prix_unitaire')::numeric, (v_item->>'sous_total')::numeric);
    INSERT INTO public.mouvements (entreprise_id, produit_id, type, quantite, motif, reference)
    VALUES (v_entreprise, (v_item->>'produit_id')::uuid, 'sortie', (v_item->>'quantite')::integer, 'Vente caisse ' || v_numero, v_numero);
  END LOOP;

  PERFORM set_config('yos360.vente_hors_ligne', 'off', true);

  FOR v_pay IN SELECT * FROM jsonb_array_elements(v_paiements) LOOP
    IF (v_pay->>'montant')::numeric > 0 THEN
      INSERT INTO public.paiements (entreprise_id, commande_id, client_id, sens, montant, mode, reference, note)
      VALUES (v_entreprise, v_cmd, p_client_id, 'encaissement', (v_pay->>'montant')::numeric, v_pay->>'mode', v_pay->>'reference', 'Vente caisse ' || v_numero);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'commande_id', v_cmd,
    'numero_document', v_numero,
    'montant_ht', v_ht,
    'montant_tva', v_tva,
    'montant_total', v_total,
    'montant_paye', v_paye - v_rendu,
    'rendu', v_rendu,
    'lignes', v_lignes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.encaisser_vente_caisse(uuid, text, jsonb, jsonb, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.encaisser_vente_caisse(uuid, text, jsonb, jsonb, uuid, boolean, text) TO authenticated;

-- =============================================================================
-- 4. LIGNE DE VENTE SOUS LE TARIF DU CLIENT : VALIDATION D'UN RESPONSABLE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.controler_prix_vente()
RETURNS trigger AS $$
DECLARE
  v_cmd record;
  v_prix record;
  v_role text;
  v_devise text;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(current_setting('yos360.vente_hors_ligne', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  SELECT type, type_document, client_id INTO v_cmd FROM public.commandes WHERE id = NEW.commande_id;
  IF v_cmd.type IS DISTINCT FROM 'vente' OR v_cmd.type_document = 'avoir' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_prix FROM public.prix_article(NEW.produit_id, NEW.quantite, public.grille_du_client(NEW.entreprise_id, v_cmd.client_id));
  IF NEW.prix_unitaire >= v_prix.prix THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IN ('proprietaire', 'admin', 'gerant') THEN
    RETURN NEW;
  END IF;

  SELECT CASE WHEN devise = 'XOF' THEN 'FCFA' ELSE devise END INTO v_devise FROM public.entreprises WHERE id = NEW.entreprise_id;
  RAISE EXCEPTION 'Prix refusé : % % est sous le tarif de cet article pour ce client (% %, %). Un gérant ou un administrateur doit valider ce prix.',
    round(NEW.prix_unitaire), COALESCE(v_devise, 'FCFA'), round(v_prix.prix), COALESCE(v_devise, 'FCFA'), v_prix.motif;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_controler_prix_vente ON public.commande_items;
CREATE TRIGGER trg_controler_prix_vente
  BEFORE INSERT OR UPDATE OF prix_unitaire, produit_id, quantite ON public.commande_items
  FOR EACH ROW EXECUTE FUNCTION public.controler_prix_vente();

-- La reprise hors-ligne lève aussi le contrôle « sous le coût » (vente déjà réalisée)
CREATE OR REPLACE FUNCTION public.bloquer_vente_sous_cout()
RETURNS trigger AS $$
DECLARE
  v_type text;
  v_document text;
  v_cmup numeric;
  v_nom text;
  v_devise text;
  v_role text;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(current_setting('yos360.vente_hors_ligne', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT c.type, c.type_document INTO v_type, v_document
  FROM public.commandes c WHERE c.id = NEW.commande_id;
  IF v_type IS DISTINCT FROM 'vente' OR v_document = 'avoir' THEN
    RETURN NEW;
  END IF;

  SELECT p.cmup, p.nom INTO v_cmup, v_nom FROM public.produits p WHERE p.id = NEW.produit_id;
  IF COALESCE(v_cmup, 0) <= 0 OR NEW.prix_unitaire >= v_cmup THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IN ('proprietaire', 'admin', 'gerant') THEN
    RETURN NEW;
  END IF;

  SELECT CASE WHEN e.devise = 'XOF' THEN 'FCFA' ELSE e.devise END INTO v_devise
  FROM public.entreprises e WHERE e.id = NEW.entreprise_id;

  RAISE EXCEPTION 'Vente sous le coût refusée : « % » à % % alors qu''il revient à % % (coût d''achat moyen). Un gérant ou un administrateur doit valider ce prix.',
    v_nom, round(NEW.prix_unitaire), COALESCE(v_devise, 'FCFA'), round(v_cmup), COALESCE(v_devise, 'FCFA');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 5. ANCIENNE FONCTION DE CAISSE (PRIX ENVOYÉ PAR LE NAVIGATEUR) DÉSACTIVÉE
-- =============================================================================

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'encaisser_vente_pos' AND pronamespace = 'public'::regnamespace LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;

-- ==============================================================================
-- SECTION UNITÉS MULTIPLES À LA CAISSE
-- (identique à migrations/20261027000009_unites_caisse.sql)
-- ==============================================================================

/*
# Unités multiples à la caisse (carton, paquet, unité…)

Les conditionnements d'un produit (`produit_unites` : nom, nombre d'unités de base,
code-barres, prix suggéré) existaient mais n'étaient utilisés nulle part.

Principe : le stock reste compté en unités de base. Vendre 2 « Carton (24) » retire 48 unités.
Le coût moyen, les inventaires, les rapports et les contrôles de prix restent en unités de base.

1. `commande_items` garde la quantité et le prix PAR UNITÉ DE BASE (inchangés) et mémorise
   en plus l'unité vendue : `unite_id`, `libelle_unite`, `quantite_unite`, `prix_unite`
   (ex. 2 × « Carton (24) » à 12 000).
2. `prix_article_unite(produit, unite, quantite_unite, grille)` : prix d'un conditionnement
   - prix suggéré du conditionnement s'il est renseigné, sinon prix unitaire × nombre d'unités ;
   - grille du client : prix négocié par unité × nombre d'unités, sinon remise en %.
3. `tarifer_panier` et `encaisser_vente_caisse` acceptent `unite_id` par article
   (la quantité est alors exprimée dans cette unité).
4. Le contrôle « sous le tarif du client » tient compte de l'unité vendue (un carton peut
   être moins cher à l'unité que l'article seul).

Idempotente.
*/

-- =============================================================================
-- 1. UNITÉ VENDUE SUR LES LIGNES
-- =============================================================================

ALTER TABLE public.commande_items ADD COLUMN IF NOT EXISTS unite_id uuid REFERENCES public.produit_unites(id) ON DELETE SET NULL;
ALTER TABLE public.commande_items ADD COLUMN IF NOT EXISTS libelle_unite text;
ALTER TABLE public.commande_items ADD COLUMN IF NOT EXISTS quantite_unite numeric(12,3);
ALTER TABLE public.commande_items ADD COLUMN IF NOT EXISTS prix_unite numeric(12,2);

-- =============================================================================
-- 2. PRIX D'UN CONDITIONNEMENT
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prix_article_unite(
  p_produit uuid, p_unite uuid, p_quantite_unite numeric, p_grille uuid,
  OUT prix_unite numeric, OUT coefficient numeric, OUT libelle text, OUT motif text
) AS $$
DECLARE
  v_unite record;
  v_base numeric;
  v_grille record;
  v_ligne record;
  v_qte_base numeric;
BEGIN
  SELECT u.nom_unite, u.coefficient AS coef, u.prix_vente_suggere INTO v_unite
  FROM public.produit_unites u WHERE u.id = p_unite AND u.produit_id = p_produit;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conditionnement inconnu pour cet article.';
  END IF;
  coefficient := v_unite.coef;
  libelle := v_unite.nom_unite || ' (' || regexp_replace(v_unite.coef::text, '\.?0+$', '') || ')';
  v_qte_base := GREATEST(p_quantite_unite, 1) * v_unite.coef;

  SELECT prix_vente INTO v_base FROM public.produits WHERE id = p_produit;
  IF COALESCE(v_unite.prix_vente_suggere, 0) > 0 THEN
    prix_unite := v_unite.prix_vente_suggere;
    motif := 'Prix ' || v_unite.nom_unite;
  ELSE
    prix_unite := round(COALESCE(v_base, 0) * v_unite.coef);
    motif := 'Prix catalogue';
  END IF;

  IF p_grille IS NULL THEN
    RETURN;
  END IF;
  SELECT nom, remise_globale_pourcentage INTO v_grille FROM public.grilles_tarifaires WHERE id = p_grille;
  SELECT prix_specifique, remise_pourcentage INTO v_ligne
  FROM public.grille_tarifaire_lignes
  WHERE grille_id = p_grille AND produit_id = p_produit AND quantite_min <= v_qte_base
  ORDER BY quantite_min DESC
  LIMIT 1;

  IF FOUND AND COALESCE(v_ligne.prix_specifique, 0) > 0 THEN
    prix_unite := round(v_ligne.prix_specifique * v_unite.coef);
    motif := 'Grille ' || v_grille.nom || ' (prix négocié)';
  ELSIF FOUND AND COALESCE(v_ligne.remise_pourcentage, 0) > 0 THEN
    prix_unite := round(prix_unite * (1 - v_ligne.remise_pourcentage / 100));
    motif := 'Grille ' || v_grille.nom || ' (-' || v_ligne.remise_pourcentage || ' %)';
  ELSIF COALESCE(v_grille.remise_globale_pourcentage, 0) > 0 THEN
    prix_unite := round(prix_unite * (1 - v_grille.remise_globale_pourcentage / 100));
    motif := 'Remise ' || v_grille.nom || ' (-' || v_grille.remise_globale_pourcentage || ' %)';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.prix_article_unite(uuid, uuid, numeric, uuid) FROM PUBLIC;

-- =============================================================================
-- 3. PRIX DU PANIER AVEC UNITÉS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tarifer_panier(p_client_id uuid, p_panier jsonb)
RETURNS jsonb AS $$
DECLARE
  v_entreprise uuid := public.current_entreprise_id();
  v_grille uuid;
  v_item jsonb;
  v_qte numeric;
  v_unite uuid;
  v_prix record;
  v_pu record;
  v_lignes jsonb := '[]'::jsonb;
  v_total numeric := 0;
BEGIN
  IF v_entreprise IS NULL THEN
    RAISE EXCEPTION 'Aucune entreprise active.';
  END IF;
  v_grille := public.grille_du_client(v_entreprise, p_client_id);

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_panier, '[]'::jsonb)) LOOP
    v_qte := GREATEST(COALESCE((v_item->>'quantite')::numeric, 1), 1);
    v_unite := NULLIF(v_item->>'unite_id', '')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.produits WHERE id = (v_item->>'produit_id')::uuid AND entreprise_id = v_entreprise) THEN
      CONTINUE;
    END IF;
    IF v_unite IS NULL THEN
      SELECT * INTO v_prix FROM public.prix_article((v_item->>'produit_id')::uuid, v_qte::integer, v_grille);
      v_lignes := v_lignes || jsonb_build_object('produit_id', v_item->>'produit_id', 'unite_id', NULL, 'prix', v_prix.prix, 'motif', v_prix.motif);
      v_total := v_total + v_qte * v_prix.prix;
    ELSE
      SELECT * INTO v_pu FROM public.prix_article_unite((v_item->>'produit_id')::uuid, v_unite, v_qte, v_grille);
      v_lignes := v_lignes || jsonb_build_object('produit_id', v_item->>'produit_id', 'unite_id', v_unite, 'prix', v_pu.prix_unite, 'motif', v_pu.motif, 'libelle_unite', v_pu.libelle);
      v_total := v_total + v_qte * v_pu.prix_unite;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('lignes', v_lignes, 'total', v_total);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 4. ENCAISSEMENT AVEC UNITÉS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.encaisser_vente_caisse(
  p_client_id uuid,
  p_client_walkin text,
  p_panier jsonb,
  p_paiements jsonb,
  p_vente_uuid uuid DEFAULT NULL,
  p_hors_ligne boolean DEFAULT false,
  p_note text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_entreprise uuid := public.current_entreprise_id();
  v_role text;
  v_ent record;
  v_grille uuid;
  v_item jsonb;
  v_pay jsonb;
  v_produit record;
  v_prix record;
  v_pu record;
  v_unite uuid;
  v_qte_saisie numeric;
  v_qte integer;
  v_prix_unite numeric;
  v_prix_base numeric;
  v_sous_total numeric;
  v_libelle text;
  v_motif text;
  v_lignes jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_paye numeric := 0;
  v_excedent numeric;
  v_rendu numeric := 0;
  v_montant numeric;
  v_ht numeric;
  v_tva numeric;
  v_numero text;
  v_cmd uuid;
  v_existante record;
  v_notes text[] := '{}';
  v_paiements jsonb := '[]'::jsonb;
  i integer;
BEGIN
  IF v_entreprise IS NULL THEN
    RAISE EXCEPTION 'Aucune entreprise active.';
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF NOT public.is_super_admin() AND COALESCE(v_role, '') NOT IN ('proprietaire', 'admin', 'gerant', 'gestionnaire', 'caissier', 'vendeur') THEN
    RAISE EXCEPTION 'Votre rôle ne permet pas d''encaisser des ventes.';
  END IF;
  SELECT tva_active, tva_taux, suspendue INTO v_ent FROM public.entreprises WHERE id = v_entreprise;
  IF v_ent.suspendue AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'L''accès de cette entreprise est suspendu.';
  END IF;

  IF p_vente_uuid IS NOT NULL THEN
    SELECT id, numero_document, montant_ht, montant_tva, montant_total INTO v_existante
    FROM public.commandes WHERE vente_uuid = p_vente_uuid AND entreprise_id = v_entreprise;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'commande_id', v_existante.id, 'numero_document', v_existante.numero_document,
        'montant_ht', v_existante.montant_ht, 'montant_tva', v_existante.montant_tva,
        'montant_total', v_existante.montant_total, 'deja_enregistree', true
      );
    END IF;
  END IF;

  IF jsonb_array_length(COALESCE(p_panier, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Le panier est vide.';
  END IF;
  IF p_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id AND entreprise_id = v_entreprise) THEN
    RAISE EXCEPTION 'Client introuvable.';
  END IF;
  v_grille := public.grille_du_client(v_entreprise, p_client_id);

  -- Prix et stock, article par article (stock toujours en unités de base)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_panier) LOOP
    v_qte_saisie := (v_item->>'quantite')::numeric;
    IF v_qte_saisie IS NULL OR v_qte_saisie <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide.';
    END IF;
    v_unite := NULLIF(v_item->>'unite_id', '')::uuid;
    SELECT id, nom, quantite INTO v_produit
    FROM public.produits
    WHERE id = (v_item->>'produit_id')::uuid AND entreprise_id = v_entreprise
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Article introuvable dans cette entreprise.';
    END IF;

    IF v_unite IS NULL THEN
      IF v_qte_saisie <> trunc(v_qte_saisie) THEN
        RAISE EXCEPTION 'Quantité invalide pour « % » : nombre entier attendu.', v_produit.nom;
      END IF;
      v_qte := v_qte_saisie::integer;
      SELECT * INTO v_prix FROM public.prix_article(v_produit.id, v_qte, v_grille);
      v_prix_unite := v_prix.prix;
      v_prix_base := v_prix.prix;
      v_libelle := NULL;
      v_motif := v_prix.motif;
    ELSE
      SELECT * INTO v_pu FROM public.prix_article_unite(v_produit.id, v_unite, v_qte_saisie, v_grille);
      IF v_qte_saisie * v_pu.coefficient <> trunc(v_qte_saisie * v_pu.coefficient) THEN
        RAISE EXCEPTION 'Quantité invalide pour « % » : le total en unités doit être un nombre entier.', v_produit.nom;
      END IF;
      v_qte := (v_qte_saisie * v_pu.coefficient)::integer;
      v_prix_unite := v_pu.prix_unite;
      v_prix_base := round(v_pu.prix_unite / v_pu.coefficient, 2);
      v_libelle := v_pu.libelle;
      v_motif := v_pu.motif;
    END IF;
    v_sous_total := v_qte_saisie * v_prix_unite;

    IF v_produit.quantite < v_qte THEN
      IF p_hors_ligne THEN
        v_notes := v_notes || ('Stock insuffisant pour ' || v_produit.nom || ' au moment de la synchronisation');
      ELSE
        RAISE EXCEPTION 'Stock insuffisant pour « % » (disponible : % unités, demandé : %)', v_produit.nom, v_produit.quantite, v_qte;
      END IF;
    END IF;

    v_lignes := v_lignes || jsonb_build_object(
      'produit_id', v_produit.id, 'nom', v_produit.nom, 'quantite', v_qte,
      'prix_unitaire', v_prix_base, 'sous_total', v_sous_total, 'motif', v_motif,
      'unite_id', v_unite, 'libelle_unite', v_libelle, 'quantite_unite', v_qte_saisie, 'prix_unite', v_prix_unite
    );
    v_total := v_total + v_sous_total;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Le montant total doit être supérieur à zéro.';
  END IF;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(p_paiements, '[]'::jsonb)) LOOP
    v_montant := COALESCE((v_pay->>'montant')::numeric, 0);
    IF v_montant > 0 THEN
      v_paiements := v_paiements || jsonb_build_object('mode', v_pay->>'mode', 'montant', v_montant, 'reference', NULLIF(trim(COALESCE(v_pay->>'reference', '')), ''));
      v_paye := v_paye + v_montant;
    END IF;
  END LOOP;

  v_excedent := v_paye - v_total;
  IF v_excedent > 0 THEN
    FOR i IN 0 .. jsonb_array_length(v_paiements) - 1 LOOP
      EXIT WHEN v_excedent <= 0;
      IF v_paiements->i->>'mode' = 'especes' THEN
        v_montant := LEAST(v_excedent, (v_paiements->i->>'montant')::numeric);
        v_paiements := jsonb_set(v_paiements, ARRAY[i::text, 'montant'], to_jsonb((v_paiements->i->>'montant')::numeric - v_montant));
        v_excedent := v_excedent - v_montant;
        v_rendu := v_rendu + v_montant;
      END IF;
    END LOOP;
    IF v_excedent > 0 THEN
      IF p_hors_ligne THEN
        v_notes := v_notes || ('Trop-perçu hors espèces de ' || v_excedent);
      ELSE
        RAISE EXCEPTION 'Le montant payé dépasse le total de la vente (% de trop, hors espèces).', v_excedent;
      END IF;
    END IF;
  ELSIF v_excedent < 0 THEN
    IF p_hors_ligne THEN
      v_notes := v_notes || ('Reste dû après synchronisation : ' || (-v_excedent));
    ELSE
      RAISE EXCEPTION 'Reste à payer : %', -v_excedent;
    END IF;
  END IF;

  IF v_ent.tva_active AND COALESCE(v_ent.tva_taux, 0) > 0 THEN
    v_ht := round(v_total / (1 + v_ent.tva_taux / 100), 2);
    v_tva := v_total - v_ht;
  ELSE
    v_ht := v_total;
    v_tva := 0;
  END IF;

  v_numero := public.next_numero_document_atomic(v_entreprise, 'facture');
  IF p_hors_ligne THEN
    v_notes := ARRAY['Vente hors ligne synchronisée'] || v_notes;
  END IF;

  INSERT INTO public.commandes (
    entreprise_id, type, client_id, client_walkin, statut, reference, numero_document, type_document,
    tva_taux, montant_ht, montant_tva, montant_total, note, vente_uuid
  ) VALUES (
    v_entreprise, 'vente', p_client_id,
    CASE WHEN p_client_id IS NULL THEN COALESCE(NULLIF(trim(COALESCE(p_client_walkin, '')), ''), 'Client comptoir') END,
    'recue', replace(v_numero, 'FAC', 'VEN'), v_numero, 'facture',
    CASE WHEN v_ent.tva_active THEN v_ent.tva_taux END, v_ht, v_tva, v_total,
    NULLIF(array_to_string(ARRAY[NULLIF(trim(COALESCE(p_note, '')), '')] || v_notes, ' — '), ''),
    p_vente_uuid
  ) RETURNING id INTO v_cmd;

  IF p_hors_ligne THEN
    PERFORM set_config('yos360.vente_hors_ligne', 'on', true);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_lignes) LOOP
    INSERT INTO public.commande_items (
      entreprise_id, commande_id, produit_id, quantite, prix_unitaire, sous_total,
      unite_id, libelle_unite, quantite_unite, prix_unite
    ) VALUES (
      v_entreprise, v_cmd, (v_item->>'produit_id')::uuid, (v_item->>'quantite')::integer,
      (v_item->>'prix_unitaire')::numeric, (v_item->>'sous_total')::numeric,
      NULLIF(v_item->>'unite_id', '')::uuid, v_item->>'libelle_unite',
      CASE WHEN v_item->>'unite_id' IS NOT NULL THEN (v_item->>'quantite_unite')::numeric END,
      CASE WHEN v_item->>'unite_id' IS NOT NULL THEN (v_item->>'prix_unite')::numeric END
    );
    INSERT INTO public.mouvements (entreprise_id, produit_id, type, quantite, motif, reference)
    VALUES (v_entreprise, (v_item->>'produit_id')::uuid, 'sortie', (v_item->>'quantite')::integer, 'Vente caisse ' || v_numero, v_numero);
  END LOOP;

  PERFORM set_config('yos360.vente_hors_ligne', 'off', true);

  FOR v_pay IN SELECT * FROM jsonb_array_elements(v_paiements) LOOP
    IF (v_pay->>'montant')::numeric > 0 THEN
      INSERT INTO public.paiements (entreprise_id, commande_id, client_id, sens, montant, mode, reference, note)
      VALUES (v_entreprise, v_cmd, p_client_id, 'encaissement', (v_pay->>'montant')::numeric, v_pay->>'mode', v_pay->>'reference', 'Vente caisse ' || v_numero);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'commande_id', v_cmd,
    'numero_document', v_numero,
    'montant_ht', v_ht,
    'montant_tva', v_tva,
    'montant_total', v_total,
    'montant_paye', v_paye - v_rendu,
    'rendu', v_rendu,
    'lignes', v_lignes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 5. CONTRÔLE « SOUS LE TARIF » : TENIR COMPTE DE L'UNITÉ VENDUE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.controler_prix_vente()
RETURNS trigger AS $$
DECLARE
  v_cmd record;
  v_grille uuid;
  v_prix record;
  v_pu record;
  v_attendu numeric;
  v_motif text;
  v_role text;
  v_devise text;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(current_setting('yos360.vente_hors_ligne', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  SELECT type, type_document, client_id INTO v_cmd FROM public.commandes WHERE id = NEW.commande_id;
  IF v_cmd.type IS DISTINCT FROM 'vente' OR v_cmd.type_document = 'avoir' THEN
    RETURN NEW;
  END IF;

  v_grille := public.grille_du_client(NEW.entreprise_id, v_cmd.client_id);
  IF NEW.unite_id IS NOT NULL THEN
    -- Prix attendu par unité de base = prix du conditionnement ÷ nombre d'unités
    SELECT * INTO v_pu FROM public.prix_article_unite(NEW.produit_id, NEW.unite_id, COALESCE(NEW.quantite_unite, 1), v_grille);
    v_attendu := v_pu.prix_unite / v_pu.coefficient;
    v_motif := v_pu.motif || ', ' || v_pu.libelle;
  ELSE
    SELECT * INTO v_prix FROM public.prix_article(NEW.produit_id, NEW.quantite, v_grille);
    v_attendu := v_prix.prix;
    v_motif := v_prix.motif;
  END IF;

  -- Tolérance d'un centime : le prix par unité de base d'un conditionnement est arrondi
  IF NEW.prix_unitaire + 0.01 >= v_attendu THEN
    RETURN NEW;
  END IF;

  IF public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IN ('proprietaire', 'admin', 'gerant') THEN
    RETURN NEW;
  END IF;

  SELECT CASE WHEN devise = 'XOF' THEN 'FCFA' ELSE devise END INTO v_devise FROM public.entreprises WHERE id = NEW.entreprise_id;
  RAISE EXCEPTION 'Prix refusé : % % est sous le tarif de cet article pour ce client (% %, %). Un gérant ou un administrateur doit valider ce prix.',
    round(NEW.prix_unitaire), COALESCE(v_devise, 'FCFA'), round(v_attendu), COALESCE(v_devise, 'FCFA'), v_motif;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_controler_prix_vente ON public.commande_items;
CREATE TRIGGER trg_controler_prix_vente
  BEFORE INSERT OR UPDATE OF prix_unitaire, produit_id, quantite, unite_id ON public.commande_items
  FOR EACH ROW EXECUTE FUNCTION public.controler_prix_vente();
