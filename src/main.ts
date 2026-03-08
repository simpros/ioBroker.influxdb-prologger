/*
 * InfluxDB ProLogger - ioBroker Adapter
 * Flexible InfluxDB v2 data logger with configurable logging groups,
 * multiple buckets, cron-based and on-change triggers.
 *
 * Created with @iobroker/create-adapter v3.1.2
 */

import * as utils from '@iobroker/adapter-core';
import { CronJob } from 'cron';
import type { DatapointConfig, LoggingGroup } from './lib/adapter-config';
import { buildGroupNameOptions, resolveGroups, type ResolvedGroup } from './lib/group-resolver';
import { InfluxClient } from './lib/influx-client';
import { formatLineProtocol } from './lib/line-protocol';

class InfluxdbPrologger extends utils.Adapter {
	private cronJobs: CronJob[] = [];
	private onChangeMap: Map<string, { group: LoggingGroup; datapoint: DatapointConfig }[]> = new Map();
	private influxClient!: InfluxClient;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({
			...options,
			name: 'influxdb-prologger',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	private async onReady(): Promise<void> {
		await this.setStateAsync('info.connection', false, true);

		// Validate required configuration
		if (!this.config.host) {
			this.log.error('InfluxDB host is not configured. Please configure the adapter.');
			return;
		}
		if (!this.config.token) {
			this.log.error('InfluxDB API token is not configured. Please configure the adapter.');
			return;
		}
		if (!this.config.organization) {
			this.log.error('InfluxDB organization is not configured. Please configure the adapter.');
			return;
		}

		const groups = this.config.groups || [];
		const datapoints = this.config.datapoints || [];

		if (groups.length === 0) {
			this.log.warn('No logging groups configured. Nothing to do.');
			return;
		}
		if (datapoints.length === 0) {
			this.log.warn('No data points configured. Nothing to do.');
			return;
		}

		// Initialize InfluxDB client
		this.influxClient = new InfluxClient(
			{
				protocol: this.config.protocol,
				host: this.config.host,
				port: this.config.port,
				organization: this.config.organization,
				token: this.config.token,
				writeTimeout: this.config.writeTimeout,
				retryOnError: this.config.retryOnError,
				maxRetries: this.config.maxRetries,
			},
			this.log,
			this.config.enableDebugLogs,
		);

		// Resolve datapoints into groups
		const resolved = resolveGroups(groups, datapoints, this.log);

		// Test connection on startup
		const connected = await this.influxClient.testConnection();
		if (!connected) {
			this.log.error('Cannot connect to InfluxDB. Please check your connection settings.');
			return;
		}
		await this.setStateAsync('info.connection', true, true);

		// Setup triggers for each resolved group
		for (const entry of resolved) {
			if (!entry.group.enabled) {
				this.log.info(`Group "${entry.group.name}" is disabled, skipping.`);
				continue;
			}
			if (entry.datapoints.length === 0) {
				this.log.warn(`Group "${entry.group.name}" has no enabled data points, skipping.`);
				continue;
			}

			if (entry.group.triggerType === 'cron') {
				this.setupCronGroup(entry);
			} else if (entry.group.triggerType === 'onChange') {
				this.setupOnChangeGroup(entry);
			}
		}

		this.log.info(
			`InfluxDB ProLogger started: ${resolved.length} group(s), ` +
				`${datapoints.filter(dp => dp.enabled).length} data point(s) active.`,
		);
	}

	/**
	 * Setup a cron-based logging group.
	 * On each cron tick, batch-read all state values and POST to InfluxDB.
	 *
	 * @param resolved - Resolved group with its data points
	 */
	private setupCronGroup(resolved: ResolvedGroup): void {
		const { group, datapoints } = resolved;
		const cronExpr = group.cronExpression || '*/15 * * * *';

		this.log.info(
			`Setting up cron group "${group.name}" with schedule "${cronExpr}" ` +
				`-> bucket "${group.bucket}" (${datapoints.length} data points)`,
		);

		const job = new CronJob(
			cronExpr,
			async () => {
				await this.executeCronGroup(group, datapoints);
			},
			null,
			true,
		);

		this.cronJobs.push(job);
	}

	/**
	 * Execute a cron group: read all states and write to InfluxDB.
	 *
	 * @param group - The logging group configuration
	 * @param datapoints - Data points belonging to this group
	 */
	private async executeCronGroup(group: LoggingGroup, datapoints: DatapointConfig[]): Promise<void> {
		if (this.config.enableDebugLogs) {
			this.log.debug(`Cron tick for group "${group.name}" - reading ${datapoints.length} data points`);
		}

		// Batch-read all state values
		const lines: string[] = [];
		for (const dp of datapoints) {
			try {
				const state = await this.getForeignStateAsync(dp.objectId);
				if (state?.val !== null && state?.val !== undefined) {
					lines.push(formatLineProtocol(dp.measurement, dp.tags, dp.field, state.val));
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

		const success = await this.influxClient.write(group.bucket, lines.join('\n'));
		if (!success) {
			void this.setStateAsync('info.connection', false, true);
		}
	}

	/**
	 * Setup an on-change logging group.
	 * Subscribe to each data point's object ID and write on state change.
	 *
	 * @param resolved - Resolved group with its data points
	 */
	private setupOnChangeGroup(resolved: ResolvedGroup): void {
		const { group, datapoints } = resolved;

		this.log.info(
			`Setting up on-change group "${group.name}" ` +
				`-> bucket "${group.bucket}" (${datapoints.length} data points)`,
		);

		for (const dp of datapoints) {
			// Build the reverse lookup map: objectId -> [{group, datapoint}]
			const existing = this.onChangeMap.get(dp.objectId) || [];
			existing.push({ group, datapoint: dp });
			this.onChangeMap.set(dp.objectId, existing);

			// Subscribe to the foreign state
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
	private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
		if (!state || state.val === null || state.val === undefined) {
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

			const line = formatLineProtocol(datapoint.measurement, datapoint.tags, datapoint.field, state.val);

			if (this.config.enableDebugLogs) {
				this.log.debug(`On-change write for "${id}" -> bucket "${group.bucket}": ${line}`);
			}

			const success = await this.influxClient.write(group.bucket, line);
			if (!success) {
				void this.setStateAsync('info.connection', false, true);
			}
		}
	}

	/**
	 * Handle messages from the admin UI (e.g., test connection button).
	 *
	 * @param obj - The message object from admin UI
	 */
	private async onMessage(obj: ioBroker.Message): Promise<void> {
		if (typeof obj !== 'object' || !obj.message) {
			return;
		}

		if (obj.command === 'getGroupNames') {
			const names = buildGroupNameOptions(this.config.groups || []);
			if (obj.callback) {
				this.sendTo(obj.from, obj.command, names, obj.callback);
			}
			return;
		}

		if (obj.command === 'testConnection') {
			const msg = obj.message as {
				protocol: string;
				host: string;
				port: number;
				organization: string;
				token: string;
			};

			const result = await InfluxClient.testWithConfig(msg);

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
	private onUnload(callback: () => void): void {
		try {
			// Stop all cron jobs
			for (const job of this.cronJobs) {
				void job.stop();
			}
			this.cronJobs = [];
			this.onChangeMap.clear();

			void this.setStateAsync('info.connection', false, true);

			callback();
		} catch (error) {
			this.log.error(`Error during unloading: ${(error as Error).message}`);
			callback();
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new InfluxdbPrologger(options);
} else {
	// otherwise start the instance directly
	(() => new InfluxdbPrologger())();
}
