// lib/clients.ts

export type Client = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  note?: string;
  currentMenuId?: string | null; // основной назначенный рацион
  activeMenuIds: string[]; // остальные доступные рационы
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "nutritionist_clients_v1";

export function loadClientsFromStorage(): Client[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Client[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveClientsToStorage(clients: Client[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
}

export function addClient(client: Client): void {
  const clients = loadClientsFromStorage();
  saveClientsToStorage([...clients, client]);
}

export function updateClient(updated: Client): void {
  const clients = loadClientsFromStorage();
  const next = clients.map((c) => (c.id === updated.id ? updated : c));
  saveClientsToStorage(next);
}

export function deleteClient(id: string): void {
  const clients = loadClientsFromStorage();
  const next = clients.filter((c) => c.id !== id);
  saveClientsToStorage(next);
}

export function getClientById(id: string): Client | undefined {
  const clients = loadClientsFromStorage();
  return clients.find((c) => c.id === id);
}
