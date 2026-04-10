import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { MongoClient } from "mongodb";

// ── Config ──────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = process.env.DB_NAME || "flub";
const CHALLENGE_TTL_SECONDS = 600; // 10 minutes

const ALLOWED_ORIGINS = ["https://budju.xyz", "https://www.budju.xyz"];
function getCorsOrigin(req: VercelRequest): string {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (origin.startsWith("http://localhost:")) return origin;
  return ALLOWED_ORIGINS[0];
}

// ── MongoDB Connection (reused across warm instances) ───────

let _client: MongoClient | null = null;
async function getDb() {
  if (!_client) {
    _client = new MongoClient(MONGODB_URI);
    await _client.connect();
  }
  const db = _client.db(DB_NAME);
  const coll = db.collection("wallet_qr_challenges");

  // Ensure TTL index (only creates if not exists)
  await coll.createIndex({ created: 1 }, { expireAfterSeconds: CHALLENGE_TTL_SECONDS }).catch(() => {});
  return coll;
}

// ── DER prefix for Ed25519 public key verification ──────────
const DER_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

// ── Handler ─────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", getCorsOrigin(req));
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      return await handleGet(req, res);
    } else if (req.method === "POST") {
      return await handlePost(req, res);
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("[wallet-qr] Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// ── GET: Create challenge or poll status ─────────────────────

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const challengeId = req.query.c as string | undefined;

  if (challengeId) {
    // Poll for completion
    const coll = await getDb();
    const challenge = await coll.findOne({ challengeId });

    if (!challenge) {
      return res.status(200).json({ status: "expired" });
    }

    if (challenge.status === "approved") {
      return res.status(200).json({
        status: "approved",
        wallet: challenge.wallet,
      });
    }

    return res.status(200).json({
      status: "pending",
      message: challenge.message,
    });
  }

  // Generate new challenge
  const newChallengeId = crypto.randomBytes(16).toString("hex");
  const nonce = crypto.randomBytes(32).toString("hex");
  const timestamp = new Date().toISOString();
  const message = `Welcome to BUDJU\n\nSign this message to connect your wallet.\n\nChallenge: ${nonce}\nTimestamp: ${timestamp}`;

  const coll = await getDb();
  await coll.insertOne({
    challengeId: newChallengeId,
    message,
    nonce,
    status: "pending",
    created: new Date(),
  });

  return res.status(200).json({
    challengeId: newChallengeId,
    message,
  });
}

// ── POST: Verify signed challenge ────────────────────────────

async function handlePost(req: VercelRequest, res: VercelResponse) {
  const { challengeId, signature, publicKey } = req.body || {};

  if (!challengeId || !signature || !publicKey) {
    return res.status(400).json({ error: "Missing challengeId, signature, or publicKey" });
  }

  const coll = await getDb();
  const challenge = await coll.findOne({ challengeId });

  if (!challenge) {
    return res.status(400).json({ error: "Challenge expired or not found" });
  }

  if (challenge.status !== "pending") {
    return res.status(400).json({ error: "Challenge already used" });
  }

  // Verify Ed25519 signature
  try {
    // Decode base58 public key to bytes
    const pubKeyBytes = decodeBase58(publicKey);
    const messageBytes = Buffer.from(challenge.message, "utf-8");
    const sigBytes = Buffer.from(signature, "base64");

    // DER-wrap the Ed25519 public key for Node.js crypto
    const derKey = Buffer.concat([DER_PREFIX, pubKeyBytes]);
    const keyObj = crypto.createPublicKey({
      key: derKey,
      format: "der",
      type: "spki",
    });

    const isValid = crypto.verify(null, messageBytes, keyObj, sigBytes);

    if (!isValid) {
      return res.status(400).json({ error: "Invalid signature" });
    }
  } catch (err: any) {
    return res.status(400).json({ error: `Signature verification failed: ${err.message}` });
  }

  // Mark challenge as approved
  await coll.updateOne(
    { challengeId },
    { $set: { status: "approved", wallet: publicKey } },
  );

  return res.status(200).json({ success: true, wallet: publicKey });
}

// ── Base58 decoder (minimal, no dependency) ──────────────────

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(str: string): Buffer {
  const bytes: number[] = [0];
  for (const char of str) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base58 character: ${char}`);
    let carry = idx;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Add leading zeros
  for (const char of str) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return Buffer.from(bytes.reverse());
}
