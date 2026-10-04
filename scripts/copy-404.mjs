import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const indexPath = resolve("dist/index.html");
const fallbackPath = resolve("dist/404.html");

if (existsSync(indexPath)) {
  copyFileSync(indexPath, fallbackPath);
}
