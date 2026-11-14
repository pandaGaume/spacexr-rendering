import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const action = process.argv[2];
if (!["install", "build", "check"].includes(action))
    throw new Error("Use install, build or check.");
const repositories = [
    "../../spacexr-tiling/",
    "../../3d-tiles-core/node/",
    "../../terrain-core/",
    "../../quantia/",
    "../../celestial-core/",
    "../../atmosphere-core/",
    "../",
];
for (const relative of repositories) {
    const cwd = fileURLToPath(new URL(relative, import.meta.url));
    if (!existsSync(new URL(relative + "package.json", import.meta.url)))
        throw new Error(`Missing sibling repository: ${cwd}`);
    const command =
        action === "check" &&
        [
            "../../quantia/",
            "../../celestial-core/",
            "../../atmosphere-core/",
        ].includes(relative)
            ? "build"
            : action;
    const args =
        command === "install"
            ? ["ci", "--install-links=false", "--no-audit", "--no-fund"]
            : ["run", command];
    console.log(`\n${action}: ${cwd}`);
    const result = spawnSync(
        process.platform === "win32" ? "npm.cmd" : "npm",
        args,
        { cwd, stdio: "inherit", shell: process.platform === "win32" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}
