/** Preferences + SecureStorage (dynamic import so web never loads plugins). */
const K = {
  workspace: "taxmate.workspace",
  deviceId: "taxmate.device_id",
  user: "taxmate.user",
  fullName: "taxmate.full_name",
  installed: "taxmate.installed",
  token: "token",
  pin: "pin",
  pinFails: "pin_fails",
  bio: "bio",
} as const;

function prefsMod() {
  return import("@capacitor/preferences");
}

type SecureMod = typeof import("@aparajita/capacitor-secure-storage");
let secureReady: Promise<SecureMod> | null = null;

function secureMod(): Promise<SecureMod> {
  if (!secureReady) {
    secureReady = import("@aparajita/capacitor-secure-storage").then(async (m) => {
      await m.SecureStorage.setKeyPrefix("taxmate_");
      try {
        await m.SecureStorage.setDefaultKeychainAccess(m.KeychainAccess.whenUnlockedThisDeviceOnly);
      } catch {
        /* android / web */
      }
      return m;
    });
  }
  return secureReady;
}

async function prefGet(key: string): Promise<string | null> {
  const { Preferences } = await prefsMod();
  return (await Preferences.get({ key })).value;
}

async function prefSet(key: string, value: string | null): Promise<void> {
  const { Preferences } = await prefsMod();
  if (value === null) await Preferences.remove({ key });
  else await Preferences.set({ key, value });
}

async function secGet(key: string): Promise<string | null> {
  try {
    const v = await (await secureMod()).SecureStorage.getItem(key);
    return v ?? null;
  } catch {
    return null;
  }
}

async function secSet(key: string, value: string | null): Promise<void> {
  const { SecureStorage } = await secureMod();
  if (value === null) await SecureStorage.removeItem(key);
  else await SecureStorage.setItem(key, value);
}

export const loadWorkspace = () => prefGet(K.workspace);
export const saveWorkspace = (url: string) => prefSet(K.workspace, url);

function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function deviceId(): Promise<string> {
  const have = await prefGet(K.deviceId);
  if (have) return have;
  const id = randomId();
  await prefSet(K.deviceId, id);
  return id;
}

export async function loadIdentity(): Promise<{ user: string | null; fullName: string | null }> {
  return { user: await prefGet(K.user), fullName: await prefGet(K.fullName) };
}

export async function saveIdentity(user: string, fullName: string | null): Promise<void> {
  await prefSet(K.user, user);
  await prefSet(K.fullName, fullName);
}

export type TokenRecord = { origin: string; token: string };

export async function loadTokenRecord(): Promise<TokenRecord | null> {
  const raw = await secGet(K.token);
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<TokenRecord>;
    if (typeof r.origin === "string" && typeof r.token === "string") return { origin: r.origin, token: r.token };
  } catch {
    /* legacy plain token */
  }
  return { origin: "", token: raw };
}

export const saveTokenRecord = (rec: TokenRecord) => secSet(K.token, JSON.stringify(rec));

/** Wipe Keychain leftovers after reinstall (iOS keeps Keychain across uninstall). */
export async function firstLaunchWipe(): Promise<TokenRecord | null | false> {
  if (await prefGet(K.installed)) return false;
  const leftover = await loadTokenRecord();
  try {
    await (await secureMod()).SecureStorage.clear();
  } catch {
    await clearSession();
  }
  await prefSet(K.installed, "1");
  return leftover;
}

export const loadPinRecord = () => secGet(K.pin);
export const savePinRecord = (json: string) => secSet(K.pin, json);

export async function loadPinFails(): Promise<number> {
  const v = Number(await secGet(K.pinFails));
  return Number.isFinite(v) ? v : 0;
}

export const savePinFails = (n: number) => secSet(K.pinFails, n ? String(n) : null);

export async function loadBioEnabled(): Promise<boolean> {
  return (await secGet(K.bio)) === "1";
}

export const saveBioEnabled = (on: boolean) => secSet(K.bio, on ? "1" : null);

/** Drop token/PIN/identity; keep workspace + device id. */
export async function clearSession(): Promise<void> {
  await Promise.all([
    secSet(K.token, null),
    secSet(K.pin, null),
    secSet(K.pinFails, null),
    secSet(K.bio, null),
    prefSet(K.user, null),
    prefSet(K.fullName, null),
  ]);
}
