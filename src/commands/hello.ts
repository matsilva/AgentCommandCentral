import { Command } from 'commander';
import chalk from 'chalk';

export const helloCommand = new Command('hello')
  .description('Say hello')
  .option('-n, --name <name>', 'Name to greet', 'World')
  .action((options) => {
    console.log(chalk.bold.green(`Hello, ${options.name}!`));
    console.log(chalk.gray('Welcome to Agent Command Central'));
  });