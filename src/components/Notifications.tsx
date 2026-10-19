import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, PackageX, AlertTriangle, CalendarClock, PackageCheck } from 'lucide-react';
import type { ProduitWithCategorie, LotWithProduit, CommandeWithRelations } from '@/lib/supabase';
import { daysUntil } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';

type Notif = {
  id: string;
  kind: 'low' | 'out' | 'expiry' | 'order';
  title: string;
  detail: string;
  days?: number;
  productId?: string;
};

type Props = {
  produits: ProduitWithCategorie[];
  lots: LotWithProduit[];
  commandes: CommandeWithRelations[];
  onNavigate: (page: 'produits' | 'commandes') => void;
};

const KIND_STYLE: Record<Notif['kind'], { icon: typeof AlertTriangle; cls: string }> = {
  out: { icon: PackageX, cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' },
  low: { icon: AlertTriangle, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' },
  expiry: { icon: CalendarClock, cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' },
  order: { icon: PackageCheck, cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' },
};

export function Notifications({ produits, lots, commandes, onNavigate }: Props) {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('sm360_notif_read') || '[]') as string[];
    } catch {
      return [];
    }
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  const notifs = useMemo<Notif[]>(() => {
    const out: Notif[] = [];
    for (const p of produits) {
      if (p.quantite === 0) {
        out.push({ id: `out-${p.id}`, kind: 'out', title: p.nom, detail: t('notif.outOfStock'), productId: p.id });
      } else if (p.quantite <= p.seuil_alerte) {
        out.push({ id: `low-${p.id}`, kind: 'low', title: p.nom, detail: `${p.quantite} / seuil ${p.seuil_alerte}`, productId: p.id });
      }
    }
    for (const l of lots) {
      if (l.quantite > 0 && l.date_peremption) {
        const j = daysUntil(l.date_peremption);
        const seuil = l.produits?.alerte_peremption_jours ?? 30;
        if (j <= seuil) {
          out.push({
            id: `exp-${l.id}`,
            kind: 'expiry',
            title: l.produits?.nom || '—',
            detail: `Lot ${l.numero_lot} · ${l.quantite}`,
            days: j,
          });
        }
      }
    }
    for (const c of commandes) {
      if (c.type === 'achat' && c.statut === 'recue') {
        out.push({ id: `ord-${c.id}`, kind: 'order', title: c.numero_document || c.reference || '—', detail: c.fournisseurs?.nom || '' });
      }
    }
    return out;
  }, [produits, lots, commandes, t]);

  const unread = notifs.filter((n) => !readIds.includes(n.id)).length;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const markAllRead = () => {
    setReadIds(notifs.map((n) => n.id));
    localStorage.setItem('sm360_notif_read', JSON.stringify(notifs.map((n) => n.id)));
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
        title={t('notif.title')}
        aria-label={`${t('notif.title')}${unread > 0 ? ` (${unread})` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{t('notif.title')}</p>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-sky-600 dark:text-sky-400 hover:underline">
                {t('notif.markRead')}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {notifs.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">{t('notif.empty')}</p>
            )}
            {notifs.map((n) => {
              const style = KIND_STYLE[n.kind];
              const Icon = style.icon;
              const isUnread = !readIds.includes(n.id);
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    onNavigate(n.kind === 'order' ? 'commandes' : 'produits');
                    setOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${isUnread ? '' : 'opacity-60'}`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${style.cls}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{n.title}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                      {n.kind === 'expiry'
                        ? `${n.detail} · ${n.days !== undefined && n.days < 0 ? t('rep.expired') : t('rep.inDays', { n: n.days ?? 0 })}`
                        : n.detail}
                    </span>
                  </span>
                  <span className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${isUnread ? 'bg-sky-500' : 'bg-transparent'}`} />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
