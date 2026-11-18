// Webhooks for new jobs (BaseCity plan item 9): URL guard, skill match, HMAC.
import { createHmac } from "node:crypto";
import { sign, wants, webhookUrlProblem } from "../src/lib/job-webhooks";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

(async () => {
  check("public https host accepted", webhookUrlProblem("https://basecity.space/hooks/jobs") === null);
  check("http refused", webhookUrlProblem("http://basecity.space/x") !== null);
  check("localhost refused", webhookUrlProblem("https://localhost/x") !== null);
  check("private range refused", webhookUrlProblem("https://10.0.0.5/x") !== null);
  check("metadata IP refused", webhookUrlProblem("https://169.254.169.254/latest") !== null);
  check("public IP literal refused", webhookUrlProblem("https://8.8.8.8/x") !== null);
  check(".internal refused", webhookUrlProblem("https://db.internal/x") !== null);
  check("non-string refused", webhookUrlProblem(42) !== null);
  check("no skills = every job", wants({ skills: [] }, null) && wants({ skills: [] }, "stock-nav-premium"));
  check("skill filter matches", wants({ skills: ["stock-nav-premium"] }, "stock-nav-premium") && !wants({ skills: ["stock-nav-premium"] }, "stock-weekend-gap") && !wants({ skills: ["stock-nav-premium"] }, null));
  check("disabled never fires", !wants({ skills: [], disabled: true }, null));
  const body = '{"event":"job.created"}';
  check("signature is standard HMAC-SHA256 hex", (await sign("s3cret", body)) === `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`);
  console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
  process.exit(failed ? 1 : 0);
})();
