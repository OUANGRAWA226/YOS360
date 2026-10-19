/*
# API/Webhooks partie 3 : table webhook_deliveries + index

## 1. Modifications
- Creation de webhook_deliveries : historique des envois de webhooks (evenement, payload,
  statut, code HTTP, reponse, tentatives), lisée aux endpoints par cle etrangere.
- Index de performance sur key_hash (api_keys) et endpoint_id/created_at (deliveries).

## 2. Securite
- RLS active. Lecture autorisee si l'entete x-manage-token correspond au manage_token
  du endpoint parent.
*/

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  evenement text NOT NULL,
  payload jsonb NOT NULL,
  statut text NOT NULL DEFAULT 'pending',
  code_http int,
  reponse text,
  tentatives int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_deliveries_select_with_token" ON webhook_deliveries;
CREATE POLICY "webhook_deliveries_select_with_token" ON webhook_deliveries
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM webhook_endpoints e
    WHERE e.id = webhook_deliveries.endpoint_id
      AND e.manage_token = current_setting('request.headers', true)::json->>'x-manage-token'
  )
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);
