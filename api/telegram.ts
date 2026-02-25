import type { VercelRequest, VercelResponse } from "@vercel/node";
import { list } from "@vercel/blob";

// ── Config ──────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GROUP_CHAT_ID = -1002398835975;

const TOKEN_ADDRESS = "2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump";
const WEBSITE_URL = "https://budju.xyz";

// ── Telegram helpers ────────────────────────────────────────────────────
async function sendMessage(chatId: number, text: string, parseMode = "HTML") {
  return fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
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

// ── Price fetching (DexScreener + GeckoTerminal fallback) ───────────────
async function fetchPrice(): Promise<{
  price: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  liquidity: number;
}> {
  // Try DexScreener first
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`,
    );
    const data = await res.json();
    if (data.pairs && data.pairs.length > 0) {
      const pair = [...data.pairs].sort(
        (a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0),
      )[0];
      return {
        price: parseFloat(pair.priceUsd || "0"),
        marketCap: pair.marketCap || pair.fdv || 0,
        volume24h: pair.volume?.h24 || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
      };
    }
  } catch (e) {
    console.error("DexScreener error:", e);
  }

  // Fallback: GeckoTerminal (free, no key)
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
    return { price, marketCap, volume24h: volume, priceChange24h: 0, liquidity: 0 };
  } catch (e) {
    console.error("GeckoTerminal error:", e);
  }

  // Fallback: Jupiter Price API
  try {
    const res = await fetch(`https://api.jup.ag/price/v3?ids=${TOKEN_ADDRESS}`, {
      headers: { Accept: "application/json" },
    });
    const data = await res.json();
    const price = Number(data?.data?.[TOKEN_ADDRESS]?.usdPrice || 0);
    const marketCap = price > 0 ? price * 1_000_000_000 : 0;
    return { price, marketCap, volume24h: 0, priceChange24h: 0, liquidity: 0 };
  } catch (e) {
    console.error("Jupiter price error:", e);
  }

  return { price: 0, marketCap: 0, volume24h: 0, priceChange24h: 0, liquidity: 0 };
}

// ── Marketing images from Vercel Blob ───────────────────────────────────
async function getMarketingImages(): Promise<{ url: string; name: string }[]> {
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
    console.error("Blob list error:", e);
    return [];
  }
}

// ── Format helpers ──────────────────────────────────────────────────────
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

function changeEmoji(change: number): string {
  if (change > 5) return "🚀";
  if (change > 0) return "📈";
  if (change < -5) return "📉";
  if (change < 0) return "🔻";
  return "➡️";
}

// ── Command handlers ────────────────────────────────────────────────────

async function handlePrice(chatId: number) {
  const data = await fetchPrice();
  if (data.price <= 0) {
    await sendMessage(chatId, "⏳ Price data temporarily unavailable. Try again shortly!");
    return;
  }

  const emoji = changeEmoji(data.priceChange24h);
  const changeStr =
    data.priceChange24h >= 0
      ? `+${data.priceChange24h.toFixed(2)}%`
      : `${data.priceChange24h.toFixed(2)}%`;

  const msg =
    `💰 <b>BUDJU Price Update</b>\n\n` +
    `${emoji} <b>Price:</b> ${formatPrice(data.price)}\n` +
    `📊 <b>24h Change:</b> ${changeStr}\n` +
    `🏦 <b>Market Cap:</b> ${formatCompact(data.marketCap)}\n` +
    `📈 <b>24h Volume:</b> ${formatCompact(data.volume24h)}\n` +
    `💧 <b>Liquidity:</b> ${formatCompact(data.liquidity)}\n\n` +
    `🔗 <a href="https://dexscreener.com/solana/${TOKEN_ADDRESS}">View on DexScreener</a>\n` +
    `🌐 <a href="${WEBSITE_URL}">budjucoin.com</a>`;

  await sendMessage(chatId, msg);
}

async function handleInfo(chatId: number) {
  const msg =
    `🐸 <b>What is BUDJU?</b>\n\n` +
    `BUDJU is a Solana-based meme coin with a built-in <b>DCA Trading Bot</b>. ` +
    `Deposit and let the bot trade for you — fully automated, very low risk.\n\n` +
    `<b>Key Facts:</b>\n` +
    `• <b>Token:</b> BUDJU\n` +
    `• <b>Blockchain:</b> Solana\n` +
    `• <b>Total Supply:</b> 1,000,000,000\n` +
    `• <b>Created:</b> January 31, 2025\n` +
    `• <b>Bot Access:</b> Hold 10,000,000 BUDJU\n\n` +
    `<b>Features:</b>\n` +
    `🤖 Automated DCA Trading Bot\n` +
    `🏦 Bank of BUDJU\n` +
    `🖼 NFT Collection\n` +
    `🛍 Shop of BUDJU's\n` +
    `🔥 Regular Token Burns\n` +
    `🏊 Liquidity Pool on Raydium\n\n` +
    `<b>Contract Address:</b>\n` +
    `<code>${TOKEN_ADDRESS}</code>\n\n` +
    `🌐 <a href="${WEBSITE_URL}">budjucoin.com</a> | ` +
    `🐦 <a href="https://x.com/budjucoin">Twitter</a> | ` +
    `📱 <a href="https://www.tiktok.com/@budjucoin">TikTok</a>`;

  await sendMessage(chatId, msg);
}

async function handleHelp(chatId: number) {
  const msg =
    `🤖 <b>BUDJU Bot Commands</b>\n\n` +
    `/price — Current BUDJU price & stats\n` +
    `/info — About BUDJU coin\n` +
    `/buy — How to buy BUDJU\n` +
    `/contract — Contract address\n` +
    `/roadmap — Project roadmap\n` +
    `/website — Visit budjucoin.com\n` +
    `/promo — See a promotional image\n` +
    `/help — This help message\n\n` +
    `You can also ask me questions about BUDJU and I'll do my best to answer!`;

  await sendMessage(chatId, msg);
}

async function handleBuy(chatId: number) {
  const msg =
    `🛒 <b>How to Buy BUDJU</b>\n\n` +
    `<b>Step 1:</b> Get a Solana wallet (Phantom, Solflare, etc.)\n` +
    `<b>Step 2:</b> Buy SOL from an exchange and send it to your wallet\n` +
    `<b>Step 3:</b> Go to Raydium or Jupiter and swap SOL for BUDJU\n\n` +
    `<b>Contract Address:</b>\n` +
    `<code>${TOKEN_ADDRESS}</code>\n\n` +
    `<b>Quick Links:</b>\n` +
    `🔄 <a href="https://raydium.io/swap/?inputMint=sol&outputMint=${TOKEN_ADDRESS}">Swap on Raydium</a>\n` +
    `🪐 <a href="https://jup.ag/swap/SOL-${TOKEN_ADDRESS}">Swap on Jupiter</a>\n` +
    `💊 <a href="https://pump.fun/coin/${TOKEN_ADDRESS}">View on Pump.fun</a>\n` +
    `📖 <a href="${WEBSITE_URL}/how-to-buy">Full Guide</a>\n\n` +
    `💡 <b>Tip:</b> Hold 10M BUDJU to unlock the automated trading bot!`;

  await sendMessage(chatId, msg);
}

async function handleContract(chatId: number) {
  const msg =
    `📋 <b>BUDJU Contract Address</b>\n\n` +
    `<code>${TOKEN_ADDRESS}</code>\n\n` +
    `👆 Tap to copy!\n\n` +
    `🔍 <a href="https://solscan.io/token/${TOKEN_ADDRESS}">View on Solscan</a>\n` +
    `📊 <a href="https://dexscreener.com/solana/${TOKEN_ADDRESS}">DexScreener</a>`;

  await sendMessage(chatId, msg);
}

async function handleRoadmap(chatId: number) {
  const msg =
    `🗺 <b>BUDJU Roadmap</b>\n\n` +
    `<b>Phase 1</b> ✅\n` +
    `• Create Budju Coin ✅\n` +
    `• 100 wallet holders ✅\n` +
    `• 10K Market Cap ✅\n` +
    `• Bank of BUDJU ✅\n` +
    `• Token Burns ✅\n` +
    `• 100% Bonding Curve ✅\n` +
    `• King of the Hill ✅\n\n` +
    `<b>Phase 2</b> 🔄\n` +
    `• 500 Wallet Holders\n` +
    `• 2nd Gen NFTs\n` +
    `• 100K Market Cap ✅\n` +
    `• Listed on Raydium ✅\n` +
    `• Shop of BUDJU's ✅\n` +
    `• Bank of BUDJU's ✅\n\n` +
    `<b>Phase 3</b> 🔮\n` +
    `• Merchandise\n` +
    `• Marketing Campaign\n` +
    `• $1M Market Cap\n` +
    `• 1,000 Holders\n\n` +
    `<b>Phase 4</b> 🌟\n` +
    `• Villa of BUDJU's\n` +
    `• Competitions & Giveaways\n` +
    `• Global Branding\n` +
    `• $10M Market Cap\n` +
    `• 10,000 Holders\n` +
    `• L1/L2 Exchange Listings\n\n` +
    `🌐 <a href="${WEBSITE_URL}">Full details at budjucoin.com</a>`;

  await sendMessage(chatId, msg);
}

async function handleWebsite(chatId: number) {
  const msg =
    `🌐 <b>Visit BUDJU</b>\n\n` +
    `<a href="${WEBSITE_URL}">budjucoin.com</a>\n\n` +
    `Trade, stake, explore NFTs, and more!`;

  await sendMessage(chatId, msg);
}

async function handlePromo(chatId: number) {
  const images = await getMarketingImages();
  if (images.length === 0) {
    await sendMessage(chatId, "📸 No promotional images available right now. Check back soon!");
    return;
  }

  const img = images[Math.floor(Math.random() * images.length)];
  const captions = [
    `🐸 <b>BUDJU</b> — The Solana meme coin with a built-in trading bot!\n\n🌐 ${WEBSITE_URL}`,
    `🚀 <b>BUDJU is on the move!</b> Don't miss out.\n\nHold 10M BUDJU to unlock the DCA bot!\n🌐 ${WEBSITE_URL}`,
    `💎 <b>Diamond hands hold BUDJU!</b>\n\nAutomated trading, NFTs, burns, and more.\n🌐 ${WEBSITE_URL}`,
    `🔥 <b>BUDJU burns = less supply = more value!</b>\n\nJoin the movement.\n🌐 ${WEBSITE_URL}`,
    `🏦 <b>Bank of BUDJU</b> is live!\n\nDeposit, trade, and earn with the BUDJU ecosystem.\n🌐 ${WEBSITE_URL}`,
  ];
  const caption = captions[Math.floor(Math.random() * captions.length)];
  await sendPhoto(chatId, img.url, caption);
}

// ── Natural language Q&A ────────────────────────────────────────────────
function handleQuestion(text: string): string | null {
  const lower = text.toLowerCase();

  // Price questions
  if (lower.match(/\b(price|worth|cost|how much)\b/)) return null; // defer to /price handler

  // What is BUDJU
  if (lower.match(/\b(what is|what's|explain|tell me about)\b.*\b(budju|token|coin)\b/))
    return (
      `🐸 <b>BUDJU</b> is a Solana-based meme coin with real utility!\n\n` +
      `It features a built-in <b>DCA Trading Bot</b> that trades automatically for you. ` +
      `Hold 10M BUDJU to unlock the bot. The ecosystem includes a bank, NFTs, a shop, and regular token burns.\n\n` +
      `🌐 <a href="${WEBSITE_URL}">Learn more at budjucoin.com</a>`
    );

  // How to buy
  if (lower.match(/\b(how|where)\b.*\b(buy|get|purchase|swap)\b/))
    return (
      `🛒 To buy BUDJU:\n` +
      `1. Get a Solana wallet (Phantom/Solflare)\n` +
      `2. Buy SOL and send to your wallet\n` +
      `3. Swap SOL → BUDJU on Raydium or Jupiter\n\n` +
      `CA: <code>${TOKEN_ADDRESS}</code>\n` +
      `📖 <a href="${WEBSITE_URL}/how-to-buy">Full guide</a>`
    );

  // Contract address
  if (lower.match(/\b(contract|ca|address|token address)\b/))
    return `📋 <b>BUDJU CA:</b>\n<code>${TOKEN_ADDRESS}</code>`;

  // Bot / trading bot
  if (lower.match(/\b(bot|trading|dca|automated|auto trade)\b/))
    return (
      `🤖 The <b>BUDJU Trading Bot</b> uses Dollar Cost Averaging (DCA) to trade automatically.\n\n` +
      `<b>How it works:</b>\n` +
      `1. Hold 10,000,000 BUDJU in your wallet\n` +
      `2. Deposit funds into the bot\n` +
      `3. The bot trades on your behalf — very low risk!\n\n` +
      `🌐 <a href="${WEBSITE_URL}/trade">Launch the bot</a>`
    );

  // NFT
  if (lower.match(/\bnft\b/))
    return (
      `🖼 BUDJU has an <b>NFT Collection</b> on Solana!\n\n` +
      `Browse and explore at <a href="${WEBSITE_URL}/nft">budjucoin.com/nft</a>`
    );

  // Bank
  if (lower.match(/\bbank\b/))
    return (
      `🏦 The <b>Bank of BUDJU</b> is the project's treasury.\n\n` +
      `It holds BUDJU tokens and supports the ecosystem.\n` +
      `🌐 <a href="${WEBSITE_URL}/bank">View the bank</a>`
    );

  // Burn
  if (lower.match(/\b(burn|burned|burning|supply)\b/))
    return (
      `🔥 BUDJU regularly <b>burns tokens</b> to reduce supply!\n\n` +
      `Less supply = more scarcity = potential value increase.\n` +
      `Track burns at <a href="${WEBSITE_URL}/burn">budjucoin.com/burn</a>`
    );

  // Tokenomics
  if (lower.match(/\b(tokenomics|supply|allocation)\b/))
    return (
      `📊 <b>BUDJU Tokenomics</b>\n\n` +
      `• Total Supply: 1,000,000,000\n` +
      `• Regular burns to reduce supply\n` +
      `• Liquidity on Raydium\n` +
      `• Bank of BUDJU treasury\n` +
      `• Developer vault (never sold)\n\n` +
      `🌐 <a href="${WEBSITE_URL}/tokenomics">Full tokenomics</a>`
    );

  // Website
  if (lower.match(/\b(website|site|link|url)\b/))
    return `🌐 Visit us at <a href="${WEBSITE_URL}">budjucoin.com</a>`;

  // Socials
  if (lower.match(/\b(social|twitter|x\.com|tiktok|instagram|facebook)\b/))
    return (
      `📱 <b>Follow BUDJU:</b>\n\n` +
      `🐦 <a href="https://x.com/budjucoin">Twitter/X</a>\n` +
      `📸 <a href="https://www.instagram.com/budjucoin">Instagram</a>\n` +
      `🎵 <a href="https://www.tiktok.com/@budjucoin">TikTok</a>\n` +
      `📘 <a href="https://www.facebook.com/share/g/167RuPUSM1/">Facebook</a>`
    );

  // Roadmap
  if (lower.match(/\b(roadmap|plan|future|phases?)\b/)) return null; // defer to /roadmap

  // Greeting
  if (lower.match(/^(hi|hello|hey|gm|good morning|yo|sup|wagmi)\b/))
    return (
      `👋 Hey there! Welcome to <b>BUDJU</b>!\n\n` +
      `Type /help to see what I can do, or just ask me anything about BUDJU! 🐸`
    );

  return null;
}

// ── Promotional messages ────────────────────────────────────────────────
const PROMO_MESSAGES = [
  `🐸🚀 <b>BUDJU is building the future of meme coins on Solana!</b>\n\nAutomated trading, NFTs, burns, and a growing community. Are you in?\n\n🌐 ${WEBSITE_URL}`,
  `💎🙌 <b>Diamond hands hold BUDJU!</b>\n\nWith regular burns reducing supply and the DCA bot generating trades, BUDJU is more than just a meme.\n\n🌐 ${WEBSITE_URL}`,
  `🔥 <b>BUDJU Burns = Scarcity!</b>\n\nEvery burn reduces the total supply, making your tokens more valuable. The deflation game is real!\n\n🌐 ${WEBSITE_URL}/burn`,
  `🤖 <b>Did you know?</b>\n\nBUDJU has a built-in DCA Trading Bot! Hold 10M BUDJU, deposit funds, and let the bot trade for you while you sleep.\n\n🌐 ${WEBSITE_URL}/trade`,
  `🏦 <b>Bank of BUDJU</b>\n\nThe ecosystem keeps growing. Bank, Shop, NFTs, and automated trading — all powered by BUDJU on Solana.\n\n🌐 ${WEBSITE_URL}`,
  `📈 <b>BUDJU Ecosystem Growing!</b>\n\nFrom Pump.fun launch to Raydium listing, from NFTs to the trading bot — BUDJU keeps delivering.\n\nCheck out the roadmap: ${WEBSITE_URL}`,
  `🛍 <b>Shop of BUDJU's is LIVE!</b>\n\nMerchandise and more coming to the BUDJU ecosystem. Show your support!\n\n🌐 ${WEBSITE_URL}/shop`,
  `🌊 <b>Pool of BUDJU</b>\n\nLiquidity is live on Raydium! Trade BUDJU with deep liquidity and low slippage.\n\n🌐 ${WEBSITE_URL}/pool`,
];

// ── Webhook handler ─────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow GET for health-check / webhook setup
  if (req.method === "GET") {
    const action = req.query.action as string | undefined;

    // Set webhook: GET /api/telegram?action=setWebhook&host=budjucoin.com
    if (action === "setWebhook") {
      const host = req.query.host || req.headers.host;
      const webhookUrl = `https://${host}/api/telegram`;
      const result = await fetch(
        `${TELEGRAM_API}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
      );
      const data = await result.json();
      return res.status(200).json({ ok: true, webhook: webhookUrl, telegram: data });
    }

    // Send promo: GET /api/telegram?action=promo
    if (action === "promo") {
      const images = await getMarketingImages();
      if (images.length > 0) {
        const img = images[Math.floor(Math.random() * images.length)];
        const caption = PROMO_MESSAGES[Math.floor(Math.random() * PROMO_MESSAGES.length)];
        await sendPhoto(GROUP_CHAT_ID, img.url, caption);
        return res.status(200).json({ ok: true, action: "promo_with_image" });
      } else {
        const msg = PROMO_MESSAGES[Math.floor(Math.random() * PROMO_MESSAGES.length)];
        await sendMessage(GROUP_CHAT_ID, msg);
        return res.status(200).json({ ok: true, action: "promo_text" });
      }
    }

    // Price update: GET /api/telegram?action=price
    if (action === "price") {
      await handlePrice(GROUP_CHAT_ID);
      return res.status(200).json({ ok: true, action: "price_update" });
    }

    return res.status(200).json({ ok: true, bot: "littlebudju_bot" });
  }

  // Handle webhook POST from Telegram
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const update = req.body;

    // New member joined
    if (update.message?.new_chat_members) {
      for (const member of update.message.new_chat_members) {
        if (member.is_bot) continue;
        const name = member.first_name || "friend";
        const welcome =
          `🐸 <b>Welcome to BUDJU, ${name}!</b>\n\n` +
          `We're glad you're here! BUDJU is a Solana meme coin with a built-in DCA Trading Bot.\n\n` +
          `🤖 Hold 10M BUDJU to unlock automated trading\n` +
          `🔥 Regular token burns\n` +
          `🏦 Bank of BUDJU ecosystem\n\n` +
          `Type /help to see all commands, or just ask me anything!\n\n` +
          `🌐 <a href="${WEBSITE_URL}">budjucoin.com</a>`;
        await sendMessage(update.message.chat.id, welcome);
      }
      return res.status(200).json({ ok: true });
    }

    // Handle text messages
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const isCommand = text.startsWith("/");

      if (isCommand) {
        const command = text.split(" ")[0].split("@")[0].toLowerCase();
        switch (command) {
          case "/start":
          case "/help":
            await handleHelp(chatId);
            break;
          case "/price":
            await handlePrice(chatId);
            break;
          case "/info":
            await handleInfo(chatId);
            break;
          case "/buy":
            await handleBuy(chatId);
            break;
          case "/contract":
          case "/ca":
            await handleContract(chatId);
            break;
          case "/roadmap":
            await handleRoadmap(chatId);
            break;
          case "/website":
            await handleWebsite(chatId);
            break;
          case "/promo":
            await handlePromo(chatId);
            break;
          default:
            await sendMessage(
              chatId,
              `🤔 Unknown command. Type /help to see available commands!`,
            );
        }
      } else {
        // Natural language — try to answer
        const answer = handleQuestion(text);
        if (answer) {
          await sendMessage(chatId, answer);
        }
        // If no match and it's a private chat, show a helpful nudge
        else if (update.message.chat.type === "private") {
          await sendMessage(
            chatId,
            `🐸 I'm the BUDJU bot! Type /help to see what I can do, or ask me about BUDJU, price, how to buy, and more!`,
          );
        }
        // In group chats, only respond to price-related questions proactively
        else if (text.toLowerCase().match(/\b(price|how much|market cap|volume)\b/)) {
          await handlePrice(chatId);
        }
        else if (text.toLowerCase().match(/\b(roadmap|plan|phases?)\b/)) {
          await handleRoadmap(chatId);
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("Telegram webhook error:", error);
    // Always return 200 to Telegram to avoid retry floods
    return res.status(200).json({ ok: false, error: error.message });
  }
}
