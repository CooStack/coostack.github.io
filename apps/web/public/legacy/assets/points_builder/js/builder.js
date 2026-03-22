export function createBuilderTools(ctx) {
    const { KIND, U, getState, getKotlinEndMode, rotatePointsToPointUpright } = ctx || {};
    const num = (value, fallback = 0) => {
        const next = Number(value);
        return Number.isFinite(next) ? next : fallback;
    };
    const int = (value, fallback = 0) => {
        const next = Math.trunc(num(value, fallback));
        return Number.isFinite(next) ? next : fallback;
    };

    function buildPointOwnerByIndex(totalCount, segments) {
        const owners = new Array(totalCount || 0);
        if (!segments) return owners;
        for (const [id, seg] of segments.entries()) {
            if (!seg) continue;
            const start = Math.max(0, seg.start | 0);
            const end = Math.min(owners.length, seg.end | 0);
            for (let i = start; i < end; i++) owners[i] = id;
        }
        return owners;
    }

    // Eval（同时计算：每个卡片新增的点在最终点数组里的区间，用于高亮）
    function evalBuilderWithMeta(nodes, initialAxis) {
        const ctxLocal = { points: [], axis: U.clone(initialAxis || U.v(0, 1, 0)), previewPoints: [] };
        const segments = new Map(); // nodeId -> {start, end}

        function evalList(list, targetCtx, baseOffset) {
            const arr = list || [];
            for (const n of arr) {
                if (!n) continue;

                // 特殊：addBuilder/withBuilder 需要递归并把子段位移到父数组区间
                if (n.kind === "add_builder" || n.kind === "with_builder") {
                    const before = targetCtx.points.length;
                    const child = evalBuilderWithMeta(n.children || [], U.v(0, 1, 0));
                    const useOffset = n.kind === "add_builder";
                    let ox = 0, oy = 0, oz = 0;
                    if (useOffset) {
                        const rx = Number(n.params?.ox);
                        const ry = Number(n.params?.oy);
                        const rz = Number(n.params?.oz);
                        ox = Number.isFinite(rx) ? rx : 0;
                        oy = Number.isFinite(ry) ? ry : 0;
                        oz = Number.isFinite(rz) ? rz : 0;
                    }
                    if (useOffset) {
                        for (const p of (child.points || [])) {
                            targetCtx.points.push({ x: p.x + ox, y: p.y + oy, z: p.z + oz });
                        }
                    } else {
                        targetCtx.points.push(...child.points);
                    }
                    if (Array.isArray(child.previewPoints) && child.previewPoints.length) {
                        if (!Array.isArray(targetCtx.previewPoints)) targetCtx.previewPoints = [];
                        if (useOffset) {
                            for (const p of child.previewPoints) {
                                targetCtx.previewPoints.push({
                                    ...p,
                                    x: p.x + ox,
                                    y: p.y + oy,
                                    z: p.z + oz
                                });
                            }
                        } else {
                            targetCtx.previewPoints.push(...child.previewPoints.map((p) => ({ ...p })));
                        }
                    }
                    const after = targetCtx.points.length;

                    if (after > before) segments.set(n.id, { start: before + baseOffset, end: after + baseOffset });
                    for (const [cid, seg] of child.segments.entries()) {
                        segments.set(cid, { start: seg.start + before + baseOffset, end: seg.end + before + baseOffset });
                    }
                    continue;
                }

                if (n.kind === "add_with") {
                    const before = targetCtx.points.length;
                    const child = evalBuilderWithMeta(n.children || [], U.v(0, 1, 0));
                    const childPoints = Array.isArray(child.points) ? child.points : [];
                    const offset = {
                        x: num(n.params?.ox),
                        y: num(n.params?.oy),
                        z: num(n.params?.oz)
                    };

                    if (n.params?.previewBeforeOffsetEnabled && childPoints.length) {
                        if (!Array.isArray(targetCtx.previewPoints)) targetCtx.previewPoints = [];
                        const previewOwners = buildPointOwnerByIndex(childPoints.length, child.segments);
                        for (let i = 0; i < childPoints.length; i++) {
                            const point = childPoints[i];
                            targetCtx.previewPoints.push({
                                x: num(point?.x) + offset.x,
                                y: num(point?.y) + offset.y,
                                z: num(point?.z) + offset.z,
                                nodeId: previewOwners[i] || null,
                                previewParentId: n.id || null,
                                previewSource: "add_with"
                            });
                        }
                    }

                    const r = num(n.params?.r);
                    const c = Math.max(0, int(n.params?.c));
                    const rotateToCenter = !!n.params?.rotateToCenter;
                    const rotateReverse = !!n.params?.rotateReverse;
                    const rotateOffsetEnabled = !!n.params?.rotateOffsetEnabled;
                    const rox = num(n.params?.rox);
                    const roy = num(n.params?.roy);
                    const roz = num(n.params?.roz);
                    const verts = U.getPolygonInCircleVertices(c, r) || [];
                    const childAxis = child.axis || U.v(0, 1, 0);

                    for (const base of verts) {
                        const pts = childPoints.map((point) => U.clone(point));
                        if (rotateToCenter && pts.length && typeof rotatePointsToPointUpright === "function") {
                            const targetPoint = rotateOffsetEnabled ? U.v(rox, roy, roz) : U.v(0, 0, 0);
                            const rotateTarget = rotateReverse ? U.add(targetPoint, base) : U.sub(targetPoint, base);
                            rotatePointsToPointUpright(pts, rotateTarget, childAxis);
                        }
                        for (const point of pts) {
                            targetCtx.points.push({
                                x: num(point?.x) + num(base?.x) + offset.x,
                                y: num(point?.y) + num(base?.y) + offset.y,
                                z: num(point?.z) + num(base?.z) + offset.z
                            });
                        }
                    }

                    const after = targetCtx.points.length;
                    if (after > before) segments.set(n.id, { start: before + baseOffset, end: after + baseOffset });
                    continue;
                }

                const def = KIND && KIND[n.kind];
                if (!def || !def.apply) continue;

                const beforeLen = targetCtx.points.length;
                const beforeRef = targetCtx.points;
                def.apply(targetCtx, n);
                const afterLen = targetCtx.points.length;

                // 只有“追加到同一数组”的情况才认为这张卡片直接新增了粒子
                if (afterLen > beforeLen && targetCtx.points === beforeRef) {
                    segments.set(n.id, { start: beforeLen + baseOffset, end: afterLen + baseOffset });
                }
            }
        }

        evalList(nodes || [], ctxLocal, 0);
        return { points: ctxLocal.points, segments, previewPoints: ctxLocal.previewPoints, axis: ctxLocal.axis };
    }

    // 兼容旧调用：只要点集
    function evalBuilder(nodes, initialAxis) {
        return evalBuilderWithMeta(nodes, initialAxis).points;
    }

    // Kotlin emit（每个 add/调用一行）
    function emitNodesKotlinLines(nodes, indent, emitCtx) {
        const lines = [];
        for (const n of (nodes || [])) {
            const def = KIND && KIND[n.kind];
            if (!def || !def.kotlin) continue;

            if (n.kind === "add_builder" || n.kind === "with_builder" || n.kind === "add_with") {
                lines.push(...def.kotlin(n, emitCtx, indent, emitNodesKotlinLines));
                continue;
            }
            if (n.kind === "add_fourier_series") {
                lines.push(...def.kotlin(n, emitCtx, indent));
                continue;
            }
            const call = def.kotlin(n, emitCtx);
            lines.push(`${indent}${call}`);
        }
        return lines;
    }

    function emitKotlin() {
        const emitCtx = {decls: []};
        const lines = [];
        const state = (typeof getState === "function") ? getState() : (ctx && ctx.state) || { root: { children: [] } };
        const endMode = (typeof getKotlinEndMode === "function") ? getKotlinEndMode() : (ctx && ctx.kotlinEndMode) || "builder";
        lines.push("PointsBuilder()");
        lines.push(...emitNodesKotlinLines(state.root.children, "  ", emitCtx));
        if (endMode === "list") {
            lines.push("  .createWithoutClone()");
        } else if (endMode === "clone") {
            lines.push("  .create()");
        }

        const expr = lines.join("\n");
        if (emitCtx.decls.length > 0) {
            const declLines = emitCtx.decls.map(s => `  ${s}`);
            return ["run {", ...declLines, `  ${expr.replace(/\n/g, "\n  ")}`, "}"].join("\n");
        }
        return expr;
    }

    return {
        evalBuilderWithMeta,
        evalBuilder,
        emitNodesKotlinLines,
        emitKotlin
    };
}
