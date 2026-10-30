/* THE LAST KEY — 키보드 입력 처리
 * - KeyboardEvent.code 로 물리 키를 판별 (한/영 상태 무관)
 * - 자동 반복 입력 무시: 누르고 있는 동안 keydown 은 한 번만 전달
 * - SPACE 스크롤, 방향키 스크롤 등 브라우저 기본 동작 차단
 * - 창이 포커스를 잃으면 누르고 있던 키는 모두 뗀 것으로 처리
 * - 화면의 키캡을 터치/클릭해도 같은 입력이 들어간다 (모바일 보조)
 */
(function () {
  'use strict';
  var TLK = window.TLK;

  function Input() {
    this.down = {};
    this.handler = null;
  }

  Input.prototype.isDown = function (id) {
    return !!this.down[id];
  };

  Input.prototype.attach = function (handler) {
    var self = this;
    this.handler = handler;

    window.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // 브라우저 단축키는 그대로 둔다
      var id = TLK.codeToId(e.code);
      if (!id) return;
      e.preventDefault();
      self.press(id);
    }, { passive: false });

    window.addEventListener('keyup', function (e) {
      var id = TLK.codeToId(e.code);
      if (!id) return;
      e.preventDefault();
      self.releaseKey(id);
    }, { passive: false });

    window.addEventListener('blur', function () {
      self.releaseAll();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) self.releaseAll();
    });
  };

  Input.prototype.press = function (id) {
    if (this.down[id]) return; // 자동 반복 무시
    this.down[id] = true;
    if (this.handler) this.handler.onKeyDown(id);
  };

  Input.prototype.releaseKey = function (id) {
    if (!this.down[id]) return;
    delete this.down[id];
    if (this.handler) this.handler.onKeyUp(id);
  };

  Input.prototype.releaseAll = function () {
    var ids = Object.keys(this.down);
    for (var i = 0; i < ids.length; i++) this.releaseKey(ids[i]);
  };

  /** 화면 키캡(data-key)을 포인터 입력으로 누를 수 있게 한다 */
  Input.prototype.bindVirtualKey = function (el, id) {
    var self = this;
    var pointerId = null;
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      pointerId = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {}
      self.press(id);
    });
    var up = function (e) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      pointerId = null;
      self.releaseKey(id);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });
  };

  TLK.Input = Input;
})();
