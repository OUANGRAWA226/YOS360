import { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Printer,
  Store,
  Search,
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle2,
  Scale,
  Smartphone,
  Banknote,
  CreditCard,
  FileText,
  DollarSign,
  UserCheck,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ProduitWithCategorie, Client, Paiement, ModePaiement, Entreprise } from '@/lib/supabase';
import { can, type Role } from '@/lib/permissions';
import { showToast } from '@/components/Toast';
import { formatCurrency, MODES_PAIEMENT, nextNumeroDocument, formatNumber } from '@/lib/format';
import { Card, Callout, InfoBox } from '@/components/adminlte';
import { Modal } from '@/components/Modal';
import { enqueue } from '@/lib/offline';

type Props = {
  produits: ProduitWithCategorie[];
  clients: Client[];
  entreprise: Entreprise | null;
  numerosFactures: string[];
  role: Role | null;
  onRefresh: () => void;
};

type LigneCaisse = { produit: ProduitWithCategorie; quantite: number };

export interface CaisseSession {
  id: string;
  numero_session: string;
  date_ouverture: string;
  fond_caisse_ouverture: number;
  total_especes_theorique: number;
  total_mobile_money: number;
  total_carte: number;
  total_credit: number;
  total_ventes: number;
  nb_ventes: number;
  statut: 'ouverte' | 'cloturee';
}

export interface PaiementFractionne {
  mode: ModePaiement;
  montant: number;
  reference?: string;
}

export function Caisse({ produits, clients, entreprise, numerosFactures, role, onRefresh }: Props) {
  const canUse = can(role, 'caisse', 'create');
  const devise = entreprise?.devise || 'XOF';
  const tvaTaux = entreprise?.tva_taux ?? 18;
  const tvaActive = entreprise?.tva_active !== false;

  // Session de caisse active
  const [session, setSession] = useState<CaisseSession | null>(() => {
    try {
      const saved = localStorage.getItem('yos360_active_pos_session');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return null;
  });

  const saveActiveSession = (sess: CaisseSession | null) => {
    setSession(sess);
    try {
      if (sess) localStorage.setItem('yos360_active_pos_session', JSON.stringify(sess));
      else localStorage.removeItem('yos360_active_pos_session');
    } catch {
      // ignore
    }
  };

  // Modals de session
  const [openSessionModal, setOpenSessionModal] = useState(false);
  const [closeSessionModal, setCloseSessionModal] = useState(false);
  const [fondOuvertureInput, setFondOuvertureInput] = useState('25000');

  // Clôture comptage physique
  const [comptageEspeces, setComptageEspeces] = useState('');
  const [comptageMobileMoney, setComptageMobileMoney] = useState('');
  const [notesCloture, setNotesCloture] = useState('');

  // Panier & Vente
  const [panier, setPanier] = useState<LigneCaisse[]>([]);
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState('');
  const [walkinNom, setWalkinNom] = useState('');
  const [multiPaiement, setMultiPaiement] = useState(false);
  const [paiementsLignes, setPaiementsLignes] = useState<PaiementFractionne[]>([]);
  const [modeSimple, setModeSimple] = useState<ModePaiement>('especes');
  const [referenceSimple, setReferenceSimple] = useState('');
  const [montantRecuSimple, setMontantRecuSimple] = useState('');
  const [saving, setSaving] = useState(false);

  // Recherche catalogue
  const resultats = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return produits.slice(0, 16);
    return produits
      .filter(
        (p) =>
          p.nom.toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q) ||
          (p.code_barres || '').toLowerCase().includes(q)
      )
      .slice(0, 16);
  }, [produits, search]);

  // Prix calculés par la base (prix catalogue + grille tarifaire du client) : l'écran affiche
  // exactement ce qui sera encaissé. Hors ligne ou en attente : prix catalogue.
  const [tarifs, setTarifs] = useState<Record<string, { prix: number; motif: string }>>({});
  useEffect(() => {
    if (panier.length === 0) { setTarifs({}); return; }
    if (!navigator.onLine) return;
    let actif = true;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('tarifer_panier', {
        p_client_id: clientId || null,
        p_panier: panier.map((l) => ({ produit_id: l.produit.id, quantite: l.quantite })),
      });
      if (!actif || error || !data) return;
      const next: Record<string, { prix: number; motif: string }> = {};
      for (const l of (data as { lignes: { produit_id: string; prix: number; motif: string }[] }).lignes) {
        next[l.produit_id] = { prix: Number(l.prix), motif: l.motif };
      }
      setTarifs(next);
    }, 200);
    return () => { actif = false; clearTimeout(t); };
  }, [panier, clientId]);
  const prixDe = (l: LigneCaisse) => tarifs[l.produit.id]?.prix ?? l.produit.prix_vente;

  const total = panier.reduce((s, l) => s + l.quantite * prixDe(l), 0);
  const ht = tvaActive ? total / (1 + tvaTaux / 100) : total;
  const tva = total - ht;

  // Calcul du montant payé en multi-paiement
  const totalMultiPaye = paiementsLignes.reduce((s, p) => s + (p.montant || 0), 0);
  const resteAPayer = Math.max(total - totalMultiPaye, 0);

  // Monnaie à rendre en mode simple espèces
  const recuSimple = parseFloat(montantRecuSimple) || 0;
  const renduSimple = Math.max(recuSimple - total, 0);

  // Vérification du plafond de crédit client (encours_max)
  const clientSelectionne = useMemo(() => {
    return clients.find((c) => c.id === clientId) || null;
  }, [clients, clientId]);

  const alertePlafondCredit = useMemo(() => {
    if (!clientSelectionne || !clientSelectionne.encours_max) return null;
    // Si paiement à crédit ou montant reçu insuffisant
    const plafond = clientSelectionne.encours_max;
    if (total > plafond) {
      return `Attention : Ce panier de ${formatCurrency(total, devise)} dépasse le plafond de crédit autorisé de ${formatCurrency(plafond, devise)} pour ce client.`;
    }
    return null;
  }, [clientSelectionne, total, devise]);

  const ajouter = (p: ProduitWithCategorie) => {
    if (!canUse) {
      showToast('Action non permise pour votre rôle', 'error');
      return;
    }
    if (!session || session.statut !== 'ouverte') {
      showToast('Veuillez ouvrir une session de caisse avant d\'enregistrer des ventes', 'error');
      setOpenSessionModal(true);
      return;
    }

    setPanier((prev) => {
      const existant = prev.find((l) => l.produit.id === p.id);
      if (existant) {
        if (existant.quantite >= p.quantite) {
          showToast('Stock disponible insuffisant', 'error');
          return prev;
        }
        return prev.map((l) => (l.produit.id === p.id ? { ...l, quantite: l.quantite + 1 } : l));
      }
      if (p.quantite < 1) {
        showToast('Stock épuisé pour ce produit', 'error');
        return prev;
      }
      return [...prev, { produit: p, quantite: 1 }];
    });
  };

  const changerQte = (pid: string, delta: number) => {
    setPanier((prev) =>
      prev
        .map((l) => (l.produit.id === pid ? { ...l, quantite: l.quantite + delta } : l))
        .filter((l) => l.quantite > 0)
        .map((l) => (l.quantite > l.produit.quantite ? { ...l, quantite: l.produit.quantite } : l))
    );
  };

  // Initialisation ou ouverture de la session de caisse
  const handleOuvrirSession = async () => {
    const fond = parseFloat(fondOuvertureInput);
    if (isNaN(fond) || fond < 0) {
      showToast('Veuillez saisir un fond de caisse valide (≥ 0)', 'error');
      return;
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const numSession = `SESS-${dateStr}-${String(Math.floor(Math.random() * 900 + 100))}`;

    const newSession: CaisseSession = {
      id: 'sess-' + Date.now(),
      numero_session: numSession,
      date_ouverture: new Date().toISOString(),
      fond_caisse_ouverture: fond,
      total_especes_theorique: fond,
      total_mobile_money: 0,
      total_carte: 0,
      total_credit: 0,
      total_ventes: 0,
      nb_ventes: 0,
      statut: 'ouverte',
    };

    saveActiveSession(newSession);
    setOpenSessionModal(false);
    showToast(`Session de caisse ${numSession} ouverte avec un fond de ${formatCurrency(fond, devise)}`, 'info');
  };

  // Clôture formelle de la session avec Ticket Z
  const handleCloturerSession = () => {
    if (!session) return;
    const especesCompte = parseFloat(comptageEspeces) || 0;
    const mmCompte = parseFloat(comptageMobileMoney) || 0;

    const ecartEspeces = especesCompte - session.total_especes_theorique;
    const ecartMM = mmCompte - session.total_mobile_money;

    // Imprimer le Ticket Z Officiel
    const ticketZDoc = buildTicketZ(session, {
      especesCompte,
      mmCompte,
      ecartEspeces,
      ecartMM,
      notes: notesCloture,
      entreprise,
    });

    const w = window.open('', '_blank', 'width=360,height=700');
    if (w) {
      w.document.write(ticketZDoc);
      w.document.close();
      setTimeout(() => {
        w.focus();
        w.print();
      }, 350);
    }

    saveActiveSession(null);
    setCloseSessionModal(false);
    showToast(`Session ${session.numero_session} clôturée avec succès ! Ticket Z généré.`, 'info');
  };

  // Gestion des lignes de paiement fractionné
  const ajouterLignePaiement = (mode: ModePaiement, mnt: number, ref?: string) => {
    setPaiementsLignes((prev) => [...prev, { mode, montant: mnt, reference: ref }]);
  };

  const retirerLignePaiement = (idx: number) => {
    setPaiementsLignes((prev) => prev.filter((_, i) => i !== idx));
  };

  // Encaisser la vente (mode en ligne ou hors-ligne avec synchronisation garantie)
  const encaisser = async () => {
    if (panier.length === 0) {
      showToast('Panier vide', 'error');
      return;
    }
    if (!session || session.statut !== 'ouverte') {
      showToast('Veuillez d\'abord ouvrir une session de caisse', 'error');
      setOpenSessionModal(true);
      return;
    }

    // Préparation des paiements effectués
    let paiementsFinaux: PaiementFractionne[] = [];
    if (multiPaiement) {
      if (resteAPayer > 0) {
        showToast(`Reste à payer : ${formatCurrency(resteAPayer, devise)}. Veuillez compléter le règlement.`, 'error');
        return;
      }
      paiementsFinaux = paiementsLignes;
    } else {
      paiementsFinaux = [
        {
          mode: modeSimple,
          montant: total,
          reference: referenceSimple.trim() || undefined,
        },
      ];
    }

    setSaving(true);
    let numeroDoc = nextNumeroDocument('facture', numerosFactures);
    let lignesTicket = panier.map((l) => ({ ...l, produit: { ...l.produit, prix_vente: prixDe(l) } }));
    let totaux = { ht, tva, total };
    let renduTicket = multiPaiement ? 0 : renduSimple;
    const client = clients.find((c) => c.id === clientId) ?? null;
    const isOffline = !navigator.onLine;

    try {
      // Paramètres communs : la base recalcule les prix, vérifie stock et paiements,
      // puis enregistre vente, lignes, sorties de stock et paiements en une seule opération
      const venteUuid = crypto.randomUUID();
      const args = {
        p_client_id: clientId || null,
        p_client_walkin: clientId ? null : (walkinNom.trim() || 'Client comptoir'),
        p_panier: panier.map((l) => ({ produit_id: l.produit.id, quantite: l.quantite })),
        p_paiements: paiementsFinaux.map((p) => ({ mode: p.mode, montant: p.mode === 'especes' && !multiPaiement ? Math.max(recuSimple, p.montant) : p.montant, reference: p.reference || null })),
        p_vente_uuid: venteUuid,
        p_note: `Session ${session.numero_session}`,
      };

      if (isOffline) {
        // --- HORS LIGNE : la vente complète est mise en file et rejouée à la reconnexion ---
        await enqueue({ table: 'encaisser_vente_caisse', op: 'rpc', row: { ...args, p_hors_ligne: true, p_note: `Ticket hors ligne ${numeroDoc} — Session ${session.numero_session}` } });
        showToast(`Vente enregistrée en mode HORS-LIGNE (${numeroDoc}) — synchronisation automatique dès retour internet`, 'info');
      } else {
        const { data, error } = await supabase.rpc('encaisser_vente_caisse', args);
        if (error) throw error;
        const res = data as {
          numero_document: string; montant_ht: number; montant_tva: number; montant_total: number; rendu?: number;
          lignes: { produit_id: string; quantite: number; prix_unitaire: number }[];
        };
        numeroDoc = res.numero_document;
        totaux = { ht: Number(res.montant_ht), tva: Number(res.montant_tva), total: Number(res.montant_total) };
        if (!multiPaiement) {
          renduTicket = Number(res.rendu ?? renduSimple);
          // Montant réellement encaissé = total confirmé par la base (pour la session et le ticket)
          paiementsFinaux = [{ ...paiementsFinaux[0], montant: totaux.total }];
        }
        lignesTicket = res.lignes.map((rl) => {
          const l = panier.find((x) => x.produit.id === rl.produit_id)!;
          return { ...l, quantite: rl.quantite, produit: { ...l.produit, prix_vente: Number(rl.prix_unitaire) } };
        });
        showToast(`Vente ${numeroDoc} encaissée — ${formatCurrency(totaux.total, devise)}`, 'info');
      }

      // Mise à jour de la session de caisse
      let addEspeces = 0;
      let addMM = 0;
      let addCarte = 0;
      let addCredit = 0;

      for (const p of paiementsFinaux) {
        if (p.mode === 'especes') addEspeces += p.montant;
        else if (['orange_money', 'moov_money', 'wave'].includes(p.mode)) addMM += p.montant;
        else if (p.mode === 'carte') addCarte += p.montant;
        else addCredit += p.montant;
      }

      const updatedSession: CaisseSession = {
        ...session,
        total_especes_theorique: session.total_especes_theorique + addEspeces,
        total_mobile_money: session.total_mobile_money + addMM,
        total_carte: session.total_carte + addCarte,
        total_credit: session.total_credit + addCredit,
        total_ventes: session.total_ventes + totaux.total,
        nb_ventes: session.nb_ventes + 1,
      };
      saveActiveSession(updatedSession);

      // Impression du ticket thermique
      const ticketHtml = buildTicket(
        numeroDoc,
        lignesTicket,
        { ...totaux, tvaTaux, tvaActive },
        paiementsFinaux,
        renduTicket,
        entreprise,
        client,
        session.numero_session,
        isOffline
      );

      const w = window.open('', '_blank', 'width=340,height=640');
      if (w) {
        w.document.write(ticketHtml);
        w.document.close();
        setTimeout(() => {
          w.focus();
          w.print();
        }, 350);
      }

      // Réinitialisation du panier
      setPanier([]);
      setClientId('');
      setWalkinNom('');
      setMontantRecuSimple('');
      setReferenceSimple('');
      setPaiementsLignes([]);
      setMultiPaiement(false);
      onRefresh();
    } catch (err: any) {
      showToast('Erreur encaissement : ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!canUse) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
        <Store className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Votre rôle ne permet pas d'accéder au Point de Vente (POS).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 1. Bandeau Statut Session de Caisse & Sélecteur */}
      {session && session.statut === 'ouverte' ? (
        <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white rounded-2xl p-4 border border-sky-800/50 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Unlock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Session Ouverte</span>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {session.numero_session}
                </span>
                {!navigator.onLine && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">
                    <WifiOff className="w-3 h-3" /> Hors-ligne
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Fond initial : <strong>{formatCurrency(session.fond_caisse_ouverture, devise)}</strong> · Ventes :{' '}
                <strong>{formatCurrency(session.total_ventes, devise)}</strong> ({session.nb_ventes} tickets)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Espèces en caisse (Théorique)</p>
              <p className="text-sm font-extrabold text-emerald-400">
                {formatCurrency(session.total_especes_theorique, devise)}
              </p>
            </div>

            <button
              onClick={() => {
                setComptageEspeces(String(session.total_especes_theorique));
                setComptageMobileMoney(String(session.total_mobile_money));
                setCloseSessionModal(true);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 transition-all inline-flex items-center gap-1.5"
            >
              <Lock className="w-4 h-4" />
              <span>Clôturer la Caisse (Ticket Z)</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-3">
            <Lock className="w-6 h-6 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold">Caisse Fermée</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Vous devez ouvrir une session avec un fond de caisse avant de pouvoir enregistrer des encaissements.
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpenSessionModal(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-md transition-all inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Unlock className="w-4 h-4" />
            <span>Ouvrir une Session de Caisse</span>
          </button>
        </div>
      )}

      {/* 2. Interface tactile POS principale */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Colonne Gauche : Catalogue tactile */}
        <div className="lg:col-span-7 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, référence SKU ou code-barres..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[580px] overflow-y-auto pr-1">
            {resultats.map((p) => {
              const epuise = p.quantite < 1;
              return (
                <button
                  key={p.id}
                  onClick={() => ajouter(p)}
                  disabled={epuise}
                  className={`text-left p-3 rounded-xl border transition-all flex flex-col justify-between h-28 relative ${
                    epuise
                      ? 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-sky-500 hover:shadow-md'
                  }`}
                >
                  <p className="font-semibold text-xs text-slate-800 dark:text-slate-100 line-clamp-2 leading-tight">
                    {p.nom}
                  </p>
                  <div>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Stock: {p.quantite}
                    </p>
                    <p className="text-xs font-extrabold text-sky-600 dark:text-sky-400 mt-0.5">
                      {formatCurrency(p.prix_vente, devise)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Colonne Droite : Panier & Encaissement multi-moyens */}
        <div className="lg:col-span-5 space-y-4">
          <Card
            title={`Panier en cours (${panier.reduce((s, l) => s + l.quantite, 0)} articles)`}
            headerAction={
              panier.length > 0 && (
                <button
                  onClick={() => setPanier([])}
                  className="text-xs text-rose-500 hover:text-rose-600 font-semibold"
                >
                  Vider
                </button>
              )
            }
          >
            {/* Lignes du panier */}
            <div className="space-y-2 max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {panier.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Cliquez sur un produit pour l'ajouter au panier.
                </div>
              ) : (
                panier.map((l) => (
                  <div key={l.produit.id} className="pt-2 flex items-center justify-between text-xs gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{l.produit.nom}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {formatCurrency(prixDe(l), devise)} × {l.quantite}
                      </p>
                      {tarifs[l.produit.id] && tarifs[l.produit.id].prix !== l.produit.prix_vente && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{tarifs[l.produit.id].motif}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => changerQte(l.produit.id, -1)}
                        className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200"
                      >
                        <Minus className="w-3 h-3 text-slate-600 dark:text-slate-200" />
                      </button>
                      <span className="w-6 text-center font-bold text-xs">{l.quantite}</span>
                      <button
                        onClick={() => changerQte(l.produit.id, 1)}
                        className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200"
                      >
                        <Plus className="w-3 h-3 text-slate-600 dark:text-slate-200" />
                      </button>
                      <button
                        onClick={() => changerQte(l.produit.id, -l.quantite)}
                        className="p-1 text-slate-400 hover:text-rose-500 ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Récapitulatif Totaux */}
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1 text-xs">
              {tvaActive && (
                <div className="flex justify-between text-slate-500">
                  <span>Total HT</span>
                  <span>{formatCurrency(ht, devise)}</span>
                </div>
              )}
              {tvaActive && (
                <div className="flex justify-between text-slate-500">
                  <span>TVA ({tvaTaux}%)</span>
                  <span>{formatCurrency(tva, devise)}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-sm pt-1 border-t border-slate-100 dark:border-slate-800">
                <span>TOTAL À PAYER</span>
                <span className="text-sky-600 dark:text-sky-400 text-base">{formatCurrency(total, devise)}</span>
              </div>
            </div>

            {/* Choix Client & Plafond */}
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Client (Optionnel)
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">Client Comptoir (Passage)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} {c.telephone ? `(${c.telephone})` : ''} {c.encours_max ? `[Plafond: ${formatCurrency(c.encours_max, devise)}]` : ''}
                  </option>
                ))}
              </select>

              {!clientId && (
                <input
                  type="text"
                  placeholder="Nom client comptoir (optionnel)..."
                  value={walkinNom}
                  onChange={(e) => setWalkinNom(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200"
                />
              )}

              {alertePlafondCredit && (
                <Callout variant="danger" title="Dépassement du Plafond de Crédit">
                  {alertePlafondCredit}
                </Callout>
              )}
            </div>

            {/* Mode de règlement : Simple vs Fractionné */}
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Règlement</span>
                <label className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={multiPaiement}
                    onChange={(e) => {
                      setMultiPaiement(e.target.checked);
                      if (e.target.checked && paiementsLignes.length === 0) {
                        setPaiementsLignes([{ mode: 'especes', montant: total }]);
                      }
                    }}
                    className="rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span>Paiement Fractionné (Multi-moyens)</span>
                </label>
              </div>

              {!multiPaiement ? (
                // Mode de paiement unique
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={modeSimple}
                      onChange={(e) => setModeSimple(e.target.value as ModePaiement)}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200"
                    >
                      {MODES_PAIEMENT.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label} {m.mobile ? '📱' : ''}
                        </option>
                      ))}
                    </select>

                    {modeSimple === 'especes' ? (
                      <input
                        type="number"
                        placeholder="Montant remis"
                        value={montantRecuSimple}
                        onChange={(e) => setMontantRecuSimple(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200"
                      />
                    ) : (
                      <input
                        type="text"
                        placeholder="Réf. transaction (ex: ID Orange/Moov/Wave)"
                        value={referenceSimple}
                        onChange={(e) => setReferenceSimple(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200"
                      />
                    )}
                  </div>

                  {modeSimple === 'especes' && recuSimple >= total && total > 0 && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-500/20 flex justify-between text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      <span>Monnaie à rendre :</span>
                      <span>{formatCurrency(renduSimple, devise)}</span>
                    </div>
                  )}
                </div>
              ) : (
                // Mode de paiement fractionné
                <div className="space-y-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="space-y-1.5">
                    {paiementsLignes.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-xs">
                        <select
                          value={p.mode}
                          onChange={(e) => {
                            const val = e.target.value as ModePaiement;
                            setPaiementsLignes((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, mode: val } : item))
                            );
                          }}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]"
                        >
                          {MODES_PAIEMENT.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>

                        <input
                          type="number"
                          placeholder="Montant"
                          value={p.montant}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setPaiementsLignes((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, montant: val } : item))
                            );
                          }}
                          className="w-24 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]"
                        />

                        <input
                          type="text"
                          placeholder="Réf"
                          value={p.reference || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPaiementsLignes((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, reference: val } : item))
                            );
                          }}
                          className="flex-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]"
                        />

                        <button
                          onClick={() => retirerLignePaiement(idx)}
                          className="p-1 text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                    <button
                      type="button"
                      onClick={() => ajouterLignePaiement('orange_money', resteAPayer)}
                      className="text-[11px] font-bold text-sky-600 hover:text-sky-500 inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Ajouter un autre moyen
                    </button>
                    <span className={`font-bold ${resteAPayer === 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {resteAPayer === 0 ? '✓ Soldé' : `Reste: ${formatCurrency(resteAPayer, devise)}`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Bouton d'encaissement final */}
            <div className="mt-4">
              <button
                onClick={encaisser}
                disabled={saving || panier.length === 0}
                className="w-full py-3 rounded-xl font-extrabold text-sm text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                <span>
                  {saving
                    ? 'Encaissement & Impression...'
                    : `Encaisser & Imprimer Ticket (${formatCurrency(total, devise)})`}
                </span>
              </button>
            </div>
          </Card>
        </div>
      </div>

      {/* Modal Ouverture de session */}
      {openSessionModal && (
        <Modal
          title="Ouverture de la Session de Caisse"
          open={openSessionModal}
          onClose={() => setOpenSessionModal(false)}
        >
          <div className="space-y-4">
            <Callout variant="info" title="Contrôle du fond de caisse">
              Indiquez le montant exact des espèces présentes dans le tiroir-caisse au début de la journée. Ce montant sera utilisé pour calculer l'écart lors de la clôture (Ticket Z).
            </Callout>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Fond de caisse initial (Espèces physiques) *
              </label>
              <input
                type="number"
                value={fondOuvertureInput}
                onChange={(e) => setFondOuvertureInput(e.target.value)}
                placeholder="ex. 25000"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setOpenSessionModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                onClick={handleOuvrirSession}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-md inline-flex items-center gap-1.5"
              >
                <Unlock className="w-4 h-4" />
                <span>Confirmer l'ouverture de caisse</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Clôture de session & Ticket Z */}
      {closeSessionModal && session && (
        <Modal
          title={`Clôture de Caisse & Génération Ticket Z (${session.numero_session})`}
          open={closeSessionModal}
          onClose={() => setCloseSessionModal(false)}
        >
          <div className="space-y-4">
            <Callout variant="warning" title="Comptage physique des valeurs">
              Veuillez compter physiquement les espèces dans le tiroir ainsi que les soldes des téléphones Mobile Money. Tout écart avec le total théorique sera consigné dans le Ticket Z.
            </Callout>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl text-xs">
              <div>
                <p className="text-slate-400">Total Ventes</p>
                <p className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                  {formatCurrency(session.total_ventes, devise)} ({session.nb_ventes} ventes)
                </p>
              </div>
              <div>
                <p className="text-slate-400">Espèces Théoriques Attendues</p>
                <p className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(session.total_especes_theorique, devise)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Espèces réelles comptées *
                </label>
                <input
                  type="number"
                  value={comptageEspeces}
                  onChange={(e) => setComptageEspeces(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                />
                {comptageEspeces && (
                  <p
                    className={`text-[11px] font-bold mt-1 ${
                      parseFloat(comptageEspeces) - session.total_especes_theorique >= 0
                        ? 'text-emerald-500'
                        : 'text-rose-500'
                    }`}
                  >
                    Écart espèces :{' '}
                    {formatCurrency(parseFloat(comptageEspeces) - session.total_especes_theorique, devise)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mobile Money total compté *
                </label>
                <input
                  type="number"
                  value={comptageMobileMoney}
                  onChange={(e) => setComptageMobileMoney(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Remarques / Justification d'écart éventuel
              </label>
              <textarea
                rows={2}
                value={notesCloture}
                onChange={(e) => setNotesCloture(e.target.value)}
                placeholder="Ex. Erreur rendu monnaie, billet endommagé..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setCloseSessionModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                onClick={handleCloturerSession}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md inline-flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Valider Clôture & Imprimer Ticket Z</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Génération du Ticket de caisse standard (58mm/80mm)
function buildTicket(
  numero: string,
  lignes: LigneCaisse[],
  totaux: { ht: number; tva: number; total: number; tvaTaux: number; tvaActive: boolean },
  paiements: PaiementFractionne[],
  rendu: number,
  entreprise: Entreprise | null,
  client: Client | null,
  sessionId: string,
  isOffline: boolean
): string {
  const esc = (s: string | null | undefined) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
  const symbole = entreprise?.devise || 'FCFA';
  const largeur = 58;

  const lignesHtml = lignes
    .map(
      (l) => `
    <tr>
      <td colspan="3" style="padding-top:4px">${esc(l.produit.nom)}</td>
    </tr>
    <tr>
      <td style="font-size:10px">${l.quantite} × ${fmt(l.produit.prix_vente)}</td>
      <td></td>
      <td style="text-align:right;font-weight:600">${fmt(l.quantite * l.produit.prix_vente)}</td>
    </tr>`
    )
    .join('');

  const paiementsHtml = paiements
    .map((p) => {
      const label = MODES_PAIEMENT.find((m) => m.value === p.mode)?.label || p.mode;
      return `<p style="font-size:10px">${label}${p.reference ? ' (' + esc(p.reference) + ')' : ''} : <strong>${fmt(
        p.montant
      )} ${symbole}</strong></p>`;
    })
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8" /><title>Ticket ${esc(numero)}</title>
<style>
  @page { size: ${largeur}mm auto; margin: 2mm; }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: ${largeur}mm; margin: 0 auto; color: #000; }
  h2 { text-align: center; font-size: 14px; margin: 2px 0; }
  p { margin: 1px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  td { vertical-align: top; }
  .c { text-align: center; }
  .sep { border-top: 1px dashed #000; margin: 5px 0; }
  .total { font-size: 13px; font-weight: bold; }
  .badge-offline { border: 1px solid #000; padding: 2px; text-align: center; font-weight: bold; font-size: 9px; margin-bottom: 4px; }
</style></head><body>
  ${isOffline ? '<div class="badge-offline">MODE HORS-LIGNE (SYNCHRO EN ATTENTE)</div>' : ''}
  <h2>${esc(entreprise?.nom || 'CAISSE POS')}</h2>
  ${entreprise?.slogan ? `<p class="c" style="font-size:10px">${esc(entreprise.slogan)}</p>` : ''}
  ${entreprise?.ifu ? `<p class="c" style="font-size:9px">IFU: ${esc(entreprise.ifu)} · RCCM: ${esc(entreprise.rccm || '—')}</p>` : ''}
  ${entreprise?.telephone ? `<p class="c" style="font-size:10px">Tel: ${esc(entreprise.telephone)}</p>` : ''}
  <div class="sep"></div>
  <p class="c">TICKET — ${esc(numero)}</p>
  <p class="c" style="font-size:9px">Session: ${esc(sessionId)} · ${new Date().toLocaleString('fr-FR')}</p>
  ${client ? `<p class="c" style="font-size:10px">Client: ${esc(client.nom)}</p>` : ''}
  <div class="sep"></div>
  <table>${lignesHtml}</table>
  <div class="sep"></div>
  ${totaux.tvaActive ? `<p style="font-size:10px">Total HT: ${fmt(totaux.ht)}</p><p style="font-size:10px">TVA (${totaux.tvaTaux}%): ${fmt(totaux.tva)}</p>` : ''}
  <p class="total">TOTAL: ${fmt(totaux.total)} ${symbole}</p>
  <div class="sep"></div>
  <p style="font-size:10px;font-weight:bold">RÈGLEMENT :</p>
  ${paiementsHtml}
  ${rendu > 0 ? `<p style="font-size:10px">Monnaie rendue : <strong>${fmt(rendu)} ${symbole}</strong></p>` : ''}
  <div class="sep"></div>
  <p class="c">Merci de votre confiance !</p>
  <p class="c" style="font-size:9px">— YOS360 —</p>
</body></html>`;
}

// Génération du Ticket Z officiel (Clôture journalière)
function buildTicketZ(
  session: CaisseSession,
  cloture: {
    especesCompte: number;
    mmCompte: number;
    ecartEspeces: number;
    ecartMM: number;
    notes: string;
    entreprise: Entreprise | null;
  }
): string {
  const esc = (s: string | null | undefined) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
  const symbole = cloture.entreprise?.devise || 'FCFA';

  return `<!doctype html><html><head><meta charset="utf-8" /><title>Ticket Z - ${esc(session.numero_session)}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: 72mm; margin: 0 auto; color: #000; }
  h2 { text-align: center; font-size: 14px; margin: 2px 0; }
  h3 { text-align: center; font-size: 12px; margin: 2px 0; border: 1px solid #000; padding: 2px; }
  p { margin: 1.5px 0; }
  .c { text-align: center; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; }
</style></head><body>
  <h2>${esc(cloture.entreprise?.nom || 'YOS360 ERP')}</h2>
  <h3>RAPPORT DE CLÔTURE — TICKET Z</h3>
  <p class="c">Session: ${esc(session.numero_session)}</p>
  <p class="c">Date clôture: ${new Date().toLocaleString('fr-FR')}</p>
  <div class="sep"></div>
  <p class="row"><span>Fond de caisse initial:</span><span>${fmt(session.fond_caisse_ouverture)} ${symbole}</span></p>
  <p class="row"><span>Nombre de ventes:</span><span>${session.nb_ventes}</span></p>
  <p class="row" style="font-weight:bold"><span>CHIFFRE D'AFFAIRES TOTAL:</span><span>${fmt(session.total_ventes)} ${symbole}</span></p>
  <div class="sep"></div>
  <p style="font-weight:bold">VENTILATION DES ENCAISSEMENTS :</p>
  <p class="row"><span>Espèces théoriques:</span><span>${fmt(session.total_especes_theorique)} ${symbole}</span></p>
  <p class="row"><span>Mobile Money:</span><span>${fmt(session.total_mobile_money)} ${symbole}</span></p>
  <p class="row"><span>Carte bancaire:</span><span>${fmt(session.total_carte)} ${symbole}</span></p>
  <p class="row"><span>Crédit accordé:</span><span>${fmt(session.total_credit)} ${symbole}</span></p>
  <div class="sep"></div>
  <p style="font-weight:bold">COMPTAGE PHYSIQUE DE CLÔTURE :</p>
  <p class="row"><span>Espèces comptées:</span><span>${fmt(cloture.especesCompte)} ${symbole}</span></p>
  <p class="row" style="font-weight:bold"><span>ÉCART ESPÈCES:</span><span>${cloture.ecartEspeces >= 0 ? '+' : ''}${fmt(cloture.ecartEspeces)} ${symbole}</span></p>
  <p class="row"><span>Mobile Money compté:</span><span>${fmt(cloture.mmCompte)} ${symbole}</span></p>
  <p class="row" style="font-weight:bold"><span>ÉCART MOBILE MONEY:</span><span>${cloture.ecartMM >= 0 ? '+' : ''}${fmt(cloture.ecartMM)} ${symbole}</span></p>
  ${cloture.notes ? `<div class="sep"></div><p>Notes: ${esc(cloture.notes)}</p>` : ''}
  <div class="sep"></div>
  <p class="c" style="font-size:9px">Signature du Responsable de Caisse</p>
  <br/><br/>
  <p class="c">_____________________________</p>
</body></html>`;
}
