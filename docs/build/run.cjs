// Launches render.cjs with the Electron binary installed by the desktop
// package (no second Electron download).
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const electron = require(require.resolve("electron", { paths: [path.join(__dirname, "..", "..", "desktop")] }));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const res = spawnSync(electron, [path.join(__dirname, "render.cjs")], { stdio: "inherit", env });
process.exit(res.status ?? 1);
