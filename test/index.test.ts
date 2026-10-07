import { execFileSync } from "node:child_process";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import piTinyMonitorSub from "../src/index.ts";

const bin = fileURLToPath(new URL("../bin", import.meta.url));
const keys = ["PATH", "PI_SESSION_FILE", "PI_SUB_COMMAND"];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function setup(sessionFile: string | undefined) {
	const pi = { on: vi.fn() };
	piTinyMonitorSub(pi as never);
	const handlers = Object.fromEntries(pi.on.mock.calls.map(([name, handler]) => [name, handler]));
	const ctx = { sessionManager: { getSessionFile: () => sessionFile } };
	return { start: () => handlers.session_start({}, ctx), shutdown: () => handlers.session_shutdown({}, ctx) };
}

afterEach(() => {
	for (const key of keys) {
		if (original[key] === undefined) delete process.env[key];
		else process.env[key] = original[key];
	}
});

describe("monitor-sub extension", () => {
	it("exposes pi-sub, the session file, and Pi's launch command to child processes until shutdown", () => {
		delete process.env.PI_SESSION_FILE;
		delete process.env.PI_SUB_COMMAND;
		const session = setup("/tmp/sessions/parent.jsonl");
		session.start();
		expect(process.env.PATH).toBe(`${bin}${delimiter}${original.PATH}`);
		expect(process.env.PI_SESSION_FILE).toBe("/tmp/sessions/parent.jsonl");
		expect(JSON.parse(process.env.PI_SUB_COMMAND!)).toEqual([process.execPath, ...process.execArgv, process.argv[1]]);
		session.shutdown();
		expect(process.env.PATH).toBe(original.PATH);
		expect(process.env.PI_SESSION_FILE).toBeUndefined();
		expect(process.env.PI_SUB_COMMAND).toBeUndefined();
	});

	it("follows a replacement session", () => {
		const first = setup("/tmp/sessions/first.jsonl");
		first.start();
		first.shutdown();
		const second = setup("/tmp/sessions/second.jsonl");
		second.start();
		expect(process.env.PI_SESSION_FILE).toBe("/tmp/sessions/second.jsonl");
		expect(process.env.PATH?.split(delimiter).filter((entry) => entry === bin)).toHaveLength(1);
	});

	it("clears an inherited session file when the session is not saved", () => {
		process.env.PI_SESSION_FILE = "/tmp/sessions/outer.jsonl";
		const session = setup(undefined);
		session.start();
		expect(process.env.PI_SESSION_FILE).toBeUndefined();
		session.shutdown();
		expect(process.env.PI_SESSION_FILE).toBe("/tmp/sessions/outer.jsonl");
	});

	it.skipIf(process.platform === "win32")("lets a child shell find pi-sub", () => {
		const session = setup("/tmp/sessions/parent.jsonl");
		session.start();
		const output = execFileSync("sh", ["-c", "command -v pi-sub; printf %s \"$PI_SESSION_FILE\""], { encoding: "utf8" });
		expect(output).toBe(`${bin}/pi-sub\n/tmp/sessions/parent.jsonl`);
	});
});
