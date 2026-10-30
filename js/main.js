/* THE LAST KEY — 시작점: 모듈 연결과 고정 스텝 게임 루프 */
(function () {
  'use strict';
  var TLK = window.TLK;
  var STEP = 1 / 60;

  function boot() {
    var canvas = document.getElementById('game');
    var input = new TLK.Input();
    var ui = new TLK.UI(input);
    var renderer = new TLK.Renderer(canvas);
    var sound = new TLK.Sound();
    var game = new TLK.Game({ ui: ui, renderer: renderer, sound: sound, input: input });

    ui.bindGame(game);
    input.attach(game);
    game.init();
    ui.renderKeys(game.keys);

    // 첫 입력(키/터치)에서 오디오 시작 (브라우저 자동재생 정책)
    var unlock = function () {
      sound.unlock();
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);

    var last = performance.now();
    var acc = 0;
    function frame(now) {
      acc += Math.min(0.25, (now - last) / 1000);
      last = now;
      while (acc >= STEP) {
        game.update();
        renderer.tick();
        acc -= STEP;
      }
      renderer.render(game);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    TLK.game = game; // 디버깅용
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
