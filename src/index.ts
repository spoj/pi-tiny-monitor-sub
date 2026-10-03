import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const bin = fileURLToPath(new URL("../bin", import.meta.url));

export default function piTinyMonitorSub(pi: ExtensionAPI): void {
	let restore: (() => void) | undefined;

	pi.on("session_start", (_event, ctx) => {
		const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
		const previous = ["PI_SESSION_FILE", "PI_SUB_COMMAND", pathKey].map((key) => [key, process.env[key]] as const);
		process.env[pathKey] = `${bin}${delimiter}${process.env[pathKey] ?? ""}`;
		process.env.PI_SUB_COMMAND = JSON.stringify([process.execPath, ...process.execArgv, process.argv[1]]);
		// Pi exports the session file only to its own bash tool; monitored commands inherit Pi's environment.
		const sessionFile = ctx.sessionManager.getSessionFile();
		if (sessionFile) process.env.PI_SESSION_FILE = sessionFile;
		else delete process.env.PI_SESSION_FILE;
		restore = () => {
			for (const [key, value] of previous) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		};
	});

	pi.on("session_shutdown", () => {
		restore?.();
		restore = undefined;
	});
}
