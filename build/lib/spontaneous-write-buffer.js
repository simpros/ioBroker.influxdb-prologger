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
var spontaneous_write_buffer_exports = {};
__export(spontaneous_write_buffer_exports, {
  SpontaneousWriteBuffer: () => SpontaneousWriteBuffer
});
module.exports = __toCommonJS(spontaneous_write_buffer_exports);
function makeKey(bucket, group) {
  return `${bucket}\0${group}`;
}
class SpontaneousWriteBuffer {
  write;
  windowMs;
  slots = /* @__PURE__ */ new Map();
  /**
   * @param write - Function to call with (bucket, multiLineData) on flush
   * @param windowMs - Fixed flush window duration in milliseconds
   */
  constructor(write, windowMs) {
    this.write = write;
    this.windowMs = windowMs;
  }
  /**
   * Push a formatted line-protocol string into the buffer for the given
   * (bucket, group) pair. Starts the flush window if this is the first
   * entry since the last flush.
   *
   * @param bucket - Target InfluxDB bucket
   * @param group - Logical group name (used as part of the buffer key)
   * @param line - Formatted line-protocol string including timestamp
   */
  push(bucket, group, line) {
    const key = makeKey(bucket, group);
    let slot = this.slots.get(key);
    if (!slot) {
      slot = { bucket, lines: [], timerId: null };
      this.slots.set(key, slot);
    }
    slot.lines.push(line);
    if (slot.timerId === null) {
      slot.timerId = setTimeout(() => {
        void this.flushSlot(key);
      }, this.windowMs);
    }
  }
  /**
   * Flush all pending buffers immediately (e.g. on adapter unload).
   * Cancels any outstanding window timers to prevent double-flushing.
   *
   * @returns `true` if all writes succeeded, `false` if any failed
   */
  async flushAll() {
    const keys = [...this.slots.keys()];
    const results = await Promise.all(keys.map((key) => this.flushSlot(key)));
    return results.every((r) => r);
  }
  /**
   * Flush a single slot and remove it from the map.
   *
   * @param key - Composite (bucket, group) key
   */
  async flushSlot(key) {
    const slot = this.slots.get(key);
    if (!slot || slot.lines.length === 0) {
      this.slots.delete(key);
      return true;
    }
    if (slot.timerId !== null) {
      clearTimeout(slot.timerId);
      slot.timerId = null;
    }
    const lineData = slot.lines.join("\n");
    this.slots.delete(key);
    return this.write(slot.bucket, lineData);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  SpontaneousWriteBuffer
});
//# sourceMappingURL=spontaneous-write-buffer.js.map
