/** Robinhood Chain, the live Pons V2 factory, and the Flap portal this radar reads. */
export const CHAIN_ID = 4663;

export const PONS_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
export const FLAP_PORTAL = "0x26605f322f7ff986f381bb9a6e3f5dab0beaeb09";
export const LOCKER_ADDRESS = "0x267444d099b10fb5ed7c3cc7b7c767adca574952";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

/** Flap TokenStatus.DEX. A token in this status has left the curve. */
export const FLAP_DEX_STATUS = 4;

export const BLOCKSCOUT_ORIGIN = "https://robinhoodchain.blockscout.com";
export const BLOCKSCOUT_API = `${BLOCKSCOUT_ORIGIN}/api/v2`;

export function lower(address: string): string {
  return address.toLowerCase();
}

export function sameAddress(left: string, right: string): boolean {
  return lower(left) === lower(right);
}

export function isZeroAddress(address: string): boolean {
  return lower(address) === ZERO_ADDRESS;
}

export function tokenUrl(token: string): string {
  return `${BLOCKSCOUT_ORIGIN}/token/${token}`;
}

export function addressUrl(account: string): string {
  return `${BLOCKSCOUT_ORIGIN}/address/${account}`;
}
