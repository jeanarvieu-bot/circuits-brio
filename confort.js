/* Confort PC (clavier, molette, pavé tactile) pour Circuits Brio.
   Chargé après l'application : utilise ses fonctions (zoomBy, fitView, undo, deleteSel...). */
(function () {
  'use strict';
  const q = s => document.querySelector(s);
  const svg = q('#svg'), stg = q('#stage');
  if (!svg || typeof zoomBy !== 'function') return;

  /* feuille de style chargée en dernier pour primer sur celle de l'application */
  const lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = 'confort.css';
  lk.onload = () => { try { fitView(); } catch (x) { } };
  document.body.appendChild(lk);
  window.addEventListener('orientationchange', () => setTimeout(() => { try { fitView(); } catch (x) { } }, 300));

  const typing = t => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  const modalOpen = () => [...document.querySelectorAll('#gen,.modal')].some(m => !m.hidden);

  /* --- molette : souris = zoom ; pavé tactile = déplacement ; pincement pavé = zoom --- */
  svg.addEventListener('wheel', e => {
    e.stopImmediatePropagation(); e.preventDefault();
    const r = stg.getBoundingClientRect();
    const mouseLike = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey) zoomBy(Math.exp(-e.deltaY * 0.012), e.clientX - r.left, e.clientY - r.top);
    else if (mouseLike) zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    else { VIEW.cx += e.deltaX / VIEW.k; VIEW.cy += e.deltaY / VIEW.k; setTransform(); }
  }, { capture: true, passive: false });

  /* --- bouton milieu / droit : déplacer le plan --- */
  let pan = null;
  svg.addEventListener('pointerdown', e => {
    if (e.button !== 1 && e.button !== 2) return;
    e.stopImmediatePropagation(); e.preventDefault();
    pan = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: VIEW.cx, cy: VIEW.cy };
    svg.setPointerCapture(e.pointerId); stg.classList.add('panning');
  }, true);
  svg.addEventListener('pointermove', e => {
    if (!pan || e.pointerId !== pan.id) return;
    e.stopImmediatePropagation();
    VIEW.cx = pan.cx - (e.clientX - pan.x) / VIEW.k; VIEW.cy = pan.cy - (e.clientY - pan.y) / VIEW.k; setTransform();
  }, true);
  const endPan = e => { if (pan && e.pointerId === pan.id) { e.stopImmediatePropagation(); pan = null; stg.classList.remove('panning'); } };
  svg.addEventListener('pointerup', endPan, true); svg.addEventListener('pointercancel', endPan, true);
  svg.addEventListener('contextmenu', e => e.preventDefault());

  /* --- aide raccourcis --- */
  const keys = [
    ['Ctrl + Z', 'Annuler'],
    ['Suppr  /  Retour', 'Retirer la pièce ou le décor sélectionné'],
    ['R', 'Pivoter le décor sélectionné de 45°'],
    ['+  /  −', 'Zoomer / dézoomer'],
    ['0  ou  F', 'Tout voir'],
    ['Flèches', 'Déplacer le plan (Maj : plus vite)'],
    ['Échap', 'Désélectionner, fermer une fenêtre'],
    ['Ctrl + S', 'Exporter / importer (menu Fichier)'],
    ['?', 'Afficher cette aide'],
    ['Molette', 'Zoom (souris) ; pavé tactile : deux doigts déplacent, pincement zoome'],
    ['Bouton milieu ou droit', 'Déplacer le plan en glissant']
  ];
  const dlg = document.createElement('div');
  dlg.id = 'keys'; dlg.className = 'modal'; dlg.hidden = true; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-label', 'Raccourcis clavier');
  dlg.innerHTML = '<div class="gbox"><h2>Raccourcis clavier</h2><table>' +
    keys.map(([k, t]) => '<tr><td>' + k.split('  ').map(x => x.trim() ? '<span class="kbd">' + x.trim() + '</span>' : '').join(' ') + '</td><td>' + t + '</td></tr>').join('') +
    '</table><div class="gact"><button class="btn pri" id="keys-close">Fermer</button></div></div>';
  document.body.appendChild(dlg);
  const showKeys = () => { dlg.hidden = false; };
  q('#keys-close').onclick = () => { dlg.hidden = true; };
  dlg.addEventListener('pointerdown', e => { if (e.target === dlg) dlg.hidden = true; });

  const zoomBox = q('#zoom');
  if (zoomBox) {
    const b = document.createElement('button');
    b.className = 'btn'; b.id = 'help'; b.textContent = '?'; b.title = 'Raccourcis clavier (?)'; b.setAttribute('aria-label', 'Raccourcis clavier');
    b.onclick = showKeys; zoomBox.appendChild(b);
    [['zin', 'Zoom avant (+)'], ['zout', 'Zoom arrière (−)'], ['zfit', 'Tout voir (0)']].forEach(([id, t]) => { const el = q('#' + id); if (el) el.title = t; });
  }
  const undoB = q('#undo'); if (undoB) undoB.title = 'Annuler la dernière action (Ctrl+Z)';

  /* --- clavier --- */
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (typing(t) && e.key !== 'Escape') { e.stopImmediatePropagation(); return; } /* ne pas supprimer une pièce en tapant du texte */
    if (e.key === 'Escape') {
      if (!dlg.hidden) { dlg.hidden = true; return; }
      const m = [...document.querySelectorAll('#gen,.modal')].find(x => !x.hidden);
      if (m) { m.hidden = true; return; }
      if (typeof closePop === 'function') closePop();
      if (SEL) { SEL = null; render(); }
      return;
    }
    if (modalOpen()) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); const f = q('#cfile'); if (f) f.click(); return; }
    if (mod || e.altKey) return;
    const step = (e.shiftKey ? 240 : 80) / VIEW.k;
    switch (e.key) {
      case '+': case '=': zoomBy(1.25); break;
      case '-': case '_': zoomBy(0.8); break;
      case '0': case 'f': case 'F': fitView(); break;
      case 'r': case 'R': if (SEL && SEL.kind === 'decor') rotateSel(); break;
      case '?': showKeys(); break;
      case 'ArrowLeft': VIEW.cx -= step; setTransform(); e.preventDefault(); break;
      case 'ArrowRight': VIEW.cx += step; setTransform(); e.preventDefault(); break;
      case 'ArrowUp': VIEW.cy -= step; setTransform(); e.preventDefault(); break;
      case 'ArrowDown': VIEW.cy += step; setTransform(); e.preventDefault(); break;
    }
  }, true);
})();

/* ---------- Générateur : jusqu'à 4 ponts, en utilisant les ponts de l'inventaire (y compris plusieurs du même type) ---------- */
(function () {
  'use strict';
  const patch = (name, pairs) => {
    try {
      let src = window[name].toString();
      for (const [a, b] of pairs) { if (!src.includes(a)) return; src = src.replace(a, () => b); }
      window[name] = (0, eval)('(' + src + ')');
    } catch (e) { }
  };
  patch('tryGenerate', [
    ["const types = shuffle(Object.keys(BRIDGE_U).filter(t => A(t) > 0)).slice(0, nb);",
     "const pool = []; Object.keys(BRIDGE_U).forEach(t => { for (let k = 0; k < A(t); k++) pool.push(t); }); const types = shuffle(pool).slice(0, nb);"],
    ["if (nb > 1) { if (left.droit_court < 1) return null; left.droit_court--; }",
     "if (nb > 1) { if (left.droit_court < nb - 1) return null; left.droit_court -= nb - 1; }"],
    ["const j = rnd(m), extra = 2 * rnd(6); r[j] = u + extra;",
     "const j = rnd(m), extra = nb >= 3 ? [0, 0, 6, 8][rnd(4)] : 2 * rnd(6); r[j] = u + extra; if (nb >= 3) for (let i = 0; i < m; i++) if (i !== j) r[i] = 0;"],
    ["runs.forEach(q => { if (q.i === j) q.units = q.free = r[j]; });",
     "runs.forEach(q => { if (q.i === j || nb >= 3) q.units = q.free = r[q.i]; });"]
  ]);
  patch('runGen', [["r.bridges ? ' · pont' : ''", "r.bridges ? ' · ' + r.bridges + (r.bridges > 1 ? ' ponts' : ' pont') : ''"]]);
  const via = document.querySelector('#g-via');
  if (via && typeof bindSeg === 'function') {
    [['3', 'Trois ponts'], ['4', 'Quatre ponts']].forEach(([v, t]) => {
      const b = document.createElement('button'); b.dataset.v = v; b.textContent = t; via.appendChild(b);
    });
    bindSeg('#g-via', 'viaduc', true);
    const h = document.querySelector('#g-hint');
    if (h) h.textContent = 'Les ponts se suivent entre deux rampes (rail femelle-femelle et mâle-mâle ajoutés) ; il faut autant de rails droits courts que de ponts moins un. Le nombre de ponts possible dépend de votre inventaire. Une liaison relie le haut et le bas de l’ovale avec 2 aiguillages et crée une boucle de plus ; elle remplace le pont.';
  }
})();
