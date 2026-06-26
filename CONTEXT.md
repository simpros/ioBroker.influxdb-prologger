# ioBroker InfluxDB Pro Logger

An ioBroker adapter that logs state values to InfluxDB on a schedule or on change, preserving accurate timestamps.

## Language

**Spontaneous Write**:
A write to InfluxDB triggered by an ioBroker state change, as opposed to a scheduled (cron) write.
_Avoid_: instant write, on-change write, event write

**Buffered Spontaneous Write**:
A spontaneous write that is held in a buffer for a debounce window before being flushed to InfluxDB. The original change timestamp is preserved regardless of when the flush occurs. All changes within the window are kept; no intermediate values are dropped.
_Avoid_: deferred write, batched write, debounced write

**Spontaneous Write Buffer**:
The in-memory accumulator that holds pending spontaneous writes until the flush window expires. One buffer per onChange group — all datapoints within a group share one buffer and one flush timer, since every group maps to exactly one bucket. Flushed as a single multi-line InfluxDB write per group.
_Avoid_: queue, cache, batch

**Flush Window**:
A fixed-duration time slot, configured per group (default 5 seconds), that begins on the first spontaneous write after the previous flush. All changes arriving within the window are accumulated; when the window expires the buffer is flushed regardless of further incoming changes.
_Avoid_: debounce interval, batch interval, tumbling window

**Change Timestamp**:
The millisecond-precision Unix timestamp (`state.ts`) recorded by ioBroker at the moment a state value changes. Written as the InfluxDB line-protocol timestamp (precision=ms) so the stored datapoint reflects when the change occurred, not when it was flushed.
_Avoid_: ingestion time, write time, server time

**Flush**:
The act of writing all accumulated entries in a Spontaneous Write Buffer to InfluxDB as a single multi-line POST, then clearing the buffer. Triggered either by flush window expiry or adapter unload. If the write fails after retries are exhausted, the buffer is discarded to prevent unbounded growth.
_Avoid_: drain, commit, send
