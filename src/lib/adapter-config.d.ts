// This file extends the AdapterConfig type from "@iobroker/types"

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

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			protocol: 'http' | 'https';
			host: string;
			port: number;
			organization: string;
			token: string;
			groups: LoggingGroup[];
			datapoints: DatapointConfig[];
			writeTimeout: number;
			retryOnError: boolean;
			maxRetries: number;
			enableDebugLogs: boolean;
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
