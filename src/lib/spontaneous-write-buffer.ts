/**
 * Spontaneous Write Buffer
 *
 * Accumulates buffered spontaneous writes per group and flushes them as a
 * single multi-line InfluxDB POST when the fixed flush window expires.
 * All original change timestamps are preserved in the line-protocol strings.
 *
 * Design decisions:
 * - Fixed window (not trailing debounce): window starts on the first push after
 *   the previous flush and fires unconditionally at expiry. See ADR-0001.
 * - One buffer instance per onChange group: all datapoints within a group share
 *   one buffer and one flush timer, since every group maps to exactly one bucket.
 * - Keep all: every change within the window is written; no intermediate values dropped.
 * - Flush on unload: flushAll() drains all pending buffers immediately.
 */

/** Function signature for writing line-protocol data to a bucket. */
export type WriteFunction = (bucket: string, lineData: string) => Promise<boolean>;

/** Internal state for a single (bucket, group) buffer slot. */
interface BufferSlot {
	bucket: string;
	lines: string[];
	timerId: ReturnType<typeof setTimeout> | null;
}

/**
 * Composite key for a (bucket, group) pair.
 *
 * @param bucket - Target InfluxDB bucket
 * @param group - Logical group name
 */
function makeKey(bucket: string, group: string): string {
	return `${bucket}\0${group}`;
}

/**
 * Fixed-window buffer for spontaneous writes.
 *
 * Intended to be used as one instance per onChange group. The `group` parameter
 * on `push` acts as a secondary discriminator for callers that share one instance
 * across multiple groups (e.g. tests), but the normal production usage is one
 * instance per group with one consistent bucket per instance.
 */
export class SpontaneousWriteBuffer {
	private readonly write: WriteFunction;
	private readonly windowMs: number;
	private readonly slots = new Map<string, BufferSlot>();

	/**
	 * @param write - Function to call with (bucket, multiLineData) on flush
	 * @param windowMs - Fixed flush window duration in milliseconds
	 */
	constructor(write: WriteFunction, windowMs: number) {
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
	push(bucket: string, group: string, line: string): void {
		const key = makeKey(bucket, group);
		let slot = this.slots.get(key);

		if (!slot) {
			slot = { bucket, lines: [], timerId: null };
			this.slots.set(key, slot);
		}

		slot.lines.push(line);

		// Start the window timer only on the first push (fixed window)
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
	async flushAll(): Promise<boolean> {
		const keys = [...this.slots.keys()];
		const results = await Promise.all(keys.map(key => this.flushSlot(key)));
		return results.every(r => r);
	}

	/**
	 * Flush a single slot and remove it from the map.
	 *
	 * @param key - Composite (bucket, group) key
	 */
	private async flushSlot(key: string): Promise<boolean> {
		const slot = this.slots.get(key);
		if (!slot || slot.lines.length === 0) {
			this.slots.delete(key);
			return true;
		}

		// Cancel the timer if it's still running (e.g. called from flushAll)
		if (slot.timerId !== null) {
			clearTimeout(slot.timerId);
			slot.timerId = null;
		}

		const lineData = slot.lines.join('\n');
		// Remove slot before awaiting write so a concurrent push opens a fresh window
		this.slots.delete(key);

		return this.write(slot.bucket, lineData);
	}
}
