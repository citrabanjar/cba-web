// Efek suara desain OTP 70 (Liquid Glass Morph) — port dari utils/sounds.js (Web Audio API).
// AudioContext dibuat malas: hanya ketika fungsi suara dipanggil (dari interaksi pengguna / timer sesudahnya),
// tidak pernah saat render atau SSR. Semua kegagalan diabaikan diam-diam.

type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const w = window as WindowWithWebkitAudio;
    const Ctor = window.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
  return ctx;
}

// Nada naik untuk setiap angka yang diketik — seperti air yang makin penuh.
let digitCount = 0;
export function playDrop(): void {
  try {
    const ac = getAudioContext();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();

    const baseFreq = 400 + digitCount * 200;
    digitCount = (digitCount + 1) % 4;

    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ac.currentTime + 0.08);

    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, ac.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.start();
    osc.stop(ac.currentTime + 0.08);
  } catch {
    // diam
  }
}

// Rangkaian gelembung rendah saat kotak menyatu ("glug-glug").
export function playSplash(): void {
  try {
    const ac = getAudioContext();
    if (!ac) return;

    const playBubble = (delay: number, baseFreq: number, duration: number) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(baseFreq, ac.currentTime + delay);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, ac.currentTime + delay + duration);

      gain.gain.setValueAtTime(0, ac.currentTime + delay);
      gain.gain.linearRampToValueAtTime(0.2, ac.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + delay + duration);

      osc.connect(gain);
      gain.connect(ac.destination);

      osc.start(ac.currentTime + delay);
      osc.stop(ac.currentTime + delay + duration);
    };

    playBubble(0, 150, 0.15);
    playBubble(0.12, 200, 0.12);
    playBubble(0.25, 250, 0.1);
  } catch {
    // diam
  }
}

// Desis air mengisi kartu (noise + lowpass yang membuka).
export function playFill(): void {
  try {
    const ac = getAudioContext();
    if (!ac) return;
    const duration = 1.2;
    const bufferSize = Math.floor(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ac.createBufferSource();
    noise.buffer = buffer;

    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(200, ac.currentTime);
    filter.frequency.exponentialRampToValueAtTime(1500, ac.currentTime + duration);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ac.currentTime + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, ac.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);

    noise.start();
  } catch {
    // diam
  }
}

// Akor C mayor naik saat berhasil.
export function playSuccess(): void {
  try {
    const ac = getAudioContext();
    if (!ac) return;
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;

      const startTime = ac.currentTime + i * 0.08;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.1, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 1.5);

      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(startTime);
      osc.stop(startTime + 1.5);
    });
  } catch {
    // diam
  }
}
