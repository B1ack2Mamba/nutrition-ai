// lib/clients.ts
//
// NOTE: The app migrated to Supabase.
// This file is kept only for backward compatibility with any older code paths.
// New code should query Supabase tables directly.

export type Client = {
  id: string;
  name: string;
  email?: string;
  currentMenuId?: string | null;
  activeMenuIds?: string[];
};

export function loadClientsFromStorage(): Client[] {
  // Kept for compatibility; new code should query Supabase.
  return [];
}

export function saveClientsToStorage(_clients: Client[]) {
  // No-op (kept for backwards compatibility).
}

export function seedDefaultClientIfEmpty() {
  // No-op.
}
