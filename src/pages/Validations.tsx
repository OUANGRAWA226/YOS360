import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Search,
  FileText,
  Boxes,
  Truck,
  Repeat,
  DollarSign,
  Eye,
  MessageSquare,
} from 'lucide-react';
import type {
  ValidationWorkflow,
  TypeDemandeWorkflow,
  Profile,
  Entrepot,
} from '@/lib/supabase';
import { Card, InfoBox, SmallBox, Callout } from '@/components/adminlte';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatNumber, formatDate, formatCurrency } from '@/lib/format';
import { fetchTable, writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { useAuth } from '@/lib/auth';

type Props = {
  role: Role | null;
  entrepots: Entrepot[];
  loading: boolean;
};

export function Validations({ role, entrepots, loading: parentLoading }: Props) {
  const { profile } = useAuth();
  const canApprove = role === 'admin' || role === 'gerant' || profile?.super_admin;
  const [validations, setValidations] = useState<ValidationWorkflow[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'en_attente' | 'historique'>('en_attente');
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');

  // Modals d'action
  const [inspectTarget, setInspectTarget] = useState<ValidationWorkflow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ValidationWorkflow | null>(null);
  const [motifRejet, setMotifRejet] = useState('');
  const [approveTarget, setApproveTarget] = useState<ValidationWorkflow | null>(null);
  const [saving, setSaving] = useState(false);

  const loadValidations = useCallback(async () => {
    setLoading(true);
    const data = await fetchTable<ValidationWorkflow>(
      'validations_workflow',
      '*',
      { column: 'created_at', ascending: false }
    );
    setValidations(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadValidations();
  }, [loadValidations]);

  const stats = useMemo(() => {
    const enAttente = validations.filter((v) => v.statut === 'en_attente');
    const approuvees = validations.filter((v) => v.statut === 'approuve');
    const rejetees = validations.filter((v) => v.statut === 'rejete');
    const valeurBloquee = enAttente.reduce((s, v) => s + (v.valeur_estimee || 0), 0);

    return {
      totalEnAttente: enAttente.length,
      approuvees: approuvees.length,
      rejetees: rejetees.length,
      valeurBloquee,
    };
  }, [validations]);

  const filtered = useMemo(() => {
    return validations.filter((v) => {
      if (activeTab === 'en_attente' && v.statut !== 'en_attente') return false;
      if (activeTab === 'historique' && v.statut === 'en_attente') return false;

      if (filterType !== 'all' && v.type_demande !== filterType) return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        v.reference_numero.toLowerCase().includes(q) ||
        v.type_demande.toLowerCase().includes(q) ||
        JSON.stringify(v.details).toLowerCase().includes(q)
      );
    });
  }, [validations, activeTab, filterType, search]);

  const handleApprove = async () => {
    if (!approveTarget) return;
    setSaving(true);

    // Mettre à jour le statut du workflow
    const res = await writeRow(
      'validations_workflow',
      'update',
      {
        statut: 'approuve',
        valide_par: profile?.id || null,
        valide_at: new Date().toISOString(),
      },
      approveTarget.id
    );

    // Si c'est un ajustement de stock, impacter le stock
    if (approveTarget.type_demande === 'ajustement_stock') {
      await writeRow(
        'stock_ajustements',
        'update',
        {
          statut: 'approuve',
          approuve_par: profile?.id || null,
          approuve_at: new Date().toISOString(),
        },
        approveTarget.reference_id
      );
    }

    setSaving(false);
    if (res.error) {
      showToast('Erreur: ' + res.error, 'error');
      return;
    }

    showToast(`Demande ${approveTarget.reference_numero} approuvée avec succès`);
    setApproveTarget(null);
    loadValidations();
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!motifRejet.trim()) {
      showToast('Le motif du refus est obligatoire', 'error');
      return;
    }

    setSaving(true);
    const res = await writeRow(
      'validations_workflow',
      'update',
      {
        statut: 'rejete',
        valide_par: profile?.id || null,
        valide_at: new Date().toISOString(),
        motif_rejet: motifRejet.trim(),
      },
      rejectTarget.id
    );

    if (rejectTarget.type_demande === 'ajustement_stock') {
      await writeRow(
        'stock_ajustements',
        'update',
        {
          statut: 'rejete',
          motif_rejet: motifRejet.trim(),
        },
        rejectTarget.reference_id
      );
    }

    setSaving(false);
    if (res.error) {
      showToast('Erreur: ' + res.error, 'error');
      return;
    }

    showToast(`Demande ${rejectTarget.reference_numero} rejetée`);
    setRejectTarget(null);
    setMotifRejet('');
    loadValidations();
  };

  const getTypeLabel = (type: TypeDemandeWorkflow) => {
    switch (type) {
      case 'ajustement_stock':
        return { label: 'Ajustement Stock', icon: Boxes, color: 'text-amber-500 bg-amber-500/10' };
      case 'bon_commande':
        return { label: 'Bon de Commande', icon: Truck, color: 'text-sky-500 bg-sky-500/10' };
      case 'remise_exceptionnelle':
        return { label: 'Remise Exceptionnelle', icon: DollarSign, color: 'text-purple-500 bg-purple-500/10' };
      case 'transfert_stock':
        return { label: 'Transfert Inter-Sites', icon: Repeat, color: 'text-emerald-500 bg-emerald-500/10' };
      default:
        return { label: type, icon: FileText, color: 'text-slate-500 bg-slate-500/10' };
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <CheckSquare className="w-7 h-7 text-sky-600 dark:text-sky-400" />
            Validations en Attente & Workflows
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Contrôle hiérarchique des ajustements de stock réglementés, remises dérogatoires et transferts
          </p>
        </div>
      </div>

      {/* 2. Info Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoBox
          title="En attente d'approbation"
          value={stats.totalEnAttente}
          icon={Clock}
          color="warning"
          subText="Nécessite arbitrage gérant"
        />
        <InfoBox
          title="Valeur Totale Arbitrée"
          value={formatCurrency(stats.valeurBloquee)}
          icon={DollarSign}
          color="danger"
          subText="Impact financier en suspens"
        />
        <InfoBox
          title="Demandes Approuvées"
          value={stats.approuvees}
          icon={CheckCircle2}
          color="success"
          subText="Exécutées sur le système"
        />
        <InfoBox
          title="Demandes Rejetées"
          value={stats.rejetees}
          icon={XCircle}
          color="secondary"
          subText="Historique des refus motivés"
        />
      </div>

      {/* 3. Onglets & Filtres */}
      <Card noPadding>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('en_attente')}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'en_attente'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              À traiter ({stats.totalEnAttente})
            </button>

            <button
              onClick={() => setActiveTab('historique')}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'historique'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Historique ({stats.approuvees + stats.rejetees})
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="form-control-lte text-xs w-auto"
            >
              <option value="all">Tous les types de flux</option>
              <option value="ajustement_stock">Ajustements Stock</option>
              <option value="bon_commande">Bons de Commande</option>
              <option value="remise_exceptionnelle">Remises Exceptionnelles</option>
              <option value="transfert_stock">Transferts Inter-Sites</option>
            </select>

            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="N° document, motif..."
                className="form-control-lte pl-8 w-full text-xs"
              />
            </div>
          </div>
        </div>

        {/* 4. Tableau des Demandes */}
        <div className="overflow-x-auto">
          <table className="table-adminlte text-xs">
            <thead>
              <tr>
                <th>Type de Demande</th>
                <th>Réf. Document</th>
                <th>Site Concerné</th>
                <th className="text-right">Valeur Estimée</th>
                <th>Motif & Justification</th>
                <th>Date Soumission</th>
                <th className="text-center">Statut</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Aucune demande dans cette section.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const typeInfo = getTypeLabel(item.type_demande);
                  const Icon = typeInfo.icon;
                  const site = entrepots.find((e) => e.id === item.site_id);

                  return (
                    <tr key={item.id}>
                      <td>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold ${typeInfo.color}`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {typeInfo.label}
                        </span>
                      </td>

                      <td className="font-mono font-bold text-sky-600 dark:text-sky-400">
                        {item.reference_numero}
                      </td>

                      <td>{site?.nom || 'Site Global'}</td>

                      <td className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {item.valeur_estimee > 0 ? formatCurrency(item.valeur_estimee) : '—'}
                      </td>

                      <td className="max-w-[260px] truncate">
                        <span className="text-slate-600 dark:text-slate-300">
                          {String(item.details?.motif || item.details?.description || 'Validation réglementaire')}
                        </span>
                      </td>

                      <td>{formatDate(item.created_at)}</td>

                      <td className="text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            item.statut === 'en_attente'
                              ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30 animate-pulse'
                              : item.statut === 'approuve'
                              ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                              : 'bg-red-500/20 text-red-500 border border-red-500/30'
                          }`}
                        >
                          {item.statut}
                        </span>
                      </td>

                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setInspectTarget(item)}
                            className="p-1 rounded text-slate-400 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="Inspecter les détails"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {canApprove && item.statut === 'en_attente' && (
                            <>
                              <button
                                onClick={() => setApproveTarget(item)}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 shadow-sm"
                                title="Approuver la demande"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Valider
                              </button>

                              <button
                                onClick={() => {
                                  setRejectTarget(item);
                                  setMotifRejet('');
                                }}
                                className="px-2 py-1 rounded bg-red-600/15 hover:bg-red-600 text-red-500 hover:text-white font-bold flex items-center gap-1"
                                title="Rejeter la demande"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Refuser
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 5. Modal d'Inspection des Détails */}
      <Modal
        isOpen={!!inspectTarget}
        onClose={() => setInspectTarget(null)}
        title={`Détail de la demande [${inspectTarget?.reference_numero}]`}
        size="lg"
      >
        {inspectTarget && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-slate-400 block">Type de Demande</span>
                <span className="font-bold">{inspectTarget.type_demande}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Valeur Financière</span>
                <span className="font-bold font-mono text-emerald-600">
                  {formatCurrency(inspectTarget.valeur_estimee)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Statut Actuel</span>
                <span className="font-bold uppercase">{inspectTarget.statut}</span>
              </div>
            </div>

            <div>
              <span className="font-semibold block mb-1">Détails et Pièces Jointes JSONB :</span>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto font-mono text-[11px]">
                {JSON.stringify(inspectTarget.details, null, 2)}
              </pre>
            </div>

            {inspectTarget.motif_rejet && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
                <span className="font-bold block mb-1">Motif du Refus :</span>
                <p>{inspectTarget.motif_rejet}</p>
              </div>
            )}

            <div className="modal-footer-lte">
              <button
                type="button"
                onClick={() => setInspectTarget(null)}
                className="btn-lte btn-lte-sm btn-lte-outline-secondary"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* 6. Modal de Confirmation de Validation */}
      <ConfirmDialog
        isOpen={!!approveTarget}
        title={`Approuver la demande ${approveTarget?.reference_numero} ?`}
        message={`Cette action va valider l'opération et impacter immédiatement les stocks ou finances correspondants.`}
        onConfirm={handleApprove}
        onCancel={() => setApproveTarget(null)}
        variant="primary"
      />

      {/* 7. Modal de Motif de Refus */}
      <Modal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title={`Refuser la demande ${rejectTarget?.reference_numero}`}
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-500 dark:text-slate-400">
            Veuillez motiver le motif du rejet. Ce message sera consigné dans l'audit et communiqué au demandeur.
          </p>

          <div>
            <label className="form-label-lte">Motif obligatoire du refus *</label>
            <textarea
              rows={3}
              value={motifRejet}
              onChange={(e) => setMotifRejet(e.target.value)}
              placeholder="Ex: Écart injustifié, prix fournisseur excessif, quota mensuel atteint..."
              className="form-control-lte text-xs"
            />
          </div>

          <div className="modal-footer-lte">
            <button onClick={() => setRejectTarget(null)} className="btn-lte btn-lte-sm btn-lte-outline-secondary">
              Annuler
            </button>
            <button onClick={handleReject} disabled={saving} className="btn-lte btn-lte-sm btn-lte-danger">
              Confirmer le Refus
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
