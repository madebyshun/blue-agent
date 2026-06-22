// x402/b20-launch — Generate complete B20 token deployment package.
// Price: $0.25 — deterministic code generation, NO LLM.
// Returns: foundry.toml, Solidity deploy script, all CLI commands.

export default async function handler(req: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const name          = (body.name as string | undefined)?.trim() ?? "";
  const symbol        = (body.symbol as string | undefined)?.trim().toUpperCase() ?? "";
  const variant       = ((body.variant as string | undefined) ?? "asset").toLowerCase() as "asset" | "stablecoin";
  const decimals      = typeof body.decimals === "number" ? body.decimals : 18;
  const supply_cap    = typeof body.supply_cap === "number" ? body.supply_cap : null;
  const currency_code = (body.currency_code as string | undefined)?.trim() ?? null;

  if (!name || !symbol) {
    return Response.json(
      { error: "name and symbol are required" },
      { status: 400 },
    );
  }

  // ── action=prepare: return unsigned calldata for direct wallet dispatch ──
  const action = (body.action as string | undefined) ?? "script";
  if (action === "prepare") {
    const admin = body.admin as string | undefined;
    if (!admin || !/^0x[a-fA-F0-9]{40}$/.test(admin)) {
      return Response.json({ error: "admin address required for prepare action" }, { status: 400 });
    }
    const { buildB20Calldata, B20_FACTORY } = await import("@/lib/b20/encode");
    const { data, factory } = buildB20Calldata({
      name, symbol, variant, decimals,
      supply_cap: supply_cap !== null ? String(supply_cap) : undefined,
      currency_code: currency_code ?? undefined,
      admin,
    });
    return Response.json({
      tool:    "b20-launch",
      action:  "prepare",
      config:  { name, symbol, variant, decimals },
      factory: B20_FACTORY,
      tx:      { to: factory, data, value: "0x0" },
      note:    "Unsigned tx. Sign + broadcast once Beryl is active on your target network.",
    });
  }

  // ── action=receipt: check tx status + extract deployed token address ────────
  if (action === "receipt") {
    const txHash  = body.tx_hash as string | undefined;
    const network = (body.network as string | undefined) ?? "mainnet";

    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return Response.json({ error: "valid tx_hash required for receipt action" }, { status: 400 });
    }

    const { createPublicClient, http } = await import("viem");
    const { base, baseSepolia }        = await import("viem/chains");

    const NETS = {
      mainnet: { chain: base,        rpc: "https://mainnet.base.org",  explorer: "https://basescan.org"          },
      sepolia: { chain: baseSepolia, rpc: "https://sepolia.base.org",  explorer: "https://sepolia.basescan.org" },
    } as const;
    const net    = NETS[(network as keyof typeof NETS)] ?? NETS.mainnet;
    const client = createPublicClient({ chain: net.chain, transport: http(net.rpc) });

    const B20_FACTORY     = "0xb20f000000000000000000000000000000000000";
    const B20_CREATED_SIG = "0xfd9bf2730513a1709722ff379a0844dfd8f997d600693c2bcc659e188bbdba0d";

    let receipt;
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    } catch {
      return Response.json({ tool: "b20-launch", action: "receipt", status: "pending", tx_hash: txHash });
    }

    // Parse token address from B20Created event topic[1]
    let tokenAddress: string | null = null;
    for (const log of receipt.logs) {
      if (
        log.address?.toLowerCase() === B20_FACTORY &&
        log.topics[0]?.toLowerCase() === B20_CREATED_SIG &&
        log.topics[1]
      ) {
        tokenAddress = "0x" + log.topics[1].slice(-40);
        break;
      }
    }
    // Fallback: log address starts 0xb20 but is not the factory
    if (!tokenAddress) {
      for (const log of receipt.logs) {
        const addr = log.address?.toLowerCase();
        if (addr && addr.startsWith("0xb20") && addr !== B20_FACTORY) {
          tokenAddress = log.address;
          break;
        }
      }
    }

    return Response.json({
      tool:        "b20-launch",
      action:      "receipt",
      status:      receipt.status,
      tokenAddress,
      blockNumber: Number(receipt.blockNumber),
      gasUsed:     receipt.gasUsed.toString(),
      txUrl:       `${net.explorer}/tx/${txHash}`,
      tokenUrl:    tokenAddress ? `${net.explorer}/token/${tokenAddress}` : null,
    });
  }

  // ── Foundry config ─────────────────────────────────────────────────────────
  const foundry_config = `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
base = true
remappings = [
  "base-std/=lib/base-std/src/",
  "forge-std/=lib/forge-std/src/",
]`;

  // ── Solidity deploy script ─────────────────────────────────────────────────
  const isAsset = variant === "asset";

  // Determine how many initCalls we need
  const initCallCount = 1 + (supply_cap !== null ? 1 : 0);

  // Build the supply-cap line if needed
  const supplyCap_line = supply_cap !== null
    ? `    initCalls[1] = B20FactoryLib.encodeUpdateSupplyCap(${BigInt(Math.floor(supply_cap))}e${decimals});`
    : "";

  // Asset vs Stablecoin create-params call
  const createParamsCall = isAsset
    ? `B20FactoryLib.encodeAssetCreateParams("${name}", "${symbol}", account, ${decimals})`
    : currency_code
      ? `B20FactoryLib.encodeStablecoinCreateParams("${name}", "${symbol}", account, "${currency_code}")`
      : `B20FactoryLib.encodeStablecoinCreateParams("${name}", "${symbol}", account, "USD")`;

  const variantEnum = isAsset ? "IB20Factory.B20Variant.ASSET" : "IB20Factory.B20Variant.STABLECOIN";

  const deploy_script = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {B20Constants} from "base-std/lib/B20Constants.sol";
import {B20FactoryLib} from "base-std/lib/B20FactoryLib.sol";
import {IB20Factory} from "base-std/interfaces/IB20Factory.sol";
import {StdPrecompiles} from "base-std/StdPrecompiles.sol";

contract CreateToken is Script {
    function run() external returns (address token) {
        address account = vm.envAddress("ACCOUNT_ADDRESS");
        bytes32 salt = keccak256("${symbol.toLowerCase()}-deploy");

        bytes memory params = ${createParamsCall};

        bytes[] memory initCalls = new bytes[](${initCallCount});
        initCalls[0] = B20FactoryLib.encodeGrantRole(B20Constants.MINT_ROLE, account);
${supply_cap !== null ? `        ${supplyCap_line}\n` : ""
}
        vm.startBroadcast();
        token = StdPrecompiles.B20_FACTORY.createB20(
            ${variantEnum},
            salt,
            params,
            initCalls
        );
        vm.stopBroadcast();

        console.log("${name} (${symbol}) deployed at:", token);
    }
}`;

  // ── CLI commands ───────────────────────────────────────────────────────────
  const dir = `${symbol.toLowerCase()}-b20`;

  const setup_commands = [
    "curl -L https://raw.githubusercontent.com/base/base-anvil/HEAD/foundryup/install | bash",
    "base-foundryup --install v1.1.0",
    `mkdir ${dir} && cd ${dir}`,
    "base-forge init . --force",
    "base-forge install base/base-std --no-git",
    `mkdir -p src && cp foundry.toml src/ 2>/dev/null; true`,
    `# Save the deploy script to script/CreateToken.s.sol`,
  ];

  const deploy_command =
    `source .env && base-forge script script/CreateToken.s.sol ` +
    `--rpc-url https://mainnet.base.org --broadcast --private-key $PRIVATE_KEY`;

  const mint_command =
    `base-cast send <TOKEN_ADDRESS> "mint(address,uint256)" <RECIPIENT> <AMOUNT> ` +
    `--rpc-url https://mainnet.base.org --private-key <your_key>`;

  const verify_command =
    `base-cast call <TOKEN_ADDRESS> "name()(string)" --rpc-url https://mainnet.base.org && ` +
    `base-cast call <TOKEN_ADDRESS> "symbol()(string)" --rpc-url https://mainnet.base.org`;

  // ── Summary ────────────────────────────────────────────────────────────────
  const supplyCapNote = supply_cap !== null ? ` Supply cap: ${supply_cap.toLocaleString()} ${symbol}.` : "";
  const currencyNote  = !isAsset && currency_code ? ` Currency: ${currency_code}.` : "";

  const summary =
    `${name} (${symbol}) — B20 ${isAsset ? "Asset" : "Stablecoin"} on Base Mainnet.` +
    ` Decimals: ${decimals}.${supplyCapNote}${currencyNote}` +
    ` MINT_ROLE granted to deployer. Ready to deploy via base-forge.`;

  const next_steps = [
    "Install base-forge using the setup commands above",
    "Save foundry.toml and script/CreateToken.s.sol to your project",
    `Set ACCOUNT_ADDRESS env var to your wallet`,
    "Run the deploy command — token address is printed on success",
    supply_cap !== null ? `Minting is capped at ${supply_cap.toLocaleString()} ${symbol}` : "Use mint_command to issue tokens",
    "Verify on Basescan after deploy",
  ];

  return Response.json({
    tool:            "b20-launch",
    timestamp:       new Date().toISOString(),
    title:           `${name} (${symbol}) — B20 ${isAsset ? "Asset" : "Stablecoin"} Deploy Package`,
    variant:         isAsset ? "ASSET" : "STABLECOIN",
    network:         "Base Mainnet (chain 8453)",
    foundry_config,
    deploy_script,
    setup_commands,
    deploy_command,
    mint_command,
    verify_command,
    summary,
    next_steps,
    disclaimer:      "Review the generated script before broadcasting. Never share your private key.",
  });
}
