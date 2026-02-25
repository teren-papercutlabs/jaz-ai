import chalk from 'chalk';
import { Command } from 'commander';
import {
  listCustomerCreditNotes,
  getCustomerCreditNote,
  searchCustomerCreditNotes,
  createCustomerCreditNote,
  updateCustomerCreditNote,
  deleteCustomerCreditNote,
  createCustomerCreditNoteRefund,
  listCustomerCreditNoteRefunds,
} from '../core/api/customer-cn.js';
import { apiAction } from './api-action.js';
import { resolveContactFlag, resolveAccountFlag } from './resolve.js';
import { parsePositiveInt, parseNonNegativeInt, parseMoney, parseRate, parseLineItems, readBodyInput, requireFields } from './parsers.js';
import { paginatedFetch } from './pagination.js';

export function registerCustomerCreditNotesCommand(program: Command): void {
  const ccn = program
    .command('customer-credit-notes')
    .description('Manage customer credit notes');

  // ── clio customer-credit-notes list ───────────────────────────
  ccn
    .command('list')
    .description('List customer credit notes')
    .option('--limit <n>', 'Max results (default 100)', parsePositiveInt)
    .option('--offset <n>', 'Offset for pagination', parseNonNegativeInt)
    .option('--all', 'Fetch all pages')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action(apiAction(async (client, opts) => {
      const { data, totalElements, totalPages } = await paginatedFetch(
        opts,
        (p) => listCustomerCreditNotes(client, p),
        { label: 'Fetching customer credit notes' },
      );

      if (opts.json) {
        console.log(JSON.stringify({ totalElements, totalPages, data }, null, 2));
      } else {
        console.log(chalk.bold(`Customer Credit Notes (${data.length} of ${totalElements}):\n`));
        for (const cn of data) {
          const amount = cn.totalAmount !== undefined ? chalk.dim(` $${cn.totalAmount.toFixed(2)}`) : '';
          const status = cn.status === 'DRAFT' ? chalk.yellow(cn.status) : chalk.green(cn.status);
          console.log(`  ${chalk.cyan(cn.resourceId)}  ${cn.reference || '(no ref)'}  ${status}${amount}  ${cn.valueDate}`);
        }
      }
    }));

  // ── clio customer-credit-notes get ────────────────────────────
  ccn
    .command('get <resourceId>')
    .description('Get a customer credit note by resourceId')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action((resourceId: string, opts) => apiAction(async (client) => {
      const res = await getCustomerCreditNote(client, resourceId);
      const cn = res.data;

      if (opts.json) {
        console.log(JSON.stringify(cn, null, 2));
      } else {
        console.log(chalk.bold('Reference:'), cn.reference || '(none)');
        console.log(chalk.bold('ID:'), cn.resourceId);
        console.log(chalk.bold('Status:'), cn.status);
        console.log(chalk.bold('Date:'), cn.valueDate);
        if (cn.totalAmount !== undefined) console.log(chalk.bold('Total:'), cn.totalAmount.toFixed(2));
        if (cn.lineItems?.length) {
          console.log(chalk.bold('Line Items:'));
          for (const li of cn.lineItems) {
            const qty = li.quantity ?? 1;
            const price = li.unitPrice ?? 0;
            console.log(`  - ${li.name}  qty: ${qty}  price: ${price.toFixed(2)}`);
          }
        }
        if (cn.notes) console.log(chalk.bold('Notes:'), cn.notes);
      }
    })(opts));

  // ── clio customer-credit-notes search ─────────────────────────
  ccn
    .command('search')
    .description('Search customer credit notes')
    .option('--ref <reference>', 'Filter by reference (contains)')
    .option('--status <status>', 'Filter by status (DRAFT, UNAPPLIED, APPLIED, VOIDED)')
    .option('--contact <resourceId>', 'Filter by contact name or resourceId')
    .option('--sort <field>', 'Sort field (default: valueDate)')
    .option('--order <direction>', 'Sort order: ASC or DESC (default: DESC)')
    .option('--limit <n>', 'Max results (default 20)', parsePositiveInt)
    .option('--offset <n>', 'Offset for pagination', parseNonNegativeInt)
    .option('--all', 'Fetch all pages')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action(apiAction(async (client, opts) => {
      // Resolve contact by name if provided
      if (opts.contact) {
        const resolved = await resolveContactFlag(client, opts.contact, { silent: opts.json });
        opts.contact = resolved.resourceId;
      }

      const filter: Record<string, unknown> = {};
      if (opts.ref) filter.reference = { contains: opts.ref };
      if (opts.status) filter.status = { eq: opts.status };
      if (opts.contact) filter.contactResourceId = { eq: opts.contact };

      const searchFilter = Object.keys(filter).length > 0 ? filter : undefined;
      const sort = { sortBy: [opts.sort ?? 'valueDate'] as string[], order: (opts.order ?? 'DESC') as 'ASC' | 'DESC' };

      const { data, totalElements, totalPages } = await paginatedFetch(
        opts,
        ({ limit, offset }) => searchCustomerCreditNotes(client, { filter: searchFilter, limit, offset, sort }),
        { label: 'Searching customer credit notes', defaultLimit: 20 },
      );

      if (opts.json) {
        console.log(JSON.stringify({ totalElements, totalPages, data }, null, 2));
      } else {
        if (data.length === 0) {
          console.log(chalk.yellow('No customer credit notes found.'));
          return;
        }
        console.log(chalk.bold(`Found ${data.length} customer credit note(s):\n`));
        for (const cn of data) {
          const amount = cn.totalAmount !== undefined ? chalk.dim(` $${cn.totalAmount.toFixed(2)}`) : '';
          console.log(`  ${chalk.cyan(cn.resourceId)}  ${cn.reference || '(no ref)'}  ${cn.status}${amount}  ${cn.valueDate}`);
        }
      }
    }));

  // ── clio customer-credit-notes create ─────────────────────────
  ccn
    .command('create')
    .description('Create a customer credit note (saves as draft by default)')
    .option('--contact <resourceId>', 'Contact name or resourceId')
    .option('--lines <json>', 'Line items as JSON array', parseLineItems)
    .option('--date <YYYY-MM-DD>', 'Credit note date (valueDate)')
    .option('--ref <reference>', 'Credit note reference/number')
    .option('--notes <text>', 'Notes')
    .option('--currency <code>', 'Foreign currency code (ISO 4217)')
    .option('--exchange-rate <rate>', 'Exchange rate for foreign currency', parseRate)
    .option('--finalize', 'Finalize instead of saving as draft')
    .option('--input <file>', 'Read full request body from JSON file (or pipe via stdin)')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action(apiAction(async (client, opts) => {
      const body = readBodyInput(opts);

      let res;
      if (body) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user-provided JSON, API validates
        res = await createCustomerCreditNote(client, {
          ...body,
          saveAsDraft: body.saveAsDraft ?? !opts.finalize,
        } as any);
      } else {
        requireFields(opts as Record<string, unknown>, [
          { flag: '--contact', key: 'contact' },
          { flag: '--lines', key: 'lines' },
          { flag: '--date', key: 'date' },
        ]);

        // Resolve contact by name
        const contactResolved = await resolveContactFlag(client, opts.contact, { silent: opts.json });
        opts.contact = contactResolved.resourceId;

        const currency = opts.currency
          ? {
              sourceCurrency: opts.currency,
              ...(opts.exchangeRate !== undefined && { exchangeRate: opts.exchangeRate }),
            }
          : undefined;

        res = await createCustomerCreditNote(client, {
          contactResourceId: opts.contact,
          lineItems: opts.lines,
          valueDate: opts.date,
          reference: opts.ref,
          notes: opts.notes,
          currency,
          saveAsDraft: !opts.finalize,
        });
      }

      if (opts.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else {
        const status = opts.finalize ? 'finalized' : 'draft';
        console.log(chalk.green(`Customer credit note created (${status}): ${res.data.reference || res.data.resourceId}`));
        console.log(chalk.bold('ID:'), res.data.resourceId);
      }
    }));

  // ── clio customer-credit-notes update ─────────────────────────
  ccn
    .command('update <resourceId>')
    .description('Update a draft customer credit note')
    .option('--ref <reference>', 'New reference')
    .option('--date <YYYY-MM-DD>', 'New credit note date')
    .option('--lines <json>', 'New line items as JSON array', parseLineItems)
    .option('--notes <text>', 'New notes')
    .option('--input <file>', 'Read full update body from JSON file (or pipe via stdin)')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action((resourceId: string, opts) => apiAction(async (client) => {
      const body = readBodyInput(opts);
      let data: Record<string, unknown>;

      if (body) {
        data = body;
      } else {
        data = {};
        if (opts.ref !== undefined) data.reference = opts.ref;
        if (opts.date !== undefined) data.valueDate = opts.date;
        if (opts.lines !== undefined) data.lineItems = opts.lines;
        if (opts.notes !== undefined) data.notes = opts.notes;
      }

      const res = await updateCustomerCreditNote(client, resourceId, data);

      if (opts.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else {
        console.log(chalk.green(`Customer credit note updated: ${res.data.reference || res.data.resourceId}`));
      }
    })(opts));

  // ── clio customer-credit-notes delete ─────────────────────────
  ccn
    .command('delete <resourceId>')
    .description('Delete/void a customer credit note')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action((resourceId: string, opts) => apiAction(async (client) => {
      await deleteCustomerCreditNote(client, resourceId);

      if (opts.json) {
        console.log(JSON.stringify({ deleted: true, resourceId }));
      } else {
        console.log(chalk.green(`Customer credit note ${resourceId} deleted.`));
      }
    })(opts));

  // ── clio customer-credit-notes refund ───────────────────────
  ccn
    .command('refund <resourceId>')
    .description('Record a refund against a customer credit note')
    .option('--amount <n>', 'Refund amount (bank currency)', parseMoney)
    .option('--account <resourceId>', 'Bank/cash account name or resourceId')
    .option('--date <YYYY-MM-DD>', 'Refund date (valueDate)')
    .option('--transaction-amount <n>', 'Transaction amount (CN currency, if different from bank)', parseMoney)
    .option('--method <method>', 'Refund method (BANK_TRANSFER, CASH, CHEQUE, etc.)', 'BANK_TRANSFER')
    .option('--ref <reference>', 'Refund reference')
    .option('--draft', 'Save as draft instead of finalizing')
    .option('--input <file>', 'Read full refund body from JSON file (or pipe via stdin)')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action((resourceId: string, opts) => apiAction(async (client) => {
      const body = readBodyInput(opts);

      let res;
      if (body) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- user-provided JSON, API validates
        res = await createCustomerCreditNoteRefund(client, resourceId, {
          ...body,
          saveAsDraft: body.saveAsDraft ?? (opts.draft ?? false),
        } as any);
      } else {
        requireFields(opts as Record<string, unknown>, [
          { flag: '--amount', key: 'amount' },
          { flag: '--account', key: 'account' },
          { flag: '--date', key: 'date' },
        ]);

        // Resolve account by name — bank filter for cash methods, any for others
        const cashMethods = new Set(['BANK_TRANSFER', 'CASH', 'CHEQUE']);
        const acctFilter = cashMethods.has(opts.method) ? 'bank' as const : 'any' as const;
        const acctResolved = await resolveAccountFlag(client, opts.account, { filter: acctFilter, silent: opts.json });
        opts.account = acctResolved.resourceId;

        res = await createCustomerCreditNoteRefund(client, resourceId, {
          paymentAmount: opts.amount,
          transactionAmount: opts.transactionAmount ?? opts.amount,
          accountResourceId: opts.account,
          valueDate: opts.date,
          dueDate: opts.date,
          paymentMethod: opts.method,
          reference: opts.ref ?? '',
          saveAsDraft: opts.draft ?? false,
        });
      }

      if (opts.json) {
        console.log(JSON.stringify(res.data, null, 2));
      } else {
        console.log(chalk.green(`Refund recorded for customer credit note ${resourceId}`));
      }
    })(opts));

  // ── clio customer-credit-notes refunds ──────────────────────
  ccn
    .command('refunds <resourceId>')
    .description('List refunds for a customer credit note')
    .option('--api-key <key>', 'API key (overrides stored/env)')
    .option('--json', 'Output as JSON')
    .action((resourceId: string, opts) => apiAction(async (client) => {
      const res = await listCustomerCreditNoteRefunds(client, resourceId);
      const refunds = res.data;

      if (opts.json) {
        console.log(JSON.stringify(refunds, null, 2));
      } else {
        if (!refunds?.length) {
          console.log(chalk.yellow('No refunds found.'));
          return;
        }
        console.log(chalk.bold(`Refunds (${refunds.length}):\n`));
        for (const r of refunds) {
          console.log(`  ${chalk.cyan(r.resourceId)}  ${r.reference || '(no ref)'}  ${r.status}  ${r.refundAmount}  ${r.valueDate}`);
        }
      }
    })(opts));
}
