# run.pay SDK

Payment infrastructure for autonomous AI agents. Discover a service, get a quote, pay — via card, native crypto (USDC on Base), MPP, or XRPL. No accounts, no API keys, no subscriptions.

[![docs](https://img.shields.io/badge/docs-getrunpay.com-00e87a)](https://getrunpay.com/docs.html)

## Why

Most "agent payment" tooling assumes your agent already has a wallet, a funded account, and a protocol preference. run.pay assumes none of that — an agent describes what it needs, run.pay finds the best match across price/latency/reliability, and pays through whichever rail actually makes sense for the amount.

## Quick start — no crypto, no wallet

The simplest path. Your agent just needs a `run.pay` balance (funded once via card).

```bash
curl -X POST https://runpay-backend-visibility-production.up.railway.app/x402/SERVICE_ID \
  -H "x-agent-id: YOUR_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"your": "payload"}'
```

Find `SERVICE_ID` via [`GET /api/services/catalog`](https://getrunpay.com/docs.html#api-services).

## Native crypto (USDC on Base)

Standard x402 protocol, scheme `exact`. Your agent needs its own funded wallet — run.pay settles directly, no facilitator.

```js
import { privateKeyToAccount } from 'viem/accounts';
import { buildTransferAuthorization, signTransferAuthorization } from './x402-usdc-base.cjs';

const buyer = privateKeyToAccount(process.env.BUYER_PRIVATE_KEY);
const challenge = await fetch(`${BASE_URL}/x402-crypto/${serviceId}`, { method: 'POST', body: '{}' }).then(r => r.json());
const requirement = challenge.accepts[0];

const authorization = buildTransferAuthorization(buyer.address, requirement.payTo, parseFloat(requirement.amount) / 1e6, requirement.maxTimeoutSeconds);
const signed = await signTransferAuthorization(buyer, authorization, 'base_mainnet', requirement.extra, requirement.asset);
// retry the same request with the signed payload in PAYMENT-SIGNATURE
```

Full module: [`x402-usdc-base.cjs`](./x402-usdc-base.cjs).

## XRPL

Real settlement rail, tested end-to-end on testnet. One function call handles the whole flow — challenge, sign, submit, verify.

```js
const { payViaXrpl } = require('./runpay-xrpl-client.cjs');

const result = await payViaXrpl({
  serviceId: 'da3ddf15-34fa-4d1e-a5cb-a7d50a08f0fc',
  buyerWalletSeed: 'sEd...', // your own wallet, funded with real XRP
  requestBody: { mode: 'majority', votes: ['a', 'b', 'a'] },
});
```

Full module: [`runpay-xrpl-client.cjs`](./runpay-xrpl-client.cjs). Real (not simulated) transaction hash returned in `result._meta.tx_hash`.

> **Honest status:** mainnet activation pending on run.pay's side — this currently settles on XRPL testnet only.

## Spending controls (optional, recommended for production)

Before your agent ever spends anything, a human can cryptographically pre-authorize limits:

```bash
curl -X POST https://runpay-backend-visibility-production.up.railway.app/api/agents/mandates \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agt_yours",
    "signer_address": "0x...",
    "max_amount_per_call": 0.10,
    "max_total_amount": 5.00,
    "expires_at": 1893456000,
    "signature": "...",
    "nonce": "0x...",
    "wallet_secret": "wsec_..."
  }'
```

Every call this agent makes is checked against this mandate automatically — category, per-call limit, total budget, minimum vendor trust score.

## What's under the hood

- **Guard** — unified risk check (trust score + mandate + approval threshold) before any payment
- **Intent Firewall** — verifies an action actually matches what the agent declared it would do
- **Agent Passport** — identity, wallet, reputation, and mandate status in one call
- **Kill switch** — freeze a specific agent, vendor, or the whole platform instantly

Full breakdown: [getrunpay.com/agent-financial-infrastructure.html](https://getrunpay.com/agent-financial-infrastructure.html)

## Docs

Complete API reference: [getrunpay.com/docs.html](https://getrunpay.com/docs.html)

## License

MIT
