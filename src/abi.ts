import { parseAbi, parseAbiItem } from "viem";

/**
 * Read-only fragments. This module has no launch, swap, bundle, or liquidity
 * write, so nothing built on it can submit a transaction.
 */
export const tokenLaunchedEvent = parseAbiItem(
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
);
export const launchSweptEvent = parseAbiItem(
  "event LaunchSwept(address indexed token, uint256 quoteOut, uint256 tokenOut)",
);
export const poolGraduatedEvent = parseAbiItem(
  "event PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount)",
);
export const curveBuyEvent = parseAbiItem(
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
);
export const curveSellEvent = parseAbiItem(
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
);

export const tokenCreatedEvent = parseAbiItem(
  "event TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)",
);
export const launchedToDexEvent = parseAbiItem(
  "event LaunchedToDEX(address token, address pool, uint256 amount, uint256 eth)",
);
export const flapProgressEvent = parseAbiItem(
  "event FlapTokenProgressChanged(address token, uint256 newProgress)",
);
export const tokenBoughtEvent = parseAbiItem(
  "event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
);
export const tokenSoldEvent = parseAbiItem(
  "event TokenSold(uint256 ts, address token, address seller, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
);
export const flapTaxEvent = parseAbiItem("event FlapTokenTaxSet(address token, uint256 tax)");
export const flapAsymmetricTaxEvent = parseAbiItem(
  "event FlapTokenAsymmetricTaxSet(address token, uint256 buyTax, uint256 sellTax)",
);
export const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export const factoryAbi = parseAbi([
  "function getLaunchedToken(address token) view returns ((address token, address curve, address deployer, address creatorFeeRecipient, address pairToken, uint256 graduationThreshold, uint24 poolFee, int24 tickSpacing, uint16 creatorTaxBps, bool buybackEnabled, uint8 phase, uint256 sweptQuote, uint256 sweptTokens, uint256 sweptAt, bool exists))",
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
  "event LaunchSwept(address indexed token, uint256 quoteOut, uint256 tokenOut)",
  "event PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount)",
]);

export const curveAbi = parseAbi([
  "function realQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function graduated() view returns (bool)",
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
]);

export const portalAbi = parseAbi([
  "function getTokenV7(address token) view returns (uint8 status, uint256 reserve, uint256 circulatingSupply, uint256 price, uint8 tokenVersion, uint256 r, uint256 h, uint256 k, uint256 dexSupplyThresh, address quoteTokenAddress, bool nativeToQuoteSwapEnabled, bytes32 extensionID, uint256 taxRate, address pool, uint256 progress, uint8 lpFeeProfile)",
  "function getTokenV8Safe(address token) view returns (uint8 status, uint256 reserve, uint256 circulatingSupply, uint256 price, uint8 tokenVersion, uint256 r, uint256 h, uint256 k, uint256 dexSupplyThresh, address quoteTokenAddress, bool nativeToQuoteSwapEnabled, bytes32 extensionID, uint256 buyTaxRate, uint256 sellTaxRate, address pool, uint256 progress, uint8 lpFeeProfile, uint8 dexId)",
  "event TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)",
  "event LaunchedToDEX(address token, address pool, uint256 amount, uint256 eth)",
  "event FlapTokenProgressChanged(address token, uint256 newProgress)",
  "event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  "event TokenSold(uint256 ts, address token, address seller, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)",
  "event FlapTokenTaxSet(address token, uint256 tax)",
  "event FlapTokenAsymmetricTaxSet(address token, uint256 buyTax, uint256 sellTax)",
]);

export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
