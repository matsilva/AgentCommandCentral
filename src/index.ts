#!/usr/bin/env bun

import { Command } from "commander";
import chalk from "chalk";
import { helloCommand } from "./commands/hello";
import { infoCommand } from "./commands/info";

const program = new Command();

program
  .name("acc")
  .description("Agent Command Central - Various CLI utilities")
  .version("0.1.0");

program.addCommand(helloCommand);
program.addCommand(infoCommand);

program.parse();

