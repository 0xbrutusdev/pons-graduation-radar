# Graduation radar

Read-only board for Pons V2 and Flap curves on Robinhood Chain (chain id `4663`). It watches launches, counts unique buyers, and scores how concentrated the supply is. It does not submit launches, bundles, or swaps.

The page polls this process. It does not embed an RPC key. Creator survival is computed here because it needs every prior launch, not just the curve a browser can read.

## Run

Node 22.13 or newer.

```bash
cp .env.example .env
npm install
npm start
```

Open `http://localhost:8788`. Set `ALCHEMY_HTTP_URL` to a Robinhood Chain Alchemy endpoint. `ALCHEMY_WS_URL` is optional; without it the indexer polls over HTTP. `FROM_BLOCK` overrides the default lookback of about 24 hours. The database is `data/radar.sqlite`.

`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` send one message per token at 70%, 90%, and 100% progress. `DISCORD_WEBHOOK_URL` is optional. If neither is set, the message is only logged.

## What it reads

Pons factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`:

- `TokenLaunched` opens the row. The deployer is the creator.
- Progress is `realQuoteReserve / graduationThreshold`. The phantom quote inside `getReserves()` is not treated as ETH raised.
- `LaunchSwept` then `PoolGraduated` mark the move into the locked Uniswap v4 position.
- Unique buyers are distinct `CurveBuy.buyer` addresses.

Flap portal `0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09`. `TokenCreated` and `LaunchedToDEX` are accepted only from this proxy, because other launchpads emit the same names.

- Progress is `getTokenV7(token).progress / 1e18`. If that call reverts, the indexer tries `getTokenV8Safe`. Status `DEX` (4) means graduated.
- `TokenBought` and `TokenSold` supply unique buyers and creator sells. Buys are kept only for tokens this portal created.
- On this chain the graduated pool is a Uniswap v2 pair.

Holder concentration excludes the curve or portal, the pool or Pons locker `0x267444d099b10fb5ed7c3cc7b7c767adca574952`, and the zero and dead addresses.

## Safety

The score starts at 100. Weights live in the environment.

- Top 10 share of circulating supply: no cut at or below 35%, up to 40 points by 80%.
- Unique buyers: no cut at 20 or more, up to 20 points as the count falls to 0.
- Creator history: at least 3 prior launches and a 24-hour survival rate under 30%, up to 25 points.
- Flap tax above 0: 10 points. Flap creator still holding the v2 LP token: 15 points. Pons does not take the LP cut.

The board sorts by progress, then unique buyers, then safety. Clean first keeps tokens already at 70% or more and sorts those by safety.

After graduation the indexer snapshots DexScreener liquidity and the creator's token balance, then checks again at 24 hours and 7 days. Liquidity stayed when the pair still exists and USD liquidity is at least half of that first reading. The creator sold when their balance fell by 10% or more, or a curve sell, portal sell, or transfer into the pool came from them. A window is survived only when liquidity stayed and the creator did not sell.

## API

- `GET /api/radar?venue=&minProgress=&sort=`
- `GET /api/tokens/:token`
- `GET /api/creators/:address`

`minProgress` is a fraction, or a percent when the value is above 1. `sort=clean` is the clean-first board. `venue` is `pons` or `flap`.
