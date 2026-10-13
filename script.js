(() => {
  'use strict';

  /* =========================================================
   *  KONFIGURASI UMUM (ubah angka di sini untuk mengatur rasa game)
   * ========================================================= */
  const WORLD_W = 400;          // lebar dunia logis (tinggi mengikuti rasio layar)
  const GRAVITY = 0.42;         // percepatan jatuh (per frame @60fps)
  const JUMP_VELOCITY = -11.5;  // kecepatan loncat normal (negatif = ke atas)
  const SPRING_BOOST = 2;       // pengali velocity loncat saat menginjak per
  const MOVE_SPEED = 5.4;       // kecepatan gerak horizontal maksimum
  const MOVE_SMOOTH = 0.28;     // 0..1, makin besar makin responsif
  const PLAYER_W = 56;          // lebar karakter
  const HITBOX_W_RATIO = 0.55;  // lebar hitbox kaki relatif lebar karakter
  const FEET_INSET = 4;         // px area transparan di bawah foto yang diabaikan
  const JUMP_SPRITE_TIME = 14;  // lama sprite "loncat" tampil (frame)
  const SCORE_DIVISOR = 10;     // 10 px ketinggian = 1 poin
  const RESTART_DELAY = 600;    // ms, cegah tap tak sengaja langsung restart
  const TOP_MARGIN = 90;        // area di atas layar tempat platform digenerate
  const SPRITE_SCALE = 3;       // resolusi sprite hasil render (anti-buram di HP)

  /* =========================================================
   *  KONFIGURASI LEVEL
   * ========================================================= */
  const LEVEL_END = [500, 1000, 1500];          // batas skor akhir Level 1, 2, 3
  const LEVEL_START_SCORE = [0, 501, 1001, 1501];
  const LEVEL_NAMES = ['Laut', 'Kota', 'Langit', 'Luar Angkasa'];
  const BLEND_BEFORE = 160;     // transisi warna mulai 160 poin sebelum batas level...
  const BLEND_AFTER = 10;       // ...dan selesai 10 poin setelah batas (level baru langsung penuh)

  // gap     : jarak vertikal antar pijakan utama [min, max] (loncatan normal ±157px)
  // width   : lebar pijakan
  // moving  : peluang pijakan utama bergerak
  // cracked : peluang munculnya pijakan sekali injak (selalu tambahan, bukan satu-satunya jalur)
  // spring  : peluang pijakan statis membawa per
  // speed   : kecepatan pijakan bergerak [min, max]
  const LEVEL_RULES = [
    { gap: [48, 82],  width: 84, moving: 0,    cracked: 0,    spring: 0,    speed: [0, 0] },
    { gap: [52, 96],  width: 80, moving: 0,    cracked: 0.32, spring: 0,    speed: [0, 0] },
    { gap: [56, 108], width: 76, moving: 0.35, cracked: 0.28, spring: 0.22, speed: [1.0, 2.0] },
    { gap: [62, 116], width: 72, moving: 0.72, cracked: 0.20, spring: 0.07, speed: [2.8, 4.6] },
  ];

  // Warna langit per level: [atas, tengah, bawah]
  const SKY = [
    ['#4fd1ea', '#1f8fcf', '#0a3b78'],  // Level 1: bawah laut
    ['#2e2a6e', '#c2528b', '#ff9a62'],  // Level 2: senja
    ['#3d9bff', '#86cbff', '#d8f1ff'],  // Level 3: langit cerah
    ['#02020a', '#070720', '#14123a'],  // Level 4: luar angkasa
  ].map((stops) => stops.map(hexToRgb));

  /* =========================================================
   *  UTIL
   * ========================================================= */
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // Posisi berulang (wrap) untuk objek latar dengan efek parallax
  function wrapPos(base, offset, span, margin) {
    let v = (base + offset) % span;
    if (v < 0) v += span;
    return v - margin;
  }

  const levelAt = (s) => (s <= LEVEL_END[0] ? 0 : s <= LEVEL_END[1] ? 1 : s <= LEVEL_END[2] ? 2 : 3);

  /* =========================================================
   *  ELEMEN & ASET
   * ========================================================= */
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const startScreen = document.getElementById('start-screen');
  const overScreen = document.getElementById('over-screen');
  const finalScoreEl = document.getElementById('final-score');
  const bestScoreEl = document.getElementById('best-score');

  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }
  const sprites = {
    normal: loadImage('assets/cewe-normal.png'),
    jump: loadImage('assets/cewe-loncat.png'),
    lose: loadImage('assets/cewe-kalah.png'),
  };
  const imgReady = (img) => img.complete && img.naturalWidth > 0;

  const sfxJump = new Audio('assets/loncat.mp3');
  const sfxFall = new Audio('assets/jatuh.mp3');
  sfxJump.preload = 'auto';
  sfxFall.preload = 'auto';

  function play(audio) {
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* abaikan */ }
  }

  // Browser HP memblokir audio sebelum ada sentuhan: "buka kunci" saat tap pertama
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    [sfxJump, sfxFall].forEach((a) => {
      a.muted = true;
      const p = a.play();
      const restore = () => { a.pause(); a.currentTime = 0; a.muted = false; };
      if (p && p.then) p.then(restore).catch(() => { a.muted = false; });
      else restore();
    });
  }

  /* ---------- Gambar lingkungan: dipangkas ke area terlihat lalu di-bake ke sprite kecil ---------- */
  const PLATFORM_BAKE_W = 84;   // lebar dasar sprite pijakan gambar
  const SPRING_W = 24;
  const SUN_W = 190;
  const SPACE_W = 72;           // lebar sprite UFO / meteor

  // surfFrac: posisi garis permukaan (rumput) dari tepi atas gambar yang sudah dipangkas,
  // dihitung relatif terhadap lebar gambar. Dipakai agar kaki karakter pas di atas rumput.
  const ART = {
    normal:  { src: 'assets/pijakan-normal.png',   w: PLATFORM_BAKE_W, surfFrac: 0.034 },
    cracked: { src: 'assets/pijakan-retak.png',    w: PLATFORM_BAKE_W, surfFrac: 0.030 },
    spring:  { src: 'assets/per-pantul.png',       w: SPRING_W,        surfFrac: 0 },
    sun:     { src: 'assets/matahari-couple.png',  w: SUN_W,           surfFrac: 0 },
  };
  const baked = { normal: null, cracked: null, spring: null, sun: null }; // null = belum dimuat

  // Cari kotak area non-transparan agar ruang kosong di tepi gambar tidak ikut
  function trimBox(img) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const full = { x: 0, y: 0, w, h };
    try {
      const k = Math.min(1, 256 / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * k));
      const ch = Math.max(1, Math.round(h * k));
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, cw, ch);
      const d = g.getImageData(0, 0, cw, ch).data;
      let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          if (d[(y * cw + x) * 4 + 3] > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) return full;
      const bx = Math.max(0, Math.floor(x0 / k) - 1);
      const by = Math.max(0, Math.floor(y0 / k) - 1);
      return {
        x: bx,
        y: by,
        w: Math.min(w - bx, Math.ceil((x1 + 1) / k) + 1 - bx),
        h: Math.min(h - by, Math.ceil((y1 + 1) / k) + 1 - by),
      };
    } catch (e) {
      return full; // mis. canvas "tainted" saat dibuka lewat file:// -> pakai gambar utuh
    }
  }

  // Perkecil bertahap (kualitas lebih halus) ke ukuran tampil x SPRITE_SCALE
  function bake(img, box, destW, surfFrac) {
    const tw = Math.round(destW * SPRITE_SCALE);
    const th = Math.max(1, Math.round(box.h * tw / box.w));
    let cur = document.createElement('canvas');
    cur.width = box.w;
    cur.height = box.h;
    cur.getContext('2d').drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    while (cur.width > tw * 2) {
      const nxt = document.createElement('canvas');
      nxt.width = Math.ceil(cur.width / 2);
      nxt.height = Math.ceil(cur.height / 2);
      const g = nxt.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(cur, 0, 0, nxt.width, nxt.height);
      cur = nxt;
    }
    const out = document.createElement('canvas');
    out.width = tw;
    out.height = th;
    const g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, tw, th);
    return { c: out, w: destW, h: box.h * destW / box.w, surf: surfFrac * destW };
  }

  // Foto matahari dipotong lurus di tepi, jadi tepi bawah & samping dibuat memudar halus
  function softEdges(spr) {
    const g = spr.c.getContext('2d');
    const w = spr.c.width;
    const h = spr.c.height;
    g.globalCompositeOperation = 'destination-in';
    let m = g.createLinearGradient(0, 0, 0, h);
    m.addColorStop(0, '#000');
    m.addColorStop(0.68, '#000');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m;
    g.fillRect(0, 0, w, h);
    m = g.createLinearGradient(0, 0, w, 0);
    m.addColorStop(0, 'rgba(0,0,0,0)');
    m.addColorStop(0.08, '#000');
    m.addColorStop(0.92, '#000');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }

  Object.keys(ART).forEach((key) => {
    const img = new Image();
    img.onload = () => {
      const spr = bake(img, trimBox(img), ART[key].w, ART[key].surfFrac);
      if (key === 'sun') softEdges(spr);
      baked[key] = spr;
    };
    img.src = ART[key].src;
  });

  /* ---------- Sprite yang digambar lewat kode (sekali saja, lalu dipakai ulang) ---------- */
  function makeSprite(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * SPRITE_SCALE);
    c.height = Math.ceil(h * SPRITE_SCALE);
    const g = c.getContext('2d');
    g.scale(SPRITE_SCALE, SPRITE_SCALE);
    draw(g);
    return { c, w, h, surf: 0 };
  }

  function makeCloud(fill, shade) {
    return makeSprite(140, 70, (g) => {
      const blobs = [[30, 46, 20], [56, 34, 26], [88, 38, 24], [114, 48, 18], [72, 52, 20]];
      g.fillStyle = shade;
      for (const b of blobs) { g.beginPath(); g.arc(b[0], b[1] + 5, b[2], 0, TAU); g.fill(); }
      g.fillStyle = fill;
      for (const b of blobs) { g.beginPath(); g.arc(b[0], b[1], b[2], 0, TAU); g.fill(); }
    });
  }

  function makeSkyline(color, litColor, minH, maxH, windows) {
    const hMax = maxH + 20;
    return makeSprite(WORLD_W, hMax, (g) => {
      let x = -10;
      while (x < WORLD_W) {
        const w = rand(30, 56);
        const h = rand(minH, maxH);
        g.fillStyle = color;
        g.fillRect(x, hMax - h, w, h);
        const r = Math.random();
        if (r < 0.3) g.fillRect(x + w * 0.45, hMax - h - 15, 4, 15);        // antena
        else if (r < 0.6) g.fillRect(x + 6, hMax - h - 8, w - 12, 8);        // atap bertingkat
        if (windows) {
          g.fillStyle = litColor;
          for (let wy = hMax - h + 9; wy < hMax - 6; wy += 11) {
            for (let wx = x + 5; wx < x + w - 7; wx += 9) {
              if (Math.random() < 0.38) g.fillRect(wx, wy, 4, 6);
            }
          }
        }
        x += w + rand(-2, 4);
      }
    });
  }

  function makeUfo() {
    const spr = makeSprite(SPACE_W, 36, (g) => {
      g.lineJoin = 'round';
      // dasar bawah
      g.fillStyle = '#4d5a66';
      g.beginPath(); g.ellipse(36, 30, 14, 5, 0, 0, TAU); g.fill();
      // kubah kaca
      const dg = g.createLinearGradient(0, 5, 0, 16);
      dg.addColorStop(0, 'rgba(170,245,255,0.95)');
      dg.addColorStop(1, 'rgba(60,170,230,0.92)');
      g.fillStyle = dg;
      g.beginPath(); g.ellipse(36, 15, 15, 10, 0, Math.PI, TAU); g.closePath(); g.fill();
      g.strokeStyle = '#1c3a4d'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.ellipse(31, 10, 4, 2, -0.5, 0, TAU); g.fill();
      // piringan
      const sg = g.createLinearGradient(0, 14, 0, 30);
      sg.addColorStop(0, '#eceff1');
      sg.addColorStop(0.5, '#90a4ae');
      sg.addColorStop(1, '#546e7a');
      g.fillStyle = sg;
      g.beginPath(); g.ellipse(36, 22, 35, 8, 0, 0, TAU); g.fill();
      g.strokeStyle = '#26323a'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.65)'; g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(36, 22, 30, 5.5, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    });
    spr.surf = 14; // sisi atas piringan = permukaan pijakan
    return spr;
  }

  function makeMeteor(cracked) {
    const w = SPACE_W;
    const h = 46;
    const surf = 8;
    const spr = makeSprite(w, h, (g) => {
      const xs = [66, 55, 43, 31, 19, 7];
      g.beginPath();
      g.moveTo(1, surf + 3);
      for (let i = 1; i < 6; i++) g.lineTo(i * w / 6 + rand(-3, 3), surf - rand(0, 3));
      g.lineTo(w - 1, surf + 3);
      g.lineTo(w - 2, surf + 12);
      for (let i = 0; i < xs.length; i++) g.lineTo(xs[i], 22 + rand(0, 20));
      g.lineTo(2, surf + 12);
      g.closePath();
      const grad = g.createLinearGradient(0, surf, 0, h);
      if (cracked) { grad.addColorStop(0, '#c58b66'); grad.addColorStop(1, '#5b3a33'); }
      else { grad.addColorStop(0, '#b3abbd'); grad.addColorStop(1, '#4d4559'); }
      g.fillStyle = grad;
      g.fill();
      g.lineJoin = 'round'; g.lineWidth = 2; g.strokeStyle = '#2b2533'; g.stroke();
      // kawah
      g.fillStyle = 'rgba(35,28,48,0.4)';
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.ellipse(rand(14, 58), rand(16, 28), rand(4, 7), rand(2, 3.5), 0, 0, TAU); g.fill();
      }
      // kilau tepi atas
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(5, surf + 1); g.lineTo(w - 5, surf + 1); g.stroke();
      if (cracked) {
        // retakan menyala
        g.save();
        g.shadowColor = '#ff9800'; g.shadowBlur = 6;
        g.strokeStyle = '#ffb74d'; g.lineWidth = 2; g.lineCap = 'round';
        let cx = rand(26, 46);
        let cy = surf;
        g.beginPath(); g.moveTo(cx, cy);
        while (cy < 38) { cx += rand(-6, 6); cy += 8; g.lineTo(cx, cy); }
        g.stroke();
        g.beginPath(); g.moveTo(cx - 4, 26); g.lineTo(cx - 14, 30); g.lineTo(cx - 20, 27); g.stroke();
        g.restore();
      }
    });
    spr.surf = surf;
    return spr;
  }

  const cloudWhite = makeCloud('#ffffff', '#cfe6fb');
  const cloudPink = makeCloud('#ffd6df', '#e79ab4');
  const skylineFar = makeSkyline('#6b3a78', '', 70, 190, false);
  const skylineNear = makeSkyline('#2a1838', '#ffd36e', 90, 250, true);
  const ufoSprite = makeUfo();
  const meteorSprites = [makeMeteor(false), makeMeteor(false), makeMeteor(false)];
  const crackedMeteorSprites = [makeMeteor(true), makeMeteor(true), makeMeteor(true)];

  /* =========================================================
   *  DATA ORNAMEN LATAR (acak sekali, posisi dihitung dari kamera & waktu)
   * ========================================================= */
  const times = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
  const bubbles = times(28, () => ({ x: Math.random(), y: Math.random(), r: rand(2, 7), spd: rand(0.4, 1), ph: rand(0, TAU) }));
  const FISH_COLORS = ['#ffb347', '#ff7eb6', '#ffe36e', '#8be9fd'];
  const fishes = times(8, (i) => ({
    x: Math.random(), y: Math.random(), s: rand(9, 20), spd: rand(0.015, 0.045),
    dir: Math.random() < 0.5 ? -1 : 1, par: rand(0.25, 0.5), color: FISH_COLORS[i % FISH_COLORS.length],
  }));
  const seaweed = times(8, (i) => ({ x: (i + rand(0.1, 0.9)) / 8, h: rand(50, 110), ph: rand(0, TAU) }));
  const clouds = times(9, () => ({
    x: Math.random(), y: Math.random(), s: rand(0.7, 1.4), par: rand(0.06, 0.22), v: rand(0.004, 0.012), a: rand(0.75, 1),
  }));
  const STAR_LAYERS = [
    { par: 0.04, size: 1.1, drift: 0.004, items: times(45, () => ({ x: Math.random(), y: Math.random(), ph: rand(0, TAU) })) },
    { par: 0.10, size: 1.7, drift: 0.007, items: times(30, () => ({ x: Math.random(), y: Math.random(), ph: rand(0, TAU) })) },
    { par: 0.20, size: 2.4, drift: 0.012, items: times(16, () => ({ x: Math.random(), y: Math.random(), ph: rand(0, TAU) })) },
  ];

  /* =========================================================
   *  STATE
   * ========================================================= */
  const W = WORLD_W;
  let state = 'ready'; // 'ready' | 'playing' | 'over'
  let H = 700;
  let dpr = 1;
  let scale = 1;
  let T = 0;           // waktu (ms) untuk animasi latar

  let platforms = [];
  let debris = [];
  let chainY = 0;      // posisi y pijakan utama paling atas
  let heightPx = 0;
  let score = 0;
  let levelNow = 0;
  let overAt = 0;
  let best = 0;
  try { best = parseInt(localStorage.getItem('skyjump-best'), 10) || 0; } catch (e) { /* abaikan */ }

  const banner = { text: '', sub: '', age: 999 };
  const BANNER_DUR = 150; // frame

  // Mode uji: tambahkan ?level=2 (1-4) di URL untuk langsung mulai dari level tertentu
  const dbgLevel = parseInt(new URLSearchParams(window.location.search).get('level'), 10);
  const START_SCORE = dbgLevel >= 1 && dbgLevel <= 4 ? LEVEL_START_SCORE[dbgLevel - 1] : 0;

  const player = {
    x: 0, y: 0, vx: 0, vy: 0,
    w: PLAYER_W, h: PLAYER_W,
    sprite: 'normal',
    jumpTimer: 0,
  };

  function syncPlayerSize() {
    const img = sprites.normal;
    player.w = PLAYER_W;
    player.h = imgReady(img)
      ? Math.min(PLAYER_W * img.naturalHeight / img.naturalWidth, PLAYER_W * 1.8)
      : PLAYER_W;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cw = canvas.clientWidth || window.innerWidth;
    const ch = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    scale = cw / WORLD_W;
    H = ch / scale;
    if (state === 'ready') reset();
  }

  /* =========================================================
   *  PLATFORM, PER & GENERATOR
   * ========================================================= */
  const springH = () => (baked.spring ? baked.spring.h : 34);

  // skor "setara" untuk posisi y tertentu di layar (dipakai menentukan level pijakan baru)
  const altitudeScore = (y) => (heightPx + H / 2 - y) / SCORE_DIVISOR;

  function isFree(x, y, w) {
    for (let i = 0; i < platforms.length; i++) {
      const o = platforms[i];
      if (Math.abs(o.y - y) < 26 && x < o.x + o.w + 10 && x + w + 10 > o.x) return false;
    }
    return true;
  }

  function pickX(y, w) {
    let x = rand(0, W - w);
    for (let i = 0; i < 8 && !isFree(x, y, w); i++) x = rand(0, W - w);
    return x;
  }

  function makePlatform(lvl, type, y, x) {
    const r = LEVEL_RULES[lvl];
    const p = {
      x: 0, y, w: r.width, type,
      skin: lvl >= 3 ? 'space' : 'earth',
      variant: (Math.random() * 3) | 0,
      vx: 0,
      spring: null,
    };
    p.x = x === undefined ? pickX(y, p.w) : x;
    if (type === 'moving') p.vx = (Math.random() < 0.5 ? -1 : 1) * rand(r.speed[0], r.speed[1]);
    return p;
  }

  // Satu "baris": 1 pijakan utama (selalu bisa dijangkau) + kadang 1 pijakan retak sebagai tambahan
  function addRow(y, gapBelow) {
    const lvl = levelAt(altitudeScore(y));
    const r = LEVEL_RULES[lvl];
    const p = makePlatform(lvl, Math.random() < r.moving ? 'moving' : 'static', y);
    platforms.push(p);
    if (p.type === 'static' && Math.random() < r.spring) {
      p.spring = { ox: rand(6, p.w - SPRING_W - 6), anim: 0 };
    }
    if (Math.random() < r.cracked) {
      platforms.push(makePlatform(lvl, 'cracked', y + gapBelow * rand(0.35, 0.65)));
    }
  }

  function fillPlatformsUpTo(limitY) {
    while (chainY > limitY) {
      const lvl = levelAt(altitudeScore(chainY));
      const r = LEVEL_RULES[lvl];
      const gap = rand(r.gap[0], r.gap[1]);
      chainY -= gap;
      addRow(chainY, gap);
    }
  }

  function spawnDebris(p) {
    const cols = p.skin === 'space' ? ['#9a90a6', '#6a6076', '#ffb74d'] : ['#8a5a34', '#6b4223', '#5fa83a'];
    for (let i = 0; i < 8; i++) {
      debris.push({
        x: p.x + rand(0, p.w), y: p.y + rand(0, 10),
        vx: rand(-1.8, 1.8), vy: rand(-3, 0.5),
        rot: rand(0, TAU), vr: rand(-0.25, 0.25),
        s: rand(3, 7), c: cols[i % 3],
      });
    }
    if (debris.length > 60) debris.splice(0, debris.length - 60);
  }

  /* =========================================================
   *  RESET / START / GAME OVER
   * ========================================================= */
  function showBanner(l) {
    banner.text = 'LEVEL ' + (l + 1);
    banner.sub = LEVEL_NAMES[l];
    banner.age = 0;
  }

  function reset() {
    heightPx = START_SCORE * SCORE_DIVISOR;
    score = START_SCORE;
    scoreEl.textContent = String(score);
    levelNow = levelAt(score);

    platforms = [];
    debris = [];
    const baseY = H - 70;
    const baseLvl = levelAt(altitudeScore(baseY));
    const bw = LEVEL_RULES[baseLvl].width;
    platforms.push(makePlatform(baseLvl, 'static', baseY, W / 2 - bw / 2));
    chainY = baseY;
    fillPlatformsUpTo(-TOP_MARGIN);

    syncPlayerSize();
    player.vx = 0;
    player.vy = 0;
    player.jumpTimer = 0;
    player.sprite = 'normal';
    placeOnStartPlatform();
  }

  function placeOnStartPlatform() {
    const base = platforms[0];
    player.x = base.x + base.w / 2 - player.w / 2;
    player.y = base.y - player.h + FEET_INSET;
  }

  function onBounce(mult) {
    player.vy = JUMP_VELOCITY * mult;
    player.sprite = 'jump';
    player.jumpTimer = JUMP_SPRITE_TIME;
    play(sfxJump);
  }

  function startGame() {
    state = 'playing';
    startScreen.classList.add('hidden');
    overScreen.classList.add('hidden');
    showBanner(levelNow);
    onBounce(1);
  }

  function restartGame() {
    reset();
    startGame();
  }

  function gameOver() {
    state = 'over';
    player.sprite = 'lose';
    play(sfxFall);
    if (score > best) {
      best = score;
      try { localStorage.setItem('skyjump-best', String(best)); } catch (e) { /* abaikan */ }
    }
    finalScoreEl.textContent = score;
    bestScoreEl.textContent = best;
    overScreen.classList.remove('hidden');
    overAt = performance.now();
  }

  /* =========================================================
   *  INPUT (touch / mouse / keyboard)
   * ========================================================= */
  const pointers = new Map(); // pointerId -> -1 (kiri) | 1 (kanan)
  const keys = { left: false, right: false };

  function sideOf(e) {
    const rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left) < rect.width / 2 ? -1 : 1;
  }

  function handleAction() {
    if (state === 'ready') startGame();
    else if (state === 'over' && performance.now() - overAt > RESTART_DELAY) restartGame();
  }

  window.addEventListener('pointerdown', (e) => {
    unlockAudio();
    pointers.set(e.pointerId, sideOf(e));
    handleAction();
  });
  window.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, sideOf(e));
  });
  const releasePointer = (e) => pointers.delete(e.pointerId);
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  window.addEventListener('blur', () => { pointers.clear(); keys.left = keys.right = false; });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    else if (e.key === ' ' || e.key === 'Enter') { unlockAudio(); handleAction(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  // Cegah scroll/zoom/menu tekan-lama di browser HP
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  function pressed() {
    let left = keys.left;
    let right = keys.right;
    for (const v of pointers.values()) {
      if (v < 0) left = true; else right = true;
    }
    return { left, right };
  }

  function getDir() {
    const p = pressed();
    return (p.right ? 1 : 0) - (p.left ? 1 : 0); // dua sisi sekaligus = diam
  }

  /* =========================================================
   *  UPDATE
   * ========================================================= */
  // Apakah rentang [l, r] menyentuh [a, b], termasuk saat karakter "membungkus" tepi layar
  function overlapsX(l, r, a, b) {
    return (r > a && l < b) || (r - W > a && l - W < b) || (r + W > a && l + W < b);
  }

  function update(dt) {
    // Gerak horizontal (dengan sedikit smoothing)
    const target = getDir() * MOVE_SPEED;
    player.vx += (target - player.vx) * Math.min(1, MOVE_SMOOTH * dt);

    const prevY = player.y;
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    player.x += player.vx * dt;

    // Wrap-around layar
    const cx = player.x + player.w / 2;
    if (cx < 0) player.x += W;
    else if (cx > W) player.x -= W;

    // Pijakan bergerak & animasi per
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (p.type === 'moving') {
        p.x += p.vx * dt;
        if (p.x < 0) { p.x = 0; p.vx = -p.vx; }
        else if (p.x + p.w > W) { p.x = W - p.w; p.vx = -p.vx; }
      }
      if (p.spring && p.spring.anim > 0) p.spring.anim = Math.max(0, p.spring.anim - 0.07 * dt);
    }

    // Tabrakan: hanya saat jatuh, kaki melintasi sisi atas pijakan / per
    if (player.vy > 0) {
      const hbW = player.w * HITBOX_W_RATIO;
      const left = player.x + (player.w - hbW) / 2;
      const right = left + hbW;
      const feetPrev = prevY + player.h - FEET_INSET;
      const feet = player.y + player.h - FEET_INSET;
      let hit = false;

      // 1) Per dicek lebih dulu (permukaannya lebih tinggi dari pijakan)
      for (let i = 0; i < platforms.length && !hit; i++) {
        const p = platforms[i];
        if (!p.spring) continue;
        const top = p.y - springH() + 3;
        const sx = p.x + p.spring.ox;
        if (feetPrev <= top + 0.01 && feet >= top && overlapsX(left, right, sx + 2, sx + SPRING_W - 2)) {
          player.y = top - player.h + FEET_INSET;
          p.spring.anim = 1;
          onBounce(SPRING_BOOST);
          hit = true;
        }
      }

      // 2) Pijakan biasa / retak
      for (let i = 0; i < platforms.length && !hit; i++) {
        const p = platforms[i];
        if (feetPrev <= p.y + 0.01 && feet >= p.y && overlapsX(left, right, p.x + 2, p.x + p.w - 2)) {
          player.y = p.y - player.h + FEET_INSET;
          onBounce(1);
          if (p.type === 'cracked') { // memantul, lalu pijakan langsung hancur
            spawnDebris(p);
            platforms.splice(i, 1);
          }
          hit = true;
        }
      }
    }

    // Timer sprite loncat
    if (player.jumpTimer > 0) {
      player.jumpTimer -= dt;
      if (player.jumpTimer <= 0) player.sprite = 'normal';
    }

    // Kamera: lewat batas tengah layar -> geser semua ke bawah + tambah skor
    const limit = H / 2;
    if (player.y < limit) {
      const d = limit - player.y;
      player.y = limit;
      for (let i = 0; i < platforms.length; i++) platforms[i].y += d;
      for (let i = 0; i < debris.length; i++) debris[i].y += d;
      chainY += d;
      heightPx += d;
      const newScore = Math.floor(heightPx / SCORE_DIVISOR);
      if (newScore !== score) {
        score = newScore;
        scoreEl.textContent = String(score);
        const lvl = levelAt(score);
        if (lvl > levelNow) { levelNow = lvl; showBanner(lvl); }
      }
    }

    // Hapus pijakan di bawah layar, generate yang baru di atas
    let n = 0;
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (p.y < H + 40) platforms[n++] = p;
    }
    platforms.length = n;
    fillPlatformsUpTo(-TOP_MARGIN);

    // Serpihan pijakan hancur
    let m = 0;
    for (let i = 0; i < debris.length; i++) {
      const b = debris[i];
      b.vy += 0.35 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (b.y < H + 30) debris[m++] = b;
    }
    debris.length = m;

    if (banner.age < BANNER_DUR) banner.age += dt;

    // Game over: karakter jatuh melewati batas bawah layar
    if (player.y > H) gameOver();
  }

  /* =========================================================
   *  RENDER: LATAR BELAKANG (gradient + blending antar level)
   * ========================================================= */
  const weights = [1, 0, 0, 0]; // bobot tiap level, jumlahnya selalu 1

  function computeWeights(sc) {
    weights[0] = weights[1] = weights[2] = weights[3] = 0;
    for (let i = 0; i < 3; i++) {
      const b = LEVEL_END[i];
      if (sc < b - BLEND_BEFORE) { weights[i] = 1; return; }
      if (sc <= b + BLEND_AFTER) {
        const t = smooth((sc - (b - BLEND_BEFORE)) / (BLEND_BEFORE + BLEND_AFTER));
        weights[i] = 1 - t;
        weights[i + 1] = t;
        return;
      }
    }
    weights[3] = 1;
  }

  function mixSky(stop) {
    let r = 0, g = 0, b = 0;
    for (let l = 0; l < 4; l++) {
      const w = weights[l];
      if (w === 0) continue;
      const c = SKY[l][stop];
      r += c[0] * w; g += c[1] * w; b += c[2] * w;
    }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  function drawBackground(t) {
    computeWeights(heightPx / SCORE_DIVISOR);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mixSky(0));
    g.addColorStop(0.55, mixSky(1));
    g.addColorStop(1, mixSky(2));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (weights[3] > 0.01) drawSpace(weights[3], heightPx, t);
    if (weights[2] > 0.01) drawDaySky(weights[2], heightPx, t);
    if (weights[1] > 0.01) drawDusk(weights[1], heightPx, t);
    if (weights[0] > 0.01) drawSea(weights[0], heightPx, t);
    ctx.globalAlpha = 1;
  }

  function drawCloudLayer(spr, count, w, cam, t) {
    const spanX = W + 200;
    const spanY = H + 120;
    for (let i = 0; i < count; i++) {
      const c = clouds[i];
      const x = wrapPos(c.x * spanX, t * c.v, spanX, 100);
      const y = wrapPos(c.y * spanY, cam * c.par, spanY, 60);
      ctx.globalAlpha = w * c.a;
      ctx.drawImage(spr.c, x, y, spr.w * c.s, spr.h * c.s);
    }
  }

  /* ----- Level 1: laut ----- */
  function drawSea(w, cam, t) {
    ctx.globalAlpha = w;

    // berkas cahaya dari permukaan
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < 4; i++) {
      const x = i * 120 - 20 + Math.sin(t * 0.0004 + i * 1.7) * 24;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 44, 0);
      ctx.lineTo(x + 150, H * 0.8);
      ctx.lineTo(x + 60, H * 0.8);
      ctx.closePath();
      ctx.fill();
    }

    // dasar laut + rumput laut (turun perlahan saat naik)
    const base = H - 8 + cam * 0.12;
    if (base < H + 260) {
      ctx.fillStyle = '#082a4d';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 100 + 10, base + 6, 72, 26, 0, 0, TAU);
        ctx.fill();
      }
      ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#1a9a68';
      for (let i = 0; i < seaweed.length; i++) {
        const s = seaweed[i];
        const x = s.x * W;
        const sway = Math.sin(t * 0.0016 + s.ph) * 10;
        ctx.beginPath();
        ctx.moveTo(x, base);
        ctx.bezierCurveTo(x - 12 + sway, base - s.h * 0.35, x + 12 + sway, base - s.h * 0.7, x + sway * 1.4, base - s.h);
        ctx.stroke();
      }
    }

    // ikan
    const spanX = W + 120;
    const spanY = H + 60;
    for (let i = 0; i < fishes.length; i++) {
      const f = fishes[i];
      const x = wrapPos(f.x * spanX, f.dir * t * f.spd, spanX, 60);
      const y = wrapPos(f.y * spanY, cam * f.par, spanY, 30) + Math.sin(t * 0.003 + f.x * 9) * 4;
      const s = f.s;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(f.dir, 1);
      ctx.globalAlpha = w * 0.92;
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.55, 0, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, 0); ctx.lineTo(-s * 1.55, -s * 0.55); ctx.lineTo(-s * 1.55, s * 0.55);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(-s * 0.1, -s * 0.2, s * 0.5, s * 0.14, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.12, s * 0.17, 0, TAU); ctx.fill();
      ctx.fillStyle = '#12304a';
      ctx.beginPath(); ctx.arc(s * 0.54, -s * 0.12, s * 0.085, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // gelembung (digabung dalam satu path agar ringan)
    const span = H + 40;
    ctx.globalAlpha = w;
    ctx.beginPath();
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      const y = wrapPos(b.y * span, cam * (0.15 + b.r * 0.03) - t * 0.03 * b.spd, span, 20);
      const x = b.x * W + Math.sin(t * 0.002 + b.ph) * 7;
      ctx.moveTo(x + b.r, y);
      ctx.arc(x, y, b.r, 0, TAU);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  /* ----- Level 2: kota saat senja ----- */
  function drawDusk(w, cam, t) {
    // makin tinggi, siluet kota turun pelan (parallax)
    const sink = Math.max(0, cam - (LEVEL_END[0] - BLEND_BEFORE) * SCORE_DIVISOR) * 0.05;
    ctx.globalAlpha = w;

    // matahari terbenam
    const sx = W * 0.68;
    const sy = H * 0.8 + sink * 0.5;
    const glow = ctx.createRadialGradient(sx, sy, 8, sx, sy, 150);
    glow.addColorStop(0, 'rgba(255,224,150,0.95)');
    glow.addColorStop(0.35, 'rgba(255,150,120,0.45)');
    glow.addColorStop(1, 'rgba(255,120,120,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 160, sy - 160, 320, 320);
    ctx.fillStyle = '#ffe1a8';
    ctx.beginPath(); ctx.arc(sx, sy, 34, 0, TAU); ctx.fill();

    drawCloudLayer(cloudPink, 5, w * 0.85, cam, t);

    ctx.globalAlpha = w;
    ctx.drawImage(skylineFar.c, 0, H - skylineFar.h + sink * 0.6, skylineFar.w, skylineFar.h);
    ctx.drawImage(skylineNear.c, 0, H - skylineNear.h + sink, skylineNear.w, skylineNear.h);
  }

  /* ----- Level 3: langit cerah + matahari (foto couple) ----- */
  function drawDaySky(w, cam, t) {
    drawCloudLayer(cloudWhite, clouds.length, w, cam, t);

    const sx = W * 0.58;
    const sy = 86 + (1 - w) * 90 + Math.sin(t * 0.0012) * 4; // "terbit" saat level 3 mulai
    ctx.globalAlpha = w;
    const glow = ctx.createRadialGradient(sx, sy, 20, sx, sy, 160);
    glow.addColorStop(0, 'rgba(255,244,170,0.9)');
    glow.addColorStop(0.5, 'rgba(255,236,140,0.35)');
    glow.addColorStop(1, 'rgba(255,236,140,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 170, sy - 170, 340, 340);

    const b = baked.sun;
    if (b) {
      ctx.drawImage(b.c, sx - b.w / 2, sy - b.h / 2, b.w, b.h);
    } else {
      ctx.fillStyle = '#ffe36e';
      ctx.beginPath(); ctx.arc(sx, sy, 40, 0, TAU); ctx.fill();
    }
  }

  /* ----- Level 4: luar angkasa ----- */
  function drawSpace(w, cam, t) {
    ctx.globalAlpha = w;

    // nebula
    let g = ctx.createRadialGradient(W * 0.3, H * 0.3, 10, W * 0.3, H * 0.3, 230);
    g.addColorStop(0, 'rgba(130,70,210,0.28)');
    g.addColorStop(1, 'rgba(130,70,210,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(W * 0.85, H * 0.72, 10, W * 0.85, H * 0.72, 260);
    g.addColorStop(0, 'rgba(40,110,230,0.22)');
    g.addColorStop(1, 'rgba(40,110,230,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // planet bercincin (sangat jauh, turun sangat pelan)
    const py = 120 + Math.max(0, cam - (LEVEL_END[2] - BLEND_BEFORE) * SCORE_DIVISOR) * 0.04;
    if (py < H + 80) {
      const px = W * 0.78;
      g = ctx.createRadialGradient(px - 12, py - 12, 4, px, py, 38);
      g.addColorStop(0, '#b9adff');
      g.addColorStop(1, '#3b2f7a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, 38, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(225,215,255,0.65)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(px, py, 62, 14, -0.35, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#8f8a9c';
      ctx.beginPath(); ctx.arc(W * 0.16, py + 90, 13, 0, TAU); ctx.fill();
    }

    // bintang: 3 lapisan dengan kecepatan parallax berbeda + berkedip
    ctx.fillStyle = '#fff';
    const span = H + 10;
    for (let l = 0; l < STAR_LAYERS.length; l++) {
      const L = STAR_LAYERS[l];
      for (let i = 0; i < L.items.length; i++) {
        const s = L.items[i];
        const y = wrapPos(s.y * span, cam * L.par + t * L.drift, span, 5);
        ctx.globalAlpha = w * (0.45 + 0.55 * Math.abs(Math.sin(t * 0.0015 + s.ph)));
        ctx.fillRect(s.x * W, y, L.size, L.size);
      }
    }
  }

  /* =========================================================
   *  RENDER: PIJAKAN, PER, KARAKTER, HUD
   * ========================================================= */
  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Pijakan tanah sederhana (cadangan bila gambar belum dimuat)
  function drawEarthFallback(p) {
    ctx.fillStyle = '#7a4a28';
    roundRectPath(p.x, p.y, p.w, 16, 6);
    ctx.fill();
    ctx.fillStyle = '#5fcf6a';
    roundRectPath(p.x, p.y - 2, p.w, 7, 4);
    ctx.fill();
    if (p.type === 'cracked') {
      ctx.strokeStyle = '#2b1a0e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x + p.w * 0.35, p.y - 1);
      ctx.lineTo(p.x + p.w * 0.45, p.y + 6);
      ctx.lineTo(p.x + p.w * 0.38, p.y + 11);
      ctx.moveTo(p.x + p.w * 0.7, p.y - 1);
      ctx.lineTo(p.x + p.w * 0.62, p.y + 8);
      ctx.stroke();
    }
  }

  function drawEarth(p) {
    const b = p.type === 'cracked' ? baked.cracked : baked.normal;
    if (!b) { drawEarthFallback(p); return; }
    const f = p.w / b.w;
    ctx.drawImage(b.c, p.x, p.y - b.surf * f, b.w * f, b.h * f);
  }

  function drawSpacePlatform(p, t) {
    const f = p.w / SPACE_W;
    let spr;
    if (p.type === 'moving') spr = ufoSprite;
    else if (p.type === 'cracked') spr = crackedMeteorSprites[p.variant];
    else spr = meteorSprites[p.variant];
    ctx.drawImage(spr.c, p.x, p.y - spr.surf * f, spr.w * f, spr.h * f);

    if (p.type === 'moving') { // lampu UFO berkedip
      const ly = p.y + 8 * f;
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = Math.sin(t * 0.006 + i * 1.3) > 0 ? '#ffee58' : '#ff7043';
        ctx.beginPath();
        ctx.arc(p.x + (12 + i * 12) * f, ly, 2.2 * f, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawSpring(p) {
    const sp = p.spring;
    const h = springH();
    const dh = h * (1 + 0.3 * sp.anim); // memanjang sesaat setelah dipantulkan
    const x = p.x + sp.ox;
    const bottom = p.y + 1;
    const b = baked.spring;
    if (b) {
      ctx.drawImage(b.c, x, bottom - dh, SPRING_W, dh);
    } else {
      ctx.fillStyle = '#555c66';
      ctx.fillRect(x + 2, bottom - 6, SPRING_W - 4, 6);
      ctx.strokeStyle = '#aeb6bf';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 4, bottom - 6);
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(x + SPRING_W - 4, bottom - 6 - (i + 0.5) * (dh - 15) / 4);
        ctx.lineTo(x + 4, bottom - 6 - (i + 1) * (dh - 15) / 4);
      }
      ctx.stroke();
      ctx.fillStyle = '#e8335a';
      roundRectPath(x, bottom - dh, SPRING_W, 9, 4);
      ctx.fill();
    }
  }

  function drawPlatforms(t) {
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (p.skin === 'space') drawSpacePlatform(p, t);
      else drawEarth(p);
      if (p.spring) drawSpring(p);
    }
  }

  function drawDebris() {
    for (let i = 0; i < debris.length; i++) {
      const b = debris[i];
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s);
      ctx.restore();
    }
  }

  function drawPlayerAt(offsetX) {
    let img = sprites[player.sprite];
    if (!imgReady(img)) img = sprites.normal;
    const bottom = player.y + player.h;
    if (imgReady(img)) {
      const dh = Math.min(player.w * img.naturalHeight / img.naturalWidth, player.w * 1.8);
      ctx.drawImage(img, player.x + offsetX, bottom - dh, player.w, dh);
    } else {
      // Placeholder bila foto belum ada / gagal dimuat
      ctx.fillStyle = '#ff8fab';
      ctx.beginPath();
      ctx.arc(player.x + offsetX + player.w / 2, player.y + player.h / 2, player.w / 2, 0, TAU);
      ctx.fill();
    }
  }

  function drawPlayer() {
    drawPlayerAt(0);
    // Gambar bayangan di sisi seberang agar wrap-around terlihat mulus
    if (player.x < 0) drawPlayerAt(W);
    if (player.x + player.w > W) drawPlayerAt(-W);
  }

  function drawControlHints() {
    const p = pressed();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    if (p.left) ctx.fillRect(0, 0, W / 2, H);
    if (p.right) ctx.fillRect(W / 2, 0, W / 2, H);

    const y = H - 44;
    ctx.fillStyle = p.left ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.28)';
    ctx.beginPath();
    ctx.moveTo(34, y);
    ctx.lineTo(54, y - 16);
    ctx.lineTo(54, y + 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = p.right ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.28)';
    ctx.beginPath();
    ctx.moveTo(W - 34, y);
    ctx.lineTo(W - 54, y - 16);
    ctx.lineTo(W - 54, y + 16);
    ctx.closePath();
    ctx.fill();

    // Garis pemisah tipis di tengah
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

  function drawLevelHud() {
    // label level di pojok kanan atas
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px ' + FONT;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.fillStyle = '#fff';
    const label = 'LV ' + (levelAt(score) + 1) + ' · ' + LEVEL_NAMES[levelAt(score)];
    ctx.strokeText(label, W - 14, 30);
    ctx.fillText(label, W - 14, 30);

    // banner saat level baru dimulai
    if (banner.age < BANNER_DUR) {
      const a = clamp(Math.min(banner.age / 18, (BANNER_DUR - banner.age) / 30), 0, 1);
      const slide = (1 - smooth(banner.age / 18)) * 18;
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '900 38px ' + FONT;
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.fillStyle = '#ffe36e';
      ctx.strokeText(banner.text, W / 2, H * 0.27 + slide);
      ctx.fillText(banner.text, W / 2, H * 0.27 + slide);
      ctx.font = '800 20px ' + FONT;
      ctx.lineWidth = 5;
      ctx.fillStyle = '#fff';
      ctx.strokeText(banner.sub, W / 2, H * 0.27 + 34 + slide);
      ctx.fillText(banner.sub, W / 2, H * 0.27 + 34 + slide);
      ctx.globalAlpha = 1;
    }
  }

  function render(t) {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    drawBackground(t);
    drawPlatforms(t);
    drawDebris();
    drawPlayer();
    drawControlHints();
    drawLevelHud();
  }

  /* =========================================================
   *  GAME LOOP
   * ========================================================= */
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 16.667, 2.5); // normalisasi ke 60fps, batasi lonjakan
    last = now;
    T = now;

    if (state === 'playing') update(dt);
    else if (state === 'ready') { syncPlayerSize(); placeOnStartPlatform(); }

    render(T);
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));

  resize();
  reset();
  requestAnimationFrame(frame);
})();