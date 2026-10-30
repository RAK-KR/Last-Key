/* THE LAST KEY — 키 소모 / 복구 시스템
 *
 * 키 상태
 *   locked    : 이 스테이지에 존재하지 않는 키
 *   available : 사용 가능
 *   active    : 지금 누르고 있는 키 (이미 사용됨, 손을 떼는 순간 사라짐)
 *   consumed  : 사라진 키
 *
 * 규칙: 키는 행동이 실제로 수행되는 순간 단 한 번 소모된다(available → active).
 *       누르고 있는 동안에는 그 행동이 계속되고, 손을 떼면 consumed 가 된다.
 */
(function () {
  'use strict';
  var TLK = window.TLK;

  function KeySystem() {
    this.keys = {};
    this.listeners = [];
    this.reset({ keys: {} });
  }

  KeySystem.prototype.on = function (fn) {
    this.listeners.push(fn);
  };

  KeySystem.prototype.emit = function (type, key) {
    for (var i = 0; i < this.listeners.length; i++) this.listeners[i](type, key);
  };

  /**
   * loadout = { keys: { D: 'right', SPACE: 'jump', ... }, burnAllOthers: bool }
   */
  KeySystem.prototype.reset = function (loadout) {
    var self = this;
    this.keys = {};
    TLK.ALL_KEYS.forEach(function (id) {
      self.keys[id] = { id: id, action: null, state: loadout.burnAllOthers ? 'consumed' : 'locked' };
    });
    Object.keys(loadout.keys || {}).forEach(function (id) {
      self.keys[id] = { id: id, action: loadout.keys[id], state: 'available' };
    });
    this.emit('reset', null);
  };

  KeySystem.prototype.get = function (id) {
    return this.keys[id] || null;
  };

  KeySystem.prototype.activate = function (id) {
    var k = this.keys[id];
    if (!k || k.state !== 'available') return false;
    k.state = 'active';
    this.emit('activate', k);
    return true;
  };

  KeySystem.prototype.release = function (id) {
    var k = this.keys[id];
    if (!k || k.state !== 'active') return false;
    k.state = 'consumed';
    this.emit('consume', k);
    return true;
  };

  KeySystem.prototype.releaseAll = function () {
    var self = this;
    Object.keys(this.keys).forEach(function (id) {
      if (self.keys[id].state === 'active') self.release(id);
    });
  };

  KeySystem.prototype.grant = function (id, action) {
    var k = this.keys[id];
    if (!k) return false;
    k.action = action;
    k.state = 'available';
    this.emit('grant', k);
    return true;
  };

  KeySystem.prototype.restore = function (id) {
    var k = this.keys[id];
    if (!k || k.state !== 'consumed' || !k.action) return false;
    k.state = 'available';
    this.emit('restore', k);
    return true;
  };

  KeySystem.prototype.burn = function (id) {
    var k = this.keys[id];
    if (!k || k.state !== 'available') return false;
    k.state = 'consumed';
    this.emit('burn', k);
    return true;
  };

  /** 엔딩 연출용: 모든 키를 사용 가능 상태로 되돌림 */
  KeySystem.prototype.reviveVisual = function (id) {
    var k = this.keys[id];
    if (!k) return;
    k.state = 'available';
    this.emit('restore', k);
  };

  KeySystem.prototype.list = function (state, withActionOnly) {
    var out = [];
    var self = this;
    TLK.ALL_KEYS.forEach(function (id) {
      var k = self.keys[id];
      if (k.state === state && (!withActionOnly || k.action)) out.push(k);
    });
    return out;
  };

  KeySystem.prototype.count = function (state) {
    return this.list(state, true).length;
  };

  KeySystem.prototype.hasAvailable = function (action) {
    for (var id in this.keys) {
      var k = this.keys[id];
      if (k.state === 'available' && k.action === action) return true;
    }
    return false;
  };

  KeySystem.prototype.isActionActive = function (action) {
    for (var id in this.keys) {
      var k = this.keys[id];
      if (k.state === 'active' && k.action === action) return true;
    }
    return false;
  };

  /** 체크포인트 스냅샷: 누르고 있던 키는 '사용 가능'으로 기록 */
  KeySystem.prototype.snapshot = function () {
    var snap = {};
    for (var id in this.keys) {
      var k = this.keys[id];
      snap[id] = { a: k.action, s: k.state === 'active' ? 'available' : k.state };
    }
    return snap;
  };

  KeySystem.prototype.load = function (snap) {
    for (var id in this.keys) {
      if (snap[id]) {
        this.keys[id].action = snap[id].a;
        this.keys[id].state = snap[id].s;
      }
    }
    this.emit('reset', null);
  };

  TLK.KeySystem = KeySystem;
})();
