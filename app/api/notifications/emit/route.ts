import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

type Topic = "training" | "diary";

function b64url(input: Buffer | Uint8Array) {
  const buf = Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlJson(obj: any) {
  return b64url(Buffer.from(JSON.stringify(obj)));
}

function parseVapidPublicKey(pub: string) {
  const raw = Buffer.from(pub.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((pub.length + 3) % 4), "base64");
  // uncompressed point: 0x04 + x(32) + y(32)
  if (raw.length !== 65 || raw[0] !== 4) throw new Error("Invalid VAPID public key");
  const x = raw.slice(1, 33);
  const y = raw.slice(33, 65);
  return { x, y };
}

function parseB64urlToBuf(s: string) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4), "base64");
}

function makeVapidJwt(audOrigin: string, subject: string, publicKey: string, privateKey: string) {
  const { x, y } = parseVapidPublicKey(publicKey);
  const d = parseB64urlToBuf(privateKey);
  if (d.length !== 32) throw new Error("Invalid VAPID private key");

  const jwkPriv = {
    kty: "EC",
    crv: "P-256",
    x: b64url(x),
    y: b64url(y),
    d: b64url(d),
  } as const;

  const keyObj = crypto.createPrivateKey({ key: jwkPriv as any, format: "jwk" });

  const header = { typ: "JWT", alg: "ES256" };
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12; // 12h
  const claims = { aud: audOrigin, exp, sub: subject };

  const unsigned = `${b64urlJson(header)}.${b64urlJson(claims)}`;
  const sig = crypto.sign("sha256", Buffer.from(unsigned), { key: keyObj, dsaEncoding: "ieee-p1363" });
  const token = `${unsigned}.${b64url(sig)}`;

  return token;
}

async function sendWebPushPing(subscription: any, payload: any) {
  const endpoint = subscription?.endpoint;
  if (!endpoint || typeof endpoint !== "string") return { ok: false, status: 0 };

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

  if (!vapidPublic || !vapidPrivate) throw new Error("VAPID keys are not configured");

  const aud = new URL(endpoint).origin;
  const jwt = makeVapidJwt(aud, vapidSubject, vapidPublic, vapidPrivate);

  const headers: Record<string, string> = {
    "TTL": "2419200",
    "Authorization": `vapid t=${jwt}, k=${vapidPublic}`,
    "Crypto-Key": `p256ecdsa=${vapidPublic}`,
  };

  // If we don't send an encrypted payload, the body must be empty.
  // We'll show a generic notification; details are stored in DB.
  const res = await fetch(endpoint, { method: "POST", headers, body: "" });
  const ok = res.status >= 200 && res.status < 300;
  return { ok, status: res.status };
}

async function isAllowed(senderId: string, targetId: string): Promise<boolean> {
  // We don't rely on generated Supabase Database types in this repo.
  // supabase-js may infer `never` for some operations when types are missing.
  // Keep this API route build-safe by using a loose client.
  const supabaseAdmin = getSupabaseAdmin() as any;
  if (senderId === targetId) return true;

  // nutritionist -> client
  const { data: a } = await supabaseAdmin
    .from("client_nutritionist_links")
    .select("id,status")
    .eq("client_id", targetId)
    .eq("nutritionist_id", senderId)
    .in("status", ["approved", "active"])
    .limit(1);

  if (a && a.length > 0) return true;

  // client -> nutritionist
  const { data: b } = await supabaseAdmin
    .from("client_nutritionist_links")
    .select("id,status")
    .eq("client_id", senderId)
    .eq("nutritionist_id", targetId)
    .in("status", ["approved", "active"])
    .limit(1);

  if (b && b.length > 0) return true;

  return false;
}

async function prefsAllow(userId: string, topic: Topic) {
  const supabaseAdmin = getSupabaseAdmin() as any;
  type PrefRow = {
    enable_training: boolean | null;
    enable_diary: boolean | null;
  };

  // supabase-js can infer `never` here if you don't use generated Database types.
  // We cast the response to keep the type narrow and avoid build failures.
  const { data } = (await supabaseAdmin
    .from("notification_prefs")
    .select("enable_training, enable_diary")
    .eq("user_id", userId)
    .maybeSingle()) as { data: PrefRow | null };

  const enableTraining = data?.enable_training ?? true;
  const enableDiary = data?.enable_diary ?? true;
  return topic === "training" ? enableTraining : enableDiary;
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supa = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userRes, error: userErr } = await supa.auth.getUser(token);
    const sender = userRes?.user;
    if (userErr || !sender) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const targetUserId = body?.userId as string | undefined;
    const topic = body?.topic as Topic | undefined;
    const title = body?.title as string | undefined;
    const message = body?.body as string | undefined;
    const link = (body?.url as string | undefined) ?? "/notifications";

    if (!targetUserId || (topic !== "training" && topic !== "diary") || !title || !message) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin() as any;

    // access control
    const allowed = await isAllowed(sender.id, targetUserId);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // prefs
    const okByPrefs = await prefsAllow(targetUserId, topic);
    if (!okByPrefs) {
      return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
    }

    // persist notification (so payload can be empty)
    await supabaseAdmin.from("user_notifications").insert({
      user_id: targetUserId,
      topic,
      title,
      body: message,
      url: link,
    });

    // deliver web push ping
    const { data: devices } = await supabaseAdmin
      .from("notification_devices")
      .select("id,endpoint,payload")
      .eq("user_id", targetUserId)
      .eq("kind", "webpush");

    let sent = 0;
    let failed = 0;

    for (const d of devices ?? []) {
      try {
        const res = await sendWebPushPing(d.payload, null);
        if (res.ok) sent++;
        else {
          failed++;
          if (res.status === 404 || res.status === 410) {
            await supabaseAdmin.from("notification_devices").delete().eq("id", d.id);
          }
        }
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ ok: true, sent, failed }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
