export function shouldProcessOnChangeState(
	adapterNamespace: string,
	stateId: string,
	ack: ioBroker.State['ack'] | undefined,
): boolean {
	const isOwnState = stateId === adapterNamespace || stateId.startsWith(`${adapterNamespace}.`);

	return isOwnState ? ack === false : ack === true;
}
