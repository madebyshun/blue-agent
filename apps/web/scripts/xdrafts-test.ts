/** X drafts: the copy linter and the slot schedule (lib/xdrafts/compose.ts). No network. */
import { lint, telegramText } from "../src/lib/xdrafts/compose";
let failed = 0, passed = 0;
const check = (n: string, ok: boolean) => { if (ok) { passed++; console.log(`  PASS  ${n}`); } else { failed++; console.log(`  FAIL  ${n}`); } };
check("an em dash is flagged", lint("Base — stocks").includes("em dash"));
check("a chain id in copy is flagged", lint("on base 8453").some((p) => p.startsWith("chain id")));
check("over 700 characters is flagged", lint("x".repeat(701)).some((p) => p.includes("701")));
check("clean copy passes", lint("pre-open on base. nvdac is 0.28% below its feed.").length === 0);
check("uppercase, emoji, cashtag and link are flagged", lint("Pre-open").includes("not all lowercase") && lint("x 🚨").includes("emoji") && lint("buy $nvda").some((p) => p.includes("cashtag")) && lint("see https://x.com").some((p) => p.includes("link")));
const msg = telegramText({ kind: "pre-open", text: "a < b & c", shot: "https://app.blueagent.dev/markets/drift", tag: "none", problems: [] }, new Date("2026-11-12T13:00:00Z"));
check("telegram text escapes HTML", msg.includes("a &lt; b &amp; c") && msg.includes("<pre>"));
check("telegram text says nothing is posted", /by hand/.test(msg));
const err = telegramText({ kind: "yesterday", error: "archive miss" }, new Date());
check("a failed draft says so instead of sending a post", /Not composed/.test(err) && !/<pre>/.test(err));
console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
process.exit(failed ? 1 : 0);
