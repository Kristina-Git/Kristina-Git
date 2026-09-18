import { parse } from "csv-parse/sync";
import { CreateClientInput } from "./inviteService";

const COLUMN_ALIASES: Record<string, keyof CreateClientInput> = {
  fullname: "fullName",
  name: "fullName",
  email: "email",
  clientcode: "clientCode",
  code: "clientCode",
  jurisdiction: "jurisdiction",
  country: "jurisdiction",
};

export interface ParsedClientRow {
  row: number;
  client?: CreateClientInput;
  error?: string;
}

/** Parses pasted client data (from a CSV export or copy-pasted straight out of Excel/Sheets,
 * which uses tabs) into invite-ready rows. Expects a header row; recognizes a few common
 * spellings for each column so it's forgiving of how someone's spreadsheet happens to be
 * labelled. `email` and `fullName` (or `name`) are required; `clientCode`/`jurisdiction` are
 * optional. */
export function parseClientRows(text: string): ParsedClientRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const delimiter = trimmed.split("\n")[0].includes("\t") ? "\t" : ",";
  const records: string[][] = parse(trimmed, {
    delimiter,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  if (records.length === 0) return [];

  const header = records[0].map((h) => h.trim().toLowerCase());
  const columnIndex: Partial<Record<keyof CreateClientInput, number>> = {};
  header.forEach((h, i) => {
    const field = COLUMN_ALIASES[h];
    if (field && columnIndex[field] === undefined) columnIndex[field] = i;
  });

  if (columnIndex.email === undefined || columnIndex.fullName === undefined) {
    return [
      {
        row: 1,
        error:
          'Header row must include "fullName" (or "name") and "email" columns. Optional: clientCode, jurisdiction.',
      },
    ];
  }

  const results: ParsedClientRow[] = [];
  for (let i = 1; i < records.length; i++) {
    const cols = records[i];
    const rowNum = i + 1;
    const email = cols[columnIndex.email]?.trim();
    const fullName = cols[columnIndex.fullName]?.trim();
    const clientCode = columnIndex.clientCode !== undefined ? cols[columnIndex.clientCode]?.trim() : undefined;
    const jurisdiction =
      columnIndex.jurisdiction !== undefined ? cols[columnIndex.jurisdiction]?.trim() : undefined;

    if (!email || !fullName) {
      results.push({ row: rowNum, error: "Missing required fullName or email" });
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({ row: rowNum, error: `"${email}" doesn't look like a valid email` });
      continue;
    }
    results.push({
      row: rowNum,
      client: { fullName, email, clientCode: clientCode || undefined, jurisdiction: jurisdiction || undefined },
    });
  }
  return results;
}
