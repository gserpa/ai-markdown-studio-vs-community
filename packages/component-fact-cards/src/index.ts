type Accent = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type Icon = 'calendar' | 'check' | 'folder' | 'info';
type Fact = { label: string; value: string; id?: string; unit?: string; secondValue?: string; detail?: string; accent?: Accent; icon?: Icon };
type Facts = { heading?: string; cards: Fact[] };
const accents = ['neutral','info','success','warning','danger'];
const icons: Record<Icon,string> = { calendar: '▣', check: '✓', folder: '▤', info: 'ⓘ' };
function object(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be a mapping.`);
  const obj=value as Record<string,unknown>;
  for(const key of Object.keys(obj)) if(!keys.includes(key)) throw new Error(`${path}.${key} is not supported.`);
  return obj;
}
function text(value: unknown, path: string, max = 200): string {
  if(typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${path} must be non-empty text of at most ${max} characters.`);
  return value;
}
function optional(value: unknown, path: string, max = 200): string | undefined { return value === undefined ? undefined : text(value,path,max); }
function scalar(value: unknown, path: string): string {
  if(typeof value === 'number' && Number.isFinite(value)) return String(value);
  return text(value,path);
}
function factValue(value: unknown, path: string): string {
  if(value && typeof value === 'object' && !Array.isArray(value)) {
    const ratio=object(value,path,['numerator','denominator']);
    if(typeof ratio.numerator !== 'number' || !Number.isFinite(ratio.numerator) || typeof ratio.denominator !== 'number' || !Number.isFinite(ratio.denominator) || ratio.denominator <= 0) throw new Error(`${path} requires a finite numerator and a positive finite denominator.`);
    return `${ratio.numerator}/${ratio.denominator}`;
  }
  return scalar(value,path);
}
function parse(data: unknown, _document: unknown, options: unknown): Facts {
  const input=object(data,'data',['heading','cards']); object(options,'options',[]);
  const heading=optional(input.heading,'data.heading');
  if(!Array.isArray(input.cards) || !input.cards.length || input.cards.length>8) throw new Error('data.cards must contain 1–8 cards.');
  const cards=input.cards.map((entry,index) => {
    const path=`data.cards[${index+1}]`;
    const row=object(entry,path,['label','value','id','unit','secondValue','detail','accent','icon']);
    const label=text(row.label,`${path}.label`), value=factValue(row.value,`${path}.value`);
    const id=optional(row.id,`${path}.id`,80),unit=optional(row.unit,`${path}.unit`,80),detail=optional(row.detail,`${path}.detail`,500);
    const secondValue=row.secondValue === undefined ? undefined : scalar(row.secondValue,`${path}.secondValue`);
    if(row.accent!==undefined && (typeof row.accent!=='string' || !accents.includes(row.accent))) throw new Error(`${path}.accent must be neutral, info, success, warning or danger.`);
    if(row.icon!==undefined && (typeof row.icon!=='string' || !Object.hasOwn(icons,row.icon))) throw new Error(`${path}.icon must be calendar, check, folder or info.`);
    return {label,value,...(id?{id}:{}),...(unit?{unit}:{}),...(detail?{detail}:{}),...(secondValue!==undefined?{secondValue}:{}),...(row.accent?{accent:row.accent as Accent}:{}),...(row.icon?{icon:row.icon as Icon}:{})};
  });
  return {...(heading?{heading}:{}),cards};
}
function escape(value: string): string { return value.replace(/&/gu,'&amp;').replace(/</gu,'&lt;').replace(/>/gu,'&gt;').replace(/"/gu,'&quot;').replace(/'/gu,'&#39;'); }
function render(model: Facts): string {
  const cards=model.cards.map(card=>`<li class="md-fact-card${card.accent?` md-fact-${card.accent}`:''}" data-fact-card><p class="md-fact-label">${card.icon?`<span class="md-fact-icon" aria-hidden="true">${icons[card.icon]}</span> `:''}${card.id?escape(card.id)+' ':''}${escape(card.label)}</p><p class="md-fact-value${card.value.length > 14 ? ' md-fact-value-long' : ''}"><strong>${escape(card.value)}</strong>${card.unit?' <span>'+escape(card.unit)+'</span>':''}${card.secondValue?' <span>'+escape(card.secondValue)+'</span>':''}</p>${card.detail?`<p class="md-fact-detail">${escape(card.detail)}</p>`:''}</li>`).join('');
  return `<section class="md-fact-cards" data-component-fit="required" aria-label="${escape(model.heading ?? 'Facts')}">${model.heading?`<p class="md-fact-heading" data-fact-heading>${escape(model.heading)}</p>`:''}<ul class="md-fact-items">${cards}</ul></section>\n`;
}
function preparePptx(document: Document): void {
  for(const container of document.querySelectorAll<HTMLElement>('.md-fact-cards')) {
    const fragment=document.createDocumentFragment();const heading=container.querySelector('[data-fact-heading]');
    container.querySelectorAll('.md-fact-icon').forEach(icon=>icon.remove());
    if(heading?.textContent?.trim()){const p=document.createElement('p');p.textContent=heading.textContent.trim();fragment.append(p);}
    for(const card of container.querySelectorAll('[data-fact-card]')) {
      const p=document.createElement('p');p.textContent=[...card.querySelectorAll('p')].map(e=>e.textContent?.trim()).filter(Boolean).join(': ');fragment.append(p);
    }
    container.replaceWith(fragment);
  }
}
export const factCardsComponent = {
  type:'fact-cards',version:1,stylesheet:'@mfo/component-fact-cards/style.css',
  completion:{label:'fact-cards',detail:'Insert a collection of facts.',documentation:'Use supplied numeric, text or ratio values.',insertText:'~~~component\ntype: fact-cards\nversion: 1\ndata:\n  cards:\n    - label: Example\n      value: 4\n~~~'},
  authoringInstructions:['- For a collection of supplied facts use a ~~~component YAML fence with type: fact-cards, version: 1 and data.cards. Each card requires label and value; value may be text, a finite number, or {numerator, denominator}. Optional fields include unit, secondValue, detail, accent and icon. Quote dates and path-like text; do not infer values.'],
  parse,render,preparePptx,
  pptxWarning:()=> 'PowerPoint preserves fact-card content as text; card styling is simplified.',
  templateWarning:'Component placement in PowerPoint templates depends on the template. Check exported slides for content and fit.',
};
