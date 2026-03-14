declare global {
	interface Window {
		adapterName: string;
		sentryDSN?: string;
	}
}

/** Configuration for a logging group */
export interface LoggingGroup {
	/** Whether this group is active */
	enabled: boolean;
	/** Display name of the group */
	name: string;
	/** InfluxDB bucket to write to */
	bucket: string;
	/** How data collection is triggered */
	triggerType: 'cron' | 'onChange';
	/** Cron schedule expression */
	cronExpression: string;
	/** Whether to batch writes */
	batchWrite: boolean;
}

/** Configuration for a single datapoint */
export interface DatapointConfig {
	/** Whether this datapoint is active */
	enabled: boolean;
	/** Name of the logging group this datapoint belongs to */
	group: string;
	/** ioBroker object ID to log */
	objectId: string;
	/** InfluxDB measurement name */
	measurement: string;
	/** InfluxDB field name */
	field: string;
	/** Comma-separated key=value tag pairs */
	tags: string;
}

/** Top-level native adapter configuration */
export interface NativeConfig {
	/** InfluxDB server URL */
	url: string;
	/** InfluxDB organization */
	organization: string;
	/** InfluxDB API token */
	token: string;
	/** Configured logging groups */
	groups: LoggingGroup[];
	/** Configured datapoints */
	datapoints: DatapointConfig[];
	/** Write timeout in milliseconds */
	writeTimeout: number;
	/** Whether to retry failed writes */
	retryOnError: boolean;
	/** Maximum number of write retries */
	maxRetries: number;
	/** Whether to enable verbose debug logging */
	enableDebugLogs: boolean;
}
