const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const bundles = [
  {key:'game', name:'Game', description:'Clips recorded in Roblox games, with varied environments and camera motion.'},
  {key:'coarse', slug:'blockout', name:'Blockout', description:'Geometry blockouts built in Roblox Studio, with minimal geometry and plain characters.'},
  {key:'anime', name:'Anime', description:'Anime videos generated with Wan 2.2, with varied scenes and motion.'}
];
const icons = {
  play:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  expand:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg>',
  prev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>'
};
let config = {method:'C2R#', modalities:{}};

/* ---------- Labels ---------- */
const capitalize = text => text ? text[0].toUpperCase() + text.slice(1) : text;
function panelLabel(panel) {
  if (panel.role === 'control') return 'Input';
  if (panel.role === 'c2rplusplus') return config.method;
  if (panel.role === 'c2rplusplus_refvae_rank16_final_v1') return `${config.method} + reference`;
  if (panel.role === 'native_d2') return `${config.method} w/o Re-encode`;
  const key = panel.role === 'geometry' || panel.role === 'r15_alt' ? 'r15' : panel.role;
  return config.labels?.[key] ?? capitalize(config.modalities[key]?.label ?? panel.label);
}
const isOurs = panel => panel.role?.startsWith('c2rplusplus');

/* ---------- Video playback ----------
   Videos load on demand. With autoplay on, a clip plays while it is mostly
   visible and pauses when it leaves the screen. */
const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = navigator.connection?.saveData === true;
let autoplay = !(prefersReducedMotion || saveData);
try { const stored = localStorage.getItem('c2r-autoplay'); if (stored !== null) autoplay = stored === '1'; } catch {}
const visible = new Set();
let dialogOpen = false;

async function start(video) {
  const media = video.closest('.media');
  const error = media && $('.video-error', media);
  if (error) error.hidden = true;
  if (!video.getAttribute('src')) { video.src = video.dataset.src; video.load(); }
  if (video.readyState < 3) media?.classList.add('loading');
  try { await video.play(); }
  catch (err) { if (err?.name !== 'AbortError' && error && video.error) error.hidden = false; }
}
function pauseAll() { $$('video').forEach(video => video.pause()); }
function resumeVisible() {
  if (!autoplay || dialogOpen || document.hidden) return;
  visible.forEach(video => { if (!video.dataset.userPaused) start(video); });
}

const viewObserver = new IntersectionObserver(entries => {
  for (const {target, isIntersecting, intersectionRatio} of entries) {
    if (isIntersecting && intersectionRatio >= 0.4) {
      visible.add(target);
      if (autoplay && !dialogOpen && !target.dataset.userPaused) start(target);
    } else {
      visible.delete(target);
      delete target.dataset.userPaused;
      target.pause();
    }
  }
}, {threshold:[0, 0.4]});

function bindVideo(video, {observe = true} = {}) {
  const media = video.closest('.media');
  video.addEventListener('playing', () => { media.classList.add('playing'); media.classList.remove('loading'); });
  video.addEventListener('pause', () => media.classList.remove('playing', 'loading'));
  video.addEventListener('error', () => { media.classList.remove('playing', 'loading'); const e = $('.video-error', media); if (e && video.getAttribute('src')) e.hidden = false; });
  if (observe) viewObserver.observe(video);
}
function releaseVideos(root) {
  $$('video', root).forEach(video => {
    viewObserver.unobserve(video); visible.delete(video);
    video.pause(); video.removeAttribute('src'); video.load();
  });
}
function toggle(video) {
  if (video.paused) { delete video.dataset.userPaused; start(video); }
  else { video.dataset.userPaused = '1'; video.pause(); }
}

/* ---------- Markup ---------- */
function mediaHTML(record, {wide = false, expandable = true, controls = false, eager = false} = {}) {
  const rows = Math.ceil(record.panels.length / record.columns);
  // Next to other methods (comparisons), C2R# is marked as ours.
  const names = record.panels.map(panel => panel.role === 'c2rplusplus' && record.markOurs ? `${config.method} (ours)` : panelLabel(panel));
  const title = escapeHTML(record.title);
  const media = `<div class="media${wide ? ' wide' : ''}" style="--ar:${record.width}/${record.height};--cols:${record.columns};--rows:${rows}" data-key="${escapeHTML(record.key)}">
    <video ${eager ? `src="${escapeHTML(record.video)}" autoplay` : `data-src="${escapeHTML(record.video)}"`} poster="${escapeHTML(record.poster)}" preload="none" muted loop playsinline${controls ? ' controls' : ''} aria-label="${title}: ${escapeHTML(names.join(', '))}"></video>
    <div class="labels" aria-hidden="true">${record.panels.map((panel, i) => `<span class="${isOurs(panel) ? 'ours' : ''}">${escapeHTML(names[i])}</span>`).join('')}</div>
    ${controls ? '' : `<span class="play-state" aria-hidden="true">${icons.play}</span>`}
    ${expandable ? `<button class="expand" type="button" aria-label="Enlarge ${title}">${icons.expand}</button>` : ''}
    <span class="video-error" role="status" hidden>This video could not be loaded. Click to try again.</span>
  </div>`;
  return wide ? `<div class="scroll-x">${media}</div><p class="hint">Scroll sideways to see all panels.</p>` : media;
}
/* Prompts start hidden. Once a visitor opens one, prompts stay open as they
   move between examples, until they hide them again. */
let promptOpen = false;
function promptHTML(record) {
  return record.prompt ? `<details class="prompt-block"${promptOpen ? ' open' : ''}><summary><span class="prompt-label">Prompt</span><span class="prompt-toggle" aria-hidden="true"></span></summary><p>${escapeHTML(record.prompt)}</p></details>` : '';
}
document.addEventListener('toggle', event => {
  if (event.target.matches?.('details.prompt-block')) promptOpen = event.target.open;
}, true);
function referenceHTML(record, mediaOptions = {}) {
  const ref = record.referenceImage;
  return `<div class="ref-row">
    <figure class="ref-image"><button type="button" data-image="${escapeHTML(ref.src)}" data-title="${escapeHTML(record.title)} · reference image" aria-label="Enlarge reference image for ${escapeHTML(record.title)}"><img src="${escapeHTML(ref.src)}" width="${ref.width}" height="${ref.height}" alt="Reference image for ${escapeHTML(record.title)}"></button><div class="labels" aria-hidden="true"><span>Reference image</span></div></figure>
    ${mediaHTML(record, mediaOptions)}
  </div>`;
}
function trainingHTML(record) {
  return `<div class="train-grid">${record.images.map((image, k) => {
    const label = capitalize(panelLabel(image));
    return `<figure class="train-cell${k === 0 ? ' main' : ''}"><button type="button" data-image="${escapeHTML(image.src)}" data-title="${escapeHTML(record.title)} · ${escapeHTML(label)}"><img src="${escapeHTML(image.src)}" width="${image.width}" height="${image.height}" alt="${escapeHTML(label)}, ${escapeHTML(record.title)}"></button><span class="tag">${escapeHTML(label)}</span></figure>`;
  }).join('')}</div>`;
}

const records = new Map();
function register(record, title, key) {
  const entry = {...record, title, key};
  records.set(key, entry);
  return entry;
}

/* ---------- One-example-at-a-time viewers ----------
   Each gallery section shows a single example. An optional input-type switch
   (Game / Blockout / Anime), previous/next buttons, numbered buttons and the
   arrow keys move between examples. The section heading shows which example
   is on screen, and the URL hash (e.g. #results-blockout-4) links to it.
   Groups keep their data key (e.g. 'coarse') and may show a different slug. */
const slugOf = group => group.slug ?? group.key;
const viewers = new Map();

function createViewer({section, root, groups, render}) {
  const sectionEl = document.getElementById(section);
  const now = $('.now', sectionEl);
  const multi = groups.length > 1;
  const state = {group:0, index:groups.map(() => 0)};
  root.innerHTML = `<div class="viewer-bar">
      ${multi ? `<div class="segmented" role="group" aria-label="Input type">${groups.map((g, i) => `<button type="button" data-group="${i}" aria-pressed="false">${g.name}<span>${g.items.length}</span></button>`).join('')}</div>` : ''}
      <div class="stepper">
        <button type="button" class="step" data-step="-1" aria-label="Previous example" title="Previous example (←)">${icons.prev}</button>
        <div class="chips" role="group" aria-label="Choose an example"></div>
        <span class="count" aria-hidden="true"></span>
        <button type="button" class="step" data-step="1" aria-label="Next example" title="Next example (→)">${icons.next}</button>
      </div>
    </div>
    ${multi ? '<p class="group-note"></p>' : ''}
    <div class="stage"></div>`;
  const stage = $('.stage', root), chips = $('.chips', root);
  let chipsGroup = -1;

  function hashFor() {
    const g = groups[state.group];
    return `#${section}${multi ? `-${slugOf(g)}` : ''}-${state.index[state.group] + 1}`;
  }
  function show({updateHash = false} = {}) {
    const g = groups[state.group], i = state.index[state.group], n = g.items.length;
    const entry = register(g.items[i], `${g.name} ${i + 1}`, `${section}-${g.key}-${i}`);
    releaseVideos(stage);
    stage.innerHTML = render(entry);
    $$('video', stage).forEach(video => bindVideo(video));
    // Warm the neighbours' posters so stepping feels immediate.
    for (const d of [1, -1]) { const nb = g.items[(i + d + n) % n]; const src = nb.poster ?? nb.images?.[0]?.src; if (src) new Image().src = src; }

    if (chipsGroup !== state.group) {
      chips.innerHTML = g.items.map((_, k) => `<button type="button" data-index="${k}" aria-label="${g.name} example ${k + 1}">${k + 1}</button>`).join('');
      chipsGroup = state.group;
    }
    $$('button', chips).forEach((chip, k) => { const on = k === i; chip.classList.toggle('current', on); if (on) chip.setAttribute('aria-current', 'true'); else chip.removeAttribute('aria-current'); });
    $('.count', root).textContent = `${i + 1} / ${n}`;
    $$('[data-group]', root).forEach((button, k) => button.setAttribute('aria-pressed', String(k === state.group)));
    if (multi) $('.group-note', root).textContent = g.description;
    now.innerHTML = `${multi ? `<span class="now-group">${g.name}</span>` : '<span class="now-group">Example</span>'} <strong>${i + 1}</strong><span class="now-total"> of ${n}</span>`;
    if (updateHash) history.replaceState(null, '', hashFor());
    refreshToc();
  }
  function go(index, opts) {
    const n = groups[state.group].items.length;
    state.index[state.group] = (index + n) % n;
    show(opts);
  }
  function step(delta) { go(state.index[state.group] + delta, {updateHash:true}); }
  function select(groupKey, index) {
    const g = groupKey ? groups.findIndex(x => slugOf(x) === groupKey) : state.group;
    if (g >= 0) state.group = g;
    if (index != null) state.index[state.group] = Math.min(Math.max(index, 0), groups[state.group].items.length - 1);
    show();
  }

  root.addEventListener('click', event => {
    const stepButton = event.target.closest('[data-step]');
    if (stepButton) { step(Number(stepButton.dataset.step)); return; }
    const chip = event.target.closest('[data-index]');
    if (chip) { go(Number(chip.dataset.index), {updateHash:true}); return; }
    const groupButton = event.target.closest('[data-group]');
    if (groupButton) { state.group = Number(groupButton.dataset.group); show({updateHash:true}); }
  });
  const viewer = {section, groups, step, select, get group() { return slugOf(groups[state.group]); }};
  viewers.set(section, viewer);
  show();
  return viewer;
}

function renderAblation(root, record) {
  if (!record) { $('#ablation').remove(); $('a[href="#ablation"]', $('#toc'))?.parentElement.remove(); $('.topnav a[href="#ablation"]')?.remove(); return; }
  const entry = register(record, 'Training bridge ablation', 'ablation');
  root.innerHTML = `<article class="card">${mediaHTML(entry, {wide:true})}${promptHTML(entry)}</article>`;
  $$('video', root).forEach(video => bindVideo(video));
}

/* ---------- Deep links: #section, #section-group, #section-group-N ---------- */
function parseHash(hash) {
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  if (!id) return null;
  for (const [section, viewer] of viewers) {
    if (id !== section && !id.startsWith(section + '-')) continue;
    const parts = id.slice(section.length).split('-').filter(Boolean);
    let group = null, index = null;
    if (parts[0] === 'coarse') parts[0] = 'blockout'; // links made before the rename
    if (parts[0] && viewer.groups.some(g => slugOf(g) === parts[0])) group = parts.shift();
    if (parts[0] && /^\d+$/.test(parts[0])) index = Number(parts[0]) - 1;
    return {section, group, index};
  }
  return null;
}
function applyHash(hash, {scroll = true, smooth = false} = {}) {
  const target = parseHash(hash);
  if (!target) return false;
  viewers.get(target.section).select(target.group, target.index);
  if (scroll) document.getElementById(target.section).scrollIntoView({behavior: smooth && !prefersReducedMotion ? 'smooth' : 'instant'});
  return true;
}
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey) return;
  const hash = link.getAttribute('href');
  if (parseHash(hash)?.group && applyHash(hash, {smooth:true})) { event.preventDefault(); history.replaceState(null, '', hash); }
});
addEventListener('hashchange', () => applyHash(location.hash));

/* ---------- Viewer dialog ---------- */
const dialog = $('#viewer');
let lastTrigger;
function openDialog(title, html, trigger) {
  lastTrigger = trigger;
  dialogOpen = true;
  pauseAll();
  $('#viewer-title').textContent = title;
  $('#viewer-body').innerHTML = html;
  dialog.showModal();
  document.body.classList.add('dialog-open');
}
function openRecord(key, trigger) {
  const record = records.get(key);
  if (!record) return;
  const source = $(`.media[data-key="${CSS.escape(key)}"] video`);
  const time = source?.currentTime || 0;
  const options = {expandable:false, controls:true, eager:true};
  const body = record.referenceImage ? referenceHTML(record, options) : mediaHTML(record, options);
  openDialog(record.title, `<div class="viewer-scroll">${body}</div>${promptHTML(record)}`, trigger);
  const video = $('#viewer-body video');
  bindVideo(video, {observe:false});
  const seek = () => { if (time) video.currentTime = time; video.play().catch(() => {}); };
  if (video.readyState >= 1) seek(); else video.addEventListener('loadedmetadata', seek, {once:true});
  $('#viewer-body .ref-image button')?.addEventListener('click', event => openImage(event.currentTarget.dataset.image, event.currentTarget.dataset.title, trigger));
}
function openImage(src, title, trigger) {
  openDialog(title, `<img class="viewer-image" src="${escapeHTML(src)}" alt="${escapeHTML(title)}">`, trigger);
}
dialog.addEventListener('close', () => {
  $$('video', dialog).forEach(video => { video.pause(); video.removeAttribute('src'); video.load(); });
  $('#viewer-body').replaceChildren();
  document.body.classList.remove('dialog-open');
  dialogOpen = false;
  lastTrigger?.focus({preventScroll:true});
  resumeVisible();
});
$('.viewer-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

/* One delegated handler for media inside the page. */
$('#content').addEventListener('click', event => {
  const imageButton = event.target.closest('[data-image]');
  if (imageButton) { openImage(imageButton.dataset.image, imageButton.dataset.title, imageButton); return; }
  const expand = event.target.closest('.expand');
  if (expand) { openRecord(expand.closest('.media').dataset.key, expand); return; }
  const media = event.target.closest('.media');
  if (media) toggle($('video', media));
});

/* ---------- Autoplay switch ---------- */
const autoplayToggle = $('#autoplay-toggle');
const teaser = $('#teaser-video');
autoplayToggle.checked = autoplay;
autoplayToggle.addEventListener('change', () => {
  autoplay = autoplayToggle.checked;
  try { localStorage.setItem('c2r-autoplay', autoplay ? '1' : '0'); } catch {}
  if (autoplay) { resumeVisible(); teaser.play().catch(() => {}); }
  else pauseAll();
});
new IntersectionObserver(([entry]) => {
  if (entry.isIntersecting && autoplay && !dialogOpen) teaser.play().catch(() => {});
  else teaser.pause();
}, {threshold:0.3}).observe(teaser);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); else resumeVisible(); });

/* ---------- Scroll spy, contents list and arrow keys ---------- */
let currentSection = null;
let refreshToc = () => {};
function setupScrollSpy() {
  const targets = $$('[data-spy]');
  const tocLinks = $$('#toc a');
  const navLinks = $$('.topnav a');
  const nav = $('.topnav');
  let ticking = false;
  refreshToc = () => {
    const viewer = viewers.get(currentSection);
    tocLinks.forEach(link => {
      const href = link.getAttribute('href').slice(1);
      const sub = parseHash('#' + href);
      const isSub = Boolean(sub?.group);
      const multi = viewer?.groups.length > 1;
      link.classList.toggle('active', isSub ? sub.section === currentSection && viewer?.group === sub.group : href === currentSection && !multi);
      link.classList.toggle('active-parent', !isSub && href === currentSection && multi);
    });
  };
  function update() {
    ticking = false;
    const line = innerHeight * 0.3;
    let active = null;
    for (const target of targets) if (target.getBoundingClientRect().top <= line) active = target;
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) active = targets[targets.length - 1];
    const id = active?.id ?? null;
    if (id === currentSection) return;
    currentSection = id;
    refreshToc();
    navLinks.forEach(link => {
      const on = link.getAttribute('href').slice(1) === id;
      link.classList.toggle('active', on);
      if (on && nav.scrollWidth > nav.clientWidth) nav.scrollTo({left: link.offsetLeft - nav.clientWidth / 2 + link.clientWidth / 2, behavior: prefersReducedMotion ? 'auto' : 'smooth'});
    });
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, {passive:true});
  addEventListener('resize', update);
  update();
}
document.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (dialogOpen || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, select, video, [contenteditable]')) return;
  const viewer = viewers.get(currentSection);
  if (!viewer) return;
  event.preventDefault();
  viewer.step(event.key === 'ArrowRight' ? 1 : -1);
});

/* ---------- Header ---------- */
function renderHeader() {
  document.title = `${config.method} · ${config.anonymous ? `Paper ID ${config.reviewId}` : config.title}`;
  if (!config.anonymous && config.authors?.length) {
    // An author's optional `mark` (e.g. a dagger) follows the affiliation numbers; authorNotes explain the marks.
    const notes = (config.authorNotes ?? []).map(n => `<span><sup>${escapeHTML(n.mark)}</sup>${escapeHTML(n.text)}</span>`).join('');
    $('#authors').innerHTML = `<p class="author-names">${config.authors.map(a => `<span class="author">${a.url ? `<a href="${escapeHTML(a.url)}" target="_blank" rel="noopener">${escapeHTML(a.name)}</a>` : escapeHTML(a.name)}<sup>${[...a.affiliations, ...(a.mark ? [escapeHTML(a.mark)] : [])].join(',')}</sup></span>`).join('')}</p><p class="affiliations">${Object.entries(config.affiliations).map(([id, name]) => `<span><sup>${id}</sup>${escapeHTML(name)}</span>`).join('')}</p>${notes ? `<p class="author-note">${notes}</p>` : ''}`;
    $$('.paper-id').forEach(node => node.remove());
  }
  // Links without a URL yet are shown as non-clickable "Coming soon" placeholders.
  const links = [['paperUrl','arXiv'],['codeUrl','Code'],['weightsUrl','Model weights']];
  $('#resource-links').innerHTML = links.map(([key, label]) => config[key]
    ? `<a href="${escapeHTML(config[key])}" target="_blank" rel="noopener">${label}</a>`
    : `<span class="soon" aria-disabled="true">${label} <small>Coming soon</small></span>`).join('');
}
const byBundle = group => bundles.map(b => ({...b, items: group[b.key] ?? []})).filter(g => g.items.length);
const resultCard = record => `<article class="card">${mediaHTML(record)}${promptHTML(record)}</article>`;
const comparisonCard = record => { record.markOurs = true; return `<article class="card">${mediaHTML(record, {wide:true})}${promptHTML(record)}</article>`; };
const referenceCard = record => `<article class="card">${referenceHTML(record)}${promptHTML(record)}</article>`;

async function init() {
  // The site embeds both files in site-data.js, because
  // browsers refuse fetch() for pages opened from disk (file://).
  let data;
  if (window.C2R_SITE) {
    config = {...config, ...window.C2R_SITE.config};
    data = window.C2R_SITE.data;
  } else {
    const [configResponse, dataResponse] = await Promise.all([fetch('config.json', {cache:'no-cache'}), fetch('data.json', {cache:'no-cache'})]);
    if (!configResponse.ok || !dataResponse.ok) throw new Error('Site data unavailable');
    config = {...config, ...await configResponse.json()};
    data = await dataResponse.json();
  }
  renderHeader();
  setupScrollSpy();
  createViewer({section:'r2c-training', root:$('#training-gallery'), groups:[{key:'all', name:'Training example', items:data.training}], render:trainingHTML});
  createViewer({section:'r2c-videos', root:$('#r2c-gallery'), groups:[{key:'all', name:'DINO-R2C video', items:data.r2c}], render:record => `<article class="card">${mediaHTML(record, {wide:true})}</article>`});
  createViewer({section:'results', root:$('#results-gallery'), groups:byBundle(data.results), render:resultCard});
  createViewer({section:'comparisons', root:$('#comparisons-gallery'), groups:byBundle(data.comparisons), render:comparisonCard});
  if (data.seedance) createViewer({section:'seedance', root:$('#seedance-gallery'), groups:byBundle(data.seedance), render:comparisonCard});
  else { $('#seedance').remove(); $('a[href="#seedance"]', $('#toc'))?.parentElement.remove(); $('.topnav a[href="#seedance"]')?.remove(); }
  createViewer({section:'reference', root:$('#reference-gallery'), groups:byBundle(data.reference), render:referenceCard});
  renderAblation($('#ablation-gallery'), data.nativeD2);
  if (location.hash && !applyHash(location.hash)) document.getElementById(location.hash.slice(1))?.scrollIntoView({behavior:'instant'});
  addEventListener('load', () => dispatchEvent(new Event('scroll')));
}
init().catch(error => {
  console.error(error);
  $('#results-gallery').innerHTML = '<p class="intro" role="alert">The galleries could not be loaded. Please refresh the page.</p>';
});
