/**
 * `/api/x402/[tool]` — nobody signs for a free tool, and nobody is quoted a
 * price for a request that cannot succeed.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two findings from the 2026-09-26 live pass over the MCP/x402 surface:
 *
 *  1. `rh-rwa-verify` is priced `$0.00` and its own catalog description ends
 *     "Free — safety checks should never be gated". It answered 402 with
 *     `maxAmountRequired: "0"`. An agent that honours 402 therefore had to
 *     build, sign and submit an EIP-3009 authorization for ZERO USDC before it
 *     could run a safety check — a signature request, a wallet prompt and a
 *     CDP round-trip, to transfer nothing. Most agents simply stopped there.
 *
 *  2. A call carrying the WRONG input shape (`{address}` where the tool takes
 *     `{contract}`) was quoted a price anyway. The caller could pay in full and
 *     only then learn the request was malformed — and because settlement
 *     happens after a 2xx, a handler that 400s post-payment still costs the
 *     caller the round-trip while a handler that 200s with an error message
 *     costs them the money. Validating after quoting puts the cost of a typo
 *     on whoever made it last.
 *
 * WHAT WOULD ROT SILENTLY
 * -----------------------
 *  - `priceUnits === 0` is one `if`. Any refactor that folds the free case back
 *     into the generic "does this request carry X-Payment?" branch restores the
 *     402 and nothing fails to compile. Case 1 pins the status code AND the
 *     absence of the `payment-required` header, because a 200 that still ships
 *     the header would keep a compliant client paying.
 *  - The pre-quote validation must stay scoped to NON-EMPTY bodies. An empty
 *     `{}` POST is how every client — including the Hub's own UI — asks "what
 *     does this cost?", so validating it would turn price discovery into a 400
 *     for every paid tool in the catalog. Case 3 exists solely to stop a later
 *     tightening from breaking that, and it is the assertion most likely to be
 *     "fixed" by someone who has not read this paragraph.
 *
 *  - The FREE SET GROWS, and a suite that names its members stops covering the
 *     newest one the moment it is added. Cases 1 and 2 name two tools because those
 *     were the only free tools that existed; four more shipped afterwards. Case
 *     2b enumerates `priceUSDC === 0` from the catalog instead, so a new free
 *     tool is covered by being added, not by someone remembering this file.
 *
 *  - AND THE ENDPOINT IS NOT THE WHOLE SURFACE. Cases 1–5 only ever call
 *     `/api/x402/[tool]`, so for a year they were green while the three
 *     `.well-known` manifests — the files an agent reads BEFORE it can call
 *     anything — said the opposite. Two of them filtered on `t.priceUSDC`
 *     truthiness and `0` is falsy, so the free tools were either absent from the
 *     OpenAPI spec or 404'd as "Tool not found"; the third told every LLM that
 *     "Each tool is a paid API endpoint". Group 6 closes that, and the general
 *     lesson is the one that keeps costing: a guard on the behaviour says
 *     nothing about the advertisement of the behaviour.
 *
 * NEGATIVE CONTROLS — revert the line, this suite must go red:
 *   a. delete the `if (priceUnits === 0)` block ......................... case 1, 2, 2b
 *   b. drop the `Object.keys(probeBody).length > 0` condition ........... case 3
 *   c. delete the MISSING_REQUIRED_INPUT block .......................... case 4
 *   d. price any free tool above zero without meaning to ................ case 2b
 *   e. restore `&& t.priceUSDC` in the openapi.json filter .............. case 6a
 *   f. restore `!meta.priceUSDC` in the ai-tool 404 guard ............... case 6b
 *   g. emit a $0 x402 pricing entry for a free tool ..................... case 6b
 *   h. put the word "paid" back in description_for_model ................ case 6c
 *   i. emit a $0 `accepts` entry for a free tool in the Bazaar doc ...... case 6d
 *
 * Hermetic: `globalThis.fetch` is stubbed, so a free tool that reaches its
 * handler fails there rather than calling out. That failure is still a pass —
 * what is being asserted is that the caller was never asked to sign.
 */
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/x402/[tool]/route";
import { AGENT_TOOLS } from "../src/lib/agent-tools";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { console.log(`  ✅ ${name}`); return; }
  failures++;
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

// Every outbound call fails. A free tool is allowed to fail in its handler;
// it is not allowed to demand payment first.
globalThis.fetch = (async () =>
  new Response(JSON.stringify({ error: "network disabled in test" }), { status: 502 })) as typeof fetch;

const ADDR = "0x8ff92566f2e81bdd68edfaa8cde73942a723796b";

async function call(tool: string, body: unknown) {
  const req = new NextRequest(`https://blueagent.dev/api/x402/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await POST(req, { params: Promise.resolve({ tool }) });
  let parsed: Record<string, unknown> = {};
  try { parsed = (await res.clone().json()) as Record<string, unknown>; } catch {}
  return { status: res.status, body: parsed, paymentHeader: res.headers.get("payment-required") };
}

(async () => {
  console.log("x402 free-tool + pre-quote validation suite\n");

  // ── 1. A $0.00 tool with no inputs ───────────────────────────────────────
  // Was `picks-check` until it was retired 2026-09-28. `blue-doctor` is not an
  // arbitrary stand-in: it is the ONLY free id whose catalog entry declares
  // `inputs: []`, so it is the only one that still exercises what this case is
  // named for — a tool an agent can invoke with a literally empty body. Every
  // other free id takes at least an optional field.
  console.log("1. blue-doctor ($0.00) called with no payment header");
  {
    const { status, paymentHeader, body } = await call("blue-doctor", {});
    check("does not answer 402", status !== 402, `got ${status}`);
    check("does not ship a payment-required header", paymentHeader === null, String(paymentHeader));
    check("does not quote an amount", body.accepts === undefined);
  }

  // ── 2. A $0.00 tool that takes inputs ────────────────────────────────────
  console.log("\n2. rh-rwa-verify ($0.00) called with its real input");
  {
    const { status, paymentHeader } = await call("rh-rwa-verify", { contract: ADDR });
    check("does not answer 402", status !== 402, `got ${status}`);
    check("does not ship a payment-required header", paymentHeader === null, String(paymentHeader));
  }

  // ── 2b. EVERY $0.00 tool, enumerated from the catalog ────────────────────
  //
  // Cases 1 and 2 name two tools. That was the whole free set when this suite
  // was written and it is not any more — `blue-doctor`, `rh-token-scan`,
  // `hood-live` and `hood-track-record` all shipped free afterwards, and not one
  // of them would have been covered by a named case. A guard that has to be
  // edited every time the thing it guards grows is a guard that silently stops
  // covering the newest, least-reviewed member of the set.
  //
  // So the invariant is asserted over the catalog itself: whatever is priced
  // zero today, and whatever is priced zero next month, must not answer 402.
  // The two named cases above stay as readable documentation of the original
  // finding — this one is the part that cannot fall behind.
  console.log("\n2b. every $0.00 tool in the catalog refuses to demand payment");
  {
    const free = AGENT_TOOLS.filter((t) => (t.priceUSDC ?? -1) === 0);
    // A zero-length sweep would pass vacuously, which is the one way this
    // check could rot into decoration. If the free set ever empties, that is
    // itself a finding worth failing on.
    check("the catalog still has free tools to check", free.length > 0, `found ${free.length}`);
    for (const t of free) {
      // Empty body on purpose: no input a free tool needs is worth guessing
      // here, and the assertion is about the PAYMENT branch, which is chosen
      // before any handler reads a field. A handler that then fails on missing
      // input (or on the stubbed network) is still a pass.
      const { status, paymentHeader, body } = await call(t.id, {});
      check(
        `${t.id} (${t.price}) does not answer 402`,
        status !== 402,
        `got ${status}`,
      );
      check(
        `${t.id} does not ship a payment-required header`,
        paymentHeader === null,
        String(paymentHeader),
      );
      check(
        `${t.id} does not quote an amount`,
        body.accepts === undefined,
        JSON.stringify(body.accepts),
      );
    }
  }

  // ── 2c. …over GET as well, which is the verb an agent probes FIRST ───────
  //
  // MEASURED 2026-09-27 against production: every id in case 2b answered 200 on
  // POST and 402 on GET. Cases 1–2b enumerate the free set from the catalog so
  // they cannot fall behind as it grows, and they were green throughout — because
  // this file imported only `POST` and the route has two exported doors. The
  // enumeration was never the weak axis; the VERB was, and nothing named it.
  //
  // `/api/x402/[tool]` is documented as self-describing: an agent GETs it to read
  // the input schema before deciding to call. So GET is where a free tool is
  // discovered, and it was the one path still answering "Payment Required" with
  // `amount: "0"` — turning away exactly the callers the free tier exists for,
  // the ones checking whether a token is a scam before their first transaction.
  //
  // Asserted as a pair with 2b rather than replacing it: the bug was the GAP
  // between two verbs, so a check that covers either one alone cannot see it.
  console.log("\n2c. every $0.00 tool refuses to demand payment over GET too");
  {
    const free = AGENT_TOOLS.filter((t) => (t.priceUSDC ?? -1) === 0);
    check("the catalog still has free tools to check", free.length > 0, `found ${free.length}`);
    for (const t of free) {
      const req = new NextRequest(`https://blueagent.dev/api/x402/${t.id}`, { method: "GET" });
      const res = await GET(req, { params: Promise.resolve({ tool: t.id }) });
      const body = await res.json().catch(() => ({}));
      check(
        `GET ${t.id} (${t.price}) does not answer 402`,
        res.status !== 402,
        `got ${res.status}`,
      );
      check(
        `GET ${t.id} does not ship a payment-required header`,
        res.headers.get("payment-required") === null,
        String(res.headers.get("payment-required")),
      );
      check(
        `GET ${t.id} does not quote an amount`,
        body.accepts === undefined,
        JSON.stringify(body.accepts),
      );
      // GET is discovery, not execution: it must still hand back the schema an
      // agent needs to build the POST. Dropping to a bare 200 would stop the
      // 402 and break the thing the 402 was at least doing correctly.
      check(
        `GET ${t.id} still describes itself so the call can be built`,
        body.tool?.id === t.id && body.tool?.input !== undefined,
        JSON.stringify(body.tool?.id),
      );
    }
  }

  // ── 3. Price discovery on a paid tool must still work ────────────────────
  console.log("\n3. wallet-risk ($0.15) probed with an empty body");
  {
    const { status, paymentHeader, body } = await call("wallet-risk", {});
    check("still answers 402 — this is how clients ask the price", status === 402, `got ${status}`);
    check("ships the payment-required header", typeof paymentHeader === "string" && paymentHeader.length > 0);
    check("quotes the tool", Array.isArray(body.accepts));
  }

  // ── 4. A malformed paid call is rejected before it is priced ─────────────
  console.log("\n4. wallet-risk called with the wrong field name");
  {
    const { status, body, paymentHeader } = await call("wallet-risk", { addr: ADDR });
    check("rejects with 400, not 402", status === 400, `got ${status}`);
    check("no price is quoted for a request that cannot succeed", paymentHeader === null);
    check("says why", body.code === "MISSING_REQUIRED_INPUT", String(body.code));
    check("names the missing field", Array.isArray(body.missing) && (body.missing as string[]).includes("address"), JSON.stringify(body.missing));
    check("names the field the caller sent instead", Array.isArray(body.unrecognized) && (body.unrecognized as string[]).includes("addr"), JSON.stringify(body.unrecognized));
    check("states the caller was not charged", typeof body.error === "string" && (body.error as string).includes("not charged"), String(body.error));
  }

  // ── 5. A well-formed paid call gets its quote ────────────────────────────
  console.log("\n5. wallet-risk called correctly, still unpaid");
  {
    const { status, paymentHeader } = await call("wallet-risk", { address: ADDR });
    check("answers 402 with a quote", status === 402, `got ${status}`);
    check("ships the payment-required header", typeof paymentHeader === "string" && paymentHeader.length > 0);
  }

  // ── 6. The DISCOVERY layer tells the same story as the endpoint ──────────
  /* Cases 1–5 prove `/api/x402/[tool]` behaves. They cannot prove an agent ever
     gets far enough to try it, and on 2026-09-27 it did not:

       /.well-known/openapi.json  filtered `&& t.priceUSDC`, and micro-units
         mean a free tool holds `0` — falsy. All six were ABSENT from the spec
         OpenAI's plugin loader and the agent directories read.
       /.well-known/ai-tool/{id}.json  used the same test in its 404 guard and
         answered `{"error":"Tool not found"}` for six tools that exist, are
         registered, and answer 200 when POSTed.
       /.well-known/ai-plugin.json  counted all 115 correctly — and its
         `description_for_model`, which is the instruction an LLM actually
         follows, said "Each tool is a paid API endpoint".

     Every one of those is the *inverse* of the 402 bug cases 1–2b pin, aimed at
     the same six tools, and none of them could fail this suite because this
     suite only ever called the endpoint. The six are the safety checks: the
     calls an agent should make BEFORE it signs anything were the only ones
     discovery could not see, or described as wanting money.

     So: enumerated from the catalog, never named — same reason as case 2b. */
  // Deliberately uncounted. This label read "the three published manifests"
  // and there were four (see 6d) — a frozen count in a label is the same rot
  // the suite spends case 2b avoiding in its assertions.
  console.log("\n6. every published manifest agrees with the price");
  {
    const { GET: openapiGET }  = await import("../src/app/.well-known/openapi.json/route");
    const { GET: aiPluginGET } = await import("../src/app/.well-known/ai-plugin.json/route");
    const { GET: aiToolGET }   = await import("../src/app/.well-known/ai-tool/[tool]/route");
    const { X402_PAY_TO }      = await import("../src/lib/x402-payee");

    const free = AGENT_TOOLS.filter((t) => (t.priceUSDC ?? -1) === 0);
    const paid = AGENT_TOOLS.filter((t) => (t.priceUSDC ?? -1) > 0);
    check("there are free AND paid tools to compare", free.length > 0 && paid.length > 0,
          `${free.length} free / ${paid.length} paid`);

    // ── 6a. openapi.json ──────────────────────────────────────────────────
    const spec = (await (await openapiGET()).json()) as {
      paths: Record<string, { post: Record<string, unknown> }>;
      info: { description: string };
    };
    const pathFor = (id: string) => spec.paths[`/api/x402/${id}`]?.post;

    // Presence first: the bug was an ABSENCE, and every assertion below about
    // what a free tool's entry must NOT contain passes vacuously if the entry
    // is missing altogether. That is exactly how this shipped.
    check("openapi.json lists every free tool",
          free.every((t) => !!pathFor(t.id)),
          free.filter((t) => !pathFor(t.id)).map((t) => t.id).join(", ") || "all present");
    check("openapi.json lists every paid tool",
          paid.every((t) => !!pathFor(t.id)),
          paid.filter((t) => !pathFor(t.id)).map((t) => t.id).join(", ") || "all present");

    // `x-x402` is not decoration: its presence is what tells an x402-aware
    // agent to build an EIP-3009 authorization. On a $0.00 tool that is a
    // signature prompt for nothing, which is where agents stop.
    const freeWithX402 = free.filter((t) => pathFor(t.id)?.["x-x402"] !== undefined);
    check("no free tool carries an x-x402 block", freeWithX402.length === 0,
          freeWithX402.map((t) => t.id).join(", "));
    const freeWith402 = free.filter(
      (t) => (pathFor(t.id)?.responses as Record<string, unknown>)?.["402"] !== undefined);
    check("no free tool documents a 402 response", freeWith402.length === 0,
          freeWith402.map((t) => t.id).join(", "));

    // The complement, by value — otherwise deleting `x-x402` everywhere passes.
    const paidNoX402 = paid.filter((t) => pathFor(t.id)?.["x-x402"] === undefined);
    check("every paid tool still carries x-x402", paidNoX402.length === 0,
          paidNoX402.map((t) => t.id).join(", "));
    const paidNo402 = paid.filter(
      (t) => (pathFor(t.id)?.responses as Record<string, unknown>)?.["402"] === undefined);
    check("every paid tool still documents 402", paidNo402.length === 0,
          paidNo402.map((t) => t.id).join(", "));

    // The prose, not just the schema. An agent reads `info.description` before
    // it reads `paths`, and "Each tool requires a micro-payment" was a hardcoded
    // claim about all 115 rows that went false the day a free tool shipped.
    check("openapi.json's own blurb counts the free tools",
          spec.info.description.includes(`${free.length} free`),
          spec.info.description.slice(0, 110));

    // $0.005 rounded to "$0.01" in the human-readable price for b20-inspect —
    // double, beside a machine field carrying the right micro-units. Any price
    // whose exact value cannot survive two decimals is the case that breaks.
    const odd = paid.filter((t) => {
      const d = t.priceUSDC! / 1_000_000;
      return Math.abs(d - Number(d.toFixed(2))) > 1e-9;
    });
    check("the sub-cent price case still exists to be checked", odd.length > 0,
          odd.map((t) => `${t.id}=${t.price}`).join(", "));
    const misquoted = odd.filter((t) => {
      const desc = String(pathFor(t.id)?.description ?? "");
      return !desc.includes(`$${String(t.priceUSDC! / 1_000_000)} USDC`);
    });
    check("no description rounds a sub-cent price up", misquoted.length === 0,
          misquoted.map((t) => `${t.id} (${t.price})`).join(", "));

    // ── 6b. ai-tool/{id}.json — the ERC-8257 manifest ─────────────────────
    const manifestFor = async (id: string) => {
      const res = await aiToolGET(
        new NextRequest(`https://blueagent.dev/.well-known/ai-tool/${id}.json`),
        { params: Promise.resolve({ tool: `${id}.json` }) },
      );
      const body = (await res.json()) as {
        pricing?: { recipient?: string }[];
        x402Free?: boolean;
      };
      return { status: res.status, body };
    };

    const notFound: string[] = [];
    const wrongPricing: string[] = [];
    for (const t of free) {
      const { status, body } = await manifestFor(t.id);
      if (status !== 200) { notFound.push(`${t.id}→${status}`); continue; }
      // Empty array, not a $0 x402 entry: an entry naming a protocol, an asset
      // and a recipient is an instruction to pay, and one that says to pay zero
      // to a real address is a contradiction an agent resolves by signing.
      if (body.pricing?.length !== 0 || body.x402Free !== true) wrongPricing.push(t.id);
    }
    check("ai-tool manifest resolves for every free tool", notFound.length === 0,
          notFound.join(", ") || `${free.length} resolved`);
    check("…and prices them as free, with no x402 entry to settle",
          wrongPricing.length === 0, wrongPricing.join(", ") || "all empty + x402Free");

    // A paid tool must still get a real entry, paying the real payee. Without
    // this, emptying `pricing` for everything would pass the two above.
    {
      const sample = paid[0];
      const { status, body } = await manifestFor(sample.id);
      check(`ai-tool manifest still prices ${sample.id} (${sample.price})`,
            status === 200 && body.pricing?.length === 1, `status ${status}`);
      check("…to the x402 payee, not the ERC-8257 creator",
            body.pricing?.[0]?.recipient === `eip155:8453:${X402_PAY_TO}`,
            String(body.pricing?.[0]?.recipient));
    }

    // A genuinely absent id must still 404 — "not found" has to keep meaning it.
    {
      const { status } = await manifestFor("no-such-tool-here");
      check("an unknown id still 404s", status === 404, `got ${status}`);
    }

    // ── 6c. ai-plugin.json — the text an LLM actually follows ─────────────
    const plugin = (await (await aiPluginGET()).json()) as {
      description_for_model: string;
      "x-x402": { freeTools?: string[] };
    };
    check("description_for_model no longer claims every tool is paid",
          !/Each tool is a paid API endpoint/.test(plugin.description_for_model));
    check("…and names every free tool by id",
          free.every((t) => plugin.description_for_model.includes(t.id)),
          free.filter((t) => !plugin.description_for_model.includes(t.id)).map((t) => t.id).join(", ") || "all named");
    check("its x-x402 block lists the free tools alongside payTo",
          Array.isArray(plugin["x-x402"].freeTools) &&
            free.every((t) => plugin["x-x402"].freeTools!.includes(t.id)),
          JSON.stringify(plugin["x-x402"].freeTools));

    // ── 6d. the Bazaar doc — a FOURTH manifest, under a second well-known ──
    /* 6a–6c were written on 2026-09-27 and called "the three published
       manifests". There were four. MEASURED in prod the same day, three commits
       later: every free id in this doc still carried
       `accepts:[{scheme:"exact", amount:"0", payTo:"0x0295…"}]` — the exact
       contradiction 6b exists to forbid, published to the doc the agentic.market
       validator crawls, i.e. the layer BEFORE the layer 6a–6c cover.

       It was missed because the sweep was scoped to a DIRECTORY. Three manifests
       live under `/.well-known/`; this one lives under `/api/x402/.well-known/`,
       so reading the first directory felt exhaustive and the header froze the
       count at three. The generalisation is not "check four files" — a fifth can
       be added tomorrow. It is: enumerate by the FIELD that carries a price
       (`priceUSDC`/`amount`/`pricing`), never by where the file sits. */
    {
      const { GET: bazaarGET } = await import("../src/app/api/x402/.well-known/bazaar/route");
      const doc = (await (await bazaarGET()).json()) as {
        total: number;
        resources: { resource: string; accepts: { amount?: string }[]; x402Free?: boolean }[];
      };
      const byId = new Map(doc.resources.map((r) => [r.resource.split("/").pop()!, r]));

      // Presence first. Every absence assertion below passes vacuously on a
      // missing entry, and "absent from discovery" was half of the original bug.
      const missing = [...free, ...paid].filter((t) => !byId.has(t.id)).map((t) => t.id);
      check("the Bazaar doc lists every catalog tool, free included",
            missing.length === 0 && doc.total === AGENT_TOOLS.length,
            missing.join(", ") || `${doc.total} resources`);

      const quoted = free.filter((t) => (byId.get(t.id)?.accepts?.length ?? 0) > 0).map((t) => t.id);
      check("…and offers no payment scheme to accept for a free tool",
            quoted.length === 0, quoted.join(", ") || "all accepts: []");
      const unmarked = free.filter((t) => byId.get(t.id)?.x402Free !== true).map((t) => t.id);
      check("…marking them x402Free so [] cannot read as \"price unknown\"",
            unmarked.length === 0, unmarked.join(", ") || "all marked");

      // Paid regression: emptying `accepts` for everything would pass the two
      // above, and would silently stop the whole catalog from being payable.
      const sample = paid[0];
      const entry = byId.get(sample.id)?.accepts?.[0];
      check(`the Bazaar doc still quotes ${sample.id} (${sample.price})`,
            entry?.amount === String(sample.priceUSDC), String(entry?.amount));
      check("…and no paid tool is left with an empty accepts",
            paid.every((t) => (byId.get(t.id)?.accepts?.length ?? 0) === 1),
            paid.filter((t) => (byId.get(t.id)?.accepts?.length ?? 0) !== 1).map((t) => t.id).join(", ") || `${paid.length} priced`);
    }
  }

  console.log(failures === 0 ? "\nPASS — free means free, and a quote implies a runnable request" : `\nFAIL — ${failures} assertion(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
