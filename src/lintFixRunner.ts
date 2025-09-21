import chalk from "chalk";
import { z } from "zod";

const LOG_PREFIX = chalk.gray("[lint-fix]");
const log = {
	info(message: string) {
		console.log(`${LOG_PREFIX} ${chalk.cyan(message)}`);
	},
	detail(message: string) {
		console.log(`${LOG_PREFIX} ${chalk.dim(message)}`);
	},
	success(message: string) {
		console.log(`${LOG_PREFIX} ${chalk.green(message)}`);
	},
	warn(message: string) {
		console.warn(`${LOG_PREFIX} ${chalk.yellow(message)}`);
	},
	error(message: string) {
		console.error(`${LOG_PREFIX} ${chalk.red(message)}`);
	},
};

const models = [
	"opencode/claude-sonnet-4",
	"opencode/claude-opus-4-1",
	"lmstudio/openai/gpt-oss-20b",
	"lmstudio/qwen/qwen3-coder-30b",
	"lmstudio/qwen/qwen3-30b-a3b-2507",
	"opencode/claude-3-5-haiku",
	"opencode/grok-code",
	"opencode/gpt-5",
	"opencode/code-supernova",
	"opencode/kimi-k2",
	"opencode/qwen3-coder",
	"anthropic/claude-3-7-sonnet-20250219",
	"anthropic/claude-opus-4-1-20250805",
	"anthropic/claude-3-haiku-20240307",
	"anthropic/claude-3-5-haiku-20241022",
	"anthropic/claude-opus-4-20250514",
	"anthropic/claude-3-5-sonnet-20241022",
	"anthropic/claude-3-5-sonnet-20240620",
	"anthropic/claude-3-sonnet-20240229",
	"anthropic/claude-sonnet-4-20250514",
	"anthropic/claude-3-opus-20240229",
];

const DEFAULT_BIN = "opencode";
const DEFAULT_ARGS = ["run"];
const DEFAULT_LINT_COMMAND = process.env.ACC_LINT_COMMAND;

export type CommandSpec = string | string[];

function describeCommandSpec(command: CommandSpec): string {
	return Array.isArray(command) ? command.join(" ") : command;
}

function truncate(value: string, maxLength = 80): string {
	return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

const lintTaskArraySchema = z.array(
	z.object({
		lintMessage: z.string(),
		suggestionsText: z.string(),
		loc: z.number().int(),
		column: z.number().int(),
		filePath: z.string(),
	}),
);

const lintTaskResultSchema = z.object({
	status: z.string(),
	summary: z.string(),
});

export type LintTaskItem = z.infer<typeof lintTaskArraySchema>[number];
export type LintTaskResult = z.infer<typeof lintTaskResultSchema>;
export interface RunLintFixesResult {
	issues: LintTaskItem[];
	results: LintTaskResult[];
}

interface BaseCommandOptions {
	cwd?: string;
	env?: Record<string, string>;
}

export interface OpencodeCommandOptions extends BaseCommandOptions {
	bin?: string;
	args?: string[];
	model?: string;
	extraArgs?: string[];
}

export interface GenerateLintTaskItemsOptions extends BaseCommandOptions {
	lintCommand?: CommandSpec;
	opencode?: OpencodeCommandOptions;
}

export interface RunLintFixesOptions extends BaseCommandOptions {
	lintCommand?: CommandSpec;
	parser?: OpencodeCommandOptions;
	fixer?: OpencodeCommandOptions & { concurrency?: number };
}

function toCommandArgs(command: CommandSpec): string[] {
	if (Array.isArray(command)) {
		return command;
	}

	const trimmed = command.trim();
	if (!trimmed) {
		throw new Error("Command string cannot be empty");
	}

	return ["bash", "-lc", trimmed];
}

function resolveLintCommand(command?: CommandSpec): CommandSpec {
	const resolved = command ?? DEFAULT_LINT_COMMAND;
	if (!resolved || (typeof resolved === "string" && resolved.trim() === "")) {
		throw new Error(
			"No lint command provided. Pass lintCommand, set ACC_LINT_COMMAND, or configure the runner.",
		);
	}

	return resolved;
}

async function readStream(
	stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
	if (!stream) {
		return "";
	}

	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let result = "";
	while (true) {
		const { value, done } = await reader.read();
		if (done) {
			break;
		}
		if (value) {
			result += decoder.decode(value, { stream: true });
		}
	}
	result += decoder.decode();
	return result;
}

function pickBaseOptions(options: BaseCommandOptions = {}) {
	const { cwd, env } = options;
	return { cwd, env } satisfies BaseCommandOptions;
}

async function runProcess(args: string[], options: BaseCommandOptions = {}) {
	const subprocess = Bun.spawn(args, {
		...pickBaseOptions(options),
		stdio: ["inherit", "pipe", "pipe"],
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		readStream(subprocess.stdout),
		readStream(subprocess.stderr),
		subprocess.exited,
	]);

	return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

function extractJsonCandidate(output: string) {
	const trimmed = output.trim();
	if (!trimmed) {
		return trimmed;
	}

	try {
		JSON.parse(trimmed);
		return trimmed;
	} catch (error) {
		const firstArray = trimmed.indexOf("[");
		const firstObject = trimmed.indexOf("{");
		const startCandidates = [firstArray, firstObject].filter((idx) => idx >= 0);
		if (startCandidates.length === 0) {
			throw error;
		}

		const start = Math.min(...startCandidates);
		const lastArray = trimmed.lastIndexOf("]");
		const lastObject = trimmed.lastIndexOf("}");
		const endCandidates = [lastArray, lastObject].filter((idx) => idx >= 0);
		if (endCandidates.length === 0) {
			throw error;
		}

		const end = Math.max(...endCandidates) + 1;
		const candidate = trimmed.slice(start, end);
		JSON.parse(candidate);
		return candidate;
	}
}

async function invokeOpencode(
	prompt: string,
	options: OpencodeCommandOptions = {},
): Promise<string> {
	const bin = options.bin ?? DEFAULT_BIN;
	const baseArgs = [...(options.args ?? DEFAULT_ARGS)];
	const extraArgs = [...(options.extraArgs ?? [])];
	const displayArgs = [bin, ...baseArgs];
	if (options.model) {
		displayArgs.push("--model", options.model);
	}
	if (extraArgs.length > 0) {
		displayArgs.push(...extraArgs);
	}
	log.detail(`Invoking ${displayArgs.join(" ")}`);

	const args = [bin, ...baseArgs, ...extraArgs, prompt].filter(
		(value): value is string => typeof value === "string",
	);

	if (options.model) {
		args.splice(1 + baseArgs.length, 0, "--model", options.model);
	}
	const { stdout, stderr, exitCode } = await runProcess(
		args,
		pickBaseOptions(options),
	);
	if (exitCode !== 0) {
		log.error(
			`Model invocation failed with code ${exitCode} (${stderr || stdout || "unknown error"}).`,
		);
		throw new Error(
			`Model invocation failed with code ${exitCode}: ${stderr || stdout || "unknown error"}`,
		);
	}
	log.detail("Model invocation completed successfully.");

	return stdout;
}

export async function generateLintTaskPrompt(lintOut: string) {
	return `convert the following linting output to JSON matching this schema: ${JSON.stringify(
		z.toJSONSchema(lintTaskArraySchema),
	)}\n\nLint output:\n${lintOut}`;
}

export async function generateLintTaskItems(
	options: GenerateLintTaskItemsOptions,
): Promise<LintTaskItem[]> {
	const resolvedLintCommand = resolveLintCommand(options.lintCommand);
	log.info(`Running lint command: ${describeCommandSpec(resolvedLintCommand)}`);
	const lintCommandArgs = toCommandArgs(resolvedLintCommand);
	const { stdout, stderr, exitCode } = await runProcess(
		lintCommandArgs,
		pickBaseOptions(options),
	);
	if (exitCode !== 0) {
		log.warn(
			`Lint command exited with code ${exitCode} (${stderr || stdout || "no output"}).`,
		);
		throw new Error(
			`Lint command failed with code ${exitCode}: ${stderr || stdout}`,
		);
	}
	log.detail("Lint command completed successfully.");

	const lintOutput = [stdout, stderr]
		.filter((part) => part.length > 0)
		.join("\n");
	if (!lintOutput) {
		log.info("No lint output produced; skipping lint fix parsing.");
		return [];
	}
	log.detail(`Collected lint output (${lintOutput.length} chars).`);

	const prompt = await generateLintTaskPrompt(lintOutput);
	log.info(
		`Invoking parser model ${options.opencode?.model ?? "default"} for lint issue extraction.`,
	);
	const normalizedOutput = await invokeOpencode(prompt, options.opencode);

	const jsonCandidate = extractJsonCandidate(normalizedOutput);
	const parsed = lintTaskArraySchema.safeParse(JSON.parse(jsonCandidate));
	if (!parsed.success) {
		throw new Error(`Failed to parse lint task items: ${parsed.error.message}`);
	}
	log.success(`Identified ${parsed.data.length} lint issue(s) to fix.`);

	return parsed.data;
}

function buildFixPrompt(issue: LintTaskItem) {
	return [
		"You are an experienced engineer improving a codebase.",
		"Resolve exactly one ESLint finding using the provided schema.",
		"Only modify the specified file and keep changes minimal.",
		"Repository guardrails:",
		"- Keep changes minimal and strongly typed.",
		"- NEVER use any.",
		"- NEVER take shortcuts.",
		"- Do not downgrade types or disable lint rules.",
		"Lint finding details:",
		`- File: ${issue.filePath}`,
		`- Location: line ${issue.loc}, column ${issue.column}`,
		`- Message: ${issue.lintMessage}`,
		issue.suggestionsText ? `Suggestions:\n${issue.suggestionsText}` : "",
		`Respond with JSON matching this schema: ${JSON.stringify(
			z.toJSONSchema(lintTaskResultSchema),
		)}`,
	]
		.filter(Boolean)
		.join("\n");
}

async function runFixForIssue(
	issue: LintTaskItem,
	options: OpencodeCommandOptions = {},
): Promise<LintTaskResult> {
	log.info(
		`Applying fix for ${issue.filePath}:${issue.loc} — ${truncate(issue.lintMessage)}`,
	);
	const prompt = buildFixPrompt(issue);
	const output = await invokeOpencode(prompt, options);

	const jsonCandidate = extractJsonCandidate(output);
	const parsed = lintTaskResultSchema.safeParse(JSON.parse(jsonCandidate));
	if (!parsed.success) {
		log.error(`Failed to parse lint fix result: ${parsed.error.message}`);
		throw new Error(`Failed to parse lint fix result: ${parsed.error.message}`);
	}
	const summaryPreview = truncate(parsed.data.summary, 120);
	log.success(
		`Fix result for ${issue.filePath}:${issue.loc}: ${parsed.data.status} (${summaryPreview})`,
	);

	return parsed.data;
}

async function runWithConcurrency<T, R>(
	items: T[],
	worker: (item: T, index: number) => Promise<R>,
	concurrency: number,
): Promise<R[]> {
	if (concurrency <= 0) {
		throw new Error("Concurrency must be greater than 0");
	}

	const results: R[] = new Array(items.length);
	let cursor = 0;

	async function runWorker() {
		while (true) {
			const index = cursor++;
			if (index >= items.length) {
				break;
			}
			const item = items[index];
			if (item === undefined) {
				throw new Error(`Unexpected undefined item at index ${index}`);
			}
			results[index] = await worker(item, index);
		}
	}

	const workers = Array.from(
		{ length: Math.min(concurrency, items.length) },
		runWorker,
	);
	await Promise.all(workers);
	return results;
}

export async function runLintFixes(
	options: RunLintFixesOptions,
): Promise<RunLintFixesResult> {
	const lintCommand = resolveLintCommand(options.lintCommand);
	log.info("Starting lint fix run.");
	log.detail(`Using lint command: ${describeCommandSpec(lintCommand)}`);
	const issues = await generateLintTaskItems({
		lintCommand,
		cwd: options.cwd,
		env: options.env,
		opencode: options.parser,
	});

	if (issues.length === 0) {
		log.success("No lint issues detected. Nothing to fix.");
		return { issues, results: [] as LintTaskResult[] };
	}
	log.success(`Identified ${issues.length} lint issue(s) to address.`);

	const concurrency = options.fixer?.concurrency ?? 1;
	log.detail(`Applying fixes with concurrency ${concurrency}.`);
	const results = await runWithConcurrency(
		issues,
		(issue) => runFixForIssue(issue, options.fixer),
		concurrency,
	);
	const statusCounts = results.reduce<Record<string, number>>((acc, result) => {
		acc[result.status] = (acc[result.status] ?? 0) + 1;
		return acc;
	}, {});
	const statusSummary =
		Object.entries(statusCounts)
			.map(([status, count]) => `${status}: ${count}`)
			.join(", ") || "no results";
	log.success(`Completed lint fixes. Status breakdown — ${statusSummary}.`);

	return { issues, results };
}

export const internal = {
	models,
	lintTaskArraySchema,
	lintTaskResultSchema,
	toCommandArgs,
	resolveLintCommand,
	invokeOpencode,
	runFixForIssue,
	runWithConcurrency,
};
