/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

/** The trainer's package version, injected at build time. */
declare const __TRAINER_VERSION__: string;
