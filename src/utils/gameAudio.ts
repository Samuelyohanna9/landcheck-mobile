/**
 * Programmatic WAV tone generator + expo-av playback.
 * Generates sound effects as raw PCM, writes them to the app cache once,
 * then plays them with expo-av (low-latency replays via pre-loaded Sound objects).
 */
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";

const SR = 22050; // sample rate — small files, good quality for sfx
const CACHE = (FileSystem.cacheDirectory ?? "") + "gsounds/";

// ─── Pure base64 encoder (no btoa needed — works with all Hermes builds) ─────
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toB64(buf: Uint8Array): string {
  let out = "";
  const n = buf.length;
  for (let i = 0; i < n; i += 3) {
    const b0 = buf[i], b1 = buf[i + 1] ?? 0, b2 = buf[i + 2] ?? 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < n ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < n ? B64[b2 & 63] : "=";
  }
  return out;
}

// ─── WAV builder ─────────────────────────────────────────────────────────────
type Seg = {
  hz: number | null; // null = white noise
  ms: number;
  vol?: number;      // 0–1, default 0.72
  glide?: number;    // if set, freq slides from hz → glide
};

function buildWAV(segs: Seg[]): string {
  const totalSamples = segs.reduce((a, s) => a + Math.ceil((s.ms / 1000) * SR), 0);
  const buf = new ArrayBuffer(44 + totalSamples * 2);
  const dv = new DataView(buf);

  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); dv.setUint32(4, 36 + totalSamples * 2, true); str(8, "WAVE");
  str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, "data"); dv.setUint32(40, totalSamples * 2, true);

  let off = 44;
  for (const seg of segs) {
    const n = Math.ceil((seg.ms / 1000) * SR);
    const vol = seg.vol ?? 0.72;
    const attackN = Math.floor(SR * 0.006);
    const releaseN = Math.floor(SR * 0.018);
    for (let i = 0; i < n; i++) {
      const env = Math.min(i / Math.max(attackN, 1), 1) * Math.min((n - i) / Math.max(releaseN, 1), 1);
      let s: number;
      if (seg.hz === null) {
        s = (Math.random() * 2 - 1) * vol * env;
      } else {
        const freq = seg.glide !== undefined ? seg.hz + (seg.glide - seg.hz) * (i / n) : seg.hz;
        const t = i / SR;
        s = Math.sin(2 * Math.PI * freq * t) * vol * env;
      }
      dv.setInt16(off, Math.max(-32767, Math.min(32767, Math.round(s * 32767))), true);
      off += 2;
    }
  }
  return toB64(new Uint8Array(buf));
}

// ─── Sound definitions ────────────────────────────────────────────────────────
const DEFS: Record<string, Seg[]> = {
  // Satisfying major-chord pop — played each cascade pass
  match: [
    { hz: 523,  ms: 55  },         // C5
    { hz: 659,  ms: 55  },         // E5
    { hz: 784,  ms: 85, vol: 0.8 }, // G5
  ],
  // Ascending 4-note fill for combo chains
  cascade: [
    { hz: 392, ms: 45 },   // G4
    { hz: 523, ms: 45 },   // C5
    { hz: 659, ms: 45 },   // E5
    { hz: 784, ms: 75, vol: 0.85 }, // G5
  ],
  // Descending "dunk" for invalid swipe
  invalid: [
    { hz: 260, ms: 60, glide: 180, vol: 0.65 },
    { hz: 160, ms: 80, vol: 0.45 },
  ],
  // Victory fanfare — ascending arpeggio finish
  victory: [
    { hz: 523,  ms: 70  },  // C5
    { hz: 659,  ms: 70  },  // E5
    { hz: 784,  ms: 70  },  // G5
    { hz: 1047, ms: 230, vol: 0.85 }, // C6 — hold
  ],
  // Crisp vine snap
  snap: [
    { hz: null, ms: 22, vol: 0.45 },
    { hz: 900,  ms: 35, vol: 0.55, glide: 600 },
  ],
  // Rumbling bomb burst
  bomb: [
    { hz: null, ms: 90, vol: 0.9 },
    { hz: 80,   ms: 180, vol: 0.55, glide: 40 },
  ],
  // Electric lightning zap
  lightning: [
    { hz: 200,  ms: 50, glide: 2200, vol: 0.75 },
    { hz: null, ms: 40, vol: 0.35 },
    { hz: 1200, ms: 40, glide: 400, vol: 0.5 },
  ],
  // Quick swap slide
  swipe: [
    { hz: 880, ms: 35, vol: 0.4, glide: 1100 },
  ],
};

// ─── Pre-generated base64 (populated at init) ─────────────────────────────────
const B64_DATA: Record<string, string> = {};

// ─── Loaded Audio.Sound pool (one per sfx — reused via setPositionAsync) ─────
const POOL: Record<string, Audio.Sound | null> = {};
let _ready = false;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(CACHE);
  if (!info.exists) await FileSystem.makeDirectoryAsync(CACHE, { intermediates: true });
}

export async function initGameAudio() {
  if (_ready) return;
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    await ensureDir();

    for (const [name, segs] of Object.entries(DEFS)) {
      const path = CACHE + name + ".wav";
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) {
        const data = buildWAV(segs);
        B64_DATA[name] = data;
        await FileSystem.writeAsStringAsync(path, data, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      const { sound } = await Audio.Sound.createAsync({ uri: path }, { shouldPlay: false });
      POOL[name] = sound;
    }
    _ready = true;
  } catch {
    // Silent fail — game plays without sound
  }
}

export async function playSound(name: keyof typeof DEFS) {
  if (!_ready) return;
  const snd = POOL[name];
  if (!snd) return;
  try {
    await snd.setPositionAsync(0);
    await snd.playAsync();
  } catch {
    // If reuse fails, recreate
    try {
      const path = CACHE + name + ".wav";
      const { sound } = await Audio.Sound.createAsync({ uri: path }, { shouldPlay: true });
      POOL[name] = sound;
    } catch {}
  }
}
