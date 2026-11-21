/** ERC-8021 Builder Code calldata suffix tests (lib/builder-code.ts). No network. */
import { DATA_SUFFIX } from "../src/constants/builderCode";
import { appendBuilderCode, buildAttributedSwapTx } from "../src/lib/builder-code";

let failed = 0, passed = 0;
const check = (name: string, ok: boolean) => {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`); }
};

const sampleCalldata = "0xa9059cbb0000000000000000000000001111111111111111111111111111111111111111" as const;
const rawSuffix = DATA_SUFFIX.slice(2).toLowerCase();

const baseTagged = appendBuilderCode(sampleCalldata, { chainId: 8453 });
check("appends DATA_SUFFIX on Base 8453", baseTagged !== sampleCalldata && baseTagged.toLowerCase().endsWith(rawSuffix));

const idempotent = appendBuilderCode(baseTagged, { chainId: 8453 });
check("does not double-append when suffix is already present", idempotent === baseTagged);

const rhUntouched = appendBuilderCode(sampleCalldata, { chainId: 4663 });
check("leaves Robinhood Chain 4663 calldata untouched", rhUntouched === sampleCalldata);

const emptyUntouched = appendBuilderCode("0x", { chainId: 8453 });
check("leaves empty 0x calldata untouched", emptyUntouched === "0x");

const erc20TransferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const tx = buildAttributedSwapTx({
  router: "0x1111111111111111111111111111111111111111",
  abi: erc20TransferAbi,
  functionName: "transfer",
  args: ["0x2222222222222222222222222222222222222222", 1000000n],
  chainId: 8453,
});
check("buildAttributedSwapTx encodes and appends suffix", tx.data.startsWith("0xa9059cbb") && tx.data.toLowerCase().endsWith(rawSuffix));

console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
process.exit(failed ? 1 : 0);
