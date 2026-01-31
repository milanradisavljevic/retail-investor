'use client';

import { useEffect } from 'react';
import { useSettings } from './useSettings';

interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * ThemeProvider Component
 * 
 * Automatically applies the theme from settings to the document.
 * Adds a data-theme attribute to the html element which triggers
 * CSS variable changes for light/dark mode.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const { settings } = useSettings();

  useEffect(() => {
    // Check if running in browser
    if (typeof document === 'undefined') return;

    const theme = settings.general.theme;
    const documentElement = document.documentElement;

    // Apply theme to html element as data attribute
    documentElement.setAttribute('data-theme', theme);

    // Add a smooth transition when changing themes
    // First, add the transition class after a small delay to prevent initial animation
    const timerId = setTimeout(() => {
      documentElement.classList.add('theme-transition');
    }, 100);

    return () => {
      clearTimeout(timerId);
      // Clean up transition class on unmount
      documentElement.classList.remove('theme-transition');
    };
  }, [settings.general.theme]);

  return <>{children}</>;
}
