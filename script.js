(() => {
  'use strict';

  /* =========================================================
   *  KONFIGURASI (ubah angka di sini untuk mengatur rasa game)
   * ========================================================= */
  const WORLD_W = 400;          // lebar dunia logis (tinggi mengikuti rasio layar)
  const GRAVITY = 0.42;         // percepatan jatuh (per frame @60fps)
  const JUMP_VELOCITY = -11.5;  // kecepatan loncat ke atas
  const MOVE_SPEED = 5.4;       // kecepatan gerak horizontal maksimum
  const MOVE_SMOOTH = 0.28;     // 0..1, makin besar makin responsif
  const PLAYER_W = 56;          // lebar karakter
  const HITBOX_W_RATIO = 0.55;  // lebar hitbox kaki relatif lebar karakter
  const FEET_INSET = 4;         // px area transparan di bawah foto yang diabaikan
  const PLATFORM_W = 72;
  const PLATFORM_H = 14;
  const JUMP_SPRITE_TIME = 14;  // lama sprite "loncat" tampil (satuan frame)
  const SCORE_DIVISOR = 10;     // 10 px ketinggian = 1 poin
  const RESTART_DELAY = 600;    // ms, cegah tap tak sengaja langsung restart

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

  /* =========================================================
   *  STATE
   * ========================================================= */
  let state = 'ready'; // 'ready' | 'playing' | 'over'
  let W = WORLD_W;
  let H = 700;
  let dpr = 1;
  let scale = 1;

  let platforms = [];
  let clouds = [];
  let heightPx = 0;
  let score = 0;
  let overAt = 0;
  let best = 0;
  try { best = parseInt(localStorage.getItem('skyjump-best'), 10) || 0; } catch (e) { /* abaikan */ }

  const player = {
    x: 0, y: 0, vx: 0, vy: 0,
    w: PLAYER_W, h: PLAYER_W,
    sprite: 'normal',
    jumpTimer: 0,
  };

  /* =========================================================
   *  UTIL
   * ========================================================= */
  const rand = (a, b) => a + Math.random() * (b - a);
  const difficulty = () => Math.min(score / 1500, 1); // 0..1

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
    W = WORLD_W;
    H = ch / scale;
    if (state === 'ready') reset();
  }

  /* =========================================================
   *  PLATFORM
   * ========================================================= */
  function randGap() {
    const d = difficulty();
    // jarak maksimum (~128) tetap di bawah tinggi loncat (~157) agar selalu bisa dijangkau
    return rand(55 + d * 20, 90 + d * 38);
  }

  function makePlatform(x, y, type) {
    const d = difficulty();
    return {
      x, y, w: PLATFORM_W, h: PLATFORM_H, type,
      vx: type === 'moving' ? (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.8 + d * 1.2) : 0,
    };
  }

  function spawnPlatformAt(y) {
    const moving = Math.random() < 0.15 + difficulty() * 0.35;
    return makePlatform(rand(0, W - PLATFORM_W), y, moving ? 'moving' : 'static');
  }

  function highestPlatformY() {
    let min = Infinity;
    for (const p of platforms) if (p.y < min) min = p.y;
    return min;
  }

  /* =========================================================
   *  RESET / START / GAME OVER
   * ========================================================= */
  function reset() {
    heightPx = 0;
    score = 0;
    scoreEl.textContent = '0';

    platforms = [];
    const baseY = H - 70;
    platforms.push(makePlatform(W / 2 - PLATFORM_W / 2, baseY, 'static'));
    let y = baseY;
    while (y > -80) {
      y -= randGap();
      platforms.push(spawnPlatformAt(y));
    }

    clouds = [];
    for (let i = 0; i < 6; i++) {
      clouds.push({ x: rand(0, W), y: rand(0, H), s: rand(0.6, 1.4), v: rand(0.08, 0.25) });
    }

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

  function onBounce() {
    player.vy = JUMP_VELOCITY;
    player.sprite = 'jump';
    player.jumpTimer = JUMP_SPRITE_TIME;
    play(sfxJump);
  }

  function startGame() {
    state = 'playing';
    startScreen.classList.add('hidden');
    overScreen.classList.add('hidden');
    onBounce();
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

    // Platform bergerak
    for (const p of platforms) {
      if (p.type !== 'moving') continue;
      p.x += p.vx * dt;
      if (p.x < 0) { p.x = 0; p.vx = -p.vx; }
      else if (p.x + p.w > W) { p.x = W - p.w; p.vx = -p.vx; }
    }

    // Tabrakan: hanya saat jatuh, kaki melintasi sisi atas platform
    if (player.vy > 0) {
      const hbW = player.w * HITBOX_W_RATIO;
      const left = player.x + (player.w - hbW) / 2;
      const right = left + hbW;
      const feetPrev = prevY + player.h - FEET_INSET;
      const feet = player.y + player.h - FEET_INSET;
      for (const p of platforms) {
        if (right > p.x && left < p.x + p.w && feetPrev <= p.y + 0.01 && feet >= p.y) {
          player.y = p.y - player.h + FEET_INSET;
          onBounce();
          break;
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
      for (const p of platforms) p.y += d;
      for (const c of clouds) c.y += d * 0.35;
      heightPx += d;
      const newScore = Math.floor(heightPx / SCORE_DIVISOR);
      if (newScore !== score) {
        score = newScore;
        scoreEl.textContent = score;
      }
    }

    // Hapus platform di bawah layar, generate baru di atas
    platforms = platforms.filter((p) => p.y < H + 30);
    let top = highestPlatformY();
    while (top > -80) {
      top -= randGap();
      platforms.push(spawnPlatformAt(top));
    }

    // Awan melayang
    for (const c of clouds) {
      c.x += c.v * dt;
      if (c.x - 80 * c.s > W) c.x = -80 * c.s;
      if (c.y - 40 * c.s > H) { c.y = -40 * c.s; c.x = rand(0, W); }
    }

    // Game over: karakter jatuh melewati batas bawah layar
    if (player.y > H) gameOver();
  }

  /* =========================================================
   *  RENDER
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

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#6ec6ff');
    g.addColorStop(0.6, '#a8e0ff');
    g.addColorStop(1, '#ffe9f3');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Matahari lucu
    const sx = W - 60;
    const sy = 70;
    const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, 70);
    glow.addColorStop(0, 'rgba(255, 240, 150, 0.9)');
    glow.addColorStop(1, 'rgba(255, 240, 150, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - 80, sy - 80, 160, 160);
    ctx.fillStyle = '#ffe36e';
    ctx.beginPath();
    ctx.arc(sx, sy, 26, 0, Math.PI * 2);
    ctx.fill();

    // Awan
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    for (const c of clouds) {
      const s = c.s;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 22 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 24 * s, c.y - 10 * s, 28 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 52 * s, c.y, 22 * s, 0, Math.PI * 2);
      ctx.arc(c.x + 26 * s, c.y + 8 * s, 24 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlatforms() {
    for (const p of platforms) {
      const moving = p.type === 'moving';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      roundRectPath(p.x, p.y + 3, p.w, p.h, 7);
      ctx.fill();
      ctx.fillStyle = moving ? '#ff9a62' : '#5fcf6a';
      roundRectPath(p.x, p.y, p.w, p.h, 7);
      ctx.fill();
      ctx.fillStyle = moving ? '#ffc58f' : '#9aec84';
      roundRectPath(p.x + 3, p.y + 2, p.w - 6, 4, 2);
      ctx.fill();
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
      ctx.arc(player.x + offsetX + player.w / 2, player.y + player.h / 2, player.w / 2, 0, Math.PI * 2);
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

  function render() {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    drawBackground();
    drawPlatforms();
    drawPlayer();
    drawControlHints();
  }

  /* =========================================================
   *  GAME LOOP
   * ========================================================= */
  let last = performance.now();

  function frame(now) {
    const dt = Math.min((now - last) / 16.667, 2.5); // normalisasi ke 60fps, batasi lonjakan
    last = now;

    if (state === 'playing') update(dt);
    else if (state === 'ready') { syncPlayerSize(); placeOnStartPlatform(); }

    render();
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));

  resize();
  reset();
  requestAnimationFrame(frame);
})();