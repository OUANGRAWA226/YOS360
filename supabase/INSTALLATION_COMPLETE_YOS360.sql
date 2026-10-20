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


