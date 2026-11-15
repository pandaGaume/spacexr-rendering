import { describe, expect, it } from "vitest";

import { formatComparison, formatReport, integrityFailures, type IBenchReport, type IBenchResult } from "../src/terrain-bench/report";
import { BENCH_ENGINES, BENCH_VIEWS, benchScenarios } from "../src/terrain-bench/scenarios";

const result = (id: string, overrides: Partial<IBenchResult> = {}): IBenchResult => ({
    id,
    url: "http://localhost/",
    errors: [],
    performance: {
        engine: "gpu",
        framesPerSecond: 60,
        frameMsP95: 9,
        frameMsP99: 12,
        terrainCpuMs: 10,
        renderCpuMs: 1,
        runtimeFrameMs: 2,
        gpuMs: 3,
        instances: 100,
        drawCalls: 1,
        trianglesPerFrame: 1000,
        uploadKiBPerFrame: 50,
        uploadCallsPerFrame: 2,
        gpuMiB: 20,
        cpuMiB: 0,
        demTiles: 30,
    },
    integrity: { frames: 100, framesWithHoles: 0, worstHoles: 0, edgeChecks: 10, sharedVerticesPerCheck: 200, worstSharedEdgeMetres: 0 },
    ...overrides,
});
const report = (label: string, ...results: IBenchResult[]): IBenchReport => ({ label, date: "2026-11-06", seconds: 8, results });

describe("bench scenarios", () => {
    it("runs every view on every engine, under unique ids", () => {
        const scenarios = benchScenarios("http://localhost:5174/");
        const mercator = BENCH_VIEWS.filter((view) => view.projection === "mercator").length;
        expect(scenarios).toHaveLength(mercator * BENCH_ENGINES.length + (BENCH_VIEWS.length - mercator));
        expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(scenarios.length);
    });

    it("covers the places the pipeline must validate", () => {
        expect(BENCH_VIEWS.map((view) => view.name)).toEqual(
            expect.arrayContaining(["face-edge", "turned-edge", "cube-vertex", "pole", "cap-border"]),
        );
        expect(new Set(BENCH_VIEWS.map((view) => view.projection))).toEqual(new Set(["mercator", "cube"]));
    });

    it("runs the cube in the Moon example with its dataset, and Web Mercator in the implicit grid example", () => {
        const scenarios = benchScenarios("http://localhost:5174", "http://127.0.0.1:8793");
        const cube = scenarios.find((scenario) => scenario.id === "pole/gpu")!;
        expect(cube.url).toContain("http://localhost:5176/?dataset=http://127.0.0.1:8793&solid=1&");
        expect(scenarios.some((scenario) => scenario.id === "pole/mesh")).toBe(false);
        expect(scenarios.find((scenario) => scenario.id === "mont-blanc/gpu")!.url).toContain("http://localhost:5174/?engine=gpu&");
        expect(benchScenarios("http://localhost:5174").find((scenario) => scenario.id === "pole/gpu")!.url).not.toContain("dataset");
    });
});

describe("bench report", () => {
    it("does not pass a page that failed or drew nothing", () => {
        const failed = result("e/mesh", { errors: ["pipeline error"] });
        expect(integrityFailures(report("a", failed))).toContain("e/mesh: 1 page errors");

        const clean = result("e/gpu");
        expect(integrityFailures(report("a", clean))).toEqual([]);
        const empty = result("e/gpu", { performance: { ...clean.performance!, trianglesPerFrame: 0 } });
        expect(integrityFailures(report("a", empty))).toContain("e/gpu: nothing drawn");
    });

    it("reports each scenario, and those it could not run", () => {
        const text = formatReport(report("abc", result("a/gpu"), { id: "a/mesh", url: "", errors: [], skipped: "runs gpu" }));
        expect(text).toContain("| a/gpu | 60 | 9 | 12 | 10 |");
        expect(text).toContain("| a/mesh | runs gpu |");
    });

    it("compares with a reference, in percent", () => {
        const after = result("a/gpu");
        after.performance!.terrainCpuMs = 5;
        const text = formatComparison(report("before", result("a/gpu")), report("after", after));
        expect(text).toContain("5 (-50%)");
        expect(text).toContain("60 (=)");
    });

    it("does not compare runs of different engines", () => {
        const before = result("a/mesh");
        before.performance!.engine = "gpu";
        const after = result("a/mesh");
        after.performance!.engine = "mesh";
        expect(formatComparison(report("before", before), report("after", after))).toContain("60 (new)");
    });

    it("finds holes and shared vertices apart", () => {
        expect(integrityFailures(report("a", result("a/gpu")))).toEqual([]);
        const holes = result("b/gpu", {
            integrity: {
                frames: 10,
                framesWithHoles: 2,
                worstHoles: 30,
                edgeChecks: 1,
                sharedVerticesPerCheck: 5,
                worstSharedEdgeMetres: 0,
            },
        });
        expect(integrityFailures(report("a", holes))[0]).toContain("holes on 2 of 10");
        const apart = result("c/gpu", {
            integrity: {
                frames: 10,
                framesWithHoles: 0,
                worstHoles: 0,
                edgeChecks: 1,
                sharedVerticesPerCheck: 5,
                worstSharedEdgeMetres: 2,
            },
        });
        expect(integrityFailures(report("a", apart))[0]).toContain("2 m apart");
    });

    it("finds what lasts once the terrain has settled", () => {
        const lasting = result("e/gpu", {
            integrity: {
                frames: 10,
                framesWithHoles: 0,
                worstHoles: 0,
                edgeChecks: 1,
                sharedVerticesPerCheck: 5,
                worstSharedEdgeMetres: 0,
                worstSharedEdgeAtRestMetres: 3,
                holesAtRest: 4,
            },
        });
        const failures = integrityFailures(report("a", lasting));
        expect(failures).toContain("e/gpu: shared vertices 3 m apart at rest");
        expect(failures).toContain("e/gpu: 4 hole pixels at rest");
    });

    it("does not pass a run that compared nothing", () => {
        const empty = result("d/gpu", {
            integrity: {
                frames: 10,
                framesWithHoles: 0,
                worstHoles: 0,
                edgeChecks: 3,
                sharedVerticesPerCheck: 0,
                worstSharedEdgeMetres: 0,
            },
        });
        expect(integrityFailures(report("a", empty))[0]).toContain("no shared vertex");
    });
});
