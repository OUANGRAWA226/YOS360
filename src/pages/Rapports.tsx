import { useMemo, useState } from 'react';
import { TrendingUp, Package, DollarSign, ShoppingCart, AlertTriangle, CalendarClock, Filter, Download, FileSpreadsheet, FileText, BarChart3 } from 'lucide-react';
import type { ProduitWithCategorie, MouvementWithProduit, CommandeWithRelations, Categorie, LotWithProduit, Entrepot, StockEntrepot } from '@/lib/supabase';
import { formatCurrency, formatNumber, daysUntil } from '@/lib/format';
import { exportCSV, exportExcel, exportPDF } from '@/lib/io';
import { usePrefs } from '@/lib/prefs';
import { BarChart, LineChart, DonutChart } from '@/components/Charts';
import { SmallBox, InfoBox, Card, Callout } from '@/components/adminlte';

type Props = {
  produits: ProduitWithCategorie[];
  mouvements: MouvementWithProduit[];
  commandes: CommandeWithRelations[];
  categories: Categorie[];
  lots: LotWithProduit[];
  entrepots: Entrepot[];
  stocksEntrepot: StockEntrepot[];
  loading: boolean;
};

type Periode = '7d' | '30d' | '3m' | '7m' | '12m' | 'all';

export function Rapports({ produits, mouvements, commandes, categories, lots, entrepots, stocksEntrepot, loading }: Props) {
  const { t, locale } = usePrefs();

  const fmtCur = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(v);
  const fmtNum = (v: number) => new Intl.NumberFormat(locale).format(v);
  const fmtMonth = (d: Date) =>
    new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(d);

  const [periode, setPeriode] = useState<Periode>('7m');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');

  // Produits filtrés par catégorie
  const produitsFiltres = useMemo(() => {
    if (catFilter === 'all') return produits;
    return produits.filter((p) => p.categorie_id === catFilter);
  }, [produits, catFilter]);

  // Quantité d'un produit sur le site sélectionné (ou globale)
  const qtyOf = useMemo(() => {
    const map: Record<string, number> = {};
    if (siteFilter === 'all') {
      for (const p of produitsFiltres) map[p.id] = p.quantite;
    } else {
      for (const s of stocksEntrepot) {
        if (s.entrepot_id === siteFilter) map[s.produit_id] = (map[s.produit_id] || 0) + s.quantite;
      }
    }
    return map;
  }, [produitsFiltres, stocksEntrepot, siteFilter]);

  // Bornes de période
  const periodeStart = useMemo(() => {
    if (periode === 'all') return null;
    const now = new Date();
    const days: Record<Periode, number> = { '7d': 7, '30d': 30, '3m': 90, '7m': 210, '12m': 365, all: 0 };
    return new Date(now.getTime() - days[periode] * 24 * 3600 * 1000);
  }, [periode]);

  const inPeriode = (dateStr: string) => {
    if (!periodeStart) return true;
    return new Date(dateStr) >= periodeStart;
  };

  const mvtsFiltres = useMemo(
    () => mouvements.filter((m) => inPeriode(m.created_at) && (siteFilter === 'all' || m.entrepot_id === siteFilter)),
    [mouvements, periodeStart, siteFilter]
  );

  const cmdsFiltres = useMemo(
    () => commandes.filter((c) => inPeriode(c.date_commande) && c.statut !== 'annulee'),
    [commandes, periodeStart]
  );

  const data = useMemo(() => {
    const valeurStockAchat = produitsFiltres.reduce((s, p) => s + p.prix_unitaire * (qtyOf[p.id] ?? 0), 0);
    const valeurStockVente = produitsFiltres.reduce((s, p) => s + p.prix_vente * (qtyOf[p.id] ?? 0), 0);
    const valeurCMUP = produitsFiltres.reduce((s, p) => s + Number(p.cmup || p.prix_unitaire) * (qtyOf[p.id] ?? 0), 0);
    const margePotentielle = valeurStockVente - valeurStockAchat;

    // Nombre de buckets selon la période
    const buckets: { label: string; start: Date; end: Date }[] = [];
    const now = new Date();
    if (periode === '7d' || periode === '30d') {
      const n = periode === '7d' ? 7 : 30;
      const step = periode === '7d' ? 1 : 5;
      for (let i = n - step; i >= 0; i -= step) {
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
        const start = new Date(end.getTime() - step * 24 * 3600 * 1000);
        const label = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(start);
        buckets.push({ label, start, end });
      }
    } else {
      const n = periode === '3m' ? 3 : periode === '7m' ? 7 : periode === '12m' ? 12 : 12;
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({ label: fmtMonth(d), start: new Date(d.getFullYear(), d.getMonth(), 1), end: new Date(d.getFullYear(), d.getMonth() + 1, 1) });
      }
    }
    const months = buckets.map((b) => ({
      label: b.label,
      value: mvtsFiltres.filter((m) => {
        const md = new Date(m.created_at);
        return md >= b.start && md < b.end;
      }).length,
    }));

    // Stock by category
    const stockByCat = categories.map((c) => {
      const count = produitsFiltres.filter((p) => p.categorie_id === c.id).length;
      return { label: c.nom, value: count, color: c.couleur };
    });
    const noCat = produitsFiltres.filter((p) => !p.categorie_id).length;
    if (noCat > 0) stockByCat.push({ label: t('rep.noCategory'), value: noCat, color: '#94a3b8' });
    const stockByCatFiltered = stockByCat.filter((s) => s.value > 0);

    // Top products by value (on le site sélectionné)
    const topProduits = [...produitsFiltres]
      .map((p) => ({ nom: p.nom, valeur: p.prix_unitaire * (qtyOf[p.id] ?? 0), quantite: qtyOf[p.id] ?? 0 }))
      .filter((p) => p.valeur > 0)
      .sort((a, b) => b.valeur - a.valeur)
      .slice(0, 5);
    const topBars = topProduits.map((p, i) => ({
      label: p.nom.length > 12 ? p.nom.slice(0, 10) + '…' : p.nom,
      value: Math.round(p.valeur),
      color: ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][i],
    }));

    // Commandes achat vs vente per bucket
    const cmdByMonth = buckets.map((b) => ({
      label: b.label,
      ventes: cmdsFiltres.filter((c) => c.type === 'vente' && new Date(c.date_commande) >= b.start && new Date(c.date_commande) < b.end).length,
      achats: cmdsFiltres.filter((c) => c.type === 'achat' && new Date(c.date_commande) >= b.start && new Date(c.date_commande) < b.end).length,
    }));

    const totalVentes = cmdsFiltres.filter((c) => c.type === 'vente').reduce((s, c) => s + c.montant_total, 0);
    const totalAchats = cmdsFiltres.filter((c) => c.type === 'achat').reduce((s, c) => s + c.montant_total, 0);

    // Most moved products (période + site)
    const movedCounts: Record<string, number> = {};
    mvtsFiltres.forEach((m) => {
      const name = m.produits?.nom;
      if (name) movedCounts[name] = (movedCounts[name] || 0) + m.quantite;
    });
    const topMoved = Object.entries(movedCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, qty]) => ({ label: name.length > 15 ? name.slice(0, 13) + '…' : name, value: qty }));

    return {
      valeurStockAchat, valeurStockVente, margePotentielle, valeurCMUP,
      months, stockByCat: stockByCatFiltered, topBars, cmdByMonth, totalVentes, totalAchats, topMoved,
    };
  }, [produitsFiltres, mvtsFiltres, cmdsFiltres, categories, qtyOf, periode, locale]);

  // Lots approchant ou dépassant la péremption (dans la catégorie filtrée)
  const lotsAlerte = useMemo(() => {
    const catIds = new Set(produitsFiltres.map((p) => p.id));
    return lots
      .filter((l) => l.quantite > 0 && l.date_peremption && catIds.has(l.produit_id))
      .map((l) => ({ lot: l, jours: daysUntil(l.date_peremption!) }))
      .filter(({ lot, jours }) => jours <= (lot.produits?.alerte_peremption_jours ?? 30))
      .sort((a, b) => a.jours - b.jours);
  }, [lots, produitsFiltres]);

  const margeReelle = useMemo(() => {
    return produitsFiltres
      .filter((p) => (qtyOf[p.id] ?? 0) > 0)
      .map((p) => ({
        nom: p.nom,
        marge: p.prix_vente - Number(p.cmup || p.prix_unitaire),
        taux: Number(p.cmup || p.prix_unitaire) > 0
          ? ((p.prix_vente - Number(p.cmup || p.prix_unitaire)) / Number(p.cmup || p.prix_unitaire)) * 100
          : 0,
      }))
      .sort((a, b) => b.taux - a.taux)
      .slice(0, 5);
  }, [produitsFiltres, qtyOf]);

  const exportRows = useMemo(() => {
    return produitsFiltres.map((p) => ({
      nom: p.nom,
      sku: p.sku ?? '',
      categorie: categories.find((c) => c.id === p.categorie_id)?.nom ?? '',
      quantite: qtyOf[p.id] ?? 0,
      prix_achat: p.prix_unitaire,
      prix_vente: p.prix_vente,
      cmup: Number(p.cmup || p.prix_unitaire),
      valeur_achat: p.prix_unitaire * (qtyOf[p.id] ?? 0),
      valeur_vente: p.prix_vente * (qtyOf[p.id] ?? 0),
    }));
  }, [produitsFiltres, categories, qtyOf]);

  const doExport = (fmt: 'csv' | 'excel' | 'pdf') => {
    const columns = [
      { key: 'nom', label: 'Nom' },
      { key: 'sku', label: 'SKU' },
      { key: 'categorie', label: 'Catégorie' },
      { key: 'quantite', label: 'Quantité' },
      { key: 'prix_achat', label: "Prix d'achat" },
      { key: 'prix_vente', label: 'Prix de vente' },
      { key: 'cmup', label: 'CMUP' },
      { key: 'valeur_achat', label: 'Valeur (achat)' },
      { key: 'valeur_vente', label: 'Valeur (vente)' },
    ];
    const name = `rapport-${periode}`;
    if (fmt === 'csv') exportCSV(exportRows, columns, name);
    else if (fmt === 'excel') exportExcel(exportRows, columns, name);
    else exportPDF(t('rep.title'), exportRows, columns);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />)}
        </div>
      </div>
    );
  }

  const kpis = [
    { label: t('rep.stockValuePurchase'), value: fmtCur(data.valeurStockAchat), icon: DollarSign, bg: 'bg-sky-50 dark:bg-sky-500/10', iconColor: 'text-sky-600 dark:text-sky-400' },
    { label: t('rep.stockValueSale'), value: fmtCur(data.valeurStockVente), icon: TrendingUp, bg: 'bg-emerald-50 dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400' },
    { label: t('rep.potentialMargin'), value: fmtCur(data.margePotentielle), icon: Package, bg: 'bg-violet-50 dark:bg-violet-500/10', iconColor: 'text-violet-600 dark:text-violet-400' },
    { label: t('rep.totalSales'), value: fmtCur(data.totalVentes), icon: ShoppingCart, bg: 'bg-amber-50 dark:bg-amber-500/10', iconColor: 'text-amber-600 dark:text-amber-400' },
  ];

  const periodOptions: { value: Periode; key: string }[] = [
    { value: '7d', key: 'rep.period.7d' },
    { value: '30d', key: 'rep.period.30d' },
    { value: '3m', key: 'rep.period.3m' },
    { value: '7m', key: 'rep.period.7m' },
    { value: '12m', key: 'rep.period.12m' },
    { value: 'all', key: 'rep.period.all' },
  ];

  return (
    <div className="space-y-6">
      {/* Content Header (Page header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-7 h-7 text-primary" />
            {t('rep.title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('rep.subtitle')}</p>
        </div>
      </div>

      {/* AdminLTE Small-Boxes Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SmallBox
          title={t('rep.stockValuePurchase')}
          value={fmtCur(data.valeurStockAchat)}
          icon={DollarSign}
          variant="info"
          footerText="Valorisation au coût d'achat"
        />
        <SmallBox
          title={t('rep.stockValueSale')}
          value={fmtCur(data.valeurStockVente)}
          icon={TrendingUp}
          variant="success"
          footerText="Prix de vente théorique"
        />
        <SmallBox
          title={t('rep.potentialMargin')}
          value={fmtCur(data.margePotentielle)}
          icon={Package}
          variant="warning"
          footerText="Marge brute prévisionnelle"
        />
        <SmallBox
          title={t('rep.totalSales')}
          value={fmtCur(data.totalVentes)}
          icon={ShoppingCart}
          variant="danger"
          footerText="Volume de ventes encaissé"
        />
      </div>

      {/* Filtres & Outils d'exportation */}
      <Card
        title={t('rep.filters')}
        icon={Filter}
        variant="primary"
        outline
        tools={
          <div className="flex items-center gap-1.5 no-print">
            <button
              onClick={() => doExport('csv')}
              className="btn-lte btn-lte-secondary btn-lte-sm"
              title="Exporter au format CSV"
            >
              <FileText className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={() => doExport('excel')}
              className="btn-lte btn-lte-success btn-lte-sm"
              title="Exporter au format Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </button>
            <button
              onClick={() => doExport('pdf')}
              className="btn-lte btn-lte-danger btn-lte-sm"
              title="Exporter au format PDF"
            >
              <FileText className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              {t('rep.period')}
            </label>
            <select
              value={periode}
              onChange={(e) => setPeriode(e.target.value as Periode)}
              className="form-control-lte"
            >
              {periodOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.key)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              {t('rep.category')}
            </label>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="form-control-lte"
            >
              <option value="all">{t('common.all')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              {t('rep.site')}
            </label>
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="form-control-lte"
            >
              <option value="all">{t('common.all')}</option>
              {entrepots.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Graphiques Principaux */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title={t('rep.movementsTrend')} variant="info" outline>
          <LineChart data={data.months} formatValue={fmtNum} color="#0ea5e9" height={220} />
        </Card>

        <Card title={t('rep.byCategory')} variant="success" outline>
          {data.stockByCat.length === 0 ? (
            <p className="text-sm text-slate-400 py-12 text-center">{t('common.none')}</p>
          ) : (
            <div className="py-2 flex justify-center">
              <DonutChart data={data.stockByCat} size={180} />
            </div>
          )}
        </Card>

        <Card title={t('rep.topValue')} variant="warning" outline>
          <BarChart data={data.topBars} formatValue={(v) => fmtCur(v)} height={220} />
        </Card>

        <Card title={t('rep.topMoved')} variant="danger" outline>
          <BarChart data={data.topMoved} formatValue={fmtNum} height={220} />
        </Card>
      </div>

      {/* Commandes achat vs vente */}
      <Card
        title={`${t('nav.orders')} : ${t('rep.purchases')} / ${t('rep.sales')}`}
        variant="primary"
        outline
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60">
            <div className="w-4 h-4 rounded bg-[#0ea5e9]" />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {t('rep.purchases')} :{' '}
              <strong className="text-slate-900 dark:text-slate-100">{fmtCur(data.totalAchats)}</strong>
            </span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
            <div className="w-4 h-4 rounded bg-[#10b981]" />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {t('rep.sales')} :{' '}
              <strong className="text-slate-900 dark:text-slate-100">{fmtCur(data.totalVentes)}</strong>
            </span>
          </div>
        </div>
        <div className="space-y-3">
          {data.cmdByMonth.map((m, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-20 text-xs font-semibold text-slate-500 dark:text-slate-400 text-right">
                {m.label}
              </div>
              <div className="flex-1 flex gap-2">
                <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden h-7 flex items-center border border-slate-200 dark:border-slate-700">
                  <div
                    className="bg-[#0ea5e9] h-full rounded-xs transition-all duration-700"
                    style={{ width: `${Math.min(m.achats * 20, 100)}%` }}
                  />
                  <span className="px-2 text-xs text-slate-800 dark:text-slate-200 font-bold">
                    {m.achats}
                  </span>
                </div>
                <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden h-7 flex items-center border border-slate-200 dark:border-slate-700">
                  <div
                    className="bg-[#10b981] h-full rounded-xs transition-all duration-700"
                    style={{ width: `${Math.min(m.ventes * 20, 100)}%` }}
                  />
                  <span className="px-2 text-xs text-slate-800 dark:text-slate-200 font-bold">
                    {m.ventes}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Alert summary & Expiry watch */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card
          title={t('rep.alertsSummary')}
          icon={AlertTriangle}
          variant="warning"
          outline
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                {t('rep.lowStockCount')}
              </p>
              <p className="text-2xl font-extrabold text-amber-900 dark:text-amber-200 mt-1">
                {produitsFiltres.filter((p) => (qtyOf[p.id] ?? 0) <= p.seuil_alerte && (qtyOf[p.id] ?? 0) > 0).length}
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 rounded-xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                {t('rep.outOfStockCount')}
              </p>
              <p className="text-2xl font-extrabold text-red-900 dark:text-red-200 mt-1">
                {produitsFiltres.filter((p) => (qtyOf[p.id] ?? 0) === 0).length}
              </p>
            </div>
            <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                {t('rep.pendingOrders')}
              </p>
              <p className="text-2xl font-extrabold text-sky-900 dark:text-sky-200 mt-1">
                {commandes.filter((c) => c.statut === 'en_attente').length}
              </p>
            </div>
          </div>
        </Card>

        <Card
          title={t('rep.expiryWatch')}
          icon={CalendarClock}
          variant="danger"
          outline
        >
          {lotsAlerte.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">{t('rep.noExpiry')}</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {lotsAlerte.slice(0, 8).map(({ lot, jours }) => (
                <div
                  key={lot.id}
                  className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/80 rounded-lg px-3.5 py-2 text-sm border border-slate-200 dark:border-slate-700"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {lot.produits?.nom || '—'}
                    </p>
                    <p className="text-xs text-slate-500 font-mono">
                      Lot {lot.numero_lot} · {lot.quantite}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                      jours < 0
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                        : jours <= 7
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {jours < 0 ? t('rep.expired') : t('rep.inDays', { n: jours })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Valorisation CMUP + marge réelle */}
      <Card title={t('rep.valuation')} variant="success" outline>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
              {t('rep.cmupValue')}
            </p>
            <p className="text-2xl font-extrabold text-sky-900 dark:text-sky-200 mt-1">
              {fmtCur(data.valeurCMUP)}
            </p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              {t('rep.retailValue')}
            </p>
            <p className="text-2xl font-extrabold text-emerald-900 dark:text-emerald-200 mt-1">
              {fmtCur(data.valeurStockVente)}
            </p>
          </div>
          <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/60 rounded-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400">
              {t('rep.latentMargin')}
            </p>
            <p className="text-2xl font-extrabold text-violet-900 dark:text-violet-200 mt-1">
              {fmtCur(data.valeurStockVente - data.valeurCMUP)}
            </p>
          </div>
        </div>
        <div className="space-y-2.5">
          {margeReelle.map((m) => (
            <div key={m.nom} className="flex items-center gap-3">
              <span className="w-40 sm:w-56 truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                {m.nom}
              </span>
              <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-md h-6 overflow-hidden border border-slate-200 dark:border-slate-700">
                <div
                  className="bg-[#10b981] h-full rounded-xs transition-all duration-700"
                  style={{ width: `${Math.min(Math.max(m.taux, 0), 100)}%` }}
                />
              </div>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 w-28 text-right">
                {fmtCur(m.marge)}{' '}
                <span className="text-xs text-slate-400 font-normal">({m.taux.toFixed(0)}%)</span>
              </span>
            </div>
          ))}
          {margeReelle.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4">{t('rep.noMargin')}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
