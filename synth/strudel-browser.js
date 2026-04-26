import { evaluate, hush, initStrudel, samples } from '@strudel/web';

import { createStrudelRuntimeController } from './strudel-runtime.js';

export const createBrowserStrudelRuntime = () => {
  let readyPromise = null;

  const ensureReady = async () => {
    if (!readyPromise) {
      readyPromise = initStrudel({
        prebake: async () => {
          await samples('github:tidalcycles/dirt-samples');
        },
      });
    }

    await readyPromise;
    return readyPromise;
  };

  const controller = createStrudelRuntimeController({
    evaluate: async (code) => {
      await ensureReady();
      await evaluate(code);
    },
    hush: async () => {
      if (!readyPromise) {
        return;
      }

      await ensureReady();
      hush();
    },
  });

  return {
    ...controller,
    ensureReady,
  };
};
