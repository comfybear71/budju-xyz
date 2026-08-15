# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in BUDJU, please report it responsibly.

**DO NOT** open a public GitHub issue for security vulnerabilities.

### How to Report

1. Email: [support@budjucoin.com](mailto:support@budjucoin.com) or [sfrench71@me.com](mailto:sfrench71@me.com)
2. Machine-readable contact: [https://www.budju.xyz/.well-known/security.txt](https://www.budju.xyz/.well-known/security.txt)
3. Public policy page: [https://www.budju.xyz/security](https://www.budju.xyz/security)
4. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- Acknowledgment within 48 hours
- Status update within 7 days
- We will work with you to understand and address the issue before any public disclosure

### Scope

The following are in scope:
- API endpoints (`api/`)
- Authentication and authorization
- Auto-trading logic (`api/auto-trade-cron.py`)
- Database access patterns
- Frontend wallet integration

The following are out of scope:
- Third-party services (Swyftx, CoinGecko, Helius, Vercel, Jupiter)
- Solana blockchain protocol itself
- Social engineering attacks

## Security Measures

- Rate limiting: 30 req/min (read), 10 req/min (write) per IP on main API
- CORS restricted to approved origins (`budju.xyz`, `www.budju.xyz`, localhost)
- Emergency trading kill-switch via `TRADING_ENABLED` environment variable
- Cron job authentication via bearer token
- On-chain swaps use official Jupiter Swap APIs only (no custom drain programs)

## Wallet / Blowfish reviewers

Technical package and follow-up email drafts: [`docs/BLOWFISH_WHITELIST.md`](./BLOWFISH_WHITELIST.md)
