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
