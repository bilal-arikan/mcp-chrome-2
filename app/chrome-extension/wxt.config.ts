import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { config } from 'dotenv';
import { resolve } from 'path';
import Icons from 'unplugin-icons/vite';
import Components from 'unplugin-vue-components/vite';
import IconsResolver from 'unplugin-icons/resolver';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.local') });

// Pinning the manifest "key" makes the unpacked extension ID stable across
// reloads, rebuilds, and folder moves. Without it Chrome derives the ID from
// the install path, so it changes and breaks the native-messaging host's
// allowed_origins whitelist. This default public key yields the fixed ID
// "ofjcofiidpnlbiocjojaabanlmfbljmm", which the native host's EXTENSION_ID is
// aligned to. Override via CHROME_EXTENSION_KEY env to use a different key
// (e.g. the official store key). The matching private key lives in .keys/
// (gitignored) and is only needed to produce a signed .crx for distribution.
const DEFAULT_EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuBuNR7hBM04hyvOGV6/ns5WlxGPJ/7AWZUTxYVujGd0biaaB6VQzwHPU0gmFK2g2fbS7eYBmEr4cAans69RIBvGYx66niloZvyoIhjaTCfE4wM61LB7nXkXWFZkhG/Oh+C1ak+34pFswgql0JKCog5FZeCiGUZEdiEsK+eYaPnNhrcNfnh9F4gmT6svyfbHMye9DX8s/jBorYCV3sw6FMJ6Hftdn81E7LKg7/eDg+N7wvgRHGJsC7G+gccZd+1i1xQF8rlf6mNU88Wff0+GJ0P35WO3mcNGX1unDw07JKMGpxBlCeJPZsQhQVG09gdrO3nTd/n4ourWZG/kd4Ti3mwIDAQAB';
const CHROME_EXTENSION_KEY = process.env.CHROME_EXTENSION_KEY || DEFAULT_EXTENSION_KEY;
// Detect dev mode early for manifest-level switches
const IS_DEV = process.env.NODE_ENV !== 'production' && process.env.MODE !== 'production';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  runner: {
    // Option 1: Disable auto-launch (recommended)
    disabled: true,

    // Option 2: To enable auto-launch with an existing profile, uncomment the config below
    // chromiumArgs: [
    //   '--user-data-dir=' + homedir() + (process.platform === 'darwin'
    //     ? '/Library/Application Support/Google/Chrome'
    //     : process.platform === 'win32'
    //     ? '/AppData/Local/Google/Chrome/User Data'
    //     : '/.config/google-chrome'),
    //   '--remote-debugging-port=9222',
    // ],
  },
  manifest: {
    // Use environment variable for the key, fallback to undefined if not set
    key: CHROME_EXTENSION_KEY,
    default_locale: 'en',
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    permissions: [
      'nativeMessaging',
      'tabs',
      'activeTab',
      'scripting',
      'contextMenus',
      'downloads',
      'webRequest',
      'webNavigation',
      'debugger',
      'history',
      'bookmarks',
      'offscreen',
      'storage',
      'declarativeNetRequest',
      'alarms',
      'idle',
      // Allow programmatic control of Chrome Side Panel
      'sidePanel',
    ],
    host_permissions: ['<all_urls>'],
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
    action: {
      default_popup: 'popup.html',
      default_title: 'Chrome MCP Server',
    },
    // Chrome Side Panel entry for workflow management
    // Ref: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
    side_panel: {
      default_path: 'sidepanel.html',
    },
    // Keyboard shortcuts for quick triggers
    commands: {
      // run_quick_trigger_1: {
      //   suggested_key: { default: 'Ctrl+Shift+1' },
      //   description: 'Run quick trigger 1',
      // },
      // run_quick_trigger_2: {
      //   suggested_key: { default: 'Ctrl+Shift+2' },
      //   description: 'Run quick trigger 2',
      // },
      // run_quick_trigger_3: {
      //   suggested_key: { default: 'Ctrl+Shift+3' },
      //   description: 'Run quick trigger 3',
      // },
      // open_workflow_sidepanel: {
      //   suggested_key: { default: 'Ctrl+Shift+O' },
      //   description: 'Open workflow sidepanel',
      // },
      toggle_web_editor: {
        suggested_key: { default: 'Ctrl+Shift+O', mac: 'Command+Shift+O' },
        description: 'Toggle Web Editor mode',
      },
      toggle_quick_panel: {
        suggested_key: { default: 'Ctrl+Shift+U', mac: 'Command+Shift+U' },
        description: 'Toggle Quick Panel AI Chat',
      },
    },
    web_accessible_resources: [
      {
        resources: [
          '/models/*', // Allow access to all files under public/models/
          '/workers/*', // Allow access to worker files
          '/inject-scripts/*', // Allow helper files injected by content scripts
        ],
        matches: ['<all_urls>'],
      },
    ],
    // Note: the security policies below would block the dev server's asset loading in development,
    // so they are only enabled in production; development is left to WXT's default policy.
    ...(IS_DEV
      ? {}
      : {
          cross_origin_embedder_policy: { value: 'require-corp' as const },
          cross_origin_opener_policy: { value: 'same-origin' as const },
          content_security_policy: {
            // Allow inline styles injected by Vite (compiled CSS) and data images used in UI thumbnails
            extension_pages:
              "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;",
          },
        }),
  },
  vite: (env) => ({
    plugins: [
      // TailwindCSS v4 Vite plugin – no PostCSS config required
      tailwindcss(),
      // Auto-register SVG icons as Vue components; all icons are bundled locally
      Components({
        dts: false,
        resolvers: [IconsResolver({ prefix: 'i', enabledCollections: ['lucide', 'mdi', 'ri'] })],
      }) as any,
      Icons({ compiler: 'vue3', autoInstall: false }) as any,
      // Ensure static assets are available as early as possible to avoid race conditions in dev
      // Copy workers/_locales/inject-scripts into the build output before other steps
      viteStaticCopy({
        targets: [
          {
            src: 'inject-scripts/*.js',
            dest: 'inject-scripts',
          },
          {
            src: ['workers/*'],
            dest: 'workers',
          },
          {
            src: '_locales/**/*',
            dest: '_locales',
          },
        ],
        // Use writeBundle so outDir exists for dev and prod
        hook: 'writeBundle',
        // Enable watch so changes to these files are reflected during dev
        watch: {
          // Use default patterns inferred from targets; explicit true enables watching
          // Vite plugin will watch src patterns and re-copy on change
        } as any,
      }) as any,
    ],
    build: {
      // Our build output needs to be compatible down to ES6
      target: 'es2015',
      // Generate sourcemaps in non-production environments
      sourcemap: env.mode !== 'production',
      // Disable gzip compressed-size reporting, since compressing large files can be slow
      reportCompressedSize: false,
      // Trigger a warning when a chunk exceeds 1500kb
      chunkSizeWarningLimit: 1500,
      minify: false,
    },
  }),
});
