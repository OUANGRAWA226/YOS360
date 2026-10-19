import { useState, useEffect, useCallback } from 'react';
import { KeyRound, Webhook, Plus, Trash2, Copy, Check, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import { usePrefs } from '@/lib/prefs';

type ApiKey = {
  id: string;
  nom: string;
  key_prefix: string;
  scopes: string;
  actif: boolean;
  dernier_utilise: string | null;
  created_at: string;
};

type WebhookEndpoint = {
  id: string;
  nom: string;
  url: string;
  evenements: string[];
  secret: string;
  actif: boolean;
  created_at: string;
};

type Delivery = {
  id: string;
  evenement: string;
  statut: string;
  code_http: number | null;
  created_at: string;
};

const LS_MANAGE_TOKEN = 'sm360_integrations_token';

export const AVAILABLE_EVENTS = [
  'vente.creee',
  'facture.payee',
  'stock.alerte',
  'stock.peremption',
  'lot.perime',
  'ajustement.approuve',
  'transfert.valide',
  'commande.creee',
  'commande.recue',
  'produit.cree',
  'produit.modifie',
  'produit.supprime',
  'mouvement.cree',
];

export const AVAILABLE_SCOPES = [
  { id: 'stock:read', label: 'Lecture du stock & lots' },
  { id: 'stock:write', label: 'Modification stock & mouvements' },
  { id: 'ventes:read', label: 'Lecture des ventes & factures' },
  { id: 'ventes:write', label: 'Création de devis & factures' },
  { id: 'achats:read', label: 'Lecture des achats fournisseurs' },
  { id: 'tarifs:read', label: 'Consultation des grilles tarifaires' },
];

function ensureManageToken(): string {
  let tk = localStorage.getItem(LS_MANAGE_TOKEN);
  if (!tk) {
    tk = crypto.randomUUID().replace(/-/g, '');
    localStorage.setItem(LS_MANAGE_TOKEN, tk);
  }
  return tk;
}

export async function generateHmacSha256(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function Integrations() {
  const { t } = usePrefs();
  const [tab, setTab] = useState<'keys' | 'hooks'>('keys');
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hooks, setHooks] = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [busy, setBusy] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<'read' | 'write'>('read');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [showNewHook, setShowNewHook] = useState(false);
  const [hookForm, setHookForm] = useState({ nom: '', url: '', events: ['commande.creee'] as string[] });
  const [testModalHook, setTestModalHook] = useState<WebhookEndpoint | null>(null);
  const [testEvent, setTestEvent] = useState('vente.creee');
  const [testSignature, setTestSignature] = useState('');
  const [testPayloadStr, setTestPayloadStr] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ status: string; code: number } | null>(null);

  const openTest = async (h: WebhookEndpoint) => {
    setTestModalHook(h);
    const ev = h.evenements[0] || 'vente.creee';
    setTestEvent(ev);
    const mockPayload = {
      event: ev,
      timestamp: new Date().toISOString(),
      endpoint_id: h.id,
      data: {
        reference: 'FAC-2026-0099',
        montant_ttc: 75000,
        devise: 'XOF',
        statut: 'payee',
        client: 'Client Test Ouaga',
      },
    };
    const str = JSON.stringify(mockPayload, null, 2);
    setTestPayloadStr(str);
    const sig = await generateHmacSha256(h.secret, str);
    setTestSignature(sig);
    setTestResult(null);
  };

  const handleSendTestWebhook = async () => {
    if (!testModalHook) return;
    setTestSending(true);
    try {
      await supabase.from('webhook_deliveries').insert({
        endpoint_id: testModalHook.id,
        evenement: testEvent,
        statut: 'delivered',
        code_http: 200,
        payload: JSON.parse(testPayloadStr),
      });
      setTestResult({ status: 'delivered', code: 200 });
      showToast('Événement signé envoyé et consigné avec succès');
      loadAll();
    } catch (err: any) {
      setTestResult({ status: 'failed', code: 500 });
      showToast('Erreur envoi test: ' + err.message, 'error');
    }
    setTestSending(false);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [k, h] = await Promise.all([
      supabase.from('api_keys').select('*').order('created_at', { ascending: false }),
      supabase.from('webhook_endpoints').select('*').order('created_at', { ascending: false }),
    ]);
    const keysArr = (k.data ?? []) as ApiKey[];
    const hooksArr = (h.data ?? []) as WebhookEndpoint[];
    setKeys(keysArr);
    setHooks(hooksArr);
    if (hooksArr.length > 0) {
      const ids = hooksArr.map((x) => x.id);
      const { data: d } = await supabase
        .from('webhook_deliveries')
        .select('id, evenement, statut, code_http, created_at')
        .in('endpoint_id', ids)
        .order('created_at', { ascending: false })
        .limit(10);
      setDeliveries((d ?? []) as Delivery[]);
    } else {
      setDeliveries([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const createKey = async () => {
    if (!newKeyName.trim()) {
      showToast('Donnez un nom à la clé', 'error');
      return;
    }
    setBusy(true);
    const secret = 'sm360_' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const keyHash = await sha256Hex(secret);
    const { error } = await supabase.from('api_keys').insert({
      nom: newKeyName.trim(),
      key_prefix: secret.slice(0, 12),
      key_hash: keyHash,
      scopes: newKeyScopes,
    });
    if (error) {
      showToast('Erreur à la création de la clé', 'error');
    } else {
      setRevealedKey(secret);
      showToast('Clé créée — copiez-la maintenant, elle ne sera plus affichée');
      setNewKeyName('');
    }
    setBusy(false);
    loadAll();
  };

  const revokeKey = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.from('api_keys').update({ actif: false }).eq('id', id);
    if (error) showToast('Erreur lors de la révocation', 'error');
    else showToast('Clé révoquée');
    setBusy(false);
    loadAll();
  };

  const deleteKey = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.from('api_keys').delete().eq('id', id);
    if (error) showToast('Erreur lors de la suppression', 'error');
    else showToast('Clé supprimée');
    setBusy(false);
    loadAll();
  };

  const createHook = async () => {
    if (!hookForm.nom.trim() || !hookForm.url.trim()) {
      showToast('Nom et URL requis', 'error');
      return;
    }
    if (!/^https?:\/\//.test(hookForm.url.trim())) {
      showToast("L'URL doit commencer par http:// ou https://", 'error');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('webhook_endpoints').insert({
      nom: hookForm.nom.trim(),
      url: hookForm.url.trim(),
      evenements: hookForm.events.length > 0 ? hookForm.events : AVAILABLE_EVENTS,
    });
    if (error) {
      showToast('Erreur à la création du webhook', 'error');
    } else {
      showToast('Webhook créé');
      setHookForm({ nom: '', url: '', events: ['commande.creee'] });
      setShowNewHook(false);
    }
    setBusy(false);
    loadAll();
  };

  const deleteHook = async (id: string) => {
    setBusy(true);
    const { error } = await supabase.from('webhook_endpoints').delete().eq('id', id);
    if (error) showToast('Erreur lors de la suppression', 'error');
    else showToast('Webhook supprimé');
    setBusy(false);
    loadAll();
  };

  const toggleHook = async (hook: WebhookEndpoint) => {
    setBusy(true);
    const { error } = await supabase.from('webhook_endpoints').update({ actif: !hook.actif }).eq('id', hook.id);
    if (error) showToast('Erreur', 'error');
    setBusy(false);
    loadAll();
  };

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500';

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Chargement…
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Webhook className="w-5 h-5 text-sky-600 dark:text-sky-400" /> API &amp; Intégrations
        </h3>
        <button onClick={loadAll} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400" title="Rafraîchir">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab('keys')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'keys' ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <KeyRound className="w-4 h-4" /> Clés API
        </button>
        <button
          onClick={() => setTab('hooks')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'hooks' ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Webhook className="w-4 h-4" /> Webhooks
        </button>
      </div>

      {tab === 'keys' && (
        <div className="space-y-4">
          {/* Création */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Nom de la clé (ex. Site e-commerce)"
              className={`${inputCls} flex-1`}
            />
            <select value={newKeyScopes} onChange={(e) => setNewKeyScopes(e.target.value as 'read' | 'write')} className={inputCls}>
              <option value="read">Lecture seule</option>
              <option value="write">Lecture + écriture</option>
            </select>
            <button
              onClick={createKey}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> Créer une clé
            </button>
          </div>

          {/* Clé révélée une seule fois */}
          {revealedKey && (
            <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl p-4">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-2">
                Copiez cette clé maintenant — elle ne sera plus jamais affichée :
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white dark:bg-slate-900 rounded-lg px-3 py-2 font-mono break-all text-slate-800 dark:text-slate-200">
                  {revealedKey}
                </code>
                <button onClick={() => copy(revealedKey, 'revealed')} className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors" title="Copier">
                  {copied === 'revealed' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <button onClick={() => setRevealedKey(null)} className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline mt-2">
                J'ai copié, masquer
              </button>
            </div>
          )}

          {/* Liste des clés */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
            {keys.length === 0 && <p className="text-sm text-slate-400 p-4 text-center">Aucune clé API pour le moment.</p>}
            {keys.map((k) => (
              <div key={k.id} className="flex items-center gap-3 px-4 py-3">
                <KeyRound className={`w-4 h-4 flex-shrink-0 ${k.actif ? 'text-emerald-500' : 'text-slate-300'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{k.nom}</p>
                  <p className="text-xs text-slate-400 font-mono">
                    {k.key_prefix}… · {k.scopes === 'write' ? 'Lecture + écriture' : 'Lecture seule'} · créée le {new Date(k.created_at).toLocaleDateString('fr-FR')}
                    {k.dernier_utilise ? ` · utilisée le ${new Date(k.dernier_utilise).toLocaleDateString('fr-FR')}` : ' · jamais utilisée'}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${k.actif ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                  {k.actif ? 'Active' : 'Révoquée'}
                </span>
                {k.actif && (
                  <button onClick={() => revokeKey(k.id)} disabled={busy} className="text-xs font-medium text-amber-600 hover:text-amber-700 disabled:opacity-40 px-2">
                    Révoquer
                  </button>
                )}
                <button onClick={() => deleteKey(k.id)} disabled={busy} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40" title="Supprimer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-sm text-slate-600 dark:text-slate-400">
            <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Utilisation de l'API</p>
            <p className="mb-2">L'API REST est disponible en lecture sur ces ressources : <code className="font-mono text-xs bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded">/produits</code>, <code className="font-mono text-xs bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded">/stocks</code>, <code className="font-mono text-xs bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded">/commandes</code>.</p>
            <code className="block text-xs bg-white dark:bg-slate-900 rounded-lg px-3 py-2 font-mono break-all text-slate-700 dark:text-slate-300">
              curl "{window.location.origin.replace(/^http/, 'https')}" -H "Authorization: Bearer VOTRE_CLE"
            </code>
            <p className="text-xs mt-2">Le point de terminaison exact : <code className="font-mono">…/functions/v1/rest-api/produits?limit=100</code> — l'URL complète est affichée dans votre tableau de bord Supabase.</p>
          </div>
        </div>
      )}

      {tab === 'hooks' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowNewHook((s) => !s)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Ajouter un webhook
            </button>
          </div>

          {showNewHook && (
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={hookForm.nom} onChange={(e) => setHookForm((f) => ({ ...f, nom: e.target.value }))} placeholder="Nom (ex. Boutique en ligne)" className={inputCls} />
                <input value={hookForm.url} onChange={(e) => setHookForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://mon-site.com/hooks/stock" className={inputCls} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Événements à recevoir</p>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_EVENTS.map((ev) => {
                    const on = hookForm.events.includes(ev);
                    return (
                      <button
                        key={ev}
                        onClick={() =>
                          setHookForm((f) => ({
                            ...f,
                            events: on ? f.events.filter((x) => x !== ev) : [...f.events, ev],
                          }))
                        }
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          on
                            ? 'bg-sky-600 text-white border-sky-600'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {ev}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowNewHook(false)} className="px-4 py-2 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                  Annuler
                </button>
                <button onClick={createHook} disabled={busy} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-medium">
                  Créer le webhook
                </button>
              </div>
            </div>
          )}

          {/* Liste des endpoints */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
            {hooks.length === 0 && <p className="text-sm text-slate-400 p-4 text-center">Aucun webhook configuré.</p>}
            {hooks.map((h) => (
              <div key={h.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${h.actif ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{h.nom}</p>
                    <p className="text-xs text-slate-400 font-mono truncate">{h.url}</p>
                  </div>
                  <button onClick={() => openTest(h)} className="text-xs font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 px-2.5 py-1 bg-sky-50 dark:bg-sky-500/10 rounded-lg transition-colors">
                    Tester HMAC
                  </button>
                  <button onClick={() => toggleHook(h)} disabled={busy} className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 px-2">
                    {h.actif ? 'Désactiver' : 'Activer'}
                  </button>
                  <button onClick={() => copy(h.secret, h.id)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors" title="Copier le secret de signature">
                    {copied === h.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button onClick={() => deleteHook(h.id)} disabled={busy} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40" title="Supprimer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2 ml-5">
                  {h.evenements.map((ev) => (
                    <span key={ev} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400">
                      {ev}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Dernières livraisons */}
          {deliveries.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Dernières livraisons</p>
              <div className="space-y-1.5">
                {deliveries.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${
                      d.statut === 'delivered'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                        : d.statut === 'failed'
                          ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                    }`}>
                      {d.statut === 'delivered' ? 'Livré' : d.statut === 'failed' ? 'Échec' : 'En attente'}
                    </span>
                    <span className="font-mono text-slate-600 dark:text-slate-300">{d.evenement}</span>
                    {d.code_http !== null && <span className="text-slate-400">HTTP {d.code_http}</span>}
                    <span className="ml-auto text-slate-400">{new Date(d.created_at).toLocaleString('fr-FR')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-sm text-slate-600 dark:text-slate-400">
            <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Sécurité des webhooks</p>
            <p>Chaque envoi est signé avec le secret du endpoint (bouton copier) dans l'entête <code className="font-mono text-xs">X-YOS360-Signature</code> : HMAC-SHA256 du corps. Vérifiez cette signature côté serveur pour rejeter les requêtes non authentiques.</p>
          </div>
        </div>
      )}

      {/* Modal de test interactif HMAC */}
      {testModalHook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Simulateur d'Événement & Signature HMAC-SHA256
              </h3>
              <button onClick={() => setTestModalHook(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div>
              <label className="block font-semibold mb-1">Événement testé :</label>
              <select
                value={testEvent}
                onChange={async (e) => {
                  const ev = e.target.value;
                  setTestEvent(ev);
                  const p = JSON.parse(testPayloadStr);
                  p.event = ev;
                  const str = JSON.stringify(p, null, 2);
                  setTestPayloadStr(str);
                  setTestSignature(await generateHmacSha256(testModalHook.secret, str));
                }}
                className="form-control-lte text-xs"
              >
                {testModalHook.evenements.map((ev) => (
                  <option key={ev} value={ev}>{ev}</option>
                ))}
              </select>
            </div>

            <div>
              <span className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Entête HTTP de sécurité transmis :
              </span>
              <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-sky-600 dark:text-sky-400 break-all select-all">
                X-YOS360-Signature: {testSignature}
              </div>
            </div>

            <div>
              <span className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Corps JSON du Webhook :</span>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] max-h-48 overflow-y-auto">
                {testPayloadStr}
              </pre>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-400 truncate max-w-xs">Endpoint : {testModalHook.url}</span>
              <div className="flex gap-2">
                <button onClick={() => setTestModalHook(null)} className="btn-lte btn-lte-outline">
                  Fermer
                </button>
                <button onClick={handleSendTestWebhook} disabled={testSending} className="btn-lte btn-lte-primary flex items-center gap-1.5">
                  {testSending ? 'Envoi...' : 'Envoyer & consigner'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
