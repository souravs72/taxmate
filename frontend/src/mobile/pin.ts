/** Local PIN (PBKDF2 hash). Never sent to the server. */
import { loadPinFails, loadPinRecord, savePinFails, savePinRecord } from "./storage";

export const PIN_LENGTH = 6;
export const MAX_PIN_ATTEMPTS = 5;
const ITERATIONS = 150_000;

type PinRecord = { v: 1; salt: string; hash: string; iter: number };

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const d = [...pin].map(Number);
  const up = d.every((n, i) => i === 0 || n === (d[i - 1]! + 1) % 10);
  const down = d.every((n, i) => i === 0 || n === (d[i - 1]! + 9) % 10);
  return up || down;
}

export async function hasPin(): Promise<boolean> {
  return !!(await loadPinRecord());
}

export async function setPin(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  const rec: PinRecord = { v: 1, salt: b64(salt), hash: b64(hash), iter: ITERATIONS };
  await savePinRecord(JSON.stringify(rec));
  await savePinFails(0);
}

export type PinCheck = { ok: true } | { ok: false; remaining: number };

export async function checkPin(pin: string): Promise<PinCheck> {
  const raw = await loadPinRecord();
  if (!raw) return { ok: false, remaining: 0 };
  let rec: PinRecord;
  try {
    rec = JSON.parse(raw) as PinRecord;
  } catch {
    return { ok: false, remaining: 0 };
  }
  const got = await derive(pin, unb64(rec.salt), rec.iter);
  if (sameBytes(got, unb64(rec.hash))) {
    await savePinFails(0);
    return { ok: true };
  }
  const fails = (await loadPinFails()) + 1;
  await savePinFails(fails);
  return { ok: false, remaining: Math.max(0, MAX_PIN_ATTEMPTS - fails) };
}

export async function pinAttemptsLeft(): Promise<number> {
  return Math.max(0, MAX_PIN_ATTEMPTS - (await loadPinFails()));
}
