import crypto from "crypto";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function u8b64url(s) {
  const b = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4), "base64");
  return new Uint8Array(b);
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

const jwkPub = publicKey.export({ format: "jwk" });
const jwkPriv = privateKey.export({ format: "jwk" });

const x = u8b64url(jwkPub.x);
const y = u8b64url(jwkPub.y);
const d = u8b64url(jwkPriv.d);

// VAPID public key for browsers is the uncompressed EC point: 0x04 || X || Y
const rawPub = new Uint8Array(65);
rawPub[0] = 4;
rawPub.set(x, 1);
rawPub.set(y, 33);

const vapidPublic = b64url(rawPub);
const vapidPrivate = b64url(d);

console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY=" + vapidPublic);
console.log("VAPID_PRIVATE_KEY=" + vapidPrivate);
console.log("VAPID_SUBJECT=mailto:you@example.com");
