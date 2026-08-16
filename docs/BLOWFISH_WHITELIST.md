# Blowfish / Phantom whitelist package

Use this when `budju.xyz` / `www.budju.xyz` is flagged as malicious in Phantom
(Blowfish). You already emailed Blowfish and Phantom — send a **follow-up**
with accurate technical details after the legitimacy PR is live.

## Correct technical facts (do not say “Next.js”)

| Item | Value |
|------|--------|
| Domains | `https://budju.xyz`, `https://www.budju.xyz` (www preferred / canonical) |
| Stack | **Vite 6 + React 19 SPA** (TypeScript), Tailwind; **not** Next.js |
| Hosting | Vercel |
| GitHub | https://github.com/comfybear71/budju-xyz |
| Token mint | `2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump` |
| Solscan | https://solscan.io/token/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump |
| Wallets | Phantom, Solflare, Jupiter (Wallet Standard) |
| Swaps | Official Jupiter Swap API (`api.jup.ag` / `lite-api.jup.ag`) via `/api/jupiter` proxy |
| Custom programs | **None** for swap flow — no BUDJU-owned drain / upgradeable swap program |
| Perps | Paper / simulated perps in-product; not custodial live Jupiter Perps for user SOL |
| Terms | https://www.budju.xyz/terms |
| Privacy | https://www.budju.xyz/privacy |
| Security page | https://www.budju.xyz/security |
| security.txt | https://www.budju.xyz/.well-known/security.txt |
| Contact | support@budjucoin.com · sfrench71@me.com |
| Socials | https://x.com/budjucoin · http://t.me/budjucoingroup |

## What reviewers need beyond email

1. **Vouch** — Blowfish often asks an established Solana (or EVM) developer —
   not an influencer — to email `review@blowfish.xyz` or DM `@blowfishxyz` on X.
2. **Open source** — keep this repo linked in every follow-up.
3. **Clear metadata** — title, icon, OG tags, Terms/Privacy/Security, `security.txt`
   (shipped in the legitimacy PR).
4. Optional: open a false-positive issue on
   [blowfishxyz/blocklist](https://github.com/blowfishxyz/blocklist/issues) with
   the same package.

---

## Follow-up email to Blowfish (`review@blowfish.xyz`)

**Subject:** Follow-up — false positive whitelist request for budju.xyz / www.budju.xyz

```
Hello Blowfish / Phantom review team,

Thank you for looking at our earlier message. This is a follow-up with precise
technical details for a false-positive review of our domains.

Project: BUDJU
Domains: https://budju.xyz and https://www.budju.xyz
Category: Solana community / meme-coin site + Jupiter-powered swap UI + paper
trading tools

Why this is not a malicious dApp:
- We do not deploy or invoke a custom “drain” Solana program for swaps.
- Swap transactions are built from official Jupiter Swap APIs
  (api.jup.ag / lite-api.jup.ag), proxied through our Vercel function /api/jupiter.
- Users connect Phantom / Solflare / Jupiter and must approve every transaction
  in-wallet.
- Frontend is an open-source Vite + React SPA (not Next.js):
  https://github.com/comfybear71/budju-xyz
- SPL mint (verified on explorers):
  2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump
  https://solscan.io/token/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump

Legitimacy / disclosure surfaces (live after deploy):
- Terms: https://www.budju.xyz/terms
- Privacy: https://www.budju.xyz/privacy
- Security: https://www.budju.xyz/security
- security.txt: https://www.budju.xyz/.well-known/security.txt

Contacts: support@budjucoin.com · sfrench71@me.com
Socials: https://x.com/budjucoin · http://t.me/budjucoingroup

Please allowlist budju.xyz and www.budju.xyz (and let us know if you need a
specific transaction signature sample from production). Happy to arrange a
voucher from an established Solana developer if that is required.

Thank you,
Stuart French
BUDJU
```

---

## Short note to Phantom support (if they reply)

```
Following up on our whitelist request for budju.xyz / www.budju.xyz.

Blowfish/Phantom flags appear to be a false positive. We use official Jupiter
Swap APIs only (no custom drain program). Source:
https://github.com/comfybear71/budju-xyz

Disclosure: https://www.budju.xyz/.well-known/security.txt
Security page: https://www.budju.xyz/security
Terms: https://www.budju.xyz/terms

We have also written to review@blowfish.xyz with the full technical package.
```

---

## Checklist after merge + Vercel deploy

- [ ] `curl -sI https://www.budju.xyz/.well-known/security.txt` → `200` and `text/plain`
- [ ] Terms / Privacy / Security pages load (not SPA 404)
- [ ] Site title/icon look correct when connecting Phantom
- [ ] Send Blowfish follow-up with the draft above
- [ ] Ask a known Solana builder to vouch via email or `@blowfishxyz` DM
