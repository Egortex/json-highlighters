import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";

export default defineConfig({
	plugins: [
		react(),
		// Тесты остаются в tsconfig (их проверяет tsc --noEmit), но в dist их
		// .d.ts не нужны — только раздувают опубликованный пакет.
		dts({
			rollupTypes: true,
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/vitest.d.ts"],
		}),
	],
	build: {
		lib: {
			entry: resolve(import.meta.dirname, "src/index.ts"),
			formats: ["es"],
			fileName: "index",
		},
		rollupOptions: {
			external: ["react", "react-dom", "react/jsx-runtime"],
		},
	},
});
