#!/usr/bin/env node
/**
 * Test Robinhood Crypto API connectivity.
 * Run: node scripts/test-robinhood-api.mjs
 * Requires ROBINHOOD_API_KEY and ROBINHOOD_PRIVATE_KEY in .env (or export them).
 */
import "dotenv/config";
import nacl from "tweetnacl";

const BASE = "https://trading.robinhood.com";
const apiKey = process.env.ROBINHOOD_API_KEY?.trim();
const privateKeyB64 = process.env.ROBINHOOD_PRIVATE_KEY?.trim();

if (!apiKey || !privateKeyB64) {
  console.error("Set ROBINHOOD_API_KEY and ROBINHOOD_PRIVATE_KEY in .env");
  process.exit(1);
}

function sign(seedB64, message) {
  const seed = new Uint8Array(Buffer.from(seedB64.replace(/\s/g, ""), "base64"));
  if (seed.length !== 32) throw new Error(`Expected 32 bytes, got ${seed.length}`);
  const kp = nacl.sign.keyPair.fromSeed(seed);
  return Buffer.from(nacl.sign.detached(Buffer.from(message, "utf8"), kp.secretKey)).toString("base64");
}

const path = "/api/v1/crypto/trading/accounts/";
const method = "GET";
const body = "";
const timestamp = Math.floor(Date.now() / 1000).toString();
const normalizedPath = path.startsWith("/") ? path : `/${path}`;
const message = `${apiKey}${timestamp}${normalizedPath}${method}${body}`;
const signature = sign(privateKeyB64, message);

const headers = {
  "x-api-key": apiKey,
  "x-timestamp": timestamp,
  "x-signature": signature,
  "Content-Type": "application/json",
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
};

console.log("Testing Robinhood API...");
console.log("URL:", BASE + path);
console.log("Message length:", message.length);

const res = await fetch(BASE + path, { method: "GET", headers });
const text = await res.text();

console.log("Status:", res.status, res.statusText);
if (res.ok) {
  console.log("Response:", text.slice(0, 500));
  console.log("✅ Success");
} else {
  console.log("Response:", text.slice(0, 500));
  console.log("❌ Failed");
}
