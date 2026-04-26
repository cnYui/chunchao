export const strudelSourceHeader = `// block based Strudel engine - house friendly version

setcpm(128/4)

const vibe = {
  warm: note("<c4 e4 g4 b4> <a3 c4 e4 g4> <f3 a3 c4 e4> <g3 b3 d4 f4>")
    .s("triangle")
    .slow(2)
    .lpf(760).lpq(6)
    .attack(0.22).decay(0.65).sustain(0.44).release(1.8)
    .gain(0.32)
    .room(1.0),

  cold: note("<d4 f4 a4 c5> <bb3 d4 f4 a4> <g3 bb3 d4 f4> <a3 c4 e4 g4>")
    .s("triangle")
    .slow(2)
    .lpf(620).lpq(7)
    .attack(0.25).decay(0.7).sustain(0.42).release(1.9)
    .gain(0.3)
    .room(1.05),

  bright: note("<c4 e4 g4 b4> <d4 f#4 a4 c5> <e4 g4 b4 d5> <g4 b4 d5 f#5>")
    .s("triangle")
    .slow(2)
    .lpf(880).lpq(5)
    .attack(0.2).decay(0.6).sustain(0.42).release(1.7)
    .gain(0.3)
    .room(0.95),

  dark: note("<c3 eb3 g3 bb3> <ab2 c3 eb3 g3> <f2 ab2 c3 eb3> <g2 bb2 d3 f3>")
    .s("triangle")
    .slow(2)
    .lpf(520).lpq(7)
    .attack(0.25).decay(0.7).sustain(0.42).release(1.9)
    .gain(0.34)
    .room(1.05)
}

const bass = {
  walking: note("c2 e2 g2 b1 a1 c2 e2 g1 f1 a1 c2 e1 g1 b1 d2 f1")
    .s("sine").fast(2)
    .lpf(330)
    .legato(0.85)
    .gain(0.72),

  riff: note("c2 ~ eb2 g2 ~ g2 eb2 c2 a1 ~ c2 e2 g1 ~ b1 d2")
    .s("sawtooth").fast(2)
    .lpf(430)
    .legato(0.72)
    .gain(0.58),

  sidechain: note("c2 ~ c2 ~ a1 ~ a1 ~ f1 ~ f1 ~ g1 ~ g1 ~")
    .s("sine")
    .lpf(300)
    .legato(1.25)
    .gain("0.78 0.25 0.74 0.24")
    .gain(0.75),

  drone: note("c2!16")
    .s("sine")
    .lpf(240)
    .legato(1.6)
    .gain("0.5 0.28 0.48 0.26")
}

const rhythm = {
  fourfour: stack(
    s("bd:1")
      .struct("x x x x")
      .gain(0.78),

    s("sd:2")
      .struct("~ ~ x ~")
      .gain(0.42)
      .room(0.45),

    s("hh:3")
      .struct("x*8")
      .gain("0.08 0.14 0.06 0.12")
      .hpf(6000),

    s("oh:1")
      .struct("~ x ~ x")
      .gain(0.12)
      .hpf(5200)
      .delay(0.08)
  ),

  breakbeat: stack(
    s("bd:1")
      .struct("x ~ ~ x ~ ~ x ~")
      .gain(0.72),

    s("sd:2")
      .struct("~ ~ x ~ ~ ~ x ~")
      .gain(0.45)
      .room(0.4),

    s("hh:3")
      .struct("x*8")
      .gain("0.08 0.16 0.06 0.14")
      .hpf(5800)
  ),

  backbeat: stack(
    s("bd:1")
      .struct("x ~ ~ ~")
      .gain(0.75),

    s("sd:2")
      .struct("~ x ~ x")
      .gain(0.4)
      .room(0.5),

    s("hh:3")
      .struct("~ x ~ x")
      .gain("0.08 0.14 0.06 0.12")
      .hpf(5200)
  ),

  halftime: stack(
    s("bd:1")
      .struct("x ~ ~ ~")
      .gain(0.7),

    s("sd:2")
      .struct("~ ~ x ~")
      .gain(0.42)
      .room(0.6),

    s("hh:3")
      .struct("~ x ~ x")
      .gain("0.06 0.12 0.05 0.1")
      .hpf(5000)
  )
}

const style = {
  hiphop: stack(
    s("bd:1")
      .struct("~ ~ x ~")
      .gain(0.18),

    s("sd:2")
      .struct("~ ~ ~ x")
      .gain(0.25)
      .room(0.4),

    s("hh:3")
      .struct("~ x ~ x ~ x ~ x")
      .gain("0.08 0.16 0.06 0.14")
      .hpf(5000)
  ),

  rnb: stack(
    s("bd:1")
      .struct("~ x ~ ~")
      .gain(0.22),

    s("sd:2")
      .struct("~ ~ ~ x")
      .gain(0.26)
      .room(0.5),

    s("hh:3")
      .struct("~ x ~ x")
      .gain("0.1 0.18 0.08 0.16")
      .hpf(4600)
      .delay(0.04)
  ),

  electronic: stack(
    s("hh:3")
      .struct("x*8")
      .gain("0.08 0.14 0.06 0.12")
      .hpf(5200),

    s("oh:1")
      .struct("~ x ~ x")
      .gain(0.12)
      .delay(0.1),

    s("cp:1")
      .struct("~ ~ x ~")
      .gain(0.28)
      .room(0.35)
  )
}

const melody = {
  lyrical: note("~ e4 g4 b4 ~ a4 g4 e4")
    .s("triangle").slow(2)
    .attack(0.14).decay(0.42).sustain(0.28).release(1.1)
    .lpf(850)
    .gain(0.2)
    .delay(0.3).delayfeedback(0.38)
    .room(1),

  dance: note("~ e5 g5 b4 c5 ~ g5 e5")
    .s("triangle").slow(2)
    .attack(0.05).decay(0.26).sustain(0.22).release(0.65)
    .lpf(1100)
    .gain(0.22)
    .delay(0.2).delayfeedback(0.25)
    .room(0.75),

  instrumental: note("c5 ~ e5 g5 ~ b4 a4 g4")
    .s("triangle").slow(2)
    .attack(0.1).decay(0.4).sustain(0.26).release(1)
    .lpf(900)
    .gain(0.2)
    .delay(0.26).delayfeedback(0.32)
    .room(0.9),

  recitative: note("~ d4 f4 a4 ~ g4 f4 d4")
    .s("triangle").slow(2)
    .attack(0.16).decay(0.5).sustain(0.24).release(1.35)
    .lpf(700)
    .gain(0.19)
    .delay(0.32).delayfeedback(0.35)
    .room(1.05)
}`;

export const vibeOrder = ['warm', 'bright', 'cold', 'dark'];

export const defaultMixerState = {
  volume: 0.7,
  reverb: 0.4,
  position: 0.5,
};

export const gridPatternKeys = [
  'walking', 'riff', 'sidechain', 'drone',
  'fourfour', 'breakbeat', 'backbeat', 'halftime',
  'hiphop', 'rnb', 'electronic', null,
  'lyrical', 'dance', 'instrumental', 'recitative',
];

const patternKeyToReference = {
  walking: 'bass.walking',
  riff: 'bass.riff',
  sidechain: 'bass.sidechain',
  drone: 'bass.drone',
  fourfour: 'rhythm.fourfour',
  breakbeat: 'rhythm.breakbeat',
  backbeat: 'rhythm.backbeat',
  halftime: 'rhythm.halftime',
  hiphop: 'style.hiphop',
  rnb: 'style.rnb',
  electronic: 'style.electronic',
  lyrical: 'melody.lyrical',
  dance: 'melody.dance',
  instrumental: 'melody.instrumental',
  recitative: 'melody.recitative',
};

export const getVibeKeyFromIndex = (index) => vibeOrder[index] ?? vibeOrder[0];

export const getGridCellPatternKey = (index) => gridPatternKeys[index] ?? null;

export const createOccupiedGridCode = ({
  vibeKey,
  occupied,
  volume = defaultMixerState.volume,
  reverb = defaultMixerState.reverb,
  position = defaultMixerState.position,
}) => {
  const activeLayers = occupied
    .map((active, index) => (active ? getGridCellPatternKey(index) : null))
    .filter(Boolean)
    .map((key) => patternKeyToReference[key]);

  const stackLayers = [`vibe.${vibeKey}`, ...activeLayers];
  const stackBody = stackLayers
    .map((layer, index) => `  ${layer}${index === stackLayers.length - 1 ? '' : ','}`)
    .join('\n');

  return `${strudelSourceHeader}

stack(
${stackBody}
)
  .gain(${volume})
  .room(${reverb})
  .pan(${position * 2 - 1})`;
};

export const createStrudelRuntimeState = () => {
  const state = {
    vibeKey: vibeOrder[0],
    occupied: Array.from({ length: gridPatternKeys.length }, () => false),
    ...defaultMixerState,
  };

  return {
    getState() {
      return {
        vibeKey: state.vibeKey,
        occupied: [...state.occupied],
      };
    },
    setVibeByIndex(index) {
      state.vibeKey = getVibeKeyFromIndex(index);
    },
    setOccupied(index, active) {
      if (index < 0 || index >= state.occupied.length) {
        return;
      }

      state.occupied[index] = Boolean(active);
    },
    setControlValue(key, value) {
      if (!['volume', 'reverb', 'position'].includes(key) || !Number.isFinite(value)) {
        return;
      }

      state[key] = value;
    },
    getCommand() {
      if (!state.occupied.some(Boolean)) {
        return 'hush()';
      }

      return createOccupiedGridCode(state);
    },
  };
};
