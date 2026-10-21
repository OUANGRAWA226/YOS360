import { useState } from 'react';
import { Plus, Trash2, Printer } from 'lucide-react';
import type { ProduitWithCategorie, Lot } from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { showToast } from '@/components/Toast';
import { writeRow } from '@/lib/dataLayer';
import { daysUntil, peremptionLabel, formatShortDate, formatCurrency } from '@/lib/format';
import { can, type Role } from '@/lib/permissions';

// Gestion des lots / numéros de série / dates de péremption d'un produit.
export function LotManager({ produit, lots, onClose, onChanged, role }: {
  produit: ProduitWithCategorie;
  lots: Lot[];
  onClose: () => void;
  onChanged: () => void;
  role: Role | null;
}) {
  const canCreate = can(role, 'lots', 'create');
  const canDelete = can(role, 'lots', 'delete');
  const [numeroLot, setNumeroLot] = useState('');
  const [numeroSerie, setNumeroSerie] = useState('');
  const [datePeremption, setDatePeremption] = useState('');
  const [quantite, setQuantite] = useState('0');
  const [prix, setPrix] = useState('0');
  const [saving, setSaving] = useState(false);

  const sorted = [...lots].sort((a, b) => {
    if (!a.date_peremption) return 1;
    if (!b.date_peremption) return -1;
    return a.date_peremption.localeCompare(b.date_peremption);
  });

  const save = async () => {
    if (!numeroLot.trim()) { showToast('Le numéro de lot est obligatoire', 'error'); return; }
    setSaving(true);
    const result = await writeRow('lots', 'insert', {
      produit_id: produit.id,
      numero_lot: numeroLot.trim(),
      numero_serie: numeroSerie.trim() || null,
      date_peremption: datePeremption || null,
      quantite: parseInt(quantite) || 0,
      prix_unitaire: parseFloat(prix) || 0,
    });
    setSaving(false);
    if (result.offline) showToast('Lot enregistré localement, sera synchronisé', 'info');
    else if (result.error) { showToast('Erreur: ' + result.error, 'error'); return; }
    else showToast('Lot ajouté');
    setNumeroLot(''); setNumeroSerie(''); setDatePeremption(''); setQuantite('0'); setPrix('0');
    onChanged();
  };

  const removeLot = async (lot: Lot) => {
    const result = await writeRow('lots', 'delete', {}, lot.id);
    if (result.offline) showToast('Suppression enregistrée localement (hors-ligne)', 'info');
    else if (result.error) { showToast('Erreur: ' + result.error, 'error'); return; }
    else showToast('Lot supprimé');
    onChanged();
  };

  const printLabel = (lot: Lot) => {
    void lot;
    showToast('Utilisez la page Scan pour générer l\u2019étiquette imprimable avec code-barres', 'info');
  };

  return (
    <Modal open={true} onClose={onClose} title={`Lots & péremption — ${produit.nom}`} size="lg">
      <div className="space-y-4">
        {!produit.perissable && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-sm text-sky-800">
            Ce produit n'est pas marqué comme périssable. Activez « Produit périssable » dans sa fiche pour suivre les alertes d'expiration.
          </div>
        )}

        <div className="border border-slate-200 dark:border-[#24382e] rounded-xl overflow-hidden">
          <table className="table-adminlte text-xs">
            <thead>
              <tr>
                <th className="text-left font-semibold">N° lot</th>
                <th className="text-left font-semibold hidden sm:table-cell">N° série</th>
                <th className="text-left font-semibold">Péremption</th>
                <th className="text-right font-semibold">Qté</th>
                <th className="text-right font-semibold hidden sm:table-cell">Prix</th>
                <th className="text-right"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-slate-400">Aucun lot enregistré</td></tr>
              ) : sorted.map((l) => {
                const d = l.date_peremption ? daysUntil(l.date_peremption) : null;
                const pl = d !== null ? peremptionLabel(d) : null;
                return (
                  <tr key={l.id}>
                    <td className="font-mono text-slate-900 dark:text-slate-100 font-semibold">{l.numero_lot}</td>
                    <td className="hidden sm:table-cell font-mono text-slate-500">{l.numero_serie || '—'}</td>
                    <td>
                      {l.date_peremption ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-slate-700 dark:text-slate-300">{formatShortDate(l.date_peremption)}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${pl!.cls}`}>{pl!.label}</span>
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="text-right font-mono font-bold text-slate-900 dark:text-slate-100">{l.quantite}</td>
                    <td className="hidden sm:table-cell text-right font-mono text-slate-600 dark:text-slate-400">{l.prix_unitaire > 0 ? formatCurrency(l.prix_unitaire) : '—'}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => printLabel(l)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors" title="Étiquette"><Printer className="w-4 h-4" /></button>
                        {canDelete && <button onClick={() => removeLot(l)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-600 transition-colors" title="Supprimer"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canCreate && (
          <div className="p-3 bg-slate-50 dark:bg-[#15231c] rounded-xl border border-slate-200 dark:border-[#24382e] space-y-3">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-[#0270B8] dark:text-sky-400" />
              <span>Nouveau lot</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <input type="text" value={numeroLot} onChange={(e) => setNumeroLot(e.target.value)} placeholder="N° lot *"
                className="form-control-lte text-xs" />
              <input type="text" value={numeroSerie} onChange={(e) => setNumeroSerie(e.target.value)} placeholder="N° série (optionnel)"
                className="form-control-lte text-xs font-mono" />
              <input type="date" value={datePeremption} onChange={(e) => setDatePeremption(e.target.value)}
                className="form-control-lte text-xs" />
              <input type="number" value={quantite} onChange={(e) => setQuantite(e.target.value)} min="0" placeholder="Quantité"
                className="form-control-lte text-xs font-mono font-bold" />
              <input type="number" step="0.01" value={prix} onChange={(e) => setPrix(e.target.value)} min="0" placeholder="Prix unitaire"
                className="form-control-lte text-xs font-mono" />
              <button onClick={save} disabled={saving} className="btn-lte btn-lte-sm btn-lte-primary flex items-center justify-center gap-1.5">
                {saving ? 'Ajout...' : 'Ajouter le lot'}
              </button>
            </div>
          </div>
        )}

        <div className="modal-footer-lte">
          <button
            type="button"
            onClick={onClose}
            className="btn-lte btn-lte-sm btn-lte-outline-secondary"
          >
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
}
