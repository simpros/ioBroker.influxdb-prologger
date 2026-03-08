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
var import_group_resolver = require("./lib/group-resolver");
var import_influx_client = require("./lib/influx-client");
var import_line_protocol = require("./lib/line-protocol");
class InfluxdbPrologger extends utils.Adapter {
  cronJobs = [];
  onChangeMap = /* @__PURE__ */ new Map();
  influxClient;
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
    this.influxClient = new import_influx_client.InfluxClient(
      {
        protocol: this.config.protocol,
        host: this.config.host,
        port: this.config.port,
        organization: this.config.organization,
        token: this.config.token,
        writeTimeout: this.config.writeTimeout,
        retryOnError: this.config.retryOnError,
        maxRetries: this.config.maxRetries
      },
      this.log,
      this.config.enableDebugLogs
    );
    const resolved = (0, import_group_resolver.resolveGroups)(groups, datapoints, this.log);
    const connected = await this.influxClient.testConnection();
    if (!connected) {
      this.log.error("Cannot connect to InfluxDB. Please check your connection settings.");
      return;
    }
    await this.setStateAsync("info.connection", true, true);
    for (const entry of resolved) {
      if (!entry.group.enabled) {
        this.log.info(`Group "${entry.group.name}" is disabled, skipping.`);
        continue;
      }
      if (entry.datapoints.length === 0) {
        this.log.warn(`Group "${entry.group.name}" has no enabled data points, skipping.`);
        continue;
      }
      if (entry.group.triggerType === "cron") {
        this.setupCronGroup(entry);
      } else if (entry.group.triggerType === "onChange") {
        this.setupOnChangeGroup(entry);
      }
    }
    this.log.info(
      `InfluxDB ProLogger started: ${resolved.length} group(s), ${datapoints.filter((dp) => dp.enabled).length} data point(s) active.`
    );
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
          lines.push((0, import_line_protocol.formatLineProtocol)(dp.measurement, dp.tags, dp.field, state.val));
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
    const success = await this.influxClient.write(group.bucket, lines.join("\n"));
    if (!success) {
      void this.setStateAsync("info.connection", false, true);
    }
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
      const line = (0, import_line_protocol.formatLineProtocol)(datapoint.measurement, datapoint.tags, datapoint.field, state.val);
      if (this.config.enableDebugLogs) {
        this.log.debug(`On-change write for "${id}" -> bucket "${group.bucket}": ${line}`);
      }
      const success = await this.influxClient.write(group.bucket, line);
      if (!success) {
        void this.setStateAsync("info.connection", false, true);
      }
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
      const result = await import_influx_client.InfluxClient.testWithConfig(msg);
      if (obj.callback) {
        if (result.success) {
          this.sendTo(obj.from, obj.command, { result: result.message }, obj.callback);
        } else {
          this.sendTo(obj.from, obj.command, { error: result.message }, obj.callback);
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
