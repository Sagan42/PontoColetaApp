/** Injectable so tests do not have to spend real seconds esperando o relógio. */
export interface GeocodingTimers {
  readonly now: () => number;
  readonly wait: (ms: number) => Promise<void>;
}

export const realTimers: GeocodingTimers = {
  now: () => Date.now(),
  wait: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};
