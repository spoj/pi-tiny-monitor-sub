import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const piSub = fileURLToPath(new URL("../bin/pi-sub", import.meta.url));
const directories: string[] = [];

function run(env: Record<string, string>, name = "work"): { args: string[]; directory: string } {
	const root = mkdtempSync(join(tmpdir(), "pi-sub-"));
	directories.push(root);
	const directory = join(root, name);
	mkdirSync(directory);
	// Pi records its physical cwd, so start from a symlink whose logical path differs.
	const link = join(root, "link");
	symlinkSync(directory, link);
	writeFileSync(join(root, "pi"), "#!/bin/sh\nprintf '%s\\n' \"$@\"\n");
	chmodSync(join(root, "pi"), 0o755);
	const stdout = execFileSync(piSub, ["-p", "task"], {
		cwd: link,
		encoding: "utf8",
		env: { ...process.env, PATH: `${root}${delimiter}${process.env.PATH}`, PWD: link, PI_SESSION_FILE: "", ...env },
	});
	return { args: stdout.trimEnd().split("\n"), directory: realpathSync(directory) };
}

afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("pi-sub", () => {
	it("starts a session beside the parent that records it as parentSession", () => {
		const sessions = mkdtempSync(join(tmpdir(), "pi-sub-sessions-"));
		directories.push(sessions);
		const parent = join(sessions, "parent.jsonl");
		const { args, directory } = run({ PI_SESSION_FILE: parent });

		const [file] = readdirSync(sessions);
		expect(args).toEqual(["--session", join(sessions, file), "-p", "task"]);
		const header = JSON.parse(readFileSync(join(sessions, file), "utf8"));
		expect(file).toBe(`${header.timestamp.replace(/[:.]/g, "-")}_${header.id}.jsonl`);
		expect(header).toMatchObject({ type: "session", version: 3, cwd: directory, parentSession: parent });
	});

	it("escapes paths in the session header", () => {
		const sessions = mkdtempSync(join(tmpdir(), "pi-sub-sessions-"));
		directories.push(sessions);
		const parent = join(sessions, "parent.jsonl");
		const { directory } = run({ PI_SESSION_FILE: parent }, 'quote" back\\slash');

		const [file] = readdirSync(sessions);
		expect(JSON.parse(readFileSync(join(sessions, file), "utf8"))).toMatchObject({ cwd: directory, parentSession: parent });
	});

	it("runs plain pi outside a Pi session", () => {
		expect(run({}).args).toEqual(["-p", "task"]);
	});
});
