---
name: pi-sub
description: Delegate a self-contained task to a child Pi agent. Use when work can proceed in parallel or would flood this context.
---

`pi-sub` runs `pi` as a child of this session and accepts any `pi` arguments.

- Run it through `monitor`; the child's final answer arrives as monitor output when it exits.
- The child starts with none of this conversation. Put the goal, relevant paths, constraints, and the expected answer in the task.
- Pick the child's model with `--model provider/id[:thinking]`.
- Bound long runs with `timeout`, for example `timeout 2h pi-sub -p "TASK"`.
- The child's session file is written beside this session's file; read it to inspect the child's work.
