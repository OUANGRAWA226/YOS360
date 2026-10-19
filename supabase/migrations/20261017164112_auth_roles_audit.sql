/*
# Authentification, rôles et journal d'audit

1. Nouvelles Tables

## profiles
- `id` (uuid, PK, FK vers auth.users) — identique à l'id utilisateur
- `email` (texte, non null)
- `nom_complet` (texte)
- `role` (texte: 'admin', 'gestionnaire', 'magasinier', 'vendeur', défaut 'vendeur')
- `actif` (boolean, défaut true)
- `created_at` (timestamptz)

## journal_audit
- `id` (uuid, PK)
- `user_id` (uuid) — auteur de l'action
- `user_email` (texte) — email de l'auteur (dénormalisé pour l'historique)
- `table_name` (texte) — table concernée
- `record_id` (uuid) — ligne concernée
- `action` (texte: INSERT/UPDATE/DELETE)
- `champ` (texte) — champ modifié (pour UPDATE)
- `ancienne_valeur` (texte) — ancienne valeur (pour UPDATE)
- `nouvelle_valeur` (texte) — nouvelle valeur (pour UPDATE)
- `donnees` (jsonb) — snapshot complet (pour INSERT/DELETE)
- `created_at` (timestamptz)

2. Tables modifiées
- Rien de destructif. Ajout de triggers d'audit sur produits, mouvements, categories, fournisseurs, clients, commandes.

3. Sécurité
- RLS sur profiles: chacun lit son profil; les admins lisent/modifient tous les profils.
- RLS sur journal_audit: lecture par les admins et gestionnaires; écriture seulement par la fonction d'audit (SECURITY DEFINER).
- Fonction promote_first_admin: le premier utilisateur qui se connecte devient admin (sinon personne ne pourrait administrer).

4. Notes importantes
- Les triggers d'audit capturent l'utilisateur via auth.uid() et son email via auth.jwt().
- Les valeurs sont tronquées à 5000 caractères pour éviter les lignes trop lourdes.
- IMPORTANT: la politique INSERT sur profiles permet à chacun de créer son profil à la première connexion (id = auth.uid()).
*/

-- Table profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  nom_complet text,
  role text NOT NULL DEFAULT 'vendeur' CHECK (role IN ('admin', 'gestionnaire', 'magasinier', 'vendeur')),
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ))
  WITH CHECK (auth.uid() = id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

DROP POLICY IF EXISTS "admin_delete_profiles" ON profiles;
CREATE POLICY "admin_delete_profiles" ON profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- Table journal_audit
CREATE TABLE IF NOT EXISTS journal_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  champ text,
  ancienne_valeur text,
  nouvelle_valeur text,
  donnees jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE journal_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_gestionnaire_read_audit" ON journal_audit;
CREATE POLICY "admin_gestionnaire_read_audit" ON journal_audit FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'gestionnaire')
  ));

-- Fonction d'audit (SECURITY DEFINER pour pouvoir écrire dans journal_audit)
CREATE OR REPLACE FUNCTION audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_changed boolean;
BEGIN
  v_user_id := auth.uid();
  v_user_email := COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'email',
    'system'
  );

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_changed := false;
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key IN ('updated_at', 'created_at') THEN CONTINUE; END IF;
      IF v_old -> v_key IS DISTINCT FROM v_new -> v_key THEN
        v_changed := true;
        INSERT INTO journal_audit (user_id, user_email, table_name, record_id, action, champ, ancienne_valeur, nouvelle_valeur)
        VALUES (
          v_user_id, v_user_email, TG_TABLE_NAME, NEW.id, 'UPDATE',
          v_key,
          LEFT(COALESCE(v_old ->> v_key, ''), 5000),
          LEFT(COALESCE(v_new ->> v_key, ''), 5000)
        );
      END IF;
    END LOOP;
    IF NOT v_changed THEN
      RETURN NULL;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO journal_audit (user_id, user_email, table_name, record_id, action, donnees)
    VALUES (v_user_id, v_user_email, TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO journal_audit (user_id, user_email, table_name, record_id, action, donnees)
    VALUES (v_user_id, v_user_email, TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers d'audit sur les tables métier
DROP TRIGGER IF EXISTS audit_produits ON produits;
CREATE TRIGGER audit_produits AFTER INSERT OR UPDATE OR DELETE ON produits
  FOR EACH ROW EXECUTE FUNCTION audit_log();

DROP TRIGGER IF EXISTS audit_mouvements ON mouvements;
CREATE TRIGGER audit_mouvements AFTER INSERT OR DELETE ON mouvements
  FOR EACH ROW EXECUTE FUNCTION audit_log();

DROP TRIGGER IF EXISTS audit_categories ON categories;
CREATE TRIGGER audit_categories AFTER INSERT OR UPDATE OR DELETE ON categories
  FOR EACH ROW EXECUTE FUNCTION audit_log();

DROP TRIGGER IF EXISTS audit_fournisseurs ON fournisseurs;
CREATE TRIGGER audit_fournisseurs AFTER INSERT OR UPDATE OR DELETE ON fournisseurs
  FOR EACH ROW EXECUTE FUNCTION audit_log();

DROP TRIGGER IF EXISTS audit_clients ON clients;
CREATE TRIGGER audit_clients AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION audit_log();

DROP TRIGGER IF EXISTS audit_commandes ON commandes;
CREATE TRIGGER audit_commandes AFTER INSERT OR UPDATE OR DELETE ON commandes
  FOR EACH ROW EXECUTE FUNCTION audit_log();

-- Index sur le journal
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON journal_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON journal_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON journal_audit(table_name, record_id);

-- Fonction: le premier utilisateur devient admin
CREATE OR REPLACE FUNCTION promote_first_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE role = 'admin') THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_first_admin ON profiles;
CREATE TRIGGER trigger_first_admin
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION promote_first_admin();

-- Protections métier côté base (le vendeur ne peut pas changer les prix d'achat)
CREATE OR REPLACE FUNCTION guard_prix_unitaire()
RETURNS TRIGGER AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.prix_unitaire IS DISTINCT FROM OLD.prix_unitaire AND v_role NOT IN ('admin', 'gestionnaire') THEN
    RAISE EXCEPTION 'Seuls les administrateurs et gestionnaires peuvent modifier le prix d''achat';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_guard_prix_unitaire ON produits;
CREATE TRIGGER trigger_guard_prix_unitaire
  BEFORE UPDATE ON produits
  FOR EACH ROW EXECUTE FUNCTION guard_prix_unitaire();

-- Helper: role de l'utilisateur courant
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;
