---
name: workflow
description: Write and run a workflow, a script that orchestrates many child Pi agents in the background, for audits, migrations, cross-checked research and other work too big for one context. Use only when the user says "ultracode" or asks for a workflow or multi-agent orchestration in their own words.
---

A workflow puts the plan in code: the script holds the fan-out, the checks and the intermediate results, and only what it prints comes back to you. Use one to be comprehensive (cover many units in parallel), to be confident (independent attempts and adversarial checks before anything is reported), or to handle more than one context can hold.

## When to run one

Only after an explicit opt-in: the user says "ultracode" or asks for a workflow or multi-agent orchestration in their own words. A task that would merely benefit from one does not count; describe the workflow you would run and roughly what it would cost, and ask.

**Ultracode.** "ultracode TASK" opts that task in. "ultracode on" makes the opt-in standing until "ultracode off": run a workflow for every substantive task, and work solo only on conversational turns and trivial mechanical edits. Under ultracode, aim for the most exhaustive, correct answer, not the fastest or cheapest; token cost is not a constraint. Multi-phase work (understand → design → implement → review) becomes several workflows in sequence, one per phase. Lean toward adversarially verifying findings unless the work is trivial or already verified.

## Shape

Scout inline first (list the files, scope the diff, find the sources) to get the work list, then make each workflow one well-scoped fan-out over it, and read its result before deciding the next. Common shapes:
- Understand: parallel readers over the relevant subsystems → one structured map.
- Design: several independent approaches → parallel judges score them → synthesize from the best.
- Review: one finder per dimension → adversarially verify each finding.
- Research: search from several angles → read the best sources in depth → synthesize with citations.
- Migrate: find every site → transform each → verify each.

## Run it

Write the workflow as an ES module in a fresh `mktemp -d /tmp/workflow-XXXX` directory and start it with `monitor` from the directory the agents should work in, e.g. `cd REPO && timeout 3h node /tmp/workflow-XXXX/workflow.mjs`. Its progress lines arrive as monitor output; print the result last, and write bulky output to files.

Import `agent` from the `file://` URL of `wf.mjs` in this skill's directory. `agent(task, { model, tools, json })` runs one `pi-sub -p` child and resolves to its final answer, or with `json: true` to the JSON block the answer ends with; it rejects when the child fails or that JSON does not parse. `model` takes `provider/id[:thinking]` and defaults to Pi's default model; `tools` takes a `--tools` allowlist. The task's first line labels its progress lines, so make it distinctive. `WF_CONCURRENCY` (default 16) and `WF_MAX_AGENTS` (default 100) cap the children running at once and the calls per run, cached ones included.

Answers are saved in `out/` beside the script; rerunning it runs only new, changed and failed calls, so edit and rerun it to resume or adjust a stopped run. Keep timestamps and random values out of tasks, or reruns will not find their saved answers. Saved answers do not notice changed files, so use a fresh directory when agents must look again.

- Children start with none of this conversation but read the same AGENTS.md files: every task states the goal, paths, constraints and answer format.
- Parallel writers must own disjoint files or separate git worktrees, and must not commit, whatever their AGENTS.md says.
- Use a lower thinking level for mechanical stages, and the strongest settings only for the hardest verify and judge stages.

## Structure

Pipeline by default: give each item its own async chain, such as `Promise.allSettled(items.map(async (item) => verify(await find(item))))`, so one item is verified while others are still being found. Wait for a whole stage only when the next stage needs all of its results together: to dedupe across the set, to stop when it is empty, or to compare findings with each other.

Quality patterns; pick what fits and combine them:
- Adversarial verify: give each finding to N independent agents told to refute it, counting uncertainty as refuted; drop it when a majority refutes.
- Diverse verify: when a finding can fail in several ways, give each verifier its own lens (correctness, security, performance, does it reproduce) instead of N identical refuters.
- Judge panel: N independent attempts from different angles, scored by parallel judges; build on the winner and graft in the best of the rest.
- Loop until dry: when the amount of work is unknown, run finders in rounds until K rounds in a row add nothing new. Dedupe against everything seen, not just what was confirmed, or rejected findings return every round.
- Multi-angle sweep: parallel searches that each look a different way (by location, content, entity or time).
- Completeness critic: a final agent asks what is missing (an angle not run, a claim not verified, a source not read); its answer is the next round.
- No silent caps: when sampling or a top-N cut drops work, print what was dropped.

Scale to the ask: "find any bugs" means a few finders and one verifying vote each; "audit thoroughly" means more finders, three to five votes per finding, and a synthesis stage. When unsure, lean thorough for research, review and audits, and brief for quick checks.
