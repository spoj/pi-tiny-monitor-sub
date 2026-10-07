import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const wf = pathToFileURL(fileURLToPath(new URL("../skills/ultracode/wf.mjs", import.meta.url))).href;
// Stands in for Pi: reads the task from stdin, logs it around a short wait, then answers according to its first word.
const fakePi = `
import { appendFileSync } from "node:fs";
let task = "";
for await (const chunk of process.stdin) task += chunk;
const [word] = task.split(/\\s/);
appendFileSync(process.env.FAKE_LOG, JSON.stringify(["start", process.argv.slice(2), task]) + "\\n");
await new Promise((resolve) => setTimeout(resolve, 300));
appendFileSync(process.env.FAKE_LOG, JSON.stringify(["end"]) + "\\n");
if (word === "fail") {
	console.error("boom");
	process.exit(1);
}
const fence = (value) => "\\n\`\`\`json\\n" + JSON.stringify(value) + "\\n\`\`\`\\n";
const answers = {
	json: "draft" + fence(1) + "final" + fence({ pid: process.pid }),
	quoted: fence({ quote: "a \`\`\`json\\n block" }) + "Done.",
	cut: fence({ draft: true }) + "final\\n\`\`\`json\\n{",
};
console.log(answers[word] ?? word + " " + process.pid);
`;
let directory: string;

function setup() {
	directory = mkdtempSync(join(tmpdir(), "wf-"));
	const pi = join(directory, "pi.mjs");
	const log = join(directory, "log.jsonl");
	writeFileSync(pi, fakePi);
	const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as [string, string[], string]);
	return {
		// Runs the body as a workflow script and returns the JSON its last output line prints.
		run(body: string, env: Record<string, string> = {}) {
			writeFileSync(log, "");
			writeFileSync(join(directory, "workflow.mjs"), `import { agent } from ${JSON.stringify(wf)};\n${body}`);
			const childEnv: NodeJS.ProcessEnv = { ...process.env, PI_SUB_COMMAND: JSON.stringify([process.execPath, pi]), FAKE_LOG: log, ...env };
			delete childEnv.PI_SESSION_FILE;
			const output = execFileSync(process.execPath, [join(directory, "workflow.mjs")], { cwd: directory, encoding: "utf8", env: childEnv, timeout: 30_000 });
			return JSON.parse(output.trim().split("\n").at(-1)!);
		},
		calls,
		tasks: () => calls().filter(([event]) => event === "start").map(([, , task]) => task),
	};
}

const settle = (calls: string) => `const results = await Promise.allSettled([${calls}]);
console.log(JSON.stringify(results.map((result) => (result.status === "fulfilled" ? result.value : { error: result.reason.message }))));`;

afterEach(() => {
	rmSync(directory, { recursive: true, force: true });
});

describe("wf agent()", () => {
	it("runs at most WF_CONCURRENCY children through pi-sub, passing model and tools, with the task on stdin", () => {
		const { run, calls } = setup();
		const long = `long ${"x".repeat(200_000)}`;
		const results = run(settle(`agent("one", { model: "p/m:low", tools: "" }), agent("two"), agent("three"), agent("four"), agent(${JSON.stringify(long)})`), { WF_CONCURRENCY: "2" });
		expect(results).toEqual(["one", "two", "three", "four", "long"].map((word) => expect.stringMatching(new RegExp(`^${word} \\d+$`))));
		let running = 0;
		let peak = 0;
		for (const [event] of calls()) peak = Math.max(peak, (running += event === "start" ? 1 : -1));
		expect(peak).toBeLessThanOrEqual(2);
		expect(calls().find(([, , task]) => task === "one")?.[1]).toEqual(["-p", "--model", "p/m:low", "--tools", ""]);
		expect(calls().some(([, , task]) => task === long)).toBe(true);
	});

	it("resolves to the answer's final JSON block and rejects failures, other answers, and calls past WF_MAX_AGENTS", () => {
		const { run } = setup();
		const [json, quoted, cut, text, fail, over] = run(
			settle(`agent("json", { json: true }), agent("quoted", { json: true }), agent("cut", { json: true }), agent("text", { json: true }), agent("fail"), agent("over")`),
			{ WF_MAX_AGENTS: "5" },
		);
		expect(json).toEqual({ pid: expect.any(Number) });
		expect(quoted).toEqual({ quote: "a ```json\n block" });
		expect(cut).toEqual({ error: expect.stringMatching(/JSON/) });
		expect(text).toEqual({ error: expect.stringMatching(/JSON/) });
		expect(fail).toEqual({ error: "exit 1: boom" });
		expect(over).toEqual({ error: "WF_MAX_AGENTS (5) reached" });
	});

	it("reruns only new, changed, and failed calls, keeping one answer per identical call", () => {
		const { run, tasks } = setup();
		const body = settle(`agent("same"), agent("same"), agent("model", { model: "p/m" }), agent("tools", { tools: "read" }), agent("task"), agent("fail")`);
		const first = run(body);
		expect(first[0]).not.toBe(first[1]);
		expect(run(body)).toEqual(first);
		expect(tasks()).toEqual(["fail"]);
		run(body.replace("p/m", "p/n").replace('"read"', '"bash"').replace('agent("task")', 'agent("text")').replace('agent("fail")', 'agent("fail"), agent("new")'));
		expect(tasks().sort()).toEqual(["fail", "model", "new", "text", "tools"]);
	});
});
