type TableBlock = {
  start: number;
  end: number;
  lines: string[];
};

export function formatMarkdownTables(text: string): string {
  const lines = text.split(/\r?\n/u);
  const blocks = collectTableBlocks(lines);

  if (blocks.length === 0) {
    return text;
  }

  const replacements = new Map<number, string[]>();
  for (const block of blocks) {
    replacements.set(block.start, formatTableBlock(block.lines));
  }

  const result: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const replacement = replacements.get(index);
    if (replacement) {
      result.push(...replacement);
      const block = blocks.find((entry) => entry.start === index);
      index = (block?.end ?? index) - 1;
      continue;
    }

    result.push(lines[index]);
  }

  return result.join('\n');
}

function collectTableBlocks(lines: string[]): TableBlock[] {
  const blocks: TableBlock[] = [];
  let inFence = false;
  let fenceMarker = '';

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (fenceMarker === marker) {
        inFence = false;
        fenceMarker = '';
      }
      continue;
    }

    if (inFence || index + 1 >= lines.length || !isTableRow(line) || !isSeparatorRow(lines[index + 1])) {
      continue;
    }

    const start = index;
    let end = index + 2;
    while (end < lines.length && isTableRow(lines[end])) {
      end += 1;
    }

    blocks.push({
      start,
      end,
      lines: lines.slice(start, end),
    });

    index = end - 1;
  }

  return blocks;
}

function formatTableBlock(lines: string[]): string[] {
  const rows = lines.map((line) => splitTableRow(line));
  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => padRow(row, columnCount));
  const alignments = normalizedRows[1].map(parseAlignment);
  const contentRows = [normalizedRows[0], ...normalizedRows.slice(2)];

  const widths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const maxContentWidth = Math.max(
      3,
      ...contentRows.map((row) => getDisplayWidth(row[columnIndex] ?? '')),
    );
    return maxContentWidth;
  });

  const formattedRows: string[] = [];
  formattedRows.push(renderContentRow(normalizedRows[0], widths));
  formattedRows.push(renderSeparatorRow(widths, alignments));

  for (const row of normalizedRows.slice(2)) {
    formattedRows.push(renderContentRow(row, widths));
  }

  return formattedRows;
}

function renderContentRow(row: string[], widths: number[]): string {
  const cells = row.map((cell, index) => padCell(cell, widths[index]));
  return `| ${cells.join(' | ')} |`;
}

function renderSeparatorRow(widths: number[], alignments: Alignment[]): string {
  const cells = widths.map((width, index) => buildSeparatorCell(width, alignments[index] ?? 'none'));
  return `| ${cells.join(' | ')} |`;
}

function buildSeparatorCell(width: number, alignment: Alignment): string {
  const normalizedWidth = Math.max(3, width);
  switch (alignment) {
    case 'left':
      return `:${'-'.repeat(Math.max(2, normalizedWidth - 1))}`;
    case 'right':
      return `${'-'.repeat(Math.max(2, normalizedWidth - 1))}:`;
    case 'center':
      return `:${'-'.repeat(Math.max(1, normalizedWidth - 2))}:`;
    default:
      return '-'.repeat(normalizedWidth);
  }
}

function padCell(cell: string, width: number): string {
  const trimmed = cell.trim();
  const padding = Math.max(0, width - getDisplayWidth(trimmed));
  return `${trimmed}${' '.repeat(padding)}`;
}

function padRow(row: string[], columnCount: number): string[] {
  const padded = [...row];
  while (padded.length < columnCount) {
    padded.push('');
  }
  return padded;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutOuterPipes = trimmed.replace(/^\|/u, '').replace(/\|$/u, '');
  const cells: string[] = [];
  let current = '';
  let escaped = false;

  for (const character of withoutOuterPipes) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      current += character;
      escaped = true;
      continue;
    }

    if (character === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) {
    return false;
  }

  if (/^\s*[-:*]+\s*$/u.test(trimmed)) {
    return false;
  }

  return splitTableRow(trimmed).length >= 2;
}

function isSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell.trim()));
}

type Alignment = 'left' | 'right' | 'center' | 'none';

function parseAlignment(cell: string): Alignment {
  const trimmed = cell.trim();
  const startsWithColon = trimmed.startsWith(':');
  const endsWithColon = trimmed.endsWith(':');

  if (startsWithColon && endsWithColon) {
    return 'center';
  }

  if (startsWithColon) {
    return 'left';
  }

  if (endsWithColon) {
    return 'right';
  }

  return 'none';
}

function getDisplayWidth(value: string): number {
  return value.replace(/\\\|/gu, '|').length;
}