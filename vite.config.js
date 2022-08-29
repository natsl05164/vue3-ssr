import { fileURLToPath, URL } from "node:url";
import { createStyleImportPlugin } from "vite-plugin-style-import";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";

const themeFolder = process.env.THEME;
// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: "es2015",
  },

  css: {
    preprocessorOptions: {
      less: {
        // modifyVars:{},
        javascriptEnabled: true,
      },
    },
  },

  plugins: [
    vue(),
    vueJsx(),
    createStyleImportPlugin({
      libs: [
        {
          libraryName: "ant-design-vue",
          esModule: true,
          resolveStyle: (name) => {
            return `ant-design-vue/es/${name}/style/index`;
          },
        },
        {
          libraryName: "vant",
          esModule: true,
          resolveStyle: (name) => `../es/${name}/style`,
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@themes": fileURLToPath(
        new URL(`./src/assets/themes/${themeFolder}`, import.meta.url)
      ),
    },
  },
  ssr: {
    noExternal: [
      // this package has uncompiled .vue files
    ],
  },
});
