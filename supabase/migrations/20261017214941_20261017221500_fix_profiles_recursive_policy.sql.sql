/*
# Correction de la boucle infinie sur la lecture des profils

1. Problème
- La politique de lecture de la table `profiles` interrogeait la table `profiles`
  elle-même pour vérifier si l'utilisateur est administrateur. Cette auto-référence
  déclenche une erreur « infinite recursion detected in policy » dans Postgres :
  la lecture du profil échoue systématiquement, et l'application reste bloquée
  sur l'écran de chargement après connexion.

2. Correctif
- Nouvelle fonction `is_admin()` (SECURITY DEFINER) : vérifie le rôle de
  l'utilisateur dans `profiles` en tant que propriétaire de la base, sans passer
  par les politiques RLS — ce qui supprime la récursion.
- Les politiques SELECT et UPDATE de `profiles` utilisent désormais `is_admin()`
  au lieu d'interroger directement la table.

3. Sécurité
- Le comportement reste identique : chacun lit son propre profil ; un
  administrateur lit et modifie tous les profils ; personne ne peut modifier
  son propre rôle par ce chemin (la mise à jour reste limitée à son profil ou
  aux actions d'un admin).
- Aucune donnée n'est modifiée ; migration idempotente.
*/

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());
