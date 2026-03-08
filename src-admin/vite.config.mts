import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react()],
	base: './',
	build: {
		outDir: 'build',
	},
	server: {
		port: 3000,
		proxy: {
			'/adapter': {
				target: 'http://localhost:8081',
				changeOrigin: true,
				secure: false,
			},
		},
	},
});
