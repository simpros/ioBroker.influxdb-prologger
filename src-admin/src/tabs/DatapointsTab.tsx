import { I18n } from '@iobroker/adapter-react-v5';
import {
	Box,
	Button,
	Checkbox,
	FormControl,
	IconButton,
	MenuItem,
	Select,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import type { DatapointConfig, NativeConfig } from '../types.d';

interface DatapointsTabProps {
	native: NativeConfig;
	onChange: (attr: string, value: unknown) => void;
}

const DEFAULT_DATAPOINT: DatapointConfig = {
	enabled: true,
	group: '',
	objectId: '',
	measurement: '',
	field: 'value',
	tags: '',
};

export default function DatapointsTab({ native, onChange }: DatapointsTabProps): React.JSX.Element {
	const datapoints = native.datapoints || [];
	const groups = native.groups || [];
	const groupNames = groups.map(g => g.name).filter(Boolean);

	const updateDatapoints = (newDatapoints: DatapointConfig[]): void => {
		onChange('datapoints', newDatapoints);
	};

	const addDatapoint = (): void => {
		updateDatapoints([...datapoints, { ...DEFAULT_DATAPOINT, group: groupNames[0] || '' }]);
	};

	const deleteDatapoint = (index: number): void => {
		updateDatapoints(datapoints.filter((_, i) => i !== index));
	};

	const updateDatapoint = (index: number, field: keyof DatapointConfig, value: unknown): void => {
		const updated = datapoints.map((dp, i) => (i === index ? { ...dp, [field]: value } : dp));
		updateDatapoints(updated);
	};

	return (
		<Box>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				{I18n.t('datapointsInfo')}
			</Typography>

			<Button variant="outlined" startIcon={<AddIcon />} onClick={addDatapoint} sx={{ mb: 2 }}>
				{I18n.t('addDatapoint')}
			</Button>

			{datapoints.length === 0 ? (
				<Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
					{I18n.t('noDatapointsDefined')}
				</Typography>
			) : (
				<TableContainer>
					<Table size="small">
						<TableHead>
							<TableRow>
								<TableCell padding="checkbox">{I18n.t('enabled')}</TableCell>
								<TableCell>{I18n.t('group')}</TableCell>
								<TableCell>{I18n.t('objectId')}</TableCell>
								<TableCell>{I18n.t('measurement')}</TableCell>
								<TableCell>{I18n.t('fieldName')}</TableCell>
								<TableCell>{I18n.t('tags')}</TableCell>
								<TableCell padding="checkbox" />
							</TableRow>
						</TableHead>
						<TableBody>
							{datapoints.map((dp, index) => (
								<TableRow key={index} hover>
									<TableCell padding="checkbox">
										<Checkbox
											checked={dp.enabled}
											onChange={e => updateDatapoint(index, 'enabled', e.target.checked)}
											size="small"
										/>
									</TableCell>
									<TableCell sx={{ minWidth: 140 }}>
										<FormControl fullWidth size="small" variant="standard">
											<Select
												value={dp.group}
												displayEmpty
												onChange={e => updateDatapoint(index, 'group', e.target.value)}
											>
												{!dp.group && (
													<MenuItem value="" disabled>
														<em>{I18n.t('selectGroup')}</em>
													</MenuItem>
												)}
												{groupNames.map(name => (
													<MenuItem key={name} value={name}>
														{name}
													</MenuItem>
												))}
											</Select>
										</FormControl>
									</TableCell>
									<TableCell sx={{ minWidth: 200 }}>
										<TextField
											fullWidth
											size="small"
											variant="standard"
											value={dp.objectId}
											placeholder="0_userdata.0.example"
											onChange={e => updateDatapoint(index, 'objectId', e.target.value)}
										/>
									</TableCell>
									<TableCell sx={{ minWidth: 140 }}>
										<TextField
											fullWidth
											size="small"
											variant="standard"
											value={dp.measurement}
											onChange={e => updateDatapoint(index, 'measurement', e.target.value)}
										/>
									</TableCell>
									<TableCell sx={{ minWidth: 100 }}>
										<TextField
											fullWidth
											size="small"
											variant="standard"
											value={dp.field}
											onChange={e => updateDatapoint(index, 'field', e.target.value)}
										/>
									</TableCell>
									<TableCell sx={{ minWidth: 160 }}>
										<TextField
											fullWidth
											size="small"
											variant="standard"
											value={dp.tags}
											placeholder={I18n.t('tagsPlaceholder')}
											onChange={e => updateDatapoint(index, 'tags', e.target.value)}
										/>
									</TableCell>
									<TableCell padding="checkbox">
										<IconButton
											size="small"
											onClick={() => deleteDatapoint(index)}
											color="error"
										>
											<DeleteIcon fontSize="small" />
										</IconButton>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableContainer>
			)}
		</Box>
	);
}
