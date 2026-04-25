const defaultVoiceBackendFactory = () => {
  throw new Error('createVoiceBackend is required');
};

export const defaultControlState = {
  knobAngle: -Math.PI / 2,
  volume: 0.7,
  reverb: 0.4,
  position: 0.5,
};

const vibePresets = [
  { name: 'WARM', type: 'sawtooth', detune: 5 },
  { name: 'BRIGHT', type: 'square', detune: 10 },
  { name: 'COLD', type: 'sine', detune: 0 },
  { name: 'DARK', type: 'triangle', detune: -5 },
];

export const getVibeIndexFromAngle = (angle = defaultControlState.knobAngle) => {
  const degrees = (angle * 180) / Math.PI;
  const rotation = ((degrees + 90) % 360 + 360) % 360;

  return Math.round(rotation / 90) % vibePresets.length;
};

const createImpulseBuffer = (audioContext) => {
  const sampleRate = audioContext.sampleRate;
  const length = Math.floor(sampleRate * 2.4);
  const buffer = audioContext.createBuffer(2, length, sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, 2.4);
    }
  }

  return buffer;
};

export const createBrowserAudioSystem = ({
  initialControlState = defaultControlState,
} = {}) => {
  let audioContext = null;
  let analyser = null;
  let masterGain = null;
  let convolver = null;
  let wetGain = null;
  let controlState = { ...initialControlState };

  const ensureAudioGraph = () => {
    if (audioContext) {
      return audioContext;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    masterGain = audioContext.createGain();
    convolver = audioContext.createConvolver();
    wetGain = audioContext.createGain();
    convolver.buffer = createImpulseBuffer(audioContext);

    wetGain.connect(masterGain);
    convolver.connect(wetGain);
    masterGain.connect(analyser);
    analyser.connect(audioContext.destination);

    return audioContext;
  };

  const applyControlState = (nextState) => {
    controlState = { ...controlState, ...nextState };
    if (!audioContext) {
      return controlState;
    }

    masterGain.gain.setTargetAtTime(controlState.volume, audioContext.currentTime, 0.04);
    wetGain.gain.setTargetAtTime(controlState.reverb * 0.45, audioContext.currentTime, 0.08);

    return controlState;
  };

  const createVoiceBackend = ({ frequency, controlState: initialVoiceState }) => {
    let oscillator = null;
    let voiceGain = null;
    let wetSend = null;
    let panner = null;

    const applyVoiceState = (nextState) => {
      if (!oscillator || !voiceGain) {
        return;
      }

      const mergedState = { ...controlState, ...nextState };
      const vibe = vibePresets[getVibeIndexFromAngle(mergedState.knobAngle)];
      const currentTime = audioContext.currentTime;

      oscillator.type = vibe.type;
      oscillator.detune.setTargetAtTime(vibe.detune, currentTime, 0.03);
      wetSend.gain.setTargetAtTime(mergedState.reverb * 0.65, currentTime, 0.06);

      if (panner) {
        panner.pan.setTargetAtTime(mergedState.position * 2 - 1, currentTime, 0.06);
      }
    };

    return {
      start() {
        const context = ensureAudioGraph();
        oscillator = context.createOscillator();
        voiceGain = context.createGain();
        wetSend = context.createGain();
        panner = context.createStereoPanner ? context.createStereoPanner() : null;

        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        voiceGain.gain.setValueAtTime(0.0001, context.currentTime);

        oscillator.connect(voiceGain);
        if (panner) {
          voiceGain.connect(panner);
          panner.connect(masterGain);
        } else {
          voiceGain.connect(masterGain);
        }

        voiceGain.connect(wetSend);
        wetSend.connect(convolver);

        applyControlState(initialVoiceState);
        applyVoiceState(initialVoiceState);

        oscillator.start();
        voiceGain.gain.linearRampToValueAtTime(0.14, context.currentTime + 0.035);
      },
      stop() {
        if (!oscillator || !voiceGain) {
          return;
        }

        const currentTime = audioContext.currentTime;
        voiceGain.gain.cancelScheduledValues(currentTime);
        voiceGain.gain.setTargetAtTime(0.0001, currentTime, 0.08);
        oscillator.stop(currentTime + 0.16);
      },
      update(nextState) {
        applyVoiceState(nextState);
      },
    };
  };

  return {
    resume: async () => {
      const context = ensureAudioGraph();
      if (context.state === 'suspended') {
        await context.resume();
      }
    },
    applyControlState,
    createVoiceBackend,
    getAnalyserByteData() {
      if (!analyser) {
        return new Uint8Array(0);
      }

      const values = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(values);
      return values;
    },
    getControlState: () => ({ ...controlState }),
  };
};

export const createAudioEngine = ({
  frequencies,
  createVoiceBackend = defaultVoiceBackendFactory,
  initialControlState = defaultControlState,
  onControlStateChange,
}) => {
  const activeVoices = new Map();
  const controlState = { ...initialControlState };

  const notifyControlState = () => {
    const snapshot = { ...controlState };
    onControlStateChange?.(snapshot);
    activeVoices.forEach((voice) => {
      voice.update?.(snapshot);
    });
  };

  const startPadVoice = (padId) => {
    if (activeVoices.has(padId)) {
      return;
    }

    const frequency = frequencies[padId];
    if (!Number.isFinite(frequency)) {
      return;
    }

    const voice = createVoiceBackend({
      padId,
      frequency,
      controlState: { ...controlState },
    });
    voice.start();
    activeVoices.set(padId, voice);
  };

  const stopPadVoice = (padId) => {
    const voice = activeVoices.get(padId);
    if (!voice) {
      return;
    }

    voice.stop();
    activeVoices.delete(padId);
  };

  const stopAllVoices = () => {
    [...activeVoices.keys()].forEach((padId) => {
      stopPadVoice(padId);
    });
  };

  const setKnobAngle = (angle) => {
    controlState.knobAngle = angle;
    notifyControlState();
  };

  const setSliderValue = (key, value) => {
    controlState[key] = value;
    notifyControlState();
  };

  notifyControlState();

  return {
    startPadVoice,
    stopPadVoice,
    stopAllVoices,
    setKnobAngle,
    setSliderValue,
    getActiveVoiceIds: () => [...activeVoices.keys()],
    getControlState: () => ({ ...controlState }),
  };
};
