// SlimeTetris Demo 音效模組(v26)
// 全域物件 window.Sound; 不用 ES module(file:// 下會被擋)。
// 播放一律用 HTMLAudioElement 播放池, 不用 fetch / XHR。
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
    pageFlip:      { tier: 1, layers: [{ file: 'page_flip.mp3', vol: 0.45 }] }
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

  window.Sound = {
    init: function () {
      if (ready) return;
      ready = true;
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
            if (L.delay) setTimeout(function () { playFile(file, vol, rate); }, L.delay * 1000);
            else playFile(file, vol, rate);
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
        if (musicEl) musicEl.muted = muted; // 音樂照常往下走, 只是不出聲
        for (var k = 0; k < fadingOut.length; k++) fadingOut[k].el.muted = muted;
      } catch (e) { /* 靜默 */ }
    },

    isMuted: function () { return muted; }
  };
})();
