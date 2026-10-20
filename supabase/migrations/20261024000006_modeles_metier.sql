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
