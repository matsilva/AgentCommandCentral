#!/usr/bin/env bun

import { Command } from "commander";
import { lintFixCommand } from "./commands/lintFix";

const program = new Command();

program
	.name("acc")
	.description("Agent Command Central - Various CLI utilities")
	.version("0.1.0");

program.addCommand(lintFixCommand);

program.parse();
