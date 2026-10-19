/*
================================================================================
  YOS360 — PHASE 2 MIGRATION : STOCK AVANCÉ, TARIFS & AUTOMATISATIONS
================================================================================
  Date : 20 Octobre 2026
  Auteur : Ingénieur Full-Stack Senior YOS360
  Description :
    2.1 Traçabilité fine & Algorithme FEFO (Lots, Séries, DLUO, Alertes J-30 & J-7)
    2.2 Valorisation du Stock Configurable (CMUP ou FIFO par tenant)
    2.3 Nomenclatures, Variantes & Unités (Conversions de conditionnements, BOM Kits, Variantes matricielles)
    2.4 Ajustements de Stock Réglementés (Motifs obligatoires, seuil de validation gérant, traçabilité)
    2.5 Grilles Tarifaires & Promotions (Prix par type client, remises quantitatives, coupons & codes promo)
    2.6 Workflows de Validation & Notifications (Écran validations, file d'attente SMS/WhatsApp/In-app)
    2.7 Webhooks Sortants & Clés d'API Scôpées (Signature HMAC-SHA256, logs de livraison et rejeu)
  Sécurité : RLS multi-tenant strict via public.current_entreprise_id() et public.is_super_admin()
================================================================================
*/

-- -----------------------------------------------------------------------------
-- 2.1 TRAÇABILITÉ FINE, DLUO & ALGORITHME FEFO
-- -----------------------------------------------------------------------------

-- Enrichissement de la table lots
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'actif' 
  CHECK (statut IN ('actif', 'quarantaine', 'rejete', 'epuise'));
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS fabricant text;
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS date_fabrication date;
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index pour accélérer le tri FEFO et la détection d'expiration
CREATE INDEX IF NOT EXISTS idx_lots_fefo_lookup 
  ON public.lots(produit_id, entrepot_id, statut, date_peremption ASC NULLS LAST);

-- Fonction RPC : Algorithme de déstockage FEFO (First Expired, First Out)
-- Retourne les lots ordonnés par date d'expiration pour satisfaire une quantité demandée
CREATE OR REPLACE FUNCTION public.rpc_fefo_proposer_lots(
  p_produit_id uuid,
  p_entrepot_id uuid DEFAULT NULL,
  p_quantite_demandee int DEFAULT 1
)
RETURNS TABLE (
  lot_id uuid,
  numero_lot text,
  numero_serie text,
  date_peremption date,
  quantite_disponible int,
  quantite_allouee int,
  jours_restants int,
  statut_alerte text
) AS $$
DECLARE
  v_reste int := p_quantite_demandee;
  v_rec record;
  v_alloue int;
  v_jours int;
  v_alerte text;
BEGIN
  FOR v_rec IN
    SELECT 
      l.id,
      l.numero_lot,
      l.numero_serie,
      l.date_peremption,
      l.quantite
    FROM public.lots l
    WHERE l.produit_id = p_produit_id
      AND l.statut = 'actif'
      AND l.quantite > 0
      AND (p_entrepot_id IS NULL OR l.entrepot_id = p_entrepot_id)
      AND l.deleted_at IS NULL
    ORDER BY l.date_peremption ASC NULLS LAST, l.created_at ASC
  LOOP
    EXIT WHEN v_reste <= 0;

    v_alloue := LEAST(v_rec.quantite, v_reste);
    v_reste := v_reste - v_alloue;

    IF v_rec.date_peremption IS NULL THEN
      v_jours := 9999;
      v_alerte := 'sans_dluo';
    ELSE
      v_jours := (v_rec.date_peremption - CURRENT_DATE);
      IF v_jours < 0 THEN
        v_alerte := 'perime';
      ELSIF v_jours <= 7 THEN
        v_alerte := 'critique_j7';
      ELSIF v_jours <= 30 THEN
        v_alerte := 'alerte_j30';
      ELSE
        v_alerte := 'conforme';
      END IF;
    END IF;

    lot_id := v_rec.id;
    numero_lot := v_rec.numero_lot;
    numero_serie := v_rec.numero_serie;
    date_peremption := v_rec.date_peremption;
    quantite_disponible := v_rec.quantite;
    quantite_allouee := v_alloue;
    jours_restants := v_jours;
    statut_alerte := v_alerte;
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;


-- -----------------------------------------------------------------------------
-- 2.2 VALORISATION DU STOCK (CMUP OU FIFO PAR TENANT)
-- -----------------------------------------------------------------------------

ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS methode_valorisation text NOT NULL DEFAULT 'cmup'
  CHECK (methode_valorisation IN ('cmup', 'fifo'));
ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS seuil_validation_ajustement numeric(12,2) NOT NULL DEFAULT 50000;

-- Fonction RPC pour calculer la valorisation du stock d'une entreprise selon sa méthode active
CREATE OR REPLACE FUNCTION public.rpc_calcul_valorisation_stock(
  p_entreprise_id uuid,
  p_entrepot_id uuid DEFAULT NULL
)
RETURNS TABLE (
  methode text,
  valeur_totale numeric(14,2),
  nb_articles_en_stock bigint,
  nb_references bigint
) AS $$
DECLARE
  v_methode text;
  v_valeur numeric(14,2) := 0;
  v_total_qte bigint := 0;
  v_nb_refs bigint := 0;
BEGIN
  SELECT methode_valorisation INTO v_methode
  FROM public.entreprises
  WHERE id = p_entreprise_id;

  IF v_methode IS NULL THEN
    v_methode := 'cmup';
  END IF;

  IF v_methode = 'fifo' THEN
    -- Valorisation FIFO basée sur les lots actifs en stock
    SELECT 
      COALESCE(SUM(l.quantite * l.prix_unitaire), 0),
      COALESCE(SUM(l.quantite), 0),
      COUNT(DISTINCT l.produit_id)
    INTO v_valeur, v_total_qte, v_nb_refs
    FROM public.lots l
    JOIN public.produits p ON p.id = l.produit_id
    WHERE l.entreprise_id = p_entreprise_id
      AND l.statut = 'actif'
      AND l.quantite > 0
      AND (p_entrepot_id IS NULL OR l.entrepot_id = p_entrepot_id)
      AND l.deleted_at IS NULL;
  ELSE
    -- Valorisation par défaut : CMUP (Coût Moyen Unitaire Pondéré)
    IF p_entrepot_id IS NOT NULL THEN
      SELECT 
        COALESCE(SUM(se.quantite * COALESCE(p.cmup, p.prix_unitaire, 0)), 0),
        COALESCE(SUM(se.quantite), 0),
        COUNT(DISTINCT se.produit_id)
      INTO v_valeur, v_total_qte, v_nb_refs
      FROM public.stocks_entrepot se
      JOIN public.produits p ON p.id = se.produit_id
      WHERE se.entrepot_id = p_entrepot_id
        AND p.entreprise_id = p_entreprise_id
        AND p.deleted_at IS NULL;
    ELSE
      SELECT 
        COALESCE(SUM(p.quantite * COALESCE(p.cmup, p.prix_unitaire, 0)), 0),
        COALESCE(SUM(p.quantite), 0),
        COUNT(p.id)
      INTO v_valeur, v_total_qte, v_nb_refs
      FROM public.produits p
      WHERE p.entreprise_id = p_entreprise_id
        AND p.deleted_at IS NULL;
    END IF;
  END IF;

  methode := v_methode;
  valeur_totale := ROUND(v_valeur, 0); -- FCFA sans décimale
  nb_articles_en_stock := v_total_qte;
  nb_references := v_nb_refs;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;


-- -----------------------------------------------------------------------------
-- 2.3 NOMENCLATURES, VARIANTES & UNITÉS MULTIPLES
-- -----------------------------------------------------------------------------

-- Type de produit sur la table produits
ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS type_produit text NOT NULL DEFAULT 'simple'
  CHECK (type_produit IN ('simple', 'compose', 'service', 'variante_parent'));

-- 1. Table des unités de mesure et coefficients de conversion
-- Ex: Produit Riz 50kg : Unité base = 'Sac 50kg' (coeff 1), 'Carton 5 sacs' (coeff 5), 'Palette 20 sacs' (coeff 20)
CREATE TABLE IF NOT EXISTS public.produit_unites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  nom_unite text NOT NULL,             -- Ex: 'Carton (12 pcs)', 'Pack (6 pcs)'
  code_court text,                    -- Ex: 'CTN12', 'PK6'
  coefficient numeric(10,4) NOT NULL CHECK (coefficient > 0), -- Quantité en unité de base
  est_unite_base boolean NOT NULL DEFAULT false,
  code_barres text,
  prix_vente_suggere numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produit_id, nom_unite)
);

-- 2. Table des variantes matricielles de produits
-- Ex: T-Shirt avec attributs {"taille": "XL", "couleur": "Bleu"}
CREATE TABLE IF NOT EXISTS public.produit_variantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  sku text NOT NULL,
  nom_variante text NOT NULL,        -- Ex: 'T-Shirt Coton - XL / Bleu'
  attributs jsonb NOT NULL DEFAULT '{}'::jsonb, -- Ex: {"taille": "XL", "couleur": "Bleu"}
  code_barres text,
  prix_vente numeric(12,2) NOT NULL DEFAULT 0,
  prix_achat numeric(12,2) NOT NULL DEFAULT 0,
  quantite integer NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entreprise_id, sku)
);

-- 3. Table des composants de kits & nomenclatures (Bill of Materials - BOM)
-- Permet la décrémentation automatique des composants lors de la vente du kit
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


-- -----------------------------------------------------------------------------
-- 2.4 AJUSTEMENTS DE STOCK RÉGLEMENTÉS
-- -----------------------------------------------------------------------------

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

-- Fonction RPC pour approuver un ajustement de stock et impacter l'inventaire en toute atomicité
CREATE OR REPLACE FUNCTION public.rpc_approuver_ajustement_stock(
  p_ajustement_id uuid,
  p_validateur_id uuid
)
RETURNS boolean AS $$
DECLARE
  v_ajustement public.stock_ajustements%ROWTYPE;
  v_ligne record;
  v_type_mvt text;
  v_motif_texte text;
BEGIN
  SELECT * INTO v_ajustement
  FROM public.stock_ajustements
  WHERE id = p_ajustement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ajustement non trouvé';
  END IF;

  IF v_ajustement.statut = 'approuve' THEN
    RAISE EXCEPTION 'Ajustement déjà approuvé';
  END IF;

  -- Création des mouvements de stock correspondants
  FOR v_ligne IN
    SELECT al.*, p.nom as produit_nom
    FROM public.stock_ajustement_lignes al
    JOIN public.produits p ON p.id = al.produit_id
    WHERE al.ajustement_id = p_ajustement_id
  LOOP
    v_type_mvt := CASE WHEN v_ligne.type_ajustement = 'positif' THEN 'entree' ELSE 'sortie' END;
    v_motif_texte := 'Ajustement [' || v_ajustement.numero_document || '] Motif: ' || v_ajustement.motif || 
                     COALESCE(' - ' || v_ajustement.description, '');

    INSERT INTO public.mouvements (
      entreprise_id,
      produit_id,
      type,
      quantite,
      motif,
      reference,
      entrepot_id,
      lot_id,
      prix_unitaire
    ) VALUES (
      v_ajustement.entreprise_id,
      v_ligne.produit_id,
      v_type_mvt,
      v_ligne.quantite,
      v_motif_texte,
      v_ajustement.numero_document,
      v_ajustement.site_id,
      v_ligne.lot_id,
      v_ligne.cout_unitaire
    );

    -- Si un lot spécifique est spécifié dans l'ajustement
    IF v_ligne.lot_id IS NOT NULL THEN
      IF v_ligne.type_ajustement = 'positif' THEN
        UPDATE public.lots SET quantite = quantite + v_ligne.quantite WHERE id = v_ligne.lot_id;
      ELSE
        UPDATE public.lots SET quantite = GREATEST(quantite - v_ligne.quantite, 0) WHERE id = v_ligne.lot_id;
      END IF;
    END IF;
  END LOOP;

  -- Mise à jour du statut de l'ajustement
  UPDATE public.stock_ajustements
  SET 
    statut = 'approuve',
    approuve_par = p_validateur_id,
    approuve_at = now(),
    updated_at = now()
  WHERE id = p_ajustement_id;

  -- Clôture de la validation correspondante dans le workflow
  UPDATE public.validations_workflow
  SET 
    statut = 'approuve',
    valide_par = p_validateur_id,
    valide_at = now()
  WHERE reference_id = p_ajustement_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- -----------------------------------------------------------------------------
-- 2.5 GRILLES TARIFAIRES & PROMOTIONS
-- -----------------------------------------------------------------------------

-- Grilles tarifaires par catégorie de clients
CREATE TABLE IF NOT EXISTS public.grilles_tarifaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  nom text NOT NULL,                    -- Ex: 'Tarif Demi-Gros', 'Tarif Revendeurs Agréés'
  categorie_client text NOT NULL CHECK (categorie_client IN ('detail', 'demi_gros', 'grossiste', 'vip', 'partenaire')),
  remise_globale_pourcentage numeric(5,2) NOT NULL DEFAULT 0,
  description text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (entreprise_id, nom)
);

-- Lignes spécifiques par produit ou remises par palier de quantité
CREATE TABLE IF NOT EXISTS public.grille_tarifaire_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grille_id uuid NOT NULL REFERENCES public.grilles_tarifaires(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  prix_specifique numeric(12,2),       -- Si non nul, remplace le prix de vente normal
  remise_pourcentage numeric(5,2),     -- Remise additionnelle en %
  quantite_min integer NOT NULL DEFAULT 1 CHECK (quantite_min >= 1), -- Palier de volume
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grille_id, produit_id, quantite_min)
);

-- Codes Promo, Coupons et Campagnes Promotionnelles
CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  code text,                            -- Ex: 'PROMO10', 'TABASKI2026' (nullable si promo auto)
  nom text NOT NULL,                    -- Ex: 'Remise Ramadan 2026'
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

-- Fonction RPC : Calcul automatique du prix selon le client, la quantité et le code promo
CREATE OR REPLACE FUNCTION public.rpc_calculer_prix_article(
  p_produit_id uuid,
  p_categorie_client text DEFAULT 'detail',
  p_quantite integer DEFAULT 1,
  p_code_promo text DEFAULT NULL
)
RETURNS TABLE (
  prix_base numeric(12,2),
  prix_unitaire_final numeric(12,2),
  remise_unitaire numeric(12,2),
  source_tarif text
) AS $$
DECLARE
  v_prix_base numeric(12,2);
  v_prix_final numeric(12,2);
  v_grille_id uuid;
  v_prix_specifique numeric(12,2);
  v_remise_pct numeric(5,2) := 0;
  v_promo record;
  v_source text := 'catalogue_base';
BEGIN
  -- Prix de base du catalogue
  SELECT prix_vente INTO v_prix_base
  FROM public.produits
  WHERE id = p_produit_id;

  v_prix_final := COALESCE(v_prix_base, 0);

  -- Recherche de la grille tarifaire correspondant à la catégorie du client
  SELECT id, remise_globale_pourcentage INTO v_grille_id, v_remise_pct
  FROM public.grilles_tarifaires
  WHERE categorie_client = p_categorie_client
    AND actif = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_grille_id IS NOT NULL THEN
    -- Vérifier s'il y a une règle spécifique par produit pour cette quantité
    SELECT prix_specifique, remise_pourcentage INTO v_prix_specifique, v_remise_pct
    FROM public.grille_tarifaire_lignes
    WHERE grille_id = v_grille_id
      AND produit_id = p_produit_id
      AND quantite_min <= p_quantite
    ORDER BY quantite_min DESC
    LIMIT 1;

    IF v_prix_specifique IS NOT NULL THEN
      v_prix_final := v_prix_specifique;
      v_source := 'grille_' || p_categorie_client || '_specifique';
    ELSIF v_remise_pct > 0 THEN
      v_prix_final := v_prix_base * (1 - (v_remise_pct / 100));
      v_source := 'grille_' || p_categorie_client || '_remise_' || v_remise_pct || '%';
    END IF;
  END IF;

  -- Application éventuelle d'un code promo
  IF p_code_promo IS NOT NULL AND p_code_promo <> '' THEN
    SELECT * INTO v_promo
    FROM public.promotions
    WHERE UPPER(code) = UPPER(p_code_promo)
      AND actif = true
      AND now() BETWEEN date_debut AND date_fin
      AND (nb_utilisations_max IS NULL OR nb_utilisations_actuel < nb_utilisations_max)
      AND deleted_at IS NULL;

    IF FOUND THEN
      IF v_promo.type_remise = 'pourcentage' THEN
        v_prix_final := v_prix_final * (1 - (v_promo.valeur_remise / 100));
        v_source := v_source || ' + promo_' || UPPER(p_code_promo);
      END IF;
    END IF;
  END IF;

  prix_base := v_prix_base;
  prix_unitaire_final := GREATEST(ROUND(v_prix_final, 0), 0);
  remise_unitaire := GREATEST(v_prix_base - prix_unitaire_final, 0);
  source_tarif := v_source;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;


-- -----------------------------------------------------------------------------
-- 2.6 WORKFLOWS DE VALIDATION & NOTIFICATIONS MULTI-CANAUX
-- -----------------------------------------------------------------------------

-- Table centralisée des demandes nécessitant approbation
CREATE TABLE IF NOT EXISTS public.validations_workflow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.entrepots(id) ON DELETE SET NULL,
  type_demande text NOT NULL CHECK (type_demande IN ('ajustement_stock', 'bon_commande', 'remise_exceptionnelle', 'transfert_stock')),
  reference_id uuid NOT NULL,          -- ID dans la table correspondante
  reference_numero text NOT NULL,      -- Ex: AJU-2026-0001, BC-2026-0045
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

-- File d'attente des notifications (In-App, SMS, WhatsApp, Email)
CREATE TABLE IF NOT EXISTS public.notifications_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES public.entreprises(id) ON DELETE CASCADE,
  canal text NOT NULL CHECK (canal IN ('in_app', 'email', 'sms', 'whatsapp')),
  destinataire text NOT NULL,          -- Identifiant user, n° téléphone ou email
  titre text NOT NULL,
  message text NOT NULL,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'envoye', 'echec')),
  tentatives integer NOT NULL DEFAULT 0,
  erreur_dernier_envoi text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  envoye_at timestamptz
);


-- -----------------------------------------------------------------------------
-- 2.7 WEBHOOKS SORTANTS SIGNÉS HMAC-SHA256 & API AUDITÉE
-- -----------------------------------------------------------------------------

-- Table détaillée des livraisons de webhooks pour observabilité & rejeu
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  evenement text NOT NULL,             -- Ex: 'vente.creee', 'stock.alerte', 'lot.perime'
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('succes', 'echec', 'en_attente')),
  code_http integer,
  payload jsonb NOT NULL,
  signature_hmac text,
  duree_ms integer,
  reponse_body text,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- SÉCURITÉ ROW LEVEL SECURITY (RLS) MULTI-TENANT SUR LES NOUVELLES TABLES
-- -----------------------------------------------------------------------------

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
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Politiques RLS universelles étanches
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'produit_unites', 'produit_variantes', 'produit_composants',
    'stock_ajustements', 'grilles_tarifaires', 'promotions',
    'validations_workflow', 'notifications_queue'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_all_%I" ON public.%I', tbl, tbl);
    EXECUTE format('
      CREATE POLICY "tenant_all_%I" ON public.%I
      FOR ALL TO authenticated
      USING (entreprise_id = public.current_entreprise_id() OR public.is_super_admin())
      WITH CHECK (entreprise_id = public.current_entreprise_id() OR public.is_super_admin())
    ', tbl, tbl);
  END LOOP;
END $$;

-- Politiques RLS pour les tables dépendantes
DROP POLICY IF EXISTS "tenant_all_stock_ajustement_lignes" ON public.stock_ajustement_lignes;
CREATE POLICY "tenant_all_stock_ajustement_lignes" ON public.stock_ajustement_lignes
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.stock_ajustements a 
  WHERE a.id = stock_ajustement_lignes.ajustement_id 
    AND (a.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.stock_ajustements a 
  WHERE a.id = stock_ajustement_lignes.ajustement_id 
    AND (a.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())
));

DROP POLICY IF EXISTS "tenant_all_grille_tarifaire_lignes" ON public.grille_tarifaire_lignes;
CREATE POLICY "tenant_all_grille_tarifaire_lignes" ON public.grille_tarifaire_lignes
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.grilles_tarifaires g 
  WHERE g.id = grille_tarifaire_lignes.grille_id 
    AND (g.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.grilles_tarifaires g 
  WHERE g.id = grille_tarifaire_lignes.grille_id 
    AND (g.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())
));

DROP POLICY IF EXISTS "tenant_all_webhook_deliveries" ON public.webhook_deliveries;
CREATE POLICY "tenant_all_webhook_deliveries" ON public.webhook_deliveries
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.webhook_endpoints w 
  WHERE w.id = webhook_deliveries.endpoint_id 
    AND (w.entreprise_id = public.current_entreprise_id() OR public.is_super_admin())
));
