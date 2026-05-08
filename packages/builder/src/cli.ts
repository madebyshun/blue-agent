#!/usr/bin/env node
/**
 * Blue Agent CLI — `blue` command
 * Commands: idea | build | audit | ship | raise | new | init | doctor | score | agent-score | post-task | tasks | accept | submit
 */

import { Command } from "commander";
import { runIdea }       from "./commands/idea";
import { runBuild }      from "./commands/build";
import { runAudit }      from "./commands/audit";
import { runShip }       from "./commands/ship";
import { runRaise }      from "./commands/raise";
import { runNew }        from "./commands/new";
import { runInit }       from "./commands/init";
import { runDoctor }     from "./commands/doctor";
import { runScore }      from "./commands/score";
import { runAgentScore } from "./commands/agent-score";
import { runPostTask }   from "./commands/post-task";
import { runListTasks }  from "./commands/tasks";
import { runAcceptTask } from "./commands/accept";
import { runSubmitTask } from "./commands/submit";

const program = new Command();

program
  .name("blue")
  .description("Blue Agent — AI-native founder console for Base builders")
  .version("0.1.0");

// ── Core workflow commands ────────────────────────────────────────────────────

program
  .command("idea [prompt]")
  .description("Turn a rough concept into a fundable brief — why now, why Base, MVP scope, risks, 24h plan")
  .option("-m, --model <model>", "Bankr LLM model override", "claude-sonnet-4-6")
  .option("--max-tokens <n>", "Max output tokens", "2000")
  .action(async (prompt, opts) => {
    await runIdea(prompt, {
      model: opts.model,
      maxTokens: parseInt(opts.maxTokens, 10),
    });
  });

program
  .command("build [prompt]")
  .description("Generate architecture, stack, folder structure, integrations, and test plan")
  .option("-m, --model <model>", "Bankr LLM model override", "claude-sonnet-4-6")
  .option("--max-tokens <n>", "Max output tokens", "3000")
  .action(async (prompt, opts) => {
    await runBuild(prompt, {
      model: opts.model,
      maxTokens: parseInt(opts.maxTokens, 10),
    });
  });

program
  .command("audit [prompt]")
  .description("Security and product risk review — critical issues, suggested fixes, go/no-go")
  .option("-m, --model <model>", "Bankr LLM model override", "claude-sonnet-4-6")
  .option("--max-tokens <n>", "Max output tokens", "3000")
  .action(async (prompt, opts) => {
    await runAudit(prompt, {
      model: opts.model,
      maxTokens: parseInt(opts.maxTokens, 10),
    });
  });

program
  .command("ship [prompt]")
  .description("Deployment checklist, verification steps, release notes, monitoring plan")
  .option("-m, --model <model>", "Bankr LLM model override", "claude-sonnet-4-6")
  .option("--max-tokens <n>", "Max output tokens", "2000")
  .action(async (prompt, opts) => {
    await runShip(prompt, {
      model: opts.model,
      maxTokens: parseInt(opts.maxTokens, 10),
    });
  });

program
  .command("raise [prompt]")
  .description("Pitch narrative — market framing, why this wins, traction, ask, target investors")
  .option("-m, --model <model>", "Bankr LLM model override", "claude-sonnet-4-6")
  .option("--max-tokens <n>", "Max output tokens", "2000")
  .action(async (prompt, opts) => {
    await runRaise(prompt, {
      model: opts.model,
      maxTokens: parseInt(opts.maxTokens, 10),
    });
  });

// ── Scaffold commands ─────────────────────────────────────────────────────────

program
  .command("new <name>")
  .description("Scaffold a new Base project from a template")
  .option("-t, --template <template>", "Template: base-agent | base-x402 | base-token", "base-agent")
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

// ── Reputation commands ───────────────────────────────────────────────────────

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

// ── Work Hub commands ─────────────────────────────────────────────────────────

program
  .command("post-task [handle]")
  .description("Post a task to the Work Hub (interactive)")
  .action(async (handle) => {
    await runPostTask(handle);
  });

program
  .command("tasks")
  .description("Browse open tasks in the Work Hub")
  .option("-c, --category <cat>", "Filter by category: audit|content|art|data|dev")
  .action(async (opts) => {
    await runListTasks({ category: opts.category });
  });

program
  .command("accept <taskId> [handle]")
  .description("Accept a task from the Work Hub")
  .action(async (taskId, handle) => {
    await runAcceptTask(taskId, handle);
  });

program
  .command("submit <taskId> <handle> <proof>")
  .description("Submit completed work with proof")
  .action(async (taskId, handle, proof) => {
    await runSubmitTask(taskId, handle, proof);
  });

program.parse(process.argv);
