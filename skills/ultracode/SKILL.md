---
name: ultracode
description: Run a large task as a background workflow script that fans out parallel child Pi agents and independently verifies their results, like Claude Code's ultracode. Use only when the user says "ultracode".
---

"ultracode TASK" asks for one workflow; "ultracode on" means running every substantive task as a workflow until "ultracode off". Either is the go-ahead for subagents.

Write the workflow as an ES module in a fresh `mktemp -d /tmp/ultracode-XXXX` directory and start it with `monitor` from the directory the agents should work in, e.g. `cd REPO && timeout 3h node /tmp/ultracode-XXXX/workflow.mjs`.

Import `agent` from the `file://` URL of `wf.mjs` in this skill's directory. `agent(task, { model, tools, json })` runs one `pi-sub -p` child and resolves to its final answer, or with `json: true` to the JSON block the answer ends with; it rejects when the child fails or that JSON does not parse. `model` takes `provider/id[:thinking]`, `tools` a `--tools` allowlist. The task's first line labels the start, done, and failed lines that arrive as monitor output, so make it distinctive. The environment variables `WF_CONCURRENCY` (default 16) and `WF_MAX_AGENTS` (default 100) cap the children running at once and the calls per run, cached ones included; set them on the command line, e.g. `WF_MAX_AGENTS=300 node workflow.mjs`.

Answers are saved in `out/` beside the script, and rerunning the script there returns the saved answer for each call whose task, model, and tools are unchanged. To resume or adjust a stopped run, edit the script and start it again in the same directory; only new, changed, and failed calls run. Saved answers do not notice changed files, so use a fresh directory when agents must look again.

Map the work into units, fan out one agent per unit, have fresh agents try to refute each result, and combine what survives.

- Children start blank: every task states the goal, paths, constraints, and answer format.
- Parallel writers must own disjoint files and must not commit, whatever their AGENTS.md says.
