import { createStrudelRuntimeState } from './strudel-score.js';

export const createStrudelRuntimeController = ({
  evaluate,
  hush,
  state = createStrudelRuntimeState(),
} = {}) => {
  let lastCommand = null;

  const sync = async () => {
    const command = state.getCommand();

    if (command === lastCommand) {
      return command;
    }

    lastCommand = command;

    if (command === 'hush()') {
      await hush?.();
      return command;
    }

    await evaluate?.(command);
    return command;
  };

  return {
    getState: () => state.getState(),
    getCommand: () => state.getCommand(),
    async setVibeByIndex(index) {
      state.setVibeByIndex(index);
      return sync();
    },
    async setOccupied(index, active) {
      state.setOccupied(index, active);
      return sync();
    },
    async setControlValue(key, value) {
      state.setControlValue(key, value);
      return sync();
    },
    async sync() {
      return sync();
    },
  };
};
