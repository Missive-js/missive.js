// vite.config.ts
import { vitePlugin as remix } from "file:///Users/nanou/Developer/missive.js/node_modules/.pnpm/@remix-run+dev@2.13.1_@remix-run+react@2.13.1_react-dom@18.3.1_react@18.3.1__react@18.3.1_typ_ssfqnlaixxxpjnlomddfboertq/node_modules/@remix-run/dev/dist/index.js";
import { defineConfig } from "file:///Users/nanou/Developer/missive.js/node_modules/.pnpm/vite@5.4.10_@types+node@22.8.6/node_modules/vite/dist/node/index.js";
import tsconfigPaths from "file:///Users/nanou/Developer/missive.js/node_modules/.pnpm/vite-tsconfig-paths@4.3.2_typescript@5.6.3_vite@5.4.10_@types+node@22.8.6_/node_modules/vite-tsconfig-paths/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [
    remix({
      appDirectory: "src",
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_singleFetch: true,
        v3_lazyRouteDiscovery: true
      }
    }),
    tsconfigPaths()
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvbmFub3UvRGV2ZWxvcGVyL21pc3NpdmUuanMvZGVtby9mYW5jeS1kZW1vLW9uZVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL25hbm91L0RldmVsb3Blci9taXNzaXZlLmpzL2RlbW8vZmFuY3ktZGVtby1vbmUvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL25hbm91L0RldmVsb3Blci9taXNzaXZlLmpzL2RlbW8vZmFuY3ktZGVtby1vbmUvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyB2aXRlUGx1Z2luIGFzIHJlbWl4IH0gZnJvbSAnQHJlbWl4LXJ1bi9kZXYnO1xuaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgdHNjb25maWdQYXRocyBmcm9tICd2aXRlLXRzY29uZmlnLXBhdGhzJztcblxuZGVjbGFyZSBtb2R1bGUgJ0ByZW1peC1ydW4vbm9kZScge1xuICAgIGludGVyZmFjZSBGdXR1cmUge1xuICAgICAgICB2M19zaW5nbGVGZXRjaDogdHJ1ZTtcbiAgICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gICAgcGx1Z2luczogW1xuICAgICAgICByZW1peCh7XG4gICAgICAgICAgICBhcHBEaXJlY3Rvcnk6ICdzcmMnLFxuICAgICAgICAgICAgZnV0dXJlOiB7XG4gICAgICAgICAgICAgICAgdjNfZmV0Y2hlclBlcnNpc3Q6IHRydWUsXG4gICAgICAgICAgICAgICAgdjNfcmVsYXRpdmVTcGxhdFBhdGg6IHRydWUsXG4gICAgICAgICAgICAgICAgdjNfdGhyb3dBYm9ydFJlYXNvbjogdHJ1ZSxcbiAgICAgICAgICAgICAgICB2M19zaW5nbGVGZXRjaDogdHJ1ZSxcbiAgICAgICAgICAgICAgICB2M19sYXp5Um91dGVEaXNjb3Zlcnk6IHRydWUsXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgICAgdHNjb25maWdQYXRocygpLFxuICAgIF0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBaVYsU0FBUyxjQUFjLGFBQWE7QUFDclgsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxtQkFBbUI7QUFRMUIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDeEIsU0FBUztBQUFBLElBQ0wsTUFBTTtBQUFBLE1BQ0YsY0FBYztBQUFBLE1BQ2QsUUFBUTtBQUFBLFFBQ0osbUJBQW1CO0FBQUEsUUFDbkIsc0JBQXNCO0FBQUEsUUFDdEIscUJBQXFCO0FBQUEsUUFDckIsZ0JBQWdCO0FBQUEsUUFDaEIsdUJBQXVCO0FBQUEsTUFDM0I7QUFBQSxJQUNKLENBQUM7QUFBQSxJQUNELGNBQWM7QUFBQSxFQUNsQjtBQUNKLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
