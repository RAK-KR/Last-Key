/* THE LAST KEY — 맵 파싱, 타일 충돌, 스테이지 오브젝트 상태 */
(function () {
  'use strict';
  var TLK = window.TLK;
  var C = TLK.C;

  function Level(stage) {
    this.stage = stage;
    this.cols = C.COLS;
    this.rows = C.ROWS;
    this.grid = [];
    this.zone = {};
    this.hasZone = false;
    this.signal = false;

    this.pickups = [];
    this.orbs = [];
    this.levers = [];
    this.doors = [];
    this.doorAt = {};
    this.checkpoints = [];
    this.stations = [];
    this.lockers = [];
    this.exits = [];
    this.spawn = { c: 1, r: 1 };

    this.parse(stage.map);
  }

  Level.prototype.parse = function (map) {
    if (map.length !== this.rows) throw new Error('맵 행 수 오류: ' + map.length);
    for (var r = 0; r < this.rows; r++) {
      var line = map[r];
      if (line.length !== this.cols) throw new Error('맵 열 수 오류 (행 ' + r + '): ' + line.length);
      var row = [];
      for (var c = 0; c < this.cols; c++) {
        var ch = line.charAt(c);
        var cell = '.';
        switch (ch) {
          case '#':
          case '^':
          case 'D':
          case 'B':
          case 'G':
            cell = ch;
            break;
          case 'Z':
            this.zone[r * this.cols + c] = true;
            this.hasZone = true;
            break;
          case 'P':
            this.spawn = { c: c, r: r };
            break;
          case 'X':
            this.exits.push({ c: c, r: r });
            break;
          case 'C':
            this.checkpoints.push({ c: c, r: r, active: false });
            break;
          case 'K':
            this.stations.push({ c: c, r: r, type: 'restore', uses: 1 });
            break;
          case 'Y':
            this.stations.push({ c: c, r: r, type: 'altar', uses: 1 });
            break;
          case 'T':
            this.lockers.push({ c: c, r: r, opened: false, key: this.stage.locker.key, action: this.stage.locker.action });
            break;
          case 'L':
            this.levers.push({ c: c, r: r, used: false });
            break;
          case 'O':
            this.orbs.push({ c: c, r: r, on: false });
            break;
          default:
            if (ch >= '1' && ch <= '9') {
              var def = this.stage.pickups[ch];
              if (!def) throw new Error('키캡 정의 없음: ' + ch);
              this.pickups.push({ c: c, r: r, key: def.key, action: def.action, taken: false });
            }
        }
        row.push(cell);
      }
      this.grid.push(row);
    }
    this.groupDoors();
  };

  Level.prototype.groupDoors = function () {
    var self = this;
    for (var r = 0; r < this.rows; r++) {
      for (var c = 0; c < this.cols; c++) {
        if (this.grid[r][c] !== 'D' || this.doorAt[r * this.cols + c] !== undefined) continue;
        var door = { tiles: [], open: false };
        var idx = this.doors.length;
        var stack = [[c, r]];
        while (stack.length) {
          var p = stack.pop();
          var k = p[1] * this.cols + p[0];
          if (p[0] < 0 || p[1] < 0 || p[0] >= this.cols || p[1] >= this.rows) continue;
          if (self.grid[p[1]][p[0]] !== 'D' || self.doorAt[k] !== undefined) continue;
          self.doorAt[k] = idx;
          door.tiles.push({ c: p[0], r: p[1] });
          stack.push([p[0] + 1, p[1]], [p[0] - 1, p[1]], [p[0], p[1] + 1], [p[0], p[1] - 1]);
        }
        this.doors.push(door);
      }
    }
  };

  Level.prototype.tile = function (c, r) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return '#';
    return this.grid[r][c];
  };

  Level.prototype.isSolid = function (c, r) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    var ch = this.grid[r][c];
    switch (ch) {
      case '#':
        return true;
      case 'D':
        return !this.doors[this.doorAt[r * this.cols + c]].open;
      case 'B':
        return this.signal;
      case 'G':
        return !this.signal;
    }
    return false;
  };

  /** 벽처럼 고정된 타일인지 (렌더 캐시용) */
  Level.prototype.isStaticWall = function (c, r) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.grid[r][c] === '#';
  };

  Level.prototype.isSpike = function (c, r) {
    return this.tile(c, r) === '^';
  };

  Level.prototype.isZone = function (c, r) {
    return !!this.zone[r * this.cols + c];
  };

  Level.prototype.getState = function () {
    return {
      signal: this.signal,
      pickups: this.pickups.map(function (o) { return o.taken; }),
      orbs: this.orbs.map(function (o) { return o.on; }),
      levers: this.levers.map(function (o) { return o.used; }),
      doors: this.doors.map(function (o) { return o.open; }),
      checkpoints: this.checkpoints.map(function (o) { return o.active; }),
      stations: this.stations.map(function (o) { return o.uses; }),
      lockers: this.lockers.map(function (o) { return o.opened; })
    };
  };

  Level.prototype.setState = function (s) {
    this.signal = !!s.signal;
    var apply = function (arr, vals, field) {
      if (!vals) return;
      for (var i = 0; i < arr.length && i < vals.length; i++) arr[i][field] = vals[i];
    };
    apply(this.pickups, s.pickups, 'taken');
    apply(this.orbs, s.orbs, 'on');
    apply(this.levers, s.levers, 'used');
    apply(this.doors, s.doors, 'open');
    apply(this.checkpoints, s.checkpoints, 'active');
    apply(this.stations, s.stations, 'uses');
    apply(this.lockers, s.lockers, 'opened');
  };

  TLK.Level = Level;
})();
