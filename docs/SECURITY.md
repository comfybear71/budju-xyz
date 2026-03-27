# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in BUDJU, please report it responsibly.

**DO NOT** open a public GitHub issue for security vulnerabilities.

### How to Report

1. Email: Send details to the project maintainer via the contact information on [budju.xyz](https://budju.xyz)
2. Include:
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
- Authentication and authorization (Ed25519 signature verification)
- Auto-trading logic (`api/auto-trade-cron.py`)
- Database access patterns
- Frontend wallet integration

The following are out of scope:
- Third-party services (Swyftx, CoinGecko, Helius, Vercel)
- Solana blockchain protocol itself
- Social engineering attacks

## Security Measures

- Admin endpoints require Ed25519 wallet signature verification
- Message timestamps with 5-minute replay window + nonce deduplication
- Rate limiting: 30 req/min (read), 10 req/min (write) per IP
- CORS restricted to approved origins
- Emergency trading kill-switch via `TRADING_ENABLED` environment variable
- Cron job authentication via bearer token
