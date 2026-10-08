import assert from "node:assert/strict";
import test from "node:test";
import { decodeEventLog, encodeAbiParameters, encodeEventTopics, keccak256, toBytes, type Hex } from "viem";
import { factoryAbi, portalAbi } from "../src/abi.js";
import { FLAP_PORTAL, LOCKER_ADDRESS, PONS_FACTORY } from "../src/addresses.js";

const token = "0x1111111111111111111111111111111111111111";
const curve = "0x2222222222222222222222222222222222222222";
const deployer = "0x3333333333333333333333333333333333333333";
const pairToken = "0x0000000000000000000000000000000000000000";

function asTopics(topics: readonly (Hex | readonly Hex[] | null | undefined)[]): [Hex, ...Hex[]] {
  const flat = topics.filter((topic): topic is Hex => typeof topic === "string");
  const [signature, ...rest] = flat;
  if (!signature) throw new Error("missing event topic");
  return [signature, ...rest];
}

test("Pons TokenLaunched matches the documented topic and round-trips", () => {
  assert.equal(PONS_FACTORY, "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e");
  assert.equal(LOCKER_ADDRESS, "0x267444d099b10fb5ed7c3cc7b7c767adca574952");
  const topics = encodeEventTopics({
    abi: factoryAbi,
    eventName: "TokenLaunched",
    args: { token, curve, deployer },
  });
  assert.equal(topics[0], keccak256(toBytes("TokenLaunched(address,address,address,address,uint256,uint256)")));
  assert.equal(topics[0]?.slice(0, 10), "0x8d4aad49");

  const data = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "uint256" }],
    [pairToken, 0n, 42n * 10n ** 17n],
  );
  const decoded = decodeEventLog({
    abi: factoryAbi,
    eventName: "TokenLaunched",
    topics: asTopics(topics),
    data,
  });
  assert.equal(decoded.args.token.toLowerCase(), token);
  assert.equal(decoded.args.curve.toLowerCase(), curve);
  assert.equal(decoded.args.deployer.toLowerCase(), deployer);
  assert.equal(decoded.args.pairToken.toLowerCase(), pairToken);
  assert.equal(decoded.args.graduationThreshold, 42n * 10n ** 17n);
});

test("Flap TokenCreated matches the documented topic and round-trips", () => {
  assert.equal(FLAP_PORTAL, "0x26605f322f7ff986f381bb9a6e3f5dab0beaeb09");
  const topics = encodeEventTopics({ abi: portalAbi, eventName: "TokenCreated" });
  assert.equal(topics.length, 1);
  assert.equal(topics[0], keccak256(toBytes("TokenCreated(uint256,address,uint256,address,string,string,string)")));
  const data = encodeAbiParameters(
    [
      { type: "uint256" },
      { type: "address" },
      { type: "uint256" },
      { type: "address" },
      { type: "string" },
      { type: "string" },
      { type: "string" },
    ],
    [1_700_000_000n, deployer, 7n, token, "Radar", "RDR", "ipfs://meta"],
  );
  const decoded = decodeEventLog({
    abi: portalAbi,
    eventName: "TokenCreated",
    topics: asTopics(topics),
    data,
  });
  assert.equal(decoded.args.creator.toLowerCase(), deployer);
  assert.equal(decoded.args.token.toLowerCase(), token);
  assert.equal(decoded.args.nonce, 7n);
  assert.equal(decoded.args.name, "Radar");
  assert.equal(decoded.args.symbol, "RDR");
  assert.equal(decoded.args.meta, "ipfs://meta");
});
