/// <reference types="vite/client" />

import type { DesktopApi } from "./types/desktop";

declare global {
  interface Window {
    kcs: DesktopApi;
  }
}

export {};
