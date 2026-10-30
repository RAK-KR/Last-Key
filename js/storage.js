/* THE LAST KEY — 저장 데이터 (localStorage) */
(function () {
  'use strict';
  var TLK = window.TLK;
  var SAVE_KEY = 'the-last-key-save-v1';

  function defaults() {
    return {
      unlocked: 1, // 선택 가능한 스테이지 수
      current: null, // { stage: 0~4, snapshot: 체크포인트 스냅샷 또는 null }
      endings: [], // 본 엔딩 id 목록
      runBurnt: 0, // 이번 여정에서 사용한 키 수
      settings: { sound: true, volume: 70, shake: true }
    };
  }

  function hasStorage() {
    try {
      return typeof window.localStorage !== 'undefined' && window.localStorage !== null;
    } catch (e) {
      return false;
    }
  }

  TLK.Storage = {
    defaults: defaults,

    load: function () {
      var data = defaults();
      if (!hasStorage()) return data;
      try {
        var raw = window.localStorage.getItem(SAVE_KEY);
        if (!raw) return data;
        var parsed = JSON.parse(raw);
        if (typeof parsed.unlocked === 'number') data.unlocked = Math.max(1, Math.min(5, parsed.unlocked));
        if (parsed.current && typeof parsed.current.stage === 'number') data.current = parsed.current;
        if (Array.isArray(parsed.endings)) data.endings = parsed.endings.slice();
        if (typeof parsed.runBurnt === 'number') data.runBurnt = parsed.runBurnt;
        if (parsed.settings) {
          if (typeof parsed.settings.sound === 'boolean') data.settings.sound = parsed.settings.sound;
          if (typeof parsed.settings.volume === 'number') data.settings.volume = parsed.settings.volume;
          if (typeof parsed.settings.shake === 'boolean') data.settings.shake = parsed.settings.shake;
        }
      } catch (e) {
        /* 손상된 저장 데이터는 무시하고 기본값 사용 */
      }
      return data;
    },

    save: function (data) {
      if (!hasStorage()) return;
      try {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      } catch (e) {
        /* 저장 공간이 없거나 차단된 경우 무시 */
      }
    },

    clear: function () {
      if (!hasStorage()) return;
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch (e) {}
    }
  };
})();
