/// <reference types="vite/client" />

/**
 * Vite's `?worker` import suffix returns a worker constructor. Declaring it here keeps the
 * engine worker import type-safe without pulling in the whole Vite client type surface.
 */
declare module '*?worker' {
  const workerConstructor: new (options?: { name?: string }) => Worker;
  export default workerConstructor;
}
