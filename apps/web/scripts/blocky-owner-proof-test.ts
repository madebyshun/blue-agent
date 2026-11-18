// Blocky link by owner signature (BaseCity rule b): shape + EIP-712 round trip.
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { verifyTypedData } from "viem";
import { proofLists } from "../src/lib/agent-ledger";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

const domain = { name: "BaseCity Agent Link", version: "1", chainId: 8453 } as const;
const types = { AgentLink: [{ name: "owner", type: "address" }, { name: "links", type: "Pair[]" }, { name: "issuedAt", type: "string" }], Pair: [{ name: "blocky", type: "uint256" }, { name: "agentId", type: "uint256" }] } as const;

(async () => {
  // Throwaway key generated in-process, only to prove the typed-data shape round-trips.
  const acct = privateKeyToAccount(generatePrivateKey());
  const links = [{ blocky: 718n, agentId: 1205445n }, { blocky: 101n, agentId: 7n }];
  const issuedAt = "2026-11-18T12:00:00Z";
  const signature = await acct.signTypedData({ domain, types, primaryType: "AgentLink", message: { owner: acct.address, links, issuedAt } });
  const proof = { owner: acct.address, links: links.map((l) => ({ blocky: Number(l.blocky), agentId: Number(l.agentId) })), issuedAt, signature };

  check("proof lists Blocky 718 → agent 1205445", proofLists(proof, "718", "1205445"));
  check("proof does not list a pair it lacks", !proofLists(proof, "718", "7"));
  check("malformed proof refused", !proofLists({ owner: "x", links: [], issuedAt, signature }, "718", "1205445") && !proofLists(null, "718", "1205445"));
  const verify = (m: typeof proof) => verifyTypedData({ address: acct.address, domain, types, primaryType: "AgentLink", message: { owner: m.owner as `0x${string}`, links: m.links.map((l) => ({ blocky: BigInt(l.blocky), agentId: BigInt(l.agentId) })), issuedAt: m.issuedAt }, signature: m.signature as `0x${string}` });
  check("EIP-712 signature verifies as BaseCity describes it", await verify(proof));
  check("adding a link breaks the signature", !(await verify({ ...proof, links: [...proof.links, { blocky: 5, agentId: 9 }] })));
  console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
  process.exit(failed ? 1 : 0);
})();
