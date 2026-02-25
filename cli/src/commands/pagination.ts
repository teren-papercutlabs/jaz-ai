import chalk from 'chalk';
import type { PaginatedResponse } from '../core/api/types.js';
import { fetchAllPages } from '../core/api/pagination.js';

export interface PaginatedOpts {
  all?: boolean;
  limit?: number;
  offset?: number;
  json?: boolean;
}

export interface PaginatedFetchOptions {
  /** Label for progress display (e.g., "Fetching invoices"). */
  label: string;
  /** Default limit for single-page mode (default 100). */
  defaultLimit?: number;
}

export interface PaginatedFetchResult<T> {
  data: T[];
  totalElements: number;
  totalPages: number;
}

/**
 * Shared pagination handler for all CLI list/search commands.
 *
 * Handles:
 *   - --all + --offset conflict detection
 *   - Auto-pagination with concurrent fetching when --all is set
 *   - Progress display on stderr (TTY-aware, suppressed for --json)
 *   - Truncation warnings when dataset exceeds 65,536 items
 *   - Single-page fetch when --all is not set
 *
 * Usage:
 *   const { data, totalElements } = await paginatedFetch(
 *     opts,
 *     (p) => listInvoices(client, p),
 *     { label: 'Fetching invoices' },
 *   );
 */
export async function paginatedFetch<T>(
  opts: PaginatedOpts,
  fetcher: (params: { limit: number; offset: number }) => Promise<PaginatedResponse<T>>,
  options: PaginatedFetchOptions,
): Promise<PaginatedFetchResult<T>> {
  const defaultLimit = options.defaultLimit ?? 100;

  // ── Conflict check ──
  if (opts.all && opts.offset !== undefined) {
    throw new Error('--all and --offset cannot be used together');
  }

  // ── Auto-paginate mode ──
  if (opts.all) {
    const showProgress = !opts.json && process.stderr.isTTY;

    const result = await fetchAllPages<T>(
      (offset, limit) => fetcher({ limit, offset }),
      {
        pageSize: opts.limit ?? 200,
        onProgress: showProgress
          ? (fetched, total) => {
              process.stderr.write(`\r${chalk.dim(`${options.label}... ${fetched.toLocaleString()}/${total.toLocaleString()}`)}`);
            }
          : undefined,
      },
    );

    if (showProgress) {
      process.stderr.write('\r\x1b[K'); // clear progress line
    }

    if (result.truncated && !opts.json) {
      console.error(
        chalk.yellow(
          `Warning: dataset has ${result.totalElements.toLocaleString()} items but only ${result.data.length.toLocaleString()} could be fetched (offset cap: 65,536)`,
        ),
      );
    }

    const pageSize = opts.limit ?? defaultLimit;
    const totalPages = result.truncated
      ? Math.ceil(result.data.length / pageSize)
      : Math.ceil(result.totalElements / pageSize);
    return { data: result.data, totalElements: result.totalElements, totalPages };
  }

  // ── Single-page mode ──
  const res = await fetcher({
    limit: opts.limit ?? defaultLimit,
    offset: opts.offset ?? 0,
  });

  return { data: res.data, totalElements: res.totalElements, totalPages: res.totalPages };
}
