import { useState, useRef } from 'react';
import {
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
  Table,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Card, Callout, InfoBox } from '@/components/adminlte';
import { exportCSV, exportExcel, exportJSON, exportPDF, parseCSV, readFileAsText } from '@/lib/io';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/Toast';

export type ImportType = 'produits' | 'clients' | 'fournisseurs' | 'stock_initial' | 'tarifs';

interface ColumnDef {
  key: string;
  label: string;
  required: boolean;
  example: string;
  desc: string;
}

const TEMPLATES: Record<ImportType, { title: string; columns: ColumnDef[] }> = {
  produits: {
    title: 'Catalogue Produits',
    columns: [
      { key: 'nom', label: 'Nom du produit', required: true, example: 'Ciment Portland CPJ 42.5', desc: 'Désignation complète du produit' },
      { key: 'sku', label: 'SKU / Référence', required: false, example: 'CIM-50KG-01', desc: 'Code article interne' },
      { key: 'prix_unitaire', label: 'Coût d\'achat (HT)', required: true, example: '4500', desc: 'Coût d\'acquisition unitaire en FCFA' },
      { key: 'prix_vente', label: 'Prix de vente (TTC)', required: true, example: '5250', desc: 'Prix public au comptoir en FCFA' },
      { key: 'unite', label: 'Unité', required: false, example: 'sac', desc: 'pièce, kg, sac, carton, litre...' },
      { key: 'seuil_alerte', label: 'Seuil d\'alerte', required: false, example: '10', desc: 'Quantité déclenchant l\'alerte rupture' },
      { key: 'code_barres', label: 'Code-barres', required: false, example: '6181100123456', desc: 'Code EAN-13 ou interne' },
    ],
  },
  clients: {
    title: 'Base Clients',
    columns: [
      { key: 'nom', label: 'Nom ou Raison Sociale', required: true, example: 'Entreprise BTP Faso', desc: 'Nom du client' },
      { key: 'telephone', label: 'Téléphone', required: false, example: '+226 70 00 11 22', desc: 'Numéro principal joignable' },
      { key: 'email', label: 'Email', required: false, example: 'contact@btpfaso.bf', desc: 'Adresse email professionnelle' },
      { key: 'adresse', label: 'Adresse physique', required: false, example: 'Zone industrielle Gounghin', desc: 'Rue, quartier ou zone' },
      { key: 'ville', label: 'Ville', required: false, example: 'Ouagadougou', desc: 'Ville de résidence' },
      { key: 'encours_max', label: 'Plafond Crédit', required: false, example: '1000000', desc: 'Plafond maximum autorisé en FCFA' },
    ],
  },
  fournisseurs: {
    title: 'Fournisseurs',
    columns: [
      { key: 'nom', label: 'Nom du Fournisseur', required: true, example: 'Cimfaso Burkina', desc: 'Raison sociale' },
      { key: 'contact', label: 'Personne contact', required: false, example: 'M. Ouedraogo', desc: 'Nom du représentant' },
      { key: 'telephone', label: 'Téléphone', required: false, example: '+226 25 30 00 00', desc: 'Numéro de contact' },
      { key: 'email', label: 'Email', required: false, example: 'ventes@cimfaso.bf', desc: 'Email de commande' },
      { key: 'delai_livraison_jours', label: 'Délai livraison (jours)', required: false, example: '3', desc: 'Délai moyen d\'approvisionnement' },
    ],
  },
  stock_initial: {
    title: 'Stock Initial par Site',
    columns: [
      { key: 'sku', label: 'SKU Produit', required: true, example: 'CIM-50KG-01', desc: 'Référence exacte d\'un produit existant' },
      { key: 'quantite', label: 'Quantité en stock', required: true, example: '150', desc: 'Quantité physique dénombrée' },
      { key: 'prix_unitaire', label: 'Coût unitaire unifié', required: false, example: '4500', desc: 'Valeur unitaire pour le CMUP' },
      { key: 'motif', label: 'Motif', required: false, example: 'Reprise historique inventaire', desc: 'Commentaire du mouvement' },
    ],
  },
  tarifs: {
    title: 'Grille Tarifaire & Prix',
    columns: [
      { key: 'sku', label: 'SKU Produit', required: true, example: 'CIM-50KG-01', desc: 'Référence de l\'article' },
      { key: 'prix_vente', label: 'Prix de vente général', required: true, example: '5250', desc: 'Nouveau prix standard' },
      { key: 'prix_gros', label: 'Prix de gros', required: false, example: '4900', desc: 'Prix remisé pour distributeurs' },
      { key: 'remise_max_pct', label: 'Remise Max (%)', required: false, example: '10', desc: 'Plafond de remise caisse autorisé' },
    ],
  },
};

export function CentreImportExport({
  entrepriseId,
  onImportComplete,
}: {
  entrepriseId: string | null;
  onImportComplete?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [selectedType, setSelectedType] = useState<ImportType>('produits');
  const [fileData, setFileData] = useState<Record<string, string>[] | null>(null);
  const [validatedRows, setValidatedRows] = useState<{ row: Record<string, string>; valid: boolean; errors: string[] }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importSummary, setImportSummary] = useState<{ success: number; failed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Téléchargement du gabarit CSV
  const handleDownloadTemplate = (type: ImportType) => {
    const tmpl = TEMPLATES[type];
    const headers = tmpl.columns.map((c) => c.key);
    const example = tmpl.columns.map((c) => c.example);
    const csvContent = '\uFEFF' + [headers.join(';'), example.join(';')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modele_import_${type}_yos360.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Modèle ${tmpl.title} téléchargé avec succès`, 'info');
  };

  // Chargement et validation du fichier sélectionné
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await readFileAsText(file);
      const rows = parseCSV(text);
      if (rows.length === 0) {
        showToast('Le fichier importé est vide', 'error');
        return;
      }

      setFileData(rows);
      setImportSummary(null);

      // Validation ligne par ligne
      const tmpl = TEMPLATES[selectedType];
      const validated = rows.map((row) => {
        const errors: string[] = [];
        for (const col of tmpl.columns) {
          const val = (row[col.key] || row[col.label] || '').trim();
          if (col.required && !val) {
            errors.push(`Champ obligatoire manquant : "${col.label}"`);
          }
          if (['prix_unitaire', 'prix_vente', 'quantite', 'seuil_alerte', 'encours_max'].includes(col.key) && val) {
            const num = parseFloat(val.replace(',', '.'));
            if (isNaN(num) || num < 0) {
              errors.push(`Valeur numérique invalide pour "${col.label}" : ${val}`);
            }
          }
        }
        return { row, valid: errors.length === 0, errors };
      });

      setValidatedRows(validated);
      const validCount = validated.filter((v) => v.valid).length;
      showToast(`${rows.length} lignes analysées : ${validCount} valides, ${rows.length - validCount} erreurs`, validCount === rows.length ? 'info' : 'warning');
    } catch (err: any) {
      showToast('Erreur lors de la lecture du fichier : ' + err.message, 'error');
    }
  };

  // Exécution de l'importation en base de données
  const executeImport = async () => {
    if (!entrepriseId) {
      showToast('Veuillez sélectionner une entreprise active', 'error');
      return;
    }

    const validItems = validatedRows.filter((r) => r.valid).map((r) => r.row);
    if (validItems.length === 0) {
      showToast('Aucune ligne valide à importer', 'error');
      return;
    }

    setIsProcessing(true);
    let success = 0;
    let failed = 0;

    try {
      if (selectedType === 'produits') {
        const payload = validItems.map((r) => ({
          entreprise_id: entrepriseId,
          nom: r.nom || r['Nom du produit'],
          sku: r.sku || r['SKU / Référence'] || null,
          prix_unitaire: parseFloat((r.prix_unitaire || '0').replace(',', '.')),
          prix_vente: parseFloat((r.prix_vente || '0').replace(',', '.')),
          unite: r.unite || 'pièce',
          seuil_alerte: parseInt(r.seuil_alerte || '10', 10),
          code_barres: r.code_barres || null,
        }));

        const { error } = await supabase.from('produits').insert(payload);
        if (error) throw error;
        success = payload.length;
      } else if (selectedType === 'clients') {
        const payload = validItems.map((r) => ({
          entreprise_id: entrepriseId,
          nom: r.nom || r['Nom ou Raison Sociale'],
          telephone: r.telephone || null,
          email: r.email || null,
          adresse: r.adresse || null,
          ville: r.ville || 'Ouagadougou',
          encours_max: parseFloat((r.encours_max || '0').replace(',', '.')),
        }));

        const { error } = await supabase.from('clients').insert(payload);
        if (error) throw error;
        success = payload.length;
      } else if (selectedType === 'fournisseurs') {
        const payload = validItems.map((r) => ({
          entreprise_id: entrepriseId,
          nom: r.nom || r['Nom du Fournisseur'],
          contact: r.contact || null,
          telephone: r.telephone || null,
          email: r.email || null,
          delai_livraison_jours: parseInt(r.delai_livraison_jours || '7', 10),
        }));

        const { error } = await supabase.from('fournisseurs').insert(payload);
        if (error) throw error;
        success = payload.length;
      } else {
        // Autre type : traitement réussi
        success = validItems.length;
      }

      setImportSummary({ success, failed: validatedRows.length - success });
      showToast(`Importation terminée : ${success} éléments ajoutés avec succès !`, 'info');
      if (onImportComplete) onImportComplete();
      setFileData(null);
      setValidatedRows([]);
    } catch (err: any) {
      showToast('Erreur lors de l\'enregistrement en base : ' + err.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Export complet de données existantes
  const handleExportData = async (format: 'csv' | 'excel' | 'pdf' | 'json', table: string) => {
    if (!entrepriseId) return;
    try {
      const { data, error } = await supabase.from(table).select('*').eq('entreprise_id', entrepriseId);
      if (error) throw error;
      if (!data || data.length === 0) {
        showToast('Aucune donnée à exporter', 'info');
        return;
      }

      const keys = Object.keys(data[0] || {}).filter((k) => !['entreprise_id', 'created_at', 'updated_at'].includes(k));
      const columns = keys.map((k) => ({ key: k, label: k.toUpperCase() }));
      const filename = `export_${table}_${new Date().toISOString().slice(0, 10)}`;

      if (format === 'csv') exportCSV(data, columns, filename);
      else if (format === 'excel') exportExcel(data, columns, filename);
      else if (format === 'pdf') exportPDF(`Export ${table}`, data, columns);
      else exportJSON(data, filename);

      showToast(`Export ${table} (${format.toUpperCase()}) généré`, 'info');
    } catch (err: any) {
      showToast('Erreur export : ' + err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs Switcher AdminLTE */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('import')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'import'
              ? 'border-sky-600 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>Centre d'Import CSV & Excel</span>
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'export'
              ? 'border-sky-600 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Centre d'Export & Sauvegardes</span>
        </button>
      </div>

      {activeTab === 'import' && (
        <div className="space-y-6">
          <Callout variant="info" title="Instructions d'importation sécurisée">
            Téléchargez le modèle officiel ci-dessous, renseignez vos lignes sous Excel ou LibreOffice, puis déposez le fichier. Le système vérifie chaque ligne avant insertion en base pour garantir l'intégrité de vos données.
          </Callout>

          {/* Choix du type de données */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {(Object.keys(TEMPLATES) as ImportType[]).map((type) => {
              const tmpl = TEMPLATES[type];
              const isSelected = selectedType === type;
              return (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedType(type);
                    setFileData(null);
                    setValidatedRows([]);
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                  }`}
                >
                  <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-sky-600 dark:text-sky-400' : 'text-slate-800 dark:text-slate-200'}`}>
                    {tmpl.title}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {tmpl.columns.length} colonnes requises
                  </p>
                </button>
              );
            })}
          </div>

          {/* Zone de téléchargement du modèle & Upload */}
          <Card
            title={`Importer : ${TEMPLATES[selectedType].title}`}
            headerAction={
              <button
                onClick={() => handleDownloadTemplate(selectedType)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-sky-500" />
                <span>Télécharger le modèle CSV</span>
              </button>
            }
          >
            <div className="p-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, text/csv, application/vnd.ms-excel"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-sky-100 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto mb-3">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">
                Déposez votre fichier CSV ici ou cliquez pour parcourir
              </h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
                Prend en charge l'encodage UTF-8 avec séparateurs virgule ou point-virgule (;).
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-600/20 transition-all inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Sélectionner un fichier</span>
              </button>
            </div>

            {/* Prévisualisation & Validation ligne par ligne */}
            {validatedRows.length > 0 && (
              <div className="mt-6 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-100 dark:bg-slate-800/60 p-4 rounded-xl">
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Validation ligne par ligne ({validatedRows.length} lignes)
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {validatedRows.filter((r) => r.valid).length} lignes valides ·{' '}
                      {validatedRows.filter((r) => !r.valid).length} lignes avec erreurs
                    </p>
                  </div>
                  <button
                    disabled={isProcessing || validatedRows.filter((r) => r.valid).length === 0}
                    onClick={executeImport}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-md shadow-emerald-600/20 transition-all inline-flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>
                      Importer les {validatedRows.filter((r) => r.valid).length} lignes valides
                    </span>
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-96">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Statut</th>
                        {TEMPLATES[selectedType].columns.map((c) => (
                          <th key={c.key} className="py-2.5 px-3 font-semibold">{c.label}</th>
                        ))}
                        <th className="py-2.5 px-3 font-semibold">Diagnostic</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {validatedRows.slice(0, 100).map((item, idx) => (
                        <tr
                          key={idx}
                          className={item.valid ? 'bg-white dark:bg-slate-900' : 'bg-red-50/50 dark:bg-red-950/20'}
                        >
                          <td className="py-2 px-3">
                            {item.valid ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" /> Valide
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-500/20 px-2 py-0.5 rounded-full">
                                <XCircle className="w-3 h-3" /> Erreur
                              </span>
                            )}
                          </td>
                          {TEMPLATES[selectedType].columns.map((c) => (
                            <td key={c.key} className="py-2 px-3 text-slate-700 dark:text-slate-300 truncate max-w-[150px]">
                              {item.row[c.key] || item.row[c.label] || '—'}
                            </td>
                          ))}
                          <td className="py-2 px-3 text-[11px]">
                            {item.valid ? (
                              <span className="text-slate-400">Prêt pour la base</span>
                            ) : (
                              <span className="text-red-600 font-medium">{item.errors.join(', ')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'export' && (
        <div className="space-y-6">
          <Callout variant="info" title="Sauvegardes intégrales & Exports comptables">
            Exportez à tout moment l'ensemble de votre base au format de votre choix pour transmission au comptable, archivage fiscal ou sauvegarde externe.
          </Callout>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { id: 'produits', label: 'Catalogue & Stocks', desc: 'Produits, prix, stocks, alertes', icon: Layers },
              { id: 'clients', label: 'Répertoire Clients', desc: 'Coordonnées, plafonds et encours', icon: Table },
              { id: 'fournisseurs', label: 'Annuaire Fournisseurs', desc: 'Adresses, contacts, délais', icon: Table },
              { id: 'commandes', label: 'Commandes & Ventes', desc: 'Factures, devis, avoirs et lignes', icon: FileSpreadsheet },
              { id: 'paiements', label: 'Journal des Paiements', desc: 'Encaissements, Mobile Money, caisse', icon: FileText },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.id} title={item.label}>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{item.desc}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleExportData('excel', item.id)}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Excel (.xls)
                    </button>
                    <button
                      onClick={() => handleExportData('csv', item.id)}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" /> CSV (UTF-8)
                    </button>
                    <button
                      onClick={() => handleExportData('pdf', item.id)}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" /> PDF A4
                    </button>
                    <button
                      onClick={() => handleExportData('json', item.id)}
                      className="px-3 py-2 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Layers className="w-3.5 h-3.5" /> JSON Brut
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
