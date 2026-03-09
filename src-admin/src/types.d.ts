declare global {
	interface Window {
		adapterName: string;
		sentryDSN?: string;
	}
}

export interface LoggingGroup {
	enabled: boolean;
	name: string;
	bucket: string;
	triggerType: 'cron' | 'onChange';
	cronExpression: string;
	batchWrite: boolean;
}

export interface DatapointConfig {
	enabled: boolean;
	group: string;
	objectId: string;
	measurement: string;
	field: string;
	tags: string;
}

export interface NativeConfig {
	url: string;
	organization: string;
	token: string;
	groups: LoggingGroup[];
	datapoints: DatapointConfig[];
	writeTimeout: number;
	retryOnError: boolean;
	maxRetries: number;
	enableDebugLogs: boolean;
}
