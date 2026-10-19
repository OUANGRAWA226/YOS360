/*
# Migration Corrective : Sécurité RLS, Isolation Multi-Tenant & Encaissement Atomique Caisse

Cette migration corrige :
1. Faille d'élévation de privilèges sur `profiles` (seul un admin peut modifier role, super_admin, entreprise_id).
2. Suppression de profil non autorisée.
3. Ajout de `entreprise_id` sur `api_keys` et `webhook_endpoints` pour sceller les fuites multi-tenants.
4. Générateur atomique et concurrent de numéros de documents légaux (document_counters).
5. Procédure stockée transactionnelle `encaisser_vente_pos` garantissant l'intégrité commande/stock/paiement.
*/

-- ============================================================
-- 1. SÉCURITÉ SUR LES PROFILS (ANTI-ÉLÉVATION DE PRIVILÈGES)
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger AS $$
BEGIN
  -- Si appel système interne sans utilisateur authentifié, autoriser
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Si l'utilisateur n'est PAS admin, il ne peut pas modifier ses privilèges
  IF NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Seul un administrateur peut modifier le rôle d''un profil utilisateur.';
    END IF;
    IF NEW.super_admin IS DISTINCT FROM OLD.super_admin THEN
      RAISE EXCEPTION 'Seul un administrateur peut modifier le privilège super_admin.';
    END IF;
    -- Un utilisateur standard ne peut pas changer arbitrairement d'entreprise
    IF NEW.entreprise_id IS DISTINCT FROM OLD.entreprise_id AND NOT COALESCE(OLD.super_admin, false) THEN
      RAISE EXCEPTION 'Vous ne pouvez pas modifier votre entreprise de rattachement.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON profiles;
CREATE TRIGGER trg_prevent_profile_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Révocation de la politique permettant à n'importe qui de supprimer son profil
DROP POLICY IF EXISTS "admin_delete_profiles" ON profiles;
CREATE POLICY "admin_delete_profiles" ON profiles FOR DELETE
  TO authenticated USING (public.is_admin());


-- ============================================================
-- 2. ISOLATION MULTI-TENANT SUR API KEYS & WEBHOOKS
-- ============================================================

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);

-- Backfill sur l'entreprise initiale pour les clés existantes
DO $$
DECLARE
  v_first_ent uuid;
BEGIN
  SELECT id INTO v_first_ent FROM entreprises ORDER BY created_at LIMIT 1;
  IF v_first_ent IS NOT NULL THEN
    UPDATE api_keys SET entreprise_id = v_first_ent WHERE entreprise_id IS NULL;
    UPDATE webhook_endpoints SET entreprise_id = v_first_ent WHERE entreprise_id IS NULL;
  END IF;
END $$;

-- Triggers d'attribution automatique de l'entreprise courante
DROP TRIGGER IF EXISTS trg_ent_api_keys ON api_keys;
CREATE TRIGGER trg_ent_api_keys
  BEFORE INSERT ON api_keys
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();

DROP TRIGGER IF EXISTS trg_ent_webhook_endpoints ON webhook_endpoints;
CREATE TRIGGER trg_ent_webhook_endpoints
  BEFORE INSERT ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();

-- Politiques RLS cloisonnées par entreprise
DROP POLICY IF EXISTS "api_keys_tenant_select" ON api_keys;
CREATE POLICY "api_keys_tenant_select" ON api_keys FOR SELECT
  TO authenticated USING (entreprise_id = current_entreprise_id() OR is_admin());

DROP POLICY IF EXISTS "api_keys_tenant_all" ON api_keys;
CREATE POLICY "api_keys_tenant_all" ON api_keys FOR ALL
  TO authenticated
  USING (entreprise_id = current_entreprise_id() OR is_admin())
  WITH CHECK (entreprise_id = current_entreprise_id() OR is_admin());

DROP POLICY IF EXISTS "webhooks_tenant_select" ON webhook_endpoints;
CREATE POLICY "webhooks_tenant_select" ON webhook_endpoints FOR SELECT
  TO authenticated USING (entreprise_id = current_entreprise_id() OR is_admin());

DROP POLICY IF EXISTS "webhooks_tenant_all" ON webhook_endpoints;
CREATE POLICY "webhooks_tenant_all" ON webhook_endpoints FOR ALL
  TO authenticated
  USING (entreprise_id = current_entreprise_id() OR is_admin())
  WITH CHECK (entreprise_id = current_entreprise_id() OR is_admin());


-- ============================================================
-- 3. NUMÉROTATION SÉQUENTIELLE CONCURRENTE & ATOMIQUE
-- ============================================================

CREATE TABLE IF NOT EXISTS document_counters (
  entreprise_id uuid NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  type_document text NOT NULL,
  annee integer NOT NULL,
  compteur integer NOT NULL DEFAULT 0,
  PRIMARY KEY (entreprise_id, type_document, annee)
);

ALTER TABLE document_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_counters" ON document_counters;
CREATE POLICY "tenant_counters" ON document_counters FOR ALL TO authenticated
  USING (entreprise_id = current_entreprise_id() OR is_admin())
  WITH CHECK (entreprise_id = current_entreprise_id() OR is_admin());

-- Fonction de génération atomique du numéro
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

  INSERT INTO document_counters (entreprise_id, type_document, annee, compteur)
  VALUES (p_entreprise_id, p_type, v_year, 1)
  ON CONFLICT (entreprise_id, type_document, annee)
  DO UPDATE SET compteur = document_counters.compteur + 1
  RETURNING compteur INTO v_count;

  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_count::text, 4, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================
-- 4. PROCÉDURE STOCKÉE ATOMIQUE D'ENCAISSEMENT POS (CAISSE)
-- ============================================================

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
  v_ent_id := current_entreprise_id();
  IF v_ent_id IS NULL THEN
    RAISE EXCEPTION 'Aucune entreprise active identifiée pour l''utilisateur.';
  END IF;

  IF jsonb_array_length(p_panier) = 0 THEN
    RAISE EXCEPTION 'Le panier est vide.';
  END IF;

  -- 1. Vérification des stocks sous verrouillage (FOR UPDATE) et calcul du total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_panier)
  LOOP
    v_prod_id := (v_item->>'produit_id')::uuid;
    v_qte := (v_item->>'quantite')::int;
    v_prix := (v_item->>'prix_vente')::numeric;

    IF v_qte <= 0 THEN
      RAISE EXCEPTION 'Quantité invalide pour un article du panier : %', v_qte;
    END IF;

    SELECT quantite, nom INTO v_stock_actuel, v_prod_nom
    FROM produits
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

  -- Calcul TVA et HT
  IF p_tva_active AND p_tva_taux > 0 THEN
    v_ht := ROUND(v_total / (1 + (p_tva_taux / 100)), 2);
    v_tva := v_total - v_ht;
  ELSE
    v_ht := v_total;
    v_tva := 0;
  END IF;

  -- Rendu de monnaie pour espèces
  IF p_mode_paiement = 'especes' THEN
    v_rendu := GREATEST(COALESCE(p_montant_recu, 0) - v_total, 0);
  ELSE
    v_rendu := 0;
  END IF;
  v_statut := 'recue';

  -- Génération atomique du numéro de facture
  v_numero_doc := next_numero_document_atomic(v_ent_id, 'facture');

  -- 2. Création de la commande
  INSERT INTO commandes (
    entreprise_id,
    type,
    client_id,
    client_walkin,
    statut,
    reference,
    numero_document,
    type_document,
    tva_taux,
    montant_ht,
    montant_tva,
    montant_total,
    note
  ) VALUES (
    v_ent_id,
    'vente',
    p_client_id,
    CASE WHEN p_client_id IS NULL THEN COALESCE(NULLIF(TRIM(p_client_walkin), ''), 'Client comptoir') ELSE NULL END,
    v_statut,
    REPLACE(v_numero_doc, 'FAC', 'VEN'),
    v_numero_doc,
    'facture',
    CASE WHEN p_tva_active THEN p_tva_taux ELSE NULL END,
    v_ht,
    v_tva,
    v_total,
    CASE WHEN p_mode_paiement <> 'especes'
      THEN 'Paiement ' || p_mode_paiement || COALESCE(' — réf ' || NULLIF(TRIM(p_reference), ''), '')
      ELSE NULL END
  ) RETURNING id INTO v_cmd_id;

  -- 3. Insertion des lignes de commande et des mouvements de stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_panier)
  LOOP
    v_prod_id := (v_item->>'produit_id')::uuid;
    v_qte := (v_item->>'quantite')::int;
    v_prix := (v_item->>'prix_vente')::numeric;

    INSERT INTO commande_items (
      entreprise_id,
      commande_id,
      produit_id,
      quantite,
      prix_unitaire,
      sous_total
    ) VALUES (
      v_ent_id,
      v_cmd_id,
      v_prod_id,
      v_qte,
      v_prix,
      v_qte * v_prix
    );

    INSERT INTO mouvements (
      entreprise_id,
      produit_id,
      type,
      quantite,
      motif,
      reference
    ) VALUES (
      v_ent_id,
      v_prod_id,
      'sortie',
      v_qte,
      'Vente comptoir ' || v_numero_doc,
      v_numero_doc
    );
  END LOOP;

  -- 4. Enregistrement du paiement
  INSERT INTO paiements (
    entreprise_id,
    commande_id,
    client_id,
    sens,
    montant,
    mode,
    reference,
    note
  ) VALUES (
    v_ent_id,
    v_cmd_id,
    p_client_id,
    'encaissement',
    v_total,
    p_mode_paiement,
    NULLIF(TRIM(p_reference), ''),
    'Vente caisse'
  );

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
