/* THE LAST KEY — 게임 진행 상태와 규칙
 *
 * 상태: title → intro → play ⇄ paused / station → clear → (다음 스테이지)
 *                         ↘ gameover
 *       마지막 스테이지: play → core → ending
 */
(function () {
  'use strict';
  var TLK = window.TLK;
  var C = TLK.C;
  var T = C.TILE;

  var CORE_LINES = [
    '여기가 코어입니다.',
    '이곳에서는 단 하나의 키만 가지고 나갈 수 있습니다.'
  ];

  function Game(deps) {
    this.ui = deps.ui;
    this.renderer = deps.renderer;
    this.sound = deps.sound;
    this.input = deps.input;

    this.save = TLK.Storage.load();
    this.keys = new TLK.KeySystem();
    this.player = new TLK.Player();
    this.level = null;
    this.stage = null;
    this.stageIndex = -1;

    this.state = 'boot';
    this.prevState = null;
    this.frame = 0;

    this.history = [];
    this.pendingJump = null;
    this.msg = { text: '', t: 0 };
    this.checkpointSnap = null;
    this.stageUsed = 0;
    this.stuckX = 0;
    this.stuckT = 0;
    this.hintShown = false;
    this.stationHere = null;
    this.interactTarget = null;
    this.core = null;
    this.ending = null;
    this.deathReason = null;
    this.arrowHintT = 0;

    this.keys.on(this.onKeyEvent.bind(this));
  }

  // ------------------------------------------------------------------
  // 초기화 / 저장
  // ------------------------------------------------------------------
  Game.prototype.init = function () {
    this.applySettings();
    this.goTitle();
  };

  Game.prototype.persist = function () {
    TLK.Storage.save(this.save);
  };

  Game.prototype.applySettings = function () {
    var s = this.save.settings;
    this.sound.setEnabled(s.sound);
    this.sound.setVolume(s.volume / 100);
    this.renderer.shakeEnabled = s.shake;
  };

  Game.prototype.setSetting = function (name, value) {
    this.save.settings[name] = value;
    this.applySettings();
    this.persist();
  };

  Game.prototype.resetProgress = function () {
    var settings = this.save.settings;
    this.save = TLK.Storage.defaults();
    this.save.settings = settings;
    this.persist();
  };

  // ------------------------------------------------------------------
  // 화면 전환
  // ------------------------------------------------------------------
  Game.prototype.goTitle = function () {
    this.state = 'title';
    this.stageIndex = -1;
    this.stage = TLK.STAGES[0];
    this.level = new TLK.Level(this.stage);
    this.keys.reset({ keys: {} });
    this.player.placeAtTile(this.level.spawn.c, this.level.spawn.r);
    this.player.hidden = true;
    this.resetRuntime();
    this.renderer.setLevel(this.level, this.stage);
    this.sound.stopDrone();
    this.ui.hideHud();
    this.ui.setMessage('');
    this.ui.showTitle(this.titleInfo());
  };

  Game.prototype.titleInfo = function () {
    return {
      hasContinue: !!this.save.current,
      continueStage: this.save.current ? this.save.current.stage : 0,
      unlocked: this.save.unlocked,
      endings: this.save.endings.slice()
    };
  };

  Game.prototype.newGame = function () {
    this.save.runBurnt = 0;
    this.save.current = { stage: 0, snapshot: null };
    this.persist();
    this.loadStage(0, null, false);
  };

  Game.prototype.continueGame = function () {
    var c = this.save.current;
    if (!c) return this.newGame();
    this.loadStage(Math.max(0, Math.min(TLK.STAGES.length - 1, c.stage)), c.snapshot || null, false);
  };

  Game.prototype.startStage = function (index) {
    this.loadStage(index, null, false);
  };

  Game.prototype.loadStage = function (index, snapshot, skipIntro) {
    this.stageIndex = index;
    this.stage = TLK.STAGES[index];
    this.level = new TLK.Level(this.stage);
    this.keys.reset({ keys: this.stage.keys, burnAllOthers: !!this.stage.burnAllOthers });
    this.player.placeAtTile(this.level.spawn.c, this.level.spawn.r);
    this.checkpointSnap = null;
    if (snapshot) {
      this.applySnapshot(snapshot);
      this.checkpointSnap = snapshot;
    }
    this.resetRuntime();
    this.renderer.setLevel(this.level, this.stage);
    this.sound.startDrone(this.stage.drone);

    this.save.current = { stage: index, snapshot: snapshot || null };
    this.persist();

    this.ui.setHud(this.stage, this.keys.count('available'));
    this.ui.renderKeys(this.keys);
    if (skipIntro) {
      this.state = 'play';
      this.ui.closeOverlay();
    } else {
      this.state = 'intro';
      this.ui.showIntro(this.stage, this.keys, !!snapshot);
    }
  };

  Game.prototype.resetRuntime = function () {
    this.history = [this.player.getState()];
    this.pendingJump = null;
    this.msg = { text: '', t: 0 };
    this.stuckX = this.player.x;
    this.stuckT = 0;
    this.hintShown = false;
    this.stationHere = null;
    this.interactTarget = null;
    this.core = null;
    this.ending = null;
    this.deathReason = null;
    this.stageUsed = 0;
    this.renderer.clearFx();
  };

  Game.prototype.beginPlay = function () {
    if (this.state !== 'intro') return;
    this.state = 'play';
    this.ui.closeOverlay();
    this.sound.play('select');
  };

  Game.prototype.restartStage = function () {
    this.keys.releaseAll();
    this.loadStage(this.stageIndex, null, true);
    this.sound.play('select');
  };

  Game.prototype.retryCheckpoint = function () {
    if (!this.checkpointSnap) return this.restartStage();
    this.keys.releaseAll();
    this.loadStage(this.stageIndex, this.checkpointSnap, true);
    this.sound.play('select');
  };

  Game.prototype.nextStage = function () {
    if (this.stageIndex + 1 < TLK.STAGES.length) this.loadStage(this.stageIndex + 1, null, false);
    else this.goTitle();
  };

  Game.prototype.pause = function () {
    if (this.state !== 'play' && this.state !== 'intro' && this.state !== 'core') return;
    this.prevState = this.state;
    this.state = 'paused';
    this.sound.play('pause');
    this.ui.showPause({ hasCheckpoint: !!this.checkpointSnap });
  };

  Game.prototype.resume = function () {
    if (this.state !== 'paused') return;
    this.state = this.prevState || 'play';
    this.ui.closeOverlay();
    if (this.state === 'intro') this.ui.showIntro(this.stage, this.keys, !!this.checkpointSnap);
    if (this.state === 'core') this.refreshCoreUI();
  };

  Game.prototype.toTitle = function () {
    this.keys.releaseAll();
    this.goTitle();
  };

  Game.prototype.makeSnapshot = function (cp) {
    return {
      keys: this.keys.snapshot(),
      world: this.level.getState(),
      pos: { x: cp.c * T + (T - this.player.w) / 2, y: (cp.r + 1) * T - this.player.h }
    };
  };

  Game.prototype.applySnapshot = function (s) {
    this.keys.load(s.keys);
    this.level.setState(s.world);
    this.player.reset(s.pos.x, s.pos.y);
  };

  // ------------------------------------------------------------------
  // 입력
  // ------------------------------------------------------------------
  Game.prototype.onKeyDown = function (id) {
    this.sound.unlock();
    if (this.ui.hasMenu() && this.ui.handleKey(id)) return;

    switch (this.state) {
      case 'intro':
        if (id === 'ENTER') this.beginPlay();
        else if (id === 'ESC') this.pause();
        break;
      case 'play':
        this.handlePlayKey(id);
        break;
      case 'core':
        this.handleCoreKey(id);
        break;
    }
  };

  /** 손을 떼는 순간 누르고 있던 키는 사라진다 (어떤 상태에서든) */
  Game.prototype.onKeyUp = function (id) {
    var k = this.keys.get(id);
    if (k && k.state === 'active') this.keys.release(id);
  };

  Game.prototype.setMsg = function (text, frames) {
    this.msg.text = text;
    this.msg.t = frames || 150;
  };

  Game.prototype.handlePlayKey = function (id) {
    if (id === 'ESC') return this.pause();
    if (id === 'ENTER') return this.tryStation();
    if (TLK.isArrow(id)) {
      this.setMsg('방향키는 메뉴 전용입니다. 이 세계에서는 글자 키가 곧 행동입니다.', 150);
      return;
    }

    var k = this.keys.get(id);
    if (!k) return;
    if (k.state === 'locked') {
      this.ui.flashKey(id, 'denied');
      this.setMsg(id + ' 키는 이 스테이지에 없습니다.', 90);
      return;
    }
    if (k.state === 'consumed') {
      this.ui.flashKey(id, 'denied');
      this.sound.play('deny');
      this.setMsg(id + ' 키는 이미 사라졌습니다.', 90);
      return;
    }
    if (k.state !== 'available' || !k.action) return;

    switch (k.action) {
      case 'left':
      case 'right':
        if (this.keys.isActionActive(k.action)) {
          this.setMsg('이미 같은 방향으로 이동 중입니다. 키는 소모되지 않았습니다.', 120);
          return;
        }
        this.useKey(id);
        this.sound.play('step');
        break;

      case 'jump':
        if (this.player.canJump()) {
          this.doJump(id);
        } else {
          // 공중에서 누른 점프는 착지 직전이면 예약, 아니면 소모되지 않는다
          this.pendingJump = { id: id, t: C.JUMP_BUFFER };
        }
        break;

      case 'interact':
        var target = this.findInteract();
        if (!target) {
          this.setMsg('근처에 상호작용할 대상이 없습니다. 키는 소모되지 않았습니다.', 120);
          this.ui.flashKey(id, 'denied');
          return;
        }
        this.useKey(id);
        this.doInteract(target);
        break;

      case 'rewind':
        this.useKey(id);
        this.doRewind();
        break;
    }
  };

  /** 키 소모: 행동이 수행되는 순간 단 한 번 */
  Game.prototype.useKey = function (id) {
    if (!this.keys.activate(id)) return false;
    this.stageUsed++;
    this.save.runBurnt++;
    this.persist();
    this.renderer.keyBreak(this.player, id);
    this.renderer.shake(3, 8);
    this.sound.play('consume');
    // 버퍼로 늦게 실행된 경우처럼 이미 손을 뗀 키라면 즉시 사라진다
    if (!this.input.isDown(id)) this.keys.release(id);
    return true;
  };

  Game.prototype.doJump = function (id) {
    this.pendingJump = null;
    if (!this.useKey(id)) return;
    this.player.jump();
    this.sound.play('jump');
  };

  Game.prototype.findInteract = function () {
    var p = this.player;
    var px = p.cx();
    var py = p.cy();
    var best = null;
    var bestD = Infinity;
    var lv = this.level;

    function consider(type, obj, c, r) {
      var dx = Math.abs(c * T + T / 2 - px);
      var dy = Math.abs(r * T + T / 2 - py);
      if (dx <= C.INTERACT_X && dy <= C.INTERACT_Y) {
        var d = dx + dy;
        if (d < bestD) {
          bestD = d;
          best = { type: type, obj: obj, c: c, r: r };
        }
      }
    }

    lv.doors.forEach(function (door) {
      if (door.open) return;
      door.tiles.forEach(function (t) {
        consider('door', door, t.c, t.r);
      });
    });
    lv.levers.forEach(function (o) {
      if (!o.used) consider('lever', o, o.c, o.r);
    });
    lv.lockers.forEach(function (o) {
      if (!o.opened) consider('locker', o, o.c, o.r);
    });
    return best;
  };

  Game.prototype.doInteract = function (t) {
    var lv = this.level;
    if (t.type === 'door') {
      t.obj.open = true;
      this.sound.play('door');
      this.renderer.doorFx(t.obj);
      this.setMsg('문이 열렸습니다.', 120);
    } else if (t.type === 'lever') {
      t.obj.used = true;
      lv.signal = true;
      this.player.unstick(lv);
      this.sound.play('switch');
      this.setMsg('레버를 당겼습니다. 다리가 생겼습니다.', 150);
    } else if (t.type === 'locker') {
      t.obj.opened = true;
      this.keys.grant(t.obj.key, t.obj.action);
      this.sound.play('pickup');
      this.renderer.sparkle(t.c * T + 8, t.r * T + 8);
      this.setMsg('보관함에서 ' + t.obj.key + ' 키를 얻었습니다. (' + TLK.ACTIONS[t.obj.action].name + ')', 180);
    }
  };

  Game.prototype.doRewind = function () {
    var target = this.history[0];
    this.renderer.rewindFx(this.player, target);
    this.player.setState(target);
    this.player.unstick(this.level);
    this.history = [this.player.getState()];
    this.sound.play('rewind');
    this.setMsg('3초 전의 위치로 되돌아왔습니다.', 120);
  };

  // ------------------------------------------------------------------
  // 장치: 복구 장치 / 제단
  // ------------------------------------------------------------------
  Game.prototype.tryStation = function () {
    var st = this.stationHere;
    if (!st) return;
    if (st.uses <= 0) {
      this.setMsg('이미 사용한 장치입니다.', 90);
      return;
    }
    var consumed = this.keys.list('consumed', true);
    if (st.type === 'restore') {
      if (!consumed.length) {
        this.setMsg('되살릴 키가 없습니다. 키가 사라진 뒤에 다시 사용하세요.', 150);
        return;
      }
      this.state = 'station';
      this.sound.play('select');
      this.ui.showRestore(st, consumed);
    } else {
      var avail = this.keys.list('available', true);
      if (!avail.length) {
        this.setMsg('바칠 수 있는 키가 없습니다.', 120);
        return;
      }
      if (!consumed.length) {
        this.setMsg('되살릴 키가 없습니다.', 120);
        return;
      }
      this.state = 'station';
      this.sound.play('select');
      this.ui.showAltar(st, avail, consumed);
    }
  };

  Game.prototype.stationRestore = function (st, id) {
    if (st.uses <= 0 || !this.keys.restore(id)) return this.closeStation();
    st.uses--;
    this.sound.play('restore');
    this.renderer.sparkle(st.c * T + 8, st.r * T + 4);
    this.setMsg(id + ' 키가 되살아났습니다. (' + TLK.ACTIONS[this.keys.get(id).action].name + ')', 180);
    this.closeStation();
  };

  Game.prototype.stationAltar = function (st, burnId, restoreId) {
    if (st.uses <= 0 || burnId === restoreId) return this.closeStation();
    if (!this.keys.burn(burnId)) return this.closeStation();
    this.keys.restore(restoreId);
    st.uses--;
    this.stageUsed++;
    this.save.runBurnt++;
    this.persist();
    this.sound.play('consume');
    this.sound.play('restore');
    this.renderer.sparkle(st.c * T + 8, st.r * T + 4);
    this.setMsg(burnId + ' 키를 바치고 ' + restoreId + ' 키를 되살렸습니다.', 180);
    this.closeStation();
  };

  Game.prototype.closeStation = function () {
    if (this.state === 'station') this.state = 'play';
    this.ui.closeOverlay();
  };

  // ------------------------------------------------------------------
  // 매 프레임
  // ------------------------------------------------------------------
  Game.prototype.update = function () {
    this.frame++;
    switch (this.state) {
      case 'play':
        this.updatePlay();
        break;
      case 'core':
        this.updateCore();
        break;
      case 'ending':
        this.updateEnding();
        break;
    }
    if (this.state === 'play' || this.state === 'core' || this.state === 'station') {
      this.ui.setHud(this.stage, this.keys.count('available'));
    }
  };

  Game.prototype.updatePlay = function () {
    var p = this.player;
    var lv = this.level;
    var keys = this.keys;
    var self = this;

    // 점프 예약 처리
    if (this.pendingJump) {
      var pj = this.pendingJump;
      if (p.canJump() && keys.get(pj.id).state === 'available') {
        this.doJump(pj.id);
      } else if (--pj.t <= 0) {
        this.pendingJump = null;
        this.setMsg('공중에서는 점프할 수 없습니다. 키는 소모되지 않았습니다.', 120);
      }
    }

    var dir = (keys.isActionActive('right') ? 1 : 0) - (keys.isActionActive('left') ? 1 : 0);
    var ev = p.update(dir, lv);
    if (ev.landed) {
      this.sound.play('land');
      this.renderer.dust(p.cx(), p.y + p.h);
    }

    this.history.push(p.getState());
    if (this.history.length > C.REWIND_FRAMES + 1) this.history.shift();

    if (p.touchesSpike(lv)) {
      this.die('spike');
      return;
    }

    lv.pickups.forEach(function (pk) {
      if (!pk.taken && p.overlapsTile(pk.c, pk.r)) {
        pk.taken = true;
        keys.grant(pk.key, pk.action);
        self.sound.play('pickup');
        self.renderer.sparkle(pk.c * T + 8, pk.r * T + 8);
        self.setMsg(pk.key + ' 키를 얻었습니다. (' + TLK.ACTIONS[pk.action].name + ')', 180);
      }
    });

    lv.orbs.forEach(function (o) {
      if (!o.on && p.overlapsTile(o.c, o.r)) {
        o.on = true;
        lv.signal = true;
        p.unstick(lv);
        self.sound.play('switch');
        self.renderer.sparkle(o.c * T + 8, o.r * T + 8);
      }
    });

    lv.checkpoints.forEach(function (cp) {
      if (!cp.active && p.overlapsTile(cp.c, cp.r, 1)) {
        cp.active = true;
        self.checkpointSnap = self.makeSnapshot(cp);
        self.save.current = { stage: self.stageIndex, snapshot: self.checkpointSnap };
        self.persist();
        self.sound.play('checkpoint');
        self.setMsg('체크포인트 — 지금의 키 상태가 기록되었습니다.', 150);
      }
    });

    this.stationHere = null;
    if (p.onGround) {
      for (var i = 0; i < lv.stations.length; i++) {
        var st = lv.stations[i];
        if (p.overlapsTile(st.c, st.r)) this.stationHere = st;
      }
    }

    this.interactTarget = keys.hasAvailable('interact') ? this.findInteract() : null;

    for (var e = 0; e < lv.exits.length; e++) {
      if (p.overlapsTile(lv.exits[e].c, lv.exits[e].r, 1)) {
        this.clearStage();
        return;
      }
    }

    if (lv.hasZone && p.inZone(lv)) {
      this.enterCore();
      return;
    }

    this.updateStuck();
    this.updateMessage();
  };

  Game.prototype.canStillAct = function () {
    var k = this.keys;
    if (k.hasAvailable('left') || k.hasAvailable('right') || k.hasAvailable('rewind')) return true;
    if (k.isActionActive('left') || k.isActionActive('right')) return true;
    if (k.hasAvailable('interact') && this.findInteract()) return true;
    if (this.stationHere && this.stationHere.uses > 0) return true;
    if (this.pendingJump) return true;
    return false;
  };

  /** 더 이상 진행할 수 없는 상태 감지 → 게임 오버 */
  Game.prototype.updateStuck = function () {
    var p = this.player;
    if (Math.abs(p.x - this.stuckX) > 0.5) {
      this.stuckX = p.x;
      this.stuckT = 0;
      return;
    }
    this.stuckT++;
    if (this.stuckT > C.STUCK_FRAMES && !this.canStillAct()) {
      this.die('stuck');
      return;
    }
    if (this.stuckT > C.IDLE_HINT_FRAMES && !this.hintShown) {
      this.hintShown = true;
      this.setMsg('막혔다면 ESC → 체크포인트 또는 스테이지 재시작을 고를 수 있습니다.', 240);
    }
  };

  Game.prototype.zoneMessage = function () {
    var list = this.stage.messages || [];
    var c = Math.floor(this.player.cx() / T);
    var r = Math.floor(this.player.cy() / T);
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var r0 = m.r0 === undefined ? 0 : m.r0;
      var r1 = m.r1 === undefined ? C.ROWS : m.r1;
      if (c < m.c0 || c > m.c1 || r < r0 || r > r1) continue;
      if (m.when === 'signalOn' && !this.level.signal) continue;
      if (m.when === 'signalOff' && this.level.signal) continue;
      return m.text;
    }
    return '';
  };

  Game.prototype.updateMessage = function () {
    var text = '';
    if (this.msg.t > 0) {
      this.msg.t--;
      text = this.msg.text;
    } else if (this.stationHere && this.stationHere.uses > 0) {
      text = this.stationHere.type === 'restore'
        ? '[ENTER] 복구 장치 — 사라진 키 하나를 되살립니다. (남은 횟수 ' + this.stationHere.uses + ')'
        : '[ENTER] 제단 — 남은 키 하나를 바치고 사라진 키 하나를 되살립니다.';
    } else {
      text = this.zoneMessage();
    }
    this.ui.setMessage(text);
  };

  Game.prototype.die = function (reason) {
    this.state = 'gameover';
    this.deathReason = reason;
    this.pendingJump = null;
    if (reason === 'spike') {
      this.player.hidden = true;
      this.renderer.burst(this.player.cx(), this.player.cy(), 40, ['#e8e4da', '#ff4a3d', '#ffb000']);
      this.renderer.shake(5, 14);
    }
    this.sound.play('gameover');
    this.ui.setMessage('');
    this.ui.showGameOver({ reason: reason, hasCheckpoint: !!this.checkpointSnap });
  };

  Game.prototype.clearStage = function () {
    this.state = 'clear';
    this.keys.releaseAll();
    this.player.hidden = true;
    this.renderer.burst(this.player.cx(), this.player.cy(), 30, ['#fff4d6', '#ffb000']);
    this.sound.play('clear');
    var next = this.stageIndex + 1;
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(TLK.STAGES.length, next + 1));
    this.save.current = next < TLK.STAGES.length ? { stage: next, snapshot: null } : null;
    this.persist();
    this.ui.setMessage('');
    this.ui.showClear({
      stage: this.stage,
      used: this.stageUsed,
      left: this.keys.count('available'),
      next: TLK.STAGES[next] || null
    });
  };

  // ------------------------------------------------------------------
  // 마지막 스테이지: 코어
  // ------------------------------------------------------------------
  Game.prototype.enterCore = function () {
    this.state = 'core';
    this.keys.releaseAll();
    this.pendingJump = null;
    this.player.vx = 0;
    this.core = { phase: 'text', t: 0, line: 0, last: null, toBurn: [] };
    this.ui.setMessage('');
    this.sound.play('core');
    this.renderer.shake(4, 20);
    this.ui.showCoreText(CORE_LINES[0]);
  };

  Game.prototype.refreshCoreUI = function () {
    var core = this.core;
    if (!core) return;
    if (core.phase === 'text') this.ui.showCoreText(CORE_LINES[Math.min(core.line, CORE_LINES.length - 1)]);
    else if (core.phase === 'choose') this.ui.showCoreChoice(this.keys.list('available', true));
    else if (core.phase === 'burn') this.ui.showCoreText('나머지 키가 타오릅니다.');
    else if (core.phase === 'await') this.ui.showAwait(core.last);
  };

  Game.prototype.updateCore = function () {
    var core = this.core;
    this.player.update(0, this.level);
    core.t++;

    if (core.phase === 'text') {
      if (core.t % 150 === 0) {
        core.line++;
        if (core.line < CORE_LINES.length) {
          this.ui.showCoreText(CORE_LINES[core.line]);
        } else {
          this.afterCoreText();
        }
      }
    } else if (core.phase === 'burn') {
      if (core.t % 36 === 0) {
        var b = core.toBurn.shift();
        if (b) {
          this.keys.burn(b.id);
          this.sound.play('consume');
          this.renderer.shake(2, 6);
        } else {
          core.phase = 'await';
          core.t = 0;
          this.ui.showAwait(core.last);
        }
      }
    } else if (core.phase === 'await') {
      if (core.t >= C.CORE_KEEP_FRAMES) this.startEnding('keep');
    }
  };

  Game.prototype.afterCoreText = function () {
    var core = this.core;
    var avail = this.keys.list('available', true);
    if (avail.length === 0) {
      this.startEnding('empty');
    } else if (avail.length === 1) {
      core.last = avail[0];
      core.phase = 'await';
      core.t = 0;
      this.ui.showAwait(core.last);
    } else {
      core.phase = 'choose';
      this.ui.showCoreChoice(avail);
    }
  };

  /** 코어에서 가지고 나갈 키 선택 (UI에서 호출) */
  Game.prototype.coreChoose = function (id) {
    var core = this.core;
    if (!core || core.phase !== 'choose') return;
    var keep = this.keys.get(id);
    if (!keep || keep.state !== 'available') return;
    core.last = keep;
    core.toBurn = this.keys.list('available', true).filter(function (k) {
      return k.id !== id;
    });
    core.phase = 'burn';
    core.t = 0;
    this.ui.showCoreText('나머지 키가 타오릅니다.');
  };

  Game.prototype.handleCoreKey = function (id) {
    if (id === 'ESC') return this.pause();
    var core = this.core;
    if (!core || core.phase !== 'await') return;
    if (id === core.last.id) {
      this.keys.activate(id);
      this.stageUsed++;
      this.save.runBurnt++;
      if (!this.input.isDown(id)) this.keys.release(id);
      this.startEnding(TLK.ACTION_TO_ENDING[core.last.action]);
    } else {
      var k = this.keys.get(id);
      if (k) this.ui.flashKey(id, 'denied');
    }
  };

  // ------------------------------------------------------------------
  // 엔딩
  // ------------------------------------------------------------------
  Game.prototype.startEnding = function (type) {
    this.state = 'ending';
    this.ending = { type: type, t: 0, reviveOrder: null };
    if (this.save.endings.indexOf(type) < 0) this.save.endings.push(type);
    this.save.current = null;
    this.persist();
    this.ui.closeOverlay();
    this.ui.setMessage('');
    this.ui.hideHud();
    this.sound.stopDrone();
    this.sound.play('ending_' + type);
  };

  Game.prototype.updateEnding = function () {
    var e = this.ending;
    var p = this.player;
    e.t++;

    if (e.type === 'forward' && e.t > 50) {
      p.facing = 1;
      p.x += 0.8;
      p.anim++;
    } else if (e.type === 'return' && e.t > 50) {
      p.facing = -1;
      p.x -= 0.8;
      p.anim++;
    } else if (e.type === 'ascend' && e.t > 40) {
      p.y -= Math.min(3.5, (e.t - 40) * 0.04);
    } else if ((e.type === 'unlock' || e.type === 'rewind') && e.t > 40) {
      if (!e.reviveOrder) {
        e.reviveOrder = TLK.ALL_KEYS.slice();
        if (e.type === 'rewind') e.reviveOrder.reverse();
      }
      if (e.t % 4 === 0 && e.reviveOrder.length) {
        this.keys.reviveVisual(e.reviveOrder.shift());
        this.sound.play('tick');
      }
    }

    if (e.t === 330) {
      this.ui.showEnding({
        id: e.type,
        data: TLK.ENDINGS[e.type],
        found: this.save.endings.length,
        total: TLK.ENDING_ORDER.length,
        burnt: this.save.runBurnt
      });
    }
  };

  // ------------------------------------------------------------------
  // 키 이벤트 → UI / 사운드
  // ------------------------------------------------------------------
  Game.prototype.onKeyEvent = function (type, k) {
    if (!this.ui) return;
    this.ui.renderKeys(this.keys);
    if (!k) return;
    switch (type) {
      case 'activate':
        this.ui.flashKey(k.id, 'burning');
        break;
      case 'consume':
      case 'burn':
        this.ui.flashKey(k.id, 'shatter');
        this.sound.play('shatter');
        break;
      case 'restore':
        this.ui.flashKey(k.id, 'revive');
        break;
      case 'grant':
        this.ui.flashKey(k.id, 'new');
        break;
    }
  };

  TLK.Game = Game;
})();
