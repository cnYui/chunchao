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
  { name: 'WARM', type: 'sawtooth', detune: 5, cutoffScale: 1 },
  { name: 'BRIGHT', type: 'square', detune: 10, cutoffScale: 1.35 },
  { name: 'COLD', type: 'sine', detune: 0, cutoffScale: 1.1 },
  { name: 'DARK', type: 'triangle', detune: -5, cutoffScale: 0.62 },
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

const createNoiseBuffer = (audioContext, duration = 0.2) => {
  const sampleRate = audioContext.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = audioContext.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  return buffer;
};

const normalizePadSounds = ({ frequencies = [], padSounds = [] }) => {
  if (padSounds.length) {
    return padSounds.map((sound, index) => ({
      ...sound,
      frequency: sound.frequency ?? frequencies[index],
    }));
  }

  return frequencies.map((frequency, index) => ({
    key: `tone-${index + 1}`,
    label: `TONE ${index + 1}`,
    frequency,
  }));
};

const getVoicePreset = ({ frequency, sound }) => ({
  key: sound?.key ?? 'tone',
  frequency: sound?.frequency ?? frequency,
  oscillatorType: sound?.oscillatorType ?? 'sawtooth',
  gain: sound?.gain ?? 0.14,
  sustain: sound?.sustain ?? 0.1,
  attack: sound?.attack ?? 0.012,
  release: sound?.release ?? 0.16,
  filterType: sound?.filterType ?? 'lowpass',
  filterFrequency: sound?.filterFrequency ?? 1800,
  filterQ: sound?.filterQ ?? 0.9,
  detune: sound?.detune ?? 0,
  pitchBendCents: sound?.pitchBendCents ?? 0,
  bendTime: sound?.bendTime ?? 0.08,
  secondaryFrequencyRatio: sound?.secondaryFrequencyRatio ?? null,
  secondaryGain: sound?.secondaryGain ?? 0,
  noiseGain: sound?.noiseGain ?? 0,
  noiseDuration: sound?.noiseDuration ?? 0.12,
});

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

  const createVoiceBackend = ({ frequency, sound, controlState: initialVoiceState }) => {
    const preset = getVoicePreset({ frequency, sound });
    let oscillator = null;
    let secondaryOscillator = null;
    let secondaryGain = null;
    let voiceGain = null;
    let wetSend = null;
    let panner = null;
    let filter = null;
    const stoppableSources = [];

    const applyVoiceState = (nextState) => {
      if (!oscillator || !voiceGain) {
        return;
      }

      const mergedState = { ...controlState, ...nextState };
      const vibeIndex = getVibeIndexFromAngle(mergedState.knobAngle);
      const vibe = vibePresets[vibeIndex];
      const currentTime = audioContext.currentTime;

      oscillator.type = preset.oscillatorType ?? vibe.type;
      oscillator.detune.setTargetAtTime(preset.detune + vibe.detune, currentTime, 0.03);
      if (secondaryOscillator) {
        secondaryOscillator.type = vibe.type;
        secondaryOscillator.detune.setTargetAtTime(preset.detune - vibe.detune, currentTime, 0.03);
      }
      if (filter) {
        filter.frequency.setTargetAtTime(preset.filterFrequency * vibe.cutoffScale, currentTime, 0.06);
        filter.Q.setTargetAtTime(preset.filterQ, currentTime, 0.06);
      }
      wetSend.gain.setTargetAtTime(mergedState.reverb * 0.65, currentTime, 0.06);

      if (panner) {
        panner.pan.setTargetAtTime(mergedState.position * 2 - 1, currentTime, 0.06);
      }
    };

    return {
      start() {
        const context = ensureAudioGraph();
        const currentTime = context.currentTime;
        const baseFrequency = Math.max(1, preset.frequency);
        const bendStartFrequency = Math.max(1, baseFrequency * (2 ** (preset.pitchBendCents / 1200)));
        oscillator = context.createOscillator();
        filter = context.createBiquadFilter();
        voiceGain = context.createGain();
        wetSend = context.createGain();
        panner = context.createStereoPanner ? context.createStereoPanner() : null;

        filter.type = preset.filterType;
        filter.frequency.setValueAtTime(preset.filterFrequency, currentTime);
        filter.Q.setValueAtTime(preset.filterQ, currentTime);

        oscillator.frequency.setValueAtTime(bendStartFrequency, currentTime);
        if (preset.pitchBendCents) {
          oscillator.frequency.exponentialRampToValueAtTime(baseFrequency, currentTime + preset.bendTime);
        }
        voiceGain.gain.setValueAtTime(0.0001, currentTime);

        oscillator.connect(filter);
        filter.connect(voiceGain);

        if (preset.secondaryFrequencyRatio && preset.secondaryGain > 0) {
          secondaryOscillator = context.createOscillator();
          secondaryGain = context.createGain();
          secondaryOscillator.frequency.setValueAtTime(
            Math.max(1, baseFrequency * preset.secondaryFrequencyRatio),
            currentTime,
          );
          secondaryGain.gain.setValueAtTime(preset.secondaryGain, currentTime);
          secondaryOscillator.connect(secondaryGain);
          secondaryGain.connect(filter);
        }

        if (preset.noiseGain > 0) {
          const noiseSource = context.createBufferSource();
          const noiseFilter = context.createBiquadFilter();
          const noiseGain = context.createGain();

          noiseSource.buffer = createNoiseBuffer(context, preset.noiseDuration);
          noiseFilter.type = preset.filterType === 'highpass' ? 'highpass' : 'bandpass';
          noiseFilter.frequency.setValueAtTime(preset.filterFrequency, currentTime);
          noiseFilter.Q.setValueAtTime(Math.max(0.8, preset.filterQ), currentTime);
          noiseGain.gain.setValueAtTime(preset.noiseGain, currentTime);
          noiseGain.gain.exponentialRampToValueAtTime(0.0001, currentTime + preset.noiseDuration);
          noiseSource.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
          noiseGain.connect(filter);
          noiseSource.start(currentTime);
          noiseSource.stop(currentTime + preset.noiseDuration + 0.02);
          stoppableSources.push(noiseSource);
        }

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
        secondaryOscillator?.start();
        voiceGain.gain.linearRampToValueAtTime(preset.gain, currentTime + preset.attack);
        voiceGain.gain.setTargetAtTime(preset.sustain, currentTime + preset.attack, 0.08);
      },
      stop() {
        if (!oscillator || !voiceGain) {
          return;
        }

        const currentTime = audioContext.currentTime;
        voiceGain.gain.cancelScheduledValues(currentTime);
        voiceGain.gain.setTargetAtTime(0.0001, currentTime, preset.release);
        oscillator.stop(currentTime + preset.release + 0.08);
        secondaryOscillator?.stop(currentTime + preset.release + 0.08);
        stoppableSources.forEach((source) => {
          try {
            source.stop(currentTime);
          } catch {
            // source 可能已经按自身包络结束，这里只负责补停止。
          }
        });
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
  frequencies = [],
  padSounds = [],
  createVoiceBackend = defaultVoiceBackendFactory,
  initialControlState = defaultControlState,
  onControlStateChange,
}) => {
  const activeVoices = new Map();
  const controlState = { ...initialControlState };
  const resolvedPadSounds = normalizePadSounds({ frequencies, padSounds });

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

    const sound = resolvedPadSounds[padId];
    const frequency = sound?.frequency;
    if (!Number.isFinite(frequency)) {
      return;
    }

    const voice = createVoiceBackend({
      padId,
      frequency,
      sound,
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
    getPadSounds: () => resolvedPadSounds.map((sound) => ({ ...sound })),
  };
};
