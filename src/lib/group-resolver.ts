/**
 * Configuration resolution — maps data points to their logging groups.
 */

import type { DatapointConfig, LoggingGroup } from './adapter-config';

/** A logging group with its resolved (enabled) data points. */
export interface ResolvedGroup {
	/** The logging group configuration. */
	group: LoggingGroup;
	/** Enabled data points belonging to this group. */
	datapoints: DatapointConfig[];
}

/** Minimal logger interface so we don't depend on the full adapter. */
export interface Logger {
	/** Log a warning message. */
	warn(message: string): void;
}

/**
 * Group enabled datapoints by their group name and validate references.
 *
 * @param groups - Configured logging groups
 * @param datapoints - Configured data points
 * @param log - Logger for warnings about misconfigured references
 */
export function resolveGroups(groups: LoggingGroup[], datapoints: DatapointConfig[], log: Logger): ResolvedGroup[] {
	const groupMap = new Map<string, LoggingGroup>();
	for (const group of groups) {
		groupMap.set(group.name, group);
	}

	const resolved = new Map<string, ResolvedGroup>();
	for (const group of groups) {
		resolved.set(group.name, { group, datapoints: [] });
	}

	for (const dp of datapoints) {
		if (!dp.enabled) {
			continue;
		}

		if (!groupMap.has(dp.group)) {
			log.warn(
				`Data point "${dp.objectId}" references unknown group "${dp.group}". ` +
					`Available groups: ${[...groupMap.keys()].join(', ')}`,
			);
			continue;
		}

		resolved.get(dp.group)!.datapoints.push(dp);
	}

	return [...resolved.values()];
}
