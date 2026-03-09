import { I18n } from '@iobroker/adapter-react-v5';
import {
	Accordion,
	AccordionDetails,
	AccordionSummary,
	Box,
	Button,
	Checkbox,
	FormControl,
	FormControlLabel,
	Grid2 as Grid,
	IconButton,
	InputLabel,
	MenuItem,
	Select,
	TextField,
	Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { LoggingGroup, NativeConfig } from '../types.d';

interface GroupsTabProps {
	native: NativeConfig;
	onChange: (attr: string, value: unknown) => void;
}

const DEFAULT_GROUP: LoggingGroup = {
	enabled: true,
	name: '',
	bucket: '',
	triggerType: 'cron',
	cronExpression: '*/15 * * * *',
	batchWrite: true,
};

export default function GroupsTab({ native, onChange }: GroupsTabProps): React.JSX.Element {
	const groups = native.groups || [];

	const updateGroups = (newGroups: LoggingGroup[]): void => {
		onChange('groups', newGroups);
	};

	const addGroup = (): void => {
		updateGroups([...groups, { ...DEFAULT_GROUP }]);
	};

	const deleteGroup = (index: number): void => {
		updateGroups(groups.filter((_, i) => i !== index));
	};

	const updateGroup = (index: number, field: keyof LoggingGroup, value: unknown): void => {
		const oldName = groups[index].name;
		const updated = groups.map((g, i) => (i === index ? { ...g, [field]: value } : g));
		updateGroups(updated);

		// Cascade group name change to all assigned datapoints
		if (field === 'name' && typeof value === 'string' && oldName !== value) {
			const datapoints = native.datapoints || [];
			const updatedDatapoints = datapoints.map(dp =>
				dp.group === oldName ? { ...dp, group: value } : dp,
			);
			onChange('datapoints', updatedDatapoints);
		}
	};

	return (
		<Box>
			<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
				{I18n.t('groupsInfo')}
			</Typography>

			{groups.length === 0 && (
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontStyle: 'italic' }}>
					{I18n.t('noGroupsDefined')}
				</Typography>
			)}

			{groups.map((group, index) => (
				<Accordion key={index} defaultExpanded={groups.length === 1}>
					<AccordionSummary expandIcon={<ExpandMoreIcon />}>
						<Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1 }}>
							<Checkbox
								checked={group.enabled}
								onClick={e => e.stopPropagation()}
								onChange={e => updateGroup(index, 'enabled', e.target.checked)}
								size="small"
							/>
							<Typography sx={{ flex: 1 }}>
								{group.name || <em>({I18n.t('groupName')})</em>}
							</Typography>
							<Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
								{group.bucket && `${group.bucket} | `}
								{group.triggerType === 'cron' ? group.cronExpression : I18n.t('triggerOnChange')}
							</Typography>
							<IconButton
								size="small"
								onClick={e => {
									e.stopPropagation();
									deleteGroup(index);
								}}
								color="error"
							>
								<DeleteIcon fontSize="small" />
							</IconButton>
						</Box>
					</AccordionSummary>
					<AccordionDetails>
						<Grid container spacing={2}>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									fullWidth
									label={I18n.t('groupName')}
									value={group.name}
									onChange={e => updateGroup(index, 'name', e.target.value)}
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									fullWidth
									label={I18n.t('bucket')}
									value={group.bucket}
									onChange={e => updateGroup(index, 'bucket', e.target.value)}
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 4 }}>
								<FormControl fullWidth>
									<InputLabel>{I18n.t('triggerType')}</InputLabel>
									<Select
										value={group.triggerType}
										label={I18n.t('triggerType')}
										onChange={e => updateGroup(index, 'triggerType', e.target.value)}
									>
										<MenuItem value="cron">{I18n.t('triggerCron')}</MenuItem>
										<MenuItem value="onChange">{I18n.t('triggerOnChange')}</MenuItem>
									</Select>
								</FormControl>
							</Grid>
							{group.triggerType === 'cron' && (
								<Grid size={{ xs: 12, sm: 4 }}>
									<TextField
										fullWidth
										label={I18n.t('cronExpression')}
										value={group.cronExpression}
										placeholder="*/15 * * * *"
										onChange={e => updateGroup(index, 'cronExpression', e.target.value)}
									/>
								</Grid>
							)}
							<Grid size={{ xs: 12, sm: 4 }}>
								<FormControlLabel
									control={
										<Checkbox
											checked={group.batchWrite}
											onChange={e => updateGroup(index, 'batchWrite', e.target.checked)}
										/>
									}
									label={I18n.t('batchWrite')}
								/>
							</Grid>
						</Grid>
					</AccordionDetails>
				</Accordion>
			))}

			<Button variant="outlined" startIcon={<AddIcon />} onClick={addGroup} sx={{ mt: 2 }}>
				{I18n.t('addGroup')}
			</Button>
		</Box>
	);
}
