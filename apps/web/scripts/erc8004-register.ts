/**
 * Prints the ERC-8004 `register(agentURI)` transaction for Blue Agent on Base
 * 8453. It does NOT sign or send: the wallet that signs becomes the owner of
 * the agent NFT, which is ShunTr's call (lib/erc8004.ts header).
 *
 *   npx tsx scripts/erc8004-register.ts
 *
 * After the tx lands, read the minted agentId from its Transfer log and set
 * BLUE_AGENT_ID in src/lib/erc8004.ts.
 */
import { ERC8004_IDENTITY, ERC8004_CHAIN_ID, REGISTRATION_URL, registerCalldata } from "../src/lib/erc8004";

console.log(JSON.stringify({
  chainId: ERC8004_CHAIN_ID,
  to: ERC8004_IDENTITY,
  value: "0",
  data: registerCalldata(),
  agentURI: REGISTRATION_URL,
  check_first: `curl -s ${REGISTRATION_URL}`,
}, null, 2));
