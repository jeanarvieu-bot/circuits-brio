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
  patch('runGen', [["r.bridges ? ' · pont' : ''", "r.bridges ? ' · ' + r.bridges + (r.bridges > 1 ? ' ponts' : ' pont') : ''"]]);
  const via = document.querySelector('#g-via');
  if (via && typeof bindSeg === 'function') {
    [['3', 'Trois ponts'], ['4', 'Quatre ponts']].forEach(([v, t]) => {
      const b = document.createElement('button'); b.dataset.v = v; b.textContent = t; via.appendChild(b);
    });
    bindSeg('#g-via', 'viaduc', true);
    const h = document.querySelector('#g-hint');
    if (h) h.textContent = 'Ponts et gare (surélevée) se suivent entre deux rampes (rail femelle-femelle et mâle-mâle ajoutés) ; il faut un rail droit court entre deux éléments. Le nombre de ponts possible dépend de votre inventaire. Une liaison relie le haut et le bas de l’ovale avec 2 aiguillages et crée une boucle de plus ; elle remplace le pont.';
  }
})();

/* ---------- Option « Gare à trois voies » du générateur ---------- */
(function () {
  'use strict';
  // Quai 1 : rail surélevé de la gare, entre deux ponts. Quais 2 et 3 : deux voies au sol qui passent sous les ponts, de chaque côté de la gare.
  // Aucune voie au sol ne passe sous une rampe.
  const T = [[["gare","",0,0,0,1,0],["pont","",144,0,0,1,0],["droit_mini_ff","",288,0,0,1,0],["rampe","down",558,-0.0,180,0,1],["courbe","D",558,-0.0,0,0,0],["courbe","D",700.84,59.16,45,0,0],["courbe","D",760,202.0,90,0,0],["courbe","D",700.84,344.84,135,0,0],["droit_court","",558,404.0,180,0,0],["droit_mini_mm","",450,404.0,180,0,0],["aiguillage_f","D",396,404.0,180,0,0],["droit_court","",253.16,404.0,180,0,0],["aiguillage_lev_f","D",145.16,404.0,180,0,0],["droit_long","",2.33,404.0,180,0,0],["droit_long","",-213.67,404.0,180,0,0],["courbe","D",-429.67,404.0,180,0,0],["courbe","D",-572.51,344.84,225,0,0],["courbe","D",-631.67,202.0,270,0,0],["courbe","D",-572.51,59.16,315,0,0],["rampe","up",-429.67,-0.0,0,0,0],["pont_bascule","",-213.67,-0.0,0,1,0],["courbe","D",253.16,344.84,225,0,0],["droit_long","",194,202.0,270,0,0],["droit_long","",194.0,-14.0,270,0,0],["courbe","D",2.33,344.84,225,0,0],["droit_moyen","",-56.84,202.0,270,0,0],["droit_moyen","",-56.84,58.0,270,0,0],["droit_moyen","",-56.84,-86.0,270,0,0]],[["gare","",0,0,0,1,0],["pont","",144,0,0,1,0],["droit_mini_ff","",288,0,0,1,0],["rampe","down",558,-0.0,180,0,1],["courbe","D",558,-0.0,0,0,0],["courbe","D",700.84,59.16,45,0,0],["courbe","D",760,202.0,90,0,0],["courbe","D",700.84,344.84,135,0,0],["droit_court","",558,404.0,180,0,0],["droit_mini_mm","",450,404.0,180,0,0],["aiguillage_lev_f","D",396,404.0,180,0,0],["droit_court","",253.16,404.0,180,0,0],["aiguillage_f","D",145.16,404.0,180,0,0],["droit_long","",2.33,404.0,180,0,0],["droit_long","",-213.67,404.0,180,0,0],["courbe","D",-429.67,404.0,180,0,0],["courbe","D",-572.51,344.84,225,0,0],["courbe","D",-631.67,202.0,270,0,0],["courbe","D",-572.51,59.16,315,0,0],["rampe","up",-429.67,-0.0,0,0,0],["pont_bascule","",-213.67,-0.0,0,1,0],["courbe","D",253.16,344.84,225,0,0],["droit_long","",194,202.0,270,0,0],["droit_long","",194.0,-14.0,270,0,0],["courbe","D",2.33,344.84,225,0,0],["droit_moyen","",-56.84,202.0,270,0,0],["droit_moyen","",-56.84,58.0,270,0,0],["droit_moyen","",-56.84,-86.0,270,0,0]],[["gare","",0,0,0,1,0],["pont","",144,0,0,1,0],["droit_mini_ff","",288,0,0,1,0],["rampe","down",558,-0.0,180,0,1],["courbe","D",558,-0.0,0,0,0],["courbe","D",700.84,59.16,45,0,0],["courbe","D",760,202.0,90,0,0],["courbe","D",700.84,344.84,135,0,0],["droit_court","",558,404.0,180,0,0],["droit_mini_mm","",450,404.0,180,0,0],["aiguillage_f","D",396,404.0,180,0,0],["droit_court","",253.16,404.0,180,0,0],["aiguillage_lev_f","D",145.16,404.0,180,0,0],["droit_long","",2.33,404.0,180,0,0],["droit_long","",-213.67,404.0,180,0,0],["courbe","D",-429.67,404.0,180,0,0],["courbe","D",-572.51,344.84,225,0,0],["courbe","D",-631.67,202.0,270,0,0],["courbe","D",-572.51,59.16,315,0,0],["rampe","up",-429.67,-0.0,0,0,0],["pont_bascule","",-213.67,-0.0,0,1,0],["courbe","D",253.16,344.84,225,0,0],["droit_long","",194,202.0,270,0,0],["droit_long","",194.0,-14.0,270,0,0],["courbe","D",2.33,344.84,225,0,0],["droit_moyen","",-56.84,202.0,270,0,0],["droit_moyen","",-56.84,58.0,270,0,0],["droit_court","",-56.84,-86.0,270,0,0]]];
  const row = document.querySelector('#gen .gchecks');
  if (!row || typeof GEN === 'undefined') return;
  const btn = document.createElement('button'); btn.type = 'button'; btn.dataset.k = 'g3'; btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Gare à trois voies';
  btn.onclick = () => { GEN.g3 = GEN.g3 ? 0 : 1; btn.setAttribute('aria-pressed', GEN.g3 ? 'true' : 'false'); };
  row.appendChild(btn);
  const origRun = window.runGen, origKeep = window.keepGenerated;
  window.runGen = function () {
    if (!GEN.g3) return origRun.apply(this, arguments);
    const list = [], why = [];
    T.forEach((a, k) => {
      const pieces = a.map((q, i) => ({ id: 'g' + k + '_' + i, t: q[0], vk: q[1], x: q[2], y: q[3], rot: q[4], l0: q[5], e: q[6] }));
      const used = countUsed(pieces, []), miss = Object.keys(used).filter(t => used[t] > invOf(t));
      if (miss.length) miss.forEach(t => why.push(typeName(t))); else list.push({ pieces, bridges: 2, station: true, g3: true });
    });
    GENRES = list;
    if (!list.length) { document.querySelector('#g-res').innerHTML = ''; document.querySelector('#g-msg').textContent = 'Pas assez de pièces pour la gare à trois voies. Il faut : gare, pont, pont bascule, 2 rampes, 10 courbes, 2 aiguillages, des rails droits et un relief (manque : ' + [...new Set(why)].join(', ') + ').'; return; }
    document.querySelector('#g-res').innerHTML = list.map((r, i) => `<button class="gcard" data-gi="${i}">${miniSVG(r.pieces)}<span>${r.pieces.length} pièces · gare à 3 voies</span></button>`).join('');
    document.querySelector('#g-msg').textContent = 'Le train du quai 1 passe sur la gare, ceux des quais 2 et 3 partent au sol, sous les ponts. Touchez une proposition pour la garder.';
  };
  window.keepGenerated = function (i) {
    const r = GENRES[i]; origKeep.apply(this, arguments);
    if (r && r.g3) { cur().name = 'Gare à 3 voies ' + ST.circuits.length; const n = document.querySelector('#cname'); if (n) n.value = cur().name; changed(); }
  };
})();

/* ---------- Vue 3D (fichier séparé) ---------- */
(function () {
  const s = document.createElement('script'); s.src = 'vue3d.js'; document.body.appendChild(s);
})();
