/* THE LAST KEY — UI: 키보드 UI, HUD, 메뉴 (모두 키보드로 조작 가능)
 * 메뉴: ↑↓ 이동, ←→ 값 변경, ENTER 확인, ESC 뒤로
 * 마우스/터치로 눌러도 동작하지만 필수는 아니다.
 */
(function () {
  'use strict';
  var TLK = window.TLK;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function UI(input) {
    this.input = input;
    this.game = null;
    this.menu = null;
    this.keyEls = {};
    this.keyCache = {};
    this.hudCache = '';
    this.msgCache = null;

    this.app = document.getElementById('app');
    this.screen = document.getElementById('screen');
    this.overlay = document.getElementById('overlay');
    this.hud = document.getElementById('hud');
    this.hudStage = document.getElementById('hud-stage');
    this.hudKeys = document.getElementById('hud-keys');
    this.message = document.getElementById('message');
    this.keyboard = document.getElementById('keyboard');
    this.legend = document.getElementById('legend');

    this.buildKeyboard();
    this.buildLegend();

    var self = this;
    window.addEventListener('resize', function () {
      self.resize();
    });
    this.resize();
  }

  UI.prototype.bindGame = function (game) {
    this.game = game;
  };

  // ------------------------------------------------------------------
  // 레이아웃
  // ------------------------------------------------------------------
  UI.prototype.resize = function () {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var w = Math.min(vw - 16, 1080);
    var u, total;
    for (; w > 260; w -= 8) {
      u = Math.min(54, Math.floor(w / 11.6));
      total = w * (272 / 480) + u * 4 * 0.98 + 18 + 46;
      if (total <= vh - 12) break;
    }
    w = Math.max(260, Math.floor(w));
    u = Math.min(54, Math.floor(w / 11.6));
    var h = Math.round(w * (272 / 480));
    var root = document.documentElement.style;
    root.setProperty('--w', w + 'px');
    root.setProperty('--h', h + 'px');
    root.setProperty('--u', u + 'px');
    root.setProperty('--fs', Math.max(11, Math.round(w / 52)) + 'px');
  };

  // ------------------------------------------------------------------
  // 키보드 UI
  // ------------------------------------------------------------------
  UI.prototype.buildKeyboard = function () {
    var self = this;
    this.keyboard.innerHTML = '';
    TLK.KEY_ROWS.forEach(function (row, ri) {
      var rowEl = document.createElement('div');
      rowEl.className = 'kb-row kb-row-' + ri;
      row.forEach(function (id) {
        var el = document.createElement('div');
        el.className = 'key locked' + (id.length > 1 ? ' wide key-' + id.toLowerCase() : '');
        el.setAttribute('data-key', id);
        el.innerHTML = '<span class="k-label">' + id + '</span><span class="k-act"></span><span class="k-crack"></span>';
        rowEl.appendChild(el);
        self.keyEls[id] = el;
        self.input.bindVirtualKey(el, id);
      });
      self.keyboard.appendChild(rowEl);
    });
  };

  UI.prototype.buildLegend = function () {
    var self = this;
    this.legend.innerHTML =
      '<span class="lg"><b>←</b>왼쪽 <b>→</b>오른쪽 <b>↑</b>점프 <b>USE</b>상호작용 <b>REW</b>되감기</span>' +
      '<span class="lg sys"><span class="syskey" data-sys="ESC">ESC</span>일시정지 ' +
      '<span class="syskey" data-sys="ENTER">ENTER</span>확인/장치</span>';
    Array.prototype.forEach.call(this.legend.querySelectorAll('.syskey'), function (el) {
      self.input.bindVirtualKey(el, el.getAttribute('data-sys'));
    });
  };

  UI.prototype.renderKeys = function (keys) {
    for (var id in this.keyEls) {
      var k = keys.get(id);
      var state = k ? k.state : 'locked';
      var act = k && k.action ? TLK.ACTIONS[k.action].icon : '';
      var sig = state + '|' + act;
      if (this.keyCache[id] === sig) continue;
      this.keyCache[id] = sig;
      var el = this.keyEls[id];
      el.classList.remove('locked', 'available', 'active', 'consumed');
      el.classList.add(state);
      el.classList.toggle('has-act', !!act);
      el.querySelector('.k-act').textContent = state === 'locked' ? '' : act;
    }
  };

  UI.prototype.flashKey = function (id, cls) {
    var el = this.keyEls[id];
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el['_t_' + cls]);
    el['_t_' + cls] = setTimeout(function () {
      el.classList.remove(cls);
    }, 700);
  };

  UI.prototype.markKeys = function (ids, selectedId) {
    for (var id in this.keyEls) {
      this.keyEls[id].classList.toggle('restorable', ids.indexOf(id) >= 0);
      this.keyEls[id].classList.toggle('selected', id === selectedId);
    }
  };

  UI.prototype.clearMarks = function () {
    this.markKeys([], null);
  };

  // ------------------------------------------------------------------
  // HUD / 메시지
  // ------------------------------------------------------------------
  UI.prototype.setHud = function (stage, remaining) {
    var sig = stage.id + '|' + remaining;
    if (sig === this.hudCache) return;
    this.hudCache = sig;
    this.hud.classList.remove('hidden');
    this.hudStage.innerHTML = '<b>STAGE ' + stage.id + '</b> ' + esc(stage.name);
    this.hudKeys.innerHTML = '남은 키 <b>' + remaining + '</b>';
    this.hudKeys.classList.toggle('low', remaining <= 1);
  };

  UI.prototype.hideHud = function () {
    this.hudCache = '';
    this.hud.classList.add('hidden');
  };

  UI.prototype.setMessage = function (text) {
    if (text === this.msgCache) return;
    this.msgCache = text;
    this.message.textContent = text || '';
    this.message.classList.toggle('hidden', !text);
  };

  // ------------------------------------------------------------------
  // 오버레이 / 메뉴
  // ------------------------------------------------------------------
  UI.prototype.hasMenu = function () {
    return !!this.menu;
  };

  UI.prototype.closeOverlay = function () {
    this.menu = null;
    this.overlay.className = '';
    this.overlay.innerHTML = '';
    this.clearMarks();
  };

  /**
   * spec = { cls, header (html), items: [{ label, value(), onSelect, onLeft, onRight, keyId, disabled }],
   *          index, onBack, footer (html) }
   */
  UI.prototype.openMenu = function (spec) {
    var self = this;
    this.menu = spec;
    spec.index = spec.index || 0;
    while (spec.items[spec.index] && spec.items[spec.index].disabled) spec.index++;

    this.overlay.className = 'show ' + (spec.cls || '');
    var html = '<div class="panel">' + (spec.header || '') + '<ul class="menu">';
    spec.items.forEach(function (it, i) {
      html += '<li data-i="' + i + '" class="' + (it.disabled ? 'disabled' : '') + '">' +
        '<span class="m-label">' + esc(it.label) + '</span>' +
        (it.value ? '<span class="m-value"></span>' : '') +
        (it.sub ? '<span class="m-sub">' + esc(it.sub) + '</span>' : '') +
        '</li>';
    });
    html += '</ul>' + (spec.footer || '') + '<div class="hint">↑↓ 선택 · ENTER 확인' + (spec.onBack ? ' · ESC 뒤로' : '') + '</div></div>';
    this.overlay.innerHTML = html;

    Array.prototype.forEach.call(this.overlay.querySelectorAll('.menu li'), function (li) {
      li.addEventListener('click', function () {
        var i = parseInt(li.getAttribute('data-i'), 10);
        if (spec.items[i].disabled || self.menu !== spec) return;
        spec.index = i;
        self.refreshMenu();
        self.activate();
      });
    });
    this.refreshMenu();
  };

  UI.prototype.refreshMenu = function () {
    var spec = this.menu;
    if (!spec) return;
    var lis = this.overlay.querySelectorAll('.menu li');
    for (var i = 0; i < lis.length; i++) {
      var it = spec.items[i];
      lis[i].classList.toggle('sel', i === spec.index);
      if (it.value) lis[i].querySelector('.m-value').textContent = it.value();
    }
    var keyIds = spec.items.filter(function (it) { return it.keyId; }).map(function (it) { return it.keyId; });
    var cur = spec.items[spec.index];
    this.markKeys(keyIds, cur && cur.keyId ? cur.keyId : null);
  };

  UI.prototype.moveMenu = function (d) {
    var spec = this.menu;
    var n = spec.items.length;
    var i = spec.index;
    for (var tries = 0; tries < n; tries++) {
      i = (i + d + n) % n;
      if (!spec.items[i].disabled) break;
    }
    spec.index = i;
    this.game.sound.play('move');
    this.refreshMenu();
  };

  UI.prototype.activate = function () {
    var it = this.menu.items[this.menu.index];
    if (!it || it.disabled) return;
    this.game.sound.play('select');
    if (it.onSelect) it.onSelect();
    else if (it.onRight) {
      it.onRight();
      this.refreshMenu();
    }
  };

  UI.prototype.handleKey = function (id) {
    var spec = this.menu;
    if (!spec) return false;
    var it = spec.items[spec.index];
    switch (id) {
      case 'UP':
        this.moveMenu(-1);
        break;
      case 'DOWN':
        this.moveMenu(1);
        break;
      case 'LEFT':
        if (it && it.onLeft) {
          it.onLeft();
          this.game.sound.play('move');
          this.refreshMenu();
        } else if (spec.horizontal) this.moveMenu(-1);
        break;
      case 'RIGHT':
        if (it && it.onRight) {
          it.onRight();
          this.game.sound.play('move');
          this.refreshMenu();
        } else if (spec.horizontal) this.moveMenu(1);
        break;
      case 'ENTER':
        this.activate();
        break;
      case 'ESC':
        if (spec.onBack) {
          this.game.sound.play('pause');
          spec.onBack();
        }
        break;
    }
    return true; // 메뉴가 열려 있는 동안 게임 키는 행동하지 않는다 (소모되지 않음)
  };

  UI.prototype.showText = function (cls, html) {
    this.menu = null;
    this.clearMarks();
    this.overlay.className = 'show ' + cls;
    this.overlay.innerHTML = html;
  };

  // ------------------------------------------------------------------
  // 화면들
  // ------------------------------------------------------------------
  UI.prototype.logoCanvas = function () {
    var font = TLK.PixelFont;
    var text = 'THE LAST KEY';
    var cv = document.createElement('canvas');
    cv.width = font.width(text, 1) + 2;
    cv.height = 9;
    var ctx = cv.getContext('2d');
    font.draw(ctx, 'THE LAST ', 1, 1, 1, '#e8e4da');
    font.draw(ctx, 'KEY', 1 + font.width('THE LAST ', 1) + 1, 1, 1, '#ffb000');
    cv.className = 'logo';
    return cv;
  };

  UI.prototype.showTitle = function (info) {
    var g = this.game;
    var self = this;
    var items = [];
    if (info.hasContinue) {
      items.push({ label: '이어하기', sub: 'STAGE ' + (info.continueStage + 1) + ' · ' + TLK.STAGES[info.continueStage].name, onSelect: function () { g.continueGame(); } });
    }
    items.push({ label: info.hasContinue ? '새 게임' : '시작하기', onSelect: function () { g.newGame(); } });
    items.push({ label: '스테이지 선택', disabled: info.unlocked < 2, onSelect: function () { self.showStageSelect(); } });
    items.push({ label: '조작법', onSelect: function () { self.showControls(function () { g.goTitle(); }); } });
    items.push({ label: '설정', onSelect: function () { self.showSettings(function () { g.goTitle(); }); } });

    var chips = TLK.ENDING_ORDER.map(function (id) {
      var found = info.endings.indexOf(id) >= 0;
      return '<span class="chip' + (found ? ' found' : '') + '">' + (found ? esc(TLK.ENDINGS[id].title) : '???') + '</span>';
    }).join('');

    this.openMenu({
      cls: 'title',
      header: '<div class="logo-wrap"></div><div class="subtitle">EVERY ACTION HAS A COST.</div>',
      items: items,
      footer: '<div class="endings"><div class="endings-label">엔딩 ' + info.endings.length + ' / ' + TLK.ENDING_ORDER.length + '</div>' + chips + '</div>'
    });
    this.overlay.querySelector('.logo-wrap').appendChild(this.logoCanvas());
  };

  UI.prototype.showStageSelect = function () {
    var g = this.game;
    var unlocked = g.save.unlocked;
    var items = TLK.STAGES.map(function (s, i) {
      return {
        label: i < unlocked ? 'STAGE ' + s.id + '  ' + s.name : 'STAGE ' + s.id + '  ???',
        disabled: i >= unlocked,
        onSelect: function () { g.startStage(i); }
      };
    });
    items.push({ label: '뒤로', onSelect: function () { g.goTitle(); } });
    this.openMenu({
      cls: 'list',
      header: '<h2>스테이지 선택</h2><p class="desc">스테이지마다 키가 새로 주어집니다.</p>',
      items: items,
      onBack: function () { g.goTitle(); }
    });
  };

  UI.prototype.showControls = function (back) {
    this.openMenu({
      cls: 'list controls',
      header:
        '<h2>조작법</h2>' +
        '<table class="ctl">' +
        '<tr><td><kbd>A</kbd></td><td>왼쪽 이동 (누르고 있는 동안)</td></tr>' +
        '<tr><td><kbd>D</kbd></td><td>오른쪽 이동 (누르고 있는 동안)</td></tr>' +
        '<tr><td><kbd>SPACE</kbd></td><td>점프 (최대 3칸 높이)</td></tr>' +
        '<tr><td><kbd>E</kbd></td><td>상호작용 — 문, 레버, 보관함</td></tr>' +
        '<tr><td><kbd>R</kbd></td><td>되감기 — 3초 전 위치로 (반투명 그림자 위치)</td></tr>' +
        '<tr><td><kbd>ESC</kbd></td><td>일시정지</td></tr>' +
        '<tr><td><kbd>ENTER</kbd></td><td>메뉴 확인 · 장치 사용 (소모되지 않음)</td></tr>' +
        '<tr><td><kbd>↑ ↓ ← →</kbd></td><td>메뉴 이동 전용</td></tr>' +
        '</table>' +
        '<p class="desc">규칙: 행동에 쓴 키는 그 순간 사용되고, 손을 떼면 영원히 사라집니다. 같은 행동을 하는 키가 여러 개일 수 있습니다 (예: W도 점프). 화면 아래 키보드에서 각 키의 행동과 상태를 확인하세요.</p>',
      items: [{ label: '뒤로', onSelect: back }],
      onBack: back
    });
  };

  UI.prototype.showSettings = function (back) {
    var g = this.game;
    var self = this;
    var s = g.save.settings;
    var onOff = function (v) { return v ? '켜짐' : '꺼짐'; };
    this.openMenu({
      cls: 'list',
      header: '<h2>설정</h2>',
      items: [
        {
          label: '사운드', value: function () { return onOff(s.sound); },
          onSelect: function () { g.setSetting('sound', !s.sound); self.refreshMenu(); },
          onLeft: function () { g.setSetting('sound', !s.sound); },
          onRight: function () { g.setSetting('sound', !s.sound); }
        },
        {
          label: '볼륨', value: function () { return s.volume + '%'; },
          onSelect: function () { g.setSetting('volume', s.volume >= 100 ? 0 : s.volume + 10); self.refreshMenu(); },
          onLeft: function () { g.setSetting('volume', Math.max(0, s.volume - 10)); },
          onRight: function () { g.setSetting('volume', Math.min(100, s.volume + 10)); }
        },
        {
          label: '화면 흔들림', value: function () { return onOff(s.shake); },
          onSelect: function () { g.setSetting('shake', !s.shake); self.refreshMenu(); },
          onLeft: function () { g.setSetting('shake', !s.shake); },
          onRight: function () { g.setSetting('shake', !s.shake); }
        },
        {
          label: '진행 기록 초기화',
          onSelect: function () {
            self.openMenu({
              cls: 'list',
              header: '<h2>진행 기록 초기화</h2><p class="desc">스테이지 해금, 이어하기, 엔딩 기록이 모두 지워집니다. 설정은 유지됩니다.</p>',
              items: [
                { label: '취소', onSelect: function () { self.showSettings(back); } },
                { label: '초기화', onSelect: function () { g.resetProgress(); g.goTitle(); } }
              ],
              onBack: function () { self.showSettings(back); }
            });
          }
        },
        { label: '뒤로', onSelect: back }
      ],
      onBack: back
    });
  };

  UI.prototype.keyChips = function (keys) {
    return keys.list('available', true).map(function (k) {
      return '<span class="kchip"><kbd>' + k.id + '</kbd>' + esc(TLK.ACTIONS[k.action].name) + '</span>';
    }).join('');
  };

  UI.prototype.showIntro = function (stage, keys, fromCheckpoint) {
    var g = this.game;
    var paras = stage.intro.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    this.openMenu({
      cls: 'intro',
      header:
        '<div class="stage-no">STAGE ' + stage.id + ' / ' + TLK.STAGES.length + '</div>' +
        '<h1>' + esc(stage.name) + '</h1>' +
        '<div class="intro-text">' + paras + '</div>' +
        '<div class="kchips">' + this.keyChips(keys) + '</div>' +
        (fromCheckpoint ? '<p class="desc">체크포인트에서 이어서 시작합니다.</p>' : ''),
      items: [{ label: '시작하기', onSelect: function () { g.beginPlay(); } }],
      onBack: function () { g.pause(); }
    });
  };

  UI.prototype.showPause = function (info) {
    var g = this.game;
    var self = this;
    var items = [
      { label: '계속하기', onSelect: function () { g.resume(); } },
      { label: '스테이지 재시작', onSelect: function () { g.restartStage(); } }
    ];
    if (info.hasCheckpoint) items.push({ label: '체크포인트에서 다시', onSelect: function () { g.retryCheckpoint(); } });
    items.push({ label: '설정', onSelect: function () { self.showSettings(function () { g.ui.showPause(info); }); } });
    items.push({ label: '메인 메뉴', onSelect: function () { g.toTitle(); } });
    this.openMenu({
      cls: 'list',
      header: '<h2>일시정지</h2><p class="desc">누르고 있던 키에서 손을 떼면, 일시정지 중이어도 그 키는 사라집니다.</p>',
      items: items,
      onBack: function () { g.resume(); }
    });
  };

  UI.prototype.showGameOver = function (info) {
    var g = this.game;
    var items = [];
    if (info.hasCheckpoint) items.push({ label: '체크포인트에서 다시', onSelect: function () { g.retryCheckpoint(); } });
    items.push({ label: '스테이지 재시작', onSelect: function () { g.restartStage(); } });
    items.push({ label: '메인 메뉴', onSelect: function () { g.toTitle(); } });
    var reason = info.reason === 'spike' ? '가시에 닿았습니다.' : '남은 키로는 더 이상 나아갈 수 없습니다.';
    this.openMenu({
      cls: 'list gameover',
      header: '<h1 class="big red">GAME OVER</h1><p class="desc">' + reason + '</p>',
      items: items
    });
  };

  UI.prototype.showClear = function (info) {
    var g = this.game;
    var items = [];
    if (info.next) items.push({ label: '다음 스테이지', sub: 'STAGE ' + info.next.id + ' · ' + info.next.name, onSelect: function () { g.nextStage(); } });
    items.push({ label: '메인 메뉴', onSelect: function () { g.toTitle(); } });
    this.openMenu({
      cls: 'list clear',
      header:
        '<div class="stage-no">STAGE ' + info.stage.id + ' · ' + esc(info.stage.name) + '</div>' +
        '<h1 class="big">STAGE CLEAR</h1>' +
        '<p class="desc">사용한 키 <b>' + info.used + '</b>개 · 남긴 키 <b>' + info.left + '</b>개</p>',
      items: items
    });
  };

  UI.prototype.showRestore = function (st, list) {
    var g = this.game;
    var items = list.map(function (k) {
      return {
        label: k.id, sub: TLK.ACTIONS[k.action].name, keyId: k.id,
        onSelect: function () { g.stationRestore(st, k.id); }
      };
    });
    items.push({ label: '사용하지 않음', onSelect: function () { g.closeStation(); } });
    this.openMenu({
      cls: 'list station',
      header: '<h2>복구 장치</h2><p class="desc">사라진 키 하나를 되살립니다. 남은 사용 횟수: ' + st.uses + '</p>',
      items: items,
      onBack: function () { g.closeStation(); }
    });
  };

  UI.prototype.showAltar = function (st, avail, consumed) {
    var g = this.game;
    var self = this;
    var step1 = function () {
      var items = avail.map(function (k) {
        return {
          label: k.id, sub: TLK.ACTIONS[k.action].name + ' — 바치기', keyId: k.id,
          onSelect: function () { step2(k); }
        };
      });
      items.push({ label: '사용하지 않음', onSelect: function () { g.closeStation(); } });
      self.openMenu({
        cls: 'list station altar',
        header: '<h2>제단 · 1 / 2</h2><p class="desc">바칠 키를 고르세요. 바친 키는 사라집니다.</p>',
        items: items,
        onBack: function () { g.closeStation(); }
      });
    };
    var step2 = function (burnKey) {
      var items = consumed.map(function (k) {
        return {
          label: k.id, sub: TLK.ACTIONS[k.action].name + ' — 되살리기', keyId: k.id,
          onSelect: function () { g.stationAltar(st, burnKey.id, k.id); }
        };
      });
      items.push({ label: '뒤로', onSelect: step1 });
      self.openMenu({
        cls: 'list station altar',
        header: '<h2>제단 · 2 / 2</h2><p class="desc"><b>' + burnKey.id + '</b> 키를 바치고 되살릴 키를 고르세요.</p>',
        items: items,
        onBack: step1
      });
    };
    step1();
  };

  UI.prototype.showCoreText = function (text) {
    this.showText('core', '<div class="core-text">' + esc(text) + '</div>');
  };

  UI.prototype.showCoreChoice = function (list) {
    var g = this.game;
    var items = list.map(function (k) {
      return {
        label: k.id, sub: TLK.ACTIONS[k.action].name, keyId: k.id,
        onSelect: function () { g.coreChoose(k.id); }
      };
    });
    this.openMenu({
      cls: 'list core-choice',
      header: '<h2>단 하나만 가지고 나갈 수 있습니다</h2><p class="desc">고르지 않은 키는 모두 타 버립니다. 마지막 키가 무엇을 하는 키인지에 따라 끝이 달라집니다.</p>',
      items: items,
      onBack: function () { g.pause(); }
    });
  };

  UI.prototype.showAwait = function (key) {
    this.showText('core await',
      '<div class="core-text">마지막 키</div>' +
      '<div class="last-key" data-key="' + key.id + '"><span>' + key.id + '</span><small>' + esc(TLK.ACTIONS[key.action].name) + '</small></div>' +
      '<div class="core-sub">누르세요.</div>');
    var el = this.overlay.querySelector('.last-key');
    this.input.bindVirtualKey(el, key.id);
    this.markKeys([key.id], key.id);
  };

  UI.prototype.showEnding = function (e) {
    var g = this.game;
    this.openMenu({
      cls: 'list ending ending-' + e.id,
      header:
        '<div class="stage-no">ENDING</div>' +
        '<h1 class="big">' + esc(e.data.title) + '</h1>' +
        '<div class="ending-name">' + esc(e.data.name) + '</div>' +
        '<p class="ending-text">' + esc(e.data.text) + '</p>' +
        '<p class="desc">엔딩 ' + e.found + ' / ' + e.total + ' · 이번 여정에서 사용한 키 ' + e.burnt + '개</p>',
      items: [
        { label: '처음부터 다시', onSelect: function () { g.newGame(); } },
        { label: '메인 메뉴', onSelect: function () { g.goTitle(); } }
      ]
    });
  };

  TLK.UI = UI;
})();
