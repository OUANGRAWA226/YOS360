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
