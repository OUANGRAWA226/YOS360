import { useState, useEffect, useRef } from 'react';
import { ScanLine, Keyboard, Printer, Camera, CameraOff, PackageSearch } from 'lucide-react';
import type { ProduitWithCategorie, Lot } from '@/lib/supabase';
import { Barcode39 } from '@/components/Barcode39';
import { showToast } from '@/components/Toast';
import { formatNumber, daysUntil, peremptionLabel } from '@/lib/format';
import { can, type Role } from '@/lib/permissions';
import { Modal } from '@/components/Modal';

type Props = {
  produits: ProduitWithCategorie[];
  lots: Lot[];
  role: Role | null;
};

type ScanMode = 'entrée' | 'sortie' | 'consultation';

export function Scan({ produits, lots, role }: Props) {
  const canCreate = can(role, 'scan', 'create');
  const [mode, setMode] = useState<ScanMode>('consultation');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<ProduitWithCategorie | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanned = useRef('');
  const [quantity, setQuantity] = useState('1');
  const [labelOpen, setLabelOpen] = useState(false);

  // Recherche par code-barres / SKU / nom
  const lookup = (code: string): ProduitWithCategorie | null => {
    const c = code.trim().toLowerCase();
    if (!c) return null;
    return (
      produits.find((p) => (p.code_barres || '').toLowerCase() === c) ||
      produits.find((p) => (p.sku || '').toLowerCase() === c) ||
      produits.find((p) => p.nom.toLowerCase() === c) ||
      null
    );
  };

  const handleLookup = (code: string) => {
    const p = lookup(code);
    setFound(p);
    if (!p && code.trim()) showToast('Aucun produit ne correspond à ce code', 'error');
  };

  // Caméra : flux vidéo en direct (scan visuel; le décodage automatique utilise
  // BarcodeDetector quand disponible, sinon saisie manuelle du code).
  useEffect(() => {
    if (!cameraOn) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
        type DetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;
        const w = window as unknown as { BarcodeDetector?: DetectorCtor };
        if (typeof w.BarcodeDetector === 'function') {
          const detector = new w.BarcodeDetector({ formats: ['code_39', 'code_128', 'ean_13', 'ean_8', 'qr_code'] });
          const loop = () => {
            if (!cameraOn || !videoRef.current) return;
            detector
              .detect(videoRef.current)
              .then((codes) => {
                const value = codes[0]?.rawValue;
                if (value && value !== lastScanned.current) {
                  lastScanned.current = value;
                  setQuery(value);
                  handleLookup(value);
                }
              })
              .catch(() => undefined);
            requestAnimationFrame(() => setTimeout(loop, 300));
          };
          loop();
        } else {
          setCameraError('Le décodage automatique n\u2019est pas supporté par ce navigateur. Utilisez la saisie manuelle : le code apparaît dans la vue caméra.');
        }
      } catch {
        setCameraError('Impossible d\u2019accéder à la caméra. Vérifiez les autorisations du navigateur.');
        setCameraOn(false);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn]);

  const applyMovement = () => {
    if (!found) return;
    showToast(`Mode ${mode} : ${quantity} × ${found.nom}. Utilisez Mouvements pour valider le mouvement de stock (bientôt intégré ici).`, 'info');
  };

  const produitLots = found ? lots.filter((l) => l.produit_id === found.id) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Scan code-barres</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Scannez avec la caméra ou saisissez un code</p>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-3">
        {(['consultation', 'entrée', 'sortie'] as ScanMode[]).map((m) => (
          <button
            key={m}
            onClick={() => { if (m !== 'consultation' && !canCreate) { showToast('Action non permise pour votre rôle', 'error'); return; } setMode(m); }}
            className={`px-4 py-3 rounded-xl font-medium text-sm capitalize transition-all ${
              mode === m ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Camera + manual input */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Camera className="w-5 h-5 text-sky-600" /> Caméra</h3>
            <button
              onClick={() => { setCameraError(null); setCameraOn(!cameraOn); setQuery(''); setFound(null); lastScanned.current = ''; }}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                cameraOn ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-sky-600 text-white hover:bg-sky-700'
              }`}
            >
              {cameraOn ? <><CameraOff className="w-4 h-4" /> Arrêter</> : <><Camera className="w-4 h-4" /> Activer</>}
            </button>
          </div>
          <div className="relative aspect-video bg-slate-900 rounded-xl overflow-hidden">
            {cameraOn ? (
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                <ScanLine className="w-10 h-10 mb-2" />
                <p className="text-sm">Caméra désactivée</p>
              </div>
            )}
            {cameraOn && (
              <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-red-500/70 animate-pulse" />
            )}
          </div>
          {cameraError && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 mt-2">{cameraError}</p>}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4"><Keyboard className="w-5 h-5 text-slate-500" /> Saisie manuelle</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(query); }}
              placeholder="Code-barres, SKU, nom..."
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
              autoFocus
            />
            <button onClick={() => handleLookup(query)} className="px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 transition-colors">
              Chercher
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">Astuce : un douchette USB ou le clavier du téléphone saisit le code puis valide avec « Entrée ».</p>

          {mode !== 'consultation' && found && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantité ({mode})</label>
              <div className="flex gap-2">
                <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                <button onClick={applyMovement} className={`px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors ${mode === 'entrée' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  Valider
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Result card */}
      {found && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-1 flex items-center gap-1"><PackageSearch className="w-4 h-4" /> Produit identifié</p>
              <h3 className="text-lg font-bold text-slate-900">{found.nom}</h3>
              <p className="text-sm text-slate-500 font-mono">{found.sku || '—'} · {found.code_barres || 'sans code-barres'}</p>
              <p className="text-sm text-slate-600 mt-2">
                Stock : <span className="font-bold text-slate-900">{formatNumber(found.quantite)} {found.unite}</span>
                {' · '}Valeur unitaire : <span className="font-semibold">{found.prix_vente.toFixed(2)} €</span>
                {' · '}CMUP : <span className="font-semibold">{Number(found.cmup).toFixed(2)} €</span>
              </p>
            </div>
            <button onClick={() => setLabelOpen(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 transition-colors">
              <Printer className="w-4 h-4" /> Étiquette
            </button>
          </div>
          {produitLots.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-700 mb-2">Lots (ordre FEFO — premier expiré, premier sorti)</p>
              <div className="flex flex-wrap gap-2">
                {produitLots
                  .slice()
                  .sort((a, b) => (a.date_peremption || '9999').localeCompare(b.date_peremption || '9999'))
                  .map((l, idx) => {
                    const d = l.date_peremption ? daysUntil(l.date_peremption) : null;
                    const pl = d !== null ? peremptionLabel(d) : null;
                    return (
                      <span key={l.id} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border ${idx === 0 && l.date_peremption ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                        <span className="font-mono">{l.numero_lot}</span>
                        {l.date_peremption && pl && <span className={`px-1.5 py-0.5 rounded-full ${pl.cls}`}>{pl.label}</span>}
                        <span>· {l.quantite} en stock</span>
                        {idx === 0 && l.date_peremption && <span className="text-sky-600 font-semibold">→ à sortir en premier</span>}
                      </span>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Label modal */}
      {labelOpen && found && (
        <Modal open={true} onClose={() => setLabelOpen(false)} title={`Étiquette — ${found.nom}`} size="sm">
          <div className="space-y-4">
            <div className="flex flex-col items-center bg-white border border-slate-200 rounded-xl p-6">
              <p className="font-semibold text-slate-900 text-center">{found.nom}</p>
              {found.sku && <p className="text-xs text-slate-500 font-mono">{found.sku}</p>}
              <div className="mt-3">
                <Barcode39 value={found.code_barres || found.sku || found.id.slice(0, 8).toUpperCase()} height={60} moduleWidth={2} />
              </div>
              <p className="text-sm font-semibold text-slate-900 mt-2">{found.prix_vente.toFixed(2)} €</p>
            </div>
            <button
              onClick={() => window.print()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 transition-colors"
            >
              <Printer className="w-4 h-4" /> Imprimer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
