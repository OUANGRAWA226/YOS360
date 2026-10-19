/*
# Création automatique du profil lors de l'inscription

1. Problème
- Lorsqu'un utilisateur crée un compte depuis l'écran de connexion, le compte
  d'authentification est créé dans Supabase, mais aucune ligne n'est ajoutée dans
  la table `profiles`. L'application reste alors bloquée sur le chargement :
  elle cherche un profil qui n'existe jamais.

2. Correctif
- Nouvelle fonction `handle_new_user()` : déclenchée automatiquement à la création
  d'un compte. Elle insère la ligne de profil correspondante dans `profiles`
  (id, email, nom complet saisi lors de l'inscription).
- Nouveau déclencheur `on_auth_user_created` sur la table interne des comptes.

3. Sécurité
- La fonction est SECURITY DEFINER (elle écrit pour le nouveau compte, qui n'a pas
  encore de session) avec search_path verrouillé.
- Le premier compte reste promu administrateur par le déclencheur existant
  `trigger_first_admin`, et le rattachement automatique à la première entreprise
  reste assuré par `trigger_profiles_fill_entreprise`.
- Aucune donnée existante n'est modifiée ; migration idempotente.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nom_complet)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NULLIF(NEW.raw_user_meta_data ->> 'nom_complet', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
