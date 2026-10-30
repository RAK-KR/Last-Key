/* THE LAST KEY — 공용 상수와 키 정의 */
(function () {
  'use strict';
  var TLK = (window.TLK = window.TLK || {});

  TLK.C = {
    TILE: 16,
    COLS: 30,
    ROWS: 17,
    W: 480,
    H: 272,

    // 물리 (60fps 고정 스텝 기준, 단위: px/frame)
    GRAVITY: 0.25,
    MAX_FALL: 5.5,
    JUMP_V: -5.2, // 최대 약 54px (3칸 높이까지 오를 수 있음)
    RUN_SPEED: 1.75,
    ACCEL_GROUND: 0.35,
    ACCEL_AIR: 0.25,
    FRICTION: 0.45,
    COYOTE: 6,
    JUMP_BUFFER: 8,

    REWIND_FRAMES: 180, // R: 3초 전 위치
    STUCK_FRAMES: 150,
    IDLE_HINT_FRAMES: 480,
    CORE_KEEP_FRAMES: 30 * 60,

    PLAYER_W: 10,
    PLAYER_H: 14,
    INTERACT_X: 26,
    INTERACT_Y: 22
  };

  TLK.ACTIONS = {
    left: { icon: '←', name: '왼쪽 이동' },
    right: { icon: '→', name: '오른쪽 이동' },
    jump: { icon: '↑', name: '점프' },
    interact: { icon: 'USE', name: '상호작용' },
    rewind: { icon: 'REW', name: '되감기 (3초 전 위치로)' }
  };

  TLK.KEY_ROWS = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
    ['SPACE']
  ];

  TLK.ALL_KEYS = [];
  TLK.KEY_ROWS.forEach(function (row) {
    row.forEach(function (id) {
      TLK.ALL_KEYS.push(id);
    });
  });

  TLK.SYSTEM_KEYS = ['ESC', 'ENTER', 'UP', 'DOWN', 'LEFT', 'RIGHT'];

  // KeyboardEvent.code 기준 (한/영 입력 상태와 무관하게 물리 키로 판별)
  TLK.codeToId = function (code) {
    if (!code) return null;
    if (code.indexOf('Key') === 0 && code.length === 4) return code.charAt(3);
    switch (code) {
      case 'Space': return 'SPACE';
      case 'ShiftLeft':
      case 'ShiftRight': return 'SHIFT';
      case 'Escape': return 'ESC';
      case 'Enter':
      case 'NumpadEnter': return 'ENTER';
      case 'ArrowUp': return 'UP';
      case 'ArrowDown': return 'DOWN';
      case 'ArrowLeft': return 'LEFT';
      case 'ArrowRight': return 'RIGHT';
    }
    return null;
  };

  TLK.isArrow = function (id) {
    return id === 'UP' || id === 'DOWN' || id === 'LEFT' || id === 'RIGHT';
  };
})();
