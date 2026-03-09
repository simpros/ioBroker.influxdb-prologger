import { expect } from 'chai';
import sinon from 'sinon';
import { InfluxClient, type InfluxConnectionConfig, type Logger } from './influx-client';

function makeConfig(overrides: Partial<InfluxConnectionConfig> = {}): InfluxConnectionConfig {
	return {
		url: 'http://localhost:8086',
		organization: 'myorg',
		token: 'test-token',
		writeTimeout: 5000,
		retryOnError: false,
		maxRetries: 3,
		...overrides,
	};
}

function makeLogger(): { [K in keyof Logger]: sinon.SinonStub } {
	return {
		debug: sinon.stub(),
		info: sinon.stub(),
		warn: sinon.stub(),
		error: sinon.stub(),
	};
}

function mockResponse(status: number, body = '', ok?: boolean): Response {
	return {
		ok: ok ?? (status >= 200 && status < 300),
		status,
		text: sinon.stub().resolves(body),
	} as unknown as Response;
}

describe('InfluxClient', () => {
	let fetchStub: sinon.SinonStub;

	beforeEach(() => {
		fetchStub = sinon.stub(global, 'fetch');
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('write', () => {
		it('should POST line data to the correct URL', async () => {
			fetchStub.resolves(mockResponse(204));
			const log = makeLogger();
			const client = new InfluxClient(makeConfig(), log, false);

			const result = await client.write('my-bucket', 'temperature value=21.5');

			expect(result).to.equal(true);
			expect(fetchStub).to.have.been.calledOnce;

			const [url, opts] = fetchStub.firstCall.args;
			expect(url).to.equal('http://localhost:8086/api/v2/write?bucket=my-bucket&org=myorg');
			expect(opts.method).to.equal('POST');
			expect(opts.headers['Content-Type']).to.equal('text/plain');
			expect(opts.headers.Authorization).to.equal('Token test-token');
			expect(opts.body).to.equal('temperature value=21.5');
		});

		it('should URL-encode bucket and org names', async () => {
			fetchStub.resolves(mockResponse(204));
			const client = new InfluxClient(makeConfig({ organization: 'my org' }), makeLogger(), false);

			await client.write('my bucket', 'data value=1');

			const [url] = fetchStub.firstCall.args;
			expect(url).to.include('bucket=my%20bucket');
			expect(url).to.include('org=my%20org');
		});

		it('should return false on 4xx errors without retrying', async () => {
			fetchStub.resolves(mockResponse(400, 'bad request'));
			const log = makeLogger();
			const client = new InfluxClient(makeConfig({ retryOnError: true, maxRetries: 3 }), log, false);

			const result = await client.write('bucket', 'data value=1');

			expect(result).to.equal(false);
			expect(fetchStub).to.have.been.calledOnce;
			expect(log.error).to.have.been.calledOnce;
		});

		it('should not retry on 401 unauthorized', async () => {
			fetchStub.resolves(mockResponse(401, 'unauthorized'));
			const client = new InfluxClient(makeConfig({ retryOnError: true, maxRetries: 3 }), makeLogger(), false);

			const result = await client.write('bucket', 'data value=1');

			expect(result).to.equal(false);
			expect(fetchStub).to.have.been.calledOnce;
		});

		it('should retry on 429 rate limit', async () => {
			// Use a fake timer to avoid real backoff delays
			const clock = sinon.useFakeTimers();
			fetchStub.onFirstCall().resolves(mockResponse(429, 'rate limited'));
			fetchStub.onSecondCall().resolves(mockResponse(204));
			const log = makeLogger();
			const client = new InfluxClient(makeConfig({ retryOnError: true, maxRetries: 1 }), log, false);

			const writePromise = client.write('bucket', 'data value=1');
			// Advance past the 1s backoff delay
			await clock.tickAsync(1500);
			const result = await writePromise;

			expect(result).to.equal(true);
			expect(fetchStub).to.have.been.calledTwice;
			expect(log.warn).to.have.been.calledOnce;
			clock.restore();
		});

		it('should retry on 5xx server errors', async () => {
			const clock = sinon.useFakeTimers();
			fetchStub.onFirstCall().resolves(mockResponse(500, 'server error'));
			fetchStub.onSecondCall().resolves(mockResponse(204));
			const log = makeLogger();
			const client = new InfluxClient(makeConfig({ retryOnError: true, maxRetries: 1 }), log, false);

			const writePromise = client.write('bucket', 'data value=1');
			await clock.tickAsync(1500);
			const result = await writePromise;

			expect(result).to.equal(true);
			expect(fetchStub).to.have.been.calledTwice;
			clock.restore();
		});

		it('should retry on network errors', async () => {
			const clock = sinon.useFakeTimers();
			fetchStub.onFirstCall().rejects(new Error('ECONNREFUSED'));
			fetchStub.onSecondCall().resolves(mockResponse(204));
			const log = makeLogger();
			const client = new InfluxClient(makeConfig({ retryOnError: true, maxRetries: 1 }), log, false);

			const writePromise = client.write('bucket', 'data value=1');
			await clock.tickAsync(1500);
			const result = await writePromise;

			expect(result).to.equal(true);
			expect(fetchStub).to.have.been.calledTwice;
			expect(log.warn).to.have.been.calledOnce;
			clock.restore();
		});

		it('should return false after exhausting all retries', async () => {
			const clock = sinon.useFakeTimers();
			fetchStub.resolves(mockResponse(500, 'server error'));
			const log = makeLogger();
			const client = new InfluxClient(makeConfig({ retryOnError: true, maxRetries: 2 }), log, false);

			const writePromise = client.write('bucket', 'data value=1');
			// Advance past all backoff delays (1s + 2s)
			await clock.tickAsync(5000);
			const result = await writePromise;

			expect(result).to.equal(false);
			// 1 initial + 2 retries = 3 attempts
			expect(fetchStub).to.have.been.calledThrice;
			expect(log.error).to.have.been.calledOnce;
			expect(log.error.firstCall.args[0]).to.include('3 attempt(s)');
			clock.restore();
		});

		it('should not retry when retryOnError is false', async () => {
			fetchStub.resolves(mockResponse(500, 'server error'));
			const log = makeLogger();
			const client = new InfluxClient(makeConfig({ retryOnError: false }), log, false);

			const result = await client.write('bucket', 'data value=1');

			expect(result).to.equal(false);
			expect(fetchStub).to.have.been.calledOnce;
		});

		it('should log debug messages when enableDebugLogs is true', async () => {
			fetchStub.resolves(mockResponse(204));
			const log = makeLogger();
			const client = new InfluxClient(makeConfig(), log, true);

			await client.write('bucket', 'data value=1');

			expect(log.debug).to.have.been.calledOnce;
			expect(log.debug.firstCall.args[0]).to.include('Successfully wrote');
		});

		it('should not log debug messages when enableDebugLogs is false', async () => {
			fetchStub.resolves(mockResponse(204));
			const log = makeLogger();
			const client = new InfluxClient(makeConfig(), log, false);

			await client.write('bucket', 'data value=1');

			expect(log.debug).to.not.have.been.called;
		});
	});

	describe('testConnection', () => {
		it('should return true when health endpoint responds OK', async () => {
			fetchStub.resolves(mockResponse(200, '{"status":"pass"}'));
			const log = makeLogger();
			const client = new InfluxClient(makeConfig(), log, false);

			const result = await client.testConnection();

			expect(result).to.equal(true);
			expect(log.info).to.have.been.calledOnce;
			expect(log.info.firstCall.args[0]).to.include('Successfully connected');

			const [url, opts] = fetchStub.firstCall.args;
			expect(url).to.equal('http://localhost:8086/health');
			expect(opts.method).to.equal('GET');
			expect(opts.headers.Authorization).to.equal('Token test-token');
		});

		it('should return false on non-OK health response', async () => {
			fetchStub.resolves(mockResponse(503, 'service unavailable'));
			const log = makeLogger();
			const client = new InfluxClient(makeConfig(), log, false);

			const result = await client.testConnection();

			expect(result).to.equal(false);
			expect(log.error).to.have.been.calledOnce;
			expect(log.error.firstCall.args[0]).to.include('503');
		});

		it('should return false on network error', async () => {
			fetchStub.rejects(new Error('ECONNREFUSED'));
			const log = makeLogger();
			const client = new InfluxClient(makeConfig(), log, false);

			const result = await client.testConnection();

			expect(result).to.equal(false);
			expect(log.error).to.have.been.calledOnce;
			expect(log.error.firstCall.args[0]).to.include('ECONNREFUSED');
		});

		it('should use full URL with HTTPS (reverse proxy)', async () => {
			fetchStub.resolves(mockResponse(200));
			const client = new InfluxClient(
				makeConfig({ url: 'https://influx.example.com' }),
				makeLogger(),
				false,
			);

			await client.testConnection();

			const [url] = fetchStub.firstCall.args;
			expect(url).to.equal('https://influx.example.com/health');
		});

		it('should strip trailing slash from URL', async () => {
			fetchStub.resolves(mockResponse(200));
			const client = new InfluxClient(
				makeConfig({ url: 'http://localhost:8086/' }),
				makeLogger(),
				false,
			);

			await client.testConnection();

			const [url] = fetchStub.firstCall.args;
			expect(url).to.equal('http://localhost:8086/health');
		});
	});

	describe('testWithConfig (static)', () => {
		it('should return success on OK health response', async () => {
			fetchStub.resolves(mockResponse(200));

			const result = await InfluxClient.testWithConfig({
				url: 'http://localhost:8086',
				token: 'tok',
			});

			expect(result.success).to.equal(true);
			expect(result.message).to.equal('Connection successful!');
		});

		it('should return failure on non-OK response', async () => {
			fetchStub.resolves(mockResponse(401, 'unauthorized'));

			const result = await InfluxClient.testWithConfig({
				url: 'http://localhost:8086',
				token: 'bad-token',
			});

			expect(result.success).to.equal(false);
			expect(result.message).to.include('401');
			expect(result.message).to.include('unauthorized');
		});

		it('should return failure on network error', async () => {
			fetchStub.rejects(new Error('ECONNREFUSED'));

			const result = await InfluxClient.testWithConfig({
				url: 'http://localhost:8086',
				token: 'tok',
			});

			expect(result.success).to.equal(false);
			expect(result.message).to.include('Connection failed');
			expect(result.message).to.include('ECONNREFUSED');
		});
	});
});
