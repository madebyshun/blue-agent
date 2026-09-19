#!/usr/bin/env node
/**
 * Blue Agent CLI — `blue` command
 *
 * Core workflow:   idea · build · audit · ship · raise
 * Setup / health:  new · init · doctor · validate
 * Chat:            chat
 * Identity/score:  score · agent-score · compare
 * Alerts:          alert
 * Tasks:           tasks · post-task · accept · submit
 * Microtasks:      micro post · micro list · micro accept · micro submit · micro approve · micro profile
 * Terminal UI:     tui (spawns @blueagent/cli)
 */

import { Command } from "commander";
import { spawnSync }          from "child_process";
import fs                     from "fs";
import path                   from "path";

import { runIdea }            from "./commands/idea";
import { runBuild }           from "./commands/build";
import { runAudit }           from "./commands/audit";
import { runShip }            from "./commands/ship";
import { runRaise }           from "./commands/raise";
import { runNew }             from "./commands/new";
import { runInit }            from "./commands/init";
import { runDoctor }          from "./commands/doctor";
import { runScore }           from "./commands/score";
import { runAgentScore }      from "./commands/agent-score";
import { runPostTask }        from "./commands/post-task";
import { runListTasks }       from "./commands/tasks";
import { runAcceptTask }      from "./commands/accept";
import { runSubmitTask }      from "./commands/submit";
import { runChat }            from "./commands/chat";
import { runValidate }        from "./commands/validate";
import { runAlert, runAlertRemove } from "./commands/alert";
import { runCompare }         from "./commands/compare";
import {
  runMicroPost,
  runMicroList,
  runMicroAccept,
  runMicroSubmit,
  runMicroApprove,
  runMicroProfile,
}                             from "./commands/micro";

const program = new Command();

/** Read the real version off package.json rather than repeating it here.
 *  The literal that used to live below said 0.1.10 while the package was at
 *  0.1.16 — `blue --version` was answering with a number six releases old. */
function pkgVersion(): string {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

program
  .name("blue")
  .description("Blue Agent — AI-native founder console for Base builders")
  .version(pkgVersion());

// ── Core workflow ─────────────────────────────────────────────────────────────

program
  .command("idea [prompt]")
  .description("Turn a rough concept into a fundable brief — why now, why Base, MVP scope, risks, 24h plan")
  .option("-m, --model <model>", "Model id override (default: $VIRTUALS_MODEL, else the package default)")
  .option("--max-tokens <n>", "Max output tokens", "2000")
  .action(async (prompt, opts) => {
    await runIdea(prompt, { model: opts.model, maxTokens: parseInt(opts.maxTokens, 10) });
  });

program
  .command("build [prompt]")
  .description("Generate architecture, stack, folder structure, integrations, and test plan")
  .option("-m, --model <model>", "Model id override (default: $VIRTUALS_MODEL, else the package default)")
  .option("--max-tokens <n>", "Max output tokens", "3000")
  .action(async (prompt, opts) => {
    await runBuild(prompt, { model: opts.model, maxTokens: parseInt(opts.maxTokens, 10) });
  });

program
  .command("audit [prompt]")
  .description("Security and product risk review — critical issues, suggested fixes, go/no-go")
  .option("-m, --model <model>", "Model id override (default: $VIRTUALS_MODEL, else the package default)")
  .option("--max-tokens <n>", "Max output tokens", "3000")
  .action(async (prompt, opts) => {
    await runAudit(prompt, { model: opts.model, maxTokens: parseInt(opts.maxTokens, 10) });
  });

program
  .command("ship [prompt]")
  .description("Deployment checklist, verification steps, release notes, monitoring plan")
  .option("-m, --model <model>", "Model id override (default: $VIRTUALS_MODEL, else the package default)")
  .option("--max-tokens <n>", "Max output tokens", "2000")
  .action(async (prompt, opts) => {
    await runShip(prompt, { model: opts.model, maxTokens: parseInt(opts.maxTokens, 10) });
  });

program
  .command("raise [prompt]")
  .description("Pitch narrative — market framing, why this wins, traction, ask, target investors")
  .option("-m, --model <model>", "Model id override (default: $VIRTUALS_MODEL, else the package default)")
  .option("--max-tokens <n>", "Max output tokens", "2000")
  .action(async (prompt, opts) => {
    await runRaise(prompt, { model: opts.model, maxTokens: parseInt(opts.maxTokens, 10) });
  });

// ── Setup / health ────────────────────────────────────────────────────────────

program
  .command("new <name>")
  .description("Scaffold a new Base project from a template (base-agent | base-x402 | base-token)")
  .option("-t, --template <template>", "Template to use", "base-agent")
  .action(async (name, opts) => {
    await runNew(name, { template: opts.template });
  });

program
  .command("init")
  .description("Install Blue Agent skills into ~/.blue-agent/skills/ for local grounding")
  .action(async () => {
    await runInit();
  });

program
  .command("doctor")
  .description("Check your Blue Agent setup — node, skills, API key, config")
  .action(async () => {
    await runDoctor();
  });

program
  .command("validate [dir]")
  .description("Project health check — Node, package.json, tsconfig, env, src/, git")
  .action(async (dir) => {
    await runValidate(dir);
  });

// ── Chat ─────────────────────────────────────────────────────────────────────

program
  .command("chat [prompt]")
  .description("Chat with Blue Agent — streaming responses, multi-turn REPL")
  // `--sonnet` / `--opus` are gone, not renamed: they hard-coded `claude-sonnet-4-6`
  // and `claude-opus-4-6`, Bankr ids the Virtuals gateway does not serve, so keeping
  // them would only turn a 403 into a 400. Pick a model from the live catalog with
  // `-m`, or set VIRTUALS_MODEL.
  .option("-m, --model <model>", "Override model ID (default: $VIRTUALS_MODEL, else the package default)")
  .action(async (prompt, opts) => {
    await runChat(prompt, { model: opts.model });
  });

// ── Identity / score ──────────────────────────────────────────────────────────

program
  .command("score [handle]")
  .description("Builder Score for an X/Twitter handle — activity, social, thesis (0-100)")
  .action(async (handle) => {
    await runScore(handle);
  });

program
  .command("agent-score [input]")
  .description("Agent Score — @handle / npm:@pkg / github.com/repo / https://url")
  .action(async (input) => {
    await runAgentScore(input);
  });

program
  .command("compare [a] [b]")
  .description("Compare two builders or agents side by side")
  .action(async (a, b) => {
    await runCompare(a, b);
  });

// ── Alerts ────────────────────────────────────────────────────────────────────
//
// RETIRED 2026-09-18 — `search`, `trending`, `watch`, `history`, `launch`, `market`.
//
// All six asked an LLM to produce market facts with NO data source behind them, and
// printed the answer as if it were measured. Their own prompts said so out loud:
// search  — "If you don't know exact results, return realistic examples"
// trending— "Be specific and realistic... Use real handles where you know them"
// market  — invented a `price`, a `usage` count and a `trust` badge per listing
// history — invented DATED events in a named real person's timeline
// launch  — asserted a fixed "40% creator / 40% Bankr / 20% Clanker" fee split
// watch   — invented the signals and thresholds it then saved to disk
//
// Four of them also ended by handing the user a `bankr agent prompt "..."` command to
// run. Bankr 403-bans this project on every write verb (measured 2026-09-06), so that
// command fails for everyone — the commands were selling a platform that rejects us.
//
// This is the repo's own rule, not a style preference: "A tool with no real source WILL
// fabricate, no matter how good the prompt is. Prompts do not prevent hallucination;
// data sources do." Renaming Bankr→Virtuals inside them would have kept the fabrication
// and just changed which gateway produced it.
//
// `alert` SURVIVES because it is the honest one: no LLM, a real interactive prompt, and
// it already tells the truth that nothing delivers until you wire a listener.
// ~/.blue-agent/watches.json is deliberately NOT deleted — user state is evidence.

program
  .command("alert [subcommand]")
  .description("Configure alerts — blue alert add | list | remove <id>")
  .argument("[id]", "Alert ID (for remove subcommand)")
  .action(async (subcommand, id) => {
    if (subcommand === "remove" && id) {
      await runAlertRemove(id);
    } else {
      await runAlert(subcommand);
    }
  });

// ── Work Hub / tasks ──────────────────────────────────────────────────────────

program
  .command("post-task [handle]")
  .description("Draft a Work Hub task (interactive) — in-memory only, not published")
  .action(async (handle) => {
    await runPostTask(handle);
  });

program
  .command("tasks")
  .description("List Work Hub tasks drafted in this process (starts empty every run)")
  .option("-c, --category <cat>", "Filter by category: audit | content | art | data | dev")
  .action(async (opts) => {
    await runListTasks({ category: opts.category });
  });

program
  .command("accept [taskId] [handle]")
  .description("Accept a task from the Work Hub")
  .action(async (taskId, handle) => {
    await runAcceptTask(taskId, handle);
  });

program
  .command("submit [taskId] [handle] [proof]")
  .description("Attach proof to a Work Hub task (records the result, sends nothing)")
  .action(async (taskId, handle, proof) => {
    await runSubmitTask(taskId, handle, proof);
  });

// ── Microtasks ────────────────────────────────────────────────────────────────

const micro = program
  .command("micro")
  .description("Local microtask tracker — post, claim, and review small tasks (no payments)");

micro
  .command("post [description]")
  .description("Post a new microtask with low-cost slots")
  .option("--reward <n>", "Reward per slot in USD (max $20)")
  .option("--slots <n>", "Number of slots", "1")
  .option("--platform <p>", "Platform: x | farcaster | telegram | web", "web")
  .option("--proof <type>", "Proof type: reply | quote | screenshot | url | video | text", "url")
  .option("--must-mention <handle>", "Require mentioning this handle")
  .option("--deadline <date>", "Deadline YYYY-MM-DD")
  .option("--approval <mode>", "Approval: auto | manual | hybrid", "auto")
  .action(async (description, opts) => {
    await runMicroPost(description, {
      reward: opts.reward,
      slots: opts.slots,
      platform: opts.platform,
      proof: opts.proof,
      mustMention: opts.mustMention,
      deadline: opts.deadline,
      approval: opts.approval,
    });
  });

micro
  .command("list [id]")
  .description("Browse open microtasks (pass ID for detailed view)")
  .option("--platform <p>", "Filter by platform")
  .option("--status <s>", "Filter by status")
  .option("--proof <type>", "Filter by proof type")
  .option("--mention <handle>", "Filter by required mention")
  .option("--sort <key>", "Sort by: reward | deadline | slots | created_at", "created_at")
  .option("--limit <n>", "Max results", "20")
  .action(async (id, opts) => {
    await runMicroList(id, {
      platform: opts.platform,
      status: opts.status,
      proof: opts.proof,
      mention: opts.mention,
      sort: opts.sort,
      limit: opts.limit,
    });
  });

// Alias: blue micro tasks → blue micro list
micro
  .command("tasks")
  .description("Alias for: blue micro list")
  .option("--platform <p>", "Filter by platform")
  .option("--status <s>", "Filter by status")
  .option("--limit <n>", "Max results", "20")
  .action(async (opts) => {
    await runMicroList(undefined, {
      platform: opts.platform,
      status: opts.status,
      limit: opts.limit,
    });
  });

micro
  .command("accept [taskId] [handle]")
  .description("Claim a slot on a microtask")
  .action(async (taskId, handle) => {
    await runMicroAccept(taskId, handle);
  });

micro
  .command("submit [taskId] [proof]")
  .description("Submit proof for an accepted microtask slot")
  .option("--handle <h>", "Your handle if multiple claims exist")
  .option("--note <text>", "Optional context note")
  .action(async (taskId, proof, opts) => {
    await runMicroSubmit(taskId, proof, { handle: opts.handle, note: opts.note });
  });

micro
  .command("approve [taskId]")
  .description("Approve or reject a submission (records the result locally)")
  .option("--reject", "Reject the submission instead of approving")
  .option("--claim <id>", "Approve a specific claim ID")
  .action(async (taskId, opts) => {
    await runMicroApprove(taskId, { reject: opts.reject, claimId: opts.claim });
  });

micro
  .command("profile [handle]")
  .description("Show doer performance, approved value, and reputation")
  .action(async (handle) => {
    await runMicroProfile(handle);
  });

// ── Terminal UI ───────────────────────────────────────────────────────────────

const tui = program.command("tui").description("Open the Blue Agent full terminal UI (@blueagent/cli)");

tui
  .command("open")
  .description("Open the Blue Agent TUI")
  .action(() => spawnTui());

tui
  .command("market")
  .description("Open the Blue Agent TUI (navigates to marketplace from main menu)")
  .action(() => spawnTui());

tui
  .command("watch")
  .description("Open the Blue Agent TUI (navigates to watch from main menu)")
  .action(() => spawnTui());

tui
  .command("launch")
  .description("Open the Blue Agent TUI (navigates to launch from main menu)")
  .action(() => spawnTui());

// `blue tui` with no subcommand
tui.action(() => spawnTui());

function spawnTui() {
  const result = spawnSync("blueagent", [], { stdio: "inherit" });
  if (result.error) {
    process.stderr.write(
      `\n[blue] Could not launch TUI: ${result.error.message}\n` +
      `       Install it: npm install -g @blueagent/cli\n\n`
    );
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}

program.parse(process.argv);
