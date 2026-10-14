type StoredAttempt = { fingerprint: string; key: string };

async function fingerprint(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function storageKey(flow: string): string {
  return `gieomo_order_attempt_${flow}`;
}

export async function getOrCreateOrderAttemptKey(flow: string, payload: unknown): Promise<string> {
  const nextFingerprint = await fingerprint(payload);
  try {
    const raw = sessionStorage.getItem(storageKey(flow));
    const existing = raw ? (JSON.parse(raw) as StoredAttempt) : null;
    if (existing?.fingerprint === nextFingerprint && /^[0-9a-f-]{36}$/i.test(existing.key)) {
      return existing.key;
    }
  } catch {
    // A fresh key below remains safe; server-side uniqueness is authoritative.
  }

  const key = crypto.randomUUID();
  try {
    sessionStorage.setItem(storageKey(flow), JSON.stringify({ fingerprint: nextFingerprint, key }));
  } catch {
    // In-memory request still carries the key even when sessionStorage is unavailable.
  }
  return key;
}

export function clearOrderAttemptKey(flow: string): void {
  try {
    sessionStorage.removeItem(storageKey(flow));
  } catch {
    // No-op when storage is unavailable.
  }
}
