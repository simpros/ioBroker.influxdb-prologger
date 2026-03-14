import { GenericApp, I18n, type GenericAppProps, type GenericAppState } from '@iobroker/adapter-react-v5';
import { Box, Tab, Tabs, ThemeProvider } from '@mui/material';
import type { DatapointConfig, LoggingGroup, NativeConfig } from './types.d';
import en from './i18n/en.json';
import de from './i18n/de.json';
import ConnectionTab from './tabs/ConnectionTab';
import GroupsTab from './tabs/GroupsTab';
import DatapointsTab from './tabs/DatapointsTab';
import AdvancedTab from './tabs/AdvancedTab';

interface AppState extends GenericAppState {
	activeTab: number;
}

/** Main adapter configuration app */
class App extends GenericApp<GenericAppProps, AppState> {
	/**
	 * Creates a new App instance
	 *
	 * @param props - generic app props
	 */
	constructor(props: GenericAppProps) {
		const extendedProps: GenericAppProps = { ...props };
		extendedProps.translations = { en, de };
		extendedProps.bottomButtons = true;
		super(props, extendedProps);

		Object.assign(this.state, { activeTab: 0 });
	}

	/** Called when the connection to the backend is ready */
	onConnectionReady(): void {
		// nothing extra needed - GenericApp loads native config automatically
	}

	/**
	 * Updates a native config value with group rename cascading
	 *
	 * @param attr - config attribute name
	 * @param value - new value
	 */
	updateNativeValue(attr: string, value: unknown): void {
		// When groups are updated, cascade any name changes to datapoints
		// in a single setState to avoid stale-state overwrites
		if (attr === 'groups') {
			const oldGroups = ((this.state.native as Record<string, unknown>).groups || []) as LoggingGroup[];
			const newGroups = value as LoggingGroup[];
			const datapoints = ((this.state.native as Record<string, unknown>).datapoints || []) as DatapointConfig[];

			let updatedDatapoints = datapoints;
			for (let i = 0; i < Math.min(oldGroups.length, newGroups.length); i++) {
				const oldName = oldGroups[i].name;
				const newName = newGroups[i].name;
				if (oldName && oldName !== newName) {
					updatedDatapoints = updatedDatapoints.map(dp =>
						dp.group === oldName ? { ...dp, group: newName } : dp,
					);
				}
			}

			if (updatedDatapoints !== datapoints) {
				const native = JSON.parse(JSON.stringify(this.state.native));
				native.groups = newGroups;
				native.datapoints = updatedDatapoints;
				this.setState({ native, changed: true } as Partial<AppState>);
				return;
			}
		}

		super.updateNativeValue(attr, value);
	}

	/** Renders the app UI */
	render(): React.JSX.Element {
		if (!this.state.loaded) {
			return super.render();
		}

		const native = this.state.native as unknown as NativeConfig;

		return (
			<ThemeProvider theme={this.state.theme}>
				<Box
					sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
				>
					<Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
						<Tabs
							value={this.state.activeTab}
							onChange={(_e, v) => this.setState({ activeTab: v })}
							variant="standard"
						>
							<Tab label={I18n.t('connectionTab')} />
							<Tab label={I18n.t('loggingGroupsTab')} />
							<Tab label={I18n.t('datapointsTab')} />
							<Tab label={I18n.t('advancedTab')} />
						</Tabs>
					</Box>
					<Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
						{this.state.activeTab === 0 && (
							<ConnectionTab
								native={native}
								onChange={(attr, value) => this.updateNativeValue(attr, value)}
								socket={this.socket}
								instance={this.instance}
							/>
						)}
						{this.state.activeTab === 1 && (
							<GroupsTab
								native={native}
								onChange={(attr, value) => this.updateNativeValue(attr, value)}
							/>
						)}
						{this.state.activeTab === 2 && (
							<DatapointsTab
								native={native}
								onChange={(attr, value) => this.updateNativeValue(attr, value)}
								socket={this.socket}
								theme={this.state.theme}
							/>
						)}
						{this.state.activeTab === 3 && (
							<AdvancedTab
								native={native}
								onChange={(attr, value) => this.updateNativeValue(attr, value)}
							/>
						)}
					</Box>
					{this.renderSaveCloseButtons()}
				</Box>
			</ThemeProvider>
		);
	}
}

export default App;
