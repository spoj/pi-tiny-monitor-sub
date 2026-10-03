import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../bin/pi-sub.mjs", import.meta.url));
const wrapper = fileURLToPath(new URL(`../bin/pi-sub${process.platform === "win32" ? ".cmd" : ""}`, import.meta.url));
const directories: string[] = [];

function temp(prefix: string): string {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	directories.push(directory);
	return directory;
}

// Stands in for Pi and prints the arguments it received.
function fakePi(): string {
	const file = join(temp("pi-sub-fake-"), "pi.mjs");
	writeFileSync(file, "console.log(JSON.stringify(process.argv.slice(2)));\n");
	return JSON.stringify([process.execPath, file]);
}

function run(env: Record<string, string>, { name = "work", command = [process.execPath, script], task = 'task with "quotes"' } = {}) {
	const root = temp("pi-sub-");
	const directory = join(root, name);
	mkdirSync(directory);
	// Pi records its physical cwd, so start from a link whose path differs.
	const link = join(root, "link");
	symlinkSync(directory, link, "junction");
	const childEnv: NodeJS.ProcessEnv = { ...process.env, PI_SUB_COMMAND: fakePi(), ...env };
	if (!env.PI_SESSION_FILE) delete childEnv.PI_SESSION_FILE;
	const [file, ...args] = command;
	const stdout = execFileSync(file, [...args, "-p", task], { cwd: link, encoding: "utf8", env: childEnv, shell: file.endsWith(".cmd") });
	return { args: JSON.parse(stdout) as string[], directory: realpathSync(directory) };
}

function sessionDirectory() {
	const sessions = temp("pi-sub-sessions-");
	return { sessions, parent: join(sessions, "parent.jsonl"), header: () => {
		const [file] = readdirSync(sessions);
		return { file: join(sessions, file), name: file, header: JSON.parse(readFileSync(join(sessions, file), "utf8")) };
	} };
}

afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("pi-sub", () => {
	it("starts a session beside the parent that records it as parentSession", () => {
		const { parent, header } = sessionDirectory();
		const { args, directory } = run({ PI_SESSION_FILE: parent });

		const session = header();
		expect(args).toEqual(["--session", session.file, "-p", 'task with "quotes"']);
		expect(session.name).toBe(`${session.header.timestamp.replace(/[:.]/g, "-")}_${session.header.id}.jsonl`);
		expect(session.header).toMatchObject({ type: "session", version: 3, cwd: directory, parentSession: parent });
		expect(session.header.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	});

	it.skipIf(process.platform === "win32")("records paths that need escaping", () => {
		const { parent, header } = sessionDirectory();
		const { directory } = run({ PI_SESSION_FILE: parent }, { name: 'quote" back\\slash' });
		expect(header().header).toMatchObject({ cwd: directory, parentSession: parent });
	});

	it("runs plain pi outside a Pi session", () => {
		expect(run({}).args).toEqual(["-p", 'task with "quotes"']);
	});

	it("runs through the platform's bin wrapper", () => {
		const { parent, header } = sessionDirectory();
		const { args } = run({ PI_SESSION_FILE: parent }, { command: [wrapper], task: "task" });
		expect(args).toEqual(["--session", header().file, "-p", "task"]);
	});

	it("exits with the child's status", () => {
		const exit = join(temp("pi-sub-fake-"), "exit.mjs");
		writeFileSync(exit, "process.exit(3);\n");
		expect(() => run({ PI_SUB_COMMAND: JSON.stringify([process.execPath, exit]) })).toThrow(expect.objectContaining({ status: 3 }));
	});
});
