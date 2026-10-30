/* THE LAST KEY — 캔버스 렌더링 (픽셀 아트, 조명, 파티클)
 * 외부 이미지 없이 모든 오브젝트를 fillRect 로 직접 그린다.
 */
(function () {
  'use strict';
  var TLK = window.TLK;
  var C = TLK.C;
  var T = C.TILE;
  var W = C.W;
  var H = C.H;

  var PALETTES = [
    { bg: '#0c0d10', wall: '#1d1f24', edge: '#3a3d45', dot: '#15161a', side: '#17181c' },
    { bg: '#0b0c0e', wall: '#1c1d21', edge: '#363840', dot: '#141518', side: '#16171a' },
    { bg: '#0a0a0c', wall: '#1b1b1e', edge: '#33343a', dot: '#131315', side: '#151517' },
    { bg: '#09090a', wall: '#1b1a1b', edge: '#353035', dot: '#121112', side: '#141314' },
    { bg: '#080606', wall: '#1d1716', edge: '#3d2c28', dot: '#120d0c', side: '#150f0e' }
  ];

  var COL = {
    pale: '#e8e4da',
    paleShade: '#a9a396',
    amber: '#ffb000',
    amberDim: '#6b4d10',
    red: '#ff4a3d',
    white: '#fff4d6',
    ink: '#0a0a0a'
  };

  function hash(c, r) {
    var h = (c * 374761393 + r * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return (h ^ (h >>> 16)) >>> 0;
  }

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.light = document.createElement('canvas');
    this.light.width = W / 2;
    this.light.height = H / 2;
    this.lctx = this.light.getContext('2d');

    this.cache = document.createElement('canvas');
    this.cache.width = W;
    this.cache.height = H;
    this.cctx = this.cache.getContext('2d');

    this.level = null;
    this.stage = null;
    this.pal = PALETTES[0];
    this.coreBox = null;

    this.particles = [];
    this.floaters = [];
    this.shakeT = 0;
    this.shakeMag = 0;
    this.shakeEnabled = true;
    this.rewindT = 0;
    this.t = 0;

    this.motes = [];
    for (var i = 0; i < 46; i++) {
      this.motes.push({ x: Math.random() * W, y: Math.random() * H, s: 0.05 + Math.random() * 0.15, a: 0.15 + Math.random() * 0.35 });
    }
  }

  // ------------------------------------------------------------------
  // 레벨 캐시
  // ------------------------------------------------------------------
  Renderer.prototype.setLevel = function (level, stage) {
    this.level = level;
    this.stage = stage;
    this.pal = PALETTES[Math.max(0, Math.min(PALETTES.length - 1, stage.id - 1))];
    this.coreBox = null;
    if (level.hasZone) {
      var minC = 99, maxC = -1, minR = 99, maxR = -1;
      for (var r = 0; r < level.rows; r++) {
        for (var c = 0; c < level.cols; c++) {
          if (level.isZone(c, r)) {
            minC = Math.min(minC, c);
            maxC = Math.max(maxC, c);
            minR = Math.min(minR, r);
            maxR = Math.max(maxR, r);
          }
        }
      }
      this.coreBox = { x: minC * T, y: minR * T, w: (maxC - minC + 1) * T, h: (maxR - minR + 1) * T };
    }
    this.buildCache();
  };

  Renderer.prototype.buildCache = function () {
    var ctx = this.cctx;
    var lv = this.level;
    var pal = this.pal;
    ctx.clearRect(0, 0, W, H);
    for (var r = 0; r < lv.rows; r++) {
      for (var c = 0; c < lv.cols; c++) {
        var ch = lv.tile(c, r);
        var x = c * T;
        var y = r * T;
        if (ch === '#') {
          ctx.fillStyle = pal.wall;
          ctx.fillRect(x, y, T, T);
          var h = hash(c, r);
          ctx.fillStyle = pal.dot;
          ctx.fillRect(x + (h % 13) + 1, y + ((h >>> 4) % 13) + 1, 2, 1);
          ctx.fillRect(x + ((h >>> 8) % 12) + 2, y + ((h >>> 12) % 12) + 2, 1, 1);
          if (!lv.isStaticWall(c, r - 1)) {
            ctx.fillStyle = pal.edge;
            ctx.fillRect(x, y, T, 1);
            ctx.fillStyle = pal.side;
            ctx.fillRect(x, y + 1, T, 1);
          }
          if (!lv.isStaticWall(c - 1, r)) {
            ctx.fillStyle = pal.side;
            ctx.fillRect(x, y, 1, T);
          }
          if (!lv.isStaticWall(c + 1, r)) {
            ctx.fillStyle = pal.side;
            ctx.fillRect(x + T - 1, y, 1, T);
          }
        } else if (ch === '^') {
          this.drawSpikes(ctx, x, y);
        }
      }
    }
  };

  Renderer.prototype.drawSpikes = function (ctx, x, y) {
    for (var s = 0; s < 3; s++) {
      var bx = x + 1 + s * 5;
      for (var k = 0; k < 7; k++) {
        var w = 1 + Math.floor((k * 4) / 6);
        ctx.fillStyle = k < 2 ? '#c24236' : '#b9b3a6';
        ctx.fillRect(bx + Math.floor((5 - w) / 2), y + 9 + k, w, 1);
      }
    }
  };

  // ------------------------------------------------------------------
  // 효과
  // ------------------------------------------------------------------
  Renderer.prototype.clearFx = function () {
    this.particles = [];
    this.floaters = [];
    this.rewindT = 0;
    this.shakeT = 0;
  };

  Renderer.prototype.shake = function (mag, frames) {
    if (!this.shakeEnabled) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, frames);
  };

  Renderer.prototype.addParticle = function (x, y, vx, vy, life, color, size, grav) {
    this.particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, color: color, size: size || 1, grav: grav === undefined ? 0.08 : grav });
  };

  Renderer.prototype.burst = function (x, y, n, colors) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 0.5 + Math.random() * 2.2;
      this.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 1, 30 + Math.random() * 30, colors[i % colors.length], Math.random() < 0.3 ? 2 : 1);
    }
  };

  Renderer.prototype.sparkle = function (x, y) {
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2;
      this.addParticle(x, y, Math.cos(a) * 1.2, Math.sin(a) * 1.2 - 0.6, 24 + Math.random() * 20, i % 2 ? COL.amber : COL.white, 1, 0.02);
    }
  };

  Renderer.prototype.dust = function (x, y) {
    for (var i = 0; i < 4; i++) {
      this.addParticle(x + (Math.random() - 0.5) * 8, y - 1, (Math.random() - 0.5) * 0.8, -Math.random() * 0.4, 14, '#5a5c63', 1, 0.02);
    }
  };

  Renderer.prototype.doorFx = function (door) {
    var self = this;
    door.tiles.forEach(function (t) {
      for (var i = 0; i < 8; i++) {
        self.addParticle(t.c * T + Math.random() * T, t.r * T + Math.random() * T, (Math.random() - 0.5) * 0.6, -Math.random() * 0.6, 30 + Math.random() * 20, i % 2 ? '#6b5a3a' : '#3b3326', 1, 0.05);
      }
    });
    this.shake(2, 10);
  };

  Renderer.prototype.rewindFx = function (from, to) {
    this.rewindT = 26;
    var fx = from.cx ? from.cx() : from.x;
    var fy = from.cy ? from.cy() : from.y;
    var tx = to.x + C.PLAYER_W / 2;
    var ty = to.y + C.PLAYER_H / 2;
    for (var i = 0; i < 24; i++) {
      var k = i / 23;
      this.addParticle(fx + (tx - fx) * k, fy + (ty - fy) * k, 0, 0, 10 + i, COL.amber, 1, 0);
    }
  };

  /** 키 소모 연출: 플레이어 머리 위로 키캡이 떠올라 부서진다 */
  Renderer.prototype.keyBreak = function (player, id) {
    this.floaters.push({ id: id, x: player.cx(), y: player.y - 8, t: 0 });
  };

  /** 고정 스텝마다 호출 (파티클 등 시간 기반 연출) */
  Renderer.prototype.tick = function () {
    this.t++;
    if (this.shakeT > 0) this.shakeT--;
    else this.shakeMag = 0;
    if (this.rewindT > 0) this.rewindT--;

    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.vy += p.grav;
      p.x += p.vx;
      p.y += p.vy;
      if (--p.life <= 0) this.particles.splice(i, 1);
    }

    for (var j = this.floaters.length - 1; j >= 0; j--) {
      var f = this.floaters[j];
      f.t++;
      f.y -= 0.5;
      if (f.t === 20) {
        for (var k = 0; k < 10; k++) {
          var a = Math.random() * Math.PI * 2;
          this.addParticle(f.x, f.y + 4, Math.cos(a) * 1.4, Math.sin(a) * 1.4 - 0.8, 26 + Math.random() * 14, k % 3 ? COL.red : COL.pale, Math.random() < 0.4 ? 2 : 1, 0.1);
        }
        this.floaters.splice(j, 1);
      }
    }

    for (var m = 0; m < this.motes.length; m++) {
      var mo = this.motes[m];
      mo.y -= mo.s;
      mo.x += Math.sin((this.t + m * 40) * 0.01) * 0.05;
      if (mo.y < -2) {
        mo.y = H + 2;
        mo.x = Math.random() * W;
      }
    }

    // 출구 주변 빛 입자
    if (this.level && this.t % 9 === 0) {
      for (var e = 0; e < this.level.exits.length; e++) {
        var ex = this.level.exits[e];
        this.addParticle(ex.c * T + 3 + Math.random() * 10, (ex.r + 1) * T - 2, 0, -0.3 - Math.random() * 0.3, 40, Math.random() < 0.5 ? COL.white : COL.amber, 1, -0.002);
      }
    }
  };

  // ------------------------------------------------------------------
  // 그리기
  // ------------------------------------------------------------------
  Renderer.prototype.render = function (game) {
    var ctx = this.ctx;
    var lv = this.level;
    if (!lv) return;
    var state = game.state;
    var title = state === 'title';
    var t = this.t;
    var lights = [];

    ctx.save();
    if (this.shakeT > 0 && this.shakeMag > 0) {
      ctx.translate(Math.round((Math.random() - 0.5) * 2 * this.shakeMag), Math.round((Math.random() - 0.5) * 2 * this.shakeMag));
    }

    ctx.fillStyle = this.pal.bg;
    ctx.fillRect(-8, -8, W + 16, H + 16);

    // 배경 격자 점
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (var gy = 8; gy < H; gy += 16) {
      for (var gx = 8; gx < W; gx += 16) ctx.fillRect(gx, gy, 1, 1);
    }
    for (var m = 0; m < this.motes.length; m++) {
      var mo = this.motes[m];
      ctx.fillStyle = 'rgba(232,228,218,' + mo.a * 0.5 + ')';
      ctx.fillRect(Math.round(mo.x), Math.round(mo.y), 1, 1);
    }

    ctx.drawImage(this.cache, 0, 0);

    this.drawDynamicTiles(ctx, lv);
    this.drawObjects(ctx, lv, game, lights);

    if (!title) {
      if (state === 'play' && game.keys.hasAvailable('rewind') && game.history.length > 1) this.drawGhost(ctx, game);
      if (!game.player.hidden) {
        this.drawPlayer(ctx, game.player, 1);
        lights.push({ x: game.player.cx(), y: game.player.cy(), r: this.stage.lightRadius, i: 1 });
      }
    } else {
      lights.push({ x: W / 2, y: 40, r: 220, i: 0.6 });
    }

    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.4));
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    this.drawLighting(ctx, game, lights);

    if (!title) {
      this.drawHeldKeys(ctx, game);
      this.drawFloaters(ctx);
      if (state === 'play') this.drawPrompts(ctx, game);
    }

    if (this.rewindT > 0) this.drawRewindOverlay(ctx);
    if (state === 'ending' && game.ending) this.drawEnding(ctx, game);

    ctx.restore();
  };

  Renderer.prototype.drawDynamicTiles = function (ctx, lv) {
    for (var r = 0; r < lv.rows; r++) {
      for (var c = 0; c < lv.cols; c++) {
        var ch = lv.grid[r][c];
        if (ch !== 'D' && ch !== 'B' && ch !== 'G') continue;
        var x = c * T;
        var y = r * T;
        if (ch === 'D') {
          var door = lv.doors[lv.doorAt[r * lv.cols + c]];
          if (!door.open) {
            ctx.fillStyle = '#2b261d';
            ctx.fillRect(x, y, T, T);
            ctx.fillStyle = '#5a4a2c';
            ctx.fillRect(x, y, T, 1);
            ctx.fillRect(x, y + T - 1, T, 1);
            ctx.fillRect(x, y, 1, T);
            ctx.fillRect(x + T - 1, y, 1, T);
            ctx.fillStyle = '#1a1712';
            ctx.fillRect(x + 3, y + 3, 10, 10);
            ctx.fillStyle = COL.amber;
            ctx.fillRect(x + 7, y + 5, 2, 3);
            ctx.fillRect(x + 7, y + 8, 2, 1);
            ctx.fillRect(x + 7, y + 9, 2, 2);
          } else {
            ctx.fillStyle = 'rgba(90,74,44,0.35)';
            ctx.fillRect(x, y, T, 1);
            ctx.fillRect(x, y + T - 1, T, 1);
          }
        } else if (ch === 'B') {
          if (lv.signal) {
            ctx.fillStyle = '#4a3f2e';
            ctx.fillRect(x, y, T, 6);
            ctx.fillStyle = '#7a6748';
            ctx.fillRect(x, y, T, 1);
            ctx.fillStyle = '#2a241a';
            ctx.fillRect(x + 7, y + 1, 1, 5);
            ctx.fillRect(x + 15, y + 1, 1, 5);
          } else {
            ctx.fillStyle = 'rgba(122,103,72,0.35)';
            for (var d = 0; d < T; d += 4) ctx.fillRect(x + d, y, 2, 1);
          }
        } else if (ch === 'G') {
          if (!lv.signal) {
            ctx.fillStyle = '#5c5a54';
            ctx.fillRect(x + 2, y, 2, T);
            ctx.fillRect(x + 7, y, 2, T);
            ctx.fillRect(x + 12, y, 2, T);
            ctx.fillStyle = '#8a877e';
            ctx.fillRect(x + 2, y, 2, 1);
            ctx.fillRect(x + 7, y, 2, 1);
            ctx.fillRect(x + 12, y, 2, 1);
          } else {
            ctx.fillStyle = 'rgba(92,90,84,0.4)';
            ctx.fillRect(x + 2, y, 2, 2);
            ctx.fillRect(x + 7, y, 2, 2);
            ctx.fillRect(x + 12, y, 2, 2);
          }
        }
      }
    }
  };

  Renderer.prototype.drawObjects = function (ctx, lv, game, lights) {
    var t = this.t;
    var font = TLK.PixelFont;
    var i, o, x, y;

    // 출구
    for (i = 0; i < lv.exits.length; i++) {
      o = lv.exits[i];
      x = o.c * T;
      y = (o.r - 1) * T;
      var fl = 0.75 + Math.sin(t * 0.08) * 0.15;
      ctx.fillStyle = 'rgba(255,244,214,' + 0.12 * fl + ')';
      ctx.fillRect(x + 2, y + 2, 12, 30);
      ctx.fillStyle = 'rgba(255,244,214,' + fl + ')';
      ctx.fillRect(x + 1, y + 1, 14, 1);
      ctx.fillRect(x + 1, y + 1, 1, 31);
      ctx.fillRect(x + 14, y + 1, 1, 31);
      ctx.fillStyle = 'rgba(255,176,0,0.55)';
      for (var s = 0; s < 4; s++) {
        var sy = y + 30 - ((t * 0.6 + s * 8) % 28);
        ctx.fillRect(x + 4 + s * 2, Math.round(sy), 1, 3);
      }
      lights.push({ x: x + 8, y: y + 16, r: 70, i: 0.9 });
    }

    // 체크포인트
    for (i = 0; i < lv.checkpoints.length; i++) {
      o = lv.checkpoints[i];
      x = o.c * T;
      y = o.r * T;
      ctx.fillStyle = '#4a4c52';
      ctx.fillRect(x + 7, y + 1, 1, 15);
      ctx.fillRect(x + 5, y + 15, 5, 1);
      if (o.active) {
        var wave = Math.round(Math.sin(t * 0.15));
        ctx.fillStyle = COL.amber;
        ctx.fillRect(x + 8, y + 1, 5, 3 + wave);
        ctx.fillRect(x + 8, y + 1, 4, 4);
        lights.push({ x: x + 9, y: y + 4, r: 34, i: 0.6 });
      } else {
        ctx.fillStyle = '#55575e';
        ctx.fillRect(x + 8, y + 1, 4, 3);
      }
    }

    // 복구 장치 / 제단
    for (i = 0; i < lv.stations.length; i++) {
      o = lv.stations[i];
      x = o.c * T;
      y = o.r * T;
      var live = o.uses > 0;
      if (o.type === 'restore') {
        ctx.fillStyle = '#34363b';
        ctx.fillRect(x + 1, y + 12, 14, 4);
        ctx.fillStyle = '#26282c';
        ctx.fillRect(x + 4, y + 8, 8, 4);
        var bob = live ? Math.round(Math.sin(t * 0.07) * 1.5) : 0;
        ctx.fillStyle = live ? COL.amber : '#3c3e43';
        ctx.fillRect(x + 7, y + 1 + bob, 2, 6);
        ctx.fillRect(x + 5, y + 3 + bob, 6, 2);
        if (live) lights.push({ x: x + 8, y: y + 5, r: 40, i: 0.75 });
      } else {
        ctx.fillStyle = '#3a2a26';
        ctx.fillRect(x + 1, y + 13, 14, 3);
        ctx.fillStyle = '#2c201d';
        ctx.fillRect(x + 3, y + 9, 10, 4);
        ctx.fillStyle = '#4a3530';
        ctx.fillRect(x + 2, y + 9, 12, 1);
        if (live) {
          for (var fx = 0; fx < 4; fx++) {
            var fh = 2 + ((t * 0.3 + fx * 7) % 4) | 0;
            ctx.fillStyle = fx % 2 ? COL.red : COL.amber;
            ctx.fillRect(x + 4 + fx * 2, y + 9 - fh, 2, fh);
          }
          lights.push({ x: x + 8, y: y + 6, r: 40, i: 0.75 });
        } else {
          ctx.fillStyle = '#3d3d3d';
          ctx.fillRect(x + 5, y + 8, 6, 1);
        }
      }
    }

    // 키 보관함
    for (i = 0; i < lv.lockers.length; i++) {
      o = lv.lockers[i];
      x = o.c * T;
      y = o.r * T;
      ctx.fillStyle = '#3b3326';
      ctx.fillRect(x + 2, y + 6, 12, 10);
      ctx.fillStyle = '#6b5a3a';
      ctx.fillRect(x + 2, y + 6, 12, 1);
      ctx.fillRect(x + 2, y + 6, 1, 10);
      ctx.fillRect(x + 13, y + 6, 1, 10);
      if (o.opened) {
        ctx.fillStyle = '#0d0b08';
        ctx.fillRect(x + 4, y + 8, 8, 7);
        ctx.fillStyle = '#6b5a3a';
        ctx.fillRect(x + 2, y + 1, 12, 2);
      } else {
        ctx.fillStyle = '#6b5a3a';
        ctx.fillRect(x + 2, y + 4, 12, 2);
        font.draw(ctx, o.key, x + 8, y + 8, 1, COL.amber, 'center');
        lights.push({ x: x + 8, y: y + 10, r: 26, i: 0.5 });
      }
    }

    // 레버
    for (i = 0; i < lv.levers.length; i++) {
      o = lv.levers[i];
      x = o.c * T;
      y = o.r * T;
      ctx.fillStyle = '#4a4c52';
      ctx.fillRect(x + 4, y + 13, 8, 3);
      var dir = o.used ? 1 : -1;
      ctx.fillStyle = '#8a877e';
      for (var k = 0; k < 6; k++) ctx.fillRect(x + 7 + dir * Math.round(k * 0.6), y + 12 - k, 2, 1);
      ctx.fillStyle = o.used ? '#5a5a5a' : COL.amber;
      ctx.fillRect(x + 6 + dir * 4, y + 5, 3, 3);
      if (!o.used) lights.push({ x: x + 8, y: y + 8, r: 22, i: 0.4 });
    }

    // 빛 구슬
    for (i = 0; i < lv.orbs.length; i++) {
      o = lv.orbs[i];
      x = o.c * T;
      y = o.r * T;
      ctx.fillStyle = o.on ? COL.white : COL.amberDim;
      ctx.fillRect(x + 6, y + 4, 4, 8);
      ctx.fillRect(x + 4, y + 6, 8, 4);
      ctx.fillRect(x + 5, y + 5, 6, 6);
      if (o.on) {
        ctx.fillStyle = COL.amber;
        ctx.fillRect(x + 7, y + 7, 2, 2);
        lights.push({ x: x + 8, y: y + 8, r: 48 + Math.sin(t * 0.1) * 4, i: 0.9 });
      } else {
        ctx.fillStyle = COL.amber;
        ctx.fillRect(x + 7, y + 6, 2, 1);
        lights.push({ x: x + 8, y: y + 8, r: 26, i: 0.6 });
      }
    }

    // 떨어진 키캡
    for (i = 0; i < lv.pickups.length; i++) {
      o = lv.pickups[i];
      if (o.taken) continue;
      x = o.c * T;
      y = o.r * T + Math.round(Math.sin(t * 0.08 + i) * 1.5);
      this.drawKeycap(ctx, x + 2, y + 1, o.key, false);
      lights.push({ x: x + 8, y: y + 8, r: 34, i: 0.85 });
    }

    // 코어
    if (this.coreBox) {
      var cb = this.coreBox;
      var cx = cb.x + cb.w / 2;
      var cy = cb.y + cb.h / 2 + 4;
      var pulse = 0.6 + Math.sin(t * 0.05) * 0.2;
      var bright = game.state === 'ending' && game.ending && game.ending.type === 'unlock' ? Math.min(1, game.ending.t / 120) : 0;
      ctx.fillStyle = 'rgba(255,176,0,' + (0.08 + bright * 0.2) + ')';
      ctx.fillRect(cb.x, cb.y, cb.w, cb.h);
      ctx.fillStyle = 'rgba(255,176,0,' + pulse + ')';
      // 열쇠 구멍
      ctx.fillRect(cx - 5, cy - 20, 10, 2);
      ctx.fillRect(cx - 7, cy - 18, 14, 8);
      ctx.fillRect(cx - 5, cy - 10, 10, 2);
      ctx.fillRect(cx - 3, cy - 8, 6, 14);
      ctx.fillRect(cx - 5, cy + 6, 10, 2);
      ctx.fillStyle = bright > 0 ? 'rgba(255,244,214,' + bright + ')' : '#0a0806';
      ctx.fillRect(cx - 3, cy - 16, 6, 4);
      ctx.fillRect(cx - 1, cy - 12, 2, 14);
      lights.push({ x: cx, y: cy - 6, r: 110 + bright * 200, i: 0.9 });
    }
  };

  Renderer.prototype.drawKeycap = function (ctx, x, y, label, burning) {
    var w = label.length > 1 ? TLK.PixelFont.width(label, 1) + 6 : 12;
    ctx.fillStyle = burning ? COL.red : COL.pale;
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = burning ? '#7a1d16' : COL.paleShade;
    ctx.fillRect(x, y + 10, w, 2);
    ctx.fillStyle = burning ? '#ff8a7f' : '#fffaf0';
    ctx.fillRect(x, y, w, 1);
    TLK.PixelFont.draw(ctx, label, x + w / 2, y + 2, 1, COL.ink, 'center');
    return w;
  };

  Renderer.prototype.drawPlayer = function (ctx, p, alpha) {
    var x = Math.round(p.x);
    var y = Math.round(p.y);
    var squash = p.landT > 3 ? 1 : 0;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = COL.pale;
    ctx.fillRect(x + 2, y + squash, 6, 1);
    ctx.fillRect(x + 1, y + 1 + squash, 8, 10 - squash);
    ctx.fillRect(x, y + 3 + squash, 10, 6 - squash);
    ctx.fillStyle = COL.paleShade;
    ctx.fillRect(x + 1, y + 10, 8, 1);
    ctx.fillRect(p.facing > 0 ? x : x + 9, y + 4 + squash, 1, 4);
    // 눈
    ctx.fillStyle = COL.ink;
    var ex = p.facing > 0 ? x + 5 : x + 2;
    ctx.fillRect(ex, y + 4 + squash, 1, 2);
    ctx.fillRect(ex + 2, y + 4 + squash, 1, 2);
    // 다리
    ctx.fillStyle = COL.paleShade;
    var step = p.anim ? Math.floor(p.anim / 6) % 2 : -1;
    if (!p.onGround && step < 0) {
      ctx.fillRect(x + 2, y + 11, 2, 2);
      ctx.fillRect(x + 6, y + 11, 2, 3);
    } else if (step === 0) {
      ctx.fillRect(x + 2, y + 11, 2, 3);
      ctx.fillRect(x + 6, y + 11, 2, 2);
    } else if (step === 1) {
      ctx.fillRect(x + 2, y + 11, 2, 2);
      ctx.fillRect(x + 6, y + 11, 2, 3);
    } else {
      ctx.fillRect(x + 2, y + 11, 2, 3);
      ctx.fillRect(x + 6, y + 11, 2, 3);
    }
    ctx.globalAlpha = 1;
  };

  /** R 을 눌렀을 때 돌아갈 위치 (3초 전) 를 반투명 윤곽선으로 보여준다 */
  Renderer.prototype.drawGhost = function (ctx, game) {
    var hist = game.history;
    var g = hist[0];
    var p = game.player;
    if (Math.abs(g.x - p.x) < 2 && Math.abs(g.y - p.y) < 2) return;
    var x = Math.round(g.x);
    var y = Math.round(g.y);
    var a = 0.35 + Math.sin(this.t * 0.12) * 0.12;
    ctx.fillStyle = 'rgba(255,176,0,' + a + ')';
    ctx.fillRect(x + 1, y, 8, 1);
    ctx.fillRect(x + 1, y + 13, 8, 1);
    ctx.fillRect(x, y + 1, 1, 12);
    ctx.fillRect(x + 9, y + 1, 1, 12);
    ctx.fillStyle = 'rgba(255,176,0,' + a * 0.4 + ')';
    for (var i = 0; i < hist.length; i += 15) {
      ctx.fillRect(Math.round(hist[i].x + 5), Math.round(hist[i].y + 7), 1, 1);
    }
    TLK.PixelFont.draw(ctx, 'R', x + 5, y - 9, 1, 'rgba(255,176,0,' + (a + 0.2) + ')', 'center');
  };

  /** 지금 누르고 있는 키(이미 사용된 키)를 머리 위에 작게 표시 */
  Renderer.prototype.drawHeldKeys = function (ctx, game) {
    if (game.player.hidden || game.state === 'ending') return;
    var active = game.keys.list('active', false);
    if (!active.length) return;
    var x = game.player.cx();
    var y = Math.round(game.player.y) - 15;
    var widths = active.map(function (k) {
      return k.id.length > 1 ? TLK.PixelFont.width(k.id, 1) + 6 : 12;
    });
    var total = widths.reduce(function (a, b) { return a + b + 2; }, -2);
    var sx = Math.round(x - total / 2);
    for (var i = 0; i < active.length; i++) {
      this.drawKeycap(ctx, sx, y + ((this.t >> 2) % 2), active[i].id, true);
      sx += widths[i] + 2;
    }
  };

  Renderer.prototype.drawFloaters = function (ctx) {
    for (var i = 0; i < this.floaters.length; i++) {
      var f = this.floaters[i];
      if (f.t < 6 && f.t % 2) continue;
      var w = f.id.length > 1 ? TLK.PixelFont.width(f.id, 1) + 6 : 12;
      ctx.globalAlpha = 1 - f.t / 26;
      this.drawKeycap(ctx, Math.round(f.x - w / 2), Math.round(f.y - 16), f.id, f.t > 8);
      ctx.globalAlpha = 1;
    }
  };

  Renderer.prototype.drawPrompts = function (ctx, game) {
    var bob = Math.round(Math.sin(this.t * 0.1));
    var target = game.interactTarget;
    if (target) {
      var keyId = null;
      var list = game.keys.list('available', true);
      for (var i = 0; i < list.length; i++) if (list[i].action === 'interact') keyId = list[i].id;
      if (keyId) {
        var tx = target.c * T + 2;
        var ty = target.r * T - 15 + bob;
        if (target.type === 'door' && target.obj.tiles.length > 1) {
          var top = Math.min.apply(null, target.obj.tiles.map(function (tt) { return tt.r; }));
          ty = top * T - 15 + bob;
        }
        this.drawKeycap(ctx, tx, ty, keyId, false);
      }
    }
    var st = game.stationHere;
    if (st && st.uses > 0) {
      var label = 'ENTER';
      var w = TLK.PixelFont.width(label, 1) + 6;
      this.drawKeycap(ctx, st.c * T + 8 - Math.round(w / 2), st.r * T - 15 + bob, label, false);
    }
  };

  Renderer.prototype.drawLighting = function (ctx, game, lights) {
    var l = this.lctx;
    var dark = this.stage ? this.stage.darkness : 0.8;
    if (game.state === 'title') dark = 0.55;
    if (game.state === 'ending' && game.ending) {
      var e = game.ending;
      if (e.type === 'unlock' || e.type === 'forward' || e.type === 'ascend') dark *= Math.max(0, 1 - e.t / 260);
    }
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, W / 2, H / 2);
    l.fillStyle = 'rgba(0,0,0,' + dark + ')';
    l.fillRect(0, 0, W / 2, H / 2);
    l.globalCompositeOperation = 'destination-out';
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      for (var k = 0; k < 4; k++) {
        var rr = (L.r * (1 - k * 0.2)) / 2;
        if (rr <= 0) continue;
        l.fillStyle = 'rgba(0,0,0,' + 0.32 * L.i + ')';
        l.beginPath();
        l.arc(Math.round(L.x / 2), Math.round(L.y / 2), Math.round(rr), 0, Math.PI * 2);
        l.fill();
      }
    }
    l.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.light, 0, 0, W, H);
  };

  Renderer.prototype.drawRewindOverlay = function (ctx) {
    var a = this.rewindT / 26;
    ctx.fillStyle = 'rgba(255,176,0,' + 0.12 * a + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,' + 0.35 * a + ')';
    for (var y = (this.t * 3) % 6; y < H; y += 6) ctx.fillRect(0, y, W, 2);
  };

  Renderer.prototype.drawEnding = function (ctx, game) {
    var e = game.ending;
    var t = e.t;
    var cb = this.coreBox || { x: 0, y: 0, w: W, h: H };
    var fade;

    if (e.type === 'forward') {
      var open = Math.min(1, t / 60);
      ctx.fillStyle = 'rgba(255,244,214,' + open + ')';
      ctx.fillRect(cb.x + cb.w, cb.y + cb.h - 32 * open, 16, 32 * open);
      fade = Math.max(0, (t - 170) / 120);
      ctx.fillStyle = 'rgba(255,244,214,' + Math.min(1, fade) + ')';
      ctx.fillRect(0, 0, W, H);
    } else if (e.type === 'ascend') {
      var beam = Math.min(1, t / 40);
      ctx.fillStyle = 'rgba(255,244,214,' + 0.25 * beam + ')';
      ctx.fillRect(Math.round(game.player.cx()) - 6, 0, 12, H);
      fade = Math.max(0, (t - 160) / 130);
      ctx.fillStyle = 'rgba(255,244,214,' + Math.min(1, fade) + ')';
      ctx.fillRect(0, 0, W, H);
    } else if (e.type === 'return') {
      fade = Math.min(1, Math.max(0, (t - 60) / 200));
      ctx.fillStyle = 'rgba(0,0,0,' + fade + ')';
      ctx.fillRect(0, 0, W, H);
    } else if (e.type === 'unlock') {
      fade = Math.max(0, (t - 200) / 110);
      ctx.fillStyle = 'rgba(255,244,214,' + Math.min(1, fade) + ')';
      ctx.fillRect(0, 0, W, H);
    } else if (e.type === 'rewind') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (var y = (t * 5) % 8; y < H; y += 8) ctx.fillRect(0, y, W, 3);
      if (t % 7 < 2) {
        var band = (t * 37) % H;
        ctx.drawImage(this.canvas, 0, band, W, 12, (Math.random() - 0.5) * 16, band, W, 12);
      }
      fade = Math.max(0, (t - 180) / 120);
      ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, fade) + ')';
      ctx.fillRect(0, 0, W, H);
    } else if (e.type === 'keep') {
      fade = Math.min(0.92, t / 280);
      ctx.fillStyle = 'rgba(0,0,0,' + fade + ')';
      ctx.fillRect(0, 0, W, H);
    } else {
      fade = Math.min(1, t / 120);
      ctx.fillStyle = 'rgba(0,0,0,' + fade + ')';
      ctx.fillRect(0, 0, W, H);
    }
  };

  TLK.Renderer = Renderer;
})();
