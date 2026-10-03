# pi-tiny-monitor-sub

A companion to [pi-tiny-monitor](https://github.com/spoj/pi-tiny-monitor) for parent-linked child Pi sessions.

It provides `pi-sub`, which accepts any `pi` arguments and records the calling session as the child's `parentSession`, so Pi shows the child under its parent:

```bash
pi-sub -p "Review src/ for correctness bugs. Report findings with file paths."
```

Run it through `monitor` to keep the parent turn available; the child's final answer arrives as monitor output. The bundled `pi-sub` skill tells the model how to delegate this way.

`pi-sub` writes the child's session header beside the parent session, then runs `pi --session FILE`. Outside a Pi session it runs plain `pi`. It is a POSIX shell script and needs `uuidgen`.

At session start the extension puts `bin/` on Pi's `PATH` and exports the session file as `PI_SESSION_FILE`, as Pi's bash tool does for its own commands. Commands started by `monitor` inherit both. Session shutdown restores the previous values.

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
