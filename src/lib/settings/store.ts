/**
 * Settings Store
 * Manages user preferences with localStorage persistence
 * and cross-tab synchronization
 */

import { DEFAULT_SETTINGS } from './defaults';
import type { UserSettings, PartialUserSettings, SettingsListener } from './types';

const SETTINGS_KEY = 'privatinvestor_settings_v1';

/**
 * Deep merge two objects
 * Preserves nested structure and merges at each level
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      const sourceValue = source[key];
      const targetValue = target[key];
      
      if (
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      } else {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return result as T;
}

/**
 * Settings store class with persistence and sync
 */
export class SettingsStore {
  private settings: UserSettings;
  private listeners: Set<SettingsListener> = new Set();
  private isClient = false;

  constructor() {
    this.settings = DEFAULT_SETTINGS;
    this.isClient = typeof window !== 'undefined';

    if (this.isClient) {
      this.settings = this.loadFromStorage();

      // Listen for changes from other tabs
      window.addEventListener('storage', this.handleStorageEvent);
    }
  }

  /**
   * Load settings from localStorage
   */
  private loadFromStorage(): UserSettings {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (!stored) {
        return DEFAULT_SETTINGS;
      }

      const parsed = JSON.parse(stored) as PartialUserSettings;
      const merged = deepMerge(
        DEFAULT_SETTINGS as Record<string, unknown>,
        parsed as Record<string, unknown>
      );
      return merged as unknown as UserSettings;
    } catch (error) {
      console.error('[SettingsStore] Failed to load settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Save settings to localStorage
   */
  private saveToStorage(): void {
    if (!this.isClient) return;

    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('[SettingsStore] Failed to save settings:', error);
    }
  }

  /**
   * Handle storage events from other tabs
   */
  private handleStorageEvent = (event: StorageEvent): void => {
    if (event.key === SETTINGS_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue) as PartialUserSettings;
        this.settings = deepMerge(
          DEFAULT_SETTINGS as Record<string, unknown>,
          parsed as Record<string, unknown>
        ) as unknown as UserSettings;
        this.notifyListeners();
      } catch (error) {
        console.error('[SettingsStore] Failed to parse storage event:', error);
      }
    }
  };

  /**
   * Notify all listeners of settings change
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.settings);
      } catch (error) {
        console.error('[SettingsStore] Listener error:', error);
      }
    });
  }

  /**
   * Get current settings (immutable copy)
   */
  get(): UserSettings {
    return { ...this.settings };
  }

  /**
   * Update settings with partial changes
   */
  update(updates: PartialUserSettings): void {
    this.settings = deepMerge(
      this.settings as Record<string, unknown>,
      updates as Record<string, unknown>
    ) as unknown as UserSettings;
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Update a specific category
   */
  updateCategory<K extends keyof UserSettings>(
    category: K,
    values: Partial<UserSettings[K]>
  ): void {
    this.update({ [category]: values } as PartialUserSettings);
  }

  /**
   * Reset all settings to defaults
   */
  reset(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    if (this.isClient) {
      localStorage.removeItem(SETTINGS_KEY);
    }
    this.notifyListeners();
  }

  /**
   * Subscribe to settings changes
   * Returns unsubscribe function
   */
  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);

    // Immediately call with current value
    listener(this.settings);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get a specific setting value
   */
  getValue<K extends keyof UserSettings, SK extends keyof UserSettings[K]>(
    category: K,
    key: SK
  ): UserSettings[K][SK] {
    return this.settings[category][key];
  }

  /**
   * Export settings as JSON string
   */
  export(): string {
    return JSON.stringify(this.settings, null, 2);
  }

  /**
   * Import settings from JSON string
   */
  import(json: string): boolean {
    try {
      const parsed = JSON.parse(json) as PartialUserSettings;
      this.update(parsed);
      return true;
    } catch (error) {
      console.error('[SettingsStore] Failed to import settings:', error);
      return false;
    }
  }

  /**
   * Cleanup (call on app unmount)
   */
  destroy(): void {
    if (this.isClient) {
      window.removeEventListener('storage', this.handleStorageEvent);
    }
    this.listeners.clear();
  }
}

// Singleton instance
export const settingsStore = new SettingsStore();
