import { createSeedData } from "./seed";
import type { AppData } from "./types";

const STORAGE_KEY = "pipe-handover-console-v1";

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (parsed?.version === 1) return parsed;
    }
  } catch {
    // 本地数据损坏时回退到种子数据
  }
  return createSeedData();
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 存储不可用时静默降级（内存中仍可操作）
  }
}

export function resetData(): AppData {
  const seed = createSeedData();
  saveData(seed);
  return seed;
}
