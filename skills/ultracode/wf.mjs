import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const piSub = fileURLToPath(new URL("../../bin/pi-sub.mjs", import.meta.url));
const limit = Number(process.env.WF_CONCURRENCY ?? 16);
const cap = Number(process.env.WF_MAX_AGENTS ?? 100);
const outDir = join(dirname(process.argv[1]), "out");
mkdirSync(outDir, { recursive: true });
const copies = new Map();
const waiting = [];
let active = 0;
let started = 0;

export async function agent(task, { model, tools, json } = {}) {
	const n = ++started;
	if (n > cap) throw new Error(`WF_MAX_AGENTS (${cap}) reached`);
	const prompt = json ? `${task}\n\nEnd your reply with the result as JSON in a \`\`\`json fenced block.` : task;
	const key = createHash("sha256").update(JSON.stringify([prompt, model, tools])).digest("hex").slice(0, 16);
	// Identical calls are independent samples, such as votes, so each occurrence keeps its own answer.
	const copy = (copies.get(key) ?? 0) + 1;
	copies.set(key, copy);
	const file = join(outDir, `${key}-${copy}.md`);
	const cached = existsSync(file);
	console.log(`#${n} ${cached ? "cached" : "start"}: ${task.split("\n")[0].slice(0, 80)}`);
	try {
		let answer = "";
		if (cached) answer = readFileSync(file, "utf8");
		else {
			// A finishing agent hands its slot straight to the next waiter, so `active` never exceeds `limit`.
			if (active < limit) active++;
			else await new Promise((resolve) => waiting.push(resolve));
			const startedAt = Date.now();
			const args = ["-p", ...(model ? ["--model", model] : []), ...(tools ? ["--tools", tools] : []), "--", prompt];
			const child = spawn(process.execPath, [piSub, ...args], { stdio: ["ignore", "pipe", "pipe"] });
			let stderr = "";
			child.stdout.setEncoding("utf8").on("data", (chunk) => (answer += chunk));
			child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
			const code = await new Promise((resolve, reject) => child.on("error", reject).on("close", resolve)).finally(() => {
				const next = waiting.shift();
				if (next) next();
				else active--;
			});
			if (code !== 0) throw new Error(`exit ${code}: ${stderr.trim().slice(-300)}`);
			console.log(`#${n} done in ${Math.round((Date.now() - startedAt) / 1000)}s: ${file}`);
		}
		let result = answer.trim();
		if (json) {
			const fence = [...answer.matchAll(/```json\s*\n([\s\S]*?)```/g)].at(-1);
			result = JSON.parse(fence ? fence[1] : answer);
		}
		// Saved only once the answer parses, so a rerun retries failures.
		if (!cached) writeFileSync(file, answer);
		return result;
	} catch (error) {
		console.log(`#${n} failed: ${error.message}`);
		throw error;
	}
}
