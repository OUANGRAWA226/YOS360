import { useEffect, useState } from 'react';
import { CloudOff, Cloud, RefreshCw, Loader2 } from 'lucide-react';
import { syncNow, queueCount, onSyncStatus } from '@/lib/offline';

export function OfflineBadge() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const update = () => queueCount().then(setPending);
    update();
    const unsub = onSyncStatus((s) => {
      setSyncing(s.syncing);
      setPending(s.pending);
    });
    const onUp = () => { setOnline(true); syncNow().then(update); };
    const onDown = () => setOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    const t = setInterval(update, 5000);
    return () => { unsub(); window.removeEventListener('online', onUp); window.removeEventListener('offline', onDown); clearInterval(t); };
  }, []);

  if (online && pending === 0 && !syncing) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full" title="Connecté — données synchronisées">
        <Cloud className="w-3.5 h-3.5" /> En ligne
      </div>
    );
  }

  if (!online) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full" title="Hors-ligne — les modifications sont enregistrées localement et seront synchronisées">
        <CloudOff className="w-3.5 h-3.5" /> Hors-ligne{pending > 0 ? ` (${pending} en attente)` : ''}
      </div>
    );
  }

  return (
    <button
      onClick={() => syncNow()}
      className="inline-flex items-center gap-1.5 text-xs text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full hover:bg-sky-100 transition-colors"
      title="Cliquez pour synchroniser maintenant"
    >
      {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
      Synchronisation{pending > 0 ? ` (${pending})` : ''}
    </button>
  );
}
