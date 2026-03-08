import { I18n } from '@iobroker/adapter-react-v5';
import {
	Alert,
	Box,
	Button,
	CircularProgress,
	FormControl,
	Grid2 as Grid,
	InputLabel,
	MenuItem,
	Select,
	TextField,
} from '@mui/material';
import { useState } from 'react';
import type { NativeConfig } from '../types.d';

interface ConnectionTabProps {
	native: NativeConfig;
	onChange: (attr: string, value: unknown) => void;
	socket: any;
	instance: number;
}

export default function ConnectionTab({ native, onChange, socket, instance }: ConnectionTabProps): React.JSX.Element {
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

	const testConnection = async (): Promise<void> => {
		setTesting(true);
		setTestResult(null);
		try {
			const result = await socket.sendTo(`influxdb-prologger.${instance}`, 'testConnection', {
				protocol: native.protocol,
				host: native.host,
				port: native.port,
				organization: native.organization,
				token: native.token,
			});
			if (result?.error) {
				setTestResult({ success: false, message: result.error });
			} else {
				setTestResult({ success: true, message: result?.result || I18n.t('testSuccess') });
			}
		} catch (e: unknown) {
			setTestResult({ success: false, message: e instanceof Error ? e.message : String(e) });
		} finally {
			setTesting(false);
		}
	};

	return (
		<Box>
			<Grid container spacing={2}>
				<Grid size={{ xs: 12, sm: 3 }}>
					<FormControl fullWidth>
						<InputLabel>{I18n.t('protocol')}</InputLabel>
						<Select
							value={native.protocol || 'http'}
							label={I18n.t('protocol')}
							onChange={e => onChange('protocol', e.target.value)}
						>
							<MenuItem value="http">HTTP</MenuItem>
							<MenuItem value="https">HTTPS</MenuItem>
						</Select>
					</FormControl>
				</Grid>
				<Grid size={{ xs: 12, sm: 6 }}>
					<TextField
						fullWidth
						label={I18n.t('host')}
						value={native.host || ''}
						placeholder="192.168.1.100"
						onChange={e => onChange('host', e.target.value)}
						error={!native.host}
						helperText={!native.host ? I18n.t('hostRequired') : undefined}
					/>
				</Grid>
				<Grid size={{ xs: 12, sm: 3 }}>
					<TextField
						fullWidth
						label={I18n.t('port')}
						type="number"
						value={native.port ?? 8086}
						slotProps={{ htmlInput: { min: 1, max: 65535 } }}
						onChange={e => onChange('port', Number(e.target.value))}
					/>
				</Grid>
				<Grid size={{ xs: 12, sm: 6 }}>
					<TextField
						fullWidth
						label={I18n.t('organization')}
						value={native.organization || ''}
						onChange={e => onChange('organization', e.target.value)}
					/>
				</Grid>
				<Grid size={{ xs: 12, sm: 6 }}>
					<TextField
						fullWidth
						label={I18n.t('apiToken')}
						type="password"
						value={native.token || ''}
						onChange={e => onChange('token', e.target.value)}
					/>
				</Grid>
				<Grid size={{ xs: 12 }}>
					<Button
						variant="contained"
						onClick={testConnection}
						disabled={testing || !native.host}
						startIcon={testing ? <CircularProgress size={20} /> : undefined}
					>
						{I18n.t('testConnection')}
					</Button>
					{testResult && (
						<Alert severity={testResult.success ? 'success' : 'error'} sx={{ mt: 1 }}>
							{testResult.message}
						</Alert>
					)}
				</Grid>
			</Grid>
		</Box>
	);
}
