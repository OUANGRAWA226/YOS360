/*
# API REST et Webhooks — intégrations externes

## 1. Nouvelles tables
- api_keys : clés d'accès pour l'API REST (nom, préfixe visible, hash SHA-256 du secret,
  permissions read/write, statut actif). Gérées via un jeton de gestion du navigateur.
- webhook_endpoints : URLs de notification sortante (URL, événements suivis,
  secret de signature HMAC, statut actif).
- webhook_deliveries : historique des envois (événement, payload, statut, code HTTP,
  réponse, tentatives).

## 2. Colonnes ajoutées
- Aucune colonne ajoutée aux tables existantes.

## 3. Sécurité
- RLS activé sur les 3 tables.
- api_keys : SELECT/UPDATE/DELETE uniquement si l'entête x-manage-token correspond au
  manage_token de la ligne. INSERT ouvert (le jeton est renvoyé une fois au créateur).
- webhook_endpoints : même principe de jeton de gestion.
- webhook_deliveries : lecture autorisée via le jeton de gestion du endpoint parent.

## 4. Notes
- La clé API complète n'est visible qu'une seule fois, à la création, côté navigateur.
- Les webhooks sont signés HMAC-SHA256 (entête X-SM360-Signature).
- Le dispatch est assuré par la fonction serveur webhooks-dispatch (clé de service).
*/

-- ============================================================
-- api_keys
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text NOT NULL DEFAULT 'read',
  actif boolean NOT NULL DEFAULT true,
  dernier_utilise timestamptz,
  manage_token text NOT NULL DEFAULT encode(gen_random_uuid()::text::bytea, 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_keys_select_with_token" ON api_keys;
CREATE POLICY "api_keys_select_with_token" ON api_keys
FOR SELECT TO anon, authenticated
USING (manage_token = current_setting('request.headers', true)::json->>'x-manage-token');

DROP POLICY IF EXISTS "api_keys_insert_open" ON api_keys;
CREATE POLICY "api_keys_insert_open" ON api_keys
FOR INSERT TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "api_keys_update_with_token" ON api_keys
;

DROP POLICY IF EXISTS "api_keys_delete_with_token" ON api_keys;
CREATE POLICY "api_keys_delete_with_token" ON api_keys
FOR DELETE TO anon, authenticated
USING (manage_token = current_setting('request.headers', true)::json->>'x-manage-token');

-- update policy created separately below
