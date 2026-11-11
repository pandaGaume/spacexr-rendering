const fs = require("node:fs");
const { runBrowserTest } = require("./test-support.cjs");
runBrowserTest("views", async ({ browser, output, baseUrl }) => {
    const out = output;
    const reports = [];
    for (const [name, path] of [
        ["sunset", "atmosphere.html?sunset=1&sse=20"],
        ["day", "atmosphere.html?hour=10&sse=20"],
        ["orbit", "orbital.html?view=horizon&sse=20"],
    ]) {
        const p = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
        const errors = [];
        p.on("pageerror", (e) => errors.push(e.message));
        p.on("console", (m) => {
            if (m.type() === "error") errors.push(m.text());
        });
        await p.goto(baseUrl + "/" + path);
        await p.waitForFunction(() => window.earthDemo?.earth.atmosphereReady, null, { timeout: 90000 });
        await p.waitForTimeout(6000);
        const report = await p.evaluate(async () => {
            const demo = window.earthDemo,
                e = demo.earth,
                c = e.camera,
                s = c.getScene(),
                engine = s.getEngine(),
                runtime = e.runtime;
            const base = { yaw: c.yaw, pitch: c.pitch, radius: c.radius, center: c.center.clone() };
            const rows = [];
            for (const motionName of ["rotation", "translation"]) {
                for (const enabled of [false, true]) {
                    c.yaw = base.yaw;
                    c.pitch = base.pitch;
                    c.radius = base.radius;
                    c.center = base.center.clone();
                    const box = document.querySelector("#atmosphere");
                    box.checked = enabled;
                    box.dispatchEvent(new Event("change"));
                    await new Promise((r) => setTimeout(r, 2000));
                    const startMotion = performance.now();
                    const timer = setInterval(() => {
                        const elapsed = (performance.now() - startMotion) / 1000;
                        if (motionName === "rotation") c.yaw = base.yaw + elapsed * 0.1;
                        else c.center = base.center.add({ x: elapsed * 20, y: 0, z: 0 });
                    }, 8);
                    await new Promise((r) => setTimeout(r, 1200));
                    const start = performance.now(),
                        frames = demo.frames;
                    await new Promise((r) => setTimeout(r, 3500));
                    clearInterval(timer);
                    rows.push({
                        motion: motionName,
                        enabled,
                        fps: (1000 * (demo.frames - frames)) / (performance.now() - start),
                        hud: document.querySelector("#fps").textContent,
                    });
                }
            }
            c.yaw = base.yaw;
            c.pitch = base.pitch;
            c.radius = base.radius;
            c.center = base.center.clone();
            await new Promise((r) => setTimeout(r, 6000));
            return {
                rows,
                rest: document.querySelector("#fps").textContent,
                post: c._postProcesses.filter(Boolean).length,
                apply: s.imageProcessingConfiguration.applyByPostProcess,
                sameRuntime: e.runtime === runtime,
                width: engine.getRenderWidth(),
                height: engine.getRenderHeight(),
                errors: demo.errors,
            };
        });
        await p.screenshot({ path: out + "/" + name + ".png" });
        reports.push({ name, errors, ...report });
        console.log(JSON.stringify(reports.at(-1), null, 2));
        fs.writeFileSync(out + "/result.json", JSON.stringify(reports, null, 2));
        await p.evaluate(() => window.earthDemo.dispose());
        await p.close();
    }
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
