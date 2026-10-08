/** Lock after resume if backgrounded ≥ LOCK_AFTER_MS. */
export const LOCK_AFTER_MS = 5 * 60 * 1000;

export function watchResume(onLockNeeded: () => void): () => void {
  let leftAt: number | null = null;
  let disposed = false;
  let remove: (() => void) | null = null;

  void import("@capacitor/app").then(async ({ App }) => {
    const handle = await App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        leftAt = Date.now();
        return;
      }
      if (leftAt !== null && Date.now() - leftAt >= LOCK_AFTER_MS) onLockNeeded();
      leftAt = null;
    });
    if (disposed) void handle.remove();
    else remove = () => void handle.remove();
  });

  return () => {
    disposed = true;
    remove?.();
  };
}

export function hideSplash(): void {
  void import("@capacitor/splash-screen")
    .then(({ SplashScreen }) => SplashScreen.hide())
    .catch(() => {});
}
