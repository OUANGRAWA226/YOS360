/*
# Packs de modules + suspension d'entreprise (gouvernance SaaS)

1. Objectif
- Donner au propriétaire du SaaS (super administrateur) deux leviers de gestion
  des clients :
  a) des « packs de modules » : appliquer en un clic un ensemble prédéfini de
     fonctionnalités (Basique / Standard / Premium / complet) à une ou plusieurs
     entreprises, au lieu de cocher les modules une par une ;
  b) la suspension d'une entreprise cliente (ex. impayé) : tous ses utilisateurs
     voient un écran de blocage au lieu de l'application.

2. Nouvelles colonnes
- `entreprises.pack` (text, nullable) : nom du pack appliqué en dernier
  ('basique', 'standard', 'premium', 'complet'). Purement informatif, la source
  de vérité reste la colonne `modules`.
- `entreprises.suspendue` (boolean, défaut false) : true = accès bloqué.

3. Nouvelle fonction
- `is_super_admin()` (SECURITY DEFINER, search_path verrouillé) : true si le
  profil courant a `super_admin = true`. Évite toute récursion RLS sur profiles.

4. Sécurité / RLS
- Nouvelle politique UPDATE sur `entreprises` restreignant les colonnes
  `pack`, `modules` et `suspendue` aux super administrateurs : un admin
  d'entreprise cliente ne peut pas se réattribuer des modules ni lever une
  suspension. (Politique permissive existante conservée pour les autres
  colonnes ; les deux s'additionnent en OR.)
- Les autres politiques de `entreprises` sont inchangées.

5. Idempotence
- Toutes les opérations sont conditionnelles (IF NOT EXISTS / DROP IF EXISTS).
*/

ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS pack text;
ALTER TABLE public.entreprises ADD COLUMN IF NOT EXISTS suspendue boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND super_admin = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "entreprises_governance_super_admin" ON public.entreprises;
CREATE POLICY "entreprises_governance_super_admin"
ON public.entreprises FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());
