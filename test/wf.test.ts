import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const wf = pathToFileURL(fileURLToPath(new URL("../skills/ultracode/wf.mjs", import.meta.url))).href;
// Stands in for Pi: logs its arguments around a short wait, then answers according to the task's first word.
const fakePi = `
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
const [word] = args.at(-1).split(/\\s/);
appendFileSync(process.env.FAKE_LOG, JSON.stringify(["start", args]) + "\\n");
await new Promise((resolve) => setTimeout(resolve, 300));
appendFileSync(process.env.FAKE_LOG, JSON.stringify(["end"]) + "\\n");
if (word === "fail") {
	console.error("boom");
	process.exit(1);
}
const fence = (value) => "\\n\`\`\`json\\n" + JSON.stringify(value) + "\\n\`\`\`\\n";
console.log(word === "json" ? "draft" + fence(1) + "final" + fence({ pid: process.pid }) : word + " " + process.pid);
`;
let directory: string;

function setup() {
	directory = mkdtempSync(join(tmpdir(), "wf-"));
	const pi = join(directory, "pi.mjs");
	const log = join(directory, "log.jsonl");
	writeFileSync(pi, fakePi);
	return {
		// Runs the body as a workflow script and returns its last output line.
		run(body: string, env: Record<string, string> = {}) {
			writeFileSync(log, "");
			writeFileSync(join(directory, "workflow.mjs"), `import { agent } from ${JSON.stringify(wf)};\n${body}`);
			const childEnv: NodeJS.ProcessEnv = { ...process.env, PI_SUB_COMMAND: JSON.stringify([process.execPath, pi]), FAKE_LOG: log, ...env };
			delete childEnv.PI_SESSION_FILE;
			const output = execFileSync(process.execPath, [join(directory, "workflow.mjs")], { cwd: directory, encoding: "utf8", env: childEnv });
			return output.trim().split("\n").at(-1);
		},
		calls: () => readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as [string, string[]?]),
	};
}

const settle = (calls: string) => `const results = await Promise.allSettled([${calls}]);
console.log(JSON.stringify(results.map((result) => (result.status === "fulfilled" ? result.value : result.reason.message))));`;

afterEach(() => {
	rmSync(directory, { recursive: true, force: true });
});

describe("wf agent()", () => {
	it("runs at most WF_CONCURRENCY children through pi-sub, passing model and tools", () => {
		const { run, calls } = setup();
		run(settle(`agent("one", { model: "p/m:low", tools: "read,bash" }), agent("two"), agent("three"), agent("four"), agent("five")`), { WF_CONCURRENCY: "2" });
		let running = 0;
		let peak = 0;
		for (const [event] of calls()) peak = Math.max(peak, (running += event === "start" ? 1 : -1));
		expect(peak).toBe(2);
		expect(calls().find(([, args]) => args?.at(-1) === "one")?.[1]).toEqual(["-p", "--model", "p/m:low", "--tools", "read,bash", "--", "one"]);
	});

	it("parses the last JSON block and rejects failures, unparseable JSON, and calls past WF_MAX_AGENTS", () => {
		const { run } = setup();
		const output = run(settle(`agent("json", { json: true }), agent("fail"), agent("text", { json: true }), agent("over")`), { WF_MAX_AGENTS: "3" });
		const [json, fail, text, over] = JSON.parse(output!);
		expect(json).toEqual({ pid: expect.any(Number) });
		expect(fail).toBe("exit 1: boom");
		expect(text).toMatch(/JSON/);
		expect(over).toBe("WF_MAX_AGENTS (3) reached");
	});

	it("reruns only new, changed, and failed calls, keeping one answer per identical call", () => {
		const { run, calls } = setup();
		const body = settle(`agent("same"), agent("same"), agent("edit", { model: "p/m" }), agent("fail")`);
		const first = run(body);
		const [one, two] = JSON.parse(first!);
		expect(one).not.toBe(two);
		expect(run(body)).toBe(first);
		expect(calls().map(([, args]) => args?.at(-1)).filter(Boolean)).toEqual(["fail"]);
		run(body.replace("p/m", "p/n"));
		expect(calls().map(([, args]) => args?.at(-1)).filter(Boolean).sort()).toEqual(["edit", "fail"]);
	});
});
