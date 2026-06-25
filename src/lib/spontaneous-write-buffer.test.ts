import { expect } from 'chai';
import sinon from 'sinon';
import { SpontaneousWriteBuffer } from './spontaneous-write-buffer';

/** Minimal writer interface used to verify flush calls in tests. */
interface Writer {
	write: sinon.SinonStub;
}

function makeWriter(): Writer {
	return { write: sinon.stub().resolves(true) };
}

describe('SpontaneousWriteBuffer', () => {
	let clock: sinon.SinonFakeTimers;

	beforeEach(() => {
		clock = sinon.useFakeTimers();
	});

	afterEach(() => {
		sinon.restore();
	});

	it('does not flush immediately when a change arrives', () => {
		const writer = makeWriter();
		const buf = new SpontaneousWriteBuffer(writer.write, 5000);

		buf.push('bucket-a', 'group-1', 'temperature value=21.5 1700000000000');

		expect(writer.write).to.not.have.been.called;
	});

	it('flushes all entries for a bucket+group after the window expires', async () => {
		const writer = makeWriter();
		const buf = new SpontaneousWriteBuffer(writer.write, 5000);

		buf.push('bucket-a', 'group-1', 'temperature value=21.5 1700000000000');
		buf.push('bucket-a', 'group-1', 'temperature value=22.0 1700000001000');

		await clock.tickAsync(5000);

		expect(writer.write).to.have.been.calledOnce;
		const [bucket, lines] = writer.write.firstCall.args;
		expect(bucket).to.equal('bucket-a');
		expect(lines).to.equal('temperature value=21.5 1700000000000\ntemperature value=22.0 1700000001000');
	});

	it('keeps entries from different groups independent', async () => {
		const writer = makeWriter();
		const buf = new SpontaneousWriteBuffer(writer.write, 5000);

		buf.push('bucket-a', 'group-1', 'temperature value=21.5 1700000000000');
		buf.push('bucket-b', 'group-2', 'humidity value=60 1700000000500');

		await clock.tickAsync(5000);

		expect(writer.write).to.have.been.calledTwice;
		const calls = writer.write.args.map((args: unknown[]) => ({ bucket: args[0] as string, lines: args[1] as string }));
		const callA = calls.find((c: { bucket: string }) => c.bucket === 'bucket-a');
		const callB = calls.find((c: { bucket: string }) => c.bucket === 'bucket-b');
		expect(callA).to.exist;
		expect(callB).to.exist;
		expect(callA!.lines).to.equal('temperature value=21.5 1700000000000');
		expect(callB!.lines).to.equal('humidity value=60 1700000000500');
	});

	it('new changes after window expiry open a fresh window', async () => {
		const writer = makeWriter();
		const buf = new SpontaneousWriteBuffer(writer.write, 5000);

		buf.push('bucket-a', 'group-1', 'temperature value=21.5 1700000000000');
		await clock.tickAsync(5000);
		expect(writer.write).to.have.been.calledOnce;

		// Second change opens a new window
		buf.push('bucket-a', 'group-1', 'temperature value=23.0 1700000006000');
		expect(writer.write).to.have.been.calledOnce; // still only once

		await clock.tickAsync(5000);
		expect(writer.write).to.have.been.calledTwice;
		const [, lines] = writer.write.secondCall.args;
		expect(lines).to.equal('temperature value=23.0 1700000006000');
	});

	it('changes arriving within the window do not reset the window', async () => {
		const writer = makeWriter();
		const buf = new SpontaneousWriteBuffer(writer.write, 5000);

		buf.push('bucket-a', 'group-1', 'temperature value=21.5 1700000000000');
		await clock.tickAsync(3000);
		buf.push('bucket-a', 'group-1', 'temperature value=22.0 1700000003000');
		// Total of 5000 ms since first push - window should fire now
		await clock.tickAsync(2000);

		expect(writer.write).to.have.been.calledOnce;
		const [, lines] = writer.write.firstCall.args;
		expect(lines).to.include('temperature value=21.5 1700000000000');
		expect(lines).to.include('temperature value=22.0 1700000003000');
	});

	it('flushAll writes all pending buffers immediately', async () => {
		const writer = makeWriter();
		const buf = new SpontaneousWriteBuffer(writer.write, 5000);

		buf.push('bucket-a', 'group-1', 'temperature value=21.5 1700000000000');
		buf.push('bucket-b', 'group-2', 'humidity value=60 1700000000500');

		await buf.flushAll();

		expect(writer.write).to.have.been.calledTwice;
	});

	it('flushAll clears pending timers so they do not double-flush', async () => {
		const writer = makeWriter();
		const buf = new SpontaneousWriteBuffer(writer.write, 5000);

		buf.push('bucket-a', 'group-1', 'temperature value=21.5 1700000000000');
		await buf.flushAll();

		// Advance past where the window would have fired
		await clock.tickAsync(5000);

		// Should still only have been called once (from flushAll)
		expect(writer.write).to.have.been.calledOnce;
	});

	it('flushAll returns true when all writes succeed', async () => {
		const writer = makeWriter();
		const buf = new SpontaneousWriteBuffer(writer.write, 5000);

		buf.push('bucket-a', 'group-1', 'temperature value=21.5 1700000000000');

		const result = await buf.flushAll();

		expect(result).to.equal(true);
	});

	it('flushAll returns false when any write fails', async () => {
		const writer = makeWriter();
		writer.write.resolves(false);
		const buf = new SpontaneousWriteBuffer(writer.write, 5000);

		buf.push('bucket-a', 'group-1', 'temperature value=21.5 1700000000000');

		const result = await buf.flushAll();

		expect(result).to.equal(false);
	});

	it('same (bucket, group) key, different flush windows are independent instances', async () => {
		const writer = makeWriter();
		const buf1 = new SpontaneousWriteBuffer(writer.write, 2000);
		const buf2 = new SpontaneousWriteBuffer(writer.write, 8000);

		buf1.push('bucket-a', 'group-1', 'temperature value=21.5 1700000000000');
		buf2.push('bucket-a', 'group-1', 'temperature value=22.0 1700000000100');

		await clock.tickAsync(2000);
		expect(writer.write).to.have.been.calledOnce;

		await clock.tickAsync(6000);
		expect(writer.write).to.have.been.calledTwice;
	});
});
