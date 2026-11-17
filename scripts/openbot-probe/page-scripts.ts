// COSGRAL B1: the scripts the probe runs INSIDE the page it looks at. They are strings of plain JavaScript (no types), so they run the
// same whatever runs the probe. They only read: no click, no input, no change of the page, except a `data-probe-id` mark on the
// elements the probe may click (removed again with `CLEAR_MARKS`).

/** Elements that can be clicked, visible, with a role and a name. Marks each with `data-probe-id`. */
export const LIST_CANDIDATES = `(() => {
  const selector = 'button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"], [role="link"], [role="radio"], [role="option"], [role="switch"], [role="checkbox"]';
  const implicitRole = (el) => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button' || tag === 'summary') return 'button';
    return null;
  };
  const nameOf = (el) => {
    const label = el.getAttribute('aria-label');
    if (label) return label.trim();
    const labelled = el.getAttribute('aria-labelledby');
    if (labelled) {
      const text = labelled.split(/\\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (text) return text;
    }
    const text = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text) return text;
    return (el.getAttribute('title') || el.getAttribute('alt') || '').trim();
  };
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const found = [];
  let next = 0;
  for (const el of document.querySelectorAll(selector)) {
    if (!visible(el)) continue;
    const id = String(next++);
    el.setAttribute('data-probe-id', id);
    const rect = el.getBoundingClientRect();
    found.push({
      id,
      tag: el.tagName.toLowerCase(),
      role: implicitRole(el),
      name: nameOf(el).slice(0, 160),
      href: el.getAttribute('href'),
      disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
      inNav: !!el.closest('nav, aside, header, [role="navigation"], [role="tablist"], [role="menu"], [role="menubar"], [role="toolbar"]'),
      checked: el.getAttribute('aria-checked') ?? (el.checked === undefined ? null : String(el.checked)),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    });
  }
  return found;
})()`;

export const CLEAR_MARKS = `(() => { for (const el of document.querySelectorAll('[data-probe-id]')) el.removeAttribute('data-probe-id'); })()`;

/** The look of every visible element that has text, a border or its own background: for grouping into a design system. */
export const COLLECT_STYLES = `(() => {
  const props = ['color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'borderRadius', 'borderTopWidth',
    'borderTopColor', 'boxShadow', 'gap', 'opacity', 'transitionDuration'];
  const kindOf = (el) => el.getAttribute('role') || ({ a: 'link', button: 'button', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', input: 'input', textarea: 'input', select: 'input', nav: 'navigation', aside: 'complementary', header: 'banner', main: 'main', dialog: 'dialog', img: 'img', svg: 'icon', li: 'listitem', ul: 'list', label: 'label', p: 'text', span: 'text' }[el.tagName.toLowerCase()] ?? el.tagName.toLowerCase());
  const samples = [];
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    if (samples.length >= 4000) break;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const hasBackground = style.backgroundColor !== 'rgba(0, 0, 0, 0)';
    const hasBorder = parseFloat(style.borderTopWidth) > 0;
    const interesting = ownText || hasBackground || hasBorder || el.matches('button, a, input, textarea, select, svg, img, h1, h2, h3, h4, [role]');
    if (!interesting) continue;
    const look = {};
    for (const name of props) look[name] = style[name];
    look.width = Math.round(rect.width) + 'px';
    look.height = Math.round(rect.height) + 'px';
    samples.push({ kind: kindOf(el), label: (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40), look });
  }
  return samples;
})()`;

/** The custom properties (design tokens) the style sheets define on the root, with their computed values. */
export const COLLECT_TOKENS = `(() => {
  const names = new Set();
  const visit = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) visit(rule.cssRules);
      if (!rule.style || !rule.selectorText) continue;
      if (!/(^|,)\\s*(:root|html|body|\\[data-theme[^\\]]*\\]|\\.dark|\\.light)\\b/.test(rule.selectorText)) continue;
      for (const name of rule.style) if (name.startsWith('--')) names.add(name);
    }
  };
  for (const sheet of document.styleSheets) {
    try { visit(sheet.cssRules); } catch { /* a sheet from another origin: not readable */ }
  }
  const root = getComputedStyle(document.documentElement);
  const tokens = {};
  for (const name of [...names].sort()) tokens[name] = root.getPropertyValue(name).trim();
  return { theme: document.documentElement.getAttribute('data-theme') || document.documentElement.className || null, colorScheme: root.colorScheme, tokens };
})()`;

/** The regions of the window with their boxes, and the page's own fonts. */
export const COLLECT_LAYOUT = `(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const regions = [];
  for (const el of document.querySelectorAll('main, nav, aside, header, footer, dialog, [role="dialog"], [role="alertdialog"], [role="tablist"], [role="toolbar"], [role="region"], [role="navigation"], [role="main"], h1, h2')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    regions.push({ tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), name: (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60), box: box(el) });
  }
  const fonts = [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, style: f.style, status: f.status }));
  return { viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }, scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }, regions: regions.slice(0, 200), fonts };
})()`;

/** Every visible line of text, in order, without repeats. */
export const COLLECT_TEXTS = `(() => {
  const lines = [];
  const seen = new Set();
  for (const raw of document.body.innerText.split('\\n')) {
    const line = raw.trim();
    if (line && !seen.has(line)) { seen.add(line); lines.push(line); }
  }
  return lines;
})()`;

export const HEADING = `(() => { const h = document.querySelector('h1, [role="heading"], h2'); return h ? h.textContent.trim().slice(0, 80) : ''; })()`;
