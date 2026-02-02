import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";

(function () {
    const U = globalThis.Utils;
    if (!U) throw new Error("Utils 未加载：请确认 utils.js 在 main.js 之前加载，且 utils.js 内部设置了 globalThis.Utils");

    // -------------------------
    // DOM
    // -------------------------
    const elCardsRoot = document.getElementById("cardsRoot");
    const elKotlinOut = document.getElementById("kotlinOut");

    const btnAddCard = document.getElementById("btnAddCard");
    const btnQuickOffset = document.getElementById("btnQuickOffset");
    const btnPickLine = document.getElementById("btnPickLine");
    const btnFullscreen = document.getElementById("btnFullscreen");

    const btnExportKotlin = document.getElementById("btnExportKotlin");
    const btnCopyKotlin = document.getElementById("btnCopyKotlin");
    const btnCopyKotlin2 = document.getElementById("btnCopyKotlin2");
    const btnExportKotlin2 = document.getElementById("btnExportKotlin2");

    const btnSaveJson = document.getElementById("btnSaveJson");
    const btnLoadJson = document.getElementById("btnLoadJson");
    const fileJson = document.getElementById("fileJson");
    const btnReset = document.getElementById("btnReset");

    const modal = document.getElementById("modal");
    const modalMask = document.getElementById("modalMask");
    const btnCloseModal = document.getElementById("btnCloseModal");
    const btnCancelModal = document.getElementById("btnCancelModal");
    const cardPicker = document.getElementById("cardPicker");
    const cardSearch = document.getElementById("cardSearch");

    const threeHost = document.getElementById("threeHost");
    const chkAxes = document.getElementById("chkAxes");
    const chkGrid = document.getElementById("chkGrid");
    const chkAutoFit = document.getElementById("chkAutoFit");
    const chkSnapGrid = document.getElementById("chkSnapGrid");
    const chkSnapParticle = document.getElementById("chkSnapParticle");
    const inpSnapStep = document.getElementById("inpSnapStep");
    const statusLinePick = document.getElementById("statusLinePick");
    const statusPoints = document.getElementById("statusPoints");

    // -------------------------
    // helpers
    // -------------------------
    const uid = () => (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);

    function num(v) {
        const x = Number(v);
        return Number.isFinite(x) ? x : 0;
    }

    function int(v) {
        return Math.max(0, Math.trunc(num(v)));
    }

    function relExpr(x, y, z) {
        return `RelativeLocation(${U.fmt(num(x))}, ${U.fmt(num(y))}, ${U.fmt(num(z))})`;
    }

    // -------------------------
    // KIND
    // -------------------------
    const KIND = {
        axis: {
            title: "axis(对称轴)",
            desc: "PointsBuilder.axis(RelativeLocation)",
            defaultParams: {x: 0, y: 1, z: 0},
            apply(ctx, node) {
                ctx.axis = U.v(num(node.params.x), num(node.params.y), num(node.params.z));
            },
            kotlin(node) {
                return `.axis(${relExpr(node.params.x, node.params.y, node.params.z)})`;
            }
        },

        rotate_as_axis: {
            title: "rotateAsAxis(绕轴旋转)",
            desc: "度输入；导出为 系数*PI",
            defaultParams: {deg: 90, useCustomAxis: false, ax: 0, ay: 1, az: 0},
            apply(ctx, node) {
                const rad = U.degToRad(num(node.params.deg));
                const axis = node.params.useCustomAxis
                    ? U.v(num(node.params.ax), num(node.params.ay), num(node.params.az))
                    : ctx.axis;
                ctx.points = ctx.points.map(p => U.rotateAroundAxis(p, axis, rad));
            },
            kotlin(node) {
                const radExpr = U.degToKotlinRadExpr(num(node.params.deg));
                if (node.params.useCustomAxis) {
                    return `.rotateAsAxis(${radExpr}, ${relExpr(node.params.ax, node.params.ay, node.params.az)})`;
                }
                return `.rotateAsAxis(${radExpr})`;
            }
        },

        rotate_to: {
            title: "rotateTo(指向目标)",
            desc: "让 axis 指向目标方向（已修复预览）",
            defaultParams: {mode: "toVec", tox: 0, toy: 1, toz: 1, ox: 0, oy: 0, oz: 0, ex: 0, ey: 0, ez: 1},
            apply(ctx, node) {
                if (!ctx.points || ctx.points.length === 0) return;

                // 检查参数
                const toX = num(node.params.tox);
                const toY = num(node.params.toy);
                const toZ = num(node.params.toz);

                let to;
                if (node.params.mode === "originEnd") {
                    // origin+end 模式计算目标向量
                    const origin = U.v(num(node.params.ox), num(node.params.oy), num(node.params.oz));
                    const end = U.v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
                    to = U.sub(end, origin); // 计算目标向量
                } else {
                    // 使用传入的 toX, toY, toZ 作为目标向量
                    to = U.v(toX, toY, toZ);  // 将目标向量传入
                }

                console.log(to, toX, toY, toZ);
                const axis = U.norm(ctx.axis);  // 当前轴向
                const toN = U.norm(to);         // 目标向量的单位向量

                // 目标向量和轴向为零向量：跳过
                if (U.len(axis) <= 1e-12 || U.len(toN) <= 1e-12) return;

                // 计算旋转的四元数（根据目标向量来旋转）
                const q = new THREE.Quaternion();
                q.setFromUnitVectors(
                    new THREE.Vector3(axis.x, axis.y, axis.z),
                    new THREE.Vector3(toN.x, toN.y, toN.z)
                );

                // 使用四元数旋转所有点
                const v = new THREE.Vector3();
                for (let i = 0; i < ctx.points.length; i++) {
                    const p = ctx.points[i];
                    v.set(p.x, p.y, p.z).applyQuaternion(q);  // 使用四元数旋转
                    p.x = v.x;
                    p.y = v.y;
                    p.z = v.z;
                }
            },
            kotlin(node) {
                if (node.params.mode === "originEnd") {
                    return `.rotateTo(${relExpr(node.params.ox, node.params.oy, node.params.oz)}, ${relExpr(node.params.ex, node.params.ey, node.params.ez)})`;
                }
                return `.rotateTo(${relExpr(node.params.tox, node.params.toy, node.params.toz)})`;
            }
        },

        scale: {
            title: "scale(缩放)",
            desc: "PointsBuilder.scale(factor)",
            defaultParams: {factor: 1},
            apply(ctx, node) {
                const f = num(node.params.factor);
                if (f <= 0) return;
                ctx.points = ctx.points.map(p => U.mul(p, f));
            },
            kotlin(node) {
                return `.scale(${U.fmt(num(node.params.factor))})`;
            }
        },

        add_point: {
            title: "addPoint(单点)",
            desc: "PointsBuilder.addPoint(RelativeLocation)",
            defaultParams: {x: 0, y: 0, z: 0},
            apply(ctx, node) {
                ctx.points.push(U.v(num(node.params.x), num(node.params.y), num(node.params.z)));
            },
            kotlin(node) {
                return `.addPoint(${relExpr(node.params.x, node.params.y, node.params.z)})`;
            }
        },

        add_line: {
            title: "addLine(线段)",
            desc: "start -> end",
            defaultParams: {sx: 0, sy: 0, sz: 0, ex: 3, ey: 0, ez: 3, count: 30},
            apply(ctx, node) {
                const s = U.v(num(node.params.sx), num(node.params.sy), num(node.params.sz));
                const e = U.v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
                ctx.points.push(...U.getLineLocations(s, e, Math.max(1, int(node.params.count))));
            },
            kotlin(node) {
                return `.addLine(${relExpr(node.params.sx, node.params.sy, node.params.sz)}, ${relExpr(node.params.ex, node.params.ey, node.params.ez)}, ${int(node.params.count)})`;
            }
        },

        add_circle: {
            title: "addCircle(XZ圆)",
            desc: "addCircle(r, count)",
            defaultParams: {r: 2, count: 120},
            apply(ctx, node) {
                ctx.points.push(...U.getCircleXZ(num(node.params.r), int(node.params.count)));
            },
            kotlin(node) {
                return `.addCircle(${U.fmt(num(node.params.r))}, ${int(node.params.count)})`;
            }
        },

        add_discrete_circle_xz: {
            title: "addDiscreteCircleXZ(离散圆环)",
            desc: "addDiscreteCircleXZ(r, count, discrete)",
            defaultParams: {r: 2, count: 120, discrete: 0.4, seedEnabled: false, seed: 1},
            apply(ctx, node) {
                const seed = node.params.seedEnabled ? int(node.params.seed) : null;
                ctx.points.push(...U.getDiscreteCircleXZ(num(node.params.r), int(node.params.count), num(node.params.discrete), seed));
            },
            kotlin(node) {
                return `.addDiscreteCircleXZ(${U.fmt(num(node.params.r))}, ${int(node.params.count)}, ${U.fmt(num(node.params.discrete))})`;
            }
        },

        add_half_circle: {
            title: "addHalfCircle(半圆XZ)",
            desc: "可选 rotate(rad)；输入度导出*PI",
            defaultParams: {r: 2, count: 80, useRotate: false, rotateDeg: 0},
            apply(ctx, node) {
                const rot = node.params.useRotate ? U.degToRad(num(node.params.rotateDeg)) : 0;
                ctx.points.push(...U.getHalfCircleXZ(num(node.params.r), int(node.params.count), rot));
            },
            kotlin(node) {
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.count);
                if (!node.params.useRotate) return `.addHalfCircle(${r}, ${c})`;
                const radExpr = U.degToKotlinRadExpr(num(node.params.rotateDeg));
                return `.addHalfCircle(${r}, ${c}, ${radExpr})`;
            }
        },

        add_ball: {
            title: "addBall(球面点集)",
            desc: "addBall(r, countPow)",
            defaultParams: {r: 2, countPow: 24},
            apply(ctx, node) {
                ctx.points.push(...U.getBallLocations(num(node.params.r), int(node.params.countPow)));
            },
            kotlin(node) {
                return `.addBall(${U.fmt(num(node.params.r))}, ${int(node.params.countPow)})`;
            }
        },

        add_polygon_in_circle: {
            title: "addPolygonInCircle(内接正多边形边点)",
            desc: "addPolygonInCircle(n, edgeCount, r)",
            defaultParams: {n: 5, edgeCount: 30, r: 2},
            apply(ctx, node) {
                ctx.points.push(...U.getPolygonInCircleLocations(int(node.params.n) || 3, int(node.params.edgeCount) || 1, num(node.params.r)));
            },
            kotlin(node) {
                return `.addPolygonInCircle(${int(node.params.n)}, ${int(node.params.edgeCount)}, ${U.fmt(num(node.params.r))})`;
            }
        },

        add_round_shape: {
            title: "addRoundShape(圆面XZ)",
            desc: "addRoundShape(r, step, preCircleCount) 或 (min,max)",
            defaultParams: {
                r: 3,
                step: 0.25,
                mode: "fixed",
                preCircleCount: 60,
                minCircleCount: 20,
                maxCircleCount: 120
            },
            apply(ctx, node) {
                if (node.params.mode === "range") {
                    ctx.points.push(...U.getRoundScapeLocationsRange(num(node.params.r), num(node.params.step), int(node.params.minCircleCount), int(node.params.maxCircleCount)));
                } else {
                    ctx.points.push(...U.getRoundScapeLocations(num(node.params.r), num(node.params.step), int(node.params.preCircleCount)));
                }
            },
            kotlin(node) {
                const r = U.fmt(num(node.params.r));
                const step = U.fmt(num(node.params.step));
                if (node.params.mode === "range") {
                    return `.addRoundShape(${r}, ${step}, ${int(node.params.minCircleCount)}, ${int(node.params.maxCircleCount)})`;
                }
                return `.addRoundShape(${r}, ${step}, ${int(node.params.preCircleCount)})`;
            }
        },

        add_bezier_curve: {
            title: "addBezierCurve(三次贝塞尔)",
            desc: "addBezierCurve(target, startHandle, endHandle, count)",
            defaultParams: {tx: 5, ty: 0, shx: 2, shy: 2, ehx: -2, ehy: 2, count: 80},
            apply(ctx, node) {
                const target = U.v(num(node.params.tx), num(node.params.ty), 0);
                const sh = U.v(num(node.params.shx), num(node.params.shy), 0);
                const eh = U.v(num(node.params.ehx), num(node.params.ehy), 0);
                ctx.points.push(...U.generateBezierCurve(target, sh, eh, int(node.params.count)));
            },
            kotlin(node) {
                const target = relExpr(node.params.tx, node.params.ty, 0);
                const sh = relExpr(node.params.shx, node.params.shy, 0);
                const eh = relExpr(node.params.ehx, node.params.ehy, 0);
                return `.addBezierCurve(${target}, ${sh}, ${eh}, ${int(node.params.count)})`;
            }
        },

        add_lightning_points: {
            title: "addLightningPoints(闪电折线点)",
            desc: "对应 PointsBuilder.addLightningPoints(...)",
            defaultParams: {
                useStart: false,
                sx: 0, sy: 0, sz: 0,
                ex: 6, ey: 2, ez: 0,
                count: 6,
                preLineCount: 10,
                useOffsetRange: true,
                offsetRange: 1.2
            },
            apply(ctx, node) {
                const end = U.v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
                const counts = int(node.params.count);
                const plc = int(node.params.preLineCount);
                const offset = node.params.useOffsetRange ? num(node.params.offsetRange) : null;

                if (!node.params.useStart) {
                    ctx.points.push(...U.getLightningEffectPoints(end, counts, plc, offset));
                } else {
                    // 对齐 Kotlin：getLightningEffectPoints(end...).onEach{ it.add(start) }
                    // 注意：这里 end 是“偏移向量”，不是绝对终点
                    const start = U.v(num(node.params.sx), num(node.params.sy), num(node.params.sz));
                    const pts = U.getLightningEffectPoints(end, counts, plc, offset);
                    ctx.points.push(...pts.map(p => U.add(p, start)));
                }
            },
            kotlin(node) {
                const counts = int(node.params.count);
                const plc = int(node.params.preLineCount);
                const end = relExpr(node.params.ex, node.params.ey, node.params.ez);

                if (!node.params.useStart) {
                    if (node.params.useOffsetRange) {
                        return `.addLightningPoints(${end}, ${counts}, ${plc}, ${U.fmt(num(node.params.offsetRange))})`;
                    }
                    return `.addLightningPoints(${end}, ${counts}, ${plc})`;
                } else {
                    const start = relExpr(node.params.sx, node.params.sy, node.params.sz);
                    if (node.params.useOffsetRange) {
                        return `.addLightningPoints(${start}, ${end}, ${counts}, ${plc}, ${U.fmt(num(node.params.offsetRange))})`;
                    }
                    return `.addLightningPoints(${start}, ${end}, ${counts}, ${plc})`;
                }
            }
        },
        add_lightning_nodes_attenuation: {
            title: "addLightningNodesAttenuation(衰减闪电节点)",
            desc: "只添加节点（不进行每段采样连线）",
            defaultParams: {
                useStart: false,
                sx: 0, sy: 0, sz: 0,
                ex: 6, ey: 2, ez: 0,
                counts: 6,
                maxOffset: 1.2,
                attenuation: 0.8,
                seedEnabled: false,
                seed: 1
            },
            apply(ctx, node) {
                const p = node.params;
                const start = p.useStart ? U.v(num(p.sx), num(p.sy), num(p.sz)) : U.v(0, 0, 0);
                const end = U.v(num(p.ex), num(p.ey), num(p.ez));
                const seed = p.seedEnabled ? int(p.seed) : null;

                ctx.points.push(
                    ...U.getLightningNodesEffectAttenuation(
                        start,
                        end,
                        int(p.counts),
                        num(p.maxOffset),
                        num(p.attenuation),
                        seed
                    )
                );
            },
            kotlin(node) {
                const p = node.params;
                const end = relExpr(p.ex, p.ey, p.ez);
                const counts = int(p.counts);
                const maxOffset = U.fmt(num(p.maxOffset));
                const attenuation = U.fmt(num(p.attenuation));

                if (!p.useStart) {
                    return `.addLightningNodesAttenuation(${end}, ${counts}, ${maxOffset}, ${attenuation})`;
                }
                const start = relExpr(p.sx, p.sy, p.sz);
                return `.addLightningNodesAttenuation(${start}, ${end}, ${counts}, ${maxOffset}, ${attenuation})`;
            }
        },
        apply_noise_offset: {
            title: "applyNoiseOffset(随机扰动)",
            desc: "applyNoiseOffset(noiseX, noiseY, noiseZ, mode, seed, offsetLenMin, offsetLenMax)",
            defaultParams: {
                noiseX: 0.2, noiseY: 0.2, noiseZ: 0.2,
                mode: "AXIS_UNIFORM",
                seedEnabled: false, seed: 1,
                lenMinEnabled: false, offsetLenMin: 0.0,
                lenMaxEnabled: false, offsetLenMax: 0.0
            },
            apply(ctx, node) {
                const opts = {
                    mode: node.params.mode,
                    seed: node.params.seedEnabled ? int(node.params.seed) : null,
                    offsetLenMin: node.params.lenMinEnabled ? num(node.params.offsetLenMin) : null,
                    offsetLenMax: node.params.lenMaxEnabled ? num(node.params.offsetLenMax) : null,
                };
                U.applyNoiseOffset(ctx.points, num(node.params.noiseX), num(node.params.noiseY), num(node.params.noiseZ), opts);
            },
            kotlin(node) {
                const nx = U.fmt(num(node.params.noiseX));
                const ny = U.fmt(num(node.params.noiseY));
                const nz = U.fmt(num(node.params.noiseZ));

                const named = [];
                if (node.params.mode && node.params.mode !== "AXIS_UNIFORM") named.push(`mode = NoiseMode.${node.params.mode}`);
                if (node.params.seedEnabled) named.push(`seed = ${int(node.params.seed)}L`);
                if (node.params.lenMinEnabled) named.push(`offsetLenMin = ${U.fmt(num(node.params.offsetLenMin))}`);
                if (node.params.lenMaxEnabled) named.push(`offsetLenMax = ${U.fmt(num(node.params.offsetLenMax))}`);

                if (named.length > 0) return `.applyNoiseOffset(${nx}, ${ny}, ${nz}, ${named.join(", ")})`;
                return `.applyNoiseOffset(${nx}, ${ny}, ${nz})`;
            }
        },

        points_on_each_offset: {
            title: "pointsOnEach { it.add(...) } (快捷偏移)",
            desc: "三种导出形式",
            defaultParams: {offX: 0.2, offY: 0, offZ: 0, kotlinMode: "direct3"},
            apply(ctx, node) {
                const dx = num(node.params.offX), dy = num(node.params.offY), dz = num(node.params.offZ);
                ctx.points = ctx.points.map(p => ({x: p.x + dx, y: p.y + dy, z: p.z + dz}));
            },
            kotlin(node, emitCtx) {
                const dx = U.fmt(num(node.params.offX));
                const dy = U.fmt(num(node.params.offY));
                const dz = U.fmt(num(node.params.offZ));
                const mode = node.params.kotlinMode;

                if (mode === "newRel") return `.pointsOnEach { it.add(RelativeLocation(${dx}, ${dy}, ${dz})) }`;
                if (mode === "valRel") {
                    const varName = `rel_${node.id.slice(0, 6)}`;
                    emitCtx.decls.push(`val ${varName} = RelativeLocation(${dx}, ${dy}, ${dz})`);
                    return `.pointsOnEach { it.add(${varName}) }`;
                }
                return `.pointsOnEach { it.add(${dx}, ${dy}, ${dz}) }`;
            }
        },

        with_builder: {
            title: "withBuilder(子PointsBuilder)",
            desc: "PointsBuilder.withBuilder { it.xxx() }",
            defaultParams: {folded: false},
            apply(ctx, node) {
                const childCtx = {points: [], axis: U.v(0, 1, 0)};
                for (const ch of (node.children || [])) {
                    const def = KIND[ch.kind];
                    if (def && def.apply) def.apply(childCtx, ch);
                }
                ctx.points.push(...childCtx.points);
            },
            kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
                const lines = [];
                lines.push(`${indent}.withBuilder(`);
                lines.push(`${indent}  PointsBuilder()`);

                const childLines = emitNodesKotlinLines(node.children || [], indent + "    ", emitCtx);
                lines.push(...childLines);

                lines.push(`${indent}  )`);
                return lines;
            }
        },

        add_fourier_series: {
            title: "addFourierSeries(傅里叶级数)",
            desc: "PointsBuilder.addFourierSeries(FourierSeriesBuilder().addFourier(...))",
            defaultParams: {count: 360, scale: 1.0, folded: false},
            apply(ctx, node) {
                const terms = (node.terms || []).map(t => ({r: num(t.r), w: num(t.w), startAngle: num(t.startAngle)}));
                const pts = U.buildFourierSeries(terms, int(node.params.count), num(node.params.scale));
                ctx.points.push(...pts);
            },
            kotlin(node, emitCtx, indent) {
                const lines = [];
                lines.push(`${indent}.addFourierSeries(`);
                lines.push(`${indent}  FourierSeriesBuilder()`);
                lines.push(`${indent}    .count(${int(node.params.count)})`);
                lines.push(`${indent}    .scale(${U.fmt(num(node.params.scale))})`);
                for (const t of (node.terms || [])) {
                    // Kotlin: addFourier(r, w, startAngle)
                    lines.push(`${indent}    .addFourier(${U.fmt(num(t.r))}, ${U.fmt(num(t.w))}, ${U.fmt(num(t.startAngle))})`);
                }
                lines.push(`${indent}  )`);
                return lines;
            }
        },

        clear: {
            title: "clear()",
            desc: "清空 points",
            defaultParams: {},
            apply(ctx) {
                ctx.points = [];
            },
            kotlin() {
                return `.clear()`;
            }
        },
    };

    // -------------------------
    // Node
    // -------------------------
    function makeNode(kind, init = {}) {
        const def = KIND[kind];
        const n = {
            id: uid(),
            kind,
            folded: false,
            params: JSON.parse(JSON.stringify(def?.defaultParams || {})),
            children: [],
            terms: [],
            ...init
        };
        if (init.params) Object.assign(n.params, init.params);
        if (init.folded !== undefined) n.folded = !!init.folded;

        // ✅ withBuilder 子 PointsBuilder：默认也有一个 axis 卡片（与外部一致）
        if (kind === "with_builder" && (!n.children || n.children.length === 0)) {
            n.children = [makeNode("axis", {params: {x: 0, y: 1, z: 0}})];
        }
        // FourierSeries：terms 初始化空即可
        return n;
    }

    // -------------------------
    // state
    // -------------------------
    let state = {
        root: {
            id: "root",
            kind: "ROOT",
            children: [makeNode("axis", {params: {x: 0, y: 1, z: 0}})]
        }
    };

    // -------------------------
    // Eval
    // -------------------------
    function evalBuilder(nodes, initialAxis) {
        const ctx = {points: [], axis: U.clone(initialAxis || U.v(0, 1, 0))};
        for (const n of (nodes || [])) {
            const def = KIND[n.kind];
            if (!def || !def.apply) continue;
            def.apply(ctx, n);
        }
        return ctx.points;
    }

    // -------------------------
    // Kotlin emit（每个 add/调用一行）
    // -------------------------
    function emitNodesKotlinLines(nodes, indent, emitCtx) {
        const lines = [];
        for (const n of (nodes || [])) {
            const def = KIND[n.kind];
            if (!def || !def.kotlin) continue;

            if (n.kind === "with_builder") {
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
        lines.push("PointsBuilder()");
        lines.push(...emitNodesKotlinLines(state.root.children, "  ", emitCtx));
        lines.push("  .createWithoutClone()");

        const expr = lines.join("\n");
        if (emitCtx.decls.length > 0) {
            const declLines = emitCtx.decls.map(s => `  ${s}`);
            return ["run {", ...declLines, `  ${expr.replace(/\n/g, "\n  ")}`, "}"].join("\n");
        }
        return expr;
    }

    // -------------------------
    // Three.js
    // -------------------------
    let renderer, scene, camera, controls;
    let pointsObj = null;
    let axesHelper, gridHelper;
    let raycaster, mouse;
    let pickPlane;
    let hoverMarker = null;   // ✅ 实时跟随的红点
    let lastPoints = [];      // ✅ 当前预览点，用于“吸附到最近点”（如果你也想保留这个功能）
    let pickMarkers = [];
    const GRID_STEP = 1;      // ✅ 网格吸附步长（你 GridHelper 40/40 时就是 1）
    // line pick state (可指向主/任意子 builder)
    let linePickMode = false;
    let picked = [];
    let linePickTargetList = null;
    let linePickTargetLabel = "主Builder";
    let needAutoFit = true

    let _rClickT = 0;
    let _rClickX = 0;
    let _rClickY = 0;
    const RDBL_MS = 320;  // 双击间隔
    const RDBL_PX = 7;    // 双击最大位移
    let _rDown = false;
    let _rMoved = false;
    let _rDownX = 0;
    let _rDownY = 0;

    function isRightLike(ev) {
        // 1) 标准右键：button===2
        // 2) 右键按下位掩码：buttons&2
        // 3) macOS Ctrl+Click：button===0 且 ctrlKey=true
        return ev.button === 2 || (ev.buttons & 2) === 2 || (ev.button === 0 && ev.ctrlKey);
    }

    function ensureHoverMarker() {
        if (hoverMarker) return;
        const geom = new THREE.SphereGeometry(0.12, 16, 12);
        const mat = new THREE.MeshBasicMaterial({color: 0xff3333});
        hoverMarker = new THREE.Mesh(geom, mat);
        hoverMarker.visible = false;
        scene.add(hoverMarker);
    }

    function setHoverMarkerColor(hex) {
        ensureHoverMarker();
        hoverMarker.material.color.setHex(hex);
    }

    function colorForPickIndex(idx) {
        // idx=0：第一个点；idx=1：第二个点
        return idx === 0 ? 0xff3333 : 0x33a1ff;
    }

    function addPickMarker(p, hex) {
        const geom = new THREE.SphereGeometry(0.12, 16, 12);
        const mat = new THREE.MeshBasicMaterial({color: hex});
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(p.x, p.y, p.z);
        scene.add(mesh);
        pickMarkers.push(mesh);
    }

    function clearPickMarkers() {
        if (!pickMarkers || pickMarkers.length === 0) return;
        if (!scene) {
            pickMarkers = [];
            return;
        }

        for (const m of pickMarkers) {
            try {
                scene.remove(m);
            } catch {
            }
            try {
                m.geometry && m.geometry.dispose && m.geometry.dispose();
            } catch {
            }
            try {
                m.material && m.material.dispose && m.material.dispose();
            } catch {
            }
        }
        pickMarkers = [];
    }

    function showHoverMarker(p) {
        ensureHoverMarker();
        hoverMarker.position.set(p.x, p.y, p.z);
        hoverMarker.visible = true;
    }

    function hideHoverMarker() {
        if (!hoverMarker) return;
        hoverMarker.visible = false;
    }

    function getSnapStep() {
        const v = parseFloat(inpSnapStep?.value);
        if (!Number.isFinite(v) || v <= 0) return 1;
        return v;
    }

    function snapToGrid(p, step) {
        const s = step || 1;
        return {
            x: Math.round(p.x / s) * s,
            y: p.y,
            z: Math.round(p.z / s) * s
        };
    }

// 可选：吸附到最近已有点（XZ 平面距离）
    function snapToNearestPointXZ(p, dist = 0.35) {
        if (!lastPoints || lastPoints.length === 0) return p;
        let best = null;
        let bestD2 = Infinity;
        for (const q of lastPoints) {
            const dx = q.x - p.x;
            const dz = q.z - p.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) {
                bestD2 = d2;
                best = q;
            }
        }
        if (best && bestD2 <= dist * dist) return {x: best.x, y: p.y, z: best.z};
        return p;
    }

// ✅ 拾取映射入口：先得到平面点 -> 若开启网格吸附则吸附网格，否则吸附最近点（你可改优先级）
    function mapPickPoint(hitVec3) {
        let p = { x: hitVec3.x, y: 0, z: hitVec3.z };

        // 1) 网格吸附（优先级最高）
        if (chkSnapGrid && chkSnapGrid.checked) {
            p = snapToGrid(p, getSnapStep());
            return p;
        }

        // 2) 粒子吸附（只有开关打开才吸附）
        if (chkSnapParticle && chkSnapParticle.checked) {
            p = snapToNearestPointXZ(p, 0.35);
        }

        // 3) 都没开 => 原始点击点
        return p;
    }

    function initThree() {
        renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(threeHost.clientWidth, threeHost.clientHeight);
        threeHost.appendChild(renderer.domElement);

        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(55, threeHost.clientWidth / threeHost.clientHeight, 0.01, 5000);
        camera.position.set(10, 10, 10);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        axesHelper = new THREE.AxesHelper(5);
        scene.add(axesHelper);

        gridHelper = new THREE.GridHelper(256, 256, 0x223344, 0x223344);
        gridHelper.position.y = -0.01;
        scene.add(gridHelper);

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(10, 20, 10);
        scene.add(dir);

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();
        pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        window.addEventListener("resize", onResize);
        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("pointerup", onPointerUp);

        chkAxes.addEventListener("change", () => axesHelper.visible = chkAxes.checked);
        chkGrid.addEventListener("change", () => gridHelper.visible = chkGrid.checked);
        chkAutoFit.addEventListener("change", () => {
            if (chkAutoFit.checked) {
                needAutoFit = true;      // 打开时允许做一次自动对焦
                rebuildPreviewAndKotlin(); // 触发一次（只会对焦一次）
            }
        });
        if (inpSnapStep) inpSnapStep.disabled = !(chkSnapGrid && chkSnapGrid.checked);
        chkSnapGrid?.addEventListener("change", () => {
            if (inpSnapStep) inpSnapStep.disabled = !chkSnapGrid.checked;
        });
        renderer.domElement.addEventListener("contextmenu", (e) => {
            // 通常 three 应用都会禁用默认右键菜单（不影响右键拖动平移）
            e.preventDefault();
        });
        inpSnapStep?.addEventListener("input", () => {
            // 拾取模式下，步长改变时让红点立刻更新一次
            if (linePickMode) {
                // 触发一次 move 逻辑最简单：直接隐藏，下一次 move 会刷新
                // 或者你也可以在这里主动调用 showHoverMarker(当前映射点)
            }
        });
        animate();
    }

    function onResize() {
        if (!renderer || !camera) return;
        renderer.setSize(threeHost.clientWidth, threeHost.clientHeight);
        camera.aspect = threeHost.clientWidth / threeHost.clientHeight;
        camera.updateProjectionMatrix();
    }

    function setPoints(points) {
        statusPoints.textContent = `点数：${points.length}`;

        if (pointsObj) {
            scene.remove(pointsObj);
            pointsObj.geometry.dispose();
            pointsObj.material.dispose();
            pointsObj = null;
        }
        lastPoints = points ? points.map(p => ({x: p.x, y: p.y, z: p.z})) : [];
        if (!points || points.length === 0) {
            needAutoFit = true; // 清空后，下一次重新出现点时允许对焦一次
            return;
        }

        const geom = new THREE.BufferGeometry();
        const arr = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            arr[i * 3 + 0] = points[i].x;
            arr[i * 3 + 1] = points[i].y;
            arr[i * 3 + 2] = points[i].z;
        }
        geom.setAttribute("position", new THREE.BufferAttribute(arr, 3));
        geom.computeBoundingSphere();

        const mat = new THREE.PointsMaterial({size: 0.07, sizeAttenuation: true});
        pointsObj = new THREE.Points(geom, mat);
        scene.add(pointsObj);

        if (chkAutoFit.checked && needAutoFit) {
            const b = U.computeBounds(points);
            const r = b.radius;
            const c = b.center;
            controls.target.set(c.x, c.y, c.z);

            const dist = r * 2.4 + 2;
            camera.position.set(c.x + dist, c.y + dist * 0.8, c.z + dist);
            camera.near = Math.max(0.01, r / 100);
            camera.far = Math.max(5000, r * 20);
            camera.updateProjectionMatrix();
            controls.update();

            needAutoFit = false; // ✅ 之后改参数不再重置镜头
        }
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

    // -------------------------
    // line pick (XZ)
    // -------------------------
    function setLinePickStatus(text) {
        statusLinePick.textContent = text;
        statusLinePick.classList.remove("hidden");
    }

    function hideLinePickStatus() {
        statusLinePick.classList.add("hidden");
    }

    function startLinePick(targetList, label) {
        _rClickT = 0;
        clearPickMarkers();
        ensureHoverMarker();
        setHoverMarkerColor(colorForPickIndex(0)); // 第一个点红
        hoverMarker.visible = true;
        linePickTargetList = targetList || state.root.children;
        linePickTargetLabel = label || "主Builder";
        linePickMode = true;
        picked = [];
        setLinePickStatus(`XZ 拾取模式[${linePickTargetLabel}]：请点第 1 点`);
    }

    function stopLinePick() {
        _rClickT = 0;
        clearPickMarkers();
        hideHoverMarker();
        linePickMode = false;
        picked = [];
        hideLinePickStatus();
    }

    function onPointerMove(ev) {
        if (!linePickMode) return;
        if (_rDown) {
            const d = Math.hypot(ev.clientX - _rDownX, ev.clientY - _rDownY);
            if (d > 6) _rMoved = true; // 视为拖动
            hideHoverMarker();
            return;
        }
        if (!renderer || !camera) return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
        raycaster.setFromCamera(mouse, camera);

        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(pickPlane, hit)) {
            const mapped = mapPickPoint(hit);
            setHoverMarkerColor(colorForPickIndex((picked?.length || 0) >= 1 ? 1 : 0));
            showHoverMarker(mapped);
        } else {
            hideHoverMarker();
        }
    }

    function onPointerUp(ev) {
        if (!linePickMode) return;
        if (!_rDown) return;

        _rDown = false;

        // 右键拖动过：这是平移，不算点击，不参与双击取消
        if (_rMoved) {
            _rMoved = false;
            return;
        }

        // 没拖动：算一次“右键点击”
        const now = performance.now();
        const dx = ev.clientX - _rClickX;
        const dy = ev.clientY - _rClickY;
        const dist = Math.hypot(dx, dy);

        if (now - _rClickT < RDBL_MS && dist < RDBL_PX) {
            // ✅ 右键双击取消拾取
            stopLinePick();   // 你已有：会 clearPickMarkers + hideHoverMarker
            _rClickT = 0;
            return;
        }

        // 记录第一次点击
        _rClickT = now;
        _rClickX = ev.clientX;
        _rClickY = ev.clientY;
    }

    function onPointerDown(ev) {
        if (!linePickMode) return;

        // ✅ 右键 / Ctrl+Click：不选点，只进入“可能的右键双击取消”判定流程
        if (isRightLike(ev)) {
            _rDown = true;
            _rMoved = false;
            _rDownX = ev.clientX;
            _rDownY = ev.clientY;
            return; // 关键：右键永远不选点
        }

        // ✅ 只允许纯左键选点（排除 ctrlKey）
        if (ev.button !== 0 || ev.ctrlKey) return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
        raycaster.setFromCamera(mouse, camera);

        const hit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(pickPlane, hit)) {
            const mapped = mapPickPoint(hit);
            const idx = picked.length; // 0=第一个点, 1=第二个点
            picked.push(mapped);

            addPickMarker(mapped, colorForPickIndex(idx));
            setHoverMarkerColor(colorForPickIndex(picked.length >= 1 ? 1 : 0));
            showHoverMarker(mapped);

            if (picked.length === 1) {
                setLinePickStatus(`XZ 拾取模式[${linePickTargetLabel}]：已选第 1 点：(${U.fmt(mapped.x)}, 0, ${U.fmt(mapped.z)})，再点第 2 点`);
            } else if (picked.length === 2) {
                const a = picked[0], b = picked[1];
                const list = linePickTargetList || state.root.children;
                list.push(makeNode("add_line", {
                    params: {sx: a.x, sy: 0, sz: a.z, ex: b.x, ey: 0, ez: b.z, count: 30}
                }));

                setLinePickStatus(`XZ 拾取模式[${linePickTargetLabel}]：已添加 addLine（可在卡片里改 count）`);
                picked = [];
                linePickMode = false;
                setTimeout(() => hideLinePickStatus(), 900);
                hideHoverMarker();
                clearPickMarkers();
                renderAll();
            }
        }
    }

    // -------------------------
    // UI render
    // -------------------------
    let rebuildTimer = null;

    function rebuildPreviewAndKotlin() {
        if (rebuildTimer) cancelAnimationFrame(rebuildTimer);
        rebuildTimer = requestAnimationFrame(() => {
            const pts = evalBuilder(state.root.children, U.v(0, 1, 0));
            setPoints(pts);
            elKotlinOut.value = emitKotlin();
        });
    }

    function renderAll() {
        renderCards();
        rebuildPreviewAndKotlin();
    }

    function iconBtn(text, onClick, danger = false) {
        const b = document.createElement("button");
        b.className = "iconbtn" + (danger ? " danger" : "");
        b.textContent = text;
        b.addEventListener("click", onClick);
        return b;
    }

    function row(label, editorEl) {
        const r = document.createElement("div");
        r.className = "row";
        const l = document.createElement("div");
        l.className = "label";
        l.textContent = label;
        r.appendChild(l);
        r.appendChild(editorEl);
        return r;
    }

    function inputNum(value, onInput) {
        const i = document.createElement("input");
        i.className = "input";
        i.type = "number";
        i.step = "any";
        i.value = String(value ?? 0);
        i.addEventListener("input", () => onInput(i.value));
        return i;
    }

    function select(options, value, onChange) {
        const s = document.createElement("select");
        s.className = "input";
        for (const [val, name] of options) {
            const o = document.createElement("option");
            o.value = val;
            o.textContent = name;
            if (val === value) o.selected = true;
            s.appendChild(o);
        }
        s.addEventListener("change", () => onChange(s.value));
        return s;
    }

    function checkbox(checked, onChange) {
        const wrap = document.createElement("div");
        wrap.className = "mini";
        const c = document.createElement("input");
        c.type = "checkbox";
        c.checked = !!checked;
        c.addEventListener("change", () => onChange(c.checked));
        wrap.appendChild(c);
        const sp = document.createElement("span");
        sp.className = "pill";
        sp.textContent = c.checked ? "启用" : "禁用";
        wrap.appendChild(sp);
        c.addEventListener("change", () => sp.textContent = c.checked ? "启用" : "禁用");
        return wrap;
    }

    function makeVec3Editor(p, prefix, onChange) {
        const box = document.createElement("div");
        box.className = "mini";
        const ix = inputNum(p[prefix + "x"], v => {
            p[prefix + "x"] = v;
            onChange();
        });
        const iy = inputNum(p[prefix + "y"], v => {
            p[prefix + "y"] = v;
            onChange();
        });
        const iz = inputNum(p[prefix + "z"], v => {
            p[prefix + "z"] = v;
            onChange();
        });
        ix.style.width = iy.style.width = iz.style.width = "96px";
        box.appendChild(ix);
        box.appendChild(iy);
        box.appendChild(iz);
        return box;
    }

    function setupDrag(handleEl, cardEl, listRef, getIdx, afterDrop) {
        handleEl.setAttribute("draggable", "true");
        handleEl.addEventListener("dragstart", (e) => {
            cardEl.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", JSON.stringify({id: cardEl.dataset.id}));
        });
        handleEl.addEventListener("dragend", () => cardEl.classList.remove("dragging"));

        cardEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            cardEl.style.outline = "1px dashed rgba(78,161,255,.55)";
        });
        cardEl.addEventListener("dragleave", () => {
            cardEl.style.outline = "";
        });
        cardEl.addEventListener("drop", (e) => {
            e.preventDefault();
            cardEl.style.outline = "";
            let payload = null;
            try {
                payload = JSON.parse(e.dataTransfer.getData("text/plain"));
            } catch {
            }
            if (!payload || !payload.id) return;

            const fromIdx = listRef.findIndex(n => n.id === payload.id);
            const toIdx = getIdx();
            if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

            const [moved] = listRef.splice(fromIdx, 1);
            const insertAt = fromIdx < toIdx ? (toIdx - 1) : toIdx;
            listRef.splice(insertAt, 0, moved);
            afterDrop();
        });
    }

    // ------- Modal -------
    let addTargetList = null;

    function showModal() {
        modal.classList.remove("hidden");
        modalMask.classList.remove("hidden");
        cardSearch.value = "";
        renderPicker("");
        cardSearch.focus();
    }

    function hideModal() {
        modal.classList.add("hidden");
        modalMask.classList.add("hidden");
    }

    function openModal(targetList) {
        addTargetList = targetList;
        showModal();
    }

    function renderPicker(filterText) {
        const f = (filterText || "").trim().toLowerCase();
        cardPicker.innerHTML = "";
        const entries = Object.entries(KIND).map(([kind, def]) => ({kind, def}));

        const shown = entries.filter(({kind, def}) => {
            const key = (kind + " " + def.title + " " + (def.desc || "")).toLowerCase();
            return !f || key.includes(f);
        });

        for (const it of shown) {
            const div = document.createElement("div");
            div.className = "pickitem";
            const t = document.createElement("div");
            t.className = "t";
            t.textContent = it.def.title;
            const d = document.createElement("div");
            d.className = "d";
            d.textContent = it.def.desc || it.kind;
            div.appendChild(t);
            div.appendChild(d);

            div.addEventListener("click", () => {
                if (!addTargetList) addTargetList = state.root.children;
                addTargetList.push(makeNode(it.kind));
                hideModal();
                renderAll();
            });
            cardPicker.appendChild(div);
        }
    }

    btnCloseModal.addEventListener("click", hideModal);
    btnCancelModal.addEventListener("click", hideModal);
    modalMask.addEventListener("click", hideModal);
    cardSearch.addEventListener("input", () => renderPicker(cardSearch.value));

    // -------------------------
    // Cards render
    // -------------------------
    function renderCards() {
        elCardsRoot.innerHTML = "";
        const list = state.root.children;
        for (let i = 0; i < list.length; i++) {
            elCardsRoot.appendChild(renderNodeCard(list[i], list, i, "主Builder"));
        }
    }

    function addQuickOffsetTo(list) {
        (list || state.root.children).push(makeNode("points_on_each_offset", {params: {offX: 0.2, offY: 0, offZ: 0}}));
        renderAll();
    }

    function renderParamsEditors(body, node, ownerLabel) {
        const p = node.params;

        switch (node.kind) {
            case "axis":
                body.appendChild(row("axis", makeVec3Editor(p, "", rebuildPreviewAndKotlin)));
                break;

            case "scale":
                body.appendChild(row("factor", inputNum(p.factor, v => {
                    p.factor = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "rotate_as_axis":
                body.appendChild(row("角度(度)", inputNum(p.deg, v => {
                    p.deg = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("自定义轴", checkbox(p.useCustomAxis, v => {
                    p.useCustomAxis = v;
                    renderAll();
                })));
                if (p.useCustomAxis) {
                    body.appendChild(row("ax", inputNum(p.ax, v => {
                        p.ax = v;
                        rebuildPreviewAndKotlin();
                    })));
                    body.appendChild(row("ay", inputNum(p.ay, v => {
                        p.ay = v;
                        rebuildPreviewAndKotlin();
                    })));
                    body.appendChild(row("az", inputNum(p.az, v => {
                        p.az = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                break;

            case "rotate_to":
                body.appendChild(row("模式", select([["toVec", "目标向量"], ["originEnd", "origin+end"]], p.mode, v => {
                    p.mode = v;
                    renderAll();
                })));
                if (p.mode === "originEnd") {
                    body.appendChild(row("origin", makeVec3Editor(p, "o", rebuildPreviewAndKotlin)));
                    body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin)));
                } else {
                    body.appendChild(row("to", makeVec3Editor(p, "to", rebuildPreviewAndKotlin)));
                }
                break;

            case "add_point":
                body.appendChild(row("point", makeVec3Editor(p, "", rebuildPreviewAndKotlin)));
                break;

            case "add_circle":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_discrete_circle_xz":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("discrete", inputNum(p.discrete, v => {
                    p.discrete = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("seed", checkbox(p.seedEnabled, v => {
                    p.seedEnabled = v;
                    renderAll();
                })));
                if (p.seedEnabled) body.appendChild(row("seed值", inputNum(p.seed, v => {
                    p.seed = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_half_circle":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("角度(度)", inputNum(p.rotateDeg, v => {
                    p.rotateDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_ball":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("countPow", inputNum(p.countPow, v => {
                    p.countPow = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_polygon_in_circle":
                body.appendChild(row("n", inputNum(p.n, v => {
                    p.n = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("edgeCount", inputNum(p.edgeCount, v => {
                    p.edgeCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_round_shape":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("step", inputNum(p.step, v => {
                    p.step = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("模式", select([["fixed", "固定点数"], ["range", "区间点数"]], p.mode, v => {
                    p.mode = v;
                    renderAll();
                })));
                if (p.mode === "range") {
                    body.appendChild(row("min", inputNum(p.minCircleCount, v => {
                        p.minCircleCount = v;
                        rebuildPreviewAndKotlin();
                    })));
                    body.appendChild(row("max", inputNum(p.maxCircleCount, v => {
                        p.maxCircleCount = v;
                        rebuildPreviewAndKotlin();
                    })));
                } else {
                    body.appendChild(row("preCount", inputNum(p.preCircleCount, v => {
                        p.preCircleCount = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                break;

            case "add_bezier_curve":
                body.appendChild(row("target(x,y)", (() => {
                    const box = document.createElement("div");
                    box.className = "mini";
                    const ix = inputNum(p.tx, v => {
                        p.tx = v;
                        rebuildPreviewAndKotlin();
                    });
                    const iy = inputNum(p.ty, v => {
                        p.ty = v;
                        rebuildPreviewAndKotlin();
                    });
                    ix.style.width = iy.style.width = "120px";
                    box.appendChild(ix);
                    box.appendChild(iy);
                    return box;
                })()));
                body.appendChild(row("startHandle(x,y)", (() => {
                    const box = document.createElement("div");
                    box.className = "mini";
                    const ix = inputNum(p.shx, v => {
                        p.shx = v;
                        rebuildPreviewAndKotlin();
                    });
                    const iy = inputNum(p.shy, v => {
                        p.shy = v;
                        rebuildPreviewAndKotlin();
                    });
                    ix.style.width = iy.style.width = "120px";
                    box.appendChild(ix);
                    box.appendChild(iy);
                    return box;
                })()));
                body.appendChild(row("endHandle(x,y)", (() => {
                    const box = document.createElement("div");
                    box.className = "mini";
                    const ix = inputNum(p.ehx, v => {
                        p.ehx = v;
                        rebuildPreviewAndKotlin();
                    });
                    const iy = inputNum(p.ehy, v => {
                        p.ehy = v;
                        rebuildPreviewAndKotlin();
                    });
                    ix.style.width = iy.style.width = "120px";
                    box.appendChild(ix);
                    box.appendChild(iy);
                    return box;
                })()));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_line":
                body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin)));
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin)));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_lightning_points":
                body.appendChild(row("使用start", checkbox(p.useStart, v => {
                    p.useStart = v;
                    renderAll();
                })));
                if (p.useStart) body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin)));
                body.appendChild(row("end(偏移)", makeVec3Editor(p, "e", rebuildPreviewAndKotlin)));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("preLineCount", inputNum(p.preLineCount, v => {
                    p.preLineCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offsetRange", checkbox(p.useOffsetRange, v => {
                    p.useOffsetRange = v;
                    renderAll();
                })));
                if (p.useOffsetRange) body.appendChild(row("range值", inputNum(p.offsetRange, v => {
                    p.offsetRange = v;
                    rebuildPreviewAndKotlin();
                })));
                break;
            case "add_lightning_nodes_attenuation": {
                const p = node.params;
                body.appendChild(row("使用start", checkbox(p.useStart, v => {
                    p.useStart = v;
                    renderAll();
                })));
                if (p.useStart) body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin)));
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin)));
                body.appendChild(row("counts", inputNum(p.counts, v => {
                    p.counts = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("maxOffset", inputNum(p.maxOffset, v => {
                    p.maxOffset = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("attenuation", inputNum(p.attenuation, v => {
                    p.attenuation = v;
                    rebuildPreviewAndKotlin();
                })));

                body.appendChild(row("seed", checkbox(p.seedEnabled, v => {
                    p.seedEnabled = v;
                    renderAll();
                })));
                if (p.seedEnabled) body.appendChild(row("seed值", inputNum(p.seed, v => {
                    p.seed = v;
                    rebuildPreviewAndKotlin();
                })));
                break;
            }

            case "apply_noise_offset":
                body.appendChild(row("noiseX", inputNum(p.noiseX, v => {
                    p.noiseX = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("noiseY", inputNum(p.noiseY, v => {
                    p.noiseY = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("noiseZ", inputNum(p.noiseZ, v => {
                    p.noiseZ = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("mode", select(
                    [["AXIS_UNIFORM", "AXIS_UNIFORM"], ["SPHERE_UNIFORM", "SPHERE_UNIFORM"], ["SHELL_UNIFORM", "SHELL_UNIFORM"]],
                    p.mode,
                    v => {
                        p.mode = v;
                        rebuildPreviewAndKotlin();
                    }
                )));
                body.appendChild(row("seed", checkbox(p.seedEnabled, v => {
                    p.seedEnabled = v;
                    renderAll();
                })));
                if (p.seedEnabled) body.appendChild(row("seed值", inputNum(p.seed, v => {
                    p.seed = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("lenMin", checkbox(p.lenMinEnabled, v => {
                    p.lenMinEnabled = v;
                    renderAll();
                })));
                if (p.lenMinEnabled) body.appendChild(row("min值", inputNum(p.offsetLenMin, v => {
                    p.offsetLenMin = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("lenMax", checkbox(p.lenMaxEnabled, v => {
                    p.lenMaxEnabled = v;
                    renderAll();
                })));
                if (p.lenMaxEnabled) body.appendChild(row("max值", inputNum(p.offsetLenMax, v => {
                    p.offsetLenMax = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "points_on_each_offset":
                body.appendChild(row("offX", inputNum(p.offX, v => {
                    p.offX = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offY", inputNum(p.offY, v => {
                    p.offY = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offZ", inputNum(p.offZ, v => {
                    p.offZ = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("输出形式", select(
                    [["direct3", "it.add(x,y,z)"], ["newRel", "it.add(RelativeLocation)"], ["valRel", "val rel; it.add(rel)"]],
                    p.kotlinMode,
                    v => {
                        p.kotlinMode = v;
                        rebuildPreviewAndKotlin();
                    }
                )));
                break;

            case "with_builder":
                body.appendChild(row("折叠子卡片", checkbox(node.folded, v => {
                    node.folded = v;
                    renderAll();
                })));
                if (!node.folded) {
                    const block = document.createElement("div");
                    block.className = "subblock";

                    const head = document.createElement("div");
                    head.className = "subblock-head";

                    const title = document.createElement("div");
                    title.className = "subblock-title";
                    title.textContent = `子 PointsBuilder（${ownerLabel}）`;

                    const actions = document.createElement("div");
                    actions.className = "mini";

                    // ✅ 内部控制与外部一致：添加卡片 / 快捷Offset / XZ拾取直线
                    const addBtn = document.createElement("button");
                    addBtn.className = "btn small primary";
                    addBtn.textContent = "添加卡片";
                    addBtn.addEventListener("click", () => openModal(node.children));

                    const offBtn = document.createElement("button");
                    offBtn.className = "btn small";
                    offBtn.textContent = "快捷Offset";
                    offBtn.addEventListener("click", () => addQuickOffsetTo(node.children));

                    const pickBtn = document.createElement("button");
                    pickBtn.className = "btn small";
                    pickBtn.textContent = "XZ拾取直线";
                    pickBtn.addEventListener("click", () => startLinePick(node.children, "子Builder"));

                    const clearBtn = document.createElement("button");
                    clearBtn.className = "btn small danger";
                    clearBtn.textContent = "清空";
                    clearBtn.addEventListener("click", () => {
                        node.children.splice(0);
                        node.children.push(makeNode("axis"));
                        renderAll();
                    });

                    actions.appendChild(addBtn);
                    actions.appendChild(offBtn);
                    actions.appendChild(pickBtn);
                    actions.appendChild(clearBtn);

                    head.appendChild(title);
                    head.appendChild(actions);

                    const sub = document.createElement("div");
                    sub.className = "subcards";

                    const list = node.children || [];
                    for (let i = 0; i < list.length; i++) {
                        sub.appendChild(renderNodeCard(list[i], list, i, "子Builder"));
                    }

                    block.appendChild(head);
                    block.appendChild(sub);
                    body.appendChild(block);
                }
                break;

            case "add_fourier_series":
                body.appendChild(row("折叠", checkbox(node.folded, v => {
                    node.folded = v;
                    renderAll();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("scale", inputNum(p.scale, v => {
                    p.scale = v;
                    rebuildPreviewAndKotlin();
                })));
                if (!node.folded) {
                    const block = document.createElement("div");
                    block.className = "subblock";

                    const head = document.createElement("div");
                    head.className = "subblock-head";

                    const title = document.createElement("div");
                    title.className = "subblock-title";
                    title.textContent = "Fourier 项（addFourier）";

                    const actions = document.createElement("div");
                    actions.className = "mini";

                    const addBtn = document.createElement("button");
                    addBtn.className = "btn small primary";
                    addBtn.textContent = "添加 Fourier 项";
                    addBtn.addEventListener("click", () => {
                        node.terms.push({id: uid(), r: 1, w: 1, startAngle: 0});
                        renderAll();
                    });

                    const clearBtn = document.createElement("button");
                    clearBtn.className = "btn small danger";
                    clearBtn.textContent = "清空";
                    clearBtn.addEventListener("click", () => {
                        node.terms.splice(0);
                        renderAll();
                    });

                    actions.appendChild(addBtn);
                    actions.appendChild(clearBtn);

                    head.appendChild(title);
                    head.appendChild(actions);

                    const sub = document.createElement("div");
                    sub.className = "subcards";

                    for (let i = 0; i < node.terms.length; i++) {
                        sub.appendChild(renderFourierTermCard(node, i));
                    }

                    block.appendChild(head);
                    block.appendChild(sub);
                    body.appendChild(block);
                }
                break;

            default:
                break;
        }
    }

    function renderFourierTermCard(parentNode, idx) {
        const t = parentNode.terms[idx];

        const card = document.createElement("div");
        card.className = "card";
        card.dataset.id = t.id;

        const head = document.createElement("div");
        head.className = "card-head";

        const title = document.createElement("div");
        title.className = "card-title";

        const handle = document.createElement("div");
        handle.className = "handle";
        handle.textContent = "≡";

        const ttext = document.createElement("div");
        ttext.className = "title-text";
        ttext.textContent = `Fourier #${idx + 1}`;

        const badge = document.createElement("div");
        badge.className = "badge2";
        badge.textContent = "addFourier";

        title.appendChild(handle);
        title.appendChild(ttext);
        title.appendChild(badge);

        const actions = document.createElement("div");
        actions.className = "card-actions";
        actions.appendChild(iconBtn("↑", () => {
            if (idx > 0) {
                const tmp = parentNode.terms[idx - 1];
                parentNode.terms[idx - 1] = parentNode.terms[idx];
                parentNode.terms[idx] = tmp;
                renderAll();
            }
        }));
        actions.appendChild(iconBtn("↓", () => {
            if (idx < parentNode.terms.length - 1) {
                const tmp = parentNode.terms[idx + 1];
                parentNode.terms[idx + 1] = parentNode.terms[idx];
                parentNode.terms[idx] = tmp;
                renderAll();
            }
        }));
        actions.appendChild(iconBtn("🗑", () => {
            parentNode.terms.splice(idx, 1);
            renderAll();
        }, true));

        head.appendChild(title);
        head.appendChild(actions);

        const body = document.createElement("div");
        body.className = "card-body";
        const desc = document.createElement("div");
        desc.className = "pill";
        desc.textContent = "r, w, startAngle(度)";
        body.appendChild(desc);

        body.appendChild(row("r", inputNum(t.r, v => {
            t.r = v;
            rebuildPreviewAndKotlin();
        })));
        body.appendChild(row("w", inputNum(t.w, v => {
            t.w = v;
            rebuildPreviewAndKotlin();
        })));
        body.appendChild(row("startAngle", inputNum(t.startAngle, v => {
            t.startAngle = v;
            rebuildPreviewAndKotlin();
        })));

        card.appendChild(head);
        card.appendChild(body);

        setupDrag(handle, card, parentNode.terms, () => idx, () => renderAll());
        return card;
    }

    function renderNodeCard(node, siblings, idx, ownerLabel) {
        const def = KIND[node.kind];
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.id = node.id;

        const head = document.createElement("div");
        head.className = "card-head";

        const title = document.createElement("div");
        title.className = "card-title";

        const handle = document.createElement("div");
        handle.className = "handle";
        handle.textContent = "≡";

        const ttext = document.createElement("div");
        ttext.className = "title-text";
        ttext.textContent = def ? def.title : node.kind;

        const badge = document.createElement("div");
        badge.className = "badge2";
        badge.textContent = node.kind;

        title.appendChild(handle);
        title.appendChild(ttext);
        title.appendChild(badge);

        const actions = document.createElement("div");
        actions.className = "card-actions";
        actions.appendChild(iconBtn("↑", () => {
            if (idx > 0) {
                const t = siblings[idx - 1];
                siblings[idx - 1] = siblings[idx];
                siblings[idx] = t;
                renderAll();
            }
        }));
        actions.appendChild(iconBtn("↓", () => {
            if (idx < siblings.length - 1) {
                const t = siblings[idx + 1];
                siblings[idx + 1] = siblings[idx];
                siblings[idx] = t;
                renderAll();
            }
        }));
        actions.appendChild(iconBtn("🗑", () => {
            siblings.splice(idx, 1);
            renderAll();
        }, true));

        head.appendChild(title);
        head.appendChild(actions);

        const body = document.createElement("div");
        body.className = "card-body";

        if (def?.desc) {
            const d = document.createElement("div");
            d.className = "pill";
            d.textContent = def.desc;
            body.appendChild(d);
        }

        renderParamsEditors(body, node, ownerLabel);

        card.appendChild(head);
        card.appendChild(body);

        setupDrag(handle, card, siblings, () => idx, () => renderAll());
        return card;
    }

    // -------------------------
    // Top buttons
    // -------------------------
    function doExportKotlin() {
        elKotlinOut.value = emitKotlin();
    }

    function doCopyKotlin() {
        const text = elKotlinOut.value || emitKotlin();
        navigator.clipboard?.writeText(text);
    }

    btnExportKotlin.addEventListener("click", doExportKotlin);
    btnExportKotlin2.addEventListener("click", doExportKotlin);
    btnCopyKotlin.addEventListener("click", doCopyKotlin);
    btnCopyKotlin2.addEventListener("click", doCopyKotlin);

    btnAddCard.addEventListener("click", () => openModal(state.root.children));
    btnQuickOffset.addEventListener("click", () => addQuickOffsetTo(state.root.children));

    btnPickLine.addEventListener("click", () => {
        if (linePickMode) stopLinePick();
        else startLinePick(state.root.children, "主Builder");
    });

    btnFullscreen.addEventListener("click", () => {
        const host = document.querySelector(".viewer");
        if (!document.fullscreenElement) host.requestFullscreen?.();
        else document.exitFullscreen?.();
    });

    btnSaveJson.addEventListener("click", () => {
        const blob = new Blob([JSON.stringify(state, null, 2)], {type: "application/json"});
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "pointsbuilder.json";
        a.click();
        URL.revokeObjectURL(a.href);
    });

    btnLoadJson.addEventListener("click", () => fileJson.click());
    fileJson.addEventListener("change", async () => {
        const f = fileJson.files && fileJson.files[0];
        if (!f) return;
        const text = await f.text();
        try {
            const obj = JSON.parse(text);
            if (!obj || !obj.root || !Array.isArray(obj.root.children)) throw new Error("invalid json");
            state = obj;
            renderAll();
        } catch (e) {
            alert("JSON 解析失败：" + e.message);
        } finally {
            fileJson.value = "";
        }
    });

    btnReset.addEventListener("click", () => {
        if (!confirm("确定重置全部卡片？")) return;
        state = {root: {id: "root", kind: "ROOT", children: [makeNode("axis", {params: {x: 0, y: 1, z: 0}})]}};
        renderAll();
    });

    // -------------------------
    // Boot
    // -------------------------
    initThree();
    renderAll();
})();
