// Signed job posts (BaseCity plan item 6): the message binds every field.
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { verifyMessage } from "viem";
import { jobPostMessage } from "../src/lib/jobs";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

(async () => {
  const f = { title: "NAV premium for NVDA on Base", brief: "Base 8453 only, token 0xb2.", budgetUnits: 500_000, skill: "stock-nav-premium", token: "0xB20000000000000000000078ee7ce2fE4908108C", invitedAgentId: "1205445", issuedAt: "2026-11-18T10:00:00.000Z" };
  const m = await jobPostMessage(f);
  check("message starts with the versioned header", m.startsWith("Blue Agent job post v1\nDomain: blueagent.dev | Base 8453\n"));
  check("token is lowercased, invite and budget bound", m.includes("token: 0xb20000000000000000000078ee7ce2fe4908108c") && m.includes("invite: 1205445") && m.includes("budget: 500000 "));
  check("free-text job uses '-' placeholders", (await jobPostMessage({ ...f, skill: null, token: null, invitedAgentId: null })).includes("skill: -\ntoken: -\ninvite: -"));
  check("changing the budget changes the message", (await jobPostMessage({ ...f, budgetUnits: 600_000 })) !== m);
  check("changing the brief changes the message", (await jobPostMessage({ ...f, brief: f.brief + "x" })) !== m);
  // A throwaway key generated in-process, only to prove sign/verify round-trips.
  const acct = privateKeyToAccount(generatePrivateKey());
  const sig = await acct.signMessage({ message: m });
  check("EOA signature verifies against the message", await verifyMessage({ address: acct.address, message: m, signature: sig }));
  check("same signature fails for a different job", !(await verifyMessage({ address: acct.address, message: await jobPostMessage({ ...f, budgetUnits: 1 }), signature: sig })));
  console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
  process.exit(failed ? 1 : 0);
})();
