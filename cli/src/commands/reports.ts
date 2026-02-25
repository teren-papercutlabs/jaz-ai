import chalk from 'chalk';
import { Command } from 'commander';
import {
  generateTrialBalance,
  generateBalanceSheet,
  generateProfitAndLoss,
  generateCashflow,
  generateArSummary,
  generateApSummary,
  generateCashBalance,
} from '../core/api/reports.js';
import { apiAction } from './api-action.js';
import { todayLocal } from './parsers.js';

const REPORT_TYPES = [
  'trial-balance', 'balance-sheet', 'profit-loss',
  'cashflow', 'aged-ar', 'aged-ap', 'cash-balance',
] as const;

type ReportType = typeof REPORT_TYPES[number];

export function registerReportsCommand(program: Command): void {
  const reports = program
    .command('reports')
    .description('Generate financial reports');

  reports
    .command('generate <type>')
    .description(`Generate a report (${REPORT_TYPES.join(', ')})`)
    .option('--from <YYYY-MM-DD>', 'Start date (for P&L, cashflow)')
    .option('--to <YYYY-MM-DD>', 'End/snapshot date')
    .option('--currency <code>', 'Currency code override')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action((type: string, opts) => {
      if (!REPORT_TYPES.includes(type as ReportType)) {
        console.error(chalk.red(`Invalid report type: ${type}`));
        console.error(chalk.dim(`Valid types: ${REPORT_TYPES.join(', ')}`));
        process.exit(1);
      }

      return apiAction(async (client) => {
        const today = todayLocal();
        let result: { data: unknown };

        switch (type as ReportType) {
          case 'trial-balance':
            result = await generateTrialBalance(client, {
              endDate: opts.to ?? today,
              currencyCode: opts.currency,
            });
            break;

          case 'balance-sheet':
            result = await generateBalanceSheet(client, {
              primarySnapshotDate: opts.to ?? today,
              currencyCode: opts.currency,
            });
            break;

          case 'profit-loss':
            result = await generateProfitAndLoss(client, {
              startDate: opts.from ?? `${today.slice(0, 4)}-01-01`,
              endDate: opts.to ?? today,
              currencyCode: opts.currency,
            });
            break;

          case 'cashflow':
            result = await generateCashflow(client, {
              startDate: opts.from ?? `${today.slice(0, 4)}-01-01`,
              endDate: opts.to ?? today,
            });
            break;

          case 'aged-ar':
            result = await generateArSummary(client, {
              startDate: opts.from ?? `${(opts.to ?? today).slice(0, 4)}-01-01`,
              endDate: opts.to ?? today,
            });
            break;

          case 'aged-ap':
            result = await generateApSummary(client, {
              startDate: opts.from ?? `${(opts.to ?? today).slice(0, 4)}-01-01`,
              endDate: opts.to ?? today,
            });
            break;

          case 'cash-balance':
            result = await generateCashBalance(client, {
              endDate: opts.to ?? today,
            });
            break;
        }

        if (opts.json) {
          console.log(JSON.stringify(result!.data, null, 2));
        } else {
          // Reports have complex nested structures — default to formatted JSON for human output too
          console.log(chalk.bold(`${type} Report:\n`));
          console.log(JSON.stringify(result!.data, null, 2));
        }
      })(opts);
    });
}
