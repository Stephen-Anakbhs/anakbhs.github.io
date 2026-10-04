import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const indexPath = resolve("dist/index.html");
const fallbackPath = resolve("dist/404.html");

if (existsSync(indexPath)) {
  copyFileSync(indexPath, fallbackPath);
  // GitHub Pages must serve existing routes with 200, not the SPA's 404 fallback.
  for (const route of ["publications", "about", "research", "portfolio"]) {
    const directory = resolve("dist", route);
    mkdirSync(directory, { recursive: true });
    copyFileSync(indexPath, resolve(directory, "index.html"));
  }
}
