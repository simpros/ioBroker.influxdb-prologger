/**
 * InfluxDB v2 line protocol formatting utilities.
 *
 * Pure functions with no external dependencies — easy to test in isolation.
 */

/**
 * Format a value for InfluxDB line protocol.
 * Strings are quoted, booleans are lowercased, numbers are raw.
 *
 * @param value - The ioBroker state value
 */
export function formatInfluxValue(value: ioBroker.StateValue): string {
	if (typeof value === 'string') {
		// Escape backslashes and quotes in string values
		return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
	}
	if (typeof value === 'boolean') {
		return value ? 'true' : 'false';
	}
	// Numbers and everything else
	return String(value);
}

/**
 * Format a single InfluxDB line protocol entry.
 * Format: measurement,tag1=val1,tag2=val2 field=value
 *
 * @param measurement - InfluxDB measurement name
 * @param tags - Comma-separated tags (key=value format)
 * @param field - InfluxDB field name
 * @param value - The state value to format
 */
export function formatLineProtocol(
	measurement: string,
	tags: string,
	field: string,
	value: ioBroker.StateValue,
): string {
	const tagsPart = tags ? `,${tags}` : '';
	const formattedValue = formatInfluxValue(value);
	return `${measurement}${tagsPart} ${field}=${formattedValue}`;
}
