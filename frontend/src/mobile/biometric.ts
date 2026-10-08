/** Device biometrics (PIN remains the fallback). */
import { isMobileTest } from "./platform";

export type BioKind = "faceid" | "touchid" | "face" | "finger" | "none";

async function plugin() {
  return import("@aparajita/capacitor-biometric-auth");
}

let testSetup: Promise<void> | null = null;

function applyTestBiometry(m: Awaited<ReturnType<typeof plugin>>): Promise<void> {
  if (!isMobileTest()) return Promise.resolve();
  if (!testSetup) {
    let want: string | null = null;
    try {
      const q = new URLSearchParams(window.location.search).get("bio");
      if (q) sessionStorage.setItem("taxmate-mobile-test-bio", q);
      want = sessionStorage.getItem("taxmate-mobile-test-bio");
    } catch {
      /* ignore */
    }
    const type =
      want === "face" ? m.BiometryType.faceId
      : want === "finger" ? m.BiometryType.fingerprintAuthentication
      : m.BiometryType.none;
    testSetup = m.BiometricAuth.setBiometryType(type)
      .then(() => m.BiometricAuth.setBiometryIsEnrolled(type !== m.BiometryType.none));
  }
  return testSetup;
}

export async function biometryKind(): Promise<BioKind> {
  try {
    const m = await plugin();
    await applyTestBiometry(m);
    const r = await m.BiometricAuth.checkBiometry();
    if (!r.isAvailable) return "none";
    switch (r.biometryType) {
      case m.BiometryType.faceId: return "faceid";
      case m.BiometryType.touchId: return "touchid";
      case m.BiometryType.faceAuthentication: return "face";
      case m.BiometryType.none: return "none";
      default: return "finger";
    }
  } catch {
    return "none";
  }
}

export async function authenticate(opts: { reason: string; cancel: string; title: string }): Promise<boolean> {
  try {
    const m = await plugin();
    await applyTestBiometry(m);
    await m.BiometricAuth.authenticate({
      reason: opts.reason,
      cancelTitle: opts.cancel,
      allowDeviceCredential: false,
      iosFallbackTitle: "",
      androidTitle: opts.title,
      androidSubtitle: opts.reason,
      androidConfirmationRequired: false,
    });
    return true;
  } catch {
    return false;
  }
}
