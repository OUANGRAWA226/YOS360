/*
# Multi-entreprises — partie 2 : entreprise_id sur les tables métier + isolation RLS

## 1. Colonnes ajoutées (uuid, FK vers entreprises, nullable pendant la transition)
- categories.entreprise_id, produits.entreprise_id, mouvements.entreprise_id,
  fournisseurs.entreprise_id, clients.entreprise_id, commandes.entreprise_id,
  commande_items.entreprise_id, entrepots.entreprise_id, lots.entreprise_id,
  stocks_entrepot.entreprise_id, transferts.entreprise_id, inventaires.entreprise_id,
  inventaire_lignes.entreprise_id, paiements.entreprise_id

## 2. Backfill
- Toutes les lignes existantes sont rattachées à la première entreprise (données historiques).

## 3. Sécurité (RLS)
- Pour chaque table métier : remplacement des 4 politiques publiques par des politiques
  authentifiées à portée entreprise :
  - SELECT : l'utilisateur voit les lignes de son entreprise active.
  - INSERT : l'utilisateur ne peut créer que dans son entreprise (WITH CHECK).
  - UPDATE / DELETE : même portée. 
- Le champ entreprise_id est posé automatiquement à l'insertion par le trigger
  (voir trigger plus bas), donc le frontend n'a pas à l'envoyer.

## 4. Triggers
- `set_entreprise_id()` : renseigne entreprise_id avec current_entreprise_id() à l'insertion
  si absent, sur toutes les tables métier (sauf commande_items/inventaire_lignes qui
  héritent du parent via les triggers existants — on les renseigne aussi par sécurité).
*/

ALTER TABLE categories ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE produits ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE mouvements ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE commande_items ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE entrepots ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE lots ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE stocks_entrepot ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE transferts ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE inventaires ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE inventaire_lignes ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id);

-- Backfill
UPDATE categories SET entreprise_id = current_entreprise_id() WHERE entreprise_id IS NULL AND auth.uid() IS NOT NULL;
UPDATE produits SET entreprise_id = (SELECT entreprise_id FROM profiles WHERE id = auth.uid()) WHERE entreprise_id IS NULL AND auth.uid() IS NOT NULL;

-- Backfill générique via la première entreprise (données historiques communes)
DO $$
DECLARE
  v_ent uuid;
BEGIN
  SELECT id INTO v_ent FROM entreprises ORDER BY created_at LIMIT 1;
  IF v_ent IS NULL THEN RETURN; END IF;
  UPDATE categories SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE produits SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE mouvements SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE fournisseurs SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE clients SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE commandes SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE commande_items SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE entrepots SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE lots SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE stocks_entrepot SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE transferts SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE inventaires SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE inventaire_lignes SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
  UPDATE paiements SET entreprise_id = v_ent WHERE entreprise_id IS NULL;
END $$;

-- Trigger: renseigne entreprise_id à l'insertion
CREATE OR REPLACE FUNCTION set_entreprise_id() RETURNS trigger AS $$
BEGIN
  IF NEW.entreprise_id IS NULL THEN
    NEW.entreprise_id := current_entreprise_id();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ent_categories ON categories;
CREATE TRIGGER trg_ent_categories BEFORE INSERT ON categories
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_produits ON produits;
CREATE TRIGGER trg_ent_produits BEFORE INSERT ON produits
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_mouvements ON mouvements;
CREATE TRIGGER trg_ent_mouvements BEFORE INSERT ON mouvements
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_fournisseurs ON fournisseurs;
CREATE TRIGGER trg_ent_fournisseurs BEFORE INSERT ON fournisseurs
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_clients ON clients;
CREATE TRIGGER trg_ent_clients BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_commandes ON commandes;
CREATE TRIGGER trg_ent_commandes BEFORE INSERT ON commandes
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_commande_items ON commande_items;
CREATE TRIGGER trg_ent_commande_items BEFORE INSERT ON commande_items
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_entrepots ON entrepots;
CREATE TRIGGER trg_ent_entrepots BEFORE INSERT ON entrepots
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_lots ON lots;
CREATE TRIGGER trg_ent_lots BEFORE INSERT ON lots
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_stocks_entrepot ON stocks_entrepot;
CREATE TRIGGER trg_ent_stocks_entrepot BEFORE INSERT ON stocks_entrepot
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_transferts ON transferts;
CREATE TRIGGER trg_ent_transferts BEFORE INSERT ON transferts
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_inventaires ON inventaires;
CREATE TRIGGER trg_ent_inventaires BEFORE INSERT ON inventaires
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_inventaire_lignes ON inventaire_lignes;
CREATE TRIGGER trg_ent_inventaire_lignes BEFORE INSERT ON inventaire_lignes
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();
DROP TRIGGER IF EXISTS trg_ent_paiements ON paiements;
CREATE TRIGGER trg_ent_paiements BEFORE INSERT ON paiements
  FOR EACH ROW EXECUTE FUNCTION set_entreprise_id();

-- ============================================================
-- RLS par entreprise
-- ============================================================

-- categories
DROP POLICY IF EXISTS "anon_select_produits" ON categories;
DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
DROP POLICY IF EXISTS "anon_update_categories" ON categories;
DROP POLICY IF EXISTS "anon_delete_categories" ON categories;
DROP POLICY IF EXISTS "tenant_select_categories" ON categories;
CREATE POLICY "tenant_select_categories" ON categories FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_categories" ON categories;
CREATE POLICY "tenant_insert_categories" ON categories FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_categories" ON categories;
CREATE POLICY "tenant_update_categories" ON categories FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_categories" ON categories;
CREATE POLICY "tenant_delete_categories" ON categories FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- produits (les politiques existantes "anon_select_produits" etc. remplacées)
DROP POLICY IF EXISTS "anon_select_produits" ON produits;
DROP POLICY IF EXISTS "anon_insert_produits" ON produits;
DROP POLICY IF EXISTS "anon_update_produits" ON produits;
DROP POLICY IF EXISTS "anon_delete_produits" ON produits;
DROP POLICY IF EXISTS "tenant_select_produits" ON produits;
CREATE POLICY "tenant_select_produits" ON produits FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_produits" ON produits;
CREATE POLICY "tenant_insert_produits" ON produits FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_produits" ON produits;
CREATE POLICY "tenant_update_produits" ON produits FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_produits" ON produits;
CREATE POLICY "tenant_delete_produits" ON produits FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- mouvements
DROP POLICY IF EXISTS "anon_select_mouvements" ON mouvements;
DROP POLICY IF EXISTS "anon_insert_mouvements" ON mouvements;
DROP POLICY IF EXISTS "anon_update_mouvements" ON mouvements;
DROP POLICY IF EXISTS "anon_delete_mouvements" ON mouvements;
DROP POLICY IF EXISTS "tenant_select_mouvements" ON mouvements;
CREATE POLICY "tenant_select_mouvements" ON mouvements FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_mouvements" ON mouvements;
CREATE POLICY "tenant_insert_mouvements" ON mouvements FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_mouvements" ON mouvements;
CREATE POLICY "tenant_update_mouvements" ON mouvements FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_mouvements" ON mouvements;
CREATE POLICY "tenant_delete_mouvements" ON mouvements FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- fournisseurs
DROP POLICY IF EXISTS "anon_select_fournisseurs" ON fournisseurs;
DROP POLICY IF EXISTS "anon_insert_fournisseurs" ON fournisseurs;
DROP POLICY IF EXISTS "anon_update_fournisseurs" ON fournisseurs;
DROP POLICY IF EXISTS "anon_delete_fournisseurs" ON fournisseurs;
DROP POLICY IF EXISTS "tenant_select_fournisseurs" ON fournisseurs;
CREATE POLICY "tenant_select_fournisseurs" ON fournisseurs FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_fournisseurs" ON fournisseurs;
CREATE POLICY "tenant_insert_fournisseurs" ON fournisseurs FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_fournisseurs" ON fournisseurs;
CREATE POLICY "tenant_update_fournisseurs" ON fournisseurs FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_fournisseurs" ON fournisseurs;
CREATE POLICY "tenant_delete_fournisseurs" ON fournisseurs FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- clients
DROP POLICY IF EXISTS "anon_select_clients" ON clients;
DROP POLICY IF EXISTS "anon_insert_clients" ON clients;
DROP POLICY IF EXISTS "anon_update_clients" ON clients;
DROP POLICY IF EXISTS "anon_delete_clients" ON clients;
DROP POLICY IF EXISTS "tenant_select_clients" ON clients;
CREATE POLICY "tenant_select_clients" ON clients FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_clients" ON clients;
CREATE POLICY "tenant_insert_clients" ON clients FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_clients" ON clients;
CREATE POLICY "tenant_update_clients" ON clients FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_clients" ON clients;
CREATE POLICY "tenant_delete_clients" ON clients FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- commandes
DROP POLICY IF EXISTS "anon_select_commandes" ON commandes;
DROP POLICY IF EXISTS "anon_insert_commandes" ON commandes;
DROP POLICY IF EXISTS "anon_update_commandes" ON commandes;
DROP POLICY IF EXISTS "anon_delete_commandes" ON commandes;
DROP POLICY IF EXISTS "tenant_select_commandes" ON commandes;
CREATE POLICY "tenant_select_commandes" ON commandes FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_commandes" ON commandes;
CREATE POLICY "tenant_insert_commandes" ON commandes FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_commandes" ON commandes;
CREATE POLICY "tenant_update_commandes" ON commandes FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_commandes" ON commandes;
CREATE POLICY "tenant_delete_commandes" ON commandes FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- commande_items
DROP POLICY IF EXISTS "anon_select_commande_items" ON commande_items;
DROP POLICY IF EXISTS "anon_insert_commande_items" ON commande_items;
DROP POLICY IF EXISTS "anon_update_commande_items" ON commande_items;
DROP POLICY IF EXISTS "anon_delete_commande_items" ON commande_items;
DROP POLICY IF EXISTS "tenant_select_commande_items" ON commande_items;
CREATE POLICY "tenant_select_commande_items" ON commande_items FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_commande_items" ON commande_items;
CREATE POLICY "tenant_insert_commande_items" ON commande_items FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_commande_items" ON commande_items;
CREATE POLICY "tenant_update_commande_items" ON commande_items FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_commande_items" ON commande_items;
CREATE POLICY "tenant_delete_commande_items" ON commande_items FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- entrepots
DROP POLICY IF EXISTS "anon_select_entrepots" ON entrepots;
DROP POLICY IF EXISTS "anon_insert_entrepots" ON entrepots;
DROP POLICY IF EXISTS "anon_update_entrepots" ON entrepots;
DROP POLICY IF EXISTS "anon_delete_entrepots" ON entrepots;
DROP POLICY IF EXISTS "tenant_select_entrepots" ON entrepots;
CREATE POLICY "tenant_select_entrepots" ON entrepots FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_entrepots" ON entrepots;
CREATE POLICY "tenant_insert_entrepots" ON entrepots FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_entrepots" ON entrepots;
CREATE POLICY "tenant_update_entrepots" ON entrepots FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_entrepots" ON entrepots;
CREATE POLICY "tenant_delete_entrepots" ON entrepots FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- lots
DROP POLICY IF EXISTS "anon_select_lots" ON lots;
DROP POLICY IF EXISTS "anon_insert_lots" ON lots;
DROP POLICY IF EXISTS "anon_update_lots" ON lots;
DROP POLICY IF EXISTS "anon_delete_lots" ON lots;
DROP POLICY IF EXISTS "tenant_select_lots" ON lots;
CREATE POLICY "tenant_select_lots" ON lots FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_lots" ON lots;
CREATE POLICY "tenant_insert_lots" ON lots FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_lots" ON lots;
CREATE POLICY "tenant_update_lots" ON lots FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_lots" ON lots;
CREATE POLICY "tenant_delete_lots" ON lots FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- stocks_entrepot
DROP POLICY IF EXISTS "anon_select_stocks_entrepot" ON stocks_entrepot;
DROP POLICY IF EXISTS "anon_insert_stocks_entrepot" ON stocks_entrepot;
DROP POLICY IF EXISTS "anon_update_stocks_entrepot" ON stocks_entrepot;
DROP POLICY IF EXISTS "anon_delete_stocks_entrepot" ON stocks_entrepot;
DROP POLICY IF EXISTS "tenant_select_stocks_entrepot" ON stocks_entrepot;
CREATE POLICY "tenant_select_stocks_entrepot" ON stocks_entrepot FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_stocks_entrepot" ON stocks_entrepot;
CREATE POLICY "tenant_insert_stocks_entrepot" ON stocks_entrepot FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_stocks_entrepot" ON stocks_entrepot;
CREATE POLICY "tenant_update_stocks_entrepot" ON stocks_entrepot FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_stocks_entrepot" ON stocks_entrepot;
CREATE POLICY "tenant_delete_stocks_entrepot" ON stocks_entrepot FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- transferts
DROP POLICY IF EXISTS "anon_select_transferts" ON transferts;
DROP POLICY IF EXISTS "anon_insert_transferts" ON transferts;
DROP POLICY IF EXISTS "anon_update_transferts" ON transferts;
DROP POLICY IF EXISTS "anon_delete_transferts" ON transferts;
DROP POLICY IF EXISTS "tenant_select_transferts" ON transferts;
CREATE POLICY "tenant_select_transferts" ON transferts FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_transferts" ON transferts;
CREATE POLICY "tenant_insert_transferts" ON transferts FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_transferts" ON transferts;
CREATE POLICY "tenant_update_transferts" ON transferts FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_transferts" ON transferts;
CREATE POLICY "tenant_delete_transferts" ON transferts FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- inventaires
DROP POLICY IF EXISTS "anon_select_inventaires" ON inventaires;
DROP POLICY IF EXISTS "anon_insert_inventaires" ON inventaires;
DROP POLICY IF EXISTS "anon_update_inventaires" ON inventaires;
DROP POLICY IF EXISTS "anon_delete_inventaires" ON inventaires;
DROP POLICY IF EXISTS "tenant_select_inventaires" ON inventaires;
CREATE POLICY "tenant_select_inventaires" ON inventaires FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_inventaires" ON inventaires;
CREATE POLICY "tenant_insert_inventaires" ON inventaires FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_inventaires" ON inventaires;
CREATE POLICY "tenant_update_inventaires" ON inventaires FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_inventaires" ON inventaires;
CREATE POLICY "tenant_delete_inventaires" ON inventaires FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- inventaire_lignes
DROP POLICY IF EXISTS "anon_select_inventaire_lignes" ON inventaire_lignes;
DROP POLICY IF EXISTS "anon_insert_inventaire_lignes" ON inventaire_lignes;
DROP POLICY IF EXISTS "anon_update_inventaire_lignes" ON inventaire_lignes;
DROP POLICY IF EXISTS "anon_delete_inventaire_lignes" ON inventaire_lignes;
DROP POLICY IF EXISTS "tenant_select_inventaire_lignes" ON inventaire_lignes;
CREATE POLICY "tenant_select_inventaire_lignes" ON inventaire_lignes FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_inventaire_lignes" ON inventaire_lignes;
CREATE POLICY "tenant_insert_inventaire_lignes" ON inventaire_lignes FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_inventaire_lignes" ON inventaire_lignes;
CREATE POLICY "tenant_update_inventaire_lignes" ON inventaire_lignes FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_inventaire_lignes" ON inventaire_lignes;
CREATE POLICY "tenant_delete_inventaire_lignes" ON inventaire_lignes FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

-- paiements
DROP POLICY IF EXISTS "anon_select_paiements" ON paiements;
DROP POLICY IF EXISTS "anon_insert_paiements" ON paiements;
DROP POLICY IF EXISTS "anon_update_paiements" ON paiements;
DROP POLICY IF EXISTS "anon_delete_paiements" ON paiements;
DROP POLICY IF EXISTS "tenant_select_paiements" ON paiements;
CREATE POLICY "tenant_select_paiements" ON paiements FOR SELECT TO authenticated
USING (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_insert_paiements" ON paiements;
CREATE POLICY "tenant_insert_paiements" ON paiements FOR INSERT TO authenticated
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_update_paiements" ON paiements;
CREATE POLICY "tenant_update_paiements" ON paiements FOR UPDATE TO authenticated
USING (entreprise_id = current_entreprise_id())
WITH CHECK (entreprise_id = current_entreprise_id());
DROP POLICY IF EXISTS "tenant_delete_paiements" ON paiements;
CREATE POLICY "tenant_delete_paiements" ON paiements FOR DELETE TO authenticated
USING (entreprise_id = current_entreprise_id());

CREATE INDEX IF NOT EXISTS idx_produits_entreprise ON produits(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_commandes_entreprise ON commandes(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_entreprise ON mouvements(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_paiements_entreprise ON paiements(entreprise_id);
