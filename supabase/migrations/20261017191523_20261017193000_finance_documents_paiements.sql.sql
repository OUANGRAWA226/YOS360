/*
# Priorité 3 : finance et ventes — documents commerciaux, paiements, Mobile Money, TVA, caisse POS

1. Nouvelles Tables

## entreprise — paramètres de l'entreprise (une seule ligne, id = 1)
- `nom`, `slogan`, `adresse`, `ville`, `telephone`, `email` — en-tête des documents
- `logo_url` (texte) — URL ou data-URL du logo
- `tva_taux` (numeric, défaut 18) — TVA paramétrable (taux UEMOA courant)
- `tva_active` (boolean, défaut true)
- `devise` (texte, défaut 'XOF') — FCFA par défaut, multi-devises en option
- `mention_bas` (texte) — mention légale en pied de facture

## paiements — encaissements et décaissements
- `commande_id` (FK commandes, nullable) — rattachement optionnel à une vente/achat
- `client_id` / `fournisseur_id` (FK, nullables)
- `sens` : 'encaissement' (client) | 'decaissement' (fournisseur)
- `montant` (numeric > 0)
- `mode` : 'especes' | 'orange_money' | 'moov_money' | 'wave' | 'virement' | 'cheque' | 'carte'
- `reference` (texte) — n° transaction Mobile Money, n° chèque...
- `date_paiement`, `note`

2. Tables modifiées (ajouts non destructifs)
- `commandes` : + `type_document` ('devis'|'facture'|'bon_livraison'|'avoir', nullable),
  + `numero_document` (texte, numérotation légale), + `tva_taux`, + `montant_ht`, + `montant_tva`,
  + `date_echeance` (échéance de paiement), + `client_walkin` (nom libre pour vente comptoir).
- Le statut de paiement (impayé / partiel / payé) est calculé à la lecture
  à partir de la somme des paiements rattachés.

3. Sécurité
- RLS activée sur les nouvelles tables; politiques TO anon, authenticated (pattern existant).
- Trigger d'audit sur paiements et entreprise.

4. Notes importantes
- Les documents PDF sont générés côté navigateur (impression → PDF) avec logo et numérotation.
- Mobile Money : Orange Money, Moov Money et Wave sont des modes de paiement enregistrés;
  la passerelle API réelle nécessite un compte marchand (les références de transaction sont déjà suivies).
*/

-- ============ ENTREPRISE ============
CREATE TABLE IF NOT EXISTS entreprise (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nom text NOT NULL DEFAULT 'Mon Entreprise',
  slogan text,
  adresse text,
  ville text,
  telephone text,
  email text,
  logo_url text,
  tva_taux numeric(5,2) NOT NULL DEFAULT 18,
  tva_active boolean NOT NULL DEFAULT true,
  devise text NOT NULL DEFAULT 'XOF',
  mention_bas text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE entreprise ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_entreprise_select" ON entreprise;
CREATE POLICY "all_entreprise_select" ON entreprise FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "all_entreprise_insert" ON entreprise;
CREATE POLICY "all_entreprise_insert" ON entreprise FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "all_entreprise_update" ON entreprise;
CREATE POLICY "all_entreprise_update" ON entreprise FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO entreprise (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM entreprise);

-- ============ PAIEMENTS ============
CREATE TABLE IF NOT EXISTS paiements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid REFERENCES commandes(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  fournisseur_id uuid REFERENCES fournisseurs(id) ON DELETE SET NULL,
  sens text NOT NULL CHECK (sens IN ('encaissement', 'decaissement')),
  montant numeric(12,2) NOT NULL CHECK (montant > 0),
  mode text NOT NULL CHECK (mode IN ('especes', 'orange_money', 'moov_money', 'wave', 'virement', 'cheque', 'carte')),
  reference text,
  date_paiement timestamptz DEFAULT now(),
  note text
);

ALTER TABLE paiements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_paiements_select" ON paiements;
CREATE POLICY "all_paiements_select" ON paiements FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "all_paiements_insert" ON paiements;
CREATE POLICY "all_paiements_insert" ON paiements FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "all_paiements_update" ON paiements;
CREATE POLICY "all_paiements_update" ON paiements FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "all_paiements_delete" ON paiements;
CREATE POLICY "all_paiements_delete" ON paiements FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_paiements_commande ON paiements(commande_id);
CREATE INDEX IF NOT EXISTS idx_paiements_client ON paiements(client_id);
CREATE INDEX IF NOT EXISTS idx_paiements_fournisseur ON paiements(fournisseur_id);
CREATE INDEX IF NOT EXISTS idx_paiements_date ON paiements(date_paiement DESC);

-- ============ COLONNES COMMANDES ============
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS type_document text CHECK (type_document IN ('devis', 'facture', 'bon_livraison', 'avoir'));
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS numero_document text;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS tva_taux numeric(5,2);
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS montant_ht numeric(12,2);
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS montant_tva numeric(12,2);
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS date_echeance timestamptz;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS client_walkin text;

CREATE INDEX IF NOT EXISTS idx_commandes_type_doc ON commandes(type_document);
CREATE INDEX IF NOT EXISTS idx_commandes_numero_doc ON commandes(numero_document);

-- ============ AUDIT ============
DROP TRIGGER IF EXISTS audit_paiements ON paiements;
CREATE TRIGGER audit_paiements AFTER INSERT OR UPDATE OR DELETE ON paiements
  FOR EACH ROW EXECUTE FUNCTION audit_log();
DROP TRIGGER IF EXISTS audit_entreprise ON entreprise;
CREATE TRIGGER audit_entreprise AFTER UPDATE ON entreprise
  FOR EACH ROW EXECUTE FUNCTION audit_log();
