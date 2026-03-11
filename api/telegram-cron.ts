import type { VercelRequest, VercelResponse } from "@vercel/node";
import { list } from "@vercel/blob";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GROUP_CHAT_ID = -1002398835975;
const TOKEN_ADDRESS = "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump";
const WEBSITE_URL = "https://budju.xyz";

async function sendMessage(chatId: number, text: string) {
  return fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });
}

async function sendPhoto(chatId: number, photoUrl: string, caption: string) {
  return fetch(`${TELEGRAM_API}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: "HTML",
    }),
  });
}

function formatPrice(p: number): string {
  if (p <= 0) return "$0.00";
  if (p < 0.0001) return `$${p.toFixed(8)}`;
  if (p < 0.01) return `$${p.toFixed(6)}`;
  if (p < 1) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(2)}`;
}

function formatCompact(n: number): string {
  if (n <= 0) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

async function fetchPrice() {
  // GeckoTerminal (most reliable for BUDJU)
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${TOKEN_ADDRESS}`,
      { headers: { Accept: "application/json" } },
    );
    const data = await res.json();
    const attrs = data?.data?.attributes || {};
    const price = Number(attrs.price_usd || 0);
    const volume = Number(attrs.volume_usd?.h24 || 0);
    const marketCap = price > 0 ? price * 1_000_000_000 : 0;
    if (price > 0) return { price, marketCap, volume24h: volume };
  } catch (e) {
    console.error("GeckoTerminal error:", e);
  }
  // Jupiter fallback
  try {
    const res = await fetch(`https://api.jup.ag/price/v3?ids=${TOKEN_ADDRESS}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    const price = Number(data?.data?.[TOKEN_ADDRESS]?.usdPrice || 0);
    const marketCap = price > 0 ? price * 1_000_000_000 : 0;
    return { price, marketCap, volume24h: 0 };
  } catch (e) {
    console.error("Jupiter error:", e);
  }
  return { price: 0, marketCap: 0, volume24h: 0 };
}

async function getMarketingImages() {
  try {
    const allBlobs: any[] = [];
    let cursor: string | undefined;
    do {
      const result = await list({ prefix: "Marketing/", cursor, limit: 100 });
      allBlobs.push(...result.blobs);
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);
    return allBlobs
      .filter((b) => {
        const ext = b.pathname.split(".").pop()?.toLowerCase() || "";
        return ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
      })
      .map((b) => ({ url: b.url, name: b.pathname.replace(/^Marketing\//, "") }));
  } catch (e) {
    console.error("Blob error:", e);
    return [];
  }
}

const PROMO_MESSAGES = [
  `🐸🚀 <b>BUDJU is building the future of meme coins on Solana!</b>\n\nAutomated trading, NFTs, burns, and a growing community. Are you in?\n\n🌐 ${WEBSITE_URL}`,
  `💎🙌 <b>Diamond hands hold BUDJU!</b>\n\nWith regular burns reducing supply and the DCA bot generating trades, BUDJU is more than just a meme.\n\n🌐 ${WEBSITE_URL}`,
  `🔥 <b>BUDJU Burns = Scarcity!</b>\n\nEvery burn reduces the total supply, making your tokens more valuable. The deflation game is real!\n\n🌐 ${WEBSITE_URL}/burn`,
  `🤖 <b>Did you know?</b>\n\nBUDJU has a built-in DCA Trading Bot! Hold 10M BUDJU, deposit funds, and let the bot trade for you while you sleep.\n\n🌐 ${WEBSITE_URL}/trade`,
  `🏦 <b>Bank of BUDJU</b>\n\nThe ecosystem keeps growing. Bank, Shop, NFTs, and automated trading — all powered by BUDJU on Solana.\n\n🌐 ${WEBSITE_URL}`,
  `📈 <b>BUDJU Ecosystem Growing!</b>\n\nFrom Pump.fun launch to Raydium listing, from NFTs to the trading bot — BUDJU keeps delivering.\n\nCheck out the roadmap: ${WEBSITE_URL}`,
  `🛍 <b>Shop of BUDJU's is LIVE!</b>\n\nMerchandise and more coming to the BUDJU ecosystem. Show your support!\n\n🌐 ${WEBSITE_URL}/shop`,
  `🌊 <b>Pool of BUDJU</b>\n\nLiquidity is live on Raydium! Trade BUDJU with deep liquidity and low slippage.\n\n🌐 ${WEBSITE_URL}/pool`,
  `🖼 <b>BUDJU NFTs are coming!</b>\n\nExclusive digital collectibles for the BUDJU community. Stay tuned!\n\n🌐 ${WEBSITE_URL}/nft`,
  `💰 <b>Why BUDJU?</b>\n\n✅ Automated DCA Trading Bot\n✅ Regular token burns\n✅ NFTs & Merch\n✅ Community-driven\n✅ Built on Solana\n\n🌐 ${WEBSITE_URL}`,
];

async function ensureWebhook() {
  const webhookUrl = `https://budju.xyz/api/telegram`;
  try {
    // Check current webhook status
    const infoRes = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
    const info = await infoRes.json();
    const current = (info as any)?.result?.url || "";

    // Re-register if webhook is missing or pointing elsewhere
    if (current !== webhookUrl) {
      console.log(`Webhook drift detected: "${current}" → re-registering`);
      await fetch(
        `${TELEGRAM_API}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
      );
    }
  } catch (e) {
    // Best-effort: force set even if getWebhookInfo failed
    console.error("Webhook check failed, forcing re-register:", e);
    await fetch(
      `${TELEGRAM_API}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
    );
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN not set" });
  }

  // Keep the bot alive: ensure webhook is registered every cron run
  await ensureWebhook();

  // Use the current hour to decide: even hours = promo with image, odd hours = price update
  const hour = new Date().getUTCHours();
  const isPromoRound = hour % 12 === 0; // 0:00 and 12:00 UTC = promo
  // 6:00 and 18:00 UTC = price update

  try {
    if (isPromoRound) {
      // Send promo with image
      const images = await getMarketingImages();
      const caption = PROMO_MESSAGES[Math.floor(Math.random() * PROMO_MESSAGES.length)];
      if (images.length > 0) {
        const img = images[Math.floor(Math.random() * images.length)];
        await sendPhoto(GROUP_CHAT_ID, img.url, caption);
      } else {
        await sendMessage(GROUP_CHAT_ID, caption);
      }
      return res.status(200).json({ ok: true, type: "promo" });
    } else {
      // Send price update
      const data = await fetchPrice();
      if (data.price > 0) {
        const msg =
          `💰 <b>BUDJU Price Update</b>\n\n` +
          `📈 <b>Price:</b> ${formatPrice(data.price)}\n` +
          `🏦 <b>Market Cap:</b> ${formatCompact(data.marketCap)}\n` +
          (data.volume24h > 0 ? `📊 <b>24h Volume:</b> ${formatCompact(data.volume24h)}\n` : ``) +
          `\n🔗 <a href="https://dexscreener.com/solana/${TOKEN_ADDRESS}">DexScreener</a> | ` +
          `🌐 <a href="${WEBSITE_URL}">budju.xyz</a>`;
        await sendMessage(GROUP_CHAT_ID, msg);
      } else {
        // Fallback to promo if price unavailable
        const caption = PROMO_MESSAGES[Math.floor(Math.random() * PROMO_MESSAGES.length)];
        await sendMessage(GROUP_CHAT_ID, caption);
      }
      return res.status(200).json({ ok: true, type: "price" });
    }
  } catch (error: any) {
    console.error("Cron error:", error);
    return res.status(500).json({ error: error.message });
  }
}
