#!/usr/bin/env node
import { Command } from 'commander';
import { registerAnalyzeCommand } from './commands/analyze.js';
import { registerDetectCommand } from './commands/detect.js';
import { registerSuggestCommand } from './commands/suggest.js';
import { registerApplyCommand } from './commands/apply.js';
import { registerRunCommand } from './commands/run.js';
import { registerStatusCommand } from './commands/status.js';
import { registerInitCommand } from './commands/init.js';

const program = new Command();

program
  .name('autoclaw')
  .description('AI-powered coding improvement system')
  .version('0.1.0');

registerAnalyzeCommand(program);
registerDetectCommand(program);
registerSuggestCommand(program);
registerApplyCommand(program);
registerRunCommand(program);
registerStatusCommand(program);
registerInitCommand(program);

program.parse();

