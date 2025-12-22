import { supabase } from "@/lib/supabaseClient";

export type ChatThread = {
  id: string;
  client_id: string;
  nutritionist_id: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

/**
 * Надёжно получает (или создаёт) тред "клиент ↔ нутрициолог".
 * Работает и когда треда ещё нет, и когда уже есть.
 */
export async function ensureChatThread(args: {
  clientId: string;
  nutritionistId: string;
}): Promise<{ threadId: string }> {
  const { clientId, nutritionistId } = args;

  // 1) пробуем найти
  const found = await supabase
    .from("chat_threads")
    .select("id")
    .eq("client_id", clientId)
    .eq("nutritionist_id", nutritionistId)
    .limit(1);

  if (found.error) throw new Error(found.error.message);

  const existing = (found.data?.[0] as { id: string } | undefined)?.id;
  if (existing) return { threadId: existing };

  // 2) иначе создаём
  const created = await supabase
    .from("chat_threads")
    .insert({ client_id: clientId, nutritionist_id: nutritionistId })
    .select("id")
    .single();

  if (created.error) throw new Error(created.error.message);
  return { threadId: (created.data as { id: string }).id };
}

export async function fetchThreadMessages(args: {
  threadId: string;
  limit?: number;
}): Promise<ChatMessage[]> {
  const { threadId, limit = 200 } = args;

  const res = await supabase
    .from("chat_messages")
    .select("id, thread_id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as ChatMessage[];
}

export async function sendThreadMessage(args: {
  threadId: string;
  senderId: string;
  body: string;
}): Promise<void> {
  const body = args.body.trim();
  if (!body) return;

  const res = await supabase
    .from("chat_messages")
    .insert({ thread_id: args.threadId, sender_id: args.senderId, body });

  if (res.error) throw new Error(res.error.message);
}
