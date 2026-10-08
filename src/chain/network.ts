import { defineChain } from "viem";
import { CHAIN_ID } from "../addresses.js";

export function robinhoodChain(httpUrl: string, wsUrl: string) {
  return defineChain({
    id: CHAIN_ID,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: {
        http: [httpUrl],
        webSocket: wsUrl ? [wsUrl] : undefined,
      },
    },
    blockExplorers: {
      default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
    },
  });
}
