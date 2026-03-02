import type { VercelRequest, VercelResponse } from "@vercel/node";
import { list } from "@vercel/blob";

// ── Config ──────────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const GROUP_CHAT_ID = -1002398835975;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

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

async function sendMessageWithKeyboard(
  chatId: number,
  text: string,
  keyboard: { text: string; callback_data: string }[][],
) {
  return fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keyboard },
    }),
  });
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
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
  if (change > 5) return "\u{1F680}";
  if (change > 0) return "\u{1F4C8}";
  if (change < -5) return "\u{1F4C9}";
  if (change < 0) return "\u{1F53B}";
  return "\u{27A1}\u{FE0F}";
}

// ── AI Q&A with Claude ──────────────────────────────────────────────────
const BUDJU_SYSTEM_PROMPT = `You are the official BUDJU community assistant bot in a Telegram group. You are friendly, helpful, and enthusiastic about the BUDJU project. Always respond in a concise, chat-friendly way (2-4 sentences max).

Key facts about BUDJU:
- BUDJU is a Solana-based meme coin with real utility
- Token address: ${TOKEN_ADDRESS}
- Total supply: 1,000,000,000 BUDJU
- Created: January 31, 2025
- Website: ${WEBSITE_URL}
- Has a built-in automated DCA (Dollar Cost Averaging) Trading Bot
- Users need to hold 10,000,000 BUDJU to unlock the trading bot
- Features: Bank of BUDJU (treasury), NFT Collection, Shop of BUDJU's, regular token burns, liquidity pool on Raydium
- Available on Raydium and Jupiter DEX for swapping SOL to BUDJU
- Social media: Twitter @budjucoin, TikTok @budjucoin, Instagram @budjucoin
- Telegram group: t.me/budjucoingroup
- The project has completed Phase 1 (launch, bonding curve, King of the Hill, Raydium listing) and is working through Phase 2
- The roadmap goes up to Phase 4 which includes exchange listings, global branding, and $10M market cap goal

Rules:
- Never give financial advice or make price predictions
- Never share private keys or ask for them
- If asked about something you don't know, say you're not sure and direct them to the website or admins
- Keep responses short and conversational — this is a Telegram chat, not an essay
- Use HTML formatting (bold with <b>, italic with <i>, code with <code>) — NOT markdown
- Do not use markdown formatting like ** or __ — only use HTML tags
- You can use emojis sparingly to keep things fun`;

async function askClaude(question: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: BUDJU_SYSTEM_PROMPT,
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!res.ok) {
      console.error("Claude API error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text;
    return text || null;
  } catch (e) {
    console.error("Claude API error:", e);
    return null;
  }
}

// ── Command handlers ────────────────────────────────────────────────────

async function handleMenu(chatId: number) {
  const msg =
    `🐸 <b>BUDJU Menu</b>\n\n` +
    `Tap a button below to explore:`;

  const keyboard = [
    [
      { text: "💰 Price", callback_data: "cmd_price" },
      { text: "📊 Chart", callback_data: "cmd_chart" },
      { text: "🛒 Buy", callback_data: "cmd_buy" },
    ],
    [
      { text: "🐸 Info", callback_data: "cmd_info" },
      { text: "📋 Contract", callback_data: "cmd_contract" },
      { text: "📈 Tokenomics", callback_data: "cmd_tokenomics" },
    ],
    [
      { text: "🤖 Trading Bot", callback_data: "cmd_bot" },
      { text: "🏦 Bank", callback_data: "cmd_bank" },
      { text: "🔥 Burns", callback_data: "cmd_burn" },
    ],
    [
      { text: "🖼 NFTs", callback_data: "cmd_nft" },
      { text: "🛍 Shop", callback_data: "cmd_shop" },
      { text: "🌊 Pool", callback_data: "cmd_pool" },
    ],
    [
      { text: "🗺 Roadmap", callback_data: "cmd_roadmap" },
      { text: "📱 Socials", callback_data: "cmd_socials" },
      { text: "🌐 Website", callback_data: "cmd_website" },
    ],
  ];

  await sendMessageWithKeyboard(chatId, msg, keyboard);
}

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

async function handleChart(chatId: number) {
  const msg =
    `📊 <b>BUDJU Charts</b>\n\n` +
    `📈 <a href="https://dexscreener.com/solana/${TOKEN_ADDRESS}">DexScreener</a>\n` +
    `🦎 <a href="https://www.geckoterminal.com/solana/pools/${TOKEN_ADDRESS}">GeckoTerminal</a>\n` +
    `🪐 <a href="https://birdeye.so/token/${TOKEN_ADDRESS}?chain=solana">Birdeye</a>\n\n` +
    `Tap a link to view live charts!`;

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
    `<b>📌 Quick Access:</b>\n` +
    `/menu — Interactive button menu\n\n` +
    `<b>💰 Price & Trading:</b>\n` +
    `/price — Current BUDJU price & stats\n` +
    `/chart — Live chart links\n` +
    `/buy — How to buy BUDJU\n` +
    `/contract — Contract address (tap to copy)\n\n` +
    `<b>🐸 Project Info:</b>\n` +
    `/info — About BUDJU coin\n` +
    `/tokenomics — Token supply & distribution\n` +
    `/roadmap — Project roadmap\n` +
    `/socials — All social media links\n\n` +
    `<b>🏦 Ecosystem:</b>\n` +
    `/bot — Trading bot info\n` +
    `/bank — Bank of BUDJU\n` +
    `/burn — Token burn info\n` +
    `/nft — NFT collection\n` +
    `/shop — Shop of BUDJU's\n` +
    `/pool — Liquidity pool\n\n` +
    `<b>🎉 Fun:</b>\n` +
    `/promo — See a promotional image\n` +
    `/website — Visit budjucoin.com\n` +
    `/help — This help message\n\n` +
    `💬 You can also ask me <b>any question</b> about BUDJU and I'll answer using AI!`;

  await sendMessage(chatId, msg);
}

async function handleBuy(chatId: number) {
  const msg =
    `🛒 <b>How to Buy BUDJU</b>\n\n` +
    `<b>Step 1:</b> Get a Solana wallet (Phantom, Solflare, etc.)\n` +
    `<b>Step 2:</b> Buy SOL from an exchange and send it to your wallet\n` +
    `<b>Step 3:</b> Swap SOL for BUDJU using one of the links below\n\n` +
    `<b>Contract Address:</b>\n` +
    `<code>${TOKEN_ADDRESS}</code>\n\n` +
    `⭐️ <b><a href="${WEBSITE_URL}/swap">Buy on budju.xyz</a></b> ⭐️\n\n` +
    `<b>Other exchanges:</b>\n` +
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

async function handleTokenomics(chatId: number) {
  const msg =
    `📊 <b>BUDJU Tokenomics</b>\n\n` +
    `<b>Token Details:</b>\n` +
    `• <b>Name:</b> BUDJU\n` +
    `• <b>Blockchain:</b> Solana (SPL Token)\n` +
    `• <b>Total Supply:</b> 1,000,000,000\n` +
    `• <b>Created:</b> January 31, 2025\n\n` +
    `<b>Supply Mechanics:</b>\n` +
    `🔥 Regular token burns — reducing total supply over time\n` +
    `💧 Liquidity locked on Raydium\n` +
    `🏦 Bank of BUDJU treasury\n` +
    `🔒 Developer vault (never sold)\n\n` +
    `<b>Utility:</b>\n` +
    `• Hold 10M BUDJU → Unlock DCA Trading Bot\n` +
    `• NFT Collection access\n` +
    `• Shop of BUDJU's\n` +
    `• Ecosystem participation\n\n` +
    `📋 CA: <code>${TOKEN_ADDRESS}</code>\n` +
    `🌐 <a href="${WEBSITE_URL}">budjucoin.com</a>`;

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

async function handleSocials(chatId: number) {
  const msg =
    `📱 <b>Follow BUDJU Everywhere</b>\n\n` +
    `🐦 <a href="https://x.com/budjucoin">Twitter / X</a>\n` +
    `📸 <a href="https://www.instagram.com/budjucoin">Instagram</a>\n` +
    `🎵 <a href="https://www.tiktok.com/@budjucoin">TikTok</a>\n` +
    `📘 <a href="https://www.facebook.com/share/g/167RuPUSM1/">Facebook</a>\n` +
    `💬 <a href="https://t.me/budjucoingroup">Telegram Group</a>\n\n` +
    `🌐 <a href="${WEBSITE_URL}">budjucoin.com</a>\n\n` +
    `Follow us for the latest updates, memes, and announcements! 🐸`;

  await sendMessage(chatId, msg);
}

async function handleBot(chatId: number) {
  const msg =
    `🤖 <b>BUDJU DCA Trading Bot</b>\n\n` +
    `The BUDJU Trading Bot uses <b>Dollar Cost Averaging (DCA)</b> to trade automatically on your behalf.\n\n` +
    `<b>How it works:</b>\n` +
    `1️⃣ Hold <b>10,000,000 BUDJU</b> in your wallet\n` +
    `2️⃣ Connect your wallet at <a href="${WEBSITE_URL}/trade">budju.xyz/trade</a>\n` +
    `3️⃣ Deposit funds into the trading pool\n` +
    `4️⃣ The bot trades automatically — buy low, sell high!\n\n` +
    `<b>Features:</b>\n` +
    `• Fully automated — trades 24/7\n` +
    `• Very low risk DCA strategy\n` +
    `• Multi-asset support (BTC, ETH, SOL, XRP & more)\n` +
    `• Real-time trade notifications in this group\n` +
    `• Transparent — all trades visible on-chain\n\n` +
    `🚀 <a href="${WEBSITE_URL}/trade">Launch the Trading Bot</a>`;

  await sendMessage(chatId, msg);
}

async function handleBank(chatId: number) {
  const msg =
    `🏦 <b>Bank of BUDJU</b>\n\n` +
    `The Bank of BUDJU is the project's treasury and financial backbone.\n\n` +
    `<b>What it does:</b>\n` +
    `• Holds project funds securely\n` +
    `• Supports the BUDJU ecosystem\n` +
    `• Provides transparency on holdings\n` +
    `• Funds development and marketing\n\n` +
    `🌐 <a href="${WEBSITE_URL}/bank">View the Bank</a>`;

  await sendMessage(chatId, msg);
}

async function handleBurn(chatId: number) {
  const msg =
    `🔥 <b>BUDJU Token Burns</b>\n\n` +
    `BUDJU regularly <b>burns tokens</b> to permanently reduce the total supply.\n\n` +
    `<b>Why burns matter:</b>\n` +
    `• Less supply = more scarcity\n` +
    `• More scarcity = potential value increase\n` +
    `• Burns are permanent and verifiable on-chain\n` +
    `• Shows commitment to long-term value\n\n` +
    `<b>How to verify:</b>\n` +
    `Check the burn address on <a href="https://solscan.io/token/${TOKEN_ADDRESS}">Solscan</a>\n\n` +
    `🔥 <a href="${WEBSITE_URL}/burn">View Burn History</a>`;

  await sendMessage(chatId, msg);
}

async function handleNft(chatId: number) {
  const msg =
    `🖼 <b>BUDJU NFT Collection</b>\n\n` +
    `BUDJU has an exclusive <b>NFT collection</b> on Solana!\n\n` +
    `<b>Collection highlights:</b>\n` +
    `• Unique BUDJU-themed digital art\n` +
    `• Collectible & tradeable on Solana\n` +
    `• 2nd Gen NFTs coming in Phase 2\n` +
    `• Community-driven artwork\n\n` +
    `🖼 <a href="${WEBSITE_URL}/nft">Browse the Collection</a>`;

  await sendMessage(chatId, msg);
}

async function handleShop(chatId: number) {
  const msg =
    `🛍 <b>Shop of BUDJU's</b>\n\n` +
    `Rep your favourite meme coin with BUDJU merch!\n\n` +
    `<b>What's available:</b>\n` +
    `• BUDJU branded merchandise\n` +
    `• Community exclusives\n` +
    `• More items being added regularly\n\n` +
    `🛍 <a href="${WEBSITE_URL}/shop">Visit the Shop</a>`;

  await sendMessage(chatId, msg);
}

async function handlePool(chatId: number) {
  const msg =
    `🌊 <b>BUDJU Liquidity Pool</b>\n\n` +
    `BUDJU has an active liquidity pool on <b>Raydium</b>.\n\n` +
    `<b>Pool details:</b>\n` +
    `• Pair: BUDJU / SOL\n` +
    `• DEX: Raydium (Solana)\n` +
    `• Low slippage trading\n\n` +
    `<b>Trade here:</b>\n` +
    `🔄 <a href="https://raydium.io/swap/?inputMint=sol&outputMint=${TOKEN_ADDRESS}">Raydium</a>\n` +
    `🪐 <a href="https://jup.ag/swap/SOL-${TOKEN_ADDRESS}">Jupiter</a>\n\n` +
    `🌊 <a href="${WEBSITE_URL}/pool">View Pool Info</a>`;

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

// ── Natural language Q&A (keyword fallback) ─────────────────────────────
function handleQuestionKeyword(text: string): string | null {
  const lower = text.toLowerCase();

  // Price questions — defer to /price handler
  if (lower.match(/\b(price|worth|cost|how much)\b/)) return null;

  // Roadmap — defer to /roadmap handler
  if (lower.match(/\b(roadmap|plan|future|phases?)\b/)) return null;

  // Greeting
  if (lower.match(/^(hi|hello|hey|gm|good morning|yo|sup|wagmi)\b/))
    return (
      `👋 Hey there! Welcome to <b>BUDJU</b>!\n\n` +
      `Type /menu for quick buttons, or just ask me anything about BUDJU! 🐸`
    );

  return null;
}

// ── Auto-moderation ─────────────────────────────────────────────────────
const BANNED_WORDS = [
  "fuck", "fucker", "fucking", "fck", "f\\*ck", "fuk",
  "shit", "shitter", "sh1t", "sht",
  "bitch", "b1tch", "btch",
  "asshole", "a\\$\\$hole", "arsehole",
  "cunt", "c\\*nt",
  "dick", "d1ck",
  "bastard", "bstrd",
  "wanker", "twat", "prick",
  "nigger", "n1gger", "nigga", "n1gga",
  "faggot", "fag", "f4g",
  "retard", "retarded",
  "stfu", "gtfo", "kys",
];

// Build a single regex from the word list (word boundaries, case-insensitive)
const PROFANITY_RE = new RegExp(
  `\\b(${BANNED_WORDS.join("|")})\\b`,
  "i",
);

async function deleteMessage(chatId: number, messageId: number) {
  return fetch(`${TELEGRAM_API}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}

async function restrictUser(chatId: number, userId: number, durationSeconds: number) {
  const untilDate = Math.floor(Date.now() / 1000) + durationSeconds;
  return fetch(`${TELEGRAM_API}/restrictChatMember`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      user_id: userId,
      until_date: untilDate,
      permissions: {
        can_send_messages: false,
        can_send_audios: false,
        can_send_documents: false,
        can_send_photos: false,
        can_send_videos: false,
        can_send_video_notes: false,
        can_send_voice_notes: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false,
      },
    }),
  });
}

/** Returns true if the message was flagged and handled. */
async function moderateMessage(
  chatId: number,
  messageId: number,
  userId: number,
  firstName: string,
  text: string,
): Promise<boolean> {
  if (!PROFANITY_RE.test(text)) return false;

  // Delete the offending message
  await deleteMessage(chatId, messageId);

  // Restrict user for 5 minutes
  const TIMEOUT_SECONDS = 5 * 60;
  await restrictUser(chatId, userId, TIMEOUT_SECONDS);

  // Send a warning
  await sendMessage(
    chatId,
    `⚠️ <b>${firstName}</b> has been muted for 5 minutes.\n\n` +
    `Please keep the chat respectful. This is a friendly community! 🐸`,
  );

  return true;
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

// ── Callback query dispatcher ───────────────────────────────────────────
async function handleCallbackQuery(chatId: number, callbackData: string) {
  switch (callbackData) {
    case "cmd_price": await handlePrice(chatId); break;
    case "cmd_chart": await handleChart(chatId); break;
    case "cmd_buy": await handleBuy(chatId); break;
    case "cmd_info": await handleInfo(chatId); break;
    case "cmd_contract": await handleContract(chatId); break;
    case "cmd_tokenomics": await handleTokenomics(chatId); break;
    case "cmd_bot": await handleBot(chatId); break;
    case "cmd_bank": await handleBank(chatId); break;
    case "cmd_burn": await handleBurn(chatId); break;
    case "cmd_nft": await handleNft(chatId); break;
    case "cmd_shop": await handleShop(chatId); break;
    case "cmd_pool": await handlePool(chatId); break;
    case "cmd_roadmap": await handleRoadmap(chatId); break;
    case "cmd_socials": await handleSocials(chatId); break;
    case "cmd_website": await handleWebsite(chatId); break;
    case "cmd_menu": await handleMenu(chatId); break;
  }
}

// ── Webhook handler ─────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow GET for health-check / webhook setup
  if (req.method === "GET") {
    const action = req.query.action as string | undefined;

    // Set webhook: GET /api/telegram?action=setWebhook&host=budju.xyz
    if (action === "setWebhook") {
      const host = req.query.host || req.headers.host;
      const webhookUrl = `https://${host}/api/telegram`;
      const result = await fetch(
        `${TELEGRAM_API}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
      );
      const data = await result.json();
      return res.status(200).json({ ok: true, webhook: webhookUrl, telegram: data });
    }

    // Register bot commands with Telegram: GET /api/telegram?action=setCommands
    if (action === "setCommands") {
      const commands = [
        { command: "menu", description: "Interactive button menu" },
        { command: "price", description: "Current BUDJU price & stats" },
        { command: "chart", description: "Live chart links" },
        { command: "buy", description: "How to buy BUDJU" },
        { command: "contract", description: "Contract address (tap to copy)" },
        { command: "info", description: "About BUDJU coin" },
        { command: "tokenomics", description: "Token supply & distribution" },
        { command: "roadmap", description: "Project roadmap" },
        { command: "socials", description: "All social media links" },
        { command: "bot", description: "Trading bot info" },
        { command: "bank", description: "Bank of BUDJU" },
        { command: "burn", description: "Token burn info" },
        { command: "nft", description: "NFT collection" },
        { command: "shop", description: "Shop of BUDJU's" },
        { command: "pool", description: "Liquidity pool info" },
        { command: "promo", description: "See a promotional image" },
        { command: "website", description: "Visit budjucoin.com" },
        { command: "help", description: "All commands & help" },
      ];
      const result = await fetch(`${TELEGRAM_API}/setMyCommands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commands }),
      });
      const data = await result.json();
      return res.status(200).json({ ok: true, action: "setCommands", telegram: data });
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

    // ── Handle callback queries (inline button taps) ──────────────────
    if (update.callback_query) {
      const cbq = update.callback_query;
      const chatId = cbq.message?.chat?.id;
      const callbackData = cbq.data;

      // Acknowledge the button press immediately
      await answerCallbackQuery(cbq.id);

      if (chatId && callbackData) {
        await handleCallbackQuery(chatId, callbackData);
      }
      return res.status(200).json({ ok: true });
    }

    // ── New member joined ─────────────────────────────────────────────
    if (update.message?.new_chat_members) {
      for (const member of update.message.new_chat_members) {
        if (member.is_bot) continue;
        const name = member.first_name || "friend";
        const chatId = update.message.chat.id;

        const welcome =
          `🐸 <b>Welcome to BUDJU, ${name}!</b>\n\n` +
          `We're stoked you're here! BUDJU is a Solana meme coin with a built-in DCA Trading Bot.\n\n` +
          `Here's what we're all about:` +
          `\n🤖 Automated DCA Trading Bot — hold 10M BUDJU to unlock` +
          `\n🔥 Regular token burns — deflation is real` +
          `\n🏦 Bank of BUDJU ecosystem` +
          `\n🖼 NFT Collection` +
          `\n🛍 Shop of BUDJU's\n\n` +
          `👇 Tap the buttons below to explore, or just ask me anything!`;

        const keyboard = [
          [
            { text: "🐸 Menu", callback_data: "cmd_menu" },
            { text: "💰 Price", callback_data: "cmd_price" },
            { text: "🛒 How to Buy", callback_data: "cmd_buy" },
          ],
          [
            { text: "🤖 Trading Bot", callback_data: "cmd_bot" },
            { text: "📱 Socials", callback_data: "cmd_socials" },
            { text: "🗺 Roadmap", callback_data: "cmd_roadmap" },
          ],
        ];

        await sendMessageWithKeyboard(chatId, welcome, keyboard);
      }
      return res.status(200).json({ ok: true });
    }

    // ── Handle text messages ──────────────────────────────────────────
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const isGroupChat = update.message.chat.type === "supergroup" || update.message.chat.type === "group";

      // Auto-moderate: check for profanity in group chats
      if (isGroupChat) {
        const flagged = await moderateMessage(
          chatId,
          update.message.message_id,
          update.message.from.id,
          update.message.from.first_name || "User",
          text,
        );
        if (flagged) return res.status(200).json({ ok: true, moderated: true });
      }

      const isCommand = text.startsWith("/");

      if (isCommand) {
        const command = text.split(" ")[0].split("@")[0].toLowerCase();
        switch (command) {
          case "/start":
          case "/help":
            await handleHelp(chatId);
            break;
          case "/menu":
            await handleMenu(chatId);
            break;
          case "/price":
            await handlePrice(chatId);
            break;
          case "/chart":
            await handleChart(chatId);
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
          case "/tokenomics":
            await handleTokenomics(chatId);
            break;
          case "/roadmap":
            await handleRoadmap(chatId);
            break;
          case "/socials":
            await handleSocials(chatId);
            break;
          case "/bot":
            await handleBot(chatId);
            break;
          case "/bank":
            await handleBank(chatId);
            break;
          case "/burn":
            await handleBurn(chatId);
            break;
          case "/nft":
            await handleNft(chatId);
            break;
          case "/shop":
            await handleShop(chatId);
            break;
          case "/pool":
            await handlePool(chatId);
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
              `🤔 Unknown command. Type /help to see all commands or /menu for quick buttons!`,
            );
        }
      } else {
        // ── Natural language handling ────────────────────────────────
        // First: check keyword shortcuts
        const keywordAnswer = handleQuestionKeyword(text);
        if (keywordAnswer) {
          await sendMessage(chatId, keywordAnswer);
        }
        // Price-related questions → show price
        else if (text.toLowerCase().match(/\b(price|how much|market cap|volume)\b/)) {
          await handlePrice(chatId);
        }
        // Roadmap questions → show roadmap
        else if (text.toLowerCase().match(/\b(roadmap|plan|phases?)\b/)) {
          await handleRoadmap(chatId);
        }
        // AI Q&A: try Claude for everything else
        else {
          // In group chats, only respond to messages that mention budju or look like questions
          const isMentionOrQuestion =
            text.toLowerCase().includes("budju") ||
            text.includes("?") ||
            text.toLowerCase().match(/\b(what|how|where|when|why|who|can|does|is|are|will|should)\b/);

          if (!isGroupChat || isMentionOrQuestion) {
            const aiAnswer = await askClaude(text);
            if (aiAnswer) {
              await sendMessage(chatId, aiAnswer);
            } else if (!isGroupChat) {
              // Private chat fallback
              await sendMessage(
                chatId,
                `🐸 I'm the BUDJU bot! Type /menu for quick buttons, /help for all commands, or just ask me anything about BUDJU!`,
              );
            }
          }
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
