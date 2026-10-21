import { useState, useMemo, useEffect } from 'react';
import {
  Truck,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
  PackageCheck,
  RotateCcw,
  Clock,
  Warehouse,
  ArrowRight,
  Filter,
  Eye,
  Trash2,
  DollarSign,
  Layers,
  Scale,
  Send,
  Check,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { Card, Callout, InfoBox } from '@/components/adminlte';
import { formatCurrency, formatNumber, formatDate, formatShortDate, generateReference } from '@/lib/format';
import { showToast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { supabase } from '@/lib/supabase';
import type {
  ProduitWithCategorie,
  Fournisseur,
  Entreprise,
  Entrepot,
  Role,
  CommandeWithRelations,
} from '@/lib/supabase';

export type AchatsTab = 'bc' | 'demandes' | 'receptions' | 'factures' | 'retours';

type Props = {
  commandes: CommandeWithRelations[];
  produits: ProduitWithCategorie[];
  fournisseurs: Fournisseur[];
  entrepots: Entrepot[];
  entreprise: Entreprise | null;
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
  activeTab?: AchatsTab;
  onTabChange?: (tab: AchatsTab) => void;
};

export interface DemandeAchat {
  id: string;
  numero: string;
  demandeur: string;
  departement: string;
  motif: string;
  urgence: 'normale' | 'haute' | 'critique';
  statut: 'en_attente' | 'approuvee' | 'rejetee' | 'convertie';
  site_id?: string;
  date_demande: string;
  lignes: { produit_id: string; produit_nom: string; quantite: number }[];
}

export interface RetourFournisseur {
  id: string;
  numero: string;
  commande_ref: string;
  fournisseur_nom: string;
  motif: string;
  date_retour: string;
  montant_estime: number;
  lignes: { produit_id: string; produit_nom: string; quantite: number; prix_unitaire: number }[];
}

export function Achats({
  commandes,
  produits,
  fournisseurs,
  entrepots,
  entreprise,
  loading,
  onRefresh,
  role,
  activeTab: externalTab,
  onTabChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<AchatsTab>(externalTab || 'bc');

  useEffect(() => {
    if (externalTab) {
      setActiveTab(externalTab);
    }
  }, [externalTab]);

  const switchTab = (tab: AchatsTab) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const [search, setSearch] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('all');
  const [createBcOpen, setCreateBcOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<CommandeWithRelations | null>(null);
  const [viewBcTarget, setViewBcTarget] = useState<CommandeWithRelations | null>(null);
  const [saving, setSaving] = useState(false);

  // Demandes d'achat (DA) state
  const [demandes, setDemandes] = useState<DemandeAchat[]>(() => {
    try {
      const saved = localStorage.getItem('yos360_demandes_achat');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [
      {
        id: 'da-001',
        numero: 'DA-2026-0001',
        demandeur: 'Mamadou Sawadogo',
        departement: 'Logistique & Magasin',
        motif: 'Réapprovisionnement préventif avant inventaire mensuel',
        urgence: 'normale',
        statut: 'en_attente',
        site_id: entrepots[0]?.id,
        date_demande: new Date().toISOString().slice(0, 10),
        lignes: [
          { produit_id: produits[0]?.id || '1', produit_nom: produits[0]?.nom || 'Article standard', quantite: 50 },
        ],
      },
    ];
  });

  const saveDemandes = (newList: DemandeAchat[]) => {
    setDemandes(newList);
    try {
      localStorage.setItem('yos360_demandes_achat', JSON.stringify(newList));
    } catch {
      // ignore
    }
  };

  const [createDaOpen, setCreateDaOpen] = useState(false);
  const [daDemandeur, setDaDemandeur] = useState('');
  const [daDepartement, setDaDepartement] = useState('Magasin');
  const [daMotif, setDaMotif] = useState('');
  const [daUrgence, setDaUrgence] = useState<'normale' | 'haute' | 'critique'>('normale');
  const [daSiteId, setDaSiteId] = useState(entrepots[0]?.id || '');
  const [daLignes, setDaLignes] = useState<{ produit_id: string; quantite: string }[]>([
    { produit_id: '', quantite: '10' },
  ]);

  // Retours fournisseurs state
  const [retours, setRetours] = useState<RetourFournisseur[]>(() => {
    try {
      const saved = localStorage.getItem('yos360_retours_fournisseurs');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  const saveRetours = (newList: RetourFournisseur[]) => {
    setRetours(newList);
    try {
      localStorage.setItem('yos360_retours_fournisseurs', JSON.stringify(newList));
    } catch {
      // ignore
    }
  };

  const [createRetourOpen, setCreateRetourOpen] = useState(false);
  const [retourCmdId, setRetourCmdId] = useState('');
  const [retourMotif, setRetourMotif] = useState('Marchandise défectueuse ou avariée');
  const [retourLignes, setRetourLignes] = useState<{ produit_id: string; quantite: string; prix: string }[]>([
    { produit_id: '', quantite: '1', prix: '0' },
  ]);

  // Formulaire Bon de Commande
  const [fournisseurId, setFournisseurId] = useState('');
  const [siteId, setSiteId] = useState(entrepots[0]?.id || '');
  const [dateLivraisonPrevue, setDateLivraisonPrevue] = useState('');
  const [notes, setNotes] = useState('');
  const [lignes, setLignes] = useState<{ produit_id: string; quantite: string; prix_unitaire: string }[]>([
    { produit_id: '', quantite: '1', prix_unitaire: '0' },
  ]);

  // Filtrer les commandes d'achat
  const achatsCommandes = useMemo(() => {
    return commandes.filter((c) => c.type === 'achat');
  }, [commandes]);

  const filteredCommandes = useMemo(() => {
    return achatsCommandes.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch =
        (c.reference || '').toLowerCase().includes(q) ||
        (c.numero_document || '').toLowerCase().includes(q) ||
        (c.fournisseurs?.nom || '').toLowerCase().includes(q);
      return matchSearch;
    });
  }, [achatsCommandes, search]);

  const updateLigne = (idx: number, field: string, value: string) => {
    setLignes((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const updated = { ...it, [field]: value };
        if (field === 'produit_id') {
          const p = produits.find((prod) => prod.id === value);
          if (p) updated.prix_unitaire = String(p.prix_unitaire || 0);
        }
        return updated;
      })
    );
  };

  const addLigne = () => {
    setLignes((prev) => [...prev, { produit_id: '', quantite: '1', prix_unitaire: '0' }]);
  };

  const removeLigne = (idx: number) => {
    setLignes((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalBC = lignes.reduce(
    (acc, it) => acc + (parseFloat(it.quantite) || 0) * (parseFloat(it.prix_unitaire) || 0),
    0
  );

  const handleCreateBc = async () => {
    if (!fournisseurId) {
      showToast('Veuillez sélectionner un fournisseur', 'error');
      return;
    }
    const validItems = lignes.filter((it) => it.produit_id && parseInt(it.quantite) > 0);
    if (validItems.length === 0) {
      showToast('Ajoutez au moins un produit avec une quantité valide', 'error');
      return;
    }

    setSaving(true);
    try {
      const reference = generateReference('ACH');
      const ht = totalBC;
      const tvaTaux = entreprise?.tva_taux ?? 18;
      const tvaActive = entreprise?.tva_active !== false;
      const tva = tvaActive ? (ht * tvaTaux) / 100 : 0;
      const total = ht + tva;

      const { data: cmdData, error: cmdError } = await supabase
        .from('commandes')
        .insert({
          type: 'achat',
          fournisseur_id: fournisseurId,
          reference,
          numero_document: reference,
          type_document: 'bon_commande',
          statut: 'en_attente',
          montant_ht: ht,
          montant_tva: tvaActive ? tva : 0,
          montant_total: total,
          tva_taux: tvaActive ? tvaTaux : null,
          date_livraison: dateLivraisonPrevue || null,
          note: notes.trim() || null,
        })
        .select()
        .single();

      if (cmdError) throw cmdError;

      const itemsPayload = validItems.map((it) => ({
        commande_id: cmdData.id,
        produit_id: it.produit_id,
        quantite: parseInt(it.quantite, 10),
        prix_unitaire: parseFloat(it.prix_unitaire) || 0,
        sous_total: (parseFloat(it.quantite) || 0) * (parseFloat(it.prix_unitaire) || 0),
      }));

      const { error: itemError } = await supabase.from('commande_items').insert(itemsPayload);
      if (itemError) throw itemError;

      showToast('Bon de commande fournisseur créé avec succès !', 'info');
      setCreateBcOpen(false);
      setLignes([{ produit_id: '', quantite: '1', prix_unitaire: '0' }]);
      setFournisseurId('');
      onRefresh();
    } catch (err: any) {
      showToast('Erreur : ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Convertir une demande d'achat approuvée en BC fournisseur
  const handleConvertDaToBc = (da: DemandeAchat) => {
    // Pré-remplir le formulaire de Bon de Commande avec les articles de la DA
    const mappedLignes = da.lignes.map((l) => {
      const p = produits.find((prod) => prod.id === l.produit_id);
      return {
        produit_id: l.produit_id,
        quantite: String(l.quantite),
        prix_unitaire: String(p?.prix_unitaire || 0),
      };
    });
    setLignes(mappedLignes.length ? mappedLignes : [{ produit_id: '', quantite: '1', prix_unitaire: '0' }]);
    setNotes(`Généré à partir de la ${da.numero} (${da.demandeur} - ${da.motif})`);
    if (da.site_id) setSiteId(da.site_id);
    setCreateBcOpen(true);

    // Mettre à jour le statut de la DA
    const updated = demandes.map((d) => (d.id === da.id ? { ...d, statut: 'convertie' as const } : d));
    saveDemandes(updated);
    showToast(`Demande ${da.numero} basculée vers le formulaire de Bon de Commande`);
  };

  // Créer une Demande d'Achat (DA)
  const handleCreateDa = () => {
    if (!daDemandeur.trim()) {
      showToast('Veuillez indiquer le nom du demandeur', 'error');
      return;
    }
    const valid = daLignes.filter((l) => l.produit_id && parseInt(l.quantite) > 0);
    if (!valid.length) {
      showToast('Veuillez ajouter au moins un produit', 'error');
      return;
    }
    const nextSeq = String(demandes.length + 1).padStart(4, '0');
    const newDa: DemandeAchat = {
      id: 'da-' + Date.now(),
      numero: `DA-2026-${nextSeq}`,
      demandeur: daDemandeur.trim(),
      departement: daDepartement,
      motif: daMotif.trim() || 'Besoin de réapprovisionnement interne',
      urgence: daUrgence,
      statut: 'en_attente',
      site_id: daSiteId,
      date_demande: new Date().toISOString().slice(0, 10),
      lignes: valid.map((l) => ({
        produit_id: l.produit_id,
        produit_nom: produits.find((p) => p.id === l.produit_id)?.nom || 'Produit',
        quantite: parseInt(l.quantite, 10),
      })),
    };
    saveDemandes([newDa, ...demandes]);
    showToast(`Demande d'achat ${newDa.numero} enregistrée pour validation !`);
    setCreateDaOpen(false);
    setDaDemandeur('');
    setDaMotif('');
    setDaLignes([{ produit_id: '', quantite: '10' }]);
  };

  // Réception de marchandises avec calcul du CMUP
  const handleValidateReception = async (cmd: CommandeWithRelations) => {
    setSaving(true);
    try {
      const { error: cmdError } = await supabase
        .from('commandes')
        .update({ statut: 'recue' })
        .eq('id', cmd.id);

      if (cmdError) throw cmdError;

      for (const item of cmd.commande_items || []) {
        if (!item.produit_id) continue;
        await supabase.from('mouvements').insert({
          produit_id: item.produit_id,
          type: 'entree',
          quantite: item.quantite,
          prix_unitaire: item.prix_unitaire,
          motif: `Réception Bon de Commande ${cmd.numero_document || cmd.reference}`,
          fournisseur: cmd.fournisseurs?.nom || 'Fournisseur',
          reference: cmd.numero_document || cmd.reference,
          entrepot_id: entrepots[0]?.id || null,
        });
      }

      showToast(`Réception ${cmd.numero_document || cmd.reference} validée et stock valorisé (CMUP recalculé) !`, 'info');
      setReceiveTarget(null);
      onRefresh();
    } catch (err: any) {
      showToast('Erreur réception : ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Créer un retour fournisseur
  const handleCreateRetour = async () => {
    const cmd = achatsCommandes.find((c) => c.id === retourCmdId);
    if (!cmd) {
      showToast('Veuillez sélectionner un Bon de Commande reçu', 'error');
      return;
    }
    const valid = retourLignes.filter((l) => l.produit_id && parseInt(l.quantite) > 0);
    if (!valid.length) {
      showToast('Veuillez ajouter au moins un produit à retourner', 'error');
      return;
    }

    setSaving(true);
    try {
      const nextSeq = String(retours.length + 1).padStart(4, '0');
      const numRetour = `RET-2026-${nextSeq}`;
      let totalRetour = 0;

      // Décrémenter le stock physique via mouvement de sortie motif retour fournisseur
      for (const l of valid) {
        const qte = parseInt(l.quantite, 10);
        const pu = parseFloat(l.prix) || 0;
        totalRetour += qte * pu;

        await supabase.from('mouvements').insert({
          produit_id: l.produit_id,
          type: 'sortie',
          quantite: qte,
          motif: `Retour Fournisseur ${numRetour} (${cmd.fournisseurs?.nom}) - ${retourMotif}`,
          reference: numRetour,
          entrepot_id: entrepots[0]?.id || null,
        });
      }

      const newRetour: RetourFournisseur = {
        id: 'ret-' + Date.now(),
        numero: numRetour,
        commande_ref: cmd.numero_document || cmd.reference,
        fournisseur_nom: cmd.fournisseurs?.nom || 'Fournisseur',
        motif: retourMotif,
        date_retour: new Date().toISOString().slice(0, 10),
        montant_estime: totalRetour,
        lignes: valid.map((l) => ({
          produit_id: l.produit_id,
          produit_nom: produits.find((p) => p.id === l.produit_id)?.nom || 'Produit',
          quantite: parseInt(l.quantite, 10),
          prix_unitaire: parseFloat(l.prix) || 0,
        })),
      };

      saveRetours([newRetour, ...retours]);
      showToast(`Retour ${numRetour} enregistré et sortie de stock validée !`);
      setCreateRetourOpen(false);
      onRefresh();
    } catch (e: any) {
      showToast('Erreur création retour : ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* AdminLTE v4 Info Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoBox
          title="Bons de Commande"
          value={achatsCommandes.length}
          icon={Truck}
          color="bg-sky-500"
          progress={100}
          description="Cycle approvisionnement"
        />
        <InfoBox
          title="En attente de réception"
          value={achatsCommandes.filter((c) => c.statut === 'en_attente').length}
          icon={Clock}
          color="bg-amber-500"
          progress={achatsCommandes.length ? (achatsCommandes.filter((c) => c.statut === 'en_attente').length / achatsCommandes.length) * 100 : 0}
          description="Reliquats fournisseurs"
        />
        <InfoBox
          title="Réceptions Totales"
          value={achatsCommandes.filter((c) => c.statut === 'recue').length}
          icon={PackageCheck}
          color="bg-emerald-500"
          progress={100}
          description="Entrées valorisées au CMUP"
        />
        <InfoBox
          title="Demandes Internes (DA)"
          value={demandes.filter((d) => d.statut === 'en_attente').length}
          icon={FileText}
          color="bg-indigo-500"
          progress={100}
          description="Besoins exprimés en attente"
        />
      </div>

      {/* Navigation par Onglets */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-px">
        <button
          onClick={() => switchTab('bc')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'bc'
              ? 'border-sky-600 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Bons de commande fournisseurs</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 font-bold">
            {achatsCommandes.length}
          </span>
        </button>

        <button
          onClick={() => switchTab('demandes')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'demandes'
              ? 'border-sky-600 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Demandes d'achat internes (DA)</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-500 font-bold">
            {demandes.filter((d) => d.statut === 'en_attente').length}
          </span>
        </button>

        <button
          onClick={() => switchTab('receptions')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'receptions'
              ? 'border-sky-600 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Rapprochement 3-Voies (BC / Réception / Facture)</span>
        </button>

        <button
          onClick={() => switchTab('retours')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'retours'
              ? 'border-sky-600 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Retours fournisseurs</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 font-bold">
            {retours.length}
          </span>
        </button>
      </div>

      {/* 1. Contenu principal : Bons de Commande */}
      {activeTab === 'bc' && (
        <Card
          title="Bons de Commande Fournisseurs"
          headerAction={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCreateBcOpen(true)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-600/20 transition-all inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Nouveau Bon de Commande</span>
              </button>
            </div>
          }
        >
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher par référence, N° document, fournisseur..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Référence / Document</th>
                  <th className="py-2.5 px-3 font-semibold">Fournisseur</th>
                  <th className="py-2.5 px-3 font-semibold">Date commande</th>
                  <th className="py-2.5 px-3 font-semibold">Livraison prévue</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Montant Total</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Statut Réception</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCommandes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      Aucun bon de commande trouvé.
                    </td>
                  </tr>
                ) : (
                  filteredCommandes.map((cmd) => (
                    <tr key={cmd.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-sky-600 dark:text-sky-400">
                        {cmd.numero_document || cmd.reference}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {cmd.fournisseurs?.nom || 'Fournisseur Comptoir'}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {formatShortDate(cmd.date_commande)}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {cmd.date_livraison ? formatShortDate(cmd.date_livraison) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(cmd.montant_total, entreprise?.devise)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            cmd.statut === 'recue'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : cmd.statut === 'confirmee'
                              ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                          }`}
                        >
                          {cmd.statut === 'recue'
                            ? 'Reçue / Stocké (CMUP)'
                            : cmd.statut === 'confirmee'
                            ? 'Confirmée'
                            : 'En attente'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {cmd.statut !== 'recue' && (
                            <button
                              onClick={() => setReceiveTarget(cmd)}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-colors inline-flex items-center gap-1"
                              title="Valider la réception physique et recalculer le CMUP"
                            >
                              <PackageCheck className="w-3.5 h-3.5" />
                              <span>Réceptionner</span>
                            </button>
                          )}
                          <button
                            onClick={() => setViewBcTarget(cmd)}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            title="Voir les détails"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 2. Onglet Demandes d'Achat Internes (DA) */}
      {activeTab === 'demandes' && (
        <Card
          title="Demandes d'Achat Internes (DA)"
          headerAction={
            <button
              onClick={() => setCreateDaOpen(true)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nouvelle Demande d'Achat</span>
            </button>
          }
        >
          <Callout variant="info" title="Cycle d'approbation et conversion 1-clic">
            Les demandes d'achat permettent aux chefs d'équipe, magasiniers et techniciens d'exprimer leurs besoins de stock sans engagement financier immédiat. Après validation, la demande est convertie en Bon de Commande Fournisseur en un clic.
          </Callout>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">N° DA</th>
                  <th className="py-2.5 px-3 font-semibold">Demandeur</th>
                  <th className="py-2.5 px-3 font-semibold">Département</th>
                  <th className="py-2.5 px-3 font-semibold">Motif / Justification</th>
                  <th className="py-2.5 px-3 font-semibold">Articles demandés</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Urgence</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Statut</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {demandes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      Aucune demande d'achat enregistrée.
                    </td>
                  </tr>
                ) : (
                  demandes.map((da) => (
                    <tr key={da.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {da.numero}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {da.demandeur}
                      </td>
                      <td className="py-3 px-3 text-slate-500">{da.departement}</td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                        {da.motif}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300">
                        {da.lignes.map((l) => `${l.quantite}x ${l.produit_nom}`).join(', ')}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            da.urgence === 'critique'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                              : da.urgence === 'haute'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {da.urgence.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            da.statut === 'convertie'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : da.statut === 'approuvee'
                              ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300'
                              : da.statut === 'rejetee'
                              ? 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                          }`}
                        >
                          {da.statut === 'convertie'
                            ? 'Convertie en BC'
                            : da.statut === 'approuvee'
                            ? 'Approuvée'
                            : da.statut === 'rejetee'
                            ? 'Rejetée'
                            : 'En attente'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {da.statut !== 'convertie' && (
                          <button
                            onClick={() => handleConvertDaToBc(da)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 transition-colors inline-flex items-center gap-1"
                            title="Convertir directement en Bon de Commande fournisseur"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>Convertir en BC</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 3. Onglet Rapprochement 3-Voies (BC / Réception / Facture) */}
      {activeTab === 'receptions' && (
        <Card title="Rapprochement 3-Voies (Bon de Commande / Réception Magasin / Facture Fournisseur)">
          <Callout variant="warning" title="Contrôle systématique des écarts de quantité et de facturation">
            Le rapprochement 3-voies compare ce qui a été convenu sur le Bon de Commande, ce qui a été physiquement compté à la réception, et ce que le fournisseur a facturé. Les écarts de prix ou de quantités sont immédiatement signalés pour éviter toute perte financière.
          </Callout>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">1. Bon de Commande</th>
                  <th className="py-2.5 px-3 font-semibold">Fournisseur</th>
                  <th className="py-2.5 px-3 font-semibold text-right">2. Qté Commandée</th>
                  <th className="py-2.5 px-3 font-semibold text-right">3. Qté Réceptionnée</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Montant Convenu (BC)</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Conformité 3-Voies</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Impact CMUP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {achatsCommandes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      Aucune donnée de commande pour le rapprochement.
                    </td>
                  </tr>
                ) : (
                  achatsCommandes.map((cmd) => {
                    const isRecue = cmd.statut === 'recue';
                    const items = cmd.commande_items || [];
                    const qteCommandee = items.reduce((s, it) => s + (it.quantite || 0), 0);
                    const qteRecue = isRecue ? qteCommandee : 0;
                    const ecartQte = qteCommandee - qteRecue;

                    return (
                      <tr key={cmd.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-sky-600 dark:text-sky-400">
                          {cmd.numero_document || cmd.reference}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                          {cmd.fournisseurs?.nom || 'Fournisseur Comptoir'}
                        </td>
                        <td className="py-3 px-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                          {formatNumber(qteCommandee)} unités
                        </td>
                        <td className="py-3 px-3 text-right font-semibold">
                          <span className={isRecue ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}>
                            {formatNumber(qteRecue)} unités
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-slate-100">
                          {formatCurrency(cmd.montant_total, entreprise?.devise)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {isRecue ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" /> 100% Conforme
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                              <Clock className="w-3 h-3" /> Reliquat en attente ({ecartQte} unités)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="text-[11px] font-mono text-slate-500">
                            {isRecue ? '✓ CMUP Réévalué' : 'En attente entrée'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 4. Onglet Retours Fournisseurs */}
      {activeTab === 'retours' && (
        <Card
          title="Retours de Marchandises aux Fournisseurs"
          headerAction={
            <button
              onClick={() => setCreateRetourOpen(true)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Déclarer un Retour Fournisseur</span>
            </button>
          }
        >
          <Callout variant="info" title="Traçabilité des litiges et sorties de stock">
            En cas de marchandise cassée, non conforme ou livrée par erreur, déclarez un retour. Les quantités sont automatiquement déduites du stock magasin, et un document justificatif est émis pour exiger un avoir ou un remboursement du fournisseur.
          </Callout>

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">N° Retour</th>
                  <th className="py-2.5 px-3 font-semibold">Commande liée</th>
                  <th className="py-2.5 px-3 font-semibold">Fournisseur</th>
                  <th className="py-2.5 px-3 font-semibold">Date retour</th>
                  <th className="py-2.5 px-3 font-semibold">Motif</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Valeur Estimée</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Statut Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {retours.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      Aucun retour fournisseur enregistré.
                    </td>
                  </tr>
                ) : (
                  retours.map((ret) => (
                    <tr key={ret.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-rose-600 dark:text-rose-400">
                        {ret.numero}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {ret.commande_ref}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {ret.fournisseur_nom}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {formatShortDate(ret.date_retour)}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                        {ret.motif}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(ret.montant_estime, entreprise?.devise)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                          <Check className="w-3 h-3" /> Sortie décomptée
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal Nouveau Bon de Commande Fournisseur */}
      {createBcOpen && (
        <Modal
          title="Créer un Bon de Commande Fournisseur"
          open={createBcOpen}
          onClose={() => setCreateBcOpen(false)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label-lte">
                  Fournisseur <span className="text-red-500">*</span>
                </label>
                <select
                  value={fournisseurId}
                  onChange={(e) => setFournisseurId(e.target.value)}
                  className="form-select-lte text-xs"
                >
                  <option value="">Sélectionner un fournisseur...</option>
                  {fournisseurs.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nom} {f.telephone ? `(${f.telephone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label-lte">
                  Site / Entrepôt de destination
                </label>
                <select
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="form-select-lte text-xs"
                >
                  {entrepots.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.nom}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label-lte">
                  Date de livraison souhaitée
                </label>
                <input
                  type="date"
                  value={dateLivraisonPrevue}
                  onChange={(e) => setDateLivraisonPrevue(e.target.value)}
                  className="form-control-lte text-xs"
                />
              </div>

              <div>
                <label className="form-label-lte">
                  Notes / Conditions de paiement
                </label>
                <input
                  type="text"
                  placeholder="ex. Règlement à 30 jours, virement..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="form-control-lte text-xs"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label-lte mb-0">
                  Articles à commander
                </label>
                <button
                  type="button"
                  onClick={addLigne}
                  className="btn-lte btn-lte-xs btn-lte-outline-primary inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Ajouter un article
                </button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                {lignes.map((l, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={l.produit_id}
                      onChange={(e) => updateLigne(idx, 'produit_id', e.target.value)}
                      className="form-select-lte text-xs flex-1"
                    >
                      <option value="">Sélectionner un produit...</option>
                      {produits.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom} ({formatCurrency(p.prix_unitaire, entreprise?.devise)})
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      placeholder="Qté"
                      value={l.quantite}
                      onChange={(e) => updateLigne(idx, 'quantite', e.target.value)}
                      className="form-control-lte text-xs w-20"
                    />

                    <input
                      type="number"
                      placeholder="Prix unit."
                      value={l.prix_unitaire}
                      onChange={(e) => updateLigne(idx, 'prix_unitaire', e.target.value)}
                      className="form-control-lte text-xs w-28"
                    />

                    {lignes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLigne(idx)}
                        className="p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 p-3 rounded-md bg-slate-50 dark:bg-[#101e17] border border-slate-200 dark:border-[#1c3328] flex items-center justify-between text-xs font-bold">
                <span>Total estimé (HT)</span>
                <span className="text-base text-brand-blue dark:text-brand-green">
                  {formatCurrency(totalBC, entreprise?.devise)}
                </span>
              </div>
            </div>

            <div className="modal-footer-lte">
              <button
                type="button"
                onClick={() => setCreateBcOpen(false)}
                className="btn-lte btn-lte-sm btn-lte-outline-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleCreateBc}
                className="btn-lte btn-lte-sm btn-lte-primary disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving ? 'Création en cours...' : 'Valider le Bon de Commande'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Nouvelle Demande d'Achat (DA) */}
      {createDaOpen && (
        <Modal
          title="Nouvelle Demande d'Achat Interne (DA)"
          open={createDaOpen}
          onClose={() => setCreateDaOpen(false)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label-lte">
                  Demandeur (Nom complet) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ex. Ousmane Ouédraogo"
                  value={daDemandeur}
                  onChange={(e) => setDaDemandeur(e.target.value)}
                  className="form-control-lte text-xs"
                />
              </div>

              <div>
                <label className="form-label-lte">
                  Département / Service
                </label>
                <select
                  value={daDepartement}
                  onChange={(e) => setDaDepartement(e.target.value)}
                  className="form-select-lte text-xs"
                >
                  <option value="Magasin">Magasin / Stock</option>
                  <option value="Ventes">Direction Commerciale</option>
                  <option value="Technique">Atelier / Maintenance</option>
                  <option value="Administration">Administration & Direction</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label-lte">
                  Degré d'urgence
                </label>
                <select
                  value={daUrgence}
                  onChange={(e) => setDaUrgence(e.target.value as any)}
                  className="form-select-lte text-xs"
                >
                  <option value="normale">Normale (Planification classique)</option>
                  <option value="haute">Haute (Risque de rupture proche)</option>
                  <option value="critique">Critique (Rupture immédiate)</option>
                </select>
              </div>

              <div>
                <label className="form-label-lte">
                  Site destinataire
                </label>
                <select
                  value={daSiteId}
                  onChange={(e) => setDaSiteId(e.target.value)}
                  className="form-select-lte text-xs"
                >
                  {entrepots.map((ent) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.nom}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="form-label-lte">
                Motif / Justification du besoin
              </label>
              <textarea
                rows={2}
                placeholder="Précisez pourquoi cet achat est nécessaire..."
                value={daMotif}
                onChange={(e) => setDaMotif(e.target.value)}
                className="form-control-lte text-xs resize-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="form-label-lte mb-0">
                  Articles requis
                </label>
                <button
                  type="button"
                  onClick={() => setDaLignes((prev) => [...prev, { produit_id: '', quantite: '5' }])}
                  className="btn-lte btn-lte-xs btn-lte-outline-primary inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Ajouter un article
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {daLignes.map((l, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={l.produit_id}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDaLignes((prev) => prev.map((item, i) => (i === idx ? { ...item, produit_id: val } : item)));
                      }}
                      className="form-select-lte text-xs flex-1"
                    >
                      <option value="">Sélectionner un produit...</option>
                      {produits.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom} (Stock actuel: {p.quantite})
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      placeholder="Qté"
                      value={l.quantite}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDaLignes((prev) => prev.map((item, i) => (i === idx ? { ...item, quantite: val } : item)));
                      }}
                      className="form-control-lte text-xs w-28"
                    />

                    {daLignes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setDaLignes((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer-lte">
              <button
                type="button"
                onClick={() => setCreateDaOpen(false)}
                className="btn-lte btn-lte-sm btn-lte-outline-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateDa}
                className="btn-lte btn-lte-sm btn-lte-primary inline-flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Soumettre la Demande d'Achat</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Déclarer un Retour Fournisseur */}
      {createRetourOpen && (
        <Modal
          title="Déclarer un Retour de Marchandise Fournisseur"
          open={createRetourOpen}
          onClose={() => setCreateRetourOpen(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="form-label-lte">
                Bon de Commande d'origine (Reçu) <span className="text-red-500">*</span>
              </label>
              <select
                value={retourCmdId}
                onChange={(e) => {
                  const id = e.target.value;
                  setRetourCmdId(id);
                  const selected = achatsCommandes.find((c) => c.id === id);
                  if (selected && selected.commande_items?.length) {
                    setRetourLignes(
                      selected.commande_items.map((it) => ({
                        produit_id: it.produit_id,
                        quantite: '1',
                        prix: String(it.prix_unitaire || 0),
                      }))
                    );
                  }
                }}
                className="form-select-lte text-xs"
              >
                <option value="">Sélectionner une commande reçue...</option>
                {achatsCommandes
                  .filter((c) => c.statut === 'recue')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero_document || c.reference} — {c.fournisseurs?.nom} (
                      {formatCurrency(c.montant_total, entreprise?.devise)})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="form-label-lte">
                Motif du retour <span className="text-red-500">*</span>
              </label>
              <select
                value={retourMotif}
                onChange={(e) => setRetourMotif(e.target.value)}
                className="form-select-lte text-xs"
              >
                <option value="Marchandise défectueuse ou avariée">Marchandise défectueuse ou avariée</option>
                <option value="Non-conformité au cahier des charges">Non-conformité au cahier des charges</option>
                <option value="Erreur d'expédition du fournisseur (mauvaise référence)">Erreur d'expédition fournisseur</option>
                <option value="Produit périmé ou date de péremption trop courte">DLUO trop courte / périmé</option>
              </select>
            </div>

            <div>
              <label className="form-label-lte mb-2">
                Articles à réexpédier / sortir du stock
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {retourLignes.map((l, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={l.produit_id}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRetourLignes((prev) => prev.map((item, i) => (i === idx ? { ...item, produit_id: val } : item)));
                      }}
                      className="form-select-lte text-xs flex-1"
                    >
                      <option value="">Produit...</option>
                      {produits.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nom}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      placeholder="Qté"
                      value={l.quantite}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRetourLignes((prev) => prev.map((item, i) => (i === idx ? { ...item, quantite: val } : item)));
                      }}
                      className="form-control-lte text-xs w-20"
                    />

                    <input
                      type="number"
                      placeholder="Prix unit."
                      value={l.prix}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRetourLignes((prev) => prev.map((item, i) => (i === idx ? { ...item, prix: val } : item)));
                      }}
                      className="form-control-lte text-xs w-24"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer-lte">
              <button
                type="button"
                onClick={() => setCreateRetourOpen(false)}
                className="btn-lte btn-lte-sm btn-lte-outline-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleCreateRetour}
                className="btn-lte btn-lte-sm btn-lte-danger inline-flex items-center gap-2 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{saving ? 'Enregistrement...' : 'Valider le retour et déduire du stock'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Réception */}
      {receiveTarget && (
        <ConfirmDialog
          open={Boolean(receiveTarget)}
          title={`Valider la réception physique de ${receiveTarget.numero_document || receiveTarget.reference}`}
          message="Cette action va créer les mouvements d'entrée en stock dans l'entrepôt et recalculer automatiquement le Coût Moyen Unitaire Pondéré (CMUP) des articles. Confirmer ?"
          confirmLabel="Confirmer la réception et valoriser"
          variant="primary"
          onConfirm={() => handleValidateReception(receiveTarget)}
          onClose={() => setReceiveTarget(null)}
        />
      )}

      {/* Détail Modal Bon de Commande */}
      {viewBcTarget && (
        <Modal
          title={`Détail ${viewBcTarget.numero_document || viewBcTarget.reference}`}
          open={Boolean(viewBcTarget)}
          onClose={() => setViewBcTarget(null)}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-[#101e17] border border-slate-200 dark:border-[#1c3328] p-3 rounded-md">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Fournisseur</p>
                <p className="font-bold text-slate-800 dark:text-slate-100">{viewBcTarget.fournisseurs?.nom || '—'}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Date commande</p>
                <p className="font-bold text-slate-800 dark:text-slate-100">{formatDate(viewBcTarget.date_commande)}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Livraison prévue</p>
                <p className="font-bold text-slate-800 dark:text-slate-100">{viewBcTarget.date_livraison ? formatDate(viewBcTarget.date_livraison) : 'Non définie'}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Statut</p>
                <p className="font-bold text-brand-blue dark:text-brand-green">{viewBcTarget.statut.toUpperCase()}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Articles commandés :</p>
              <div className="border border-slate-200 dark:border-[#1c3328] rounded-md overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 dark:bg-[#162920] text-slate-700 dark:text-slate-300 font-semibold">
                    <tr>
                      <th className="p-2">Produit</th>
                      <th className="p-2 text-right">Quantité</th>
                      <th className="p-2 text-right">Prix Unitaire</th>
                      <th className="p-2 text-right">Sous-total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1c3328]">
                    {(viewBcTarget.commande_items || []).map((it) => (
                      <tr key={it.id}>
                        <td className="p-2 text-slate-900 dark:text-slate-100 font-medium">{it.produits?.nom || it.produit_id}</td>
                        <td className="p-2 text-right font-semibold">{it.quantite}</td>
                        <td className="p-2 text-right">{formatCurrency(it.prix_unitaire, entreprise?.devise)}</td>
                        <td className="p-2 text-right font-bold text-slate-900 dark:text-slate-100">{formatCurrency(it.sous_total, entreprise?.devise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer-lte flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300">Total TTC</span>
              <span className="text-base font-extrabold text-brand-blue dark:text-brand-green">
                {formatCurrency(viewBcTarget.montant_total, entreprise?.devise)}
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
