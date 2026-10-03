---
name: pi-sub
description: Delegate a self-contained task to a child Pi agent by running `pi-sub -p "TASK"` through monitor. Use when work can proceed in parallel or would flood this context.
---

`pi-sub` runs `pi` with this session recorded as the child's parent, so Pi lists the child under this session. It accepts any `pi` arguments.

- Run it through `monitor`; the child's final answer arrives as monitor output when it exits. Through `bash` it blocks this turn.
- The child starts with none of this conversation. Put the goal, relevant paths, constraints, and the expected answer in the task.
- Pick the child's model with `--model provider/id[:thinking]`.
- Bound long runs with `timeout`, for example `timeout 2h pi-sub -p "TASK"`. Stop a child early with `monitor_stop`.
- The child's session file is written beside this session's file; read it to inspect the child's work.
