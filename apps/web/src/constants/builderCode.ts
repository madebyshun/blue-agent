// BlueAgent Builder Code (ERC-8021 transaction attribution).
//
// Registered against the BlueAgent treasury wallet via the Base builder-codes
// API (POST https://api.base.dev/v1/agents/builder-codes). DATA_SUFFIX is the
// ox-encoded suffix appended to transaction calldata so onchain activity routed
// through Blue Bank is attributed to BlueAgent on base.dev.
import { Attribution } from "ox/erc8021";

export const BUILDER_CODE = "bc_2ejr35xc";

export const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });
