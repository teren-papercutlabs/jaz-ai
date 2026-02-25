import chalk from 'chalk';
import { Command } from 'commander';
import {
  listJournals,
  searchJournals,
  createJournal,
  getJournal,
  updateJournal,
  deleteJournal,
} from '../core/api/journals.js';
import { apiAction } from './api-action.js';
import { parsePositiveInt, parseNonNegativeInt, parseJournalEntries, readBodyInput, requireFields } from './parsers.js';
import { paginatedFetch } from './pagination.js';

export function registerJournalsCommand(program: Command): void {
  const journals = program
    .command('journals')
    .description('Manage journal entries');

  // ── clio journals list ──────────────────────────────────────────
  journals
    .command('list')
    .description('List journals')
    .option('--limit <n>', 'Max results (default 100)', parsePositiveInt)
    .option('--offset <n>', 'Offset for pagination', parseNonNegativeInt)
    .option('--all', 'Fetch all pages')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action(apiAction(async (client, opts) => {
      const { data, totalElements, totalPages } = await paginatedFetch(
        opts,
        (p) => listJournals(client, p),
        { label: 'Fetching journals' },
      );

      if (opts.json) {
        console.log(JSON.stringify({ totalElements, totalPages, data }, null, 2));
      } else {
        console.log(chalk.bold(`Journals (${data.length} of ${totalElements}):\n`));
        for (const j of data) {
          const status = j.status === 'DRAFT' ? chalk.yellow(j.status) : chalk.green(j.status);
          const entries = j.journalEntries?.length ?? 0;
          console.log(`  ${chalk.cyan(j.resourceId)}  ${j.reference || '(no ref)'}  ${status}  ${j.valueDate}  ${chalk.dim(`${entries} entries`)}`);
        }
      }
    }));

  // ── clio journals search ────────────────────────────────────────
  journals
    .command('search')
    .description('Search journals with filters')
    .option('--ref <reference>', 'Filter by reference (contains)')
    .option('--from <YYYY-MM-DD>', 'Filter from date (inclusive)')
    .option('--to <YYYY-MM-DD>', 'Filter to date (inclusive)')
    .option('--status <status>', 'Filter by status (DRAFT, FINALIZED)')
    .option('--sort <field>', 'Sort field (default: valueDate)')
    .option('--order <direction>', 'Sort order: ASC or DESC (default: DESC)')
    .option('--limit <n>', 'Max results (default 20)', parsePositiveInt)
    .option('--offset <n>', 'Offset for pagination', parseNonNegativeInt)
    .option('--all', 'Fetch all pages')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action(apiAction(async (client, opts) => {
      const filter: Record<string, unknown> = {};
      if (opts.ref) filter.reference = { contains: opts.ref };
      if (opts.status) filter.status = { eq: opts.status };
      if (opts.from || opts.to) {
        const dateFilter: Record<string, string> = {};
        if (opts.from) dateFilter.gte = opts.from;
        if (opts.to) dateFilter.lte = opts.to;
        filter.valueDate = dateFilter;
      }

      const searchFilter = Object.keys(filter).length > 0 ? filter : undefined;
      const sort = { sortBy: [opts.sort ?? 'valueDate'] as string[], order: (opts.order ?? 'DESC') as 'ASC' | 'DESC' };

      const { data, totalElements, totalPages } = await paginatedFetch(
        opts,
        ({ limit, offset }) => searchJournals(client, { filter: searchFilter, limit, offset, sort }),
        { label: 'Searching journals', defaultLimit: 20 },
      );

      if (opts.json) {
        console.log(JSON.stringify({ totalElements, totalPages, data }, null, 2));
      } else {
        if (data.length === 0) {
          console.log(chalk.yellow('No journals found.'));
          return;
        }
        console.log(chalk.bold(`Found ${data.length} journal(s):\n`));
        for (const j of data) {
          const status = j.status === 'DRAFT' ? chalk.yellow(j.status) : chalk.green(j.status);
          console.log(`  ${chalk.cyan(j.resourceId)}  ${j.reference || '(no ref)'}  ${status}  ${j.valueDate}`);
        }
      }
    }));

  // ── clio journals create ────────────────────────────────────────
  journals
    .command('create')
    .description('Create a journal entry (saves as draft by default)')
    .option('--entries <json>', 'Journal entries as JSON array (each: accountResourceId, amount, type: DEBIT|CREDIT)', parseJournalEntries)
    .option('--date <YYYY-MM-DD>', 'Journal date (valueDate)')
    .option('--ref <reference>', 'Journal reference')
    .option('--notes <text>', 'Notes')
    .option('--finalize', 'Finalize instead of saving as draft')
    .option('--input <file>', 'Read full request body from JSON file (or pipe via stdin)')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action(apiAction(async (client, opts) => {
      const body = readBodyInput(opts);

      let res;
      if (body) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user-provided JSON, API validates
        res = await createJournal(client, {
          ...body,
          saveAsDraft: body.saveAsDraft ?? !opts.finalize,
        } as any);
      } else {
        requireFields(opts as Record<string, unknown>, [
          { flag: '--entries', key: 'entries' },
          { flag: '--date', key: 'date' },
        ]);
        res = await createJournal(client, {
          journalEntries: opts.entries,
          valueDate: opts.date,
          reference: opts.ref,
          notes: opts.notes,
          saveAsDraft: !opts.finalize,
        });
      }

      if (opts.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else {
        const status = opts.finalize ? 'finalized' : 'draft';
        console.log(chalk.green(`Journal created (${status}): ${res.data.reference || res.data.resourceId}`));
        console.log(chalk.bold('ID:'), res.data.resourceId);
      }
    }));

  // ── clio journals get ──────────────────────────────────────────
  journals
    .command('get <resourceId>')
    .description('Get a journal by ID')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action((resourceId: string, opts) => apiAction(async (client) => {
      const { data: j } = await getJournal(client, resourceId);

      if (opts.json) {
        console.log(JSON.stringify(j, null, 2));
      } else {
        const status = j.status === 'DRAFT' ? chalk.yellow(j.status)
          : j.status === 'VOID' ? chalk.red(j.status)
          : chalk.green(j.status);
        console.log(chalk.bold('Journal:'), j.reference || '(no ref)');
        console.log(chalk.bold('  ID:'), chalk.cyan(j.resourceId));
        console.log(chalk.bold('  Status:'), status);
        console.log(chalk.bold('  Date:'), j.valueDate);
        console.log(chalk.bold('  Notes:'), j.notes || '—');
        if (j.journalEntries?.length) {
          console.log(chalk.bold(`  Entries (${j.journalEntries.length}):`));
          for (const e of j.journalEntries) {
            // GET response has richer fields than the create JournalEntry type
            const entry = e as unknown as Record<string, unknown>;
            const acct = entry.organizationAccountResourceId ?? e.accountResourceId;
            const dr = entry.debitAmount;
            const cr = entry.creditAmount;
            const amt = dr != null ? `DR ${dr}` : `CR ${cr}`;
            console.log(`    ${chalk.dim(String(acct).slice(0, 12) + '...')}  ${amt}  ${e.description || ''}`);
          }
        }
      }
    })(opts));

  // ── clio journals update ──────────────────────────────────────
  journals
    .command('update <resourceId>')
    .description('Update a journal')
    .option('--entries <json>', 'Journal entries as JSON array', parseJournalEntries)
    .option('--date <YYYY-MM-DD>', 'Journal date (valueDate)')
    .option('--ref <reference>', 'Journal reference')
    .option('--notes <text>', 'Notes')
    .option('--finalize', 'Finalize instead of saving as draft')
    .option('--input <file>', 'Read full request body from JSON file (or pipe via stdin)')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action((resourceId: string, opts) => apiAction(async (client) => {
      const body = readBodyInput(opts);

      let res;
      if (body) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user-provided JSON, API validates
        res = await updateJournal(client, resourceId, {
          ...body,
          saveAsDraft: body.saveAsDraft ?? !opts.finalize,
        } as any);
      } else {
        const data: Record<string, unknown> = {};
        if (opts.entries) data.journalEntries = opts.entries;
        if (opts.date) data.valueDate = opts.date;
        if (opts.ref) data.reference = opts.ref;
        if (opts.notes) data.notes = opts.notes;
        data.saveAsDraft = !opts.finalize;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial update fields, API validates
        res = await updateJournal(client, resourceId, data as any);
      }

      if (opts.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else {
        const status = opts.finalize ? 'finalized' : 'draft';
        console.log(chalk.green(`Journal updated (${status}): ${res.data.reference || res.data.resourceId}`));
      }
    })(opts));

  // ── clio journals delete ────────────────────────────────────────
  journals
    .command('delete <resourceId>')
    .description('Delete/void a journal')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action((resourceId: string, opts) => apiAction(async (client) => {
      await deleteJournal(client, resourceId);

      if (opts.json) {
        console.log(JSON.stringify({ deleted: true, resourceId }));
      } else {
        console.log(chalk.green(`Journal ${resourceId} deleted.`));
      }
    })(opts));
}
