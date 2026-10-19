import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  ArrowDownCircle,
  ArrowUpCircle,
  Trash2,
  ArrowLeftRight,
  Zap,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  FileCheck2,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import type {
  MouvementWithProduit,
  ProduitWithCategorie,
  Entrepot,
  Lot,
  StockEntrepot,
  MotifAjustement,
  StockAjustement,
} from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatNumber, formatDate, formatCurrency, daysUntil } from '@/lib/format';
import { writeRow, fetchTable } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Card, InfoBox, Callout } from '@/components/adminlte';
import { useAuth } from '@/lib/auth';

type Props = {
  mouvements: MouvementWithProduit[];
  produits: ProduitWithCategorie[];
  entrepots: Entrepot[];
  lots: Lot[];
  stocksEntrepot: StockEntrepot[];
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
};

const MOTIFS_REGLEMENTAIRES: { id: MotifAjustement; label: string; description: string }[] = [
  { id: 'casse', label: 'Casse / Dommage', description: 'Marchandise endommagée lors de la manipulation' },
  { id: 'vol', label: 'Vol / Disparition', description: 'Perte constatée sans trace d\'encaissement' },
  { id: 'peremption', label: 'Péremption (DLUO)', description: 'Retrait du stock car date limite atteinte' },
  { id: 'echantillon', label: 'Échantillon Commercial', description: 'Don ou prélèvement pour démonstration client' },
  { id: 'ecart_inventaire', label: 'Écart de Comptage', description: 'Régularisation suite à inventaire physique' },
  { id: 'revalorisation', label: 'Revalorisation de Stock', description: 'Correction de quantité ou de conditionnement' },
  { id: 'autre', label: 'Autre motif motivé', description: 'Justification manuelle obligatoire' },
];

const SEUIL_VALIDATION_DEFAUT = 50000; // 50 000 FCFA

export function Mouvements({
  mouvements,
  produits,
  entrepots,
  lots,
  stocksEntrepot,
  loading,
  onRefresh,
  role,
}: Props) {
  const { profile } = useAuth();
  const canCreate = can(role, 'mouvements', 'create');
  const canDelete = can(role, 'mouvements', 'delete');
  const isManager = role === 'admin' || role === 'gerant' || profile?.super_admin;

  const [activeTab, setActiveTab] = useState<'mouvements' | 'ajustements'>('mouvements');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [ajustementModalOpen, setAjustementModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MouvementWithProduit | null>(null);

  // Form Mouvement ordinaire
  const [produitId, setProduitId] = useState('');
  const [type, setType] = useState<'entree' | 'sortie'>('entree');
  const [quantite, setQuantite] = useState('1');
  const [motif, setMotif] = useState('');
  const [fournisseur, setFournisseur] = useState('');
  const [destinataire, setDestinataire] = useState('');
  const [reference, setReference] = useState('');
  const [entrepotId, setEntrepotId] = useState('');
  const [lotId, setLotId] = useState('');
  const [prixUnitaire, setPrixUnitaire] = useState('0');
  const [saving, setSaving] = useState(false);

  // Form Ajustement Réglementé
  const [ajustProduitId, setAjustProduitId] = useState('');
  const [ajustSiteId, setAjustSiteId] = useState('');
  const [ajustType, setAjustType] = useState<'positif' | 'negatif'>('negatif');
  const [ajustQuantite, setAjustQuantite] = useState('1');
  const [ajustMotif, setAjustMotif] = useState<MotifAjustement>('casse');
  const [ajustDescription, setAjustDescription] = useState('');
  const [ajustLotId, setAjustLotId] = useState('');
  const [ajustementsList, setAjustementsList] = useState<StockAjustement[]>([]);

  const loadAjustements = useCallback(async () => {
    const data = await fetchTable<StockAjustement>(
      'stock_ajustements',
      '*, site:entrepots(nom)',
      { column: 'created_at', ascending: false }
    );
    setAjustementsList(data || []);
  }, []);

  useEffect(() => {
    loadAjustements();
  }, [loadAjustements]);

  const filtered = useMemo(() => {
    return mouvements.filter((m) => {
      const matchSearch =
        (m.produits?.nom || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.motif || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.reference || '').toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === 'all' || m.type === filterType;
      return matchSearch && matchType;
    });
  }, [mouvements, search, filterType]);

  const produitLots = useMemo(() => {
    if (!produitId) return [];
    return lots
      .filter((l) => l.produit_id === produitId && l.quantite > 0)
      .sort((a, b) => (a.date_peremption || '9999').localeCompare(b.date_peremption || '9999'));
  }, [produitId, lots]);

  const lotChoisi = produitLots.find((l) => l.id === lotId) || null;

  const openAdd = () => {
    setProduitId(produits[0]?.id || '');
    setType('entree');
    setQuantite('1');
    setMotif('');
    setFournisseur('');
    setDestinataire('');
    setReference('');
    setEntrepotId(entrepots[0]?.id || '');
    setLotId('');
    setPrixUnitaire('0');
    setModalOpen(true);
  };

  const openAddAjustement = () => {
    setAjustProduitId(produits[0]?.id || '');
    setAjustSiteId(entrepots[0]?.id || '');
    setAjustType('negatif');
    setAjustQuantite('1');
    setAjustMotif('casse');
    setAjustDescription('');
    setAjustLotId('');
    setAjustementModalOpen(true);
  };

  const saveMouvement = async () => {
    if (!produitId) {
      showToast('Veuillez sélectionner un produit', 'error');
      return;
    }
    const qte = parseInt(quantite);
    if (!qte || qte <= 0) {
      showToast('La quantité doit être positive', 'error');
      return;
    }
    const produit = produits.find((p) => p.id === produitId);
    if (type === 'sortie' && produit && qte > produit.quantite) {
      showToast('Stock insuffisant pour cette sortie', 'error');
      return;
    }
    if (lotChoisi && type === 'sortie' && qte > lotChoisi.quantite) {
      showToast(`Le lot ${lotChoisi.numero_lot} ne contient que ${lotChoisi.quantite} unité(s)`, 'error');
      return;
    }

    setSaving(true);
    const payload = {
      produit_id: produitId,
      type,
      quantite: qte,
      motif: motif.trim() || null,
      fournisseur: type === 'entree' ? fournisseur.trim() || null : null,
      destinataire: type === 'sortie' ? destinataire.trim() || null : null,
      reference: reference.trim() || null,
      entrepot_id: entrepotId || null,
      lot_id: lotId || null,
      prix_unitaire: type === 'entree' ? parseFloat(prixUnitaire) || 0 : 0,
    };

    const result = await writeRow('mouvements', 'insert', payload);
    setSaving(false);
    if (result.error) {
      showToast('Erreur: ' + result.error, 'error');
      return;
    }

    showToast(type === 'entree' ? 'Entrée de stock enregistrée' : 'Sortie de stock enregistrée');
    setModalOpen(false);
    onRefresh();
  };

  // Enregistrer un Ajustement Réglementé (avec seuil de validation gérant)
  const saveAjustement = async () => {
    const prod = produits.find((p) => p.id === ajustProduitId);
    if (!prod) {
      showToast('Veuillez sélectionner un produit', 'error');
      return;
    }
    const qte = parseInt(ajustQuantite);
    if (!qte || qte <= 0) {
      showToast('La quantité doit être positive', 'error');
      return;
    }
    if (!ajustDescription.trim()) {
      showToast('Veuillez renseigner une justification pour cet ajustement', 'error');
      return;
    }

    const coutUnitaire = prod.cmup > 0 ? prod.cmup : prod.prix_unitaire || 0;
    const valeurTotale = Math.round(qte * coutUnitaire);
    const numDoc = `AJU-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;

    const exigeApprobation = valeurTotale > SEUIL_VALIDATION_DEFAUT && !isManager;

    setSaving(true);

    // 1. Créer le document d'ajustement
    const ajustPayload = {
      numero_document: numDoc,
      site_id: ajustSiteId || null,
      motif: ajustMotif,
      description: ajustDescription.trim(),
      statut: exigeApprobation ? 'en_attente' : 'approuve',
      valeur_totale: valeurTotale,
      exige_approbation: exigeApprobation,
      created_by: profile?.id || null,
      approuve_par: !exigeApprobation ? profile?.id || null : null,
      approuve_at: !exigeApprobation ? new Date().toISOString() : null,
    };

    const resAjust = await writeRow('stock_ajustements', 'insert', ajustPayload);
    if (resAjust.error) {
      showToast('Erreur: ' + resAjust.error, 'error');
      setSaving(false);
      return;
    }

    // 2. Si approbation requise, soumettre au workflow de validation
    if (exigeApprobation) {
      await writeRow('validations_workflow', 'insert', {
        type_demande: 'ajustement_stock',
        reference_id: resAjust.id || numDoc,
        reference_numero: numDoc,
        site_id: ajustSiteId || null,
        demandeur_id: profile?.id || null,
        statut: 'en_attente',
        valeur_estimee: valeurTotale,
        details: {
          motif: ajustMotif,
          description: ajustDescription,
          produit_nom: prod.nom,
          quantite: qte,
          type: ajustType,
        },
      });

      showToast(
        `Ajustement ${numDoc} soumis pour validation (Valeur: ${formatCurrency(valeurTotale)} > seuil ${formatCurrency(SEUIL_VALIDATION_DEFAUT)})`,
        'info'
      );
    } else {
      // 3. Si approuvé directement (valeur < seuil ou validé par le gérant), impacter les mouvements
      await writeRow('mouvements', 'insert', {
        produit_id: prod.id,
        type: ajustType === 'positif' ? 'entree' : 'sortie',
        quantite: qte,
        motif: `Ajustement Réglementé [${numDoc}] - Motif: ${ajustMotif} : ${ajustDescription}`,
        reference: numDoc,
        entrepot_id: ajustSiteId || null,
        lot_id: ajustLotId || null,
        prix_unitaire: coutUnitaire,
      });

      showToast(`Ajustement ${numDoc} validé et appliqué immédiatement au stock`);
    }

    setSaving(false);
    setAjustementModalOpen(false);
    loadAjustements();
    onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await writeRow('mouvements', 'delete', {}, deleteTarget.id);
    if (result.error) {
      showToast('Erreur: ' + result.error, 'error');
      return;
    }
    showToast('Mouvement supprimé, stock rétabli');
    setDeleteTarget(null);
    onRefresh();
  };

  const totalEntrees = useMemo(() => {
    return mouvements.filter((m) => m.type === 'entree').reduce((s, m) => s + m.quantite, 0);
  }, [mouvements]);

  const totalSorties = useMemo(() => {
    return mouvements.filter((m) => m.type === 'sortie').reduce((s, m) => s + m.quantite, 0);
  }, [mouvements]);

  return (
    <div className="space-y-5">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <ArrowLeftRight className="w-7 h-7 text-sky-600 dark:text-sky-400" />
            Mouvements & Ajustements Réglementés
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Traçabilité intégrale des flux d'entrées/sorties et régularisations avec motifs réglementés
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canCreate && (
            <>
              <button
                onClick={openAddAjustement}
                className="btn-lte btn-lte-outline flex items-center gap-1.5"
              >
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                Ajustement Réglementé
              </button>
              <button
                onClick={openAdd}
                className="btn-lte btn-lte-primary flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Nouveau Mouvement
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Metric Info-Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <InfoBox
          title="Total Entrées de Stock"
          value={`+${formatNumber(totalEntrees)}`}
          variant="success"
          icon={ArrowDownCircle}
          description="Approvisionnements & retours"
        />
        <InfoBox
          title="Total Sorties de Stock"
          value={`-${formatNumber(totalSorties)}`}
          variant="danger"
          icon={ArrowUpCircle}
          description="Ventes & transferts déstockés"
        />
        <InfoBox
          title="Flux Journalisés"
          value={formatNumber(mouvements.length)}
          variant="info"
          icon={ArrowLeftRight}
          description="Traçabilité continue"
        />
        <InfoBox
          title="Ajustements Réglementés"
          value={ajustementsList.length}
          variant="warning"
          icon={FileCheck2}
          description="Casses, vols, périmés..."
        />
      </div>

      {/* 3. Onglets Mouvements Ordinaires vs Ajustements Réglementés */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          onClick={() => setActiveTab('mouvements')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'mouvements'
              ? 'border-sky-500 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          Journal des Mouvements ({filtered.length})
        </button>

        <button
          onClick={() => setActiveTab('ajustements')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'ajustements'
              ? 'border-sky-500 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          Ajustements Réglementés & Approbations ({ajustementsList.length})
        </button>
      </div>

      {/* 4. Tab Mouvements Ordinaires */}
      {activeTab === 'mouvements' && (
        <Card noPadding>
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par produit, motif, référence..."
                className="form-control-lte pl-9 text-xs"
              />
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => setFilterType('all')}
                className={`btn-lte btn-lte-sm ${
                  filterType === 'all' ? 'btn-lte-primary' : 'btn-lte-outline-secondary'
                }`}
              >
                Tous
              </button>
              <button
                onClick={() => setFilterType('entree')}
                className={`btn-lte btn-lte-sm ${
                  filterType === 'entree' ? 'btn-lte-success' : 'btn-lte-outline-secondary'
                }`}
              >
                Entrées (+)
              </button>
              <button
                onClick={() => setFilterType('sortie')}
                className={`btn-lte btn-lte-sm ${
                  filterType === 'sortie' ? 'btn-lte-danger' : 'btn-lte-outline-secondary'
                }`}
              >
                Sorties (−)
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="table-adminlte text-xs">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Produit</th>
                  <th className="text-right">Quantité</th>
                  <th>Site / Dépôt</th>
                  <th>Motif & Contexte</th>
                  <th>Référence</th>
                  <th>Date & Heure</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Aucun mouvement de stock trouvé.
                    </td>
                  </tr>
                ) : (
                  filtered.map((m) => {
                    const isEntree = m.type === 'entree';
                    const site = entrepots.find((e) => e.id === m.entrepot_id);

                    return (
                      <tr key={m.id}>
                        <td>
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold ${
                              isEntree
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30'
                            }`}
                          >
                            {isEntree ? '+' : '−'} {isEntree ? 'ENTRÉE' : 'SORTIE'}
                          </span>
                        </td>
                        <td className="font-semibold text-slate-900 dark:text-slate-100">
                          {m.produits?.nom || 'Article inconnu'}
                        </td>
                        <td className="text-right font-mono font-bold text-sm">
                          {formatNumber(m.quantite)}
                        </td>
                        <td>{site?.nom || 'Stock Central'}</td>
                        <td className="max-w-[240px] truncate">{m.motif || '—'}</td>
                        <td className="font-mono text-slate-500">{m.reference || '—'}</td>
                        <td>{formatDate(m.created_at)}</td>
                        <td className="text-right">
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(m)}
                              className="p-1 rounded text-slate-400 hover:text-red-500"
                              title="Annuler ce mouvement"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      {/* 5. Tab Ajustements Réglementés */}
      {activeTab === 'ajustements' && (
        <Card noPadding>
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-amber-500/5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                Registre des Ajustements Réglementés & Dépréciations
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tout ajustement supérieur à <strong>{formatCurrency(SEUIL_VALIDATION_DEFAUT)}</strong> est soumis au visa préalable du gérant.
              </p>
            </div>

            {canCreate && (
              <button
                onClick={openAddAjustement}
                className="btn-lte btn-lte-sm btn-lte-primary flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Nouvel Ajustement
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="table-adminlte text-xs">
              <thead>
                <tr>
                  <th>N° Document</th>
                  <th>Motif Réglementaire</th>
                  <th>Site</th>
                  <th className="text-right">Valeur Estimée</th>
                  <th>Justification</th>
                  <th>Statut Approbation</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {ajustementsList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Aucun ajustement réglementé enregistré.
                    </td>
                  </tr>
                ) : (
                  ajustementsList.map((a) => (
                    <tr key={a.id}>
                      <td className="font-mono font-bold text-sky-600 dark:text-sky-400">
                        {a.numero_document}
                      </td>
                      <td className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                        {a.motif.replace('_', ' ')}
                      </td>
                      <td>{a.site?.nom || 'Dépôt Central'}</td>
                      <td className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(a.valeur_totale)}
                      </td>
                      <td className="max-w-[280px] truncate text-slate-600 dark:text-slate-300">
                        {a.description || '—'}
                      </td>
                      <td>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            a.statut === 'approuve'
                              ? 'bg-emerald-500/20 text-emerald-500'
                              : a.statut === 'en_attente'
                              ? 'bg-amber-500/20 text-amber-500 animate-pulse'
                              : 'bg-red-500/20 text-red-500'
                          }`}
                        >
                          {a.statut}
                        </span>
                      </td>
                      <td>{formatDate(a.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 6. Modal Mouvement Ordinaire */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Enregistrer un mouvement de stock"
      >
        <div className="space-y-4 text-xs">
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setType('entree')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                type === 'entree'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Entrée (+)
            </button>
            <button
              type="button"
              onClick={() => setType('sortie')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                type === 'sortie'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Sortie (−)
            </button>
          </div>

          <div>
            <label className="block font-semibold mb-1">Article *</label>
            <select
              value={produitId}
              onChange={(e) => setProduitId(e.target.value)}
              className="form-control-lte text-xs"
            >
              {produits.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom} (Stock actuel : {p.quantite})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Quantité *</label>
              <input
                type="number"
                min="1"
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
                className="form-control-lte text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Site / Dépôt</label>
              <select
                value={entrepotId}
                onChange={(e) => setEntrepotId(e.target.value)}
                className="form-control-lte text-xs"
              >
                <option value="">Stock central</option>
                {entrepots.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Motif du mouvement</label>
            <input
              type="text"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Ex: Réapprovisionnement local, vente comptoir..."
              className="form-control-lte text-xs"
            />
          </div>

          {produitLots.length > 0 && (
            <div>
              <label className="block font-semibold mb-1 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-sky-500" />
                Lot concerné (Tri FEFO recommandé)
              </label>
              <select
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
                className="form-control-lte text-xs font-mono"
              >
                <option value="">Sélection automatique ou aucun</option>
                {produitLots.map((l, idx) => (
                  <option key={l.id} value={l.id}>
                    {l.numero_lot} {l.date_peremption ? `(DLUO: ${l.date_peremption})` : ''} — Qte: {l.quantite} {idx === 0 && type === 'sortie' ? '← PRIORITÉ FEFO' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button onClick={() => setModalOpen(false)} className="btn-lte btn-lte-outline">
              Annuler
            </button>
            <button
              onClick={saveMouvement}
              disabled={saving}
              className={`btn-lte ${type === 'entree' ? 'btn-lte-success' : 'btn-lte-danger'}`}
            >
              Valider le mouvement
            </button>
          </div>
        </div>
      </Modal>

      {/* 7. Modal Ajustement Réglementé */}
      <Modal
        open={ajustementModalOpen}
        onClose={() => setAjustementModalOpen(false)}
        title="Déclarer un Ajustement de Stock Réglementé"
        size="lg"
      >
        <div className="space-y-4 text-xs">
          <Callout type="warning" title="Procédure de Contrôle des Pertes & Régularisations">
            Les ajustements de stock modifient l'inventaire comptable. Choisissez obligatoirement un motif
            réglementaire et justifiez l'opération. Si le montant excède {formatCurrency(SEUIL_VALIDATION_DEFAUT)},
            la demande sera soumise à l'approbation du gérant.
          </Callout>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Article à ajuster *</label>
              <select
                value={ajustProduitId}
                onChange={(e) => setAjustProduitId(e.target.value)}
                className="form-control-lte text-xs"
              >
                {produits.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom} (Stock actuel : {p.quantite})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Dépôt concerné</label>
              <select
                value={ajustSiteId}
                onChange={(e) => setAjustSiteId(e.target.value)}
                className="form-control-lte text-xs"
              >
                <option value="">Dépôt Central</option>
                {entrepots.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Sens de l'ajustement</label>
              <select
                value={ajustType}
                onChange={(e) => setAjustType(e.target.value as any)}
                className="form-control-lte text-xs font-semibold"
              >
                <option value="negatif">Diminution / Perte (−)</option>
                <option value="positif">Augmentation / Surplus (+)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Quantité à ajuster *</label>
              <input
                type="number"
                min="1"
                value={ajustQuantite}
                onChange={(e) => setAjustQuantite(e.target.value)}
                className="form-control-lte text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Motif Réglementaire Obligatoire *</label>
            <select
              value={ajustMotif}
              onChange={(e) => setAjustMotif(e.target.value as MotifAjustement)}
              className="form-control-lte text-xs font-bold"
            >
              {MOTIFS_REGLEMENTAIRES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — ({m.description})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">Description & Justification Détaillée *</label>
            <textarea
              rows={2}
              value={ajustDescription}
              onChange={(e) => setAjustDescription(e.target.value)}
              placeholder="Circonstances constatées, n° de procès-verbal ou rapport de casse..."
              className="form-control-lte text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button onClick={() => setAjustementModalOpen(false)} className="btn-lte btn-lte-outline">
              Annuler
            </button>
            <button
              onClick={saveAjustement}
              disabled={saving}
              className="btn-lte btn-lte-primary flex items-center gap-1.5"
            >
              <FileCheck2 className="w-4 h-4" />
              Soumettre l'ajustement
            </button>
          </div>
        </div>
      </Modal>

      {/* 8. Dialog de suppression */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer le mouvement"
        message="La suppression de ce mouvement rétablira automatiquement le stock initial."
        confirmLabel="Supprimer"
      />
    </div>
  );
}
