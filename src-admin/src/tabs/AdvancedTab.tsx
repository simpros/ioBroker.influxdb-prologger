import { I18n } from '@iobroker/adapter-react-v5';
import { Box, Checkbox, FormControlLabel, Grid2 as Grid, TextField, Typography } from '@mui/material';
import type { NativeConfig } from '../types.d';

interface AdvancedTabProps {
	native: NativeConfig;
	onChange: (attr: string, value: unknown) => void;
}

/**
 * Advanced settings tab component
 *
 * @param root0 - component props
 * @param root0.native - native adapter config
 * @param root0.onChange - config change handler
 */
export default function AdvancedTab({ native, onChange }: AdvancedTabProps): React.JSX.Element {
	return (
		<Box>
			<Grid
				container
				spacing={2}
			>
				<Grid size={{ xs: 12, sm: 4 }}>
					<TextField
						fullWidth
						label={I18n.t('writeTimeout')}
						type="number"
						value={native.writeTimeout ?? 5000}
						slotProps={{ htmlInput: { min: 1000, max: 60000 } }}
						helperText={I18n.t('writeTimeoutHelp')}
						onChange={e => onChange('writeTimeout', Number(e.target.value))}
					/>
				</Grid>
				<Grid size={{ xs: 12 }}>
					<FormControlLabel
						control={
							<Checkbox
								checked={native.retryOnError ?? true}
								onChange={e => onChange('retryOnError', e.target.checked)}
							/>
						}
						label={I18n.t('retryOnError')}
					/>
				</Grid>
				{native.retryOnError && (
					<Grid size={{ xs: 12, sm: 4 }}>
						<TextField
							fullWidth
							label={I18n.t('maxRetries')}
							type="number"
							value={native.maxRetries ?? 3}
							slotProps={{ htmlInput: { min: 0, max: 10 } }}
							onChange={e => onChange('maxRetries', Number(e.target.value))}
						/>
					</Grid>
				)}
				<Grid size={{ xs: 12 }}>
					<FormControlLabel
						control={
							<Checkbox
								checked={native.enableDebugLogs ?? false}
								onChange={e => onChange('enableDebugLogs', e.target.checked)}
							/>
						}
						label={<Typography>{I18n.t('enableDebugLogs')}</Typography>}
					/>
				</Grid>
			</Grid>
		</Box>
	);
}
