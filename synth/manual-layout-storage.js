export const manualLayoutStorageKey = 'synthManualLayout';

export const loadManualLayout = (storage = globalThis.localStorage) => {
  try {
    const raw = storage?.getItem?.(manualLayoutStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveManualLayout = (storage = globalThis.localStorage, layout) => {
  storage?.setItem?.(manualLayoutStorageKey, JSON.stringify(layout));
};

