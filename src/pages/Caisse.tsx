import { useState, useMemo } from 'react';
import { Plus, Minus, Trash2, ShoppingCart, Printer, Store, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ProduitWithCategorie, Client, Paiement, ModePaiement, Entreprise } from '@/lib/supabase';
import { can, type Role } from '@/lib/permissions';
import { showToast } from '@/components/Toast';
import { formatCurrency, MODES_PAIEMENT, nextNumeroDocument } from '@/lib/format';

type Props = {
  produits: ProduitWithCategorie[];
  clients: Client[];
  entreprise: Entreprise | null;
  numerosFactures: string[];
  role: Role | null;
  onRefresh: () => void;
};

type LigneCaisse = { produit: ProduitWithCategorie; quantite: number };

// Caisse (POS) : vente au comptoir, paiement Mobile Money/espèces, ticket thermique 58mm.
export function Caisse({ produits, clients, entreprise, numerosFactures, role, onRefresh }: Props) {
  const canUse = can(role, 'caisse', 'create');
  const devise = entreprise?.devise || 'XOF';
  const [panier, setPanier] = useState<LigneCaisse[]>([]);
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [walkinNom, setWalkinNom] = useState('');
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [reference, setReference] = useState('');
  const [montantRecu, setMontantRecu] = useState('');
  const [encaisse, setEncaisse] = useState(false);
  const [saving, setSaving] = useState(false);

  const tvaTaux = entreprise?.tva_taux ?? 18;
  const tvaActive = entreprise?.tva_active !== false;

  const resultats = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return produits.slice(0, 12);
    return produits
      .filter((p) => p.nom.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.code_barres || '').toLowerCase().includes(q))
      .slice(0, 12);
  }, [produits, search]);

  const total = panier.reduce((s, l) => s + l.quantite * l.produit.prix_vente, 0);
  const ht = tvaActive ? total / (1 + tvaTaux / 100) : total;
  const tva = total - ht;
  const recu = parseFloat(montantRecu) || 0;
  const rendu = Math.max(recu - total, 0);

  const ajouter = (p: ProduitWithCategorie) => {
    if (!canUse) { showToast('Action non permise pour votre rôle', 'error'); return; }
    setPanier((prev) => {
      const existant = prev.find((l) => l.produit.id === p.id);
      if (existant) {
        if (existant.quantite >= p.quantite) { showToast('Stock insuffisant', 'error'); return prev; }
        return prev.map((l) => (l.produit.id === p.id ? { ...l, quantite: l.quantite + 1 } : l));
      }
      if (p.quantite < 1) { showToast('Stock insuffisant', 'error'); return prev; }
      return [...prev, { produit: p, quantite: 1 }];
    });
  };

  const changerQte = (pid: string, delta: number) => {
    setPanier((prev) => prev
      .map((l) => (l.produit.id === pid ? { ...l, quantite: l.quantite + delta } : l))
      .filter((l) => l.quantite > 0)
      .map((l) => (l.quantite > l.produit.quantite ? { ...l, quantite: l.produit.quantite } : l))
    );
  };

  const encaisser = async () => {
    if (panier.length === 0) { showToast('Panier vide', 'error'); return; }
    if (!navigator.onLine) { showToast('La caisse nécessite une connexion internet', 'error'); return; }
    setSaving(true);
    try {
      const client = clients.find((c) => c.id === clientId) ?? null;
      const panierPayload = panier.map((l) => ({
        produit_id: l.produit.id,
        quantite: l.quantite,
        prix_vente: l.produit.prix_vente,
      }));

      // Tentative d'encaissement transactionnel atomique via RPC PostgreSQL
      const { data: rpcRes, error: rpcError } = await supabase.rpc('encaisser_vente_pos', {
        p_client_id: clientId || null,
        p_client_walkin: clientId ? null : (walkinNom.trim() || 'Client comptoir'),
        p_mode_paiement: mode,
        p_reference: reference.trim() || null,
        p_montant_recu: recu,
        p_panier: panierPayload,
        p_tva_taux: tvaTaux,
        p_tva_active: tvaActive,
      });

      let cmdId: string;
      let numeroDoc: string;
      let finalTotal = total;
      let finalHt = ht;
      let finalTva = tva;
      let finalRendu = rendu;

      if (!rpcError && rpcRes) {
        const res = rpcRes as {
          commande_id: string;
          numero_document: string;
          montant_ht: number;
          montant_tva: number;
          montant_total: number;
          rendu: number;
        };
        cmdId = res.commande_id;
        numeroDoc = res.numero_document;
        finalTotal = res.montant_total;
        finalHt = res.montant_ht;
        finalTva = res.montant_tva;
        finalRendu = res.rendu;
      } else {
        // En cas d'absence de la fonction RPC sur le serveur Supabase distant, repli contrôlé
        console.warn('RPC encaisser_vente_pos non disponible, repli sur méthode standard:', rpcError?.message);
        numeroDoc = nextNumeroDocument('facture', numerosFactures);
        const statutPaiement = mode === 'especes' && recu >= total ? 'recue' : 'en_attente';

        const { data: cmd, error: cmdError } = await supabase
          .from('commandes')
          .insert({
            type: 'vente',
            client_id: clientId || null,
            client_walkin: clientId ? null : (walkinNom.trim() || 'Client comptoir'),
            statut: statutPaiement,
            reference: numeroDoc.replace('FAC', 'VEN'),
            numero_document: numeroDoc,
            type_document: 'facture' as const,
            tva_taux: tvaActive ? tvaTaux : null,
            montant_ht: ht,
            montant_tva: tvaActive ? tva : 0,
            montant_total: total,
            note: mode !== 'especes' ? `Paiement ${MODES_PAIEMENT.find((m) => m.value === mode)?.label}${reference ? ` — réf ${reference}` : ''}` : null,
          })
          .select()
          .single();
        if (cmdError) throw cmdError;
        cmdId = cmd.id;

        const { error: itemsError } = await supabase.from('commande_items').insert(
          panier.map((l) => ({
            commande_id: cmdId,
            produit_id: l.produit.id,
            quantite: l.quantite,
            prix_unitaire: l.produit.prix_vente,
            sous_total: l.quantite * l.produit.prix_vente,
          }))
        );
        if (itemsError) throw itemsError;

        for (const l of panier) {
          const { error: mvtError } = await supabase.from('mouvements').insert({
            produit_id: l.produit.id,
            type: 'sortie' as const,
            quantite: l.quantite,
            motif: 'Vente comptoir ' + numeroDoc,
            reference: numeroDoc,
          });
          if (mvtError) throw mvtError;
        }

        const { error: payError } = await supabase.from('paiements').insert({
          commande_id: cmdId,
          client_id: clientId || null,
          sens: 'encaissement' as const,
          montant: total,
          mode,
          reference: reference.trim() || null,
          note: 'Vente caisse',
        });
        if (payError) throw payError;
      }

      const doc = buildTicket(
        cmdId,
        numeroDoc,
        panier,
        { ht: finalHt, tva: finalTva, total: finalTotal, tvaTaux, tvaActive },
        mode,
        reference,
        finalRendu,
        entreprise,
        client
      );

      const w = window.open('', '_blank', 'width=340,height=640');
      if (!w) {
        showToast('Autorisez les fenêtres surgissantes pour imprimer le ticket', 'error');
      } else {
        w.document.write(doc);
        w.document.close();
        setTimeout(() => { w.focus(); w.print(); }, 350);
      }

      showToast(`Vente ${numeroDoc} encaissée — ${formatCurrency(finalTotal, devise)}`);
      setPanier([]); setClientId(''); setWalkinNom(''); setMontantRecu(''); setReference(''); setEncaisse(false);
      onRefresh();
    } catch (e) {
      showToast('Erreur: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!canUse) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
        <Store className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Votre rôle ne permet pas d'accéder à la caisse.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Caisse</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Vente au comptoir — ticket thermique 58 mm</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Catalogue */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (nom, SKU, code-barres)..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" autoFocus />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {resultats.map((p) => (
              <button key={p.id} onClick={() => ajouter(p)} disabled={p.quantite < 1}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-left hover:border-sky-300 hover:shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                <p className="font-medium text-slate-900 text-sm line-clamp-2">{p.nom}</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{p.sku || '—'}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold text-sky-700 text-sm">{formatCurrency(p.prix_vente, devise)}</span>
                  <span className={`text-xs ${p.quantite <= p.seuil_alerte ? 'text-amber-600' : 'text-slate-400'}`}>{p.quantite} dispo</span>
                </div>
              </button>
            ))}
            {resultats.length === 0 && (
              <div className="col-span-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400 text-sm">Aucun produit</div>
            )}
          </div>
        </div>

        {/* Panier + paiement */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 lg:sticky lg:top-20 space-y-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-sky-600" /> Panier ({panier.length})</h3>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {panier.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Touchez un produit pour l'ajouter</p>
              ) : panier.map((l) => (
                <div key={l.produit.id} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{l.produit.nom}</p>
                    <p className="text-xs text-slate-500">{formatCurrency(l.produit.prix_vente, devise)} × {l.quantite}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => changerQte(l.produit.id, -1)} className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 transition-colors"><Minus className="w-3.5 h-3.5" /></button>
                    <span className="w-8 text-center text-sm font-bold">{l.quantite}</span>
                    <button onClick={() => changerQte(l.produit.id, 1)} className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setPanier((prev) => prev.filter((x) => x.produit.id !== l.produit.id))} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totaux */}
            <div className="border-t border-slate-100 pt-3 space-y-1 text-sm">
              {tvaActive && (
                <>
                  <div className="flex justify-between text-slate-500"><span>Total HT</span><span>{formatCurrency(ht, devise)}</span></div>
                  <div className="flex justify-between text-slate-500"><span>TVA ({tvaTaux}%)</span><span>{formatCurrency(tva, devise)}</span></div>
                </>
              )}
              <div className="flex justify-between text-lg font-bold text-slate-900"><span>Total TTC</span><span>{formatCurrency(total, devise)}</span></div>
            </div>

            {/* Client + paiement */}
            <div className="border-t border-slate-100 pt-3 space-y-3">
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
                <option value="">Client comptoir</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
              {!clientId && (
                <input type="text" value={walkinNom} onChange={(e) => setWalkinNom(e.target.value)} placeholder="Nom du client (optionnel)"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
              )}
              <div className="grid grid-cols-2 gap-2">
                {MODES_PAIEMENT.filter((m) => m.value !== 'cheque' && m.value !== 'virement').map((m) => (
                  <button key={m.value} onClick={() => setMode(m.value as ModePaiement)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-all border ${
                      mode === m.value ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}>
                    {m.label}
                  </button>
                ))}
              </div>
              {MODES_PAIEMENT.find((m) => m.value === mode)?.mobile && (
                <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ID transaction Mobile Money"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500" />
              )}
              {mode === 'especes' && (
                <div>
                  <input type="number" step="1" value={montantRecu} onChange={(e) => { setMontantRecu(e.target.value); setEncaisse(true); }} placeholder="Montant reçu"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                  {encaisse && recu >= total && total > 0 && (
                    <p className="text-sm font-bold text-emerald-700 mt-1">À rendre : {formatCurrency(rendu, devise)}</p>
                  )}
                  {encaisse && recu > 0 && recu < total && (
                    <p className="text-sm text-amber-700 mt-1">Il manque {formatCurrency(total - recu, devise)}</p>
                  )}
                </div>
              )}
            </div>

            <button onClick={encaisser} disabled={saving || panier.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 disabled:opacity-50">
              <Printer className="w-5 h-5" /> {saving ? 'Encaissement...' : `Encaisser ${formatCurrency(total, devise)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildTicket(
  _cmdId: string,
  numero: string,
  lignes: LigneCaisse[],
  totaux: { ht: number; tva: number; total: number; tvaTaux: number; tvaActive: boolean },
  mode: ModePaiement,
  reference: string | null,
  rendu: number,
  entreprise: Entreprise | null,
  client: Client | null
): string {
  const esc = (s: string | null | undefined) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
  const symbole = entreprise?.devise === 'XOF' ? 'FCFA' : entreprise?.devise === 'EUR' ? 'EUR' : (entreprise?.devise || 'FCFA');
  const largeur = 58;

  const lignesHtml = lignes.map((l) => `
    <tr>
      <td colspan="3" style="padding-top:4px">${esc(l.produit.nom)}</td>
    </tr>
    <tr>
      <td style="font-size:10px">${l.quantite} × ${fmt(l.produit.prix_vente)}</td>
      <td></td>
      <td style="text-align:right;font-weight:600">${fmt(l.quantite * l.produit.prix_vente)}</td>
    </tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8" /><title>Ticket ${esc(numero)}</title>
<style>
  @page { size: ${largeur}mm auto; margin: 2mm; }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: ${largeur}mm; margin: 0 auto; color: #000; }
  h2 { text-align: center; font-size: 14px; margin: 2px 0; }
  p { margin: 1px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  td { vertical-align: top; }
  .c { text-align: center; }
  .r { text-align: right; }
  .sep { border-top: 1px dashed #000; margin: 5px 0; }
  .total { font-size: 13px; font-weight: bold; }
  .foot { text-align: center; font-size: 10px; margin-top: 8px; }
</style></head><body>
  <h2>${esc(entreprise?.nom || 'CAISSE')}</h2>
  ${entreprise?.slogan ? `<p class="c" style="font-size:10px">${esc(entreprise.slogan)}</p>` : ''}
  ${entreprise?.adresse ? `<p class="c" style="font-size:10px">${esc(entreprise.adresse)} ${esc(entreprise.ville || '')}</p>` : ''}
  ${entreprise?.telephone ? `<p class="c" style="font-size:10px">Tel: ${esc(entreprise.telephone)}</p>` : ''}
  <div class="sep"></div>
  <p class="c">TICKET — ${esc(numero)}</p>
  <p class="c" style="font-size:10px">${new Date().toLocaleString('fr-FR')}</p>
  ${client || entreprise?.tva_active ? `<p class="c" style="font-size:10px">${client ? esc(client.nom) : ''}${client && entreprise?.tva_active ? ' — ' : ''}${entreprise?.tva_active ? 'TVA ' + totaux.tvaTaux + '%' : ''}</p>` : ''}
  <div class="sep"></div>
  <table>${lignesHtml}</table>
  <div class="sep"></div>
  ${totaux.tvaActive ? `<p style="font-size:10px">Total HT: ${fmt(totaux.ht)}</p><p style="font-size:10px">TVA: ${fmt(totaux.tva)}</p>` : ''}
  <p class="total">TOTAL: ${fmt(totaux.total)} ${symbole}</p>
  <p>Paiement: ${MODES_PAIEMENT.find((m) => m.value === mode)?.label || mode}${reference ? ' — ' + esc(reference) : ''}</p>
  ${mode === 'especes' && rendu > 0 ? `<p>Reçu: ${fmt(totaux.total + rendu)} — Rendu: ${fmt(rendu)} ${symbole}</p>` : ''}
  <div class="sep"></div>
  <p class="c">Merci de votre visite !</p>
  ${entreprise?.mention_bas ? `<p class="c" style="font-size:9px">${esc(entreprise.mention_bas)}</p>` : ''}
  <p class="c" style="font-size:9px">— Extrait le ${new Date().toLocaleString('fr-FR')} —</p>
</body></html>`;
}
