/*
# Multi-entreprises — partie 1 : table entreprises, modules, rattachement des profils

## 1. Nouvelles tables
- `entreprises` : remplace le singleton. Chaque ligne est une entreprise cliente avec
  ses informations (nom, logo, TVA, devise...), sa liste de modules activés (`modules text[]`)
  et un statut actif. La liste des modules contrôle les fonctionnalités visibles par
  l'entreprise dans le menu (ex. un maquis sans transferts d'entrepôt).

## 2. Colonnes ajoutées
- `profiles.entreprise_id` (uuid, nullable) : entreprise active de l'utilisateur.
  Rattaché automatiquement à la première entreprise si null (trigger).
- `profiles.super_admin` (boolean, défaut false) : propriétaire de la plateforme,
  peut basculer d'une entreprise à l'autre.

## 3. Données initiales
- L'entreprise existante (singleton id=1) est copiée dans la nouvelle table avec TOUS les modules.
- Trois entreprises d'exemple sont créées :
  - Quincaillerie (tous modules sauf Caisse POS)
  - Maquis et bar (sans multi-sites ni réappro : pas entrepots/transferts/reappro)
  - Boutique Supérette (tous les modules)
- Tous les profils existants sont rattachés à l'entreprise d'origine.

## 4. Fonctions
- `current_entreprise_id()` : retourne l'entreprise active de l'utilisateur connecté
  (lue depuis profiles). SECURITY DEFINER pour être utilisable dans les policies RLS
  sans dépendre de la visibilité de la ligne profile.
- Trigger profiles_fill_entreprise : renseigne entreprise_id à la création si absent.

## 5. Sécurité
- RLS activé sur `entreprises` : lecture pour authenticated (les utilisateurs doivent
  connaître les entreprises disponibles), écriture réservée aux admin.
- Les policies des tables métier sont modifiées dans les migrations suivantes.
*/

CREATE TABLE IF NOT EXISTS entreprises (
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
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE entreprises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entreprises_select_authenticated" ON entreprises;
CREATE POLICY "entreprises_select_authenticated" ON entreprises
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "entreprises_insert_admin" ON entreprises;
CREATE POLICY "entreprises_insert_admin" ON entreprises
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS "entreprises_update_admin" ON entreprises;
CREATE POLICY "entreprises_update_admin" ON entreprises
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Copie de l'entreprise existante (si la table legacy a une ligne et entreprises est vide)
INSERT INTO entreprises (nom, slogan, adresse, ville, telephone, email, logo_url, tva_taux, tva_active, devise, mention_bas)
SELECT nom, slogan, adresse, ville, telephone, email, logo_url, tva_taux, tva_active, devise, mention_bas
FROM entreprise
WHERE id = 1
  AND NOT EXISTS (SELECT 1 FROM entreprises);

-- Entreprises d'exemple
INSERT INTO entreprises (nom, modules)
SELECT 'Quincaillerie',
  '{dashboard,produits,categories,mouvements,entrepots,transferts,inventaires,lots,scan,reappro,fournisseurs,clients,commandes,paiements,rapports,audit,parametres}'
WHERE NOT EXISTS (SELECT 1 FROM entreprises WHERE nom = 'Quincaillerie');

INSERT INTO entreprises (nom, modules)
SELECT 'Maquis et bar',
  '{dashboard,produits,categories,mouvements,inventaires,lots,scan,fournisseurs,clients,commandes,caisse,paiements,rapports,audit,parametres}'
WHERE NOT EXISTS (SELECT 1 FROM entreprises WHERE nom = 'Maquis et bar');

INSERT INTO entreprises (nom, modules)
SELECT 'Boutique Supérette',
  '{dashboard,produits,categories,mouvements,entrepots,transferts,inventaires,lots,scan,reappro,fournisseurs,clients,commandes,paiements,caisse,rapports,audit,parametres}'
WHERE NOT EXISTS (SELECT 1 FROM entreprises WHERE nom = 'Boutique Supérette');

-- Rattachement des profils
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS super_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION current_entreprise_id() RETURNS uuid AS $$
  SELECT entreprise_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION profiles_fill_entreprise() RETURNS trigger AS $$
BEGIN
  IF NEW.entreprise_id IS NULL THEN
    SELECT id INTO NEW.entreprise_id FROM entreprises ORDER BY created_at LIMIT 1;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_profiles_fill_entreprise ON profiles;
CREATE TRIGGER trigger_profiles_fill_entreprise
  BEFORE INSERT OR UPDATE OF entreprise_id ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_fill_entreprise();

-- Rattachement des profils existants à l'entreprise d'origine
UPDATE profiles SET entreprise_id = (SELECT id FROM entreprises ORDER BY created_at LIMIT 1)
WHERE entreprise_id IS NULL;
