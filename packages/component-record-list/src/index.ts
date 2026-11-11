import { isMap, isScalar, type Document as YamlDocument } from 'yaml';

type Style = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type RecordItem = { title: string; id?: string; detail?: string; ordinal?: number; metadata?: [string, string][]; tags?: string[]; status?: { label: string; style: Style }; scale?: { value: number; max: number; label?: string } };
type Group = { label?: string; records: RecordItem[] };
type RecordList = { heading?: string; groups: Group[]; variant: 'list' | 'compact' | 'rows' };
const styles = ['neutral', 'info', 'success', 'warning', 'danger'];
function object(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be a mapping.`);
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) if (!keys.includes(key)) throw new Error(`${path}.${key} is not supported.`);
  return obj;
}
function text(value: unknown, path: string, limit = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error(`${path} must be non-empty text of at most ${limit} characters.`);
  return value;
}
function optional(value: unknown, path: string, limit = 200): string | undefined { return value === undefined ? undefined : text(value, path, limit); }
function records(value: unknown, path: string, document: YamlDocument, nodePath: (string | number)[]): RecordItem[] {
  if (!Array.isArray(value) || !value.length || value.length > 30) throw new Error(`${path} must contain 1–30 records.`);
  return value.map((input, index) => {
    const base = `${path}[${index + 1}]`;
    const row = object(input, base, ['title','id','detail','ordinal','metadata','tags','status','scale']);
    const title = text(row.title, `${base}.title`);
    const id = optional(row.id, `${base}.id`, 80), detail = optional(row.detail, `${base}.detail`, 500);
    if (row.ordinal !== undefined && (!Number.isSafeInteger(row.ordinal) || (row.ordinal as number) < 1 || (row.ordinal as number) > 9999)) throw new Error(`${base}.ordinal must be an integer from 1 to 9999.`);
    let metadata: [string,string][] | undefined;
    if (row.metadata !== undefined) {
      if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) throw new Error(`${base}.metadata must be a mapping.`);
      const metadataValue = row.metadata as Record<string, unknown>;
      const node = document.getIn([...nodePath, index, 'metadata'], true);
      const keys = isMap(node) ? node.items.map(pair => isScalar(pair.key) ? String(pair.key.value) : '') : Object.keys(metadataValue);
      const pairs = keys.map(key => [key, metadataValue[key]] as const);
      if (pairs.length > 8) throw new Error(`${base}.metadata supports at most 8 fields.`);
      metadata = pairs.map(([key, value]) => [text(key, `${base}.metadata label`, 80), typeof value === 'number' && Number.isFinite(value) ? String(value) : text(value, `${base}.metadata.${key}`, 160)]);
    }
    let tags: string[] | undefined;
    if (row.tags !== undefined) {
      if (!Array.isArray(row.tags) || row.tags.length > 8) throw new Error(`${base}.tags must be a list of at most 8 labels.`);
      tags = row.tags.map((tag, i) => text(tag, `${base}.tags[${i + 1}]`, 80));
    }
    let status: RecordItem['status'];
    if (row.status !== undefined) {
      const state = object(row.status, `${base}.status`, ['label','style']);
      const label = text(state.label, `${base}.status.label`, 80);
      if (typeof state.style !== 'string' || !styles.includes(state.style)) throw new Error(`${base}.status.style must be neutral, info, success, warning or danger.`);
      status = { label, style: state.style as Style };
    }
    let scale: RecordItem['scale'];
    if (row.scale !== undefined) {
      const supplied = object(row.scale, `${base}.scale`, ['value','max','label']);
      if (typeof supplied.value !== 'number' || !Number.isFinite(supplied.value) || typeof supplied.max !== 'number' || !Number.isFinite(supplied.max) || supplied.max <= 0 || supplied.value < 0 || supplied.value > supplied.max) throw new Error(`${base}.scale requires finite values with 0 ≤ value ≤ max and max > 0.`);
      const label = optional(supplied.label, `${base}.scale.label`, 80);
      scale = { value: supplied.value, max: supplied.max, ...(label ? { label } : {}) };
    }
    return { title, ...(id ? {id} : {}), ...(detail ? {detail} : {}), ...(row.ordinal !== undefined ? {ordinal: row.ordinal as number} : {}), ...(metadata ? {metadata} : {}), ...(tags ? {tags} : {}), ...(status ? {status} : {}), ...(scale ? {scale} : {}) };
  });
}
function parse(data: unknown, document: YamlDocument, options: unknown): RecordList {
  const input = object(data, 'data', ['heading','records','groups']);
  const settings = object(options, 'options', ['variant']);
  const variant = settings.variant === undefined ? 'list' : settings.variant;
  if (typeof variant !== 'string' || !['list','compact','rows'].includes(variant)) throw new Error('options.variant must be list, compact or rows.');
  const heading = optional(input.heading, 'data.heading');
  if ((input.records === undefined) === (input.groups === undefined)) throw new Error('Provide either data.records or data.groups.');
  let groups: Group[];
  if (input.groups !== undefined) {
    if (!Array.isArray(input.groups) || !input.groups.length || input.groups.length > 12) throw new Error('data.groups must contain 1–12 groups.');
    groups = input.groups.map((value,index) => {
      const group = object(value, `data.groups[${index + 1}]`, ['label','records']);
      return { label: text(group.label, `data.groups[${index + 1}].label`), records: records(group.records, `data.groups[${index + 1}].records`, document, ['data', 'groups', index, 'records']) };
    });
  } else groups = [{ records: records(input.records, 'data.records', document, ['data', 'records']) }];
  if (groups.reduce((total, group) => total + group.records.length, 0) > 30) throw new Error('A record-list supports at most 30 records in total.');
  return { ...(heading ? {heading} : {}), groups, variant: variant as RecordList['variant'] };
}
function escape(value: string): string { return value.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;').replace(/'/gu,'&#39;'); }
function render(model: RecordList): string {
  const groups = model.groups.map(group => `<div class="md-record-group" data-record-group>${group.label ? `<p class="md-record-group-label" data-record-group-label>${escape(group.label)}</p>` : ''}<ul class="md-record-items">${group.records.map(item => {
    const prefix = [item.ordinal === undefined ? '' : String(item.ordinal) + '.', item.id ?? '', item.title].filter(Boolean).map(escape).join(' ');
    const metadata = item.metadata?.map(([key,value]) => `${escape(key)}: ${escape(value)}`).join(' · ');
    const tags = item.tags?.map(escape).join(' · ');
    const status = item.status ? `<span class="md-record-status md-record-status-${item.status.style}">${escape(item.status.label)}</span>` : '';
    const scale = item.scale ? `<span class="md-record-scale">${escape(item.scale.label ?? 'Scale')}: ${item.scale.value}/${item.scale.max}</span>` : '';
    return `<li class="md-record-item" data-record-item><p class="md-record-title"><strong>${prefix}</strong>${status ? ' '+status : ''}${scale ? ' '+scale : ''}</p>${item.detail ? `<p class="md-record-detail">${escape(item.detail)}</p>` : ''}${metadata ? `<p class="md-record-metadata">${metadata}</p>` : ''}${tags ? `<p class="md-record-tags">${tags}</p>` : ''}</li>`;
  }).join('')}</ul></div>`).join('');
  return `<section class="md-record-list md-record-list-${model.variant}" data-component-fit="required" aria-label="${escape(model.heading ?? 'Records')}">${model.heading ? `<p class="md-record-heading" data-record-heading>${escape(model.heading)}</p>` : ''}${groups}</section>\n`;
}
function preparePptx(document: Document): void {
  for (const container of document.querySelectorAll<HTMLElement>('.md-record-list')) {
    const fragment = document.createDocumentFragment();
    const heading = container.querySelector('[data-record-heading]');
    if (heading?.textContent?.trim()) { const p=document.createElement('p'); p.textContent=heading.textContent.trim(); fragment.append(p); }
    for (const group of container.querySelectorAll('[data-record-group]')) {
      const label=group.querySelector('[data-record-group-label]');
      if(label?.textContent?.trim()) { const p=document.createElement('p'); p.textContent=label.textContent.trim(); fragment.append(p); }
      for(const item of group.querySelectorAll('[data-record-item]')) {
        const p=document.createElement('p'); p.textContent=[...item.querySelectorAll('p')].map(e=>e.textContent?.trim()).filter(Boolean).join(' — '); fragment.append(p);
      }
    }
    container.replaceWith(fragment);
  }
}
export const recordListComponent = {
  type:'record-list', version:1, stylesheet:'@mfo/component-record-list/style.css',
  completion:{label:'record-list', detail:'Insert an ordered record list.', documentation:'Use records or groups; add only supplied details and metadata.', insertText:'~~~component\ntype: record-list\nversion: 1\ndata:\n  records:\n    - title: Example item\n      detail: Supporting detail\n~~~'},
  authoringInstructions:['- For a generic record list use a ~~~component YAML fence with type: record-list, version: 1 and data.records or data.groups. Each record needs title and may include supplied id, detail, ordinal, metadata, tags, status {label, style}, or scale {value, max, label}. Never invent missing fields.'],
  parse, render, preparePptx,
  pptxWarning: () => 'PowerPoint preserves record-list content as text; record styling is simplified.',
  templateWarning: 'Component placement in PowerPoint templates depends on the template. Check exported slides for content and fit.',
};
