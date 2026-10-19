export type Lang = 'fr' | 'en';

type Dict = Record<string, { fr: string; en: string }>;

const dict: Dict = {
  // Sidebar
  'nav.overview': { fr: "Vue d'ensemble", en: 'Overview' },
  'nav.dashboard': { fr: 'Tableau de bord', en: 'Dashboard' },
  'nav.reports': { fr: 'Rapports', en: 'Reports' },
  'nav.inventory': { fr: 'Inventaire', en: 'Inventory' },
  'nav.products': { fr: 'Produits', en: 'Products' },
  'nav.categories': { fr: 'Catégories', en: 'Categories' },
  'nav.movements': { fr: 'Mouvements', en: 'Movements' },
  'nav.multisite': { fr: 'Multi-sites', en: 'Multi-site' },
  'nav.warehouses': { fr: 'Entrepôts & boutiques', en: 'Warehouses & shops' },
  'nav.transfers': { fr: 'Transferts', en: 'Transfers' },
  'nav.stocktakes': { fr: 'Inventaires', en: 'Stock takes' },
  'nav.operations': { fr: 'Opérations', en: 'Operations' },
  'nav.scan': { fr: 'Scan & étiquettes', en: 'Scan & labels' },
  'nav.restock': { fr: 'Réapprovisionnement', en: 'Restocking' },
  'nav.partners': { fr: 'Partenaires', en: 'Partners' },
  'nav.suppliers': { fr: 'Fournisseurs', en: 'Suppliers' },
  'nav.customers': { fr: 'Clients', en: 'Customers' },
  'nav.orders': { fr: 'Commandes', en: 'Orders' },
  'nav.finance': { fr: 'Finance', en: 'Finance' },
  'nav.payments': { fr: 'Paiements & créances', en: 'Payments & receivables' },
  'nav.pos': { fr: 'Caisse (POS)', en: 'Counter (POS)' },
  'nav.admin': { fr: 'Administration', en: 'Administration' },
  'nav.audit': { fr: "Journal d'audit", en: 'Audit log' },
  'nav.settings': { fr: 'Paramètres', en: 'Settings' },
  'nav.systemOk': { fr: 'Système opérationnel', en: 'System operational' },

  // Common
  'common.search': { fr: 'Rechercher…', en: 'Search…' },
  'common.add': { fr: 'Ajouter', en: 'Add' },
  'common.save': { fr: 'Enregistrer', en: 'Save' },
  'common.cancel': { fr: 'Annuler', en: 'Cancel' },
  'common.delete': { fr: 'Supprimer', en: 'Delete' },
  'common.edit': { fr: 'Modifier', en: 'Edit' },
  'common.close': { fr: 'Fermer', en: 'Close' },
  'common.actions': { fr: 'Actions', en: 'Actions' },
  'common.loading': { fr: 'Chargement…', en: 'Loading…' },
  'common.all': { fr: 'Tous', en: 'All' },
  'common.total': { fr: 'Total', en: 'Total' },
  'common.quantity': { fr: 'Quantité', en: 'Quantity' },
  'common.date': { fr: 'Date', en: 'Date' },
  'common.status': { fr: 'Statut', en: 'Status' },
  'common.print': { fr: 'Imprimer', en: 'Print' },
  'common.export': { fr: 'Exporter', en: 'Export' },
  'common.none': { fr: 'Aucun', en: 'None' },

  // Notifications
  'notif.title': { fr: 'Notifications', en: 'Notifications' },
  'notif.empty': { fr: 'Aucune notification — tout va bien', en: 'No notifications — all clear' },
  'notif.lowStock': { fr: 'Stock bas', en: 'Low stock' },
  'notif.outOfStock': { fr: 'Rupture de stock', en: 'Out of stock' },
  'notif.expiry': { fr: 'Péremption proche', en: 'Expiry approaching' },
  'notif.expired': { fr: 'Lot expiré', en: 'Expired lot' },
  'notif.orderReceived': { fr: 'Commande reçue', en: 'Order received' },
  'notif.viewProduct': { fr: 'Voir le produit', en: 'View product' },
  'notif.markRead': { fr: 'Tout marquer comme lu', en: 'Mark all as read' },
  'noti.days': { fr: 'j restants', en: 'days left' },

  // Reports
  'rep.title': { fr: 'Rapports & Analyses', en: 'Reports & Analytics' },
  'rep.subtitle': { fr: 'Analyse détaillée de votre activité', en: 'Detailed analysis of your activity' },
  'rep.filters': { fr: 'Filtres', en: 'Filters' },
  'rep.period': { fr: 'Période', en: 'Period' },
  'rep.period.7d': { fr: '7 derniers jours', en: 'Last 7 days' },
  'rep.period.30d': { fr: '30 derniers jours', en: 'Last 30 days' },
  'rep.period.3m': { fr: '3 derniers mois', en: 'Last 3 months' },
  'rep.period.7m': { fr: '7 derniers mois', en: 'Last 7 months' },
  'rep.period.12m': { fr: '12 derniers mois', en: 'Last 12 months' },
  'rep.period.all': { fr: 'Tout', en: 'All time' },
  'rep.category': { fr: 'Catégorie', en: 'Category' },
  'rep.site': { fr: 'Site (entrepôt/boutique)', en: 'Site (warehouse/shop)' },
  'rep.stockValuePurchase': { fr: 'Valeur stock (achat)', en: 'Stock value (cost)' },
  'rep.stockValueSale': { fr: 'Valeur stock (vente)', en: 'Stock value (retail)' },
  'rep.potentialMargin': { fr: 'Marge potentielle', en: 'Potential margin' },
  'rep.totalSales': { fr: 'Total ventes', en: 'Total sales' },
  'rep.movementsTrend': { fr: 'Évolution des mouvements', en: 'Movement trends' },
  'rep.byCategory': { fr: 'Répartition par catégorie', en: 'Breakdown by category' },
  'rep.topValue': { fr: 'Top 5 produits par valeur de stock', en: 'Top 5 products by stock value' },
  'rep.topMoved': { fr: 'Top 5 produits les plus mouvementés', en: 'Top 5 most moved products' },
  'rep.alertsSummary': { fr: 'Synthèse des alertes', en: 'Alert summary' },
  'rep.lowStockCount': { fr: 'Stock faible', en: 'Low stock' },
  'rep.outOfStockCount': { fr: 'Rupture de stock', en: 'Out of stock' },
  'rep.pendingOrders': { fr: 'Commandes en attente', en: 'Pending orders' },
  'rep.expiryWatch': { fr: 'Péremptions à surveiller', en: 'Expiries to watch' },
  'rep.noExpiry': { fr: "Aucun lot proche de l'expiration.", en: 'No lot close to expiry.' },
  'rep.valuation': { fr: 'Valorisation & marge réelle', en: 'Valuation & real margin' },
  'rep.cmupValue': { fr: 'Valeur stock au CMUP', en: 'Stock value at WAC' },
  'rep.retailValue': { fr: 'Valeur au prix de vente', en: 'Value at retail price' },
  'rep.latentMargin': { fr: 'Marge latente (CMUP)', en: 'Latent margin (WAC)' },
  'rep.noMargin': { fr: 'Renseignez des entrées valorisées pour voir la marge réelle.', en: 'Record valued entries to see real margin.' },
  'rep.sales': { fr: 'Ventes', en: 'Sales' },
  'rep.purchases': { fr: 'Achats', en: 'Purchases' },
  'rep.exportReport': { fr: 'Exporter le rapport', en: 'Export report' },
  'rep.noCategory': { fr: 'Sans catégorie', en: 'Uncategorized' },
  'rep.expired': { fr: 'Expiré', en: 'Expired' },
  'rep.inDays': { fr: 'dans {n} j', en: 'in {n} d' },

  // Preferences (settings page additions)
  'pref.title': { fr: 'Préférences', en: 'Preferences' },
  'pref.language': { fr: 'Langue', en: 'Language' },
  'pref.theme': { fr: 'Thème', en: 'Theme' },
  'pref.light': { fr: 'Clair', en: 'Light' },
  'pref.dark': { fr: 'Sombre', en: 'Dark' },
  'pref.system': { fr: 'Système', en: 'System' },
  'pref.subtitle': { fr: 'Langue, thème et affichage', en: 'Language, theme and display' },
};

export function translate(key: string, lang: Lang, params?: Record<string, string | number>): string {
  const entry = dict[key];
  let out = entry ? entry[lang] : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(`{${k}}`, String(v));
    }
  }
  return out;
}

// Locale used for Intl formatting per language
export function localeFor(lang: Lang): string {
  return lang === 'en' ? 'en-GB' : 'fr-FR';
}
