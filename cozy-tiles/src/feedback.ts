// A small Web Audio kit: no external files, no dependencies.
// Feedback never blocks or changes game rules.
type Vibrate = (pattern: number | number[]) => boolean;

export class FeedbackKit {
  private context: AudioContext | null = null;
  muted: boolean;
  vibration: boolean;
  vibrate: Vibrate;

  constructor(muted = false, vibration = true, vibrate: Vibrate = () => false) {
    this.muted = muted; this.vibration = vibration; this.vibrate = vibrate;
  }

  configure(settings: { sound: boolean; vibration: boolean }) {
    this.muted = !settings.sound; this.vibration = settings.vibration;
  }

  private hum(frequencies: number[], seconds: number, gainValue = 0.08) {
    if (this.muted) return;
    try {
      this.context ??= new window.AudioContext();
      if (this.context.state === "suspended") void this.context.resume();
      const start = this.context.currentTime + 0.01;
      frequencies.forEach((frequency, index) => {
        const gain = this.context!.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
        const tone = this.context!.createOscillator();
        tone.type = "sine";
        tone.frequency.value = frequency;
        tone.connect(gain).connect(this.context!.destination);
        tone.start(start + index * seconds * 0.6);
        tone.stop(start + seconds + index * seconds * 0.6);
        gain.gain.setValueAtTime(0.0001, start + seconds + index * seconds * 0.6);
      });
    } catch { /* Audio is optional feedback. */ }
  }

  private tap(pattern: number[]) {
    if (!this.vibration) return;
    try { this.vibrate(pattern); } catch { /* Vibration is optional feedback. */ }
  }

  pick() { this.hum([520], 0.08); this.tap([12]); }
  match() { this.hum([660, 880], 0.16, 0.09); this.tap([18, 40, 18]); }
  booster() { this.hum([740, 988], 0.14, 0.07); this.tap([24, 40, 24]); }
  slot() { this.hum([523, 784], 0.18, 0.08); this.tap([10, 30, 10]); }
  hint() { this.hum([880, 1174], 0.12, 0.06); this.tap([10]); }
  thaw() { this.hum([392, 294], 0.12, 0.05); this.tap([8, 30, 8]); }
  deny() { this.hum([240], 0.09, 0.05); this.tap([8, 40, 8]); }
  warn() { this.hum([440, 349], 0.2, 0.06); this.tap([12, 60, 12]); }
  fail() { this.hum([300, 210], 0.24, 0.06); this.tap([26, 60, 26]); }
  win() { this.hum([523, 659, 784, 1047, 1319], 0.2, 0.09); this.tap([14, 40, 14, 40, 28]); }
  silence() { try { void this.context?.close(); } catch { /* already closed */ } this.context = null; }
}

export const feedback = new FeedbackKit();