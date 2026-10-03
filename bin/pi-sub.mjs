// Runs pi with the calling Pi session recorded as parentSession.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const parent = process.env.PI_SESSION_FILE;
// The extension exports how the parent Pi was launched; `pi` itself is a .cmd shim on Windows, which spawn cannot run.
const [command, ...prefix] = JSON.parse(process.env.PI_SUB_COMMAND ?? '["pi"]');
const args = process.argv.slice(2);
if (parent) {
	const id = randomUUID();
	const timestamp = new Date().toISOString();
	const file = join(dirname(parent), `${timestamp.replace(/[:.]/g, "-")}_${id}.jsonl`);
	// Pi matches sessions by its physical cwd, so record the real path rather than a symlinked one.
	const header = { type: "session", version: 3, id, timestamp, cwd: realpathSync(process.cwd()), parentSession: parent };
	writeFileSync(file, `${JSON.stringify(header)}\n`);
	args.unshift("--session", file);
}
const child = spawn(command, [...prefix, ...args], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
	console.error(`pi-sub: ${error.message}`);
	process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
