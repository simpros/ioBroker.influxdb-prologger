import { expect } from 'chai';
import sinon from 'sinon';
import type { DatapointConfig, LoggingGroup } from './adapter-config';
import { resolveGroups } from './group-resolver';

function makeGroup(overrides: Partial<LoggingGroup> = {}): LoggingGroup {
	return {
		enabled: true,
		name: 'default',
		bucket: 'test-bucket',
		triggerType: 'cron',
		cronExpression: '*/5 * * * *',
		batchWrite: true,
		...overrides,
	};
}

function makeDatapoint(overrides: Partial<DatapointConfig> = {}): DatapointConfig {
	return {
		enabled: true,
		group: 'default',
		objectId: '0_userdata.0.temp',
		measurement: 'temperature',
		field: 'value',
		tags: '',
		...overrides,
	};
}

describe('group-resolver', () => {
	let log: { warn: sinon.SinonStub };

	beforeEach(() => {
		log = { warn: sinon.stub() };
	});

	it('should map datapoints to their respective groups', () => {
		const groups = [makeGroup({ name: 'A' }), makeGroup({ name: 'B' })];
		const datapoints = [
			makeDatapoint({ group: 'A', objectId: 'dp1' }),
			makeDatapoint({ group: 'B', objectId: 'dp2' }),
			makeDatapoint({ group: 'A', objectId: 'dp3' }),
		];

		const result = resolveGroups(groups, datapoints, log);

		expect(result).to.have.length(2);
		expect(result[0].group.name).to.equal('A');
		expect(result[0].datapoints).to.have.length(2);
		expect(result[0].datapoints[0].objectId).to.equal('dp1');
		expect(result[0].datapoints[1].objectId).to.equal('dp3');
		expect(result[1].group.name).to.equal('B');
		expect(result[1].datapoints).to.have.length(1);
		expect(log.warn).to.not.have.been.called;
	});

	it('should filter out disabled datapoints', () => {
		const groups = [makeGroup()];
		const datapoints = [
			makeDatapoint({ objectId: 'dp1', enabled: true }),
			makeDatapoint({ objectId: 'dp2', enabled: false }),
			makeDatapoint({ objectId: 'dp3', enabled: true }),
		];

		const result = resolveGroups(groups, datapoints, log);

		expect(result[0].datapoints).to.have.length(2);
		expect(result[0].datapoints.map(dp => dp.objectId)).to.deep.equal(['dp1', 'dp3']);
	});

	it('should warn about datapoints referencing unknown groups', () => {
		const groups = [makeGroup({ name: 'existing' })];
		const datapoints = [makeDatapoint({ group: 'nonexistent', objectId: 'orphan' })];

		const result = resolveGroups(groups, datapoints, log);

		expect(result[0].datapoints).to.have.length(0);
		expect(log.warn).to.have.been.calledOnce;
		expect(log.warn.firstCall.args[0]).to.include('orphan');
		expect(log.warn.firstCall.args[0]).to.include('nonexistent');
		expect(log.warn.firstCall.args[0]).to.include('existing');
	});

	it('should return empty datapoints array for groups with no matching datapoints', () => {
		const groups = [makeGroup({ name: 'lonely' })];
		const datapoints: DatapointConfig[] = [];

		const result = resolveGroups(groups, datapoints, log);

		expect(result).to.have.length(1);
		expect(result[0].group.name).to.equal('lonely');
		expect(result[0].datapoints).to.have.length(0);
	});

	it('should handle empty groups array', () => {
		const result = resolveGroups([], [makeDatapoint()], log);

		expect(result).to.have.length(0);
		// Datapoint references unknown group since there are none
		expect(log.warn).to.have.been.calledOnce;
	});

	it('should preserve group order', () => {
		const groups = [makeGroup({ name: 'Z' }), makeGroup({ name: 'A' }), makeGroup({ name: 'M' })];

		const result = resolveGroups(groups, [], log);

		expect(result.map(r => r.group.name)).to.deep.equal(['Z', 'A', 'M']);
	});

	it('should pass through the full group config object', () => {
		const group = makeGroup({
			name: 'myGroup',
			bucket: 'my-bucket',
			triggerType: 'onChange',
			cronExpression: '',
			enabled: false,
		});

		const result = resolveGroups([group], [], log);

		expect(result[0].group).to.equal(group);
		expect(result[0].group.bucket).to.equal('my-bucket');
		expect(result[0].group.triggerType).to.equal('onChange');
		expect(result[0].group.enabled).to.equal(false);
	});
});
