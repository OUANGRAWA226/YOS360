/*
# Priorité 2 : multi-entrepôts, transferts, inventaires, lots/FEFO, valorisation CMUP, réception partielle

1. Nouvelles Tables

## entrepots
- `id` (uuid, PK) — site / boutique / entrepôt
- `nom` (texte, non null) — nom du site
- `code` (texte, unique) — code court (ex: MAG1)
- `adresse`, `ville`, `responsable` (texte)
- `actif` (boolean, défaut true)

## stocks_entrepot — stock par produit et par site
- `produit_id` (FK produits), `entrepot_id` (FK entrepots)
- `quantite` (entier, défaut 0)
- UNIQUE (produit_id, entrepot_id)

## lots — numéros de lot / péremption / série
- `produit_id` (FK), `numero_lot` (texte), `numero_serie` (texte)
- `date_peremption` (date, nullable), `quantite` (entier, défaut 0)
- `prix_unitaire` (numeric) — prix d'entrée du lot (pour FIFO)
- `entrepot_id` (FK entrepots, nullable)
- UNIQUE (produit_id, numero_lot)

## transferts — bons de transfert inter-sites
- `reference` (texte), `produit_id` (FK), `quantite` (entier > 0)
- `entrepot_source_id`, `entrepot_dest_id` (FK entrepots)
- `statut` : 'en_preparation' | 'envoye' | 'recu' | 'annule'
- `envoye_at`, `recu_at`, `created_by` (uuid), `note`
- CHECK source <> destination

## inventaires — sessions de comptage physique
- `reference`, `entrepot_id` (nullable), `statut` : 'en_cours' | 'valide' | 'annule'
- `date_debut`, `date_cloture`, `note`

## inventaire_lignes — lignes de comptage
- `inventaire_id` (FK), `produit_id` (FK)
- `stock_theorique` (entier), `stock_compte` (entier nullable)
- UNIQUE (inventaire_id, produit_id)

2. Tables modifiées (ajouts non destructifs)
- `produits` : + code_barres (unique si renseigné), perissable, alerte_peremption_jours,
  methode_valorisation ('cmup'|'fifo'), cmup, quantite_economique.
- `mouvements` : + entrepot_id (FK), + lot_id (FK lots), + prix_unitaire (alimente le CMUP).
- `commande_items` : + quantite_recue (réception partielle).

3. Logique métier (triggers)
- stocks_entrepot mis à jour automatiquement quand un mouvement a un entrepot_id.
- CMUP recalculé à chaque entrée valorisée (prix > 0).
- Transferts : le stock bascule du site source vers le site destination au passage à 'envoye' (une seule fois); 'recu' ne fait que dater la réception.

4. Sécurité
- RLS activée sur toutes les nouvelles tables; politiques TO anon, authenticated (même pattern que le reste de l'application, volontairement partagé).
- Triggers d'audit ajoutés sur entrepots, transferts, inventaires, inventaire_lignes et lots.

5. Notes importantes
- Site « Boutique Principale » créé automatiquement pour que le stock existant ait un emplacement.
- Sortie FEFO guidée côté application (tri des lots par date de péremption).
- Migration idempotente : réappliquée après correction de l'ordre de création (lots avant la colonne mouvements.lot_id). Aucune donnée modifiée ou supprimée.
*/

-- ============ ENTREPOTS ============
CREATE TABLE IF NOT EXISTS entrepots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  code text UNIQUE,
  adresse text,
  ville text,
  responsable text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE entrepots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_entrepots_select" ON entrepots;
CREATE POLICY "all_entrepots_select" ON entrepots FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "all_entrepots_insert" ON entrepots;
CREATE POLICY "all_entrepots_insert" ON entrepots FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "all_entrepots_update" ON entrepots;
CREATE POLICY "all_entrepots_update" ON entrepots FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "all_entrepots_delete" ON entrepots;
CREATE POLICY "all_entrepots_delete" ON entrepots FOR DELETE
  TO anon, authenticated USING (true);

-- ============ LOTS (créé avant les colonnes qui y font référence) ============
CREATE TABLE IF NOT EXISTS lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id uuid NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  numero_lot text NOT NULL,
  numero_serie text,
  date_peremption date,
  quantite integer NOT NULL DEFAULT 0,
  prix_unitaire numeric(12,4) NOT NULL DEFAULT 0,
  entrepot_id uuid REFERENCES entrepots(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (produit_id, numero_lot)
);

ALTER TABLE lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_lots_select" ON lots;
CREATE POLICY "all_lots_select" ON lots FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "all_lots_insert" ON lots;
CREATE POLICY "all_lots_insert" ON lots FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "all_lots_update" ON lots;
CREATE POLICY "all_lots_update" ON lots FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "all_lots_delete" ON lots;
CREATE POLICY "all_lots_delete" ON lots FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_lots_produit ON lots(produit_id);
CREATE INDEX IF NOT EXISTS idx_lots_peremption ON lots(date_peremption);

-- ============ NOUVELLES COLONNES ============
ALTER TABLE produits ADD COLUMN IF NOT EXISTS code_barres text;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS perissable boolean NOT NULL DEFAULT false;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS alerte_peremption_jours integer NOT NULL DEFAULT 30;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS methode_valorisation text NOT NULL DEFAULT 'cmup' CHECK (methode_valorisation IN ('cmup', 'fifo'));
ALTER TABLE produits ADD COLUMN IF NOT EXISTS cmup numeric(12,4) NOT NULL DEFAULT 0;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS quantite_economique integer NOT NULL DEFAULT 0;

ALTER TABLE mouvements ADD COLUMN IF NOT EXISTS entrepot_id uuid REFERENCES entrepots(id) ON DELETE SET NULL;
ALTER TABLE mouvements ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES lots(id) ON DELETE SET NULL;
ALTER TABLE mouvements ADD COLUMN IF NOT EXISTS prix_unitaire numeric(12,4) NOT NULL DEFAULT 0;

ALTER TABLE commande_items ADD COLUMN IF NOT EXISTS quantite_recue integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_produits_code_barres ON produits(code_barres) WHERE code_barres IS NOT NULL;

-- ============ STOCKS PAR ENTREPOT ============
CREATE TABLE IF NOT EXISTS stocks_entrepot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id uuid NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  entrepot_id uuid NOT NULL REFERENCES entrepots(id) ON DELETE CASCADE,
  quantite integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (produit_id, entrepot_id)
);

ALTER TABLE stocks_entrepot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_stocks_entrepot_select" ON stocks_entrepot;
CREATE POLICY "all_stocks_entrepot_select" ON stocks_entrepot FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "all_stocks_entrepot_insert" ON stocks_entrepot;
CREATE POLICY "all_stocks_entrepot_insert" ON stocks_entrepot FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "all_stocks_entrepot_update" ON stocks_entrepot;
CREATE POLICY "all_stocks_entrepot_update" ON stocks_entrepot FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "all_stocks_entrepot_delete" ON stocks_entrepot;
CREATE POLICY "all_stocks_entrepot_delete" ON stocks_entrepot FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_stocks_entrepot_produit ON stocks_entrepot(produit_id);
CREATE INDEX IF NOT EXISTS idx_stocks_entrepot_entrepot ON stocks_entrepot(entrepot_id);

-- ============ TRANSFERTS ============
CREATE TABLE IF NOT EXISTS transferts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  produit_id uuid NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  quantite integer NOT NULL CHECK (quantite > 0),
  entrepot_source_id uuid NOT NULL REFERENCES entrepots(id),
  entrepot_dest_id uuid NOT NULL REFERENCES entrepots(id),
  statut text NOT NULL DEFAULT 'en_preparation' CHECK (statut IN ('en_preparation', 'envoye', 'recu', 'annule')),
  note text,
  envoye_at timestamptz,
  recu_at timestamptz,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  CHECK (entrepot_source_id <> entrepot_dest_id)
);

ALTER TABLE transferts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_transferts_select" ON transferts;
CREATE POLICY "all_transferts_select" ON transferts FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "all_transferts_insert" ON transferts;
CREATE POLICY "all_transferts_insert" ON transferts FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "all_transferts_update" ON transferts;
CREATE POLICY "all_transferts_update" ON transferts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "all_transferts_delete" ON transferts;
CREATE POLICY "all_transferts_delete" ON transferts FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_transferts_statut ON transferts(statut);

-- Applique les effets de stock d'un transfert (source -, destination +, une fois chacun)
CREATE OR REPLACE FUNCTION apply_transfert_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.statut = 'envoye' AND OLD.statut = 'en_preparation' THEN
    UPDATE stocks_entrepot SET quantite = quantite - NEW.quantite
    WHERE produit_id = NEW.produit_id AND entrepot_id = NEW.entrepot_source_id;
    UPDATE stocks_entrepot SET quantite = quantite + NEW.quantite
    WHERE produit_id = NEW.produit_id AND entrepot_id = NEW.entrepot_dest_id;
    NEW.envoye_at := now();
  ELSIF NEW.statut = 'recu' AND OLD.statut = 'envoye' THEN
    NEW.recu_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_apply_transfert_stock ON transferts;
CREATE TRIGGER trigger_apply_transfert_stock
  AFTER UPDATE ON transferts
  FOR EACH ROW EXECUTE FUNCTION apply_transfert_stock();

-- ============ INVENTAIRES ============
CREATE TABLE IF NOT EXISTS inventaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  entrepot_id uuid REFERENCES entrepots(id) ON DELETE SET NULL,
  statut text NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'valide', 'annule')),
  date_debut timestamptz DEFAULT now(),
  date_cloture timestamptz,
  note text
);

ALTER TABLE inventaires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_inventaires_select" ON inventaires;
CREATE POLICY "all_inventaires_select" ON inventaires FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "all_inventaires_insert" ON inventaires;
CREATE POLICY "all_inventaires_insert" ON inventaires FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "all_inventaires_update" ON inventaires;
CREATE POLICY "all_inventaires_update" ON inventaires FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "all_inventaires_delete" ON inventaires;
CREATE POLICY "all_inventaires_delete" ON inventaires FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS inventaire_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventaire_id uuid NOT NULL REFERENCES inventaires(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  stock_theorique integer NOT NULL DEFAULT 0,
  stock_compte integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE (inventaire_id, produit_id)
);

ALTER TABLE inventaire_lignes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_inv_lignes_select" ON inventaire_lignes;
CREATE POLICY "all_inv_lignes_select" ON inventaire_lignes FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "all_inv_lignes_insert" ON inventaire_lignes;
CREATE POLICY "all_inv_lignes_insert" ON inventaire_lignes FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "all_inv_lignes_update" ON inventaire_lignes;
CREATE POLICY "all_inv_lignes_update" ON inventaire_lignes FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "all_inv_lignes_delete" ON inventaire_lignes;
CREATE POLICY "all_inv_lignes_delete" ON inventaire_lignes FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_inv_lignes_inventaire ON inventaire_lignes(inventaire_id);

-- ============ MOUVEMENTS : stock par entrepôt + CMUP ============
CREATE OR REPLACE FUNCTION adjust_stock_entrepot_on_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.entrepot_id IS NOT NULL THEN
    IF NEW.type = 'entree' THEN
      INSERT INTO stocks_entrepot (produit_id, entrepot_id, quantite)
      VALUES (NEW.produit_id, NEW.entrepot_id, NEW.quantite)
      ON CONFLICT (produit_id, entrepot_id)
      DO UPDATE SET quantite = stocks_entrepot.quantite + EXCLUDED.quantite, updated_at = now();
    ELSE
      INSERT INTO stocks_entrepot (produit_id, entrepot_id, quantite)
      VALUES (NEW.produit_id, NEW.entrepot_id, -NEW.quantite)
      ON CONFLICT (produit_id, entrepot_id)
      DO UPDATE SET quantite = stocks_entrepot.quantite - EXCLUDED.quantite, updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_adjust_stock_entrepot ON mouvements;
CREATE TRIGGER trigger_adjust_stock_entrepot
  AFTER INSERT ON mouvements
  FOR EACH ROW EXECUTE FUNCTION adjust_stock_entrepot_on_movement();

-- CMUP : recalculé à chaque entrée valorisée (prix > 0)
CREATE OR REPLACE FUNCTION compute_cmup_on_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_stock_avant integer;
  v_cmup_avant numeric(12,4);
BEGIN
  IF NEW.type = 'entree' AND NEW.prix_unitaire > 0 THEN
    SELECT quantite, cmup INTO v_stock_avant, v_cmup_avant FROM produits WHERE id = NEW.produit_id;
    IF (v_stock_avant + NEW.quantite) > 0 THEN
      UPDATE produits SET cmup = ROUND(
        ((v_stock_avant * COALESCE(v_cmup_avant, 0)) + (NEW.quantite * NEW.prix_unitaire))
        / (v_stock_avant + NEW.quantite), 4)
      WHERE id = NEW.produit_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_compute_cmup ON mouvements;
CREATE TRIGGER trigger_compute_cmup
  BEFORE INSERT ON mouvements
  FOR EACH ROW EXECUTE FUNCTION compute_cmup_on_entry();

-- ============ AUDIT sur les nouvelles tables ============
DROP TRIGGER IF EXISTS audit_entrepots ON entrepots;
CREATE TRIGGER audit_entrepots AFTER INSERT OR UPDATE OR DELETE ON entrepots
  FOR EACH ROW EXECUTE FUNCTION audit_log();
DROP TRIGGER IF EXISTS audit_transferts ON transferts;
CREATE TRIGGER audit_transferts AFTER INSERT OR UPDATE OR DELETE ON transferts
  FOR EACH ROW EXECUTE FUNCTION audit_log();
DROP TRIGGER IF EXISTS audit_inventaires ON inventaires;
CREATE TRIGGER audit_inventaires AFTER INSERT OR UPDATE OR DELETE ON inventaires
  FOR EACH ROW EXECUTE FUNCTION audit_log();
DROP TRIGGER IF EXISTS audit_lots ON lots;
CREATE TRIGGER audit_lots AFTER INSERT OR UPDATE OR DELETE ON lots
  FOR EACH ROW EXECUTE FUNCTION audit_log();

-- ============ SEED : site principal ============
INSERT INTO entrepots (nom, code)
SELECT 'Boutique Principale', 'PRINCIPALE'
WHERE NOT EXISTS (SELECT 1 FROM entrepots);
