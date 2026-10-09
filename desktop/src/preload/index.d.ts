import type { BcisDesktopApi } from "../shared/types";

declare global {
  interface Window {
    bcis: BcisDesktopApi;
  }
}

export {};