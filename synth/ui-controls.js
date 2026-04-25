import { getVibeIndexFromAngle } from './audio-engine.js';

export const createUiControls = (root = document) => {
  const stage = root.querySelector('.stage-console');
  const knob = root.querySelector('#knob');
  const waveBars = [...root.querySelectorAll('.wave-bar')];
  const padElements = [...root.querySelectorAll('.pad-btn')];
  const knobLabels = [
    root.querySelector('#lbl-warm'),
    root.querySelector('#lbl-bright'),
    root.querySelector('#lbl-cold'),
    root.querySelector('#lbl-dark'),
  ];
  const sliderTracks = new Map(
    [...root.querySelectorAll('.slider-track')].map((element) => [element.dataset.param, element]),
  );

  return {
    getStageRect: () => stage.getBoundingClientRect(),
    getPadElements: () => padElements,
    getKnobRect: () => knob.getBoundingClientRect(),
    getSliderRect: (key) => {
      return sliderTracks.get(key)?.querySelector('.slider-fill-wrapper')?.getBoundingClientRect() ?? null;
    },
    setKnobAngle: (angleInRadians) => {
      const degrees = Math.round((angleInRadians * 180) / Math.PI + 90);
      const vibeIndex = getVibeIndexFromAngle(angleInRadians);

      knob.style.transform = `rotate(${degrees}deg)`;
      knob.dataset.angle = String(angleInRadians);
      knobLabels.forEach((label, index) => {
        label?.classList.toggle('active', index === vibeIndex);
      });
    },
    setSliderValue: (key, value) => {
      const track = sliderTracks.get(key);
      if (!track) {
        return;
      }

      const fill = track.querySelector('.slider-fill');
      const thumb = track.querySelector('.slider-thumb');
      const display = track.querySelector('.slider-value');
      const percent = Math.max(0, Math.min(100, Math.round(value * 100)));

      track.dataset.value = String(percent);
      fill.style.height = `${percent}%`;
      thumb.style.bottom = `calc(${percent}% - 6px)`;
      display.textContent = String(percent);
    },
    setPadActive: (index, active) => {
      const pad = padElements[index];
      if (!pad) {
        return;
      }

      pad.dataset.active = active ? 'true' : 'false';
      pad.style.boxShadow = active
        ? '0 0 0 1px rgba(255, 208, 174, 0.8), 0 0 26px rgba(255, 96, 58, 0.6), inset 0 0 28px rgba(255, 84, 46, 0.25)'
        : '';
      pad.style.transform = active ? 'translateY(-1px)' : '';
      pad.style.filter = active ? 'brightness(1.18) saturate(1.08)' : '';
    },
    setWaveform: (values) => {
      waveBars.forEach((bar, index) => {
        const raw = values[index] ?? 0;
        const percent = Math.max(6, Math.round((raw / 255) * 100));
        bar.style.height = `${percent}%`;
      });
    },
  };
};
