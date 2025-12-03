import { Config } from "cps-global-configuration";
import { TrackEvent } from "../analytics/analytics-event";
import { makeConsole } from "../../logging/makeConsole";

type Props = { config: Config; trackEvent: TrackEvent };

const { _error } = makeConsole("fetchWithCircuitBreaker");

const ERROR_MEG = `Circuit breaker tripped - too many requests`;

export const fetchWithCircuitBreaker = ({ config, trackEvent }: Props) => {
  const baseConfig = {
    maxPerInterval: 10,
    intervalMs: 3_000,
  };

  const { maxPerInterval, intervalMs } = { ...baseConfig, ...config.FETCH_CIRCUIT_BREAKER_CONFIG };

  const timestamps: number[] = [];
  let tripped = false;

  return (realFetch: typeof fetch) =>
    async (...args: Parameters<typeof fetch>) => {
      if (tripped) {
        throw new Error(ERROR_MEG);
      }

      const now = Date.now();
      const windowStart = now - intervalMs;

      // Remove timestamps older than the interval
      while (timestamps.length && timestamps[0] < windowStart) {
        timestamps.shift();
      }

      if (timestamps.length >= maxPerInterval) {
        tripped = true;
        const error = `Circuit breaker tripped: ${maxPerInterval} calls/${intervalMs} milliseconds exceeded`;
        _error(error);
        trackEvent({ name: "fetch", error });
        throw new Error(ERROR_MEG);
      }

      timestamps.push(now);
      return realFetch(...args);
    };
};
