/**
 * Horology Studio — frontend
 * SPA sin dependencias de build: rutas por hash, render por plantillas y delegación de eventos.
 */
'use strict';

// ==========================================================================
// Constantes de dominio
// ==========================================================================
const OWNERSHIP = {
  owned:    { label: 'En posesión',   short: 'Tengo',  cls: 'b-owned',    icon: 'crown' },
  building: { label: 'En taller',     short: 'Taller', cls: 'b-building', icon: 'wrench' },
  planned:  { label: 'Lo que quiero', short: 'Quiero', cls: 'b-planned',  icon: 'target' },
};
const WATCH_STATUS = ['Montado', 'En piezas', 'En proyecto'];
const COMPONENT_TYPES = ['Movimiento', 'Caja', 'Dial', 'Agujas', 'Bisel', 'Cristal', 'Brazalete', 'Corona', 'Otro'];
const COMP_STATUS = {
  'Recibido':            'b-owned',
  'Pedido':              'b-info',
  'Pendiente de compra': 'b-building',
};
const PART_TYPES = ['Dial', 'Agujas', 'Caja', 'Brazalete', 'Bisel', 'Cristal', 'Corona', 'Rotor', 'Otro'];
const PART_STATUS = { 'Disponible': 'b-owned', 'Asignado': 'b-info', 'Agotado': 'b-danger' };
const TOOL_CATEGORIES = ['Prensa', 'Abridores', 'Destornilladores', 'Pinzas', 'Desmagnetizador', 'Lupas', 'Aceites / Grasas', 'Herramienta', 'Otros'];
const TOOL_STATUS = { 'Disponible': 'b-owned', 'Por comprar': 'b-building', 'Prestado': 'b-info' };
const WISH_CATEGORIES = ['Pieza', 'Movimiento', 'Reloj', 'Herramienta'];
const PRIORITY = { 'Alta': 'b-danger', 'Media': 'b-building', 'Baja': 'b-owned' };
const WISH_STATUS = { 'Pendiente': 'b-accent', 'Comprado': 'b-owned', 'Descartado': '' };
const CATALOG_EMOJIS = ['⌚', '💼', '✨', '🏛️', '⚓', '🏁', '🌙', '💎', '🧭', '🔧'];
const CATALOG_COLORS = ['#c9a36a', '#5b9bd5', '#9b7fd4', '#6fc193', '#e2837a', '#e0b257', '#7fb8b0', '#b0b7c3'];

const DIAL_HTML = '<div class="dial"><div class="dial-face"><i></i><i></i><i></i><b></b></div></div>';
window.DIAL_HTML = DIAL_HTML;

// ==========================================================================
// Estado
// ==========================================================================
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('horology_' + key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('horology_' + key, JSON.stringify(value)); } catch (e) { /* almacenamiento no disponible */ }
  },
};

const STATE = {
  route: 'resumen',
  catalogId: store.get('catalog', null),
  loaded: false,
  data: { catalogs: [], watches: [], movements: [], parts: [], tools: [], wishlist: [], summary: null },
  search: {},
  filters: {
    relojes: { ownership: 'all', status: '' },
    calibres: { stock: '' },
    piezas: { type: '', status: '' },
    herramientas: { category: '', status: '' },
    deseos: { priority: '', status: '' },
  },
  sort: store.get('sort', { relojes: 'recent', calibres: 'model', piezas: 'recent', herramientas: 'name', deseos: 'priority' }),
  view: store.get('view', { relojes: 'grid', calibres: 'table', piezas: 'table', herramientas: 'table', deseos: 'table' }),
  drawerWatchId: null,
};

// ==========================================================================
// Utilidades
// ==========================================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function safeUrl(url) {
  if (!url) return '';
  const u = String(url).trim();
  return /^(https?:\/\/|\/)/i.test(u) ? esc(u) : '';
}

const moneyFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const money = v => moneyFmt.format(Number(v) || 0);
const signed = v => (v > 0 ? '+' : '') + money(v);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const icon = (name, cls = '') => `<i data-lucide="${name}"${cls ? ` class="${cls}"` : ''}></i>`;
const refreshIcons = () => { if (window.lucide) window.lucide.createIcons(); };
const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const matches = (q, ...fields) => !q || fields.some(f => normalize(f).includes(q));

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function badge(text, cls = '', dot = true) {
  return `<span class="badge ${cls}">${dot ? '<span class="dot"></span>' : ''}${esc(text)}</span>`;
}
const ownershipBadge = (o, extra = '') => badge((OWNERSHIP[o] || OWNERSHIP.owned).label, `${(OWNERSHIP[o] || OWNERSHIP.owned).cls} ${extra}`);

function media(url, alt = '') {
  const src = safeUrl(url);
  return src ? `<img src="${src}" alt="${esc(alt)}" loading="lazy" onerror="this.outerHTML=window.DIAL_HTML">` : DIAL_HTML;
}

function thumb(url, cls = '') {
  const src = safeUrl(url);
  return `<div class="thumb ${cls}">${icon('watch')}${src ? `<img src="${src}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>`;
}

function options(list, selected, labels = null) {
  return list.map(v => `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(labels ? labels[v] || v : v)}</option>`).join('');
}

function receivedStats(watch) {
  const comps = watch.components || [];
  const received = comps.filter(c => (c.status || 'Recibido') === 'Recibido').length;
  return { total: comps.length, received, pending: comps.length - received };
}

// ==========================================================================
// API
// ==========================================================================
async function api(path, { method = 'GET', body, raw = false } = {}) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(path, opts);
  if (!res.ok) {
    let detail = `Error ${res.status}`;
    try {
      const err = await res.json();
      if (typeof err.detail === 'string') detail = err.detail;
      else if (Array.isArray(err.detail)) detail = 'Revisa los campos: ' + err.detail.map(d => d.loc?.slice(-1)[0]).filter(Boolean).join(', ');
    } catch (e) { /* sin cuerpo JSON */ }
    throw new Error(detail);
  }
  if (raw || res.status === 204) return res;
  return res.json();
}

async function loadAll() {
  const summaryUrl = STATE.catalogId ? `/api/summary?catalog_id=${STATE.catalogId}` : '/api/summary';
  const [catalogs, watches, movements, parts, tools, wishlist, summary] = await Promise.all([
    api('/api/catalogs'), api('/api/watches'), api('/api/movements'), api('/api/parts'),
    api('/api/tools'), api('/api/wishlist'), api(summaryUrl),
  ]);
  Object.assign(STATE.data, { catalogs, watches, movements, parts, tools, wishlist, summary });
  if (STATE.catalogId && !catalogs.some(c => c.id === STATE.catalogId)) {
    STATE.catalogId = null;
    store.set('catalog', null);
  }
  STATE.loaded = true;
}

async function refresh() {
  try {
    await loadAll();
    render();
    if (STATE.drawerWatchId) renderDrawer();
  } catch (e) {
    toast(e.message || 'No se pudieron cargar los datos', 'error');
  }
}

/** Ejecuta una acción contra la API, refresca y avisa. */
async function mutate(fn, successMsg) {
  try {
    const result = await fn();
    await refresh();
    if (successMsg) toast(successMsg, 'success');
    return result;
  } catch (e) {
    toast(e.message || 'Algo salió mal', 'error');
    return undefined;
  }
}

// ==========================================================================
// Toasts, overlays y confirmaciones
// ==========================================================================
function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const ic = type === 'error' ? 'circle-alert' : type === 'success' ? 'circle-check' : 'info';
  el.innerHTML = `<span class="ti">${icon(ic)}</span><span>${esc(message)}</span>`;
  $('#toasts').appendChild(el);
  refreshIcons();
  setTimeout(() => { el.classList.add('leave'); setTimeout(() => el.remove(), 260); }, 3600);
}

const overlays = [];

function openOverlay(html, { drawer = false, width, onClose } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay' + (drawer ? ' drawer-overlay' : '');
  ov.innerHTML = html;
  if (width) ov.firstElementChild.style.setProperty('--w', width);
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeOverlay(ov); });
  ov._onClose = onClose;
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  overlays.push(ov);
  refreshIcons();
  const first = ov.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 30);
  return ov;
}

function closeOverlay(ov = overlays[overlays.length - 1]) {
  if (!ov) return;
  const i = overlays.indexOf(ov);
  if (i >= 0) overlays.splice(i, 1);
  ov.remove();
  if (ov._onClose) ov._onClose();
  if (!overlays.length) document.body.style.overflow = '';
}

function modalShell({ title, sub = '', body, foot, icon: ic }) {
  return `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <div>
          <div class="modal-title">${ic ? `<span style="color:var(--accent);margin-right:8px;vertical-align:-2px">${icon(ic)}</span>` : ''}${esc(title)}</div>
          ${sub ? `<div class="modal-sub">${sub}</div>` : ''}
        </div>
        <button class="icon-btn" data-action="close" aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${foot}</div>
    </div>`;
}

function confirmDialog({ title, message, confirmText = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    let answered = false;
    const ov = openOverlay(modalShell({
      title,
      body: `<p style="color:var(--text-2)">${message}</p>`,
      foot: `<button class="btn btn-ghost" data-confirm="no">Cancelar</button>
             <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-confirm="yes" autofocus>${esc(confirmText)}</button>`,
    }), { width: '440px', onClose: () => { if (!answered) resolve(false); } });
    ov.addEventListener('click', e => {
      const b = e.target.closest('[data-confirm]');
      if (!b) return;
      answered = true;
      closeOverlay(ov);
      resolve(b.dataset.confirm === 'yes');
    });
  });
}

// ==========================================================================
// Formularios genéricos
// ==========================================================================
function fieldHtml(f, value) {
  const id = `f-${f.key}`;
  const v = value ?? f.default ?? '';
  const req = f.required ? ' <span class="req">*</span>' : '';
  let control;
  switch (f.type) {
    case 'select':
      control = `<select class="select" id="${id}">${f.empty !== undefined ? `<option value="">${esc(f.empty)}</option>` : ''}${
        (typeof f.options === 'function' ? f.options() : f.options).map(o => {
          const [val, label] = Array.isArray(o) ? o : [o, o];
          return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(label)}</option>`;
        }).join('')}</select>`;
      break;
    case 'textarea':
      control = `<textarea class="textarea" id="${id}" rows="3" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
      break;
    case 'image':
      return `<div class="field ${f.full ? 'full' : ''}"><label>${esc(f.label)}</label>${imageFieldHtml(id, v)}</div>`;
    case 'number':
      control = `<input class="input num" type="number" inputmode="decimal" id="${id}" value="${esc(v)}" step="${f.step || 'any'}" min="${f.min ?? 0}" placeholder="${esc(f.placeholder || '')}">`;
      break;
    default:
      control = `<input class="input" type="${f.type || 'text'}" id="${id}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}"${f.list ? ` list="${f.list}"` : ''}${f.autofocus ? ' autofocus' : ''}>`;
  }
  return `<div class="field ${f.full ? 'full' : ''}"><label for="${id}">${esc(f.label)}${req}</label>${control}${f.hint ? `<div class="hint">${f.hint}</div>` : ''}</div>`;
}

function readFields(fields, root) {
  const out = {};
  for (const f of fields) {
    const el = $(`#f-${f.key}`, root);
    if (!el) continue;
    let v = el.value.trim();
    if (f.type === 'number') v = v === '' ? (f.nullable ? null : 0) : Number(v);
    else if (f.int) v = v === '' ? null : parseInt(v, 10);
    else if (v === '' && !f.required) v = null;
    out[f.key] = v;
  }
  return out;
}

function validate(fields, values) {
  const missing = fields.filter(f => f.required && !values[f.key]);
  if (missing.length) {
    toast(`Falta: ${missing.map(f => f.label).join(', ')}`, 'error');
    $(`#f-${missing[0].key}`)?.focus();
    return false;
  }
  return true;
}

function imageFieldHtml(id, value) {
  const src = safeUrl(value);
  return `
    <div class="image-field" data-image-field="${id}">
      <div class="image-drop" data-action="pick-image" title="Pulsa o arrastra una foto">
        ${src ? `<img src="${src}" alt="">` : icon('image-plus')}
      </div>
      <div>
        <input class="input" type="url" id="${id}" value="${esc(value || '')}" placeholder="Pega una URL o sube una foto">
        <div class="btns">
          <button type="button" class="btn btn-sm" data-action="pick-image">${icon('upload', 'ico-sm')} Subir foto</button>
          <button type="button" class="btn btn-sm btn-ghost" data-action="clear-image">Quitar</button>
        </div>
        <input type="file" accept="image/*" class="hidden" data-image-input>
      </div>
    </div>`;
}

function setImagePreview(wrapper, url) {
  const drop = $('.image-drop', wrapper);
  const src = safeUrl(url);
  drop.innerHTML = src ? `<img src="${src}" alt="">` : icon('image-plus');
  refreshIcons();
}

async function uploadImage(wrapper, file) {
  if (!file || !file.type.startsWith('image/')) { toast('Selecciona un archivo de imagen', 'error'); return; }
  const drop = $('.image-drop', wrapper);
  drop.insertAdjacentHTML('beforeend', `<div class="busy">${icon('loader-circle', 'spin')}</div>`);
  refreshIcons();
  try {
    const fd = new FormData();
    fd.append('file', file);
    const { url } = await api('/api/uploads', { method: 'POST', body: fd });
    $('input[type=url]', wrapper).value = url;
    setImagePreview(wrapper, url);
    toast('Foto subida', 'success');
  } catch (e) {
    $('.busy', drop)?.remove();
    toast(e.message, 'error');
  }
}

function bindImageFields(root) {
  $$('[data-image-field]', root).forEach(w => {
    const input = $('input[type=url]', w);
    const file = $('[data-image-input]', w);
    const drop = $('.image-drop', w);
    input.addEventListener('change', () => setImagePreview(w, input.value));
    file.addEventListener('change', () => uploadImage(w, file.files[0]));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag'); uploadImage(w, e.dataTransfer.files[0]); });
  });
}

/** Abre un formulario modal genérico a partir de un esquema de campos. */
function openFormModal({ title, sub, icon: ic, fields, values = {}, submitText = 'Guardar', width = '640px', onSubmit, extraFoot = '' }) {
  const ov = openOverlay(modalShell({
    title, sub, icon: ic,
    body: `<form class="form-grid" data-form autocomplete="off">${fields.map(f => fieldHtml(f, values[f.key])).join('')}<button type="submit" class="hidden"></button></form>`,
    foot: `${extraFoot}<span class="spacer"></span><button class="btn btn-ghost" data-action="close">Cancelar</button><button class="btn btn-primary" data-action="submit-form">${esc(submitText)}</button>`,
  }), { width });
  bindImageFields(ov);
  const form = $('[data-form]', ov);
  const submit = async () => {
    const data = readFields(fields, ov);
    if (!validate(fields, data)) return;
    const btn = $('[data-action="submit-form"]', ov);
    btn.disabled = true;
    const ok = await onSubmit(data);
    btn.disabled = false;
    if (ok !== false && ok !== undefined) closeOverlay(ov);
  };
  form.addEventListener('submit', e => { e.preventDefault(); submit(); });
  ov.addEventListener('click', e => { if (e.target.closest('[data-action="submit-form"]')) submit(); });
  const firstInput = $('input.input, select, textarea', ov);
  if (firstInput && window.innerWidth > 640) setTimeout(() => firstInput.focus(), 40);
  return ov;
}

// ==========================================================================
// Rutas
// ==========================================================================
const ROUTES = {
  resumen:      { label: 'Resumen',      icon: 'layout-dashboard', title: 'Tu atelier de un vistazo', eyebrow: 'Resumen', newLabel: 'Nuevo reloj', render: renderDashboard },
  relojes:      { label: 'Relojes',      icon: 'watch',   title: 'Relojes & proyectos', eyebrow: 'Colección', newLabel: 'Nuevo reloj', render: renderWatches,
                  sub: 'Lo que tienes, lo que estás montando y lo que quieres construir.' },
  calibres:     { label: 'Calibres',     icon: 'cpu',     title: 'Calibres', eyebrow: 'Inventario', newLabel: 'Nuevo calibre', render: renderMovements,
                  sub: 'Movimientos en stock con su frecuencia, reserva y valor.' },
  piezas:       { label: 'Piezas',       icon: 'cog',     title: 'Piezas & componentes', eyebrow: 'Inventario', newLabel: 'Nueva pieza', render: renderParts,
                  sub: 'Esferas, cajas, agujas, biseles y demás piezas sueltas del cajón.' },
  herramientas: { label: 'Herramientas', icon: 'hammer',  title: 'Herramientas de taller', eyebrow: 'Taller', newLabel: 'Nueva herramienta', render: renderTools,
                  sub: 'Prensas, pinzas, abridores y consumibles del banco de trabajo.' },
  deseos:       { label: 'Deseos',       icon: 'bookmark', title: 'Lista de deseos', eyebrow: 'Compras', newLabel: 'Nuevo deseo', render: renderWishlist,
                  sub: 'Piezas y calibres que quieres comprar, con precio objetivo y prioridad.' },
};

function routeFromHash() {
  const r = (location.hash || '').replace(/^#\/?/, '');
  return ROUTES[r] ? r : 'resumen';
}

function go(route) {
  if (location.hash !== `#/${route}`) location.hash = `#/${route}`;
  else { STATE.route = route; render(); }
}

function catalogWatches() {
  return STATE.catalogId ? STATE.data.watches.filter(w => w.catalog_id === STATE.catalogId) : STATE.data.watches;
}

function activeCatalog() {
  return STATE.data.catalogs.find(c => c.id === STATE.catalogId) || null;
}

// ==========================================================================
// Render principal
// ==========================================================================
function render() {
  STATE.route = routeFromHash();
  renderNav();
  const route = ROUTES[STATE.route];
  const main = $('#main');
  if (!STATE.loaded) return;

  const cat = activeCatalog();
  const scoped = ['resumen', 'relojes'].includes(STATE.route) && cat;
  main.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">${esc(route.eyebrow)}${scoped ? ` · <span style="color:${esc(cat.color)}">${esc(cat.icon || '')} ${esc(cat.name)}</span>` : ''}</div>
        <h1 class="page-title">${esc(route.title)}</h1>
        ${route.sub ? `<p class="page-sub">${route.sub}</p>` : ''}
      </div>
      <button class="btn btn-primary" data-action="new-item">${icon('plus')} ${esc(route.newLabel)}</button>
    </div>
    <div id="page"></div>`;
  route.render($('#page'));
  refreshIcons();
  document.title = `${route.label} · Horology Studio`;
}

function renderNav() {
  const d = STATE.data;
  const pendingWish = d.wishlist.filter(w => w.status === 'Pendiente').length;
  const counts = {
    resumen: '',
    relojes: catalogWatches().length,
    calibres: d.movements.reduce((a, m) => a + (m.stock || 0), 0),
    piezas: d.parts.length,
    herramientas: d.tools.length,
    deseos: pendingWish,
  };
  $('#nav-sections').innerHTML = `<div class="nav-label"><span>Secciones</span></div>` + Object.entries(ROUTES).map(([key, r]) => `
    <a class="nav-item ${STATE.route === key ? 'active' : ''}" href="#/${key}" data-close-menu>
      ${icon(r.icon)}<span>${esc(r.label)}</span>${counts[key] !== '' ? `<span class="count">${counts[key]}</span>` : ''}
    </a>`).join('');

  $('#nav-catalogs').innerHTML = `
    <button class="nav-item ${STATE.catalogId === null ? 'active' : ''}" data-action="select-catalog" data-id="" data-close-menu>
      <span class="cat-emoji">◎</span><span>Todas</span><span class="count">${d.watches.length}</span>
    </button>` + d.catalogs.map(c => `
    <button class="nav-item ${STATE.catalogId === c.id ? 'active' : ''}" data-action="select-catalog" data-id="${c.id}" data-close-menu>
      <span class="cat-dot" style="background:${esc(c.color || '#c9a36a')}"></span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.icon || '')} ${esc(c.name)}</span>
      <span class="count">${c.watches_count || 0}</span>
      <span class="edit-cat" data-action="edit-catalog" data-id="${c.id}" title="Editar colección">${icon('pencil', 'ico-sm')}</span>
    </button>`).join('');

  $$('.bottombar [data-route]').forEach(b => b.classList.toggle('active', b.dataset.route === STATE.route));
}

/** Barra de herramientas compartida por las vistas de listado. */
function toolbar(route, { placeholder, filters = [], sorts = [], segmented = '' }) {
  const f = STATE.filters[route];
  const view = STATE.view[route];
  return `
    ${segmented ? `<div class="toolbar">${segmented}</div>` : ''}
    <div class="toolbar">
      <div class="search grow">
        ${icon('search')}
        <input class="input" type="search" data-search="${route}" value="${esc(STATE.search[route] || '')}" placeholder="${esc(placeholder)}" aria-label="Buscar">
        <kbd>/</kbd>
      </div>
      ${filters.map(fl => `
        <select class="select" data-filter="${route}" data-key="${fl.key}" aria-label="${esc(fl.all)}">
          <option value="">${esc(fl.all)}</option>${options(fl.options, f[fl.key], fl.labels)}
        </select>`).join('')}
      ${sorts.length ? `
        <select class="select" data-sort="${route}" aria-label="Ordenar">
          ${sorts.map(([k, l]) => `<option value="${k}"${STATE.sort[route] === k ? ' selected' : ''}>↕ ${esc(l)}</option>`).join('')}
        </select>` : ''}
      <div class="segmented icons" role="group" aria-label="Vista">
        <button class="${view === 'grid' ? 'active' : ''}" data-action="set-view" data-view="grid" title="Tarjetas" aria-label="Vista tarjetas">${icon('layout-grid')}</button>
        <button class="${view === 'table' ? 'active' : ''}" data-action="set-view" data-view="table" title="Tabla" aria-label="Vista tabla">${icon('rows-3')}</button>
      </div>
    </div>
    <div id="view"></div>`;
}

function renderView() {
  const fn = VIEWS[STATE.route];
  const el = $('#view');
  if (fn && el) { el.innerHTML = fn(); refreshIcons(); }
}

function emptyState(title, text, withButton = true) {
  return `
    <div class="empty">
      ${DIAL_HTML}
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${withButton ? `<button class="btn btn-primary" data-action="new-item">${icon('plus')} ${esc(ROUTES[STATE.route].newLabel)}</button>` : ''}
    </div>`;
}

function sortBy(list, key, map) {
  const fn = map[key] || Object.values(map)[0];
  return [...list].sort(fn);
}
const byText = k => (a, b) => String(a[k] || '').localeCompare(String(b[k] || ''), 'es');
const byNumDesc = k => (a, b) => (b[k] || 0) - (a[k] || 0);
const byIdDesc = (a, b) => b.id - a.id;

// ==========================================================================
// 1. Resumen
// ==========================================================================
function renderDashboard(page) {
  const s = STATE.data.summary;
  const watches = catalogWatches();
  if (!s) { page.innerHTML = ''; return; }

  if (!watches.length && !STATE.data.parts.length && !STATE.data.movements.length) {
    page.innerHTML = emptyState('Tu atelier está vacío', 'Empieza registrando tu primer reloj o proyecto. También puedes cargar datos de ejemplo desde el menú lateral.');
    return;
  }

  const profitPct = pct(s.profit_or_savings, s.owned_watches_cost);
  const kpis = `
    <div class="kpis">
      <div class="kpi" style="--kpi-c:var(--success)">
        <div class="kpi-label">${icon('crown')} Colección</div>
        <div class="kpi-value">${money(s.owned_watches_value)}</div>
        <div class="kpi-foot"><b>${s.owned_watches_count}</b> relojes · coste <b>${money(s.owned_watches_cost)}</b></div>
      </div>
      <div class="kpi" style="--kpi-c:${s.profit_or_savings >= 0 ? 'var(--success)' : 'var(--danger)'}">
        <div class="kpi-label">${icon('trending-up')} Plusvalía</div>
        <div class="kpi-value ${s.profit_or_savings >= 0 ? 'pos' : 'neg'}">${signed(s.profit_or_savings)}</div>
        <div class="kpi-foot"><b>${profitPct >= 0 ? '+' : ''}${profitPct}%</b> sobre lo invertido</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--warn)">
        <div class="kpi-label">${icon('wrench')} En taller</div>
        <div class="kpi-value">${money(s.building_watches_cost)}</div>
        <div class="kpi-foot"><b>${s.building_watches_count}</b> en montaje</div>
      </div>
      <div class="kpi" style="--kpi-c:var(--violet)">
        <div class="kpi-label">${icon('target')} Pendiente de comprar</div>
        <div class="kpi-value">${money(s.planned_watches_budget + s.wishlist_pending_total)}</div>
        <div class="kpi-foot"><b>${s.planned_watches_count}</b> proyectos · <b>${s.wishlist_pending_count}</b> deseos</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">${icon('wallet')} Inversión total</div>
        <div class="kpi-value">${money(s.total_investment + s.tools_value_total)}</div>
        <div class="kpi-foot">Relojes, stock y <b>${money(s.tools_value_total)}</b> en herramientas</div>
      </div>
    </div>`;

  // Gasto por tipo de pieza (relojes que tengo o estoy montando)
  const spend = {};
  watches.filter(w => w.ownership_status !== 'planned').forEach(w => (w.components || []).forEach(c => {
    spend[c.component_type] = (spend[c.component_type] || 0) + (c.price || 0);
  }));
  const spendRows = Object.entries(spend).sort((a, b) => b[1] - a[1]);
  const maxSpend = spendRows.length ? spendRows[0][1] : 0;
  const spendTotal = spendRows.reduce((a, [, v]) => a + v, 0);
  const spendPanel = `
    <div class="panel span-7">
      <div class="panel-head"><div><div class="panel-title">¿En qué se va el dinero?</div><div class="panel-sub">Gasto por tipo de pieza en relojes montados y en taller · ${money(spendTotal)}</div></div></div>
      <div class="panel-body">
        ${spendRows.length ? `<div class="bars">${spendRows.map(([type, v], i) => `
          <div class="bar-row">
            <span class="lbl">${esc(type)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, (v / maxSpend) * 100)}%;animation-delay:${i * 40}ms"></div></div>
            <span class="val">${money(v)} <span class="muted">· ${pct(v, spendTotal)}%</span></span>
          </div>`).join('')}</div>` : `<p class="muted">Aún no hay piezas registradas en tus relojes.</p>`}
      </div>
    </div>`;

  // Piezas por recibir
  const pending = [];
  watches.forEach(w => (w.components || []).forEach(c => {
    if ((c.status || 'Recibido') !== 'Recibido') pending.push({ ...c, watch: w });
  }));
  const pendingTotal = pending.reduce((a, c) => a + (c.price || 0), 0);
  const pendingPanel = `
    <div class="panel span-5">
      <div class="panel-head"><div><div class="panel-title">Piezas por llegar</div><div class="panel-sub">${pending.length} piezas pedidas o por comprar · ${money(pendingTotal)}</div></div></div>
      <div class="panel-body">
        ${pending.length ? `<div class="list">${pending.slice(0, 7).map(c => `
          <div class="list-row">
            <div class="main-txt">
              <div class="t">${esc(c.name)}</div>
              <div class="s"><a href="#/relojes" data-action="open-watch" data-id="${c.watch.id}" style="text-decoration:none">${esc(c.watch.name)}</a> · ${esc(c.component_type)} · ${money(c.price)}</div>
            </div>
            <button class="badge status-btn ${COMP_STATUS[c.status] || ''}" data-action="cycle-comp" data-id="${c.id}" title="Cambiar estado">${esc(c.status)}</button>
          </div>`).join('')}</div>
          ${pending.length > 7 ? `<p class="muted" style="margin-top:8px;font-size:12px">y ${pending.length - 7} más…</p>` : ''}`
        : `<p class="muted">${icon('package-check', 'ico-sm')} Todo recibido. No hay piezas en camino.</p>`}
      </div>
    </div>`;

  // Relojes destacados
  const top = [...watches].filter(w => w.ownership_status === 'owned').sort((a, b) => (b.estimated_value || 0) - (a.estimated_value || 0)).slice(0, 5);
  const topPanel = `
    <div class="panel span-7">
      <div class="panel-head">
        <div><div class="panel-title">Joyas de la colección</div><div class="panel-sub">Tus relojes con mayor valor estimado</div></div>
        <a class="btn btn-sm btn-ghost" href="#/relojes">Ver todos ${icon('arrow-right', 'ico-sm')}</a>
      </div>
      <div class="panel-body">
        ${top.length ? `<div class="list">${top.map(w => {
          const diff = (w.estimated_value || 0) - (w.total_cost || 0);
          return `
          <div class="list-row" style="cursor:pointer" data-action="open-watch" data-id="${w.id}">
            ${thumb(w.image_url, 'lg')}
            <div class="main-txt"><div class="t">${esc(w.name)}</div><div class="s">${esc(w.style || '—')} · ${esc(w.movement_name || 'sin calibre')}</div></div>
            <div style="text-align:right">
              <div class="num" style="font-weight:600">${money(w.estimated_value)}</div>
              <div class="num ${diff >= 0 ? 'pos' : 'neg'}" style="font-size:12px">${signed(diff)}</div>
            </div>
          </div>`;
        }).join('')}</div>` : `<p class="muted">Cuando marques un reloj como «En posesión» aparecerá aquí.</p>`}
      </div>
    </div>`;

  // Alertas
  const noStock = STATE.data.movements.filter(m => (m.stock || 0) === 0);
  const soldOut = STATE.data.parts.filter(p => p.status === 'Agotado');
  const highWish = STATE.data.wishlist.filter(w => w.status === 'Pendiente' && w.priority === 'Alta');
  const alerts = [
    ...noStock.map(m => ({ ic: 'cpu', t: m.model, s: 'Calibre sin stock', route: 'calibres', cls: 'b-danger', b: 'Sin stock' })),
    ...soldOut.map(p => ({ ic: 'cog', t: p.name, s: `${p.part_type} agotado`, route: 'piezas', cls: 'b-danger', b: 'Agotado' })),
    ...highWish.map(w => ({ ic: 'bookmark', t: w.item_name, s: `Deseo prioritario · ${money(w.target_price)}`, route: 'deseos', cls: 'b-accent', b: 'Alta' })),
  ];
  const alertsPanel = `
    <div class="panel span-5">
      <div class="panel-head"><div><div class="panel-title">A tener en cuenta</div><div class="panel-sub">Stock agotado y compras prioritarias</div></div></div>
      <div class="panel-body">
        ${alerts.length ? `<div class="list">${alerts.slice(0, 7).map(a => `
          <a class="list-row" href="#/${a.route}" style="text-decoration:none">
            <div class="thumb">${icon(a.ic)}</div>
            <div class="main-txt"><div class="t">${esc(a.t)}</div><div class="s">${esc(a.s)}</div></div>
            ${badge(a.b, a.cls)}
          </a>`).join('')}</div>` : `<p class="muted">Nada urgente. Todo el inventario tiene stock.</p>`}
      </div>
    </div>`;

  // Colecciones
  const catsPanel = `
    <div class="panel span-12">
      <div class="panel-head">
        <div><div class="panel-title">Colecciones</div><div class="panel-sub">Agrupa tus relojes en catálogos independientes</div></div>
        <button class="btn btn-sm" data-action="new-catalog">${icon('plus', 'ico-sm')} Colección</button>
      </div>
      <div class="panel-body">
        <div class="cat-cards">
          ${STATE.data.catalogs.map(c => `
            <button class="cat-card" style="--c:${esc(c.color || '#c9a36a')}" data-action="select-catalog" data-id="${c.id}" data-goto="relojes">
              <div class="head"><span class="emoji">${esc(c.icon || '⌚')}</span><span>${esc(c.name)}</span></div>
              <div class="stats"><span><b>${c.watches_count || 0}</b> relojes</span><span><b>${c.owned_count || 0}</b> en posesión</span><span><b>${money(c.total_value)}</b></span></div>
            </button>`).join('') || '<p class="muted">Sin colecciones todavía.</p>'}
        </div>
      </div>
    </div>`;

  page.innerHTML = kpis + `<div class="dash-grid">${spendPanel}${pendingPanel}${topPanel}${alertsPanel}${catsPanel}</div>`;
}

// ==========================================================================
// 2. Relojes
// ==========================================================================
function renderWatches(page) {
  const all = catalogWatches();
  const counts = { all: all.length, owned: 0, building: 0, planned: 0 };
  all.forEach(w => { counts[w.ownership_status] = (counts[w.ownership_status] || 0) + 1; });
  const current = STATE.filters.relojes.ownership;
  const seg = `
    <div class="segmented" role="tablist" aria-label="Filtrar por posesión">
      ${[['all', 'Todos'], ['owned', 'En posesión'], ['building', 'En taller'], ['planned', 'Lo que quiero']].map(([k, l]) => `
        <button class="${current === k ? 'active' : ''}" data-action="set-ownership" data-value="${k}" role="tab" aria-selected="${current === k}">
          ${k !== 'all' ? `<span class="badge ${OWNERSHIP[k].cls}" style="height:8px;width:8px;padding:0"></span>` : ''}${l} <span class="c">${counts[k] || 0}</span>
        </button>`).join('')}
    </div>`;
  page.innerHTML = toolbar('relojes', {
    placeholder: 'Buscar por nombre, estilo, calibre o notas…',
    segmented: seg,
    filters: [{ key: 'status', all: 'Cualquier montaje', options: WATCH_STATUS }],
    sorts: [['recent', 'Recientes'], ['name', 'Nombre'], ['value', 'Mayor valor'], ['cost', 'Mayor coste'], ['margin', 'Mayor plusvalía']],
  });
  renderView();
}

function filteredWatches() {
  const f = STATE.filters.relojes;
  const q = normalize(STATE.search.relojes);
  let list = catalogWatches()
    .filter(w => f.ownership === 'all' || w.ownership_status === f.ownership)
    .filter(w => !f.status || w.status === f.status)
    .filter(w => matches(q, w.name, w.style, w.movement_name, w.notes, w.catalog_name));
  return sortBy(list, STATE.sort.relojes, {
    recent: byIdDesc,
    name: byText('name'),
    value: byNumDesc('estimated_value'),
    cost: byNumDesc('total_cost'),
    margin: (a, b) => ((b.estimated_value - b.total_cost) - (a.estimated_value - a.total_cost)),
  });
}

function watchQuickAction(w) {
  if (w.ownership_status === 'planned') return `<button class="btn btn-sm" data-action="set-watch-ownership" data-id="${w.id}" data-value="building">${icon('wrench', 'ico-sm')} Al taller</button>`;
  if (w.ownership_status === 'building') return `<button class="btn btn-sm btn-success" data-action="set-watch-ownership" data-id="${w.id}" data-value="owned">${icon('check', 'ico-sm')} Terminado</button>`;
  return `<button class="btn btn-sm" data-action="open-watch" data-id="${w.id}">${icon('eye', 'ico-sm')} Ficha</button>`;
}

function watchesView() {
  const list = filteredWatches();
  if (!list.length) {
    const f = STATE.filters.relojes.ownership;
    if (STATE.search.relojes || STATE.filters.relojes.status) return emptyState('Sin resultados', 'No hay relojes que coincidan con la búsqueda o los filtros.', false);
    return emptyState(
      f === 'planned' ? 'Nada en la lista de deseos' : f === 'building' ? 'Nada en el banco de trabajo' : 'Todavía no hay relojes',
      f === 'planned' ? 'Añade los builds que sueñas montar con su presupuesto por piezas.' : 'Registra tus relojes y mods con su despiece para calcular el coste real.');
  }

  if (STATE.view.relojes === 'table') {
    return `
      <div class="table-wrap"><div class="table-scroll"><table class="tbl">
        <thead><tr>
          <th>Reloj</th><th>Estado</th><th>Calibre</th><th class="c">Piezas</th>
          <th class="r">Coste</th><th class="r">Valor</th><th class="r">Plusvalía</th><th></th>
        </tr></thead>
        <tbody>${list.map(w => {
          const diff = (w.estimated_value || 0) - (w.total_cost || 0);
          const r = receivedStats(w);
          return `
          <tr>
            <td><div class="name-cell">${thumb(w.image_url)}<div><div class="t" data-action="open-watch" data-id="${w.id}">${esc(w.name)}</div><div class="s">${esc(w.style || '—')}${w.catalog_name ? ` · ${esc(w.catalog_name)}` : ''}</div></div></div></td>
            <td>${ownershipBadge(w.ownership_status)}</td>
            <td><span class="chip-mono">${esc(w.movement_name || '—')}</span></td>
            <td class="c num">${r.received}/${r.total}</td>
            <td class="r num">${money(w.total_cost)}</td>
            <td class="r num">${money(w.estimated_value)}</td>
            <td class="r num ${w.ownership_status === 'planned' ? 'muted' : diff >= 0 ? 'pos' : 'neg'}">${signed(diff)}</td>
            <td><div class="actions">
              <button class="icon-btn" data-action="open-watch" data-id="${w.id}" title="Ver ficha" aria-label="Ver ficha">${icon('eye')}</button>
              <button class="icon-btn" data-action="edit-watch" data-id="${w.id}" title="Editar" aria-label="Editar">${icon('pencil')}</button>
              <button class="icon-btn danger" data-action="delete-watch" data-id="${w.id}" title="Eliminar" aria-label="Eliminar">${icon('trash-2')}</button>
            </div></td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td colspan="4">${list.length} relojes</td><td class="r num">${money(list.reduce((a, w) => a + (w.total_cost || 0), 0))}</td><td class="r num">${money(list.reduce((a, w) => a + (w.estimated_value || 0), 0))}</td><td colspan="2"></td></tr></tfoot>
      </table></div></div>`;
  }

  return `<div class="cards">${list.map((w, i) => {
    const diff = (w.estimated_value || 0) - (w.total_cost || 0);
    const r = receivedStats(w);
    const isOwned = w.ownership_status === 'owned';
    const cat = STATE.data.catalogs.find(c => c.id === w.catalog_id);
    return `
      <article class="card" style="animation-delay:${Math.min(i, 12) * 30}ms">
        <div class="card-media" data-action="open-watch" data-id="${w.id}">
          ${media(w.image_url, w.name)}
          <div class="tl">${ownershipBadge(w.ownership_status, 'b-solid')}</div>
          ${w.movement_name ? `<div class="tr"><span class="badge b-solid">${icon('cpu', 'ico-sm')} ${esc(w.movement_name)}</span></div>` : ''}
        </div>
        <div class="card-body">
          <div class="card-eyebrow">${esc(w.style || 'Mod personalizado')}</div>
          <h3 class="card-title" data-action="open-watch" data-id="${w.id}">${esc(w.name)}</h3>
          <div class="card-meta">
            ${cat ? `<span><span class="cat-dot" style="display:inline-block;background:${esc(cat.color)};margin-right:5px"></span>${esc(cat.name)}</span><span>·</span>` : ''}
            <span>${esc(w.status)}</span>
          </div>
          <div class="card-stats">
            <div><div class="k">${isOwned ? 'Coste' : 'Presup.'}</div><div class="v">${money(w.total_cost)}</div></div>
            <div><div class="k">Valor</div><div class="v">${money(w.estimated_value)}</div></div>
            <div><div class="k">Margen</div><div class="v ${w.ownership_status === 'planned' ? '' : diff >= 0 ? 'pos' : 'neg'}">${signed(diff)}</div></div>
          </div>
          ${!isOwned && r.total ? `
            <div class="progress-label"><span>Piezas recibidas</span><span class="num">${r.received}/${r.total}</span></div>
            <div class="progress"><span style="width:${pct(r.received, r.total)}%"></span></div>` : ''}
        </div>
        <div class="card-foot">
          ${watchQuickAction(w)}
          <button class="icon-btn" data-action="edit-watch" data-id="${w.id}" title="Editar" aria-label="Editar">${icon('pencil')}</button>
          <button class="icon-btn" data-action="duplicate-watch" data-id="${w.id}" title="Duplicar" aria-label="Duplicar">${icon('copy')}</button>
          <button class="icon-btn danger" data-action="delete-watch" data-id="${w.id}" title="Eliminar" aria-label="Eliminar">${icon('trash-2')}</button>
        </div>
      </article>`;
  }).join('')}</div>`;
}

// --- Ficha de reloj (drawer) ---
function openWatchDrawer(id) {
  STATE.drawerWatchId = id;
  const existing = overlays.find(o => o.classList.contains('drawer-overlay'));
  if (existing) { renderDrawer(); return; }
  openOverlay('<aside class="drawer" role="dialog" aria-modal="true" aria-label="Ficha del reloj"></aside>', {
    drawer: true,
    onClose: () => { STATE.drawerWatchId = null; },
  });
  renderDrawer();
}

function renderDrawer() {
  const ov = overlays.find(o => o.classList.contains('drawer-overlay'));
  const w = STATE.data.watches.find(x => x.id === STATE.drawerWatchId);
  if (!ov) return;
  if (!w) { closeOverlay(ov); return; }
  const diff = (w.estimated_value || 0) - (w.total_cost || 0);
  const r = receivedStats(w);
  const comps = w.components || [];
  const scrollTop = $('.drawer-body', ov)?.scrollTop || 0;

  $('.drawer', ov).innerHTML = `
    <div class="drawer-media">
      ${media(w.image_url, w.name)}
      <button class="icon-btn close" data-action="close" aria-label="Cerrar">${icon('x')}</button>
    </div>
    <div class="drawer-body">
      <div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${ownershipBadge(w.ownership_status)}
          ${badge(w.status, '', false)}
          ${w.catalog_name ? badge(w.catalog_name, 'b-accent', false) : ''}
        </div>
        <div class="card-eyebrow">${esc(w.style || 'Mod personalizado')}${w.movement_name ? ` · ${esc(w.movement_name)}` : ''}</div>
        <h2 class="drawer-title">${esc(w.name)}</h2>
      </div>

      <div class="drawer-actions">
        <div class="segmented" role="group" aria-label="Posesión">
          ${Object.entries(OWNERSHIP).map(([k, o]) => `<button class="${w.ownership_status === k ? 'active' : ''}" data-action="set-watch-ownership" data-id="${w.id}" data-value="${k}">${icon(o.icon, 'ico-sm')} ${o.short}</button>`).join('')}
        </div>
        <span style="flex:1"></span>
        <button class="btn btn-sm" data-action="edit-watch" data-id="${w.id}">${icon('pencil', 'ico-sm')} Editar</button>
        <button class="icon-btn outlined" data-action="duplicate-watch" data-id="${w.id}" title="Duplicar" aria-label="Duplicar">${icon('copy')}</button>
        <button class="icon-btn outlined danger" data-action="delete-watch" data-id="${w.id}" title="Eliminar" aria-label="Eliminar">${icon('trash-2')}</button>
      </div>

      <div class="metrics">
        <div class="metric"><div class="k">${w.ownership_status === 'owned' ? 'Coste' : 'Presupuesto'}</div><div class="v">${money(w.total_cost)}</div></div>
        <div class="metric"><div class="k">Valor estimado</div><div class="v">${money(w.estimated_value)}</div></div>
        <div class="metric"><div class="k">Plusvalía</div><div class="v ${diff >= 0 ? 'pos' : 'neg'}">${signed(diff)}</div><div class="muted" style="font-size:11.5px">${pct(diff, w.total_cost)}% sobre coste</div></div>
      </div>

      ${r.total ? `
        <div>
          <div class="progress-label" style="margin-top:0"><span>Piezas recibidas</span><span class="num">${r.received} de ${r.total}</span></div>
          <div class="progress"><span style="width:${pct(r.received, r.total)}%"></span></div>
        </div>` : ''}

      ${w.notes ? `<div><div class="section-title">Notas</div><p class="notes">${esc(w.notes)}</p></div>` : ''}

      <div>
        <div class="section-title"><span>Despiece · ${comps.length} piezas</span><span class="num" style="color:var(--text)">${money(w.total_cost)}</span></div>
        <div class="comp-list">
          ${comps.map(c => `
            <div class="comp-item">
              <span class="type">${esc(c.component_type)}</span>
              <div class="nm">${esc(c.name)}<small>${esc(c.supplier || 'Sin proveedor')}</small></div>
              <button class="badge status-btn ${COMP_STATUS[c.status] || ''}" data-action="cycle-comp" data-id="${c.id}" title="Pulsa para cambiar el estado">${esc(c.status || 'Recibido')}</button>
              <span class="num" style="font-weight:600">${money(c.price)}</span>
              <button class="icon-btn danger" data-action="delete-comp" data-id="${c.id}" aria-label="Quitar pieza">${icon('x')}</button>
            </div>`).join('') || '<div class="comp-item" style="grid-template-columns:1fr"><span class="muted">Sin piezas todavía. Añade la primera abajo.</span></div>'}
          <form class="comp-add" data-comp-add="${w.id}" autocomplete="off">
            <select class="select" name="type" aria-label="Tipo">${options(COMPONENT_TYPES, 'Caja')}</select>
            <input class="input c-name" name="name" placeholder="Nueva pieza…" aria-label="Nombre de la pieza">
            <input class="input" name="supplier" placeholder="Proveedor" aria-label="Proveedor">
            <input class="input num" name="price" type="number" step="any" min="0" placeholder="€" aria-label="Precio">
            <button class="btn btn-sm btn-primary" type="submit" style="height:36px">${icon('plus', 'ico-sm')}</button>
          </form>
        </div>
      </div>
    </div>`;
  refreshIcons();
  $('.drawer-body', ov).scrollTop = scrollTop;
}

// --- Formulario de reloj con despiece ---
function compRowHtml(c = {}) {
  return `
    <div class="comp-editor-row" data-comp-row>
      <select class="select c-type" aria-label="Tipo">${options(COMPONENT_TYPES, c.component_type || 'Otro')}</select>
      <input class="input c-name" value="${esc(c.name || '')}" placeholder="Descripción de la pieza" aria-label="Descripción">
      <input class="input c-supplier" value="${esc(c.supplier || '')}" placeholder="Proveedor" aria-label="Proveedor">
      <select class="select c-status" aria-label="Estado">${options(Object.keys(COMP_STATUS), c.status || 'Recibido')}</select>
      <input class="input price c-price num" type="number" step="any" min="0" value="${c.price ?? ''}" placeholder="0,00" aria-label="Precio">
      <button type="button" class="icon-btn danger c-del" data-action="remove-comp-row" aria-label="Quitar fila">${icon('x')}</button>
    </div>`;
}

function openWatchForm(watch = null) {
  const isEdit = !!watch;
  const w = watch || {
    ownership_status: STATE.filters.relojes.ownership !== 'all' ? STATE.filters.relojes.ownership : 'owned',
    status: 'Montado', catalog_id: STATE.catalogId, estimated_value: '',
  };
  if (!isEdit && w.ownership_status === 'planned') w.status = 'En proyecto';
  if (!isEdit && w.ownership_status === 'building') w.status = 'En piezas';
  const comps = isEdit ? (watch.components || []) : ['Movimiento', 'Caja', 'Dial', 'Agujas', 'Cristal', 'Brazalete'].map(t => ({
    component_type: t, status: w.ownership_status === 'owned' ? 'Recibido' : 'Pendiente de compra',
  }));

  const fields = [
    { key: 'name', label: 'Nombre del reloj', required: true, full: true, placeholder: 'Ej. Santos Mod esmalte blanco' },
    { key: 'style', label: 'Estilo / inspiración', placeholder: 'Ej. Submariner, Datejust, Santos…' },
    { key: 'movement_name', label: 'Calibre', placeholder: 'Ej. NH35A', list: 'dl-movements', hint: 'Si coincide con uno de tu inventario se rellena la pieza «Movimiento».' },
    { key: 'ownership_status', label: 'Situación', type: 'select', options: Object.entries(OWNERSHIP).map(([k, o]) => [k, o.label]) },
    { key: 'status', label: 'Estado de montaje', type: 'select', options: WATCH_STATUS },
    { key: 'catalog_id', label: 'Colección', type: 'select', empty: 'Sin colección', int: true, options: () => STATE.data.catalogs.map(c => [c.id, `${c.icon || ''} ${c.name}`]) },
    { key: 'estimated_value', label: 'Valor estimado de mercado (€)', type: 'number', step: '0.01', placeholder: '0,00' },
    { key: 'image_url', label: 'Foto', type: 'image', full: true },
    { key: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Sumergibilidad, detalles de la esfera, juntas, ajustes…' },
  ];

  const body = `
    <form class="form-grid" data-form autocomplete="off">
      ${fields.map(f => fieldHtml(f, w[f.key])).join('')}
      <datalist id="dl-movements">${STATE.data.movements.map(m => `<option value="${esc(m.model)}">`).join('')}</datalist>
      <button type="submit" class="hidden"></button>
    </form>
    <div class="form-section"><span>Despiece</span><button type="button" class="btn btn-sm" data-action="add-comp-row">${icon('plus', 'ico-sm')} Añadir pieza</button></div>
    <div class="comp-editor">
      <div class="comp-editor-row head"><span>Tipo</span><span>Pieza</span><span>Proveedor</span><span>Estado</span><span style="text-align:right">Precio</span><span></span></div>
      <div data-comp-rows>${comps.map(compRowHtml).join('')}</div>
    </div>
    <p class="muted" style="font-size:12px;margin-top:8px">Las filas sin descripción no se guardan. El coste total se calcula sumando las piezas.</p>
    <div class="totals">
      <div class="metric"><div class="k">Coste total</div><div class="v" data-total="cost">0 €</div></div>
      <div class="metric"><div class="k">Valor estimado</div><div class="v" data-total="value">0 €</div></div>
      <div class="metric"><div class="k">Plusvalía</div><div class="v" data-total="diff">0 €</div></div>
    </div>`;

  const ov = openOverlay(modalShell({
    title: isEdit ? 'Editar reloj' : 'Nuevo reloj', icon: 'watch',
    sub: isEdit ? esc(watch.name) : 'Registra un reloj, un mod en curso o un build soñado.',
    body,
    foot: `<span class="spacer"></span><button class="btn btn-ghost" data-action="close">Cancelar</button><button class="btn btn-primary" data-action="save-watch">${isEdit ? 'Guardar cambios' : 'Crear reloj'}</button>`,
  }), { width: '900px' });
  bindImageFields(ov);

  const recalc = () => {
    const cost = $$('.c-price', ov).reduce((a, i) => a + (parseFloat(i.value) || 0), 0);
    const value = parseFloat($('#f-estimated_value', ov).value) || 0;
    const diff = value - cost;
    $('[data-total="cost"]', ov).textContent = money(cost);
    $('[data-total="value"]', ov).textContent = money(value);
    const d = $('[data-total="diff"]', ov);
    d.textContent = signed(diff);
    d.className = 'v ' + (diff >= 0 ? 'pos' : 'neg');
  };
  ov.addEventListener('input', e => { if (e.target.matches('.c-price, #f-estimated_value')) recalc(); });

  $('#f-movement_name', ov).addEventListener('change', e => {
    const mov = STATE.data.movements.find(m => normalize(m.model) === normalize(e.target.value));
    if (!mov) return;
    let row = $$('[data-comp-row]', ov).find(r => $('.c-type', r).value === 'Movimiento');
    if (!row) {
      $('[data-comp-rows]', ov).insertAdjacentHTML('afterbegin', compRowHtml({ component_type: 'Movimiento' }));
      row = $('[data-comp-row]', ov);
      refreshIcons();
    }
    if (!$('.c-name', row).value) $('.c-name', row).value = `Calibre ${mov.model}`;
    if (!$('.c-supplier', row).value) $('.c-supplier', row).value = mov.supplier || '';
    if (!parseFloat($('.c-price', row).value)) $('.c-price', row).value = mov.unit_price || 0;
    recalc();
  });

  $('#f-ownership_status', ov).addEventListener('change', e => {
    const st = $('#f-status', ov);
    if (e.target.value === 'owned') st.value = 'Montado';
    else if (e.target.value === 'planned') st.value = 'En proyecto';
    else if (e.target.value === 'building') st.value = 'En piezas';
  });

  const save = async () => {
    const data = readFields(fields, ov);
    if (!validate(fields, data)) return;
    data.components = $$('[data-comp-row]', ov).map(r => ({
      component_type: $('.c-type', r).value,
      name: $('.c-name', r).value.trim(),
      supplier: $('.c-supplier', r).value.trim() || null,
      status: $('.c-status', r).value,
      price: parseFloat($('.c-price', r).value) || 0,
    })).filter(c => c.name);
    const btn = $('[data-action="save-watch"]', ov);
    btn.disabled = true;
    const saved = await mutate(
      () => api(isEdit ? `/api/watches/${watch.id}` : '/api/watches', { method: isEdit ? 'PUT' : 'POST', body: data }),
      isEdit ? 'Reloj actualizado' : 'Reloj creado');
    btn.disabled = false;
    if (saved) {
      closeOverlay(ov);
      if (!isEdit && STATE.route !== 'relojes') go('relojes');
    }
  };
  $('[data-form]', ov).addEventListener('submit', e => { e.preventDefault(); save(); });
  ov.addEventListener('click', e => {
    if (e.target.closest('[data-action="save-watch"]')) save();
    if (e.target.closest('[data-action="add-comp-row"]')) {
      $('[data-comp-rows]', ov).insertAdjacentHTML('beforeend', compRowHtml());
      refreshIcons();
      $$('.c-name', ov).pop().focus();
    }
    const del = e.target.closest('[data-action="remove-comp-row"]');
    if (del) { del.closest('[data-comp-row]').remove(); recalc(); }
  });
  recalc();
}

// ==========================================================================
// 3. Calibres
// ==========================================================================
const MOVEMENT_FIELDS = [
  { key: 'model', label: 'Modelo de calibre', required: true, placeholder: 'Ej. NH35A, NH34 GMT, PT5000' },
  { key: 'supplier', label: 'Proveedor', placeholder: 'Ej. NamokiMODS' },
  { key: 'unit_price', label: 'Precio unitario (€)', type: 'number', step: '0.01', required: false },
  { key: 'stock', label: 'Stock (unidades)', type: 'number', step: '1' },
  { key: 'bph', label: 'Frecuencia (bph)', type: 'number', step: '1', placeholder: '21600', hint: '21.600 bph = 3 Hz · 28.800 bph = 4 Hz' },
  { key: 'power_reserve', label: 'Reserva de marcha (h)', type: 'number', step: '1', placeholder: '41' },
  { key: 'image_url', label: 'Foto', type: 'image', full: true },
  { key: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Posición de corona, disco de fecha, rotor…' },
];

function renderMovements(page) {
  page.innerHTML = toolbar('calibres', {
    placeholder: 'Buscar calibre o proveedor…',
    filters: [{ key: 'stock', all: 'Todo el stock', options: ['con', 'sin'], labels: { con: 'Con stock', sin: 'Sin stock' } }],
    sorts: [['model', 'Modelo'], ['price', 'Precio'], ['stock', 'Stock'], ['recent', 'Recientes']],
  });
  renderView();
}

function movementsView() {
  const f = STATE.filters.calibres;
  const q = normalize(STATE.search.calibres);
  let list = STATE.data.movements
    .filter(m => !f.stock || (f.stock === 'con' ? m.stock > 0 : m.stock === 0))
    .filter(m => matches(q, m.model, m.supplier, m.notes));
  list = sortBy(list, STATE.sort.calibres, { model: byText('model'), price: byNumDesc('unit_price'), stock: byNumDesc('stock'), recent: byIdDesc });
  if (!list.length) return STATE.data.movements.length ? emptyState('Sin resultados', 'Ningún calibre coincide con la búsqueda.', false) : emptyState('Sin calibres', 'Añade los movimientos que tienes en stock (NH35, NH34, PT5000…).');

  const hz = bph => bph ? `${(bph / 7200).toLocaleString('es-ES', { maximumFractionDigits: 1 })} Hz` : '—';
  const stepper = m => `
    <div class="stepper">
      <button data-action="stock" data-id="${m.id}" data-delta="-1" aria-label="Restar">${icon('minus', 'ico-sm')}</button>
      <span class="${m.stock === 0 ? 'neg' : ''}">${m.stock}</span>
      <button data-action="stock" data-id="${m.id}" data-delta="1" aria-label="Sumar">${icon('plus', 'ico-sm')}</button>
    </div>`;
  const actions = m => `
    <button class="icon-btn" data-action="edit-movement" data-id="${m.id}" aria-label="Editar">${icon('pencil')}</button>
    <button class="icon-btn danger" data-action="delete-movement" data-id="${m.id}" aria-label="Eliminar">${icon('trash-2')}</button>`;

  if (STATE.view.calibres === 'grid') {
    return `<div class="cards">${list.map(m => `
      <article class="card card-simple">
        <div class="card-body">
          <div class="head-row">${badge(m.stock > 0 ? `${m.stock} en stock` : 'Sin stock', m.stock > 0 ? 'b-owned' : 'b-danger')}${stepper(m)}</div>
          <h3 class="card-title" style="margin-top:6px">${esc(m.model)}</h3>
          <div class="card-eyebrow">${esc(m.supplier || 'Proveedor sin indicar')}</div>
          <div class="card-stats">
            <div><div class="k">Frec.</div><div class="v">${hz(m.bph)}</div></div>
            <div><div class="k">Reserva</div><div class="v">${m.power_reserve ? m.power_reserve + ' h' : '—'}</div></div>
            <div><div class="k">Stock €</div><div class="v">${money(m.unit_price * m.stock)}</div></div>
          </div>
          <p class="card-desc" style="margin-top:8px">${esc(m.notes || '')}</p>
        </div>
        <div class="card-foot"><span class="card-price" style="flex:1">${money(m.unit_price)}</span>${actions(m)}</div>
      </article>`).join('')}</div>`;
  }

  return `
    <div class="table-wrap"><div class="table-scroll"><table class="tbl">
      <thead><tr><th>Calibre</th><th class="c">Frecuencia</th><th class="c">Reserva</th><th class="r">Precio</th><th class="c">Stock</th><th class="r">Valor stock</th><th>Notas</th><th></th></tr></thead>
      <tbody>${list.map(m => `
        <tr>
          <td><div class="name-cell"><div class="thumb">${icon('cpu')}</div><div><div class="t" data-action="edit-movement" data-id="${m.id}">${esc(m.model)}</div><div class="s">${esc(m.supplier || '—')}</div></div></div></td>
          <td class="c"><span class="chip-mono">${m.bph ? m.bph.toLocaleString('es-ES') : '—'}</span> <span class="muted" style="font-size:11.5px">${hz(m.bph)}</span></td>
          <td class="c num">${m.power_reserve ? m.power_reserve + ' h' : '—'}</td>
          <td class="r num">${money(m.unit_price)}</td>
          <td class="c">${stepper(m)}</td>
          <td class="r num">${money(m.unit_price * m.stock)}</td>
          <td><div class="clip" title="${esc(m.notes || '')}">${esc(m.notes || '—')}</div></td>
          <td><div class="actions">${actions(m)}</div></td>
        </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">${list.length} calibres</td><td class="c num">${list.reduce((a, m) => a + m.stock, 0)}</td><td class="r num">${money(list.reduce((a, m) => a + m.unit_price * m.stock, 0))}</td><td colspan="2"></td></tr></tfoot>
    </table></div></div>`;
}

function openMovementForm(m = null) {
  openFormModal({
    title: m ? 'Editar calibre' : 'Nuevo calibre', icon: 'cpu', fields: MOVEMENT_FIELDS,
    values: m || { stock: 1, bph: 21600, power_reserve: 41 },
    onSubmit: data => mutate(() => api(m ? `/api/movements/${m.id}` : '/api/movements', { method: m ? 'PUT' : 'POST', body: data }), m ? 'Calibre actualizado' : 'Calibre añadido'),
  });
}

// ==========================================================================
// 4. Piezas
// ==========================================================================
const PART_FIELDS = [
  { key: 'name', label: 'Nombre / modelo', required: true, full: true, placeholder: 'Ej. Dial blanco esmalte 28.5 mm' },
  { key: 'part_type', label: 'Tipo', type: 'select', options: PART_TYPES },
  { key: 'status', label: 'Estado', type: 'select', options: Object.keys(PART_STATUS) },
  { key: 'compatibility', label: 'Compatibilidad', placeholder: 'Ej. Seiko 28.5 mm / NH35' },
  { key: 'supplier', label: 'Proveedor', placeholder: 'Ej. Lucius Atelier' },
  { key: 'price', label: 'Precio (€)', type: 'number', step: '0.01' },
  { key: 'assigned_watch_id', label: 'Asignada a reloj', type: 'select', empty: 'Ninguno (en el cajón)', int: true, options: () => STATE.data.watches.map(w => [w.id, w.name]) },
  { key: 'finish_notes', label: 'Acabado / lume', full: true, placeholder: 'Ej. Lume BGW9, pulido espejo…' },
  { key: 'buy_url', label: 'Enlace de compra', type: 'url', full: true, placeholder: 'https://…' },
  { key: 'image_url', label: 'Foto', type: 'image', full: true },
];

function renderParts(page) {
  page.innerHTML = toolbar('piezas', {
    placeholder: 'Buscar pieza, compatibilidad, proveedor…',
    filters: [{ key: 'type', all: 'Todos los tipos', options: PART_TYPES }, { key: 'status', all: 'Cualquier estado', options: Object.keys(PART_STATUS) }],
    sorts: [['recent', 'Recientes'], ['name', 'Nombre'], ['price', 'Precio'], ['type', 'Tipo']],
  });
  renderView();
}

function partsView() {
  const f = STATE.filters.piezas;
  const q = normalize(STATE.search.piezas);
  let list = STATE.data.parts
    .filter(p => !f.type || p.part_type === f.type)
    .filter(p => !f.status || p.status === f.status)
    .filter(p => matches(q, p.name, p.compatibility, p.supplier, p.finish_notes, p.part_type));
  list = sortBy(list, STATE.sort.piezas, { recent: byIdDesc, name: byText('name'), price: byNumDesc('price'), type: byText('part_type') });
  if (!list.length) return STATE.data.parts.length ? emptyState('Sin resultados', 'Ninguna pieza coincide con los filtros.', false) : emptyState('El cajón está vacío', 'Añade esferas, cajas, agujas, biseles o cristales sueltos.');

  const actions = p => `
    ${safeUrl(p.buy_url) ? `<a class="icon-btn" href="${safeUrl(p.buy_url)}" target="_blank" rel="noopener" title="Abrir tienda" aria-label="Abrir tienda">${icon('external-link')}</a>` : ''}
    <button class="icon-btn" data-action="edit-part" data-id="${p.id}" aria-label="Editar">${icon('pencil')}</button>
    <button class="icon-btn danger" data-action="delete-part" data-id="${p.id}" aria-label="Eliminar">${icon('trash-2')}</button>`;
  const status = p => badge(p.status, PART_STATUS[p.status] || '');

  if (STATE.view.piezas === 'grid') {
    return `<div class="cards">${list.map(p => `
      <article class="card">
        <div class="card-media" data-action="edit-part" data-id="${p.id}" style="aspect-ratio:16/10">
          ${media(p.image_url, p.name)}
          <div class="tl">${badge(p.part_type, 'b-solid', false)}</div>
          <div class="tr">${status(p)}</div>
        </div>
        <div class="card-body">
          <div class="card-eyebrow">${esc(p.supplier || 'Proveedor sin indicar')}</div>
          <h3 class="card-title" data-action="edit-part" data-id="${p.id}">${esc(p.name)}</h3>
          <div class="card-meta">${esc(p.compatibility || 'Compatibilidad sin indicar')}</div>
          ${p.assigned_watch_name ? `<div class="card-meta">${icon('link', 'ico-sm')} ${esc(p.assigned_watch_name)}</div>` : ''}
        </div>
        <div class="card-foot"><span class="card-price" style="flex:1">${money(p.price)}</span>${actions(p)}</div>
      </article>`).join('')}</div>`;
  }

  return `
    <div class="table-wrap"><div class="table-scroll"><table class="tbl">
      <thead><tr><th>Pieza</th><th>Tipo</th><th>Proveedor</th><th>Estado</th><th class="r">Precio</th><th></th></tr></thead>
      <tbody>${list.map(p => `
        <tr>
          <td><div class="name-cell">${thumb(p.image_url)}<div><div class="t" data-action="edit-part" data-id="${p.id}">${esc(p.name)}</div><div class="s">${esc(p.compatibility || '—')}${p.finish_notes ? ` · ${esc(p.finish_notes)}` : ''}</div></div></div></td>
          <td>${badge(p.part_type, 'b-accent', false)}</td>
          <td>${esc(p.supplier || '—')}</td>
          <td>${status(p)}${p.assigned_watch_name ? `<div class="muted" style="font-size:11.5px;margin-top:3px">${esc(p.assigned_watch_name)}</div>` : ''}</td>
          <td class="r num">${money(p.price)}</td>
          <td><div class="actions">${actions(p)}</div></td>
        </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">${list.length} piezas</td><td class="r num">${money(list.reduce((a, p) => a + (p.price || 0), 0))}</td><td></td></tr></tfoot>
    </table></div></div>`;
}

function openPartForm(p = null) {
  openFormModal({
    title: p ? 'Editar pieza' : 'Nueva pieza', icon: 'cog', fields: PART_FIELDS,
    values: p || { part_type: STATE.filters.piezas.type || 'Dial', status: 'Disponible' },
    onSubmit: data => {
      if (data.assigned_watch_id && data.status === 'Disponible') data.status = 'Asignado';
      return mutate(() => api(p ? `/api/parts/${p.id}` : '/api/parts', { method: p ? 'PUT' : 'POST', body: data }), p ? 'Pieza actualizada' : 'Pieza añadida');
    },
  });
}

// ==========================================================================
// 5. Herramientas
// ==========================================================================
const TOOL_FIELDS = [
  { key: 'name', label: 'Herramienta', required: true, full: true, placeholder: 'Ej. Prensa de cristales con matrices' },
  { key: 'category', label: 'Categoría', type: 'select', options: TOOL_CATEGORIES },
  { key: 'status', label: 'Estado', type: 'select', options: Object.keys(TOOL_STATUS) },
  { key: 'supplier', label: 'Proveedor', placeholder: 'Ej. Esslinger' },
  { key: 'price', label: 'Precio (€)', type: 'number', step: '0.01' },
  { key: 'buy_url', label: 'Enlace de compra', type: 'url', full: true, placeholder: 'https://…' },
  { key: 'image_url', label: 'Foto', type: 'image', full: true },
  { key: 'notes', label: 'Notas', type: 'textarea', full: true },
];

function renderTools(page) {
  page.innerHTML = toolbar('herramientas', {
    placeholder: 'Buscar herramienta…',
    filters: [{ key: 'category', all: 'Todas las categorías', options: TOOL_CATEGORIES }, { key: 'status', all: 'Cualquier estado', options: Object.keys(TOOL_STATUS) }],
    sorts: [['name', 'Nombre'], ['price', 'Precio'], ['recent', 'Recientes']],
  });
  renderView();
}

function toolsView() {
  const f = STATE.filters.herramientas;
  const q = normalize(STATE.search.herramientas);
  let list = STATE.data.tools
    .filter(t => !f.category || t.category === f.category)
    .filter(t => !f.status || t.status === f.status)
    .filter(t => matches(q, t.name, t.category, t.supplier, t.notes));
  list = sortBy(list, STATE.sort.herramientas, { name: byText('name'), price: byNumDesc('price'), recent: byIdDesc });
  if (!list.length) return STATE.data.tools.length ? emptyState('Sin resultados', 'Ninguna herramienta coincide.', false) : emptyState('Banco de trabajo vacío', 'Registra prensas, pinzas, abridores y consumibles.');

  const actions = t => `
    ${safeUrl(t.buy_url) ? `<a class="icon-btn" href="${safeUrl(t.buy_url)}" target="_blank" rel="noopener" aria-label="Abrir tienda">${icon('external-link')}</a>` : ''}
    <button class="icon-btn" data-action="edit-tool" data-id="${t.id}" aria-label="Editar">${icon('pencil')}</button>
    <button class="icon-btn danger" data-action="delete-tool" data-id="${t.id}" aria-label="Eliminar">${icon('trash-2')}</button>`;

  if (STATE.view.herramientas === 'grid') {
    return `<div class="cards">${list.map(t => `
      <article class="card">
        <div class="card-media" data-action="edit-tool" data-id="${t.id}" style="aspect-ratio:16/10">
          ${safeUrl(t.image_url) ? media(t.image_url, t.name) : `<div class="dial" style="color:var(--accent)">${icon('hammer')}</div>`}
          <div class="tl">${badge(t.category, 'b-solid', false)}</div>
          <div class="tr">${badge(t.status, `${TOOL_STATUS[t.status] || ''} b-solid`)}</div>
        </div>
        <div class="card-body">
          <div class="card-eyebrow">${esc(t.supplier || 'Proveedor sin indicar')}</div>
          <h3 class="card-title" data-action="edit-tool" data-id="${t.id}">${esc(t.name)}</h3>
          <p class="card-desc">${esc(t.notes || '')}</p>
        </div>
        <div class="card-foot"><span class="card-price" style="flex:1">${money(t.price)}</span>${actions(t)}</div>
      </article>`).join('')}</div>`;
  }

  return `
    <div class="table-wrap"><div class="table-scroll"><table class="tbl">
      <thead><tr><th>Herramienta</th><th>Categoría</th><th>Proveedor</th><th>Estado</th><th class="r">Precio</th><th></th></tr></thead>
      <tbody>${list.map(t => `
        <tr>
          <td><div class="name-cell">${safeUrl(t.image_url) ? thumb(t.image_url) : `<div class="thumb">${icon('hammer')}</div>`}<div><div class="t" data-action="edit-tool" data-id="${t.id}">${esc(t.name)}</div><div class="s clip">${esc(t.notes || '—')}</div></div></div></td>
          <td>${badge(t.category, 'b-accent', false)}</td>
          <td>${esc(t.supplier || '—')}</td>
          <td>${badge(t.status, TOOL_STATUS[t.status] || '')}</td>
          <td class="r num">${money(t.price)}</td>
          <td><div class="actions">${actions(t)}</div></td>
        </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">${list.length} herramientas</td><td class="r num">${money(list.reduce((a, t) => a + (t.price || 0), 0))}</td><td></td></tr></tfoot>
    </table></div></div>`;
}

function openToolForm(t = null) {
  openFormModal({
    title: t ? 'Editar herramienta' : 'Nueva herramienta', icon: 'hammer', fields: TOOL_FIELDS,
    values: t || { category: STATE.filters.herramientas.category || 'Herramienta', status: 'Disponible' },
    onSubmit: data => mutate(() => api(t ? `/api/tools/${t.id}` : '/api/tools', { method: t ? 'PUT' : 'POST', body: data }), t ? 'Herramienta actualizada' : 'Herramienta añadida'),
  });
}

// ==========================================================================
// 6. Deseos
// ==========================================================================
const WISH_FIELDS = [
  { key: 'item_name', label: 'Qué quieres', required: true, full: true, placeholder: 'Ej. Dial meteorito 28.5 mm' },
  { key: 'category', label: 'Categoría', type: 'select', options: WISH_CATEGORIES },
  { key: 'priority', label: 'Prioridad', type: 'select', options: Object.keys(PRIORITY) },
  { key: 'target_price', label: 'Precio objetivo (€)', type: 'number', step: '0.01' },
  { key: 'status', label: 'Estado', type: 'select', options: Object.keys(WISH_STATUS) },
  { key: 'buy_url', label: 'Enlace de compra', type: 'url', full: true, placeholder: 'https://…' },
  { key: 'image_url', label: 'Foto', type: 'image', full: true },
  { key: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Esperar al 11.11, usar cupón…' },
];

function renderWishlist(page) {
  const pending = STATE.data.wishlist.filter(w => w.status === 'Pendiente');
  page.innerHTML = `
    <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
      <div class="kpi" style="--kpi-c:var(--violet)"><div class="kpi-label">${icon('bookmark')} Pendiente</div><div class="kpi-value">${money(pending.reduce((a, w) => a + (w.target_price || 0), 0))}</div><div class="kpi-foot"><b>${pending.length}</b> artículos</div></div>
      <div class="kpi" style="--kpi-c:var(--danger)"><div class="kpi-label">${icon('flame')} Alta prioridad</div><div class="kpi-value">${money(pending.filter(w => w.priority === 'Alta').reduce((a, w) => a + (w.target_price || 0), 0))}</div><div class="kpi-foot"><b>${pending.filter(w => w.priority === 'Alta').length}</b> artículos</div></div>
      <div class="kpi" style="--kpi-c:var(--success)"><div class="kpi-label">${icon('package-check')} Ya comprado</div><div class="kpi-value">${STATE.data.wishlist.filter(w => w.status === 'Comprado').length}</div><div class="kpi-foot">deseos cumplidos</div></div>
    </div>` + toolbar('deseos', {
    placeholder: 'Buscar en la lista de deseos…',
    filters: [{ key: 'priority', all: 'Cualquier prioridad', options: Object.keys(PRIORITY) }, { key: 'status', all: 'Cualquier estado', options: Object.keys(WISH_STATUS) }],
    sorts: [['priority', 'Prioridad'], ['price', 'Precio'], ['name', 'Nombre'], ['recent', 'Recientes']],
  });
  renderView();
}

function wishlistView() {
  const f = STATE.filters.deseos;
  const q = normalize(STATE.search.deseos);
  const prioRank = { Alta: 0, Media: 1, Baja: 2 };
  const statusRank = { Pendiente: 0, Comprado: 1, Descartado: 2 };
  let list = STATE.data.wishlist
    .filter(w => !f.priority || w.priority === f.priority)
    .filter(w => !f.status || w.status === f.status)
    .filter(w => matches(q, w.item_name, w.notes, w.category));
  list = sortBy(list, STATE.sort.deseos, {
    priority: (a, b) => (statusRank[a.status] - statusRank[b.status]) || (prioRank[a.priority] - prioRank[b.priority]) || b.id - a.id,
    price: byNumDesc('target_price'), name: byText('item_name'), recent: byIdDesc,
  });
  if (!list.length) return STATE.data.wishlist.length ? emptyState('Sin resultados', 'Nada coincide con los filtros.', false) : emptyState('Lista de deseos vacía', 'Apunta piezas y calibres que quieras comprar con su precio objetivo.');

  const actions = w => `
    ${w.status === 'Pendiente' ? `<button class="btn btn-sm btn-success" data-action="convert-wish" data-id="${w.id}" title="Lo he comprado">${icon('package-check', 'ico-sm')} Comprado</button>` : ''}
    ${safeUrl(w.buy_url) ? `<a class="icon-btn" href="${safeUrl(w.buy_url)}" target="_blank" rel="noopener" aria-label="Abrir tienda">${icon('external-link')}</a>` : ''}
    <button class="icon-btn" data-action="edit-wish" data-id="${w.id}" aria-label="Editar">${icon('pencil')}</button>
    <button class="icon-btn danger" data-action="delete-wish" data-id="${w.id}" aria-label="Eliminar">${icon('trash-2')}</button>`;

  if (STATE.view.deseos === 'grid') {
    return `<div class="cards">${list.map(w => `
      <article class="card card-simple" style="${w.status !== 'Pendiente' ? 'opacity:.72' : ''}">
        <div class="card-body">
          <div class="head-row">${badge(w.priority, PRIORITY[w.priority])}${badge(w.status, WISH_STATUS[w.status] || '', false)}</div>
          <h3 class="card-title" style="margin-top:6px" data-action="edit-wish" data-id="${w.id}">${esc(w.item_name)}</h3>
          <div class="card-eyebrow">${esc(w.category)}</div>
          <p class="card-desc">${esc(w.notes || '')}</p>
        </div>
        <div class="card-foot"><span class="card-price" style="flex:1">${money(w.target_price)}</span>${actions(w)}</div>
      </article>`).join('')}</div>`;
  }

  return `
    <div class="table-wrap"><div class="table-scroll"><table class="tbl">
      <thead><tr><th>Prioridad</th><th>Artículo</th><th>Categoría</th><th class="r">Objetivo</th><th>Estado</th><th></th></tr></thead>
      <tbody>${list.map(w => `
        <tr style="${w.status !== 'Pendiente' ? 'opacity:.65' : ''}">
          <td>${badge(w.priority, PRIORITY[w.priority])}</td>
          <td><div class="name-cell" style="min-width:240px">${safeUrl(w.image_url) ? thumb(w.image_url) : ''}<div><div class="t" data-action="edit-wish" data-id="${w.id}">${esc(w.item_name)}</div><div class="s clip">${esc(w.notes || '—')}</div></div></div></td>
          <td>${esc(w.category)}</td>
          <td class="r num">${money(w.target_price)}</td>
          <td>${badge(w.status, WISH_STATUS[w.status] || '', false)}</td>
          <td><div class="actions" style="align-items:center">${actions(w)}</div></td>
        </tr>`).join('')}</tbody>
    </table></div></div>`;
}

function openWishForm(w = null) {
  openFormModal({
    title: w ? 'Editar deseo' : 'Nuevo deseo', icon: 'bookmark', fields: WISH_FIELDS,
    values: w || { category: 'Pieza', priority: 'Media', status: 'Pendiente' },
    onSubmit: data => mutate(() => api(w ? `/api/wishlist/${w.id}` : '/api/wishlist', { method: w ? 'PUT' : 'POST', body: data }), w ? 'Deseo actualizado' : 'Añadido a la lista'),
  });
}

function openConvertWish(w) {
  const dest = w.category === 'Movimiento' ? 'movement' : w.category === 'Herramienta' ? 'tool' : 'part';
  const fields = [
    { key: 'inventory_type', label: 'Pasar a', type: 'select', options: [['part', 'Piezas'], ['movement', 'Calibres'], ['tool', 'Herramientas']] },
    { key: 'actual_price', label: 'Precio pagado (€)', type: 'number', step: '0.01' },
    { key: 'supplier', label: 'Proveedor', full: true, placeholder: 'Dónde lo compraste' },
  ];
  openFormModal({
    title: '¡Comprado!', icon: 'package-check', width: '520px',
    sub: `«${esc(w.item_name)}» se añadirá a tu inventario y quedará marcado como comprado.`,
    fields, values: { inventory_type: dest, actual_price: w.target_price },
    submitText: 'Pasar al inventario',
    onSubmit: data => mutate(() => api(`/api/wishlist/${w.id}/convert`, { method: 'POST', body: data }), 'Movido al inventario'),
  });
}

// ==========================================================================
// Colecciones
// ==========================================================================
function openCatalogForm(cat = null) {
  const c = cat || { icon: '⌚', color: CATALOG_COLORS[STATE.data.catalogs.length % CATALOG_COLORS.length] };
  const body = `
    <form class="form-grid" data-form autocomplete="off">
      <div class="field full"><label for="cat-name">Nombre <span class="req">*</span></label><input class="input" id="cat-name" value="${esc(c.name || '')}" placeholder="Ej. Vintage, Divers, Encargos…"></div>
      <div class="field full">
        <label>Icono</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${CATALOG_EMOJIS.map(e => `<button type="button" class="icon-btn outlined" data-emoji="${e}" style="font-size:17px">${e}</button>`).join('')}
          <input class="input" id="cat-icon" value="${esc(c.icon || '')}" style="width:70px;text-align:center;font-size:17px" aria-label="Emoji personalizado">
        </div>
      </div>
      <div class="field full">
        <label>Color</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          ${CATALOG_COLORS.map(col => `<button type="button" data-color="${col}" aria-label="Color ${col}" style="width:30px;height:30px;border-radius:50%;border:2px solid var(--surface);box-shadow:0 0 0 1px var(--line-strong);background:${col}"></button>`).join('')}
          <input type="color" id="cat-color" value="${esc(c.color || '#c9a36a')}" style="width:44px;height:32px;border:0;background:none;padding:0" aria-label="Color personalizado">
        </div>
      </div>
      <div class="field full"><label for="cat-desc">Descripción</label><textarea class="textarea" id="cat-desc" rows="2">${esc(c.description || '')}</textarea></div>
      <button type="submit" class="hidden"></button>
    </form>`;
  const ov = openOverlay(modalShell({
    title: cat ? 'Editar colección' : 'Nueva colección', icon: 'folder', body,
    foot: `${cat ? `<button class="btn btn-danger" data-action="delete-catalog-confirm">${icon('trash-2', 'ico-sm')} Eliminar</button>` : ''}
           <span class="spacer"></span><button class="btn btn-ghost" data-action="close">Cancelar</button>
           <button class="btn btn-primary" data-action="save-catalog">${cat ? 'Guardar' : 'Crear colección'}</button>`,
  }), { width: '520px' });
  setTimeout(() => $('#cat-name', ov).focus(), 40);

  const save = async () => {
    const name = $('#cat-name', ov).value.trim();
    if (!name) { toast('Ponle un nombre a la colección', 'error'); return; }
    const body = { name, icon: $('#cat-icon', ov).value.trim() || '⌚', color: $('#cat-color', ov).value, description: $('#cat-desc', ov).value.trim() || null };
    const saved = await mutate(() => api(cat ? `/api/catalogs/${cat.id}` : '/api/catalogs', { method: cat ? 'PUT' : 'POST', body }), cat ? 'Colección actualizada' : 'Colección creada');
    if (saved) {
      closeOverlay(ov);
      if (!cat) selectCatalog(saved.id);
    }
  };
  $('[data-form]', ov).addEventListener('submit', e => { e.preventDefault(); save(); });
  ov.addEventListener('click', async e => {
    const em = e.target.closest('[data-emoji]');
    if (em) $('#cat-icon', ov).value = em.dataset.emoji;
    const col = e.target.closest('[data-color]');
    if (col) $('#cat-color', ov).value = col.dataset.color;
    if (e.target.closest('[data-action="save-catalog"]')) save();
    if (e.target.closest('[data-action="delete-catalog-confirm"]')) {
      const ok = await confirmDialog({ title: 'Eliminar colección', message: `Se eliminará «${esc(cat.name)}». Sus relojes no se borran: quedan sin colección.`, confirmText: 'Eliminar', danger: true });
      if (!ok) return;
      closeOverlay(ov);
      if (STATE.catalogId === cat.id) { STATE.catalogId = null; store.set('catalog', null); }
      await mutate(() => api(`/api/catalogs/${cat.id}`, { method: 'DELETE', raw: true }), 'Colección eliminada');
    }
  });
}

async function selectCatalog(id) {
  STATE.catalogId = id;
  store.set('catalog', id);
  await refresh();
}

// ==========================================================================
// Backup
// ==========================================================================
async function exportBackup() {
  try {
    const data = await api('/api/summary/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `horology_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup descargado', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); }
  catch (e) { toast('El archivo no es un JSON válido', 'error'); return; }
  const n = (data.watches || []).length;
  const ok = await confirmDialog({
    title: 'Restaurar backup',
    message: `Se reemplazarán <b>todos</b> los datos actuales por los del archivo (${n} relojes, ${(data.parts || []).length} piezas, ${(data.movements || []).length} calibres). El servidor guarda antes una copia automática de lo que tienes ahora.`,
    confirmText: 'Restaurar', danger: true,
  });
  if (ok) await mutate(() => api('/api/summary/import', { method: 'POST', body: data }), 'Backup restaurado');
}

// ==========================================================================
// Tema
// ==========================================================================
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('horology_theme', next); } catch (e) { /* sin almacenamiento */ }
  $$('meta[name="theme-color"]').forEach(m => m.setAttribute('content', next === 'dark' ? '#0d0e10' : '#f4f1ea'));
}

// ==========================================================================
// Acciones (delegación de eventos)
// ==========================================================================
const VIEWS = { relojes: watchesView, calibres: movementsView, piezas: partsView, herramientas: toolsView, deseos: wishlistView };
const find = (coll, id) => STATE.data[coll].find(x => x.id === id);
const COMP_CYCLE = Object.keys(COMP_STATUS);

function newItem() {
  ({
    resumen: () => openWatchForm(), relojes: () => openWatchForm(), calibres: () => openMovementForm(),
    piezas: () => openPartForm(), herramientas: () => openToolForm(), deseos: () => openWishForm(),
  })[STATE.route]();
}

async function confirmDelete(what, name, path, msg) {
  const ok = await confirmDialog({ title: `Eliminar ${what}`, message: `¿Seguro que quieres eliminar «${esc(name)}»? No se puede deshacer.`, confirmText: 'Eliminar', danger: true });
  if (ok) await mutate(() => api(path, { method: 'DELETE', raw: true }), msg);
  return ok;
}

const ACTIONS = {
  'close': () => closeOverlay(),
  'open-menu': () => document.body.classList.add('menu-open'),
  'close-menu': () => document.body.classList.remove('menu-open'),
  'toggle-theme': toggleTheme,
  'export': exportBackup,
  'import': () => $('#import-file').click(),
  'reset-demo': async () => {
    const ok = await confirmDialog({ title: 'Cargar datos de ejemplo', message: 'Se <b>borrarán todos tus datos</b> y se cargarán relojes, calibres y piezas de ejemplo. Descarga antes un backup si quieres conservarlos.', confirmText: 'Borrar y cargar ejemplo', danger: true });
    if (ok) await mutate(() => api('/api/summary/reset-seed?confirm=BORRAR', { method: 'POST' }), 'Datos de ejemplo cargados');
  },
  'new-item': newItem,
  'new-catalog': () => openCatalogForm(),
  'edit-catalog': (id, el, e) => { e.stopPropagation(); openCatalogForm(find('catalogs', id)); },
  'select-catalog': async (id, el) => {
    await selectCatalog(id || null);
    if (el.dataset.goto) go(el.dataset.goto);
  },
  'set-view': (id, el) => { STATE.view[STATE.route] = el.dataset.view; store.set('view', STATE.view); $$('[data-action="set-view"]').forEach(b => b.classList.toggle('active', b === el)); renderView(); },
  'set-ownership': (id, el) => {
    STATE.filters.relojes.ownership = el.dataset.value;
    $$('[data-action="set-ownership"]').forEach(b => { b.classList.toggle('active', b === el); b.setAttribute('aria-selected', b === el); });
    renderView();
  },

  'open-watch': id => openWatchDrawer(id),
  'edit-watch': id => openWatchForm(find('watches', id)),
  'duplicate-watch': async id => {
    const copy = await mutate(() => api(`/api/watches/${id}/duplicate`, { method: 'POST' }), 'Reloj duplicado');
    if (copy && STATE.drawerWatchId) openWatchDrawer(copy.id);
  },
  'delete-watch': async id => {
    const w = find('watches', id);
    const ov = overlays.find(o => o.classList.contains('drawer-overlay'));
    if (await confirmDelete('reloj', w.name, `/api/watches/${id}`, 'Reloj eliminado') && ov && STATE.drawerWatchId === id) closeOverlay(ov);
  },
  'set-watch-ownership': async (id, el) => {
    const label = OWNERSHIP[el.dataset.value].label;
    await mutate(() => api(`/api/watches/${id}/ownership`, { method: 'PATCH', body: { ownership_status: el.dataset.value } }), `Movido a «${label}»`);
  },
  'cycle-comp': async (id, el) => {
    const next = COMP_CYCLE[(COMP_CYCLE.indexOf(el.textContent.trim()) + 1) % COMP_CYCLE.length];
    await mutate(() => api(`/api/watches/components/${id}/status`, { method: 'PATCH', body: { status: next } }));
  },
  'delete-comp': async id => { await mutate(() => api(`/api/watches/components/${id}`, { method: 'DELETE' }), 'Pieza quitada'); },

  'stock': async (id, el) => { await mutate(() => api(`/api/movements/${id}/stock`, { method: 'PATCH', body: { delta: Number(el.dataset.delta) } })); },
  'edit-movement': id => openMovementForm(find('movements', id)),
  'delete-movement': id => confirmDelete('calibre', find('movements', id).model, `/api/movements/${id}`, 'Calibre eliminado'),
  'edit-part': id => openPartForm(find('parts', id)),
  'delete-part': id => confirmDelete('pieza', find('parts', id).name, `/api/parts/${id}`, 'Pieza eliminada'),
  'edit-tool': id => openToolForm(find('tools', id)),
  'delete-tool': id => confirmDelete('herramienta', find('tools', id).name, `/api/tools/${id}`, 'Herramienta eliminada'),
  'edit-wish': id => openWishForm(find('wishlist', id)),
  'delete-wish': id => confirmDelete('deseo', find('wishlist', id).item_name, `/api/wishlist/${id}`, 'Deseo eliminado'),
  'convert-wish': id => openConvertWish(find('wishlist', id)),

  'pick-image': (id, el) => $('[data-image-input]', el.closest('[data-image-field]')).click(),
  'clear-image': (id, el) => { const w = el.closest('[data-image-field]'); $('input[type=url]', w).value = ''; setImagePreview(w, ''); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) {
    const action = el.dataset.action;
    if (el.tagName === 'A' && action !== 'open-watch') e.preventDefault();
    if (action === 'open-watch') e.preventDefault();
    const id = el.dataset.id ? Number(el.dataset.id) : null;
    ACTIONS[action](id, el, e);
  }
  if (e.target.closest('[data-close-menu]')) document.body.classList.remove('menu-open');
  const r = e.target.closest('.bottombar [data-route]');
  if (r) go(r.dataset.route);
});

document.addEventListener('submit', async e => {
  const form = e.target.closest('[data-comp-add]');
  if (!form) return;
  e.preventDefault();
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim();
  if (!name) { toast('Escribe el nombre de la pieza', 'error'); form.name.focus(); return; }
  const watch = find('watches', Number(form.dataset.compAdd));
  await mutate(() => api(`/api/watches/${form.dataset.compAdd}/components`, {
    method: 'POST',
    body: {
      component_type: fd.get('type'), name, supplier: String(fd.get('supplier') || '').trim() || null,
      price: parseFloat(fd.get('price')) || 0, status: watch && watch.ownership_status === 'owned' ? 'Recibido' : 'Pendiente de compra',
    },
  }), 'Pieza añadida');
});

const onSearch = debounce(el => { STATE.search[el.dataset.search] = el.value; renderView(); }, 140);
document.addEventListener('input', e => { if (e.target.matches('[data-search]')) onSearch(e.target); });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-filter]')) { STATE.filters[t.dataset.filter][t.dataset.key] = t.value; renderView(); }
  if (t.matches('[data-sort]')) { STATE.sort[t.dataset.sort] = t.value; store.set('sort', STATE.sort); renderView(); }
  if (t.id === 'import-file' && t.files[0]) { importBackup(t.files[0]); t.value = ''; }
});

document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') {
    if (overlays.length) { closeOverlay(); e.preventDefault(); }
    else document.body.classList.remove('menu-open');
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || overlays.length) return;
  if (e.key === '/') { const s = $('[data-search]'); if (s) { e.preventDefault(); s.focus(); } }
  if (e.key === 'n') { e.preventDefault(); newItem(); }
});

window.addEventListener('hashchange', () => { closeAllOverlays(); render(); window.scrollTo({ top: 0 }); });

function closeAllOverlays() { while (overlays.length) closeOverlay(); }

// ==========================================================================
// Arranque
// ==========================================================================
(async function init() {
  render();
  try {
    await loadAll();
    render();
  } catch (e) {
    $('#main').innerHTML = `<div class="empty">${DIAL_HTML}<h3>No se pudo conectar</h3><p>${esc(e.message)}</p><button class="btn btn-primary" onclick="location.reload()">Reintentar</button></div>`;
  }
})();
