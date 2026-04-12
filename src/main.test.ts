import { expect } from 'chai';
import sinon from 'sinon';
import { formatInfluxValue, formatLineProtocol } from './lib/line-protocol';
import { resolveGroups } from './lib/group-resolver';
import { InfluxClient } from './lib/influx-client';
import { shouldProcessOnChangeState } from './lib/state-change';
import type { DatapointConfig, LoggingGroup } from './lib/adapter-config';

/**
 * Top-level integration-style tests that exercise the modules together,
 * simulating the data flow the adapter performs at runtime.
 */
describe('adapter data flow', () => {
	let fetchStub: sinon.SinonStub;

	beforeEach(() => {
		fetchStub = sinon.stub(global, 'fetch');
	});

	afterEach(() => {
		sinon.restore();
	});

	it('should resolve groups, format line protocol, and write to InfluxDB', async () => {
		// 1. Config
		const groups: LoggingGroup[] = [
			{
				enabled: true,
				name: 'environment',
				bucket: 'home',
				triggerType: 'cron',
				cronExpression: '*/15 * * * *',
				batchWrite: true,
			},
		];
		const datapoints: DatapointConfig[] = [
			{
				enabled: true,
				group: 'environment',
				objectId: 'hm-rpc.0.temp_outside',
				measurement: 'temperature',
				field: 'value',
				tags: 'location=outside',
			},
			{
				enabled: true,
				group: 'environment',
				objectId: 'hm-rpc.0.humidity',
				measurement: 'humidity',
				field: 'value',
				tags: '',
			},
			{
				enabled: false,
				group: 'environment',
				objectId: 'hm-rpc.0.disabled_sensor',
				measurement: 'disabled',
				field: 'value',
				tags: '',
			},
		];

		// 2. Resolve groups (should skip the disabled datapoint)
		const log = { warn: sinon.stub() };
		const resolved = resolveGroups(groups, datapoints, log);

		expect(resolved).to.have.length(1);
		expect(resolved[0].datapoints).to.have.length(2);
		expect(log.warn).to.not.have.been.called;

		// 3. Format line protocol for the resolved datapoints
		const lines = resolved[0].datapoints.map(dp => formatLineProtocol(dp.measurement, dp.tags, dp.field, 21.5));

		expect(lines[0]).to.equal('temperature,location=outside value=21.5');
		expect(lines[1]).to.equal('humidity value=21.5');

		// 4. Write batch to InfluxDB
		fetchStub.resolves({
			ok: true,
			status: 204,
			text: sinon.stub().resolves(''),
		} as unknown as Response);

		const client = new InfluxClient(
			{
				url: 'http://localhost:8086',
				organization: 'myorg',
				token: 'secret',
				writeTimeout: 5000,
				retryOnError: false,
				maxRetries: 0,
			},
			{ debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
			false,
		);

		const success = await client.write('home', lines.join('\n'));
		expect(success).to.equal(true);

		const [, opts] = fetchStub.firstCall.args;
		expect(opts.body).to.equal('temperature,location=outside value=21.5\nhumidity value=21.5');
	});

	it('should handle mixed value types in a batch', () => {
		const values: { val: ioBroker.StateValue; expected: string }[] = [
			{ val: 23.4, expected: 'temp value=23.4' },
			{ val: true, expected: 'switch state=true' },
			{ val: 'running', expected: 'status msg="running"' },
			{ val: 0, expected: 'counter count=0' },
			{ val: false, expected: 'flag active=false' },
		];

		const measurements = ['temp', 'switch', 'status', 'counter', 'flag'];
		const fields = ['value', 'state', 'msg', 'count', 'active'];

		values.forEach(({ val, expected }, i) => {
			const line = formatLineProtocol(measurements[i], '', fields[i], val);
			expect(line).to.equal(expected);
		});
	});

	it('should warn when datapoints reference groups that do not exist', () => {
		const groups: LoggingGroup[] = [
			{
				enabled: true,
				name: 'real',
				bucket: 'b',
				triggerType: 'cron',
				cronExpression: '',
				batchWrite: false,
			},
		];
		const datapoints: DatapointConfig[] = [
			{
				enabled: true,
				group: 'ghost',
				objectId: 'orphan.0.value',
				measurement: 'm',
				field: 'f',
				tags: '',
			},
		];

		const log = { warn: sinon.stub() };
		const resolved = resolveGroups(groups, datapoints, log);

		expect(resolved[0].datapoints).to.have.length(0);
		expect(log.warn).to.have.been.calledOnce;
		expect(log.warn.firstCall.args[0]).to.include('ghost');
	});

	it('should propagate write failure correctly', async () => {
		fetchStub.resolves({
			ok: false,
			status: 400,
			text: sinon.stub().resolves('invalid line protocol'),
		} as unknown as Response);

		const errLog = { debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };
		const client = new InfluxClient(
			{
				url: 'http://localhost:8086',
				organization: 'org',
				token: 'tok',
				writeTimeout: 5000,
				retryOnError: false,
				maxRetries: 0,
			},
			errLog,
			false,
		);

		const line = formatLineProtocol('m', '', 'f', 42);
		const success = await client.write('bucket', line);

		expect(success).to.equal(false);
		expect(errLog.error).to.have.been.calledOnce;
		expect(errLog.error.firstCall.args[0]).to.include('400');
	});

	describe('formatInfluxValue edge cases', () => {
		it('should handle strings with unicode characters', () => {
			expect(formatInfluxValue('Wohnzimmer')).to.equal('"Wohnzimmer"');
		});

		it('should handle very large numbers', () => {
			expect(formatInfluxValue(Number.MAX_SAFE_INTEGER)).to.equal('9007199254740991');
		});

		it('should handle very small negative numbers', () => {
			expect(formatInfluxValue(-0.00001)).to.equal('-0.00001');
		});
	});

	describe('shouldProcessOnChangeState', () => {
		it('should process own states only when ack is false', () => {
			expect(shouldProcessOnChangeState('influxdb-prologger.0', 'influxdb-prologger.0.command', false)).to.equal(
				true,
			);
			expect(shouldProcessOnChangeState('influxdb-prologger.0', 'influxdb-prologger.0.command', true)).to.equal(
				false,
			);
		});

		it('should process foreign states only when ack is true', () => {
			expect(shouldProcessOnChangeState('influxdb-prologger.0', 'hm-rpc.0.temperature', true)).to.equal(true);
			expect(shouldProcessOnChangeState('influxdb-prologger.0', 'hm-rpc.0.temperature', false)).to.equal(false);
			expect(shouldProcessOnChangeState('influxdb-prologger.0', 'hm-rpc.0.temperature', undefined)).to.equal(
				false,
			);
		});
	});
});
