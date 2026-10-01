/**
 * chat-github-context-test — the pure parts of lib/chat/github-context.ts:
 * which URL is a repository, when a message asks for a code review, and which
 * files a review reads first. Hermetic: no network.
 */
import { repoSlugIn, wantsCodeReview, pickReviewFiles } from "../src/lib/chat/github-context";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

console.log("repoSlugIn");
ok("plain repo URL", repoSlugIn("blue audit https://github.com/madebyshun/mbs-skills") === "madebyshun/mbs-skills");
ok("URL with a path keeps owner/repo", repoSlugIn("see https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Pair.sol") === "Uniswap/v2-core");
ok(".git suffix stripped", repoSlugIn("https://github.com/a/b.git") === "a/b");
ok("no URL → null", repoSlugIn("audit my contract please") === null);
ok("a non-GitHub host → null", repoSlugIn("https://gitlab.com/a/b") === null);
ok("a lookalike host → null", repoSlugIn("https://github.com.evil.io/a/b") === null);

console.log("wantsCodeReview");
ok("audit", wantsCodeReview("blue audit https://github.com/a/b"));
ok("review", wantsCodeReview("can you review this repo"));
ok("Vietnamese", wantsCodeReview("kiểm tra repo này"));
ok("a bare link is not a review", !wantsCodeReview("what is https://github.com/a/b"));

console.log("pickReviewFiles");
const picked = pickReviewFiles([
  "README.md", "package.json", "contracts/Vault.sol", "contracts/test/Vault.t.sol", "test/Vault.t.sol",
  "lib/forge-std/src/Test.sol", "node_modules/x/y.sol", "src/Token.sol", "script/Deploy.s.sol",
  "docs/a.md", "src/index.ts",
]);
ok("contracts first", picked[0] === "src/Token.sol" || picked[0] === "contracts/Vault.sol", picked.join(","));
ok("tests and scripts excluded", !picked.some((p) => /test|script/i.test(p)));
ok("vendored libs excluded", !picked.some((p) => p.startsWith("lib/") || p.startsWith("node_modules/")));
ok("manifest and README after contracts", picked.indexOf("package.json") > picked.indexOf("contracts/Vault.sol"));
ok("capped at 6", picked.length <= 6);
ok("docs never read", !picked.includes("docs/a.md"));
const withIfaces = pickReviewFiles(["contracts/interfaces/IPair.sol", "contracts/Pair.sol"]);
ok("logic before interfaces", withIfaces[0] === "contracts/Pair.sol", withIfaces.join(","));

console.log(failures === 0 ? "\nchat-github-context-test: PASS" : `\nchat-github-context-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
