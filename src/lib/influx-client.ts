/**
 * InfluxDB v2 HTTP client.
 *
 * Handles writing line protocol data and health checks with optional
 * retry + exponential backoff. Uses native fetch() (Node 20+).
 */

/** Connection settings required to talk to InfluxDB. */
export interface InfluxConnectionConfig {
	/** Full InfluxDB URL, e.g. "http://localhost:8086" or "https://influxdb.example.com". */
	url: string;
	/** InfluxDB organization name. */
	organization: string;
	/** InfluxDB API token for authentication. */
	token: string;
	/** Request timeout in milliseconds. */
	writeTimeout: number;
	/** Whether to retry failed writes. */
	retryOnError: boolean;
	/** Maximum number of retry attempts. */
	maxRetries: number;
}

/** Minimal logger interface so we don't depend on the full adapter. */
export interface Logger {
	/** Log a debug message. */
	debug(message: string): void;
	/** Log an info message. */
	info(message: string): void;
	/** Log a warning message. */
	warn(message: string): void;
	/** Log an error message. */
	error(message: string): void;
}

/** InfluxDB v2 HTTP client with retry support. */
export class InfluxClient {
	/** InfluxDB connection configuration. */
	private readonly config: InfluxConnectionConfig;
	/** Logger instance. */
	private readonly log: Logger;
	/** Whether to emit debug-level logs. */
	private readonly enableDebugLogs: boolean;

	/**
	 * Create a new InfluxDB client.
	 *
	 * @param config - InfluxDB connection configuration
	 * @param log - Logger instance
	 * @param enableDebugLogs - Whether to emit debug-level logs
	 */
	constructor(config: InfluxConnectionConfig, log: Logger, enableDebugLogs: boolean) {
		this.config = config;
		this.log = log;
		this.enableDebugLogs = enableDebugLogs;
	}

	/** Base URL for the InfluxDB instance (trailing slash stripped). */
	private get baseUrl(): string {
		return this.config.url.replace(/\/+$/, '');
	}

	/**
	 * Write line protocol data to an InfluxDB bucket.
	 * Retries with exponential backoff when configured.
	 *
	 * @param bucket - Target InfluxDB bucket name
	 * @param lineData - Line protocol formatted data
	 * @returns `true` on success, `false` on final failure
	 */
	async write(bucket: string, lineData: string): Promise<boolean> {
		const url =
			`${this.baseUrl}/api/v2/write` +
			`?bucket=${encodeURIComponent(bucket)}&org=${encodeURIComponent(this.config.organization)}`;

		let lastError: Error | null = null;
		const maxAttempts = this.config.retryOnError ? (this.config.maxRetries || 3) + 1 : 1;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				const response = await fetch(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'text/plain',
						Authorization: `Token ${this.config.token}`,
					},
					body: lineData,
					signal: AbortSignal.timeout(this.config.writeTimeout || 5000),
				});

				if (response.ok) {
					if (this.enableDebugLogs) {
						this.log.debug(`Successfully wrote to bucket "${bucket}" (attempt ${attempt})`);
					}
					return true;
				}

				const responseText = await response.text();
				lastError = new Error(`HTTP ${response.status}: ${responseText}`);

				// Don't retry on client errors (4xx) except 429 (rate limit)
				if (response.status >= 400 && response.status < 500 && response.status !== 429) {
					this.log.error(`InfluxDB write failed (bucket "${bucket}"): ${lastError.message}`);
					return false;
				}

				this.log.warn(
					`InfluxDB write attempt ${attempt}/${maxAttempts} failed (bucket "${bucket}"): ${lastError.message}`,
				);
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				this.log.warn(
					`InfluxDB write attempt ${attempt}/${maxAttempts} failed (bucket "${bucket}"): ${lastError.message}`,
				);
			}

			// Wait before retry (exponential backoff)
			if (attempt < maxAttempts) {
				const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}

		if (lastError) {
			this.log.error(
				`InfluxDB write failed after ${maxAttempts} attempt(s) (bucket "${bucket}"): ${lastError.message}`,
			);
		}
		return false;
	}

	/**
	 * Test the InfluxDB connection by querying the health endpoint.
	 */
	async testConnection(): Promise<boolean> {
		const url = `${this.baseUrl}/health`;

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					Authorization: `Token ${this.config.token}`,
				},
				signal: AbortSignal.timeout(this.config.writeTimeout || 5000),
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
	static async testWithConfig(config: {
		/** Full InfluxDB URL. */
		url: string;
		/** InfluxDB API token. */
		token: string;
	}): Promise<{
		/** Whether the connection test succeeded. */
		success: boolean;
		/** Result or error message. */
		message: string;
	}> {
		const baseUrl = config.url.replace(/\/+$/, '');
		const url = `${baseUrl}/health`;

		try {
			const response = await fetch(url, {
				method: 'GET',
				headers: {
					Authorization: `Token ${config.token}`,
				},
				signal: AbortSignal.timeout(5000),
			});

			if (response.ok) {
				return { success: true, message: 'Connection successful!' };
			}

			const text = await response.text();
			return { success: false, message: `HTTP ${response.status}: ${text}` };
		} catch (err) {
			return {
				success: false,
				message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}
}
