/*
# Multi-entreprises — partie 3 : audit par entreprise + retrait de l'ancienne table singleton

## 1. Colonnes ajoutées
- journal_audit.entreprise_id (uuid, FK entreprises, nullable) : portée de l'action auditée.

## 2. Fonctions modifiées
- audit_log() : renseigne désormais entreprise_id avec current_entreprise_id().
- Politique SELECT du journal : un utilisateur ne voit que les entrées de son entreprise ;
  les super-admins voient tout.

## 3. Ancienne table `entreprise` (singleton)
- Les politiques d'écriture publiques sont retirées (l'application lit désormais `entreprises`).
  Les données historiques restent intactes.
*/

ALTER TABLE journal_audit ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);

CREATE OR REPLACE FUNCTION audit_log() RETURNS trigger AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_ent uuid;
BEGIN
  SELECT email INTO v_email FROM profiles WHERE id = v_user;
  v_ent := current_entreprise_id();

  IF TG_OP = 'DELETE' THEN
    INSERT INTO journal_audit (user_id, user_email, table_name, record_id, action, donnees, entreprise_id)
    VALUES (v_user, v_email, TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), v_ent);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO journal_audit (user_id, user_email, table_name, record_id, action, donnees, entreprise_id)
    VALUES (v_user, v_email, TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), v_ent);
    RETURN NEW;
  ELSE
    INSERT INTO journal_audit (user_id, user_email, table_name, record_id, action, donnees, entreprise_id)
    VALUES (v_user, v_email, TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(NEW), v_ent);
    RETURN NEW;
  END IF;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "admin_gestionnaire_read_audit" ON journal_audit;
CREATE POLICY "admin_gestionnaire_read_audit" ON journal_audit FOR SELECT
TO authenticated USING (
  entreprise_id IS NULL
  OR entreprise_id = current_entreprise_id()
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.super_admin
  )
);

DROP POLICY IF EXISTS "anon_insert_entreprise" ON entreprise;
DROP POLICY IF EXISTS "anon_update_entreprise" ON entreprise;
