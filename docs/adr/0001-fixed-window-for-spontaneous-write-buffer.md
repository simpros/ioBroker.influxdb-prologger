# Fixed window for the Spontaneous Write Buffer flush trigger

The Spontaneous Write Buffer uses a fixed-duration flush window rather than a trailing debounce. The window starts on the first change after the previous flush and fires unconditionally when it expires, regardless of how many further changes arrive in the meantime.

Trailing debounce was the natural first candidate, but it would delay the flush indefinitely for chatty states (e.g. a power meter updating every 500 ms with a 5 s window would never flush). A fixed window gives a predictable, bounded latency: the worst-case delay is always exactly one window duration.

## Considered options

- **Trailing debounce** — timer resets on every new change; flush fires after the last change + window duration. Rejected: unbounded delay for chatty states.
- **Max-wait debounce** — trailing debounce with a hard ceiling. Considered but adds complexity with no meaningful benefit over a plain fixed window for this use case.
- **Fixed window (chosen)** — timer starts on first change, fires once at expiry. Simple, predictable, immune to chattiness.
