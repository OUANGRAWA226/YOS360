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
