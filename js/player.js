/* THE LAST KEY — 플레이어 이동, 중력, 충돌 판정 */
(function () {
  'use strict';
  var TLK = window.TLK;
  var C = TLK.C;
  var T = C.TILE;
  var EPS = 0.001;

  function Player() {
    this.w = C.PLAYER_W;
    this.h = C.PLAYER_H;
    this.reset(0, 0);
  }

  Player.prototype.reset = function (x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.coyote = 0;
    this.facing = 1;
    this.anim = 0;
    this.landT = 0;
    this.hidden = false;
  };

  /** 타일 (c, r) 위에 서 있도록 배치 */
  Player.prototype.placeAtTile = function (c, r) {
    this.reset(c * T + (T - this.w) / 2, (r + 1) * T - this.h);
  };

  Player.prototype.getState = function () {
    return { x: this.x, y: this.y, vx: this.vx, vy: this.vy, f: this.facing };
  };

  Player.prototype.setState = function (s) {
    this.x = s.x;
    this.y = s.y;
    this.vx = s.vx;
    this.vy = s.vy;
    this.facing = s.f;
    this.onGround = false;
    this.coyote = 0;
  };

  Player.prototype.canJump = function () {
    return this.onGround || this.coyote > 0;
  };

  Player.prototype.jump = function () {
    this.vy = C.JUMP_V;
    this.onGround = false;
    this.coyote = 0;
  };

  Player.prototype.overlapsSolid = function (level, x, y) {
    var c0 = Math.floor(x / T);
    var c1 = Math.floor((x + this.w - EPS) / T);
    var r0 = Math.floor(y / T);
    var r1 = Math.floor((y + this.h - EPS) / T);
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        if (level.isSolid(c, r)) return true;
      }
    }
    return false;
  };

  Player.prototype.moveX = function (dx, level) {
    if (dx === 0) return false;
    this.x += dx;
    if (!this.overlapsSolid(level, this.x, this.y)) return false;
    if (dx > 0) {
      var c = Math.floor((this.x + this.w - EPS) / T);
      this.x = c * T - this.w;
    } else {
      var c2 = Math.floor(this.x / T);
      this.x = (c2 + 1) * T;
    }
    this.vx = 0;
    return true;
  };

  Player.prototype.moveY = function (dy, level) {
    if (dy === 0) return 0;
    this.y += dy;
    if (!this.overlapsSolid(level, this.x, this.y)) return 0;
    if (dy > 0) {
      var r = Math.floor((this.y + this.h - EPS) / T);
      this.y = r * T - this.h;
      this.vy = 0;
      return 1; // 착지
    }
    var r2 = Math.floor(this.y / T);
    this.y = (r2 + 1) * T;
    this.vy = 0;
    return -1; // 천장에 부딪힘
  };

  /** 지금 위치가 벽과 겹치면 위로 밀어 올린다 (되감기 직후 등) */
  Player.prototype.unstick = function (level) {
    var tries = 0;
    while (this.overlapsSolid(level, this.x, this.y) && tries < 48) {
      this.y -= 1;
      tries++;
    }
  };

  /**
   * dir: -1 / 0 / 1 (현재 누르고 있는 이동 키)
   * 반환: { landed, bumped }
   */
  Player.prototype.update = function (dir, level) {
    if (dir !== 0) {
      this.facing = dir;
      var target = dir * C.RUN_SPEED;
      var acc = this.onGround ? C.ACCEL_GROUND : C.ACCEL_AIR;
      if (this.vx < target) this.vx = Math.min(target, this.vx + acc);
      else if (this.vx > target) this.vx = Math.max(target, this.vx - acc);
    } else if (this.onGround) {
      // 땅에서는 손을 떼면 멈춘다. 공중에서는 관성이 유지된다.
      if (this.vx > 0) this.vx = Math.max(0, this.vx - C.FRICTION);
      else if (this.vx < 0) this.vx = Math.min(0, this.vx + C.FRICTION);
    }

    this.vy = Math.min(C.MAX_FALL, this.vy + C.GRAVITY);

    this.moveX(this.vx, level);

    var wasGround = this.onGround;
    var yres = this.moveY(this.vy, level);
    this.onGround = yres === 1;

    if (this.onGround) this.coyote = C.COYOTE;
    else if (this.coyote > 0) this.coyote--;

    if (Math.abs(this.vx) > 0.2 && this.onGround) this.anim++;
    else this.anim = 0;

    var landed = !wasGround && this.onGround;
    if (landed) this.landT = 6;
    else if (this.landT > 0) this.landT--;

    return { landed: landed, bumped: yres === -1 };
  };

  Player.prototype.overlapsBox = function (bx, by, bw, bh) {
    return this.x < bx + bw && this.x + this.w > bx && this.y < by + bh && this.y + this.h > by;
  };

  Player.prototype.overlapsTile = function (c, r, extraUp) {
    var up = extraUp || 0;
    return this.overlapsBox(c * T, (r - up) * T, T, T * (1 + up));
  };

  Player.prototype.touchesSpike = function (level) {
    var c0 = Math.floor(this.x / T);
    var c1 = Math.floor((this.x + this.w - EPS) / T);
    var r0 = Math.floor(this.y / T);
    var r1 = Math.floor((this.y + this.h - EPS) / T);
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        if (level.isSpike(c, r) && this.overlapsBox(c * T + 2, r * T + 9, 12, 7)) return true;
      }
    }
    return false;
  };

  Player.prototype.inZone = function (level) {
    var c0 = Math.floor(this.x / T);
    var c1 = Math.floor((this.x + this.w - EPS) / T);
    var r0 = Math.floor(this.y / T);
    var r1 = Math.floor((this.y + this.h - EPS) / T);
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        if (level.isZone(c, r)) return true;
      }
    }
    return false;
  };

  Player.prototype.cx = function () {
    return this.x + this.w / 2;
  };

  Player.prototype.cy = function () {
    return this.y + this.h / 2;
  };

  TLK.Player = Player;
})();
