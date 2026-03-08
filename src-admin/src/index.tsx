import { createRoot } from 'react-dom/client';
import App from './App';

window.adapterName = 'influxdb-prologger';

const container = document.getElementById('root');
if (container) {
	const root = createRoot(container);
	root.render(<App />);
}
