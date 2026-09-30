// Importers: PageHead in components/ui.tsx, FormActions in components/form.tsx.
// API: none. This store only moves already-rendered form buttons into the page header.
// Schema: none.
// User: "ensure there is a same shared helper for all the screens... Same for form view in the frontend"
import type { ReactNode } from "react";

/**
 * Form screens that render Discard / Save / Submit in the column body
 * publish that cluster here. PageHead reads it and places the buttons in the
 * same header slot every other screen uses.
 */
let node: ReactNode = null;
let version = 0;
let owner = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((fn) => fn());
}

/** Returns an owner id. A later clear from an older screen is ignored. */
export function publishFormActions(next: ReactNode): number {
  owner += 1;
  node = next;
  emit();
  return owner;
}

export function clearFormActions(id: number) {
  if (owner !== id) return;
  node = null;
  emit();
}

export function subscribeFormActions(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getFormActionVersion() {
  return version;
}

export function getFormActionNode() {
  return node;
}
