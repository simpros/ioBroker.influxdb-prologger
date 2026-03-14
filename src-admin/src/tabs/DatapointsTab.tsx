import { DialogSelectID, I18n } from '@iobroker/adapter-react-v5';
import {
	Box,
	Button,
	Checkbox,
	FormControl,
	IconButton,
	InputLabel,
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
import SearchIcon from '@mui/icons-material/Search';
import { useState } from 'react';
import type { DatapointConfig, NativeConfig } from '../types.d';

interface DatapointsTabProps {
	native: NativeConfig;
	onChange: (attr: string, value: unknown) => void;
	socket: any;
	theme: any;
}

const DEFAULT_DATAPOINT: DatapointConfig = {
	enabled: true,
	group: '',
	objectId: '',
	measurement: '',
	field: 'value',
	tags: '',
};

/**
 * Datapoints configuration tab component
 *
 * @param root0 - component props
 * @param root0.native - native adapter config
 * @param root0.onChange - config change handler
 * @param root0.socket - ioBroker socket connection
 * @param root0.theme - MUI theme
 */
export default function DatapointsTab({ native, onChange, socket, theme }: DatapointsTabProps): React.JSX.Element {
	const [selectIdIndex, setSelectIdIndex] = useState<number | null>(null);
	const [groupFilter, setGroupFilter] = useState<string>('');

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

	const filteredDatapoints = datapoints
		.map((dp, index) => ({ dp, index }))
		.filter(({ dp }) => !groupFilter || dp.group === groupFilter);

	return (
		<Box>
			<Typography
				variant="body2"
				color="text.secondary"
				sx={{ mb: 2 }}
			>
				{I18n.t('datapointsInfo')}
			</Typography>

			<Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
				<Button
					variant="outlined"
					startIcon={<AddIcon />}
					onClick={addDatapoint}
				>
					{I18n.t('addDatapoint')}
				</Button>
				{groupNames.length > 0 && (
					<FormControl
						size="small"
						sx={{ minWidth: 200 }}
					>
						<InputLabel>{I18n.t('filterByGroup')}</InputLabel>
						<Select
							value={groupFilter}
							label={I18n.t('filterByGroup')}
							onChange={e => setGroupFilter(e.target.value)}
						>
							<MenuItem value="">{I18n.t('allGroups')}</MenuItem>
							{groupNames.map(name => (
								<MenuItem
									key={name}
									value={name}
								>
									{name}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				)}
			</Box>

			{datapoints.length === 0 ? (
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ fontStyle: 'italic' }}
				>
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
							{filteredDatapoints.map(({ dp, index }) => (
								<TableRow
									key={index}
									hover
								>
									<TableCell padding="checkbox">
										<Checkbox
											checked={dp.enabled}
											onChange={e => updateDatapoint(index, 'enabled', e.target.checked)}
											size="small"
										/>
									</TableCell>
									<TableCell sx={{ minWidth: 140 }}>
										<FormControl
											fullWidth
											size="small"
											variant="standard"
										>
											<Select
												value={dp.group}
												displayEmpty
												onChange={e => updateDatapoint(index, 'group', e.target.value)}
											>
												{!dp.group && (
													<MenuItem
														value=""
														disabled
													>
														<em>{I18n.t('selectGroup')}</em>
													</MenuItem>
												)}
												{groupNames.map(name => (
													<MenuItem
														key={name}
														value={name}
													>
														{name}
													</MenuItem>
												))}
											</Select>
										</FormControl>
									</TableCell>
									<TableCell sx={{ minWidth: 200 }}>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
											<TextField
												fullWidth
												size="small"
												variant="standard"
												value={dp.objectId}
												placeholder="0_userdata.0.example"
												onChange={e => updateDatapoint(index, 'objectId', e.target.value)}
											/>
											<IconButton
												size="small"
												onClick={() => setSelectIdIndex(index)}
												title={I18n.t('browseObjects')}
											>
												<SearchIcon fontSize="small" />
											</IconButton>
										</Box>
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

			{selectIdIndex !== null && (
				<DialogSelectID
					socket={socket}
					theme={theme}
					title={I18n.t('selectObject')}
					types={['state']}
					selected={datapoints[selectIdIndex]?.objectId || ''}
					onClose={() => setSelectIdIndex(null)}
					onOk={selected => {
						if (selected && selectIdIndex !== null) {
							const id = Array.isArray(selected) ? selected[0] : selected;
							if (id) {
								updateDatapoint(selectIdIndex, 'objectId', id);
							}
						}
						setSelectIdIndex(null);
					}}
				/>
			)}
		</Box>
	);
}
