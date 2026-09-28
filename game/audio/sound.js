// SlimeTetris Demo 音效模組(v26, round-11 修正)
// 全域物件 window.Sound; 不用 ES module(file:// 下會被擋)。
// 播放以 HTMLAudioElement 播放池為主, 不用 fetch / XHR。
// 要求即時的短音(目前: pageFlip)另內嵌 PCM, 以 Web Audio 播放; 沒有 Web Audio 時退回播放池。
// 事件名、呼叫時機與 opts 欄位見同資料夾的 sound.md。
(function () {
  'use strict';

  var BASE = 'audio/assets/'; // 相對於 index.html
  var POOL_SIZE = 4;

  // 份量等級: 1 最輕(操作) / 2 再來(消除、任務推進) / 3 其次(盤面大事件、過場獎勵) / 4 最重(升星、通關)
  // layers: 同一事件疊的素材; delay 單位秒
  var EVENTS = {
    rotate:        { tier: 1, layers: [{ file: 'rotate_tick.mp3', vol: 0.18 }] },
    lock:          { tier: 1, layers: [{ file: 'lock_drop.mp3', vol: 0.28 }] },
    hardDrop:      { tier: 1, layers: [{ file: 'hard_drop_thud.mp3', vol: 0.42 }, { file: 'lock_drop.mp3', vol: 0.18 }] },
    clear:         { tier: 2, layers: [{ file: 'clear_pop.mp3', vol: 0.55 }] },
    progress:      { tier: 2, layers: [{ file: 'progress_chime.mp3', vol: 0.6, delay: 0.09 }] },
    gravityLand:   { tier: 3, layers: [{ file: ['gravity_land_a.mp3', 'gravity_land_b.mp3'], vol: 0.75 }] },
    gravityNone:   { tier: 3, layers: [{ file: 'gravity_none_boop.mp3', vol: 0.55 }] },
    followupClear: { tier: 2, layers: [{ file: 'followup_clear_pop.mp3', vol: 0.48 }] },
    colorClear:    { tier: 3, layers: [{ file: 'color_clear_thump.mp3', vol: 0.8 }, { file: 'color_clear_sweep.mp3', vol: 0.75 }, { file: 'clear_pop.mp3', vol: 0.5, delay: 0.12, rate: 0.8 }] },
    expand:        { tier: 3, layers: [{ file: 'expand_widen.mp3', vol: 0.75 }] },
    newShape:      { tier: 3, layers: [{ file: 'new_shape_jingle.mp3', vol: 0.7 }] },
    trimTop:       { tier: 3, layers: [{ file: 'trim_top_swoosh.mp3', vol: 0.7 }] },
    starUp:        { tier: 4, duck: 1.0, layers: [{ file: 'star_up_jingle.mp3', vol: 0.9 }] },
    starMax:       { tier: 4, duck: 2.0, layers: [{ file: 'star_up_jingle.mp3', vol: 0.95 }, { file: 'star_max_layer.mp3', vol: 0.7 }, { file: 'star_max_shimmer.mp3', vol: 0.5, delay: 0.5 }, { file: 'star_max_shimmer.mp3', vol: 0.4, delay: 0.95, rate: 1.19 }] },
    taskReveal:    { tier: 2, layers: [{ file: 'task_reveal_pluck.mp3', vol: 0.5 }] },
    speedUp:       { tier: 3, layers: [{ file: 'speed_up_rise.mp3', vol: 0.45 }, { file: 'speed_up_rise.mp3', vol: 0.55, delay: 0.22, rate: 1.26 }] },
    win:           { tier: 4, layers: [{ file: 'win_jingle.mp3', vol: 1.0 }] },
    gameOver:      { tier: 3, layers: [{ file: 'game_over_jingle.mp3', vol: 0.75 }] },
    forfeit:       { tier: 2, layers: [{ file: 'forfeit_fold.mp3', vol: 0.5 }] },
    pageFlip:      { tier: 1, layers: [{ file: 'page_flip.mp3', vol: 0.5, pcm: 'pageFlip' }] }
  };

  // 內嵌 PCM: 16-bit little-endian 單聲道, base64。與 assets/ 同名 mp3 是同一段聲音(mp3 為後備)。
  // 直接填進 AudioBuffer, 不經 decodeAudioData, init 當下同步可用, 沒有解碼等待與 mp3 開頭填充。
  var PCM = {
    pageFlip: { rate: 24000, b64: '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' }
  };

  var MUSIC = {
    game:       { file: 'music_happy_lullaby.mp3', vol: 0.32 },
    gameDucked: { file: 'music_happy_lullaby.mp3', vol: 0.11 } // 暫停與局中說明: 同一首壓低, 不重頭
  };

  var FADE_MS = 400;
  var LIGHT_SUPPRESS_MS = 350; // 較重事件出聲後, 最輕一級在這段時間內降為一半
  var DUCK_RATIO = 0.45;       // 升星期間音樂壓到原本的比例

  var ready = false;
  var muted = false;
  var pools = {};      // file -> { els: [], next: 0 }
  var altIndex = {};   // 多檔輪替
  var lastHeavyAt = 0;
  var actx = null;      // Web Audio(只給內嵌 PCM 用)
  var masterGain = null;
  var pcmBuf = {};      // PCM 名 -> AudioBuffer

  var musicEl = null;
  var musicFile = null;
  var musicTarget = 0;  // 目前曲目的目標音量(未含 duck)
  var duckUntil = 0;
  var fadeTimer = null;
  var fadingOut = [];   // { el, timer }

  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  function safePlay(el) {
    try {
      var p = el.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) { /* 靜默 */ }
  }

  function makeEl(file) {
    var el = new Audio(BASE + file);
    el.preload = 'auto';
    el.muted = muted;
    return el;
  }

  function getPool(file) {
    var p = pools[file];
    if (!p) {
      p = { els: [], next: 0 };
      for (var i = 0; i < POOL_SIZE; i++) p.els.push(makeEl(file));
      pools[file] = p;
    }
    return p;
  }

  function playFile(file, vol, rate) {
    var p = getPool(file);
    var el = p.els[p.next];
    p.next = (p.next + 1) % p.els.length;
    try {
      el.pause();
      el.currentTime = 0;
    } catch (e) { /* 尚未載入時可能丟例外 */ }
    el.volume = Math.max(0, Math.min(1, vol));
    el.muted = muted;
    var r = rate || 1;
    try {
      el.preservesPitch = false; el.mozPreservesPitch = false; el.webkitPreservesPitch = false;
      el.playbackRate = r;
    } catch (e) { /* 不支援就用原速 */ }
    safePlay(el);
  }

  function pickFile(name, layerIdx, f) {
    if (typeof f === 'string') return f;
    var key = name + ':' + layerIdx;
    var i = altIndex[key] || 0;
    altIndex[key] = (i + 1) % f.length;
    return f[i];
  }

  function applyMusicVolume() {
    if (!musicEl) return;
    var v = musicTarget;
    if (now() < duckUntil) v *= DUCK_RATIO;
    musicEl.volume = Math.max(0, Math.min(1, v));
  }

  function rampMusic(from, to, ms, done) {
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
    var start = now();
    fadeTimer = setInterval(function () {
      var t = Math.min(1, (now() - start) / ms);
      musicTarget = from + (to - from) * t;
      applyMusicVolume();
      if (t >= 1) { clearInterval(fadeTimer); fadeTimer = null; if (done) done(); }
    }, 30);
  }

  function fadeOutAndStop(el, fromVol) {
    var start = now();
    var rec = { el: el, timer: null };
    rec.timer = setInterval(function () {
      var t = Math.min(1, (now() - start) / FADE_MS);
      try { el.volume = Math.max(0, fromVol * (1 - t)); } catch (e) {}
      if (t >= 1) {
        clearInterval(rec.timer);
        try { el.pause(); el.currentTime = 0; } catch (e) {}
        var i = fadingOut.indexOf(rec);
        if (i >= 0) fadingOut.splice(i, 1);
      }
    }, 30);
    fadingOut.push(rec);
  }

  function duckMusic(sec) {
    if (!musicEl) return;
    duckUntil = Math.max(duckUntil, now() + sec * 1000);
    applyMusicVolume();
    setTimeout(applyMusicVolume, sec * 1000 + 20);
  }

  function setupWebAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { actx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { actx = new AC(); } catch (e2) { actx = null; return; } }
    masterGain = actx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(actx.destination);
    for (var k in PCM) {
      try {
        var bin = atob(PCM[k].b64);
        var n = bin.length >> 1;
        var buf = actx.createBuffer(1, n, PCM[k].rate);
        var ch = buf.getChannelData(0);
        for (var i = 0; i < n; i++) {
          var v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
          if (v >= 32768) v -= 65536;
          ch[i] = v / 32768;
        }
        pcmBuf[k] = buf;
      } catch (e) { /* 這一段改走播放池 */ }
    }
    try { if (actx.resume) { var r = actx.resume(); if (r && r.catch) r.catch(function () {}); } } catch (e) {}
  }

  // 成功以 Web Audio 出聲回傳 true; 否則由呼叫端退回播放池
  function playPcm(key, vol, rate) {
    var buf = pcmBuf[key];
    if (!actx || !buf) return false;
    try {
      if (actx.state === 'suspended' && actx.resume) { var r = actx.resume(); if (r && r.catch) r.catch(function () {}); }
      var src = actx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate || 1;
      var g = actx.createGain();
      g.gain.value = Math.max(0, Math.min(1, vol));
      src.connect(g);
      g.connect(masterGain);
      src.start(0);
      return true;
    } catch (e) { return false; }
  }

  window.Sound = {
    init: function () {
      if (ready) return;
      ready = true;
      try { setupWebAudio(); } catch (e) { actx = null; }
      try {
        for (var n in EVENTS) {
          var ls = EVENTS[n].layers;
          for (var i = 0; i < ls.length; i++) {
            var f = ls[i].file;
            if (typeof f === 'string') getPool(f);
            else for (var j = 0; j < f.length; j++) getPool(f[j]);
          }
        }
      } catch (e) { /* 建池失敗不影響遊戲 */ }
    },

    play: function (name, opts) {
      if (!ready) return;
      var ev = EVENTS[name];
      if (!ev) return;
      try {
        var t = now();
        var scale = 1;
        if (ev.tier === 1 && t - lastHeavyAt < LIGHT_SUPPRESS_MS) scale = 0.5;
        if (ev.tier >= 3) lastHeavyAt = t;
        var index = (opts && typeof opts.index === 'number' && opts.index > 0) ? Math.min(opts.index, 8) : 0;
        var rateMul = (name === 'gravityLand') ? Math.pow(1.04, index) : 1; // 逐塊略升音高
        if (ev.duck) duckMusic(ev.duck);
        var ls = ev.layers;
        for (var i = 0; i < ls.length; i++) {
          (function (L, idx) {
            var file = pickFile(name, idx, L.file);
            var vol = L.vol * scale;
            var rate = (L.rate || 1) * rateMul;
            var go = function () { if (!(L.pcm && playPcm(L.pcm, vol, rate))) playFile(file, vol, rate); };
            if (L.delay) setTimeout(go, L.delay * 1000);
            else go();
          })(ls[i], i);
        }
      } catch (e) { /* 靜默 */ }
    },

    playMusic: function (name) {
      if (!ready) return;
      var m = MUSIC[name];
      if (!m) return;
      try {
        if (musicEl && musicFile === m.file) {
          // 同一首: 只調音量, 不重頭
          if (musicEl.paused) safePlay(musicEl);
          rampMusic(musicTarget, m.vol, FADE_MS);
          return;
        }
        if (musicEl) fadeOutAndStop(musicEl, musicEl.volume);
        musicEl = new Audio(BASE + m.file);
        musicEl.loop = true;
        musicEl.preload = 'auto';
        musicEl.muted = muted;
        musicFile = m.file;
        musicTarget = 0;
        musicEl.volume = 0;
        safePlay(musicEl);
        rampMusic(0, m.vol, FADE_MS);
      } catch (e) { /* 靜默 */ }
    },

    stopMusic: function () {
      if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
      if (!musicEl) return;
      try { musicEl.pause(); musicEl.currentTime = 0; } catch (e) {}
      musicEl = null;
      musicFile = null;
      musicTarget = 0;
    },

    setMuted: function (b) {
      muted = !!b;
      try {
        for (var f in pools) {
          var els = pools[f].els;
          for (var i = 0; i < els.length; i++) els[i].muted = muted;
        }
        if (masterGain) masterGain.gain.value = muted ? 0 : 1;
        if (musicEl) musicEl.muted = muted; // 音樂照常往下走, 只是不出聲
        for (var k = 0; k < fadingOut.length; k++) fadingOut[k].el.muted = muted;
      } catch (e) { /* 靜默 */ }
    },

    isMuted: function () { return muted; }
  };
})();
