import { Command } from 'commander';
import chalk from 'chalk';
import os from 'os';
import { formatBytes } from '../utils/format';

export const infoCommand = new Command('info')
  .description('Display system information')
  .option('-j, --json', 'Output as JSON')
  .action((options) => {
    const info = {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
      },
      uptime: os.uptime(),
      bunVersion: Bun.version,
      nodeVersion: process.version
    };

    if (options.json) {
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.log(chalk.bold.cyan('System Information'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`${chalk.yellow('Platform:')} ${info.platform}`);
      console.log(`${chalk.yellow('Architecture:')} ${info.arch}`);
      console.log(`${chalk.yellow('Hostname:')} ${info.hostname}`);
      console.log(`${chalk.yellow('CPUs:')} ${info.cpus}`);
      console.log(`${chalk.yellow('Memory:')} ${formatBytes(info.memory.used)} / ${formatBytes(info.memory.total)}`);
      console.log(`${chalk.yellow('Uptime:')} ${Math.floor(info.uptime / 3600)}h ${Math.floor((info.uptime % 3600) / 60)}m`);
      console.log(`${chalk.yellow('Bun Version:')} ${info.bunVersion}`);
    }
  });