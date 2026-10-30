/* THE LAST KEY — Web Audio API 효과음 (외부 사운드 파일 없음) */
(function () {
  'use strict';
  var TLK = window.TLK;

  function Sound() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.7;
    this.noiseBuf = null;
    this.drone = null;
    this.droneFreq = 0;
  }

  Sound.prototype.unlock = function () {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();

    var len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var data = this.noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    if (this.droneFreq) this.startDrone(this.droneFreq);
  };

  Sound.prototype.setEnabled = function (on) {
    this.enabled = on;
    this.applyVolume();
  };

  Sound.prototype.setVolume = function (v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  };

  Sound.prototype.applyVolume = function () {
    if (!this.master) return;
    var v = this.enabled ? this.volume * 0.55 : 0;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  };

  /** 단일 음: { f, f2, d, type, v, delay, a } */
  Sound.prototype.tone = function (o) {
    if (!this.ctx || !this.enabled) return;
    var t0 = this.ctx.currentTime + (o.delay || 0);
    var osc = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + o.d);
    var vol = o.v === undefined ? 0.2 : o.v;
    var a = o.a || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + o.d + 0.05);
  };

  /** 잡음: { d, v, type, f, f2, q, delay } */
  Sound.prototype.noise = function (o) {
    if (!this.ctx || !this.enabled || !this.noiseBuf) return;
    var t0 = this.ctx.currentTime + (o.delay || 0);
    var src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    var filt = this.ctx.createBiquadFilter();
    filt.type = o.type || 'lowpass';
    filt.frequency.setValueAtTime(o.f || 2000, t0);
    if (o.f2) filt.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.d);
    filt.Q.value = o.q || 1;
    var g = this.ctx.createGain();
    var vol = o.v === undefined ? 0.2 : o.v;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.d);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.d + 0.05);
  };

  Sound.prototype.arp = function (freqs, step, type, v, d) {
    for (var i = 0; i < freqs.length; i++) {
      this.tone({ f: freqs[i], d: d || 0.18, type: type || 'triangle', v: v || 0.16, delay: i * step });
    }
  };

  Sound.prototype.play = function (name) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case 'consume':
        // 키가 소모되는 순간: 확실히 들리는 낮은 파열음
        this.tone({ f: 440, f2: 55, d: 0.32, type: 'sawtooth', v: 0.22 });
        this.tone({ f: 1760, f2: 880, d: 0.06, type: 'square', v: 0.12 });
        this.noise({ d: 0.22, v: 0.3, type: 'bandpass', f: 2400, f2: 300, q: 2 });
        break;
      case 'shatter':
        this.noise({ d: 0.12, v: 0.18, type: 'highpass', f: 3000 });
        this.tone({ f: 2600, f2: 1300, d: 0.08, type: 'square', v: 0.05 });
        break;
      case 'step':
        this.tone({ f: 160, f2: 120, d: 0.05, type: 'square', v: 0.06 });
        break;
      case 'jump':
        this.tone({ f: 280, f2: 620, d: 0.14, type: 'square', v: 0.12 });
        break;
      case 'land':
        this.noise({ d: 0.06, v: 0.12, type: 'lowpass', f: 600 });
        break;
      case 'deny':
        this.tone({ f: 110, d: 0.07, type: 'square', v: 0.12 });
        this.tone({ f: 98, d: 0.09, type: 'square', v: 0.12, delay: 0.08 });
        break;
      case 'restore':
        this.arp([392, 523, 659, 784, 1046], 0.06, 'triangle', 0.16, 0.25);
        break;
      case 'pickup':
        this.arp([660, 990], 0.06, 'square', 0.1, 0.12);
        break;
      case 'door':
        this.noise({ d: 0.5, v: 0.25, type: 'lowpass', f: 1200, f2: 120 });
        this.tone({ f: 90, f2: 60, d: 0.45, type: 'triangle', v: 0.2 });
        break;
      case 'switch':
        this.tone({ f: 880, d: 0.18, type: 'sine', v: 0.15 });
        this.tone({ f: 1320, d: 0.3, type: 'sine', v: 0.1, delay: 0.08 });
        this.noise({ d: 0.35, v: 0.1, type: 'lowpass', f: 800, f2: 200, delay: 0.1 });
        break;
      case 'checkpoint':
        this.arp([523, 784], 0.08, 'triangle', 0.12, 0.2);
        break;
      case 'rewind':
        this.tone({ f: 1400, f2: 180, d: 0.45, type: 'sawtooth', v: 0.12 });
        this.tone({ f: 700, f2: 90, d: 0.45, type: 'square', v: 0.06, delay: 0.03 });
        break;
      case 'clear':
        this.arp([523, 659, 784, 1046, 1318], 0.08, 'square', 0.1, 0.25);
        break;
      case 'gameover':
        this.tone({ f: 330, f2: 82, d: 0.8, type: 'sawtooth', v: 0.16 });
        this.noise({ d: 0.4, v: 0.15, type: 'lowpass', f: 900, f2: 100 });
        break;
      case 'core':
        this.tone({ f: 55, d: 2.4, type: 'sine', v: 0.3, a: 0.4 });
        this.tone({ f: 82.4, d: 2.4, type: 'sine', v: 0.18, a: 0.6 });
        this.noise({ d: 1.6, v: 0.12, type: 'lowpass', f: 400, f2: 60 });
        break;
      case 'select':
        this.tone({ f: 660, d: 0.07, type: 'square', v: 0.08 });
        break;
      case 'move':
        this.tone({ f: 440, d: 0.03, type: 'square', v: 0.05 });
        break;
      case 'pause':
        this.tone({ f: 330, f2: 220, d: 0.12, type: 'triangle', v: 0.1 });
        break;
      case 'tick':
        this.tone({ f: 1200 + Math.random() * 600, d: 0.05, type: 'square', v: 0.035 });
        break;
      case 'ending_forward':
        this.arp([262, 330, 392, 523, 659, 784], 0.32, 'triangle', 0.14, 1.4);
        break;
      case 'ending_ascend':
        this.arp([392, 494, 587, 784, 988, 1175], 0.28, 'sine', 0.16, 1.6);
        break;
      case 'ending_return':
        this.arp([392, 330, 262, 196, 165], 0.4, 'triangle', 0.14, 1.6);
        break;
      case 'ending_unlock':
        this.tone({ f: 131, d: 5, type: 'sine', v: 0.2, a: 0.8 });
        this.arp([262, 392, 523, 659, 784, 1046, 1318, 1568], 0.35, 'triangle', 0.13, 1.8);
        break;
      case 'ending_rewind':
        this.tone({ f: 2000, f2: 60, d: 2.2, type: 'sawtooth', v: 0.1 });
        this.arp([784, 659, 523, 392, 262], 0.25, 'square', 0.07, 0.6);
        break;
      case 'ending_keep':
        this.tone({ f: 220, d: 6, type: 'sine', v: 0.14, a: 1.5 });
        this.tone({ f: 330, d: 6, type: 'sine', v: 0.08, a: 2 });
        break;
      case 'ending_empty':
        this.tone({ f: 65, d: 4, type: 'sine', v: 0.22, a: 0.3 });
        this.noise({ d: 3, v: 0.08, type: 'lowpass', f: 300, f2: 40 });
        break;
    }
  };

  /** 스테이지 배경음: 낮게 울리는 지속음 (스테이지가 깊어질수록 낮아짐) */
  Sound.prototype.startDrone = function (freq) {
    this.droneFreq = freq;
    if (!this.ctx) return;
    this.stopDrone(true);
    var t0 = this.ctx.currentTime;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 2);
    var filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 320;
    var o1 = this.ctx.createOscillator();
    var o2 = this.ctx.createOscillator();
    var lfo = this.ctx.createOscillator();
    var lfoGain = this.ctx.createGain();
    o1.type = 'sawtooth';
    o2.type = 'sine';
    o1.frequency.value = freq;
    o2.frequency.value = freq * 1.498;
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain);
    lfoGain.connect(filt.frequency);
    o1.connect(filt);
    o2.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    o1.start();
    o2.start();
    lfo.start();
    this.drone = { g: g, nodes: [o1, o2, lfo] };
  };

  Sound.prototype.stopDrone = function (keepFreq) {
    if (!keepFreq) this.droneFreq = 0;
    if (!this.drone || !this.ctx) return;
    var d = this.drone;
    var t0 = this.ctx.currentTime;
    d.g.gain.cancelScheduledValues(t0);
    d.g.gain.setTargetAtTime(0.0001, t0, 0.3);
    d.nodes.forEach(function (n) {
      try {
        n.stop(t0 + 1.5);
      } catch (e) {}
    });
    this.drone = null;
  };

  TLK.Sound = Sound;
})();
