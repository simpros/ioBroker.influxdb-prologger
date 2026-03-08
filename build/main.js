"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_cron = require("cron");
class InfluxdbPrologger extends utils.Adapter {
  cronJobs = [];
  onChangeMap = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    super({
      ...options,
      name: "influxdb-prologger"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("message", this.onMessage.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  /**
   * Is called when databases are connected and adapter received configuration.
   */
  async onReady() {
    await this.setStateAsync("info.connection", false, true);
    if (!this.config.host) {
      this.log.error("InfluxDB host is not configured. Please configure the adapter.");
      return;
    }
    if (!this.config.token) {
      this.log.error("InfluxDB API token is not configured. Please configure the adapter.");
      return;
    }
    if (!this.config.organization) {
      this.log.error("InfluxDB organization is not configured. Please configure the adapter.");
      return;
    }
    const groups = this.config.groups || [];
    const datapoints = this.config.datapoints || [];
    if (groups.length === 0) {
      this.log.warn("No logging groups configured. Nothing to do.");
      return;
    }
    if (datapoints.length === 0) {
      this.log.warn("No data points configured. Nothing to do.");
      return;
    }
    const resolvedGroups = this.resolveGroups(groups, datapoints);
    const connected = await this.testInfluxConnection();
    if (!connected) {
      this.log.error("Cannot connect to InfluxDB. Please check your connection settings.");
      return;
    }
    await this.setStateAsync("info.connection", true, true);
    for (const resolved of resolvedGroups) {
      if (!resolved.group.enabled) {
        this.log.info(`Group "${resolved.group.name}" is disabled, skipping.`);
        continue;
      }
      if (resolved.datapoints.length === 0) {
        this.log.warn(`Group "${resolved.group.name}" has no enabled data points, skipping.`);
        continue;
      }
      if (resolved.group.triggerType === "cron") {
        this.setupCronGroup(resolved);
      } else if (resolved.group.triggerType === "onChange") {
        this.setupOnChangeGroup(resolved);
      }
    }
    this.log.info(
      `InfluxDB ProLogger started: ${resolvedGroups.length} group(s), ${datapoints.filter((dp) => dp.enabled).length} data point(s) active.`
    );
  }
  /**
   * Group datapoints by their group name and validate references.
   *
   * @param groups - Configured logging groups
   * @param datapoints - Configured data points
   */
  resolveGroups(groups, datapoints) {
    const groupMap = /* @__PURE__ */ new Map();
    for (const group of groups) {
      groupMap.set(group.name, group);
    }
    const resolved = /* @__PURE__ */ new Map();
    for (const group of groups) {
      resolved.set(group.name, { group, datapoints: [] });
    }
    for (const dp of datapoints) {
      if (!dp.enabled) {
        continue;
      }
      if (!groupMap.has(dp.group)) {
        this.log.warn(
          `Data point "${dp.objectId}" references unknown group "${dp.group}". Available groups: ${[...groupMap.keys()].join(", ")}`
        );
        continue;
      }
      resolved.get(dp.group).datapoints.push(dp);
    }
    return [...resolved.values()];
  }
  /**
   * Setup a cron-based logging group.
   * On each cron tick, batch-read all state values and POST to InfluxDB.
   *
   * @param resolved - Resolved group with its data points
   */
  setupCronGroup(resolved) {
    const { group, datapoints } = resolved;
    const cronExpr = group.cronExpression || "*/15 * * * *";
    this.log.info(
      `Setting up cron group "${group.name}" with schedule "${cronExpr}" -> bucket "${group.bucket}" (${datapoints.length} data points)`
    );
    const job = new import_cron.CronJob(
      cronExpr,
      async () => {
        await this.executeCronGroup(group, datapoints);
      },
      null,
      true
    );
    this.cronJobs.push(job);
  }
  /**
   * Execute a cron group: read all states and write to InfluxDB.
   *
   * @param group - The logging group configuration
   * @param datapoints - Data points belonging to this group
   */
  async executeCronGroup(group, datapoints) {
    if (this.config.enableDebugLogs) {
      this.log.debug(`Cron tick for group "${group.name}" - reading ${datapoints.length} data points`);
    }
    const lines = [];
    for (const dp of datapoints) {
      try {
        const state = await this.getForeignStateAsync(dp.objectId);
        if ((state == null ? void 0 : state.val) !== null && (state == null ? void 0 : state.val) !== void 0) {
          const line = this.formatLineProtocol(dp.measurement, dp.tags, dp.field, state.val);
          lines.push(line);
        } else if (this.config.enableDebugLogs) {
          this.log.debug(`State "${dp.objectId}" has no value, skipping.`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.log.warn(`Failed to read state "${dp.objectId}": ${errMsg}`);
      }
    }
    if (lines.length === 0) {
      if (this.config.enableDebugLogs) {
        this.log.debug(`No data to write for group "${group.name}"`);
      }
      return;
    }
    const lineData = lines.join("\n");
    await this.writeToInflux(group.bucket, lineData);
  }
  /**
   * Setup an on-change logging group.
   * Subscribe to each data point's object ID and write on state change.
   *
   * @param resolved - Resolved group with its data points
   */
  setupOnChangeGroup(resolved) {
    const { group, datapoints } = resolved;
    this.log.info(
      `Setting up on-change group "${group.name}" -> bucket "${group.bucket}" (${datapoints.length} data points)`
    );
    for (const dp of datapoints) {
      const existing = this.onChangeMap.get(dp.objectId) || [];
      existing.push({ group, datapoint: dp });
      this.onChangeMap.set(dp.objectId, existing);
      this.subscribeForeignStates(dp.objectId);
    }
  }
  /**
   * Called when a subscribed state changes.
   * Handles on-change groups by writing the new value to InfluxDB.
   *
   * @param id - The state ID that changed
   * @param state - The new state value
   */
  async onStateChange(id, state) {
    if (!state || state.val === null || state.val === void 0) {
      return;
    }
    const entries = this.onChangeMap.get(id);
    if (!entries) {
      return;
    }
    for (const { group, datapoint } of entries) {
      if (!group.enabled) {
        continue;
      }
      const line = this.formatLineProtocol(datapoint.measurement, datapoint.tags, datapoint.field, state.val);
      if (this.config.enableDebugLogs) {
        this.log.debug(`On-change write for "${id}" -> bucket "${group.bucket}": ${line}`);
      }
      await this.writeToInflux(group.bucket, line);
    }
  }
  /**
   * Format a single InfluxDB line protocol entry.
   * Format: measurement,tag1=val1,tag2=val2 field=value
   *
   * @param measurement - InfluxDB measurement name
   * @param tags - Comma-separated tags (key=value format)
   * @param field - InfluxDB field name
   * @param value - The state value to format
   */
  formatLineProtocol(measurement, tags, field, value) {
    const tagsPart = tags ? `,${tags}` : "";
    const formattedValue = this.formatInfluxValue(value);
    return `${measurement}${tagsPart} ${field}=${formattedValue}`;
  }
  /**
   * Format a value for InfluxDB line protocol.
   * Strings are quoted, booleans are lowercased, numbers are raw.
   *
   * @param value - The ioBroker state value
   */
  formatInfluxValue(value) {
    if (typeof value === "string") {
      return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    return String(value);
  }
  /**
   * Write line protocol data to InfluxDB via HTTP POST.
   *
   * @param bucket - Target InfluxDB bucket name
   * @param lineData - Line protocol formatted data
   */
  async writeToInflux(bucket, lineData) {
    const url = `${this.config.protocol}://${this.config.host}:${this.config.port}/api/v2/write?bucket=${encodeURIComponent(bucket)}&org=${encodeURIComponent(this.config.organization)}`;
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
          if (this.config.enableDebugLogs) {
            this.log.debug(`Successfully wrote to bucket "${bucket}" (attempt ${attempt})`);
          }
          return;
        }
        const responseText = await response.text();
        lastError = new Error(`HTTP ${response.status}: ${responseText}`);
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          this.log.error(`InfluxDB write failed (bucket "${bucket}"): ${lastError.message}`);
          return;
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
      void this.setStateAsync("info.connection", false, true);
    }
  }
  /**
   * Test the InfluxDB connection by querying the health endpoint.
   */
  async testInfluxConnection() {
    const url = `${this.config.protocol}://${this.config.host}:${this.config.port}/health`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Token ${this.config.token}`
        },
        signal: AbortSignal.timeout(this.config.writeTimeout || 5e3)
      });
      if (response.ok) {
        this.log.info(`Successfully connected to InfluxDB at ${this.config.host}:${this.config.port}`);
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
   * Handle messages from the admin UI (e.g., test connection button).
   *
   * @param obj - The message object from admin UI
   */
  async onMessage(obj) {
    if (typeof obj !== "object" || !obj.message) {
      return;
    }
    if (obj.command === "testConnection") {
      const msg = obj.message;
      const url = `${msg.protocol}://${msg.host}:${msg.port}/health`;
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Token ${msg.token}`
          },
          signal: AbortSignal.timeout(5e3)
        });
        if (response.ok) {
          if (obj.callback) {
            this.sendTo(obj.from, obj.command, { result: "Connection successful!" }, obj.callback);
          }
        } else {
          const text = await response.text();
          if (obj.callback) {
            this.sendTo(obj.from, obj.command, { error: `HTTP ${response.status}: ${text}` }, obj.callback);
          }
        }
      } catch (err) {
        if (obj.callback) {
          this.sendTo(
            obj.from,
            obj.command,
            { error: `Connection failed: ${err instanceof Error ? err.message : String(err)}` },
            obj.callback
          );
        }
      }
    }
  }
  /**
   * Is called when adapter shuts down - cleanup all resources.
   *
   * @param callback - Callback to signal completion
   */
  onUnload(callback) {
    try {
      for (const job of this.cronJobs) {
        void job.stop();
      }
      this.cronJobs = [];
      this.onChangeMap.clear();
      void this.setStateAsync("info.connection", false, true);
      callback();
    } catch (error) {
      this.log.error(`Error during unloading: ${error.message}`);
      callback();
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new InfluxdbPrologger(options);
} else {
  (() => new InfluxdbPrologger())();
}
//# sourceMappingURL=main.js.map
