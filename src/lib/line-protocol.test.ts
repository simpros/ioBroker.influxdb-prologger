import { expect } from 'chai';
import { formatInfluxValue, formatLineProtocol } from './line-protocol';

describe('line-protocol', () => {
	describe('formatInfluxValue', () => {
		it('should format positive integers', () => {
			expect(formatInfluxValue(42)).to.equal('42');
		});

		it('should format negative numbers', () => {
			expect(formatInfluxValue(-3.14)).to.equal('-3.14');
		});

		it('should format zero', () => {
			expect(formatInfluxValue(0)).to.equal('0');
		});

		it('should format floating point numbers', () => {
			expect(formatInfluxValue(21.5)).to.equal('21.5');
		});

		it('should format boolean true', () => {
			expect(formatInfluxValue(true)).to.equal('true');
		});

		it('should format boolean false', () => {
			expect(formatInfluxValue(false)).to.equal('false');
		});

		it('should quote simple strings', () => {
			expect(formatInfluxValue('hello')).to.equal('"hello"');
		});

		it('should escape double quotes in strings', () => {
			expect(formatInfluxValue('say "hi"')).to.equal('"say \\"hi\\""');
		});

		it('should escape backslashes in strings', () => {
			expect(formatInfluxValue('path\\to\\file')).to.equal('"path\\\\to\\\\file"');
		});

		it('should escape both backslashes and quotes', () => {
			expect(formatInfluxValue('a\\"b')).to.equal('"a\\\\\\"b"');
		});

		it('should handle empty strings', () => {
			expect(formatInfluxValue('')).to.equal('""');
		});

		it('should stringify null as "null"', () => {
			expect(formatInfluxValue(null)).to.equal('null');
		});
	});

	describe('formatLineProtocol', () => {
		it('should format a line with no tags', () => {
			const result = formatLineProtocol('temperature', '', 'value', 21.5);
			expect(result).to.equal('temperature value=21.5');
		});

		it('should format a line with a single tag', () => {
			const result = formatLineProtocol('temperature', 'room=living', 'value', 21.5);
			expect(result).to.equal('temperature,room=living value=21.5');
		});

		it('should format a line with multiple tags', () => {
			const result = formatLineProtocol('temperature', 'room=living,floor=1', 'value', 21.5);
			expect(result).to.equal('temperature,room=living,floor=1 value=21.5');
		});

		it('should format a boolean value', () => {
			const result = formatLineProtocol('switch', 'device=lamp', 'state', true);
			expect(result).to.equal('switch,device=lamp state=true');
		});

		it('should format a string value with proper quoting', () => {
			const result = formatLineProtocol('status', '', 'message', 'all good');
			expect(result).to.equal('status message="all good"');
		});

		it('should handle a zero value', () => {
			const result = formatLineProtocol('counter', '', 'count', 0);
			expect(result).to.equal('counter count=0');
		});
	});
});
