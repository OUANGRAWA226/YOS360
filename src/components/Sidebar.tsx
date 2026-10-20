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
  FileText,
  RotateCcw,
  Receipt,
  UserCheck,
  Award,
  Target,
  Wallet,
  Landmark,
  Smartphone,
  ShieldAlert,
  Percent,
  CheckSquare,
  Scale,
  ClipboardList,
  PackageCheck,
} from 'lucide-react';
import type { Page } from '@/App';
import type { Role } from '@/lib/supabase';
import { can, type Module } from '@/lib/permissions';
import { usePrefs } from '@/lib/prefs';
import { useAuth } from '@/lib/auth';
import { YosMark, YosWordmark } from '@/components/brand/YosLogo';

export type NavSubItem = {
  id: string;
  label: string;
  icon?: any;
  dynamicBadge?: number;
  adminOnly?: boolean;
};

export type NavItem = {
  id: Page;
  label: string;
  icon: any;
  module: Module;
  dynamicBadge?: number;
  subTab?: string;
  keywords?: string; // termes trouvés par la recherche sans être affichés
  children?: NavSubItem[];
};

type NavSection = { title: string; items: NavItem[] };

type Props = {
  currentPage: Page;
  currentSubPage?: string;
  onNavigate: (page: Page, subTab?: string) => void;
  open: boolean;
  role: Role | null;
  modulesActifs: string[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  // Compteurs dynamiques réels (aucun badge statique)
  dynamicCounts?: {
    stockAlerts?: number;
    pendingVentes?: number;
    pendingAchats?: number;
    impayes?: number;
    lotsAlert?: number;
    pendingValidations?: number;
  };
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
  dynamicCounts = {},
}: Props) {
  const { t } = usePrefs();
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTrees, setExpandedTrees] = useState<Record<string, boolean>>({
    ventes: false,
    achats: false,
    stock: false,
    finance: false,
    administration: false,
  });

  // Menu en 7 sections : chaque entrée en un clic, cycles de vente et d'achat dans l'ordre du métier,
  // clients et fournisseurs à côté de leurs documents
  const navSections: NavSection[] = useMemo(() => [
    {
      title: "Vue d'ensemble",
      items: [
        { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, module: 'dashboard' },
        { id: 'rapports', label: 'Rapports & analyses', icon: BarChart3, module: 'rapports' },
      ],
    },
    {
      title: 'Ventes',
      items: [
        { id: 'caisse', label: 'Caisse (POS)', icon: Store, module: 'caisse' },
        {
          id: 'commandes',
          label: 'Commandes & factures',
          icon: ShoppingCart,
          module: 'commandes',
          dynamicBadge: dynamicCounts.pendingVentes,
          keywords: 'devis commandes clients bons de livraison factures de vente avoirs retours',
        },
        { id: 'clients', label: 'Clients & fidélité', icon: Users, module: 'clients' },
        { id: 'tarifs', label: 'Tarifs & promotions', icon: Percent, module: 'commandes' },
      ],
    },
    {
      title: 'Achats',
      items: [
        { id: 'achats', subTab: 'demandes', label: "Demandes d'achat", icon: ClipboardList, module: 'commandes' },
        {
          id: 'achats',
          subTab: 'bc',
          label: 'Bons de commande',
          icon: FileText,
          module: 'commandes',
          dynamicBadge: dynamicCounts.pendingAchats,
        },
        { id: 'achats', subTab: 'receptions', label: 'Réceptions', icon: PackageCheck, module: 'commandes', keywords: 'cmup rapprochement' },
        { id: 'achats', subTab: 'retours', label: 'Retours fournisseurs', icon: RotateCcw, module: 'commandes' },
        { id: 'fournisseurs', label: 'Fournisseurs', icon: Truck, module: 'fournisseurs' },
        {
          id: 'reappro',
          label: 'Réapprovisionnement',
          icon: PackagePlus,
          module: 'reappro',
          dynamicBadge: dynamicCounts.stockAlerts,
        },
      ],
    },
    {
      title: 'Stock & sites',
      items: [
        {
          id: 'produits',
          label: 'Produits',
          icon: Package,
          module: 'produits',
          dynamicBadge: dynamicCounts.stockAlerts,
        },
        { id: 'categories', label: 'Catégories', icon: Tags, module: 'categories' },
        {
          id: 'lots',
          label: 'Lots & péremptions',
          icon: Boxes,
          module: 'lots',
          dynamicBadge: dynamicCounts.lotsAlert,
          keywords: 'dluo fefo',
        },
        { id: 'mouvements', label: 'Mouvements & pertes', icon: ArrowLeftRight, module: 'mouvements' },
        { id: 'inventaires', label: 'Inventaires', icon: ClipboardCheck, module: 'inventaires', keywords: 'comptages' },
        { id: 'scan', label: 'Scan & étiquettes', icon: ScanLine, module: 'scan' },
        { id: 'entrepots', label: 'Entrepôts & boutiques', icon: Warehouse, module: 'entrepots', keywords: 'multi-sites' },
        { id: 'transferts', label: 'Transferts entre sites', icon: Repeat, module: 'transferts' },
      ],
    },
    {
      title: 'Finance',
      items: [
        {
          id: 'paiements',
          label: 'Encaissements & créances',
          icon: HandCoins,
          module: 'paiements',
          dynamicBadge: dynamicCounts.impayes,
        },
        { id: 'tresorerie', label: 'Trésorerie & dépenses', icon: Wallet, module: 'tresorerie' },
        { id: 'comptabilite', label: 'Comptabilité SYSCOHADA', icon: Scale, module: 'comptabilite' },
      ],
    },
    {
      title: 'Équipe & RH',
      items: [
        { id: 'equipe', label: 'Collaborateurs & commissions', icon: Award, module: 'equipe' },
      ],
    },
    {
      title: 'Administration',
      items: [
        {
          id: 'validations',
          label: 'Validations en attente',
          icon: CheckSquare,
          module: 'audit',
          dynamicBadge: dynamicCounts.pendingValidations,
        },
        { id: 'audit', label: "Journal d'audit", icon: ShieldCheck, module: 'audit' },
        { id: 'parametres', subTab: 'utilisateurs', label: 'Utilisateurs & rôles', icon: KeyRound, module: 'parametres', keywords: 'rbac' },
        { id: 'parametres', subTab: 'entreprise', label: 'Entreprise & abonnement', icon: Building2, module: 'parametres' },
        { id: 'parametres', subTab: 'modules', label: 'Modules activés', icon: Layers, module: 'parametres' },
        { id: 'parametres', subTab: 'donnees', label: 'Import / export', icon: Database, module: 'parametres' },
        { id: 'parametres', subTab: 'integrations', label: 'Intégrations (API)', icon: Sliders, module: 'parametres', keywords: 'webhooks' },
      ],
    },
  ], [dynamicCounts]);

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
          !!item.keywords?.includes(q) ||
          item.children?.some((c) => c.label.toLowerCase().includes(q))
        ),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [navSections, searchQuery]);

  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-screen bg-[#111827] dark:bg-[#0b0f19] border-r border-slate-800/80 text-slate-200 flex flex-col transition-all duration-300 shadow-2xl ${
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      } ${collapsed ? 'w-20' : 'w-72'}`}
    >
      {/* 1. AdminLTE Brand Logo */}
      <div className="relative h-16 px-4 border-b border-slate-800/80 flex items-center justify-between bg-[#0f172a]/70 backdrop-blur flex-shrink-0 overflow-hidden">
        {/* Halo vert discret derrière le cube */}
        <div aria-hidden="true" className={`absolute top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-[#48B068]/20 blur-2xl pointer-events-none ${collapsed ? 'left-1/2 -translate-x-1/2' : 'left-1'}`} />
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Agrandir la barre latérale"
            aria-label="Agrandir la barre latérale"
            className="relative mx-auto p-1.5 rounded-xl hover:bg-white/5 transition-colors"
          >
            <YosMark className="w-8 h-8 drop-shadow-[0_4px_10px_rgba(72,176,104,0.35)]" />
          </button>
        ) : (
          <div className="relative flex items-center gap-2.5 min-w-0">
            <YosMark className="w-8 h-8 flex-shrink-0 drop-shadow-[0_4px_10px_rgba(72,176,104,0.35)]" title="YOS360" />
            <div className="min-w-0 leading-none">
              <YosWordmark onDark className="block text-[21px]" />
              <span className="block mt-1 text-[9px] font-['Montserrat'] font-extrabold tracking-[0.22em] text-[#4FAEEB]/90">
                <span className="font-medium tracking-[0.06em] text-slate-500 mr-1">by</span>YOPOE
              </span>
            </div>
          </div>
        )}

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

      {/* 3. AdminLTE Sidebar Live Search */}
      {!collapsed && (
        <div className="px-4 pt-3 pb-1 flex-shrink-0">
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
          const items = section.items.filter((item) => {
            // Sécurité et modules activés
            return can(role, item.module, 'view');
          });
          if (items.length === 0) return null;

          return (
            <div key={section.title}>
              {!collapsed && (
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1.5 px-3">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  // Entrée liée à un onglet (achats, paramètres) : active seulement sur cet onglet
                  const active = currentPage === item.id && (!item.subTab || (currentSubPage ?? '').startsWith(item.subTab));
                  const hasChildren = item.children && item.children.length > 0;
                  const isTreeOpen = expandedTrees[item.id] ?? (currentPage === item.id);

                  return (
                    <div key={`${item.id}-${item.subTab ?? ''}`} className="space-y-0.5">
                      <div className="flex items-center">
                        <button
                          onClick={() => {
                            onNavigate(item.id, item.subTab);
                            if (hasChildren) {
                              setExpandedTrees((prev) => ({ ...prev, [item.id]: !isTreeOpen }));
                            }
                          }}
                          title={collapsed ? item.label : undefined}
                          className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                            active
                              ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30 font-semibold'
                              : 'text-slate-300 hover:bg-[#1e293b] hover:text-white'
                          } ${collapsed ? 'justify-center px-0' : ''}`}
                        >
                          <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                          {!collapsed && (
                            <span className="truncate flex-1 text-left">
                              {item.label}
                            </span>
                          )}

                          {/* Dynamic Count Badges (uniquement si count > 0) */}
                          {!collapsed && typeof item.dynamicBadge === 'number' && item.dynamicBadge > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              {item.dynamicBadge}
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

                      {/* Sub-menu treeview */}
                      {!collapsed && hasChildren && isTreeOpen && (
                        <div className="ml-4 pl-3 py-1 space-y-1 border-l-2 border-slate-700/60 my-1">
                          {item.children?.map((sub) => {
                            const isSubActive = active && currentSubPage === sub.id;
                            return (
                              <button
                                key={sub.id}
                                onClick={() => onNavigate(item.id, sub.id)}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors flex items-center justify-between ${
                                  isSubActive
                                    ? 'bg-sky-500/20 text-sky-400 font-semibold'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                                }`}
                              >
                                <span className="truncate">{sub.label}</span>
                                {typeof sub.dynamicBadge === 'number' && sub.dynamicBadge > 0 && (
                                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300">
                                    {sub.dynamicBadge}
                                  </span>
                                )}
                              </button>
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

      {/* 5. Espace Super Admin switch si super_admin = true */}
      {profile?.super_admin && (
        <div className="p-3 border-t border-slate-800/80 bg-[#0f172a]/90 flex-shrink-0">
          <button
            onClick={() => onNavigate('parametres', 'modules')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all justify-center"
          >
            <Sparkles className="w-4 h-4" />
            {!collapsed && <span>Cockpit Super Admin</span>}
          </button>
        </div>
      )}
    </aside>
  );
}
