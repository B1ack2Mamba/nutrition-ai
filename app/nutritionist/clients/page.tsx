"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Client,
  addClient,
  deleteClient,
  loadClientsFromStorage,
  updateClient,
} from "@/lib/clients";
import { Menu, loadMenusFromStorage } from "@/lib/menus";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>(() =>
    loadClientsFromStorage(),
  );
  const menus: Menu[] = useMemo(
    () => loadMenusFromStorage(),
    [],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [currentMenuId, setCurrentMenuId] = useState<string | "">("");

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setEmail("");
    setPhone("");
    setNote("");
    setCurrentMenuId("");
  };

  const handleEdit = (client: Client) => {
    setEditingId(client.id);
    setName(client.name);
    setEmail(client.email ?? "");
    setPhone(client.phone ?? "");
    setNote(client.note ?? "");
    setCurrentMenuId(client.currentMenuId ?? "");
  };

  const handleDelete = (client: Client) => {
    if (!confirm(`Удалить клиента "${client.name}"?`)) return;
    deleteClient(client.id);
    setClients((prev) => prev.filter((c) => c.id !== client.id));
    if (editingId === client.id) {
      resetForm();
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;

    const now = new Date().toISOString();

    if (editingId) {
      const existing = clients.find((c) => c.id === editingId);
      if (!existing) return;

      const updated: Client = {
        ...existing,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
        currentMenuId: currentMenuId || null,
        activeMenuIds: existing.activeMenuIds ?? [],
        updatedAt: now,
      };

      updateClient(updated);
      setClients((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
    } else {
      const id = crypto.randomUUID();
      const client: Client = {
        id,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
        currentMenuId: currentMenuId || null,
        activeMenuIds: currentMenuId ? [currentMenuId] : [],
        createdAt: now,
        updatedAt: now,
      };

      addClient(client);
      setClients((prev) => [...prev, client]);
    }

    resetForm();
  };

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">
          Клиенты
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Веди список клиентов и назначай им рационы.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Список клиентов */}
        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {clients.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Пока нет ни одного клиента. Добавь первого справа.
            </p>
          ) : (
            <ul className="space-y-3">
              {clients.map((client) => {
                const menuTitle =
                  client.currentMenuId &&
                  menus.find((m) => m.id === client.currentMenuId)
                    ?.title;

                return (
                  <li
                    key={client.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">
                        {client.name}
                      </div>
                      {(client.email || client.phone) && (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {client.email && <span>{client.email}</span>}
                          {client.email && client.phone && (
                            <span> • </span>
                          )}
                          {client.phone && <span>{client.phone}</span>}
                        </div>
                      )}
                      {menuTitle && (
                        <div className="text-xs text-emerald-600 dark:text-emerald-300">
                          Текущий рацион: {menuTitle}
                        </div>
                      )}
                      {client.note && (
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {client.note}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 text-[11px]">
                      <button
                        type="button"
                        onClick={() => handleEdit(client)}
                        className="rounded-full border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(client)}
                        className="rounded-full border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        Удалить
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Форма добавления/редактирования */}
        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-sm font-medium">
            {editingId ? "Редактирование клиента" : "Новый клиент"}
          </h3>
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="flex flex-col gap-1 text-sm">
              Имя
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                placeholder="Имя клиента"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Email (опционально)
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                placeholder="client@example.com"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Телефон (опционально)
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                placeholder="+48 ..."
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Назначенный рацион
              <select
                value={currentMenuId}
                onChange={(e) => setCurrentMenuId(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
              >
                <option value="">— Не назначен —</option>
                {menus.map((menu) => (
                  <option key={menu.id} value={menu.id}>
                    {menu.title}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-500">
                Этот рацион будет показываться клиенту в его кабинете.
              </p>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Заметка (опционально)
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-200"
                placeholder="Например: цели, особенности здоровья, предпочтения."
              />
            </label>

            <div className="flex items-center justify-end gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Отмена
                </button>
              )}
              <button
                type="submit"
                className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200"
              >
                {editingId ? "Сохранить изменения" : "Добавить клиента"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
