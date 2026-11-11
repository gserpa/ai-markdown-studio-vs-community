export function prepareMatrixForPptx(document: Document): void {
  // PPTX's table adapter does not preserve HTML row/column spans or CSS bars.
  // Flatten grouped headers into explicit group / leaf labels while keeping every value.
  for (const table of document.querySelectorAll<HTMLTableElement>('table.md-status-matrix')) {
    const header = table.tHead;
    if (header && header.rows.length === 2 && header.querySelector('th[scope="colgroup"]')) {
      const first = header.rows[0], second = header.rows[1];
      const labels: string[] = [];
      for (const group of [...first.querySelectorAll<HTMLTableCellElement>('th[scope="colgroup"]')]) {
        for (let i = 0; i < group.colSpan; i++) labels.push(group.textContent?.trim() ?? '');
      }
      const row = document.createElement('tr');
      const rowHeader = document.createElement('th');
      rowHeader.textContent = first.cells[0]?.textContent?.trim() || 'Item';
      row.append(rowHeader);
      [...second.cells].forEach((cell, i) => {
        const th = document.createElement('th');
        th.textContent = [labels[i], cell.textContent?.trim()].filter(Boolean).join(' / ');
        row.append(th);
      });
      for (const cell of [...first.cells].slice(1)) {
        if (cell.getAttribute('scope') === 'colgroup') continue;
        const th = document.createElement('th');
        th.textContent = cell.textContent?.trim() ?? '';
        row.append(th);
      }
      header.replaceChildren(row);
      table.querySelectorAll('colgroup').forEach(group => group.remove());
    }
    table.querySelectorAll('.md-matrix-detail').forEach(detail => detail.before(document.createTextNode(' ')));
    table.querySelectorAll('.md-matrix-progress').forEach(bar => bar.remove());
    table.querySelectorAll('.md-matrix-progress-text').forEach(value => {
      if (value.parentElement?.querySelector('.md-matrix-status')) value.before(document.createTextNode(' '));
    });
  }
}
