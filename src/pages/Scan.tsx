import { useState, useEffect, useRef } from 'react';
import { ScanLine, Keyboard, Printer, Camera, CameraOff, PackageSearch, Tag, CheckCircle2 } from 'lucide-react';
import type { ProduitWithCategorie, Lot } from '@/lib/supabase';
import { Barcode39 } from '@/components/Barcode39';
import { showToast } from '@/components/Toast';
import { formatNumber, formatCurrency, daysUntil, peremptionLabel } from '@/lib/format';
import { can, type Role } from '@/lib/permissions';
import { Modal } from '@/components/Modal';
import { Card, Callout } from '@/components/adminlte';

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
      {/* Content Header (Page header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <ScanLine className="w-7 h-7 text-primary" />
            Scan & Codes-barres
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Reconnaissance instantanée par caméra ou douchette, entrées/sorties et étiquettes Code39
          </p>
        </div>

        {/* Mode selector: AdminLTE Button Group */}
        <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-xs">
          {(['consultation', 'entrée', 'sortie'] as ScanMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                if (m !== 'consultation' && !canCreate) {
                  showToast('Action non permise pour votre rôle', 'error');
                  return;
                }
                setMode(m);
              }}
              className={`px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                mode === m
                  ? m === 'entrée'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : m === 'sortie'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-primary text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Camera + Manual input row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card
          title="Détection Caméra"
          icon={Camera}
          variant="primary"
          outline
          tools={
            <button
              onClick={() => {
                setCameraError(null);
                setCameraOn(!cameraOn);
                setQuery('');
                setFound(null);
                lastScanned.current = '';
              }}
              className={`btn-lte btn-lte-sm ${
                cameraOn ? 'btn-lte-danger' : 'btn-lte-primary'
              }`}
            >
              {cameraOn ? (
                <>
                  <CameraOff className="w-3.5 h-3.5" /> Éteindre
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5" /> Démarrer la caméra
                </>
              )}
            </button>
          }
        >
          <div className="relative aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
            {cameraOn ? (
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                <ScanLine className="w-12 h-12 mb-2 stroke-[1.5]" />
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Flux vidéo inactif
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Cliquez sur « Démarrer la caméra » ci-dessus
                </p>
              </div>
            )}
            {cameraOn && (
              <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-0.5 bg-red-500/80 shadow-[0_0_8px_#ef4444] animate-pulse" />
            )}
          </div>
          {cameraError && (
            <Callout title="Attention" variant="warning" className="mt-3">
              {cameraError}
            </Callout>
          )}
        </Card>

        <Card
          title="Saisie Manuelle ou Douchette"
          icon={Keyboard}
          variant="info"
          outline
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Code-barres / SKU / Désignation
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLookup(query);
                  }}
                  placeholder="Scannez ou tapez ici puis Entrée..."
                  className="form-control-lte font-mono text-xs flex-1"
                  autoFocus
                />
                <button
                  onClick={() => handleLookup(query)}
                  className="btn-lte btn-lte-dark"
                >
                  Chercher
                </button>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                Compatible direct avec douchettes USB/Bluetooth (envoi automatique de la touche Entrée).
              </p>
            </div>

            {mode !== 'consultation' && found && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Quantité à imputer ({mode})
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="form-control-lte flex-1 font-bold"
                  />
                  <button
                    onClick={applyMovement}
                    className={`btn-lte ${
                      mode === 'entrée' ? 'btn-lte-success' : 'btn-lte-danger'
                    }`}
                  >
                    Valider le mouvement
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Result Card */}
      {found && (
        <Card
          title="Fiche du Produit Identifié"
          icon={PackageSearch}
          variant="success"
          outline
          tools={
            <button
              onClick={() => setLabelOpen(true)}
              className="btn-lte btn-lte-dark btn-lte-sm"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimer étiquette
            </button>
          }
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <span className="badge-adminlte bg-success-subtle text-success border border-success/20 mb-1.5">
                Produit vérifié
              </span>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{found.nom}</h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                SKU : {found.sku || '—'} · Code-barres : {found.code_barres || 'sans code-barres'}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <p>
                  Stock : <strong className="text-slate-900 dark:text-slate-100 font-bold">{formatNumber(found.quantite)} {found.unite}</strong>
                </p>
                <p>
                  Prix de vente : <strong className="text-slate-900 dark:text-slate-100">{formatCurrency(found.prix_vente)}</strong>
                </p>
                <p>
                  CMUP : <strong className="text-slate-900 dark:text-slate-100">{formatCurrency(Number(found.cmup))}</strong>
                </p>
              </div>
            </div>
          </div>

          {produitLots.length > 0 && (
            <div className="mt-4 border-t border-slate-200 dark:border-slate-800 pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Traçabilité Lots (priorité FEFO)
              </p>
              <div className="flex flex-wrap gap-2">
                {produitLots
                  .slice()
                  .sort((a, b) => (a.date_peremption || '9999').localeCompare(b.date_peremption || '9999'))
                  .map((l, idx) => {
                    const d = l.date_peremption ? daysUntil(l.date_peremption) : null;
                    const pl = d !== null ? peremptionLabel(d) : null;
                    return (
                      <div
                        key={l.id}
                        className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 text-xs"
                      >
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Lot {l.numero_lot}
                        </span>
                        <span className="text-slate-500"> ({l.quantite} dispo)</span>
                        {pl && (
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${pl.color}`}>
                            {pl.label}
                          </span>
                        )}
                        {idx === 0 && (
                          <span className="ml-1.5 text-[10px] text-primary font-bold">
                            · Prioritaire
                          </span>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Label modal */}
      {labelOpen && found && (
        <Modal open={true} onClose={() => setLabelOpen(false)} title={`Étiquette — ${found.nom}`} size="sm">
          <div className="space-y-4">
            <div className="flex flex-col items-center bg-white dark:bg-[#15231c] border border-slate-200 dark:border-[#24382e] rounded-xl p-6">
              <p className="font-semibold text-slate-900 dark:text-white text-center">{found.nom}</p>
              {found.sku && <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{found.sku}</p>}
              <div className="mt-3">
                <Barcode39 value={found.code_barres || found.sku || found.id.slice(0, 8).toUpperCase()} height={60} moduleWidth={2} />
              </div>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-2">{formatCurrency(found.prix_vente)}</p>
            </div>
            <div className="modal-footer-lte !border-t-0 !pt-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-lte btn-lte-primary w-full justify-center"
              >
                <Printer className="w-4 h-4 mr-1.5" /> Imprimer l'étiquette
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
