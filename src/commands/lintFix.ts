import chalk from "chalk";
import { Command } from "commander";
import {
	type OpencodeCommandOptions,
	type RunLintFixesOptions,
	runLintFixes,
} from "../lintFixRunner";

function buildOpencodeOptions(
	bin?: string,
	model?: string,
	extraArgs?: string[],
): OpencodeCommandOptions | undefined {
	if (!bin && !model && (!extraArgs || extraArgs.length === 0)) {
		return undefined;
	}

	return {
		bin,
		model,
		extraArgs: extraArgs?.length ? extraArgs : undefined,
	} satisfies OpencodeCommandOptions;
}

function parseExtraArgs(option?: string[]): string[] | undefined {
	return option && option.length > 0 ? option : undefined;
}

export const lintFixCommand = new Command("lintfix")
	.description("Normalize lint output with opencode and apply AI-powered fixes")
	.argument("[lintCommand]", "Lint command to execute, e.g. 'pnpm lint'")
	.option(
		"-p, --parallel <count>",
		"Number of lint issues to fix concurrently",
		"1",
	)
	.option("--opencode-bin <bin>", "Opencode binary to invoke", "opencode")
	.option("--parser-model <model>", "Model for lint normalization")
	.option("--fix-model <model>", "Model for lint fixing")
	.option(
		"--parser-extra <args...>",
		"Additional arguments forwarded to the normalization opencode call",
	)
	.option(
		"--fix-extra <args...>",
		"Additional arguments forwarded to the fixer opencode call",
	)
	.action(async (lintCommandArg: string | undefined, options) => {
		const parallel = Number.parseInt(options.parallel, 10);
		if (!Number.isFinite(parallel) || parallel <= 0) {
			console.error(
				chalk.red(
					`Invalid parallel value '${options.parallel}'. Use a positive number.`,
				),
			);
			process.exitCode = 1;
			return;
		}

		const parserOptions = buildOpencodeOptions(
			options.opencodeBin,
			options.parserModel,
			parseExtraArgs(options.parserExtra),
		);
		const fixerOptions = buildOpencodeOptions(
			options.opencodeBin,
			options.fixModel,
			parseExtraArgs(options.fixExtra),
		);

		const runOptions: RunLintFixesOptions = {
			lintCommand: lintCommandArg,
			parser: parserOptions,
			fixer: {
				...(fixerOptions ?? {}),
				concurrency: parallel,
			},
		};

		console.log(chalk.cyan.bold("Running lint fixes..."));

		try {
			const { issues, results } = await runLintFixes(runOptions);

			if (issues.length === 0) {
				console.log(chalk.green("No lint issues found. Nothing to fix."));
				return;
			}

			console.log(
				chalk.gray(
					`Processed ${issues.length} lint issue${issues.length === 1 ? "" : "s"}.`,
				),
			);

			let unresolved = 0;
			issues.forEach((issue, index) => {
				const result = results[index];
				const status = result?.status ?? "unknown";
				const isResolved = status.toLowerCase() === "resolved";
				if (!isResolved) {
					unresolved += 1;
				}

				const statusColor = isResolved ? chalk.green : chalk.yellow;
				console.log(
					`${statusColor(`[${status}]`)} ${chalk.bold(issue.filePath)}:${issue.loc}:${issue.column} – ${issue.lintMessage}`,
				);
				if (result?.summary) {
					console.log(chalk.gray(`  • ${result.summary}`));
				}
			});

			if (unresolved === 0) {
				console.log(chalk.green.bold("All lint findings resolved."));
			} else {
				console.log(
					chalk.yellow.bold(
						`${unresolved} lint issue${unresolved === 1 ? " remains" : "s remain"}. Check logs for details.`,
					),
				);
				process.exitCode = 1;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(chalk.red("Failed to run lint fixes:"), message);
			process.exitCode = 1;
		}
	});
