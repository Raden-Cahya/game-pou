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
  const FOOT_HALF = 14;         // setengah lebar area kaki untuk deteksi pijakan (px)
  const FEET_INSET = 4;         // px area transparan di bawah foto yang diabaikan
  const JUMP_SPRITE_TIME = 14;  // lama sprite "loncat" tampil (frame)
  const SCORE_DIVISOR = 3;      // 3 px ketinggian = 1 poin
  const RESTART_DELAY = 600;    // ms, cegah tap tak sengaja langsung restart
  const TOP_MARGIN = 90;        // area di atas layar tempat pijakan digenerate
  const SPRITE_SCALE = 3;       // resolusi sprite hasil render (anti-buram di HP)

  /* =========================================================
   *  KONFIGURASI LEVEL
   * ========================================================= */
  const LEVEL_END = [1500, 3000, 5000];            // batas skor akhir Level 1, 2, 3
  const LEVEL_START_SCORE = [0, 1501, 3001, 5001]; // skor awal tiap level (untuk mode uji)
  const LEVEL_NAMES = ['Laut', 'Kota', 'Langit', 'Luar Angkasa'];
  const BLEND_BEFORE = 250;     // transisi warna langit mulai 250 poin sebelum batas level...
  const BLEND_AFTER = 10;       // ...dan selesai 10 poin setelah batas (level baru langsung penuh)
  const BOSS_SCORE = 6000;      // skor pemicu Final Boss
  const BOSS_HEIGHT = BOSS_SCORE * SCORE_DIVISOR;

  // skin    : bentuk pijakan yang digambar
  // gap     : jarak vertikal antar pijakan utama [min, max] (loncatan normal ±157px)
  // width   : lebar pijakan (sama dengan lebar sprite-nya)
  // moving  : peluang pijakan utama bergerak kiri-kanan
  // cracked : peluang munculnya pijakan sekali injak (selalu tambahan, bukan satu-satunya jalur)
  // spring  : peluang pijakan statis membawa per
  // speed   : kecepatan pijakan bergerak [min, max]
  const LEVEL_RULES = [
    { skin: 'jelly', gap: [48, 82],  width: 76, moving: 0,    cracked: 0.26, spring: 0,    speed: [0, 0] },     // Laut: ubur-ubur
    { skin: 'earth', gap: [52, 96],  width: 80, moving: 0,    cracked: 0.32, spring: 0,    speed: [0, 0] },     // Kota: tanah (gambar)
    { skin: 'cloud', gap: [56, 108], width: 80, moving: 0.30, cracked: 0.28, spring: 0.22, speed: [1.0, 2.0] }, // Langit: awan
    { skin: 'space', gap: [56, 104], width: 72, moving: 0.25, cracked: 0.16, spring: 0.12, speed: [1.0, 2.0] }, // Angkasa: meteor + UFO pelan
  ];

  // Warna langit per level: [atas, tengah, bawah]
  const SKY = [
    ['#4fd1ea', '#1f8fcf', '#0a3b78'],  // Level 1: bawah laut
    ['#2e2a6e', '#c2528b', '#ff9a62'],  // Level 2: senja
    ['#3d9bff', '#86cbff', '#d8f1ff'],  // Level 3: langit cerah
    ['#02020a', '#070720', '#14123a'],  // Level 4: luar angkasa
  ].map((stops) => stops.map(hexToRgb));

  /* =========================================================
   *  KONFIGURASI BOSS & KEMENANGAN
   * ========================================================= */
  const BOSS_HP = 5;
  const BOSS_W = Math.round(PLAYER_W * 1.8);                   // ±1,8x ukuran pemain
  const BOSS_SPEED = [0, 4.6, 3.6, 2.8, 2.1, 1.6];             // kecepatan gerak, indeks = sisa HP
  const BOSS_FIRE = [0, 62, 80, 98, 120, 144];                 // jeda tembakan (frame), indeks = sisa HP
  const BOSS_SHOT_SPEED = [0, 4.8, 4.3, 3.9, 3.5, 3.2];        // kecepatan proyektil, indeks = sisa HP
  const BOSS_CHARGE = 26;       // frame "mengisi tenaga" sebelum menembak (peringatan)
  const BOSS_BOUNCE = 1.5;      // pengali loncatan saat menginjak boss
  const BOSS_INVULN = 75;       // frame kebal sesaat setelah terinjak
  const BOSS_INTRO = 110;       // frame boss turun masuk arena
  const BOSS_HIT_X0 = 0.27;     // area injak boss (fraksi lebar sprite)
  const BOSS_HIT_X1 = 0.73;
  const BOSS_HIT_TOP = 0.05;    // garis atas area injak (fraksi tinggi sprite)
  const SHOT_R = 7;             // radius hitbox proyektil

  const VIC_EXPLODE = 55;       // frame saat ledakan besar boss terjadi
  const VIC_FLOAT_END = 250;    // frame akhir fase melayang di tengah
  const VIC_CRAWL_START = 295;  // frame awal teks Star Wars berjalan
  const CRAWL_SPEED = 0.25;     // kecepatan crawl (satuan kedalaman per detik)
  const CRAWL_BUTTON_AT = 8;    // detik setelah crawl mulai, tombol "Tap untuk Main Lagi" muncul

  /* =========================================================
   *  UTIL
   * ========================================================= */
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
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

  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  const levelAt = (s) => (s <= LEVEL_END[0] ? 0 : s <= LEVEL_END[1] ? 1 : s <= LEVEL_END[2] ? 2 : 3);

  /* =========================================================
   *  ELEMEN, ASET & AUDIO
   * ========================================================= */
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const startScreen = document.getElementById('start-screen');
  const overScreen = document.getElementById('over-screen');
  const overTitleEl = overScreen.querySelector('h1');
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

  function makeAudio(src, loop, volume) {
    const a = new Audio(src);
    a.preload = 'auto';
    a.loop = loop;
    a.volume = volume;
    return a;
  }
  const sfxJump = makeAudio('assets/loncat.mp3', false, 1);
  const sfxFall = makeAudio('assets/jatuh.mp3', false, 1);
  const bgmBoss = makeAudio('assets/boss-theme.mp3', true, 0.7);
  const bgmWin = makeAudio('assets/menang.mp3', true, 0.85);

  function play(audio) {
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* abaikan */ }
  }

  function stopAudio(audio) {
    try { audio.pause(); audio.currentTime = 0; } catch (e) { /* abaikan */ }
  }

  // Browser HP memblokir audio sebelum ada sentuhan: "buka kunci" semua audio saat tap pertama,
  // sehingga musik boss/menang nanti bisa diputar otomatis.
  let audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    [sfxJump, sfxFall, bgmBoss, bgmWin].forEach((a) => {
      a.muted = true;
      const restore = () => { a.pause(); a.currentTime = 0; a.muted = false; };
      try {
        const p = a.play();
        if (p && p.then) p.then(restore).catch(() => { a.muted = false; });
        else restore();
      } catch (e) { a.muted = false; }
    });
  }

  /* ---------- Gambar: dipangkas ke area terlihat lalu di-bake ke sprite kecil ---------- */
  const PLATFORM_BAKE_W = 84;   // lebar dasar sprite pijakan tanah
  const SPRING_W = 24;
  const SUN_W = 190;
  const SPACE_W = 72;           // lebar sprite UFO / meteor
  const JELLY_W = 76;           // lebar sprite ubur-ubur
  const CLOUD_W = 80;           // lebar sprite awan

  // surfFrac: posisi garis permukaan (rumput) dari tepi atas gambar yang sudah dipangkas,
  // relatif terhadap lebar gambar. Dipakai agar kaki karakter pas di atas rumput.
  const ART = {
    normal:  { src: 'assets/pijakan-normal.png',  w: PLATFORM_BAKE_W, surfFrac: 0.034 },
    cracked: { src: 'assets/pijakan-retak.png',   w: PLATFORM_BAKE_W, surfFrac: 0.030 },
    spring:  { src: 'assets/per-pantul.png',      w: SPRING_W,        surfFrac: 0 },
    sun:     { src: 'assets/matahari-couple.png', w: SUN_W,           surfFrac: 0 },
    boss:    { src: 'assets/boss.png',            w: BOSS_W,          surfFrac: 0 },
  };
  // null = belum dimuat (game memakai gambar cadangan dari Canvas)
  const baked = { normal: null, cracked: null, spring: null, sun: null, boss: null, bossRed: null, bossWhite: null };

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

  // Salinan sprite yang diwarnai (untuk kedipan merah/putih boss), hanya pada piksel yang terisi
  function tint(spr, color) {
    const c = document.createElement('canvas');
    c.width = spr.c.width;
    c.height = spr.c.height;
    const g = c.getContext('2d');
    g.drawImage(spr.c, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return { c, w: spr.w, h: spr.h, surf: 0 };
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
      if (key === 'boss') {
        baked.bossRed = tint(spr, 'rgba(255,40,40,0.9)');
        baked.bossWhite = tint(spr, 'rgba(255,255,255,0.95)');
      }
    };
    img.src = ART[key].src;
  });

  /* =========================================================
   *  SPRITE YANG DIGAMBAR LEWAT CANVAS (sekali saja, lalu dipakai ulang)
   * ========================================================= */
  function makeSprite(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * SPRITE_SCALE);
    c.height = Math.ceil(h * SPRITE_SCALE);
    const g = c.getContext('2d');
    g.scale(SPRITE_SCALE, SPRITE_SCALE);
    draw(g);
    return { c, w, h, surf: 0 };
  }

  /* ----- Ubur-ubur (Level 1): kubah digambar sekali, tentakel dianimasikan tiap frame ----- */
  // Kubah: elips (pusat 38,19; rx 36; ry 16) -> puncak di y=3 = permukaan pijakan
  function makeJellyBell(ghost) {
    const spr = makeSprite(JELLY_W, 26, (g) => {
      g.lineJoin = 'round';
      const grad = g.createLinearGradient(0, 3, 0, 24);
      if (ghost) {
        grad.addColorStop(0, 'rgba(215,250,255,0.62)');
        grad.addColorStop(1, 'rgba(130,215,255,0.30)');
      } else {
        grad.addColorStop(0, '#ffb6e8');
        grad.addColorStop(1, '#b552d8');
      }
      g.beginPath();
      g.ellipse(38, 19, 36, 16, 0, Math.PI, TAU);
      for (let i = 0; i < 6; i++) g.quadraticCurveTo(74 - i * 12 - 6, 25, 74 - (i + 1) * 12, 19);
      g.closePath();
      g.fillStyle = grad;
      g.fill();
      // bintik di kubah
      g.fillStyle = ghost ? 'rgba(255,255,255,0.5)' : 'rgba(150,40,170,0.35)';
      for (const s of [[24, 12, 3, 2], [38, 9, 4, 2.5], [52, 12, 3, 2], [31, 15, 2, 1.4], [46, 15, 2, 1.4]]) {
        g.beginPath(); g.ellipse(s[0], s[1], s[2], s[3], 0, 0, TAU); g.fill();
      }
      // kilau
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.beginPath(); g.ellipse(38, 19, 30, 11, 0, Math.PI * 1.12, Math.PI * 1.45); g.stroke();
      // garis tepi: putus-putus untuk ubur-ubur transparan (rapuh)
      g.lineWidth = 1.6;
      if (ghost) {
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.setLineDash([4, 3]);
      } else {
        g.strokeStyle = 'rgba(110,30,140,0.6)';
      }
      g.beginPath();
      g.ellipse(38, 19, 36, 16, 0, Math.PI, TAU);
      for (let i = 0; i < 6; i++) g.quadraticCurveTo(74 - i * 12 - 6, 25, 74 - (i + 1) * 12, 19);
      g.closePath();
      g.stroke();
    });
    spr.surf = 3;
    return spr;
  }

  /* ----- Awan tebal (Level 3): putih = pijakan biasa, gelap/mendung = sekali injak ----- */
  const CLOUD_PUFFS = [[40, 19, 17], [25, 23, 14], [55, 23, 14], [12, 29, 10], [68, 29, 10]]; // [x, y, radius]
  const CLOUD_SURF = 4;
  // Tabel profil permukaan awan (dihitung dari bentuk gambar) agar hitbox sesuai bentuk aslinya
  const CLOUD_PROFILE = (() => {
    const arr = [];
    for (let x = 0; x <= CLOUD_W; x++) {
      let top = Infinity;
      for (const p of CLOUD_PUFFS) {
        const dx = x - p[0];
        if (Math.abs(dx) <= p[2]) top = Math.min(top, p[1] - Math.sqrt(p[2] * p[2] - dx * dx));
      }
      arr.push(top === Infinity || top > 24 ? null : Math.max(0, top - CLOUD_SURF));
    }
    return arr;
  })();

  function makeCloudPlatform(dark) {
    const spr = makeSprite(CLOUD_W, 40, (g) => {
      const fill = dark ? '#7b8399' : '#ffffff';
      const rim = dark ? '#2f3445' : '#8fb0d4';
      const shade = dark ? 'rgba(20,25,45,0.8)' : 'rgba(110,160,215,0.6)';
      // kontur
      g.fillStyle = rim;
      for (const p of CLOUD_PUFFS) { g.beginPath(); g.arc(p[0], p[1], p[2] + 1.7, 0, TAU); g.fill(); }
      rrect(g, 6.3, 24.3, 67.4, 15.4, 8); g.fill();
      // isi
      g.fillStyle = fill;
      for (const p of CLOUD_PUFFS) { g.beginPath(); g.arc(p[0], p[1], p[2], 0, TAU); g.fill(); }
      rrect(g, 8, 26, 64, 12, 6); g.fill();
      // bayangan lembut di bagian bawah
      g.globalCompositeOperation = 'source-atop';
      const sg = g.createLinearGradient(0, 14, 0, 40);
      sg.addColorStop(0, 'rgba(0,0,0,0)');
      sg.addColorStop(1, shade);
      g.fillStyle = sg;
      g.fillRect(0, 0, CLOUD_W, 40);
      g.globalCompositeOperation = 'source-over';
      // kilau di puncak
      g.fillStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.95)';
      g.beginPath(); g.ellipse(34, 8, 7, 2.6, -0.25, 0, TAU); g.fill();
      if (dark) { // petir kecil di awan mendung
        g.fillStyle = '#ffe066';
        g.strokeStyle = '#7a5d00';
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(42, 24); g.lineTo(35, 33); g.lineTo(40, 33); g.lineTo(36, 39); g.lineTo(47, 29); g.lineTo(42, 29); g.lineTo(46, 24);
        g.closePath();
        g.fill();
        g.stroke();
      }
    });
    spr.surf = CLOUD_SURF;
    return spr;
  }

  /* ----- Luar angkasa: UFO & meteor ----- */
  function makeUfo() {
    const spr = makeSprite(SPACE_W, 36, (g) => {
      g.lineJoin = 'round';
      g.fillStyle = '#4d5a66';
      g.beginPath(); g.ellipse(36, 30, 14, 5, 0, 0, TAU); g.fill();
      const dg = g.createLinearGradient(0, 5, 0, 16);
      dg.addColorStop(0, 'rgba(170,245,255,0.95)');
      dg.addColorStop(1, 'rgba(60,170,230,0.92)');
      g.fillStyle = dg;
      g.beginPath(); g.ellipse(36, 15, 15, 10, 0, Math.PI, TAU); g.closePath(); g.fill();
      g.strokeStyle = '#1c3a4d'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath(); g.ellipse(31, 10, 4, 2, -0.5, 0, TAU); g.fill();
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
      g.fillStyle = 'rgba(35,28,48,0.4)';
      for (let i = 0; i < 3; i++) {
        g.beginPath(); g.ellipse(rand(14, 58), rand(16, 28), rand(4, 7), rand(2, 3.5), 0, 0, TAU); g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(5, surf + 1); g.lineTo(w - 5, surf + 1); g.stroke();
      if (cracked) { // retakan menyala
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

  /* ----- Latar belakang ----- */
  function makeBgCloud(fill, shade) {
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

  /* ----- Boss: bola energi ----- */
  function makeOrb() {
    return makeSprite(32, 32, (g) => {
      const r = g.createRadialGradient(16, 16, 1, 16, 16, 16);
      r.addColorStop(0, '#ffffff');
      r.addColorStop(0.25, '#9cf6ff');
      r.addColorStop(0.55, 'rgba(255,60,200,0.85)');
      r.addColorStop(1, 'rgba(255,60,200,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 32, 32);
    });
  }

  function makeShotTail() {
    return makeSprite(14, 40, (g) => {
      const l = g.createLinearGradient(0, 0, 0, 40);
      l.addColorStop(0, 'rgba(255,60,200,0)');
      l.addColorStop(1, 'rgba(255,120,230,0.8)');
      g.fillStyle = l;
      g.beginPath(); g.moveTo(7, 0); g.lineTo(13, 40); g.lineTo(1, 40); g.closePath(); g.fill();
    });
  }

  const jellyBellSprite = makeJellyBell(false);
  const jellyGhostSprite = makeJellyBell(true);
  const cloudWhiteSprite = makeCloudPlatform(false);
  const cloudDarkSprite = makeCloudPlatform(true);
  const ufoSprite = makeUfo();
  const meteorSprites = [makeMeteor(false), makeMeteor(false), makeMeteor(false)];
  const crackedMeteorSprites = [makeMeteor(true), makeMeteor(true), makeMeteor(true)];
  const bgCloudWhite = makeBgCloud('#ffffff', '#cfe6fb');
  const bgCloudPink = makeBgCloud('#ffd6df', '#e79ab4');
  const skylineFar = makeSkyline('#6b3a78', '', 70, 190, false);
  const skylineNear = makeSkyline('#2a1838', '#ffd36e', 90, 250, true);
  const orbSprite = makeOrb();
  const shotTailSprite = makeShotTail();

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
  let state = 'ready';  // 'ready' | 'playing' | 'over' | 'victory'
  let phase = 'climb';  // (saat 'playing') 'climb' = memanjat, 'boss' = arena boss
  let H = 700;
  let dpr = 1;
  let scale = 1;
  let T = 0;            // waktu (ms) untuk animasi

  let platforms = [];
  let debris = [];
  let fx = [];          // partikel & gelombang kejut (ledakan, percikan)
  let shots = [];       // proyektil boss
  let boss = null;
  let vic = null;       // data animasi kemenangan
  let crawlTex = null;  // tekstur teks Star Wars
  let platAlpha = 1;    // transparansi global pijakan (memudar saat menang)
  let shake = 0;        // getaran layar
  let chainY = 0;       // posisi y pijakan utama paling atas
  let heightPx = 0;
  let score = 0;
  let levelNow = 0;
  let overAt = 0;
  let best = 0;
  try { best = parseInt(localStorage.getItem('skyjump-best'), 10) || 0; } catch (e) { /* abaikan */ }

  const banner = { text: '', sub: '', age: 999 };
  const BANNER_DUR = 150; // frame

  // Mode uji: tambahkan ?level=2 (1-4) di URL untuk langsung mulai dari level tertentu,
  // atau ?level=boss untuk langsung mendekati pertarungan boss.
  const dbgParam = new URLSearchParams(window.location.search).get('level');
  const dbgLevel = parseInt(dbgParam, 10);
  const START_SCORE = dbgParam === 'boss' ? BOSS_SCORE - 60
    : (dbgLevel >= 1 && dbgLevel <= 4 ? LEVEL_START_SCORE[dbgLevel - 1] : 0);

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
   *  PIJAKAN, PER & GENERATOR
   *  Hitbox mengikuti BENTUK permukaan tiap pijakan (kubah ubur-ubur, gumpalan awan,
   *  piringan UFO), bukan kotak kasar: kaki dicek di 3 titik (kiri, tengah, kanan).
   * ========================================================= */
  const springH = () => (baked.spring ? baked.spring.h : 34);
  const bossH = () => (baked.boss ? baked.boss.h : BOSS_W * 0.78);

  // skor "setara" untuk posisi y tertentu di layar (dipakai menentukan level pijakan baru)
  const altitudeScore = (y) => (heightPx + H / 2 - y) / SCORE_DIVISOR;

  // Turunnya permukaan dari garis p.y pada posisi relatif u (0..1); null = di luar bentuk pijakan
  function profileOff(p, u) {
    switch (p.skin) {
      case 'jelly': {
        const t = (2 * u - 1) * (JELLY_W / 2) / 36;           // kubah: elips rx=36, ry=16
        return Math.abs(t) > 0.92 ? null : 16 * (1 - Math.sqrt(1 - t * t));
      }
      case 'cloud':
        return CLOUD_PROFILE[Math.round(u * CLOUD_W)];
      case 'space': {
        if (p.type === 'moving') {                            // UFO: piringan elips rx=35, ry=8
          const t = (u * SPACE_W - 36) / 35;
          return Math.abs(t) > 0.95 ? null : 8 * (1 - Math.sqrt(1 - t * t));
        }
        return u < 0.04 || u > 0.96 ? null : 0;               // meteor: permukaan atas hampir rata
      }
      default:
        return u < 0.02 || u > 0.98 ? null : 0;               // tanah: rata
    }
  }

  // y permukaan pijakan di x dunia tertentu (memperhitungkan wrap-around layar), null jika di luar
  function surfaceY(p, sx) {
    for (let k = -1; k <= 1; k++) {
      const u = (sx + k * W - p.x) / p.w;
      if (u >= 0 && u <= 1) {
        const off = profileOff(p, u);
        if (off !== null && off !== undefined) return p.y + off;
      }
    }
    return null;
  }

  // permukaan tertinggi di bawah kaki (3 titik sampel), null jika kaki tidak menyentuh bentuk pijakan
  function topUnderFeet(p, cx) {
    let best = null;
    for (let i = -1; i <= 1; i++) {
      const y = surfaceY(p, cx + i * FOOT_HALF);
      if (y !== null && (best === null || y < best)) best = y;
    }
    return best;
  }

  // apakah salah satu titik kaki berada di rentang [a, b] (termasuk wrap-around)
  function feetIn(cx, a, b) {
    for (let i = -1; i <= 1; i++) {
      const x = cx + i * FOOT_HALF;
      if ((x >= a && x <= b) || (x - W >= a && x - W <= b) || (x + W >= a && x + W <= b)) return true;
    }
    return false;
  }

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
      skin: r.skin,
      variant: (Math.random() * 3) | 0,
      ph: rand(0, TAU),
      vx: 0,
      fade: 1,
      spring: null,
    };
    p.x = x === undefined ? pickX(y, p.w) : x;
    if (type === 'moving') p.vx = (Math.random() < 0.5 ? -1 : 1) * rand(r.speed[0], r.speed[1]);
    return p;
  }

  // Satu "baris": 1 pijakan utama (selalu bisa dijangkau) + kadang 1 pijakan sekali-injak sebagai tambahan
  function addRow(y, gapBelow) {
    const lvl = levelAt(altitudeScore(y));
    const r = LEVEL_RULES[lvl];
    const p = makePlatform(lvl, Math.random() < r.moving ? 'moving' : 'static', y);
    platforms.push(p);
    if (p.type === 'static' && Math.random() < r.spring) {
      // di awan, per ditaruh di bagian tengah yang paling tinggi (bukan di gumpalan pinggir)
      p.spring = { ox: p.skin === 'cloud' ? rand(26, 30) : rand(6, p.w - SPRING_W - 6), anim: 0 };
    }
    if (Math.random() < r.cracked) {
      platforms.push(makePlatform(lvl, 'cracked', y + gapBelow * rand(0.35, 0.65)));
    }
  }

  function fillPlatformsUpTo(limitY) {
    if (phase !== 'climb') return;
    while (chainY > limitY) {
      const lvl = levelAt(altitudeScore(chainY));
      const r = LEVEL_RULES[lvl];
      const gap = rand(r.gap[0], r.gap[1]);
      chainY -= gap;
      addRow(chainY, gap);
    }
  }

  function spawnDebris(p) {
    let cols;
    let round = false;
    if (p.skin === 'jelly') { cols = ['#d7faff', '#9fe6ff', '#ffffff']; round = true; }
    else if (p.skin === 'cloud') { cols = ['#59607a', '#7b8399', '#9aa2b8']; round = true; }
    else if (p.skin === 'space') cols = ['#9a90a6', '#6a6076', '#ffb74d'];
    else cols = ['#8a5a34', '#6b4223', '#5fa83a'];
    for (let i = 0; i < 8; i++) {
      debris.push({
        x: p.x + rand(0, p.w), y: p.y + rand(0, 10),
        vx: rand(-1.8, 1.8), vy: rand(-3, 0.5),
        rot: rand(0, TAU), vr: rand(-0.25, 0.25),
        s: rand(3, 7), c: cols[i % 3], round,
      });
    }
    if (debris.length > 60) debris.splice(0, debris.length - 60);
  }

  /* =========================================================
   *  PARTIKEL (percikan, ledakan)
   * ========================================================= */
  function burst(x, y, n, colors, speed, life, size) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.25, 1) * speed;
      fx.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life, max: life, size: rand(size * 0.5, size), col: colors[i % colors.length], ring: false,
      });
    }
    if (fx.length > 320) fx.splice(0, fx.length - 320);
  }

  function ring(x, y, vr, life, col) {
    fx.push({ x, y, r: 4, vr, life, max: life, col, ring: true });
  }

  function updateFx(dt) {
    let n = 0;
    for (let i = 0; i < fx.length; i++) {
      const p = fx[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.ring) {
        p.r += p.vr * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.97, dt);
        p.vy = p.vy * Math.pow(0.97, dt) + 0.04 * dt;
      }
      fx[n++] = p;
    }
    fx.length = n;
  }

  /* =========================================================
   *  RESET / START / GAME OVER
   * ========================================================= */
  function showBanner(text, sub) {
    banner.text = text;
    banner.sub = sub;
    banner.age = 0;
  }

  function reset() {
    stopAudio(bgmBoss);
    stopAudio(bgmWin);
    phase = 'climb';
    boss = null;
    vic = null;
    shots = [];
    fx = [];
    platAlpha = 1;
    shake = 0;

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
    showBanner('LEVEL ' + (levelNow + 1), LEVEL_NAMES[levelNow]);
    onBounce(1);
  }

  function restartGame() {
    reset();
    startGame();
  }

  function saveBest() {
    if (score > best) {
      best = score;
      try { localStorage.setItem('skyjump-best', String(best)); } catch (e) { /* abaikan */ }
    }
  }

  function gameOver(cause) {
    state = 'over';
    player.sprite = 'lose';
    stopAudio(bgmBoss);
    play(sfxFall);
    saveBest();
    overTitleEl.textContent = cause === 'hit' ? 'Yahh Kena Serang!' : 'Yahh Jatuh!';
    finalScoreEl.textContent = score;
    bestScoreEl.textContent = best;
    overScreen.classList.remove('hidden');
    overAt = performance.now();
  }

  /* =========================================================
   *  FINAL BOSS
   * ========================================================= */
  function enterBoss() {
    phase = 'boss';
    heightPx = BOSS_HEIGHT;       // kamera berhenti naik
    score = BOSS_SCORE;
    scoreEl.textContent = String(score);

    const bh = bossH();
    const baseY = Math.max(78, H * 0.13);
    const hitTop = baseY + bh * BOSS_HIT_TOP;
    // Pijakan tertinggi arena: puncak loncatan dari sini (±157px) melewati kepala boss
    const topRowY = hitTop + 125;

    // Arena = hanya area layar: buang pijakan di atasnya & pijakan sekali-injak, per dilepas
    let n = 0;
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (p.type === 'cracked' || p.y < topRowY - 8) continue;
      p.spring = null;
      platforms[n++] = p;
    }
    platforms.length = n;

    let top = H - 70;
    for (const p of platforms) if (p.y < top) top = p.y;
    if (!platforms.length) {
      platforms.push(makePlatform(3, 'static', H - 70, W / 2 - LEVEL_RULES[3].width / 2));
      top = H - 70;
    }

    let guard = 0;
    while (top - 56 > topRowY && guard++ < 40) {
      top = Math.max(top - rand(60, 100), topRowY);
      addArenaRow(top);
    }
    if (top - topRowY > 8) addArenaRow(topRowY);   // pastikan ada pijakan tepat di tinggi yang bisa menjangkau boss

    boss = {
      x: W / 2 - BOSS_W / 2, y: -bh - 40, w: BOSS_W, h: bh,
      baseY, top: -bh - 40 + bh * BOSS_HIT_TOP, prevTop: -bh - 40 + bh * BOSS_HIT_TOP,
      hp: BOSS_HP, state: 'intro', t: 0, dir: Math.random() < 0.5 ? -1 : 1,
      flash: 0, invuln: 0, recoil: 0, kx: 0,
      shotTimer: 70, charge: 0, turnTimer: 60, dashTimer: 100, dash: 0, hidden: false,
    };
    shots = [];
    showBanner('BOSS FIGHT!', 'Injak kepalanya ' + BOSS_HP + 'x!');
    shake = 10;
    play(bgmBoss);
  }

  // Satu baris arena: pijakan utama + pendamping agar pemain punya cukup pijakan
  function addArenaRow(y) {
    const r = LEVEL_RULES[3];
    const w = r.width;
    const type = Math.random() < 0.2 ? 'moving' : 'static';
    const a = makePlatform(3, type, y);
    if (type === 'moving') a.vx = (Math.random() < 0.5 ? -1 : 1) * rand(0.8, 1.4);
    a.fade = 0;
    platforms.push(a);
    let x2 = a.x + W * 0.5;
    if (x2 > W - w) x2 -= W * 0.9;
    x2 = clamp(x2, 0, W - w);
    if (isFree(x2, y, w)) {
      const b = makePlatform(3, 'static', y + rand(-8, 8), x2);
      b.fade = 0;
      platforms.push(b);
    }
  }

  function hitBoss() {
    const b = boss;
    b.hp -= 1;
    b.flash = 45;
    b.invuln = BOSS_INVULN;
    b.recoil = 26;                                            // terdorong ke bawah
    const dirAway = (b.x + b.w / 2) < (player.x + player.w / 2) ? -1 : 1;
    b.kx = dirAway * 6;                                       // dan ke samping
    shake = 14;
    burst(b.x + b.w / 2, b.y + b.h * 0.3, 18, ['#ff5252', '#ffd54f', '#ffffff'], 4.2, 28, 3.4);
    ring(b.x + b.w / 2, b.y + b.h * 0.3, 4.5, 22, '#ff6b6b');
    if (b.hp <= 0) startVictory();
  }

  function fireBoss() {
    const b = boss;
    const sp = BOSS_SHOT_SPEED[b.hp];
    const ox = b.x + b.w / 2;
    const oy = b.y + b.h * 0.72;
    if (b.hp <= 2) {                                          // fase enrage: dua tembakan
      shots.push({ x: ox - b.w * 0.24, y: oy, vy: sp });
      shots.push({ x: ox + b.w * 0.24, y: oy, vy: sp });
    } else {
      shots.push({ x: ox, y: oy, vy: sp });
    }
  }

  function updateBoss(dt) {
    const b = boss;
    b.prevTop = b.top;
    b.t += dt;
    if (b.flash > 0) b.flash -= dt;
    if (b.invuln > 0) b.invuln -= dt;
    b.recoil *= Math.pow(0.9, dt);
    b.kx *= Math.pow(0.9, dt);

    if (b.state === 'intro') {
      b.y = lerp(-b.h - 40, b.baseY, smooth(b.t / BOSS_INTRO));
      if (b.t >= BOSS_INTRO) { b.state = 'fight'; b.shotTimer = 60; }
    } else if (b.state === 'fight') {
      const hp = b.hp;
      let spd = BOSS_SPEED[hp];
      if (hp <= 3) {                                          // makin tidak tertebak: berbalik arah acak
        b.turnTimer -= dt;
        if (b.turnTimer <= 0) { if (Math.random() < 0.6) b.dir = -b.dir; b.turnTimer = rand(40, 110); }
      }
      if (hp <= 2) {                                          // fase enrage: sesekali melesat
        b.dashTimer -= dt;
        if (b.dashTimer <= 0) { b.dash = 24; b.dashTimer = rand(70, 150); }
        if (b.dash > 0) { b.dash -= dt; spd *= 2; }
      }
      b.x += (b.dir * spd + b.kx) * dt;
      if (b.x < 0) { b.x = 0; b.dir = 1; b.kx = Math.abs(b.kx); }
      else if (b.x + b.w > W) { b.x = W - b.w; b.dir = -1; b.kx = -Math.abs(b.kx); }

      const lost = BOSS_HP - hp;
      const targetY = b.baseY + Math.sin(T * (0.0022 + lost * 0.0006)) * (6 + lost * 5) + b.recoil;
      b.y += (targetY - b.y) * Math.min(1, 0.25 * dt);

      if (b.charge > 0) {                                     // mengisi tenaga (peringatan) lalu menembak
        b.charge -= dt;
        if (b.charge <= 0) fireBoss();
      } else {
        b.shotTimer -= dt;
        if (b.shotTimer <= 0) { b.charge = BOSS_CHARGE; b.shotTimer = BOSS_FIRE[hp] * rand(0.85, 1.15); }
      }
    }
    b.top = b.y + b.h * BOSS_HIT_TOP;
  }

  // lingkaran (proyektil) vs kotak tubuh pemain, termasuk saat pemain "membungkus" tepi layar
  function shotHitsPlayer(s) {
    const y0 = player.y + player.h * 0.12;
    const y1 = player.y + player.h - FEET_INSET;
    for (let k = -1; k <= 1; k++) {
      const x0 = player.x + player.w * 0.27 + k * W;
      const x1 = player.x + player.w * 0.73 + k * W;
      const dx = s.x - clamp(s.x, x0, x1);
      const dy = s.y - clamp(s.y, y0, y1);
      if (dx * dx + dy * dy <= SHOT_R * SHOT_R) return true;
    }
    return false;
  }

  /* =========================================================
   *  KEMENANGAN (boss hancur -> melayang -> Star Wars crawl)
   * ========================================================= */
  function startVictory() {
    state = 'victory';
    vic = { t: 0, crawlT: -1, blasted: false, flash: 0, darkness: 0, btn: false };
    boss.state = 'dying';
    boss.flash = 0;
    shots = [];
    stopAudio(bgmBoss);
    play(bgmWin);
    player.sprite = 'jump';
    saveBest();
    if (!crawlTex) crawlTex = buildCrawlTexture();
  }

  // Teks kemenangan dirender sekali ke tekstur datar; nanti diproyeksikan dengan perspektif
  function buildCrawlTexture() {
    const CW = 330;
    const fontOf = (s) => '800 ' + s + 'px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
    const head = [
      { t: 'Yeyy Kamu Menang!', size: 30, gap: 16 },
      { t: 'Skor Akhir: ' + BOSS_SCORE, size: 24, gap: 30 },
    ];
    const body = 'Keren! Gw sebagai developer game mengapresiasi uji coba dalam menamatkan game ini dengan jerih payah dan kerja keras yang dibuat dalam game. Dukung terus untuk perkembangan gamenya atau saran dll.';
    const m = document.createElement('canvas').getContext('2d');
    m.font = fontOf(20);
    const lines = [];
    let line = '';
    for (const word of body.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (m.measureText(test).width > CW - 10 && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    let h = 16;
    for (const it of head) h += it.size * 1.25 + it.gap;
    h += lines.length * 30 + 20;
    return makeSprite(CW, Math.ceil(h), (g) => {
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillStyle = '#ffe81f';
      let y = 16;
      for (const it of head) { g.font = fontOf(it.size); g.fillText(it.t, CW / 2, y); y += it.size * 1.25 + it.gap; }
      g.font = fontOf(20);
      for (const l of lines) { g.fillText(l, CW / 2, y); y += 30; }
    });
  }

  function updateVictory(dt) {
    const v = vic;
    v.t += dt;

    // gravitasi mati: pemain melayang ke tengah, lalu naik ke atas saat crawl dimulai
    const tx = W / 2 - player.w / 2;
    const ty = v.t < VIC_FLOAT_END ? H * 0.5 - player.h / 2 + Math.sin(T * 0.003) * 7 : H * 0.085;
    player.x += (tx - player.x) * Math.min(1, 0.06 * dt);
    player.y += (ty - player.y) * Math.min(1, 0.05 * dt);
    player.vx = 0;
    player.vy = 0;
    player.sprite = 'jump';

    platAlpha = clamp(1 - v.t / 70, 0, 1);
    if (platAlpha <= 0 && platforms.length) { platforms.length = 0; debris.length = 0; }

    // ledakan boss
    const b = boss;
    if (!v.blasted) {
      if (Math.floor(v.t / 6) !== Math.floor((v.t - dt) / 6)) {   // ledakan kecil di titik acak badan boss
        const ex = b.x + rand(0.15, 0.85) * b.w;
        const ey = b.y + rand(0.1, 0.85) * b.h;
        burst(ex, ey, 14, ['#ffb300', '#ff5722', '#ffee58'], 3.4, 26, 3.6);
        ring(ex, ey, 2.4, 16, '#ffab40');
        shake = Math.max(shake, 6);
      }
      if (v.t >= VIC_EXPLODE) {                                   // ledakan besar
        v.blasted = true;
        b.hidden = true;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        burst(cx, cy, 90, ['#ffffff', '#ffd54f', '#ff7043', '#ce93d8', '#80deea'], 7.5, 60, 5);
        ring(cx, cy, 5, 50, '#ffffff');
        ring(cx, cy, 3.4, 60, '#ff9e40');
        ring(cx, cy, 2.2, 70, '#c070ff');
        v.flash = 1;
        shake = 24;
      }
    }

    // percikan bintang saat melayang
    if (v.blasted && v.t < VIC_CRAWL_START && Math.floor(v.t / 4) !== Math.floor((v.t - dt) / 4)) {
      burst(player.x + player.w / 2 + rand(-30, 30), player.y + player.h / 2 + rand(-30, 30), 1,
        ['#fff59d', '#ffffff', '#80deea'], 0.8, 40, 2.6);
    }

    updateFx(dt);
    shake *= Math.pow(0.9, dt);
    v.flash = Math.max(0, v.flash - 0.035 * dt);
    v.darkness = clamp((v.t - VIC_FLOAT_END) / 90, 0, 1) * 0.9;
    if (v.t >= VIC_CRAWL_START) {
      v.crawlT = (v.t - VIC_CRAWL_START) / 60;
      v.btn = v.crawlT >= CRAWL_BUTTON_AT;
    }
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
    else if (state === 'victory' && vic && vic.btn) restartGame();
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
   *  UPDATE (saat bermain)
   * ========================================================= */
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

    // Pijakan: bergerak, animasi per, muncul perlahan (arena boss)
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (p.type === 'moving') {
        p.x += p.vx * dt;
        if (p.x < 0) { p.x = 0; p.vx = -p.vx; }
        else if (p.x + p.w > W) { p.x = W - p.w; p.vx = -p.vx; }
      }
      if (p.spring && p.spring.anim > 0) p.spring.anim = Math.max(0, p.spring.anim - 0.07 * dt);
      if (p.fade < 1) p.fade = Math.min(1, p.fade + 0.03 * dt);
    }

    if (boss) updateBoss(dt);

    // Tabrakan: hanya saat jatuh. Dipilih permukaan TERTINGGI yang dilintasi kaki.
    if (player.vy > 0) {
      const pcx = player.x + player.w / 2;
      const feetPrev = prevY + player.h - FEET_INSET;
      const feet = player.y + player.h - FEET_INSET;
      let bestY = Infinity;
      let bestP = null;
      let kind = 0; // 1 = per, 2 = pijakan, 3 = boss

      for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        if (p.spring) {                                       // pad per lebih tinggi dari pijakan
          const top = p.y - springH() + 3;
          const sx = p.x + p.spring.ox;
          if (top < bestY && feetPrev <= top + 0.01 && feet >= top && feetIn(pcx, sx + 2, sx + SPRING_W - 2)) {
            bestY = top; bestP = p; kind = 1;
          }
        }
        const ty = topUnderFeet(p, pcx);
        if (ty !== null && ty < bestY && feetPrev <= ty + 0.01 && feet >= ty) {
          bestY = ty; bestP = p; kind = 2;
        }
      }

      if (boss && boss.state === 'fight') {                   // injak kepala boss (velocity Y > 0)
        const bt = boss.top;
        if (bt < bestY && feetPrev <= boss.prevTop + 0.5 && feet >= bt &&
            feetIn(pcx, boss.x + boss.w * BOSS_HIT_X0, boss.x + boss.w * BOSS_HIT_X1)) {
          bestY = bt; kind = 3;
        }
      }

      if (kind) {
        player.y = bestY - player.h + FEET_INSET;
        if (kind === 1) {
          bestP.spring.anim = 1;
          onBounce(SPRING_BOOST);
        } else if (kind === 2) {
          onBounce(1);
          if (bestP.type === 'cracked') {                     // memantul, lalu pijakan langsung hancur
            spawnDebris(bestP);
            platforms.splice(platforms.indexOf(bestP), 1);
          }
        } else {
          onBounce(BOSS_BOUNCE);                              // pantulan tinggi
          if (boss.invuln <= 0) hitBoss();
        }
      }
    }
    if (state !== 'playing') return; // boss baru saja hancur -> mode kemenangan

    // Timer sprite loncat
    if (player.jumpTimer > 0) {
      player.jumpTimer -= dt;
      if (player.jumpTimer <= 0) player.sprite = 'normal';
    }

    if (phase === 'climb') {
      // Kamera: lewat batas tengah layar -> geser semua ke bawah + tambah skor (berhenti di skor 6000)
      const limit = H / 2;
      if (player.y < limit) {
        const d = Math.min(limit - player.y, BOSS_HEIGHT - heightPx);
        if (d > 0) {
          player.y += d;
          for (let i = 0; i < platforms.length; i++) platforms[i].y += d;
          for (let i = 0; i < debris.length; i++) debris[i].y += d;
          chainY += d;
          heightPx += d;
          const newScore = Math.floor(heightPx / SCORE_DIVISOR);
          if (newScore !== score) {
            score = newScore;
            scoreEl.textContent = String(score);
            const lvl = levelAt(score);
            if (lvl > levelNow) { levelNow = lvl; showBanner('LEVEL ' + (lvl + 1), LEVEL_NAMES[lvl]); }
          }
        }
        if (heightPx >= BOSS_HEIGHT) enterBoss();
      }
    } else if (player.y < 0) {                                // arena boss: atap layar
      player.y = 0;
      if (player.vy < 0) player.vy = 0.5;
    }

    // Hapus pijakan di bawah layar, generate yang baru di atas (hanya saat memanjat)
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

    // Proyektil boss: lurus ke bawah, kena = Game Over
    let k = 0;
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      s.y += s.vy * dt;
      if (shotHitsPlayer(s)) { gameOver('hit'); return; }
      if (s.y < H + 24) shots[k++] = s;
    }
    shots.length = k;

    updateFx(dt);
    shake *= Math.pow(0.9, dt);
    if (banner.age < BANNER_DUR) banner.age += dt;

    // Game over: karakter jatuh melewati batas bawah layar
    if (player.y > H) gameOver('fall');
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

    drawCloudLayer(bgCloudPink, 5, w * 0.85, cam, t);

    ctx.globalAlpha = w;
    ctx.drawImage(skylineFar.c, 0, H - skylineFar.h + sink * 0.6, skylineFar.w, skylineFar.h);
    ctx.drawImage(skylineNear.c, 0, H - skylineNear.h + sink, skylineNear.w, skylineNear.h);
  }

  /* ----- Level 3: langit cerah + matahari (foto couple) ----- */
  function drawDaySky(w, cam, t) {
    // awan latar dibuat pucat agar pijakan awan tebal tetap menonjol
    drawCloudLayer(bgCloudWhite, clouds.length, w * 0.55, cam, t);

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
   *  RENDER: PIJAKAN, PER, BOSS, KARAKTER, HUD
   * ========================================================= */
  // Pijakan tanah dari gambar (Level 2). Bila gambar belum dimuat: pijakan tanah sederhana dari Canvas.
  function drawEarthFallback(p) {
    ctx.fillStyle = '#7a4a28';
    rrect(ctx, p.x, p.y, p.w, 16, 6);
    ctx.fill();
    ctx.fillStyle = '#5fcf6a';
    rrect(ctx, p.x, p.y - 2, p.w, 7, 4);
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

  function drawJelly(p, t) {
    const ghost = p.type === 'cracked';
    const spr = ghost ? jellyGhostSprite : jellyBellSprite;
    const top = p.y - spr.surf;
    const y0 = top + 19;
    // tentakel melambai halus (digambar lebih dulu agar keluar dari bawah kubah)
    ctx.lineCap = 'round';
    ctx.strokeStyle = ghost ? 'rgba(205,246,255,0.6)' : 'rgba(228,120,222,0.92)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const x0 = p.x + p.w * (0.16 + i * 0.17);
      const ph = t * 0.004 + p.ph + i * 1.1;
      const s1 = Math.sin(ph) * 4;
      const s2 = Math.sin(ph + 1.3) * 6;
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0 + s1, y0 + 7, x0 + s2, y0 + 12, x0 + s1 * 0.8, y0 + 17 + (i % 2) * 5);
    }
    ctx.stroke();
    ctx.drawImage(spr.c, p.x, top, spr.w, spr.h);
  }

  function drawCloudPlat(p) {
    const spr = p.type === 'cracked' ? cloudDarkSprite : cloudWhiteSprite;
    ctx.drawImage(spr.c, p.x, p.y - spr.surf, spr.w, spr.h);
  }

  function drawSpacePlatform(p, t) {
    let spr;
    if (p.type === 'moving') spr = ufoSprite;
    else if (p.type === 'cracked') spr = crackedMeteorSprites[p.variant];
    else spr = meteorSprites[p.variant];
    ctx.drawImage(spr.c, p.x, p.y - spr.surf, spr.w, spr.h);

    if (p.type === 'moving') { // lampu UFO berkedip
      const ly = p.y + 8;
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = Math.sin(t * 0.006 + i * 1.3) > 0 ? '#ffee58' : '#ff7043';
        ctx.beginPath();
        ctx.arc(p.x + 12 + i * 12, ly, 2.2, 0, TAU);
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
      rrect(ctx, x, bottom - dh, SPRING_W, 9, 4);
      ctx.fill();
    }
  }

  function drawPlatforms(t) {
    if (platAlpha <= 0) return;
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      const a = p.fade * platAlpha;
      if (a < 1) ctx.globalAlpha = a;
      if (p.skin === 'jelly') drawJelly(p, t);
      else if (p.skin === 'cloud') drawCloudPlat(p);
      else if (p.skin === 'space') drawSpacePlatform(p, t);
      else drawEarth(p);
      if (p.spring) drawSpring(p);
      if (a < 1) ctx.globalAlpha = 1;
    }
  }

  function drawDebris() {
    for (let i = 0; i < debris.length; i++) {
      const b = debris[i];
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.c;
      if (b.round) { ctx.beginPath(); ctx.arc(0, 0, b.s / 2 + 0.5, 0, TAU); ctx.fill(); }
      else ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s);
      ctx.restore();
    }
  }

  // Gurita cadangan (bila boss.png belum dimuat)
  function drawBossFallback(b, dx, dy) {
    const x = b.x + dx;
    const y = b.y + dy;
    ctx.strokeStyle = '#4b2a8a';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const sx = x + b.w * (0.2 + i * 0.12);
      const sway = Math.sin(T * 0.004 + i) * 6;
      ctx.beginPath();
      ctx.moveTo(sx, y + b.h * 0.55);
      ctx.bezierCurveTo(sx + sway, y + b.h * 0.75, sx - sway, y + b.h * 0.9, sx + sway * 0.6, y + b.h);
      ctx.stroke();
    }
    ctx.fillStyle = '#6a3fa0';
    ctx.beginPath(); ctx.ellipse(x + b.w / 2, y + b.h * 0.38, b.w * 0.3, b.h * 0.34, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff4081';
    ctx.beginPath(); ctx.arc(x + b.w / 2, y + b.h * 0.3, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#80deea';
    ctx.beginPath(); ctx.arc(x + b.w / 2, y + b.h * 0.3, 3.4, 0, TAU); ctx.fill();
  }

  function drawBoss(t) {
    const b = boss;
    if (!b || b.hidden) return;
    let dx = 0;
    let dy = 0;
    if (b.state === 'dying') { dx = rand(-4, 4); dy = rand(-3, 3); }

    // aura ungu yang berdenyut agar boss terlihat jelas di latar gelap
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.005);
    const ax = b.x + b.w / 2 + dx;
    const ay = b.y + b.h * 0.45 + dy;
    const aura = ctx.createRadialGradient(ax, ay, 6, ax, ay, b.w * (0.85 + pulse * 0.1));
    aura.addColorStop(0, b.hp <= 2 ? 'rgba(255,60,90,0.38)' : 'rgba(170,70,255,0.32)');
    aura.addColorStop(1, 'rgba(170,70,255,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(ax - b.w, ay - b.w, b.w * 2, b.w * 2);

    const spr = baked.boss;
    if (spr) {
      if (b.state === 'fight' && b.invuln > 0 && Math.floor(b.invuln / 4) % 2 === 0) ctx.globalAlpha = 0.75;
      ctx.drawImage(spr.c, b.x + dx, b.y + dy, b.w, b.h);
      ctx.globalAlpha = 1;
      let flashSpr = null;
      let fa = 0;
      if (b.state === 'dying') {                                  // berkedip merah/putih saat meledak
        flashSpr = Math.floor(vic.t / 3) % 2 ? baked.bossWhite : baked.bossRed;
        fa = 0.8;
      } else if (b.flash > 0) {                                   // berkedip merah saat terinjak
        flashSpr = baked.bossRed;
        fa = Math.floor(b.flash / 4) % 2 === 0 ? 0.9 : 0.25;
      }
      if (flashSpr) {
        ctx.globalAlpha = fa;
        ctx.drawImage(flashSpr.c, b.x + dx, b.y + dy, b.w, b.h);
        ctx.globalAlpha = 1;
      }
    } else {
      drawBossFallback(b, dx, dy);
    }

    // peringatan: bola energi membesar di mulut sebelum menembak
    if (b.charge > 0) {
      const k = 1 - b.charge / BOSS_CHARGE;
      const s = 8 + k * 22;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(orbSprite.c, b.x + b.w / 2 - s / 2, b.y + b.h * 0.72 - s / 2, s, s);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawShots() {
    if (!shots.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      ctx.drawImage(shotTailSprite.c, s.x - 7, s.y - 36, 14, 40);
      ctx.drawImage(orbSprite.c, s.x - 11, s.y - 11, 22, 22);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFx() {
    if (!fx.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < fx.length; i++) {
      const p = fx[i];
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      if (p.ring) {
        ctx.strokeStyle = p.col;
        ctx.lineWidth = 2 + a * 5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
      } else {
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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
    if (state !== 'victory') {
      if (player.x < 0) drawPlayerAt(W);
      if (player.x + player.w > W) drawPlayerAt(-W);
    }
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

  function drawHud(t) {
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    // label level / BOSS di pojok kanan atas
    ctx.textAlign = 'right';
    ctx.font = '800 15px ' + FONT;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.fillStyle = '#fff';
    const label = phase === 'boss' ? 'BOSS' : 'LV ' + (levelAt(score) + 1) + ' · ' + LEVEL_NAMES[levelAt(score)];
    ctx.strokeText(label, W - 14, 30);
    ctx.fillText(label, W - 14, 30);

    // bar HP boss (5 kotak) di tengah atas
    if (boss && boss.state !== 'dying' && boss.state !== 'intro') {
      const pw = 18;
      const gap = 5;
      const total = BOSS_HP * pw + (BOSS_HP - 1) * gap;
      const x0 = W / 2 - total / 2;
      for (let i = 0; i < BOSS_HP; i++) {
        const full = i < boss.hp;
        ctx.fillStyle = full ? '#ff4d6d' : 'rgba(0,0,0,0.45)';
        rrect(ctx, x0 + i * (pw + gap), 16, pw, 10, 4);
        ctx.fill();
        ctx.strokeStyle = full ? '#ffd0d8' : 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // banner saat level baru / boss dimulai
    if (banner.age < BANNER_DUR) {
      const a = clamp(Math.min(banner.age / 18, (BANNER_DUR - banner.age) / 30), 0, 1);
      const slide = (1 - smooth(banner.age / 18)) * 18;
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '900 38px ' + FONT;
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.fillStyle = phase === 'boss' ? '#ff6b81' : '#ffe36e';
      ctx.strokeText(banner.text, W / 2, H * 0.4 + slide);
      ctx.fillText(banner.text, W / 2, H * 0.4 + slide);
      ctx.font = '800 20px ' + FONT;
      ctx.lineWidth = 5;
      ctx.fillStyle = '#fff';
      ctx.strokeText(banner.sub, W / 2, H * 0.4 + 34 + slide);
      ctx.fillText(banner.sub, W / 2, H * 0.4 + 34 + slide);
      ctx.globalAlpha = 1;
    }
  }

  // Vinyet merah berdenyut saat boss dalam fase enrage
  function drawEnrageVignette(t) {
    const a = 0.16 + 0.1 * Math.sin(t * 0.008);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, 'rgba(255,0,40,0)');
    g.addColorStop(1, 'rgba(255,0,40,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ----- Star Wars crawl: teks datar diproyeksikan dengan perspektif, per irisan 2px ----- */
  function drawCrawl(ct) {
    const tex = crawlTex;
    const th = tex.h;
    const yh = H * 0.15;                 // titik hilang di atas-tengah
    const dyB = H - yh;                  // jarak horizon -> tepi bawah layar
    const zTop = 1 + CRAWL_SPEED * ct;   // kedalaman tepi atas teks (tepi bawah layar = 1)
    const step = 2;
    for (let y = yh + dyB * 0.05; y < H; y += step) {
      const dy1 = y - yh;
      const z1 = dyB / dy1;
      const z2 = dyB / (dy1 + step);
      const r1 = (zTop - z1) * dyB;      // baris tekstur (satuan logis) di tepi atas irisan
      const r2 = (zTop - z2) * dyB;      // ... di tepi bawah irisan
      if (r2 <= 0 || r1 >= th) continue;
      const a = smooth(dy1 / dyB / 0.3); // memudar mendekati horizon
      if (a <= 0.01) continue;
      const s0 = Math.max(0, r1);
      const s1 = Math.min(th, r2);
      if (s1 <= s0) continue;
      const dw = tex.w / z1;             // makin jauh makin sempit
      ctx.globalAlpha = a;
      ctx.drawImage(tex.c, 0, s0 * SPRITE_SCALE, tex.c.width, (s1 - s0) * SPRITE_SCALE, W / 2 - dw / 2, y, dw, step + 0.6);
    }
    ctx.globalAlpha = 1;
  }

  function drawVictoryOverlay(t) {
    const v = vic;
    if (v.darkness > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + v.darkness.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (v.crawlT >= 0 && crawlTex) drawCrawl(v.crawlT);
    if (v.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + v.flash.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (v.btn) {                                                // tombol "Tap untuk Main Lagi"
      const k = smooth((v.crawlT - CRAWL_BUTTON_AT) / 0.8);
      const pulse = 1 + 0.05 * Math.sin(t * 0.006);
      const bw = 230;
      const bh = 50;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(W / 2, H - 78);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#d4558a';
      rrect(ctx, -bw / 2, -bh / 2 + 5, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = '#ff7eb6';
      rrect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 20px ' + FONT;
      ctx.fillText('Tap untuk Main Lagi', 0, 0);
      ctx.restore();
    }
  }

  function render(t) {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    if (shake > 0.3) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    drawBackground(t);
    drawPlatforms(t);
    drawDebris();
    drawBoss(t);
    drawShots();
    drawPlayer();
    drawFx();
    if (boss && boss.state === 'fight' && boss.hp <= 2 && state === 'playing') drawEnrageVignette(t);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0); // HUD tidak ikut bergetar
    if (state === 'victory' && vic) drawVictoryOverlay(t);
    else drawControlHints();
    drawHud(t);
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
    else if (state === 'victory') updateVictory(dt);
    else if (state === 'ready') { syncPlayerSize(); placeOnStartPlatform(); }

    if (banner.age < BANNER_DUR && state === 'victory') banner.age = BANNER_DUR;
    render(T);
    requestAnimationFrame(frame);
  }

  // Musik jeda saat tab disembunyikan, lanjut saat kembali
  document.addEventListener('visibilitychange', () => {
    last = performance.now();
    if (document.hidden) {
      bgmBoss.pause();
      bgmWin.pause();
    } else if (state === 'playing' && phase === 'boss' && boss && boss.state !== 'dying') {
      const p = bgmBoss.play();
      if (p && p.catch) p.catch(() => {});
    } else if (state === 'victory') {
      const p = bgmWin.play();
      if (p && p.catch) p.catch(() => {});
    }
  });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));

  resize();
  reset();
  requestAnimationFrame(frame);
})();