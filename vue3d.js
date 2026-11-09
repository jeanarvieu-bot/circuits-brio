/* Vue 3D en perspective pour Circuits Brio : montre les niveaux, rampes, ponts, gare surélevée, tunnels et reliefs.
   Chargé après l'application ; utilise ses données (cur, TRACKS, isElevatedRail, bounds, rot, R, S45...). */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const stg = $('#stage'), zoomBox = $('#zoom');
  if (!stg || !zoomBox || typeof cur !== 'function' || typeof TRACKS === 'undefined' || typeof bounds !== 'function') return;

  const H = 80;                                   /* hauteur d'un niveau (mm) */
  const cam = { yaw: 0, pitch: 0.85, d: 1500, tx: 0, ty: 0, tz: 25 };
  let on = false, cv = null, ctx = null, W = 0, Ht = 0, lastId = null, hint = null, raf = 0;

  /* ---------- couleurs (suivent le thème clair / sombre) ---------- */
  const parse = s => {
    s = (s || '').trim(); let m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) return [...m[1]].map(h => parseInt(h + h, 16));
    if ((m = /^#([0-9a-f]{6})/i.exec(s))) return [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16));
    if ((m = /rgba?\(([^)]+)\)/.exec(s))) return m[1].split(/[ ,\/]+/).slice(0, 3).map(Number);
    return null;
  };
  const cssv = (n, fb) => parse(getComputedStyle(document.documentElement).getPropertyValue(n)) || parse(fb);
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  let pal = {};
  function loadPal() {
    const g = cssv;
    pal = {
      mat: g('--mat', '#dde6e8'), panel2: g('--panel2', '#eef3f4'), wood: g('--wood', '#e0bb83'), woodEdge: g('--wood-edge', '#9f7240'),
      groove: g('--groove', '#8a5f30'), deck: g('--deck', '#4c86c2'), deck2: g('--deck2', '#e7b53c'), water: g('--water', '#bfdcee'),
      pillar: g('--pillar', '#8c9aa3'), rock: g('--rock', '#7b8790'), rockEdge: g('--rock-edge', '#4a555d'), tube: g('--tube', '#c9b6d6'),
      green: g('--green', '#2f7d4a'), roofBlue: g('--roof-blue', '#34619a'), hill0: g('--hill0', '#7fb06f'),
      base: parse('#e3d3b4'), plat: parse('#7a4e33'), post: parse('#e3c18f'), body: parse('#efe6d6')
    };
    pal.ground = mix(pal.mat, pal.panel2, 0.55);
  };

  /* ---------- géométrie : liste de faces polygonales, triées de l'arrière vers l'avant ---------- */
  let faces = [], labels = [];
  const add = (pts, c, o) => faces.push(Object.assign({ pts, c }, o || {}));
  const tfOf = (x0, y0, r) => (x, y, z) => { const q = rot(x, y, r); return [x0 + q[0], y0 + q[1], z]; };

  function box(tf, x0, y0, x1, y1, z0, z1, cs, ct, o) {
    o = Object.assign({ edge: 1 }, o || {});
    const top = Object.assign({}, o); if (top.bias === undefined) top.bias = Math.hypot(x1 - x0, y1 - y0) / 2;
    add([tf(x0, y0, z1), tf(x1, y0, z1), tf(x1, y1, z1), tf(x0, y1, z1)], ct, top);
    [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].forEach(([a, b, c, d]) =>
      add([tf(a, b, z0), tf(c, d, z0), tf(c, d, z1), tf(a, b, z1)], cs, o));
  }

  /* chemins d'axe d'une pièce (en coordonnées monde, avec altitude) */
  function axes(p) {
    const def = TRACKS[p.t], v = variantByKey(p.t, p.vk), out = [];
    const Wp = (x, y, dl) => { const q = rot(x, y, p.rot); return { x: p.x + q[0], y: p.y + q[1], z: (p.l0 + dl) * H }; };
    if (def.arc || def.sw) {
      const rr = def.r || R, n = Math.max(4, Math.ceil(rr * rad(45) / 22)), arc = [];
      for (let k = 0; k <= n; k++) { const a = rad(45) * k / n; arc.push(Wp(rr * Math.sin(a), v.m * (rr - rr * Math.cos(a)), 0)); }
      if (def.sw) { const st = []; for (let k = 0; k <= 4; k++) st.push(Wp(S45 * k / 4, 0, 0)); out.push(st); }
      out.push(arc);
    } else {
      const L = def.len, n = Math.max(2, Math.ceil(L / 30)), ln = [];
      for (let k = 0; k <= n; k++) ln.push(Wp(L * k / n, 0, def.ramp ? k / n : 0));
      out.push(ln);
    }
    return out;
  }

  /* ruban le long d'un chemin : dessus à z + zoff, flancs descendant de `drop` (ou jusqu'au sol) */
  function ribbon(path, w, zoff, ct, cs, drop, o) {
    o = o || {}; const n = path.length, Lp = [], Rp = [], lat = o.lat || 0;
    for (let i = 0; i < n; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y; const l = Math.hypot(tx, ty) || 1; const nx = -ty / l, ny = tx / l, z = path[i].z + zoff;
      Lp.push([path[i].x + nx * (lat + w / 2), path[i].y + ny * (lat + w / 2), z]);
      Rp.push([path[i].x + nx * (lat - w / 2), path[i].y + ny * (lat - w / 2), z]);
    }
    const low = q => [q[0], q[1], drop === 'ground' ? 0 : q[2] - drop];
    for (let i = 0; i < n - 1; i++) {
      add([Lp[i], Lp[i + 1], Rp[i + 1], Rp[i]], ct, { bias: o.bias, a: o.a });
      if (drop && cs) {
        add([Lp[i], Lp[i + 1], low(Lp[i + 1]), low(Lp[i])], cs, { a: o.a });
        add([Rp[i], Rp[i + 1], low(Rp[i + 1]), low(Rp[i])], cs, { a: o.a });
      }
    }
  }
  function wall(path, lat, h, c, o) {                 /* petit muret vertical (garde-corps) */
    const n = path.length, P = [];
    for (let i = 0; i < n; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
      const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
      P.push([path[i].x - ty / l * lat, path[i].y + tx / l * lat, path[i].z]);
    }
    for (let i = 0; i < n - 1; i++) add([P[i], P[i + 1], [P[i + 1][0], P[i + 1][1], P[i + 1][2] + h], [P[i][0], P[i][1], P[i][2] + h]], c, Object.assign({ edge: 0, bias: -2 }, o || {}));
  }
  function railOn(paths, zoff) {                       /* le rail en bois + ses deux rainures */
    paths.forEach(pt => {
      ribbon(pt, 40, zoff + 6, pal.wood, pal.woodEdge, 6);
      ribbon(pt, 4, zoff + 6.4, pal.groove, null, 0, { lat: -8, bias: -3 });
      ribbon(pt, 4, zoff + 6.4, pal.groove, null, 0, { lat: 8, bias: -3 });
    });
  }

  function addPiece(p) {
    const def = TRACKS[p.t], paths = axes(p), z0 = p.l0 * H, tf = tfOf(p.x, p.y, p.rot);
    if (def.ramp) {
      paths.forEach(pt => {
        ribbon(pt, 44, 0, pal.wood, pal.rock, 'ground');
        ribbon(pt, 4, 0.4, pal.groove, null, 0, { lat: -8, bias: -3 }); ribbon(pt, 4, 0.4, pal.groove, null, 0, { lat: 8, bias: -3 });
      });
      return;
    }
    if (def.bridge) {
      const w = def.bridge === 'double' ? 78 : 66, L = def.len, dc = def.bridge === 'bascule' ? pal.deck2 : pal.deck;
      if (def.bridge === 'bascule') box(tf, -6, -34, L + 6, 34, 0, 0.5, pal.water, pal.water, { edge: 0, bias: 50 });
      paths.forEach(pt => {
        ribbon(pt, w, 8, dc, mix(dc, [0, 0, 0], 0.25), 8);
        wall(pt, w / 2 - 3, 9, mix(dc, [255, 255, 255], 0.55), { z: 8 });
        wall(pt, -(w / 2 - 3), 9, mix(dc, [255, 255, 255], 0.55));
        if (def.bridge === 'double') { wall(pt, 24, 5, pal.deck2); wall(pt, -24, 5, pal.deck2); }
      });
      railOn(paths, 8);
      [14, L - 14].forEach(x => box(tf, x - 9, -w / 2 - 5, x + 9, w / 2 + 5, 0, z0, mix(pal.pillar, [0, 0, 0], 0.15), pal.pillar));
      return;
    }
    /* socle de relief sous un rail en hauteur (sauf la gare, dont le quai est un relief intégré) */
    if (isElevatedRail(p)) paths.forEach(pt => ribbon(pt, 72, 0, mix(pal.rock, [255, 255, 255], 0.12), pal.rock, 'ground'));
    railOn(paths, 0);
    if (def.tunnel) {
      const L = def.len, tf2 = tf, N = 10, M = 10, ry = 48, rz = 54;
      for (let i = 0; i < N; i++) {
        const xa = -6 + (L + 12) * i / N, xb = -6 + (L + 12) * (i + 1) / N;
        for (let j = 0; j < M; j++) {
          const ta = Math.PI * j / M, tb = Math.PI * (j + 1) / M;
          const pt = (x, t) => tf2(x, -ry * Math.cos(t), z0 + rz * Math.sin(t));
          add([pt(xa, ta), pt(xb, ta), pt(xb, tb), pt(xa, tb)], mix(pal.tube, [255, 255, 255], 0.1), { a: 0.78, bias: -1 });
        }
      }
    }
    if (def.station) {
      /* la gare repose sur le sol : dalle, deux quais le long desquels des rails au sol peuvent passer,
         et, au centre, son rail intégré porté en hauteur par un socle de relief intégré */
      const zs = Math.max(z0, 14);
      box(tf, -14, -74, 158, 50, 0, 4, pal.base, pal.base, { bias: 120 });
      box(tf, 0, -70, 144, -30, 4, 12, mix(pal.plat, [0, 0, 0], 0.2), pal.plat, { bias: 60 });
      box(tf, 0, 30, 144, 48, 4, 12, mix(pal.plat, [0, 0, 0], 0.2), pal.plat, { bias: 40 });
      box(tf, 0, -33, 144, -30, 4, 13, [255, 255, 255], [255, 255, 255], { edge: 0, bias: 55 });
      box(tf, 0, 30, 144, 33, 4, 13, [255, 255, 255], [255, 255, 255], { edge: 0, bias: 35 });
      box(tf, 0, -24, 144, 24, 4, zs, mix(pal.rock, [0, 0, 0], 0.1), mix(pal.rock, [255, 255, 255], 0.12), { bias: 80 });
      [[6, -52], [138, -52]].forEach(([x, y]) => box(tf, x - 4, y - 4, x + 4, y + 4, 12, 72, pal.post, pal.post));
      box(tf, -18, -74, 162, -30, 72, 82, mix(pal.green, [0, 0, 0], 0.2), pal.green, { bias: 70 });
      railOn(paths, z0 ? 0 : 8);
    }
    if (def.police) {
      box(tf, -6, -86, 150, -20, z0, z0 + 62, pal.body, mix(pal.body, [255, 255, 255], 0.2));
      box(tf, -12, -96, 156, -14, z0 + 62, z0 + 76, mix(pal.roofBlue, [0, 0, 0], 0.2), pal.roofBlue, { bias: 60 });
      box(tf, 58, -21, 86, -19, z0, z0 + 30, [60, 45, 40], [60, 45, 40], { edge: 0 });
    }
  }

  function addDecor(d) {
    const rd = d.rot || 0, tf = tfOf(d.x, d.y, rd);
    if (d.t === 'relief') {
      const w = DECORS.relief.w, h = DECORS.relief.h;
      const poly = [[-.42, .3], [-.5, -.05], [-.24, -.36], [.14, -.4], [.46, -.1], [.4, .3]].map(([a, b]) => [a * w, b * h]);
      const n = poly.length, top = poly.map(([x, y]) => [x * .55, y * .55]), zt = H - 6;
      const lighter = mix(pal.rock, [255, 255, 255], 0.14);
      add(top.map(([x, y]) => tf(x, y, zt)), lighter, { edge: 1, bias: 70 });
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        add([tf(poly[i][0], poly[i][1], 0), tf(poly[j][0], poly[j][1], 0), tf(top[j][0], top[j][1], zt), tf(top[i][0], top[i][1], zt)], pal.rock, { edge: 1 });
      }
      return;
    }
    const def = DECORS[d.t] || { w: d.w || 150, h: d.h || 120 }, w = def.w, h = def.h;
    box(tf, -w / 2, -h / 2, w / 2, h / 2, 0, 56, mix(pal.body, [0, 0, 0], 0.12), pal.body);
    labels.push({ p: tf(0, 0, 58), t: d.label || '' });
  }

  /* ---------- projection et dessin ---------- */
  function draw() {
    raf = 0;
    if (!on || !ctx) return;
    const c = cur(); loadPal(); faces = []; labels = [];
    const b = bounds(c.pieces, c.decors), pad = 90;
    box((x, y, z) => [x, y, z], b.x0 - pad, b.y0 - pad, b.x1 + pad, b.y1 + pad, -16, 0, mix(pal.ground, [0, 0, 0], 0.18), pal.ground, { bias: 1e6, edge: 0 });
    c.decors.forEach(addDecor);
    c.pieces.forEach(addPiece);

    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), fl = Math.min(W, Ht) * 1.05;
    const eye = [cam.tx + cam.d * cp * sy, cam.ty + cam.d * cp * cy, cam.tz + cam.d * sp];
    const proj = q => {
      const dx = q[0] - cam.tx, dy = q[1] - cam.ty, dz = q[2] - cam.tz, x1 = dx * cy - dy * sy, y1 = dx * sy + dy * cy;
      const Z = cam.d - cp * y1 - sp * dz, X = x1, Y = -sp * y1 + cp * dz;
      return [W / 2 + fl * X / Z, Ht / 2 - fl * Y / Z, Z];
    };
    const light = (() => { const l = [-.35, -.45, .82], m = Math.hypot(...l); return l.map(v => v / m); })();
    const items = [];
    for (const f of faces) {
      const P = f.pts.map(proj); let z = 0, bad = false;
      for (const q of P) { if (q[2] < 40) { bad = true; break; } z += q[2]; }
      if (bad) continue;
      f.P = P; f.key = z / P.length + (f.bias || 0); items.push(f);
    }
    items.sort((p, q) => q.key - p.key);

    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.fillStyle = 'rgb(' + pal.mat.join(',') + ')'; ctx.fillRect(0, 0, W, Ht);
    ctx.lineJoin = 'round';
    for (const f of items) {
      const a = f.pts[0], b2 = f.pts[1], c2 = f.pts[2];
      let ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2], vx = c2[0] - a[0], vy = c2[1] - a[1], vz = c2[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      if (nx * (eye[0] - a[0]) + ny * (eye[1] - a[1]) + nz * (eye[2] - a[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const k = Math.max(.55, Math.min(1.08, .7 + .36 * (nx * light[0] + ny * light[1] + nz * light[2])));
      const fill = 'rgb(' + f.c.map(v => Math.min(255, Math.round(v * k))).join(',') + ')';
      ctx.beginPath(); ctx.moveTo(f.P[0][0], f.P[0][1]);
      for (let i = 1; i < f.P.length; i++) ctx.lineTo(f.P[i][0], f.P[i][1]);
      ctx.closePath();
      ctx.globalAlpha = f.a === undefined ? 1 : f.a;
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = f.edge ? 1 : .8;
      ctx.strokeStyle = f.edge ? 'rgba(20,28,34,.45)' : fill; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = '700 12px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3;
    labels.forEach(l => { if (!l.t) return; const q = proj(l.p); if (q[2] < 40) return; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.fillStyle = '#fff'; ctx.strokeText(l.t, q[0], q[1]); ctx.fillText(l.t, q[0], q[1]); });
  }
  const redraw = () => { if (on && !raf) raf = requestAnimationFrame(draw); };

  function fit() {
    const c = cur(), b = bounds(c.pieces, c.decors), r = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 90, fl = Math.min(W, Ht) * 1.05;
    cam.tx = (b.x0 + b.x1) / 2; cam.ty = (b.y0 + b.y1) / 2; cam.tz = 20;
    cam.d = Math.max(400, r * fl / (0.62 * Math.min(W, Ht)));
    lastId = c.id;
  }
  function resize() {
    if (!cv) return; const r = stg.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    W = Math.max(50, r.width); Ht = Math.max(50, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(Ht * dpr); cv.style.width = W + 'px'; cv.style.height = Ht + 'px';
    redraw();
  }

  /* ---------- interactions : tourner, zoomer, déplacer ---------- */
  const ptrs = new Map(); let g = null;
  const zoom3 = f => { cam.d = Math.max(250, Math.min(20000, cam.d / f)); redraw(); };
  const panBy = (dx, dy) => {                                 /* déplacement de la cible dans le plan du sol */
    const s = cam.d / (Math.min(W, Ht) * 1.05), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), sp = Math.sin(cam.pitch);
    const ax = -dx * s, ay = -dy * s / Math.max(.25, sp);
    cam.tx += ax * cy + ay * sy; cam.ty += -ax * sy + ay * cy; redraw();
  };
  function mount() {
    cv = document.createElement('canvas'); cv.id = 'v3d-cv'; cv.setAttribute('aria-label', 'Vue 3D du circuit');
    ctx = cv.getContext('2d'); stg.appendChild(cv);
    hint = document.createElement('div'); hint.id = 'v3d-hint';
    hint.textContent = 'Vue 3D · glisser : tourner · molette : zoom · Maj + glisser : déplacer';
    stg.appendChild(hint);
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      g = { pan: e.button === 1 || e.button === 2 || e.shiftKey, d0: 0, m0: null };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; g.d0 = Math.hypot(a.x - b.x, a.y - b.y); g.m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; g.dist = cam.d; }
      e.preventDefault();
    });
    cv.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size >= 2 && g && g.d0) {
        const [a, b] = [...ptrs.values()], dd = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        cam.d = Math.max(250, Math.min(20000, g.dist * g.d0 / Math.max(10, dd))); panBy(m.x - g.m0.x, m.y - g.m0.y); g.m0 = m;
      } else if (g && g.pan) panBy(dx, dy);
      else { cam.yaw -= dx * .008; cam.pitch = Math.max(.12, Math.min(1.5, cam.pitch + dy * .006)); redraw(); }
    });
    const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2 && g) g.d0 = 0; if (!ptrs.size) g = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const mouseLike = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
      if (e.ctrlKey) zoom3(Math.exp(-e.deltaY * .012));
      else if (mouseLike) zoom3(e.deltaY < 0 ? 1.12 : 1 / 1.12);
      else { cam.yaw -= e.deltaX * .005; cam.pitch = Math.max(.12, Math.min(1.5, cam.pitch + e.deltaY * .004)); redraw(); }
    }, { passive: false });
    new ResizeObserver(resize).observe(stg);
  }

  function set(v) {
    on = v; btn.setAttribute('aria-pressed', v ? 'true' : 'false');
    if (v) { if (!cv) mount(); cv.hidden = false; hint.hidden = false; stg.classList.add('is3d'); resize(); if (lastId !== cur().id || !cam.d || cam.d === 1500) fit(); redraw(); }
    else if (cv) { cv.hidden = true; hint.hidden = true; stg.classList.remove('is3d'); }
  }

  const btn = document.createElement('button');
  btn.className = 'btn'; btn.id = 'v3d'; btn.textContent = '3D'; btn.title = 'Vue 3D en perspective (relief)'; btn.setAttribute('aria-label', 'Vue 3D'); btn.setAttribute('aria-pressed', 'false');
  btn.onclick = () => set(!on);
  zoomBox.insertBefore(btn, zoomBox.firstChild);

  /* les boutons de zoom pilotent la vue 3D quand elle est affichée */
  zoomBox.addEventListener('click', e => {
    if (!on) return; const t = e.target.closest('button'); if (!t || t === btn) return;
    if (t.id === 'zin') zoom3(1.25); else if (t.id === 'zout') zoom3(0.8); else if (t.id === 'zfit') { cam.yaw = 0; cam.pitch = .85; fit(); redraw(); } else return;
    e.stopImmediatePropagation(); e.stopPropagation();
  }, true);

  /* la vue suit les modifications du circuit */
  const r0 = window.render;
  window.render = function () { const r = r0.apply(this, arguments); if (on) { if (lastId !== cur().id) fit(); redraw(); } return r; };
  window.addEventListener('resize', () => on && resize());
  window.__v3d = { set, cam, redraw };
})();
