import { I18n } from '@iobroker/adapter-react-v5';
import { Alert, Box, Button, CircularProgress, Grid2 as Grid, TextField } from '@mui/material';
import { useState } from 'react';
import type { NativeConfig } from '../types.d';

interface ConnectionTabProps {
	native: NativeConfig;
	onChange: (attr: string, value: unknown) => void;
	socket: any;
	instance: number;
}

/**
 * Connection settings tab component
 *
 * @param root0 - component props
 * @param root0.native - native adapter config
 * @param root0.onChange - config change handler
 * @param root0.socket - ioBroker socket connection
 * @param root0.instance - adapter instance number
 */
export default function ConnectionTab({ native, onChange, socket, instance }: ConnectionTabProps): React.JSX.Element {
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

	const testConnection = async (): Promise<void> => {
		setTesting(true);
		setTestResult(null);
		try {
			const result = await socket.sendTo(`influxdb-prologger.${instance}`, 'testConnection', {
				url: native.url,
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
			<Grid
				container
				spacing={2}
			>
				<Grid size={{ xs: 12 }}>
					<TextField
						fullWidth
						label={I18n.t('url')}
						value={native.url || ''}
						placeholder={I18n.t('urlPlaceholder')}
						onChange={e => onChange('url', e.target.value)}
						error={!native.url}
						helperText={!native.url ? I18n.t('urlRequired') : I18n.t('urlHelperText')}
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
						disabled={testing || !native.url}
						startIcon={testing ? <CircularProgress size={20} /> : undefined}
					>
						{I18n.t('testConnection')}
					</Button>
					{testResult && (
						<Alert
							severity={testResult.success ? 'success' : 'error'}
							sx={{ mt: 1 }}
						>
							{testResult.message}
						</Alert>
					)}
				</Grid>
			</Grid>
		</Box>
	);
}
