import { describe, it, expect } from 'vitest';
import { formatMarkdownTables } from '../src/format/markdownTableFormatter';

describe('formatMarkdownTables', () => {
  it('returns text unchanged when there are no tables', () => {
    const input = '# Heading\n\nSome paragraph text.\n';
    expect(formatMarkdownTables(input)).toBe(input);
  });

  it('formats a simple table by normalizing column widths', () => {
    const input = '| A | B |\n|---|---|\n| short | longer content |';
    const result = formatMarkdownTables(input);
    const lines = result.split('\n');
    // Header row must have consistent padding
    expect(lines[0]).toMatch(/^\| A\s+\| B\s+\|$/u);
    // Separator row must remain a valid separator
    expect(lines[1]).toMatch(/^\|[-: ]+\|[-: ]+\|$/u);
    // Data row
    expect(lines[2]).toMatch(/^\| short\s+\| longer content\s+\|$/u);
  });

  it('pads all rows to the same column width', () => {
    const input = '| Col1 | Col2 |\n|---|---|\n| x | longer value |';
    const result = formatMarkdownTables(input);
    const lines = result.split('\n');
    // All rows should have the same length (same column widths)
    const header = lines[0];
    const data = lines[2];
    // Extract widths between pipes
    const headerCols = header.split('|').slice(1, -1);
    const dataCols = data.split('|').slice(1, -1);
    expect(headerCols.length).toBe(dataCols.length);
    for (let i = 0; i < headerCols.length; i++) {
      expect(headerCols[i].length).toBe(dataCols[i].length);
    }
  });

  it('preserves left alignment marker', () => {
    const input = '| A |\n|:---|\n| val |';
    const result = formatMarkdownTables(input);
    const separatorRow = result.split('\n')[1];
    expect(separatorRow).toContain(':---');
    expect(separatorRow).not.toMatch(/---:/u);
  });

  it('preserves right alignment marker', () => {
    const input = '| A |\n|---:|\n| val |';
    const result = formatMarkdownTables(input);
    const separatorRow = result.split('\n')[1];
    expect(separatorRow).toMatch(/---:/u);
    expect(separatorRow).not.toMatch(/^:-/u);
  });

  it('preserves center alignment marker', () => {
    const input = '| A |\n|:---:|\n| val |';
    const result = formatMarkdownTables(input);
    const separatorRow = result.split('\n')[1];
    // center: starts and ends with colon
    expect(separatorRow).toMatch(/:-+:/u);
  });

  it('does not format tables inside fenced code blocks', () => {
    const input = '```\n| A | B |\n|---|---|\n| x | y |\n```';
    const result = formatMarkdownTables(input);
    // Should be returned unchanged
    expect(result).toBe(input);
  });

  it('does not format tables inside tilde-fenced code blocks', () => {
    const input = '~~~\n| A | B |\n|---|---|\n| x | y |\n~~~';
    const result = formatMarkdownTables(input);
    expect(result).toBe(input);
  });

  it('formats multiple tables independently', () => {
    const input = [
      '| A | B |',
      '|---|---|',
      '| x | y |',
      '',
      'Some text between tables.',
      '',
      '| Col1 | Col2 | Col3 |',
      '|---|---|---|',
      '| a | b | c |',
    ].join('\n');
    const result = formatMarkdownTables(input);
    expect(result).toContain('Some text between tables.');
    // Both tables should be formatted
    const lines = result.split('\n');
    expect(lines.some((l) => l.startsWith('| A'))).toBe(true);
    expect(lines.some((l) => l.startsWith('| Col1'))).toBe(true);
  });

  it('handles tables with missing cells (pads with empty)', () => {
    // Data row has 2 cells but header has 3 — the third column should be padded with empty
    const input = '| A | B | C |\n|---|---|---|\n| x | y |';
    const result = formatMarkdownTables(input);
    const dataRow = result.split('\n')[2];
    // Should have 3 columns (padded)
    const cols = dataRow.split('|').slice(1, -1);
    expect(cols.length).toBe(3);
  });

  it('handles escaped pipes inside cells', () => {
    const input = '| A | B |\n|---|---|\n| foo\\|bar | baz |';
    const result = formatMarkdownTables(input);
    expect(result).toContain('foo\\|bar');
  });
});
