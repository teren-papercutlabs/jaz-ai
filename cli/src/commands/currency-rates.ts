import chalk from 'chalk';
import { Command } from 'commander';
import { listCurrencyRates, addCurrencyRate, updateCurrencyRate } from '../core/api/currencies.js';
import { apiAction } from './api-action.js';
import { parsePositiveInt, parseNonNegativeInt, requireFields } from './parsers.js';
import { paginatedFetch } from './pagination.js';

export function registerCurrencyRatesCommand(program: Command): void {
  const cmd = program
    .command('currency-rates')
    .description('Manage currency exchange rates');

  // ── clio currency-rates list ──────────────────────────────────
  cmd
    .command('list <currencyCode>')
    .description('List exchange rates for a currency')
    .option('--limit <n>', 'Max results (default 100)', parsePositiveInt)
    .option('--offset <n>', 'Offset for pagination', parseNonNegativeInt)
    .option('--all', 'Fetch all pages')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action((currencyCode: string, opts) => apiAction(async (client) => {
      const code = currencyCode.toUpperCase();
      const { data, totalElements, totalPages } = await paginatedFetch(
        opts,
        (p) => listCurrencyRates(client, code, p),
        { label: `Fetching ${code} rates` },
      );

      if (opts.json) {
        console.log(JSON.stringify({ totalElements, totalPages, data }, null, 2));
      } else {
        console.log(chalk.bold(`${code} Rates (${data.length} of ${totalElements}):\n`));
        for (const r of data) {
          const to = r.rateApplicableTo || '(open)';
          console.log(`  ${chalk.cyan(r.resourceId)}  ${chalk.bold(String(r.rate))}  ${r.rateApplicableFrom} — ${to}`);
        }
      }
    })(opts));

  // ── clio currency-rates add ───────────────────────────────────
  cmd
    .command('add <currencyCode>')
    .description('Add an exchange rate for a currency')
    .option('--rate <number>', 'Exchange rate', parseFloat)
    .option('--from <YYYY-MM-DD>', 'Rate applicable from date')
    .option('--to <YYYY-MM-DD>', 'Rate applicable to date (optional)')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action((currencyCode: string, opts) => apiAction(async (client) => {
      requireFields(opts as Record<string, unknown>, [
        { flag: '--rate', key: 'rate' },
        { flag: '--from', key: 'from' },
      ]);

      const code = currencyCode.toUpperCase();
      const data: { rate: number; rateApplicableFrom: string; rateApplicableTo?: string } = {
        rate: opts.rate,
        rateApplicableFrom: opts.from,
      };
      if (opts.to) data.rateApplicableTo = opts.to;

      const res = await addCurrencyRate(client, code, data);

      if (opts.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else {
        console.log(chalk.green(`Rate added for ${code}: ${opts.rate} (from ${opts.from})`));
      }
    })(opts));

  // ── clio currency-rates update ────────────────────────────────
  cmd
    .command('update <currencyCode> <rateResourceId>')
    .description('Update an exchange rate')
    .option('--rate <number>', 'Exchange rate', parseFloat)
    .option('--from <YYYY-MM-DD>', 'Rate applicable from date')
    .option('--to <YYYY-MM-DD>', 'Rate applicable to date (optional)')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action((currencyCode: string, rateResourceId: string, opts) => apiAction(async (client) => {
      requireFields(opts as Record<string, unknown>, [
        { flag: '--rate', key: 'rate' },
        { flag: '--from', key: 'from' },
      ]);

      const code = currencyCode.toUpperCase();
      const data: { rate: number; rateApplicableFrom: string; rateApplicableTo?: string } = {
        rate: opts.rate,
        rateApplicableFrom: opts.from,
      };
      if (opts.to) data.rateApplicableTo = opts.to;

      const res = await updateCurrencyRate(client, code, rateResourceId, data);

      if (opts.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else {
        console.log(chalk.green(`Rate updated for ${code}: ${opts.rate}`));
      }
    })(opts));
}
