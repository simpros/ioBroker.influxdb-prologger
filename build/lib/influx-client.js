"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var influx_client_exports = {};
__export(influx_client_exports, {
  InfluxClient: () => InfluxClient
});
module.exports = __toCommonJS(influx_client_exports);
class InfluxClient {
  /** InfluxDB connection configuration. */
  config;
  /** Logger instance. */
  log;
  /** Whether to emit debug-level logs. */
  enableDebugLogs;
  /**
   * Create a new InfluxDB client.
   *
   * @param config - InfluxDB connection configuration
   * @param log - Logger instance
   * @param enableDebugLogs - Whether to emit debug-level logs
   */
  constructor(config, log, enableDebugLogs) {
    this.config = config;
    this.log = log;
    this.enableDebugLogs = enableDebugLogs;
  }
  /** Base URL for the InfluxDB instance (trailing slash stripped). */
  get baseUrl() {
    return this.config.url.replace(/\/+$/, "");
  }
  /**
   * Write line protocol data to an InfluxDB bucket.
   * Retries with exponential backoff when configured.
   *
   * @param bucket - Target InfluxDB bucket name
   * @param lineData - Line protocol formatted data
   * @returns `true` on success, `false` on final failure
   */
  async write(bucket, lineData) {
    const url = `${this.baseUrl}/api/v2/write?bucket=${encodeURIComponent(bucket)}&org=${encodeURIComponent(this.config.organization)}`;
    let lastError = null;
    const maxAttempts = this.config.retryOnError ? (this.config.maxRetries || 3) + 1 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            Authorization: `Token ${this.config.token}`
          },
          body: lineData,
          signal: AbortSignal.timeout(this.config.writeTimeout || 5e3)
        });
        if (response.ok) {
          if (this.enableDebugLogs) {
            this.log.debug(`Successfully wrote to bucket "${bucket}" (attempt ${attempt})`);
          }
          return true;
        }
        const responseText = await response.text();
        lastError = new Error(`HTTP ${response.status}: ${responseText}`);
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          this.log.error(`InfluxDB write failed (bucket "${bucket}"): ${lastError.message}`);
          return false;
        }
        this.log.warn(
          `InfluxDB write attempt ${attempt}/${maxAttempts} failed (bucket "${bucket}"): ${lastError.message}`
        );
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.log.warn(
          `InfluxDB write attempt ${attempt}/${maxAttempts} failed (bucket "${bucket}"): ${lastError.message}`
        );
      }
      if (attempt < maxAttempts) {
        const delay = Math.min(1e3 * Math.pow(2, attempt - 1), 1e4);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    if (lastError) {
      this.log.error(
        `InfluxDB write failed after ${maxAttempts} attempt(s) (bucket "${bucket}"): ${lastError.message}`
      );
    }
    return false;
  }
  /**
   * Test the InfluxDB connection by querying the health endpoint.
   */
  async testConnection() {
    const url = `${this.baseUrl}/health`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Token ${this.config.token}`
        },
        signal: AbortSignal.timeout(this.config.writeTimeout || 5e3)
      });
      if (response.ok) {
        this.log.info(`Successfully connected to InfluxDB at ${this.baseUrl}`);
        return true;
      }
      const text = await response.text();
      this.log.error(`InfluxDB health check failed: HTTP ${response.status} - ${text}`);
      return false;
    } catch (err) {
      this.log.error(`InfluxDB connection test failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
  /**
   * Test connection with explicit config (for admin UI "test" button).
   * This is a static helper that doesn't need a full InfluxClient instance.
   *
   * @param config - Connection parameters from the admin message
   * @param config.url - Full InfluxDB URL
   * @param config.token - InfluxDB API token
   */
  static async testWithConfig(config) {
    const baseUrl = config.url.replace(/\/+$/, "");
    const url = `${baseUrl}/health`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Token ${config.token}`
        },
        signal: AbortSignal.timeout(5e3)
      });
      if (response.ok) {
        return { success: true, message: "Connection successful!" };
      }
      const text = await response.text();
      return { success: false, message: `HTTP ${response.status}: ${text}` };
    } catch (err) {
      return {
        success: false,
        message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  InfluxClient
});
//# sourceMappingURL=influx-client.js.map
