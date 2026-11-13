(() => {
  "use strict";

  const musicButton = document.getElementById("musicToggle");
  const themeButton = document.getElementById("themeToggle");
  if (!musicButton || !themeButton) return;

  const themeKey = "one-life-theme";
  const musicKey = "one-life-music";
  const root = document.body;
  const embedded = window.parent !== window;
  const chords = [
    [130.81, 164.81, 196, 246.94],
    [110, 130.81, 164.81, 196],
    [87.31, 110, 130.81, 174.61],
    [98, 123.47, 146.83, 196]
  ];
  const melody = [392, 493.88, 587.33, 493.88, 440, 523.25, 659.25, 523.25];
  let audioContext = null;
  let masterGain = null;
  let padVoices = [];
  let musicTimer = null;
  let musicEnabled = false;
  let musicStarting = false;
  let audioOperation = 0;
  let beat = 0;
  let chordIndex = 0;
  const melodyVoices = new Set();

  function readPreference(key, fallback) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch (error) {
      console.warn(`อ่านการตั้งค่า ${key} ไม่ได้`, error);
      return fallback;
    }
  }

  function savePreference(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`บันทึกการตั้งค่า ${key} ไม่ได้`, error);
    }
  }

  function updateTheme(theme) {
    root.dataset.theme = theme;
    const isLight = theme === "light";
    themeButton.setAttribute("aria-pressed", String(isLight));
    themeButton.textContent = isLight ? "🌙 เปลี่ยนเป็นโหมดมืด" : "☀️ เปลี่ยนเป็นโหมดสว่าง";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isLight ? "#edf4fb" : "#070b16");
  }

  function updateMusic(isPlaying) {
    musicEnabled = isPlaying;
    musicButton.setAttribute("aria-pressed", String(isPlaying));
    musicButton.textContent = isPlaying ? "♫ เพลง: เปิด" : "♫ เพลง: ปิด";
  }

  function setChord(index) {
    const chord = chords[index % chords.length];
    const now = audioContext.currentTime;
    padVoices.forEach((voice, voiceIndex) => {
      voice.frequency.setTargetAtTime(chord[voiceIndex], now, 0.8);
    });
  }

  function playNote(frequency, startAt) {
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1500, startAt);
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.exponentialRampToValueAtTime(0.035, startAt + 0.035);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.15);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(masterGain);
    oscillator.start(startAt);
    oscillator.stop(startAt + 1.2);
    melodyVoices.add(oscillator);
    oscillator.addEventListener("ended", () => melodyVoices.delete(oscillator), { once: true });
  }

  function playBeat() {
    if (!audioContext || audioContext.state !== "running") return;
    if (beat > 0 && beat % 8 === 0) {
      chordIndex = (chordIndex + 1) % chords.length;
      setChord(chordIndex);
    }
    if (beat % 2 === 0) {
      playNote(melody[(beat / 2) % melody.length], audioContext.currentTime + 0.04);
    }
    beat += 1;
  }

  function createMusic() {
    if (padVoices.length > 0) return;
    const pad = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    pad.gain.value = 0.22;
    filter.connect(pad);
    pad.connect(masterGain);
    padVoices = chords[chordIndex].map((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const voiceGain = audioContext.createGain();
      oscillator.type = index === 0 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      voiceGain.gain.value = index === 0 ? 0.09 : 0.055;
      oscillator.connect(voiceGain);
      voiceGain.connect(filter);
      oscillator.start();
      return oscillator;
    });
  }

  async function startMusic() {
    if (musicEnabled || musicStarting) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      musicButton.textContent = "♫ ไม่รองรับเสียง";
      return;
    }
    musicStarting = true;
    const operation = ++audioOperation;
    try {
      if (!audioContext || audioContext.state === "closed") {
        audioContext = new AudioContextClass();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.0001;
        masterGain.connect(audioContext.destination);
      }
      await audioContext.resume();
      if (operation !== audioOperation) return;
      createMusic();
      masterGain.gain.cancelScheduledValues(audioContext.currentTime);
      masterGain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(0.42, audioContext.currentTime + 1.5);
      musicStarting = false;
      updateMusic(true);
      playBeat();
      musicTimer = window.setInterval(playBeat, 600);
      savePreference(musicKey, "on");
      sendMusicState(true);
    } catch (error) {
      if (operation !== audioOperation) return;
      musicStarting = false;
      updateMusic(false);
      console.error("เริ่มเล่นเพลงไม่ได้", error);
    }
  }

  function sendMusicState(isPlaying) {
    if (embedded) {
      window.parent.postMessage({ type: "one-life-music-state", playing: isPlaying }, "*");
      return;
    }
    document.getElementById("lifeAppFrame")?.contentWindow?.postMessage({
      type: "one-life-music-state",
      playing: isPlaying
    }, "*");
  }

  function stopMusic() {
    musicEnabled = false;
    musicStarting = false;
    audioOperation += 1;
    if (musicTimer !== null) window.clearInterval(musicTimer);
    musicTimer = null;
    updateMusic(false);
    savePreference(musicKey, "off");
    sendMusicState(false);
    const contextToClose = audioContext;
    const output = masterGain;
    const voices = [...padVoices, ...melodyVoices];
    audioContext = null;
    masterGain = null;
    padVoices = [];
    melodyVoices.clear();
    for (const voice of voices) {
      try {
        voice.stop();
      } catch (error) {
        if (error.name !== "InvalidStateError") console.error("หยุดแหล่งเสียงไม่ได้", error);
      }
      voice.disconnect();
    }
    output?.disconnect();
    if (contextToClose && contextToClose.state !== "closed") {
      contextToClose.close().catch(error => console.error("ปิด AudioContext ไม่ได้", error));
    }
    beat = 0;
    chordIndex = 0;
  }

  const defaultTheme = root.classList.contains("life-app") ? "light" : "dark";
  updateTheme(readPreference(themeKey, defaultTheme) === "light" ? "light" : "dark");
  updateMusic(embedded && readPreference(musicKey, "off") === "on");
  if (!embedded) savePreference(musicKey, "off");

  themeButton.addEventListener("click", () => {
    const theme = root.dataset.theme === "light" ? "dark" : "light";
    updateTheme(theme);
    savePreference(themeKey, theme);
  });

  musicButton.addEventListener("click", () => {
    if (embedded) {
      const shouldPlay = !musicEnabled;
      updateMusic(shouldPlay);
      window.parent.postMessage({
        type: "one-life-music-command",
        command: shouldPlay ? "play" : "pause"
      }, "*");
    } else if (musicEnabled) {
      stopMusic();
    } else {
      void startMusic();
    }
  });

  if (embedded) {
    window.addEventListener("message", event => {
      if (event.source !== window.parent) return;
      if (event.data?.type === "one-life-music-state") updateMusic(event.data.playing);
      if (event.data?.type === "one-life-music-command") {
        if (event.data.command === "pause") stopMusic();
        if (event.data.command === "play") void startMusic();
      }
    });
    window.parent.postMessage({ type: "one-life-music-request-state" }, "*");
    document.addEventListener("click", event => {
      const link = event.target.closest('a[href="index.html"]');
      if (!link) return;
      event.preventDefault();
      window.parent.postMessage({ type: "one-life-return-lobby" }, "*");
    });
  } else {
    window.addEventListener("message", event => {
      const frame = document.getElementById("lifeAppFrame");
      if (!frame || event.source !== frame.contentWindow) return;
      if (event.data?.type === "one-life-music-request-state") sendMusicState(musicEnabled);
      if (event.data?.type === "one-life-return-lobby") {
        frame.remove();
        return;
      }
      if (event.data?.type === "one-life-music-command") {
        if (event.data.command === "pause") stopMusic();
        if (event.data.command === "play") void startMusic();
      }
    });
  }
})();
