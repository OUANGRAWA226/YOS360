// Pilotage de l'écran de chargement défini dans index.html (affiché avant même le chargement de React).

declare global {
  interface Window {
    YOS360Splash?: {
      setProgress: (progress: number, message?: string) => void;
      done: () => void;
    };
  }
}

/** Fait avancer la barre (0 à 1) ; sans message, le texte suit les étapes prévues. */
export function splashProgress(progress: number, message?: string) {
  window.YOS360Splash?.setProgress(progress, message);
}

/** L'application est prête : le cube s'ouvre et révèle l'écran. Sans effet si déjà fermé. */
export function hideSplash() {
  window.YOS360Splash?.done();
}
