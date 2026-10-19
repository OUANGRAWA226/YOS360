import { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Package,
  Tags,
  ArrowLeftRight,
  Boxes,
  Truck,
  Users,
  ShoppingCart,
  BarChart3,
  ShieldCheck,
  Settings,
  Warehouse,
  Repeat,
  ClipboardCheck,
  ScanLine,
  PackagePlus,
  HandCoins,
  Store,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Database,
  Download,
  Upload,
  Sliders,
  Building2,
  Layers,
  KeyRound,
} from 'lucide-react';
import type { Page } from '@/App';
import type { Role } from '@/lib/supabase';
import { can, type Module } from '@/lib/permissions';
import { usePrefs } from '@/lib/prefs';
import { useAuth } from '@/lib/auth';

const sectionKeys: Record<string, string> = {
  "Vue d'ensemble": 'nav.overview',
  Inventaire: 'nav.inventory',
  'Multi-sites': 'nav.multisite',
  Opérations: 'nav.operations',
  Partenaires: 'nav.partners',
  Commandes: 'nav.orders',
  Finance: 'nav.finance',
  Administration: 'nav.admin',
};

const labelKeys: Record<string, string> = {
  'Tableau de bord': 'nav.dashboard',
  Rapports: 'nav.reports',
  Produits: 'nav.products',
  Catégories: 'nav.categories',
  Mouvements: 'nav.movements',
  'Entrepôts & boutiques': 'nav.warehouses',
  Transferts: 'nav.transfers',
  Inventaires: 'nav.stocktakes',
  'Scan & étiquettes': 'nav.scan',
  Réapprovisionnement: 'nav.restock',
  Fournisseurs: 'nav.suppliers',
  Clients: 'nav.customers',
  Commandes: 'nav.orders',
  'Paiements & créances': 'nav.payments',
  'Caisse (POS)': 'nav.pos',
  "Journal d'audit": 'nav.audit',
  Paramètres: 'nav.settings',
};

export type NavSubItem = {
  id: string;
  label: string;
  icon?: any;
  badge?: { text: string; color: string };
  adminOnly?: boolean;
  subChildren?: { id: string; label: string; icon?: any }[];
};

export type NavItem = {
  id: Page;
  label: string;
  icon: typeof LayoutDashboard;
  module: Module;
  badge?: { text: string; color: string };
  children?: NavSubItem[];
};

type NavSection = { title: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    title: "Vue d'ensemble",
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, module: 'dashboard', badge: { text: '360°', color: 'bg-sky-600 text-white' } },
      { id: 'rapports', label: 'Rapports', icon: BarChart3, module: 'rapports' },
    ],
  },
  {
    title: 'Inventaire',
    items: [
      { id: 'produits', label: 'Produits', icon: Package, module: 'produits' },
      { id: 'categories', label: 'Catégories', icon: Tags, module: 'categories' },
      { id: 'mouvements', label: 'Mouvements', icon: ArrowLeftRight, module: 'mouvements' },
    ],
  },
  {
    title: 'Multi-sites',
    items: [
      { id: 'entrepots', label: 'Entrepôts & boutiques', icon: Warehouse, module: 'entrepots' },
      { id: 'transferts', label: 'Transferts', icon: Repeat, module: 'transferts' },
      { id: 'inventaires', label: 'Inventaires', icon: ClipboardCheck, module: 'inventaires' },
    ],
  },
  {
    title: 'Opérations',
    items: [
      { id: 'scan', label: 'Scan & étiquettes', icon: ScanLine, module: 'scan', badge: { text: 'SCAN', color: 'bg-amber-600 text-white' } },
      { id: 'reappro', label: 'Réapprovisionnement', icon: PackagePlus, module: 'reappro', badge: { text: 'AUTO', color: 'bg-sky-500 text-white' } },
    ],
  },
  {
    title: 'Partenaires',
    items: [
      { id: 'fournisseurs', label: 'Fournisseurs', icon: Truck, module: 'fournisseurs' },
      { id: 'clients', label: 'Clients', icon: Users, module: 'clients' },
    ],
  },
  {
    title: 'Commandes',
    items: [
      { id: 'commandes', label: 'Commandes', icon: ShoppingCart, module: 'commandes', badge: { text: 'VENTE', color: 'bg-blue-600 text-white' } },
    ],
  },
  {
    title: 'Finance',
    items: [
      { id: 'paiements', label: 'Paiements & créances', icon: HandCoins, module: 'paiements' },
      { id: 'caisse', label: 'Caisse (POS)', icon: Store, module: 'caisse', badge: { text: 'POS', color: 'bg-emerald-600 text-white' } },
    ],
  },
  {
    title: 'Administration',
    items: [
      { id: 'audit', label: "Journal d'audit", icon: ShieldCheck, module: 'audit', badge: { text: 'LOG', color: 'bg-violet-600 text-white' } },
      {
        id: 'parametres',
        label: 'Paramètres',
        icon: Settings,
        module: 'parametres',
        children: [
          {
            id: 'donnees',
            label: 'Données',
            icon: Database,
            subChildren: [
              { id: 'donnees-export', label: 'Exports de Données & Sauvegardes', icon: Download },
              { id: 'donnees-import', label: 'Import de Produits (CSV)', icon: Upload },
            ],
          },
          { id: 'preferences', label: 'Préférences', icon: Sliders },
          { id: 'entreprise', label: 'Entreprise', icon: Building2, adminOnly: true },
          { id: 'utilisateurs', label: 'Utilisateurs', icon: Users, adminOnly: true },
          { id: 'modules', label: 'Modules (Gouvernance)', icon: Layers, adminOnly: true, badge: { text: 'SAAS', color: 'bg-emerald-600 text-white' } },
          { id: 'integrations', label: 'API & Intégrations', icon: KeyRound, adminOnly: true },
        ],
      },
    ],
  },
];

type Props = {
  currentPage: Page;
  currentSubPage?: string;
  onNavigate: (page: Page, subTab?: string) => void;
  open: boolean;
  role: Role | null;
  modulesActifs: string[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

export function Sidebar({
  currentPage,
  currentSubPage,
  onNavigate,
  open,
  role,
  modulesActifs,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const { t } = usePrefs();
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTrees, setExpandedTrees] = useState<Record<string, boolean>>({
    parametres: true,
    donnees: true,
  });

  // Filtrage en direct de la sidebar (feature signature AdminLTE)
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return navSections;
    const q = searchQuery.toLowerCase();
    return navSections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((item) =>
          item.label.toLowerCase().includes(q) ||
          sec.title.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          item.children?.some((c) =>
            c.label.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q) ||
            c.subChildren?.some((sc) => sc.label.toLowerCase().includes(q))
          )
        ),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [searchQuery]);

  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-screen bg-[#111827] dark:bg-[#0b0f19] border-r border-slate-800/80 text-slate-200 flex flex-col transition-all duration-300 shadow-2xl ${
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      } ${collapsed ? 'w-20' : 'w-72'}`}
    >
      {/* 1. AdminLTE Brand Logo */}
      <div className="h-16 px-4 border-b border-slate-800/80 flex items-center justify-between bg-[#0f172a]/70 backdrop-blur">
        <div className={`flex items-center gap-3 overflow-hidden ${collapsed ? 'justify-center w-full' : ''}`}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 via-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 flex-shrink-0">
            <Boxes className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base font-extrabold tracking-tight text-white font-sans truncate">
                YOS360
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                v4.10
              </span>
            </div>
          )}
        </div>

        {!collapsed && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Réduire la barre latérale"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. AdminLTE User Profile Panel */}
      {!collapsed ? (
        <div className="px-4 py-3.5 border-b border-slate-800/60 bg-[#162032]/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50 flex items-center justify-center text-xs font-bold text-sky-400 shadow-sm flex-shrink-0">
              {(profile?.nom_complet || profile?.email || 'U').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate leading-tight">
                {profile?.nom_complet || profile?.email}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] text-slate-400 leading-none">
                  {profile?.super_admin ? 'Super Admin' : (role ? role.toUpperCase() : 'UTILISATEUR')}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-3 flex justify-center border-b border-slate-800/60">
          <div
            className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-sky-400"
            title={`${profile?.nom_complet || profile?.email} (${role})`}
          >
            {(profile?.nom_complet || profile?.email || 'U').slice(0, 2).toUpperCase()}
          </div>
        </div>
      )}

      {/* 3. AdminLTE Sidebar Live Search */}
      {!collapsed && (
        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher module..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#1f293d]/80 border border-slate-700/60 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                ×
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Hierarchical Navigation Menu */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
        {filteredSections.map((section) => {
          const items = section.items.filter(
            (item) => can(role, item.module, 'view') && modulesActifs.includes(item.module)
          );
          if (items.length === 0) return null;

          return (
            <div key={section.title}>
              {!collapsed && (
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 px-3">
                  {t(sectionKeys[section.title] || section.title)}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = currentPage === item.id;
                  const hasChildren = item.children && item.children.length > 0;
                  const isTreeOpen = expandedTrees[item.id] ?? (currentPage === item.id);

                  return (
                    <div key={item.id} className="space-y-0.5">
                      <div className="flex items-center">
                        <button
                          onClick={() => {
                            onNavigate(item.id);
                            if (hasChildren) {
                              setExpandedTrees((prev) => ({ ...prev, [item.id]: true }));
                            }
                          }}
                          title={collapsed ? t(labelKeys[item.label] || item.label) : undefined}
                          className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                            active
                              ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30 font-semibold'
                              : 'text-slate-300 hover:bg-[#1e293b] hover:text-white'
                          } ${collapsed ? 'justify-center px-0' : ''}`}
                        >
                          <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                          {!collapsed && (
                            <span className="truncate flex-1 text-left">
                              {t(labelKeys[item.label] || item.label)}
                            </span>
                          )}
                          {!collapsed && item.badge && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${item.badge.color}`}>
                              {item.badge.text}
                            </span>
                          )}
                        </button>

                        {!collapsed && hasChildren && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedTrees((prev) => ({ ...prev, [item.id]: !isTreeOpen }));
                            }}
                            className="p-1.5 ml-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e293b] transition-colors"
                            title={isTreeOpen ? 'Réduire' : 'Déplier'}
                          >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isTreeOpen ? '' : '-rotate-90'}`} />
                          </button>
                        )}
                      </div>

                      {/* AdminLTE v4 Treeview Sub-menu */}
                      {!collapsed && hasChildren && isTreeOpen && (
                        <div className="ml-4 pl-3 py-1 space-y-1 border-l-2 border-slate-700/60 my-1">
                          {item.children!.map((sub) => {
                            if (sub.adminOnly && role !== 'admin' && !profile?.super_admin) return null;
                            const SubIcon = sub.icon;
                            const isSubActive =
                              currentSubPage === sub.id ||
                              (sub.id === 'donnees' && (currentSubPage === 'donnees-export' || currentSubPage === 'donnees-import'));
                            const isSubTreeOpen = expandedTrees[sub.id] ?? true;

                            return (
                              <div key={sub.id} className="space-y-0.5">
                                <div className="flex items-center">
                                  <button
                                    onClick={() => onNavigate(item.id, sub.id)}
                                    className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                      isSubActive && !sub.subChildren
                                        ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30'
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                                    }`}
                                  >
                                    {SubIcon ? (
                                      <SubIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isSubActive ? 'text-sky-400' : 'text-slate-400'}`} />
                                    ) : (
                                      <span className={`w-1.5 h-1.5 rounded-full ${isSubActive ? 'bg-sky-400' : 'bg-slate-500'}`} />
                                    )}
                                    <span className="truncate flex-1 text-left">{sub.label}</span>
                                    {sub.badge && (
                                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${sub.badge.color}`}>
                                        {sub.badge.text}
                                      </span>
                                    )}
                                  </button>
                                  {sub.subChildren && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedTrees((prev) => ({ ...prev, [sub.id]: !isSubTreeOpen }));
                                      }}
                                      className="p-1 text-slate-400 hover:text-white"
                                      title={isSubTreeOpen ? 'Réduire' : 'Déplier'}
                                    >
                                      <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isSubTreeOpen ? '' : '-rotate-90'}`} />
                                    </button>
                                  )}
                                </div>

                                {/* Sous-enfants Données (Exports & Sauvegardes, Import CSV) */}
                                {sub.subChildren && isSubTreeOpen && (
                                  <div className="ml-3 pl-2.5 py-0.5 space-y-0.5 border-l border-slate-700/40">
                                    {sub.subChildren.map((sc) => {
                                      const ScIcon = sc.icon;
                                      const isScActive = currentSubPage === sc.id;
                                      return (
                                        <button
                                          key={sc.id}
                                          onClick={() => onNavigate(item.id, sc.id)}
                                          className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] transition-all ${
                                            isScActive
                                              ? 'bg-sky-500/25 text-sky-200 font-bold border border-sky-500/20'
                                              : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                                          }`}
                                        >
                                          {ScIcon ? (
                                            <ScIcon className={`w-3 h-3 flex-shrink-0 ${isScActive ? 'text-sky-400' : 'text-slate-500'}`} />
                                          ) : (
                                            <span className={`w-1 h-1 rounded-full ${isScActive ? 'bg-sky-400' : 'bg-slate-600'}`} />
                                          )}
                                          <span className="truncate text-left">{sc.label}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* 5. Sidebar Bottom Footer */}
      <div className="px-4 py-3 border-t border-slate-800/80 bg-[#0f172a]/50 text-center">
        {collapsed ? (
          onToggleCollapse ? (
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded text-slate-400 hover:text-white"
              title="Agrandir la barre latérale"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : null
        ) : (
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>AdminLTE v4</span>
            </span>
            <span className="text-[10px] text-slate-400">YOS360 © 2026</span>
          </div>
        )}
      </div>
    </aside>
  );
}
