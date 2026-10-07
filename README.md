# pi-tiny-monitor-sub

A companion to [pi-tiny-monitor](https://github.com/spoj/pi-tiny-monitor) for parent-linked child Pi sessions and the workflows built from them.

It provides `pi-sub`, which accepts any `pi` arguments and records the calling session as the child's `parentSession`, so Pi shows the child under its parent:

```bash
pi-sub -p "Review src/ for correctness bugs. Report findings with file paths."
```

Run it through `monitor` to keep the parent turn available; the child's final answer arrives as monitor output. The bundled `pi-sub` skill tells the model how to delegate this way.

`pi-sub` writes the child's session header beside the parent session, then runs Pi with `--session FILE`. Outside a Pi session it runs plain `pi`. It is a Node script with `sh` and `.cmd` wrappers, so it works from Unix shells, Git Bash, and PowerShell.

At session start the extension puts `bin/` on Pi's `PATH`, exports the session file as `PI_SESSION_FILE` as Pi's bash tool does for its own commands, and exports the command that launched Pi as `PI_SUB_COMMAND`. The child runs that same Pi directly; on Windows `pi` is a `.cmd` shim that Node cannot spawn without a shell. Commands started by `monitor` inherit all three. Session shutdown restores the previous values.

## Workflows

The bundled `ultracode` skill runs a large task the way Claude Code's ultracode does. When a request says "ultracode", the model writes an ES module that fans the work out to child agents and has other agents try to refute their results, then runs it through `monitor`:

```js
import { agent } from "file:///…/pi-tiny-monitor-sub/skills/ultracode/wf.mjs";

const files = await agent("List the TypeScript modules under src/.", { json: true });
const reviews = await Promise.allSettled(files.map((file) => agent(`Review ${file} for correctness bugs.`)));
```

`agent(task, { model, tools, json })` runs `pi-sub -p`, with at most `WF_CONCURRENCY` (default 16) children at once and `WF_MAX_AGENTS` (default 100) calls per run. Each answer is saved in `out/` beside the script; running the script again returns the saved answer for every unchanged call, so a stopped or edited workflow resumes instead of starting over.

## Install

```bash
pi install git:github.com/spoj/pi-tiny-monitor
pi install git:github.com/spoj/pi-tiny-monitor-sub
```

Or try it locally:

```bash
pi -e ../pi-tiny-monitor/src/index.ts -e ./src/index.ts
```

## Development

```bash
npm install
npm run check
```
