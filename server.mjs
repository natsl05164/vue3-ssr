// @ts-check
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";
import { proxy, port } from "./config/ssr.config.mjs";
import { createProxyMiddleware } from "http-proxy-middleware";
const isTest = process.env.NODE_ENV === "test" || !!process.env.VITE_TEST_BUILD;
const isStag = process.env.NODE_ENV === "stag";
// @ts-ignore
globalThis.fetch = fetch;
// const port = process.env.PORT;
export async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === "production" || isStag,
  hmrPort
) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const resolve = (p) => path.resolve(__dirname, p);

  const indexProd = isProd
    ? fs.readFileSync(resolve("dist/client/index.html"), "utf-8")
    : "";

  const manifest = isProd
    ? // @ts-ignore
      (
        await import("./dist/client/ssr-manifest.json", {
          assert: { type: "json" },
        })
      ).default
    : {};

  const app = express();

  app.use(cookieParser());

  if (!isProd || (isProd && isStag)) {
    for (const p in proxy) {
      app.use(p, createProxyMiddleware(proxy[p]));
    }
  }

  /**
   * @type {import('vite').ViteDevServer}
   */
  let vite;
  if (!isProd) {
    vite = await (
      await import("vite")
    ).createServer({
      base: "/",
      root,
      logLevel: isTest ? "error" : "info",
      server: {
        middlewareMode: true,
        watch: {
          // During tests we edit the files too fast and sometimes chokidar
          // misses change events, so enforce polling for consistency
          usePolling: true,
          interval: 100,
        },
        hmr: {
          port: hmrPort,
        },
      },
      appType: "custom",
    });
    // use vite's connect instance as middleware
    app.use(vite.middlewares);
  } else {
    app.use((await import("compression")).default());
    // app.use(
    //   '/test/',
    //   (await import('serve-static')).default(resolve('dist/client'), {
    //     index: false
    //   })
    // )

    app.get(
      "*.*",
      express.static(path.join(__dirname, "./dist/client"), {
        maxAge: "1y",
        fallthrough: false,
      })
    );
  }
  // app.get("/api/*", (req, res) => {
  //   res.status(404).send("data requests are not supported");
  // });
  app.get("*", async (req, res) => {
    const context = {
      // for nginx, set config:
      // proxy_set_header X-Forwarded-Proto $scheme
      // proxy_set_header Host $host

      // host: `${req.headers['x-forwarded-proto']}://${req.headers.host}`,

      host: `${req.protocol}://${req.headers.host}`,
      ua: req.headers["user-agent"],
    };

    try {
      const url = req.originalUrl.replace("/test/", "/");

      let template, render;
      if (!isProd) {
        // always read fresh template in dev
        template = fs.readFileSync(resolve("index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        render = (await vite.ssrLoadModule("/src/entry-server.js")).render;
      } else {
        template = indexProd;
        // @ts-ignore
        render = (await import("./dist/server/entry-server.mjs")).render;
      }

      const [
        err,
        appHtml,
        preloadLinks,
        syncState,
        headTags,
        htmlAttrs,
        bodyAttrs,
      ] = await render(url, manifest, context);

      const html = template
        .replace("data-html-attrs", htmlAttrs)
        .replace("<!--head-tags-->", headTags)
        .replace("data-body-attrs", bodyAttrs)
        .replace("<!--preload-links-->", preloadLinks)
        .replace("<!--ssr-outlet-->", appHtml)
        .replace(
          "/*sync-state-outlet*/",
          `window.__syncState__ = ${JSON.stringify(syncState)}`
        ); // 注入同步数据

      let statusCode = 200;
      if (err) {
        console.log(err);
        statusCode = err.message.indexOf("404") === 0 ? 404 : 202; // 渲染错误用202不被缓存
      }
      res.status(statusCode).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      vite && vite.ssrFixStacktrace(e);
      console.log(e.stack);
      res.status(500).end(e.stack);
    }
  });

  // @ts-ignore
  return { app, vite };
}

if (!isTest) {
  createServer().then(({ app }) =>
    app.listen(port, () => {
      console.log(`http://localhost:${port}`);
    })
  );
}
