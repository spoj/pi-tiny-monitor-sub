import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const bin = fileURLToPath(new URL("../bin", import.meta.url));

export default function piTinyMonitorSub(pi: ExtensionAPI): void {
	let restore: (() => void) | undefined;

	pi.on("session_start", (_event, ctx) => {
		const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
		const previous = [[pathKey, process.env[pathKey]], ["PI_SESSION_FILE", process.env.PI_SESSION_FILE]] as const;
		process.env[pathKey] = `${bin}${delimiter}${process.env[pathKey] ?? ""}`;
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
