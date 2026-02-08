import * as THREE from "three";

export function createKindDefs(ctx) {
    const { U, num, int, relExpr, rotatePointsToPointUpright } = ctx || {};

    function cubicBezierPoint(t, p0, p1, p2, p3) {
        const u = 1 - t;
        const u2 = u * u;
        const t2 = t * t;
        const u3 = u2 * u;
        const t3 = t2 * t;
        return {
            x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
            y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
            z: u3 * p0.z + 3 * u2 * t * p1.z + 3 * u * t2 * p2.z + t3 * p3.z,
        };
    }

    function buildCubicBezier(p0, p1, p2, p3, count) {
        const c = Math.max(1, int(count));
        const res = [];
        for (let i = 0; i < c; i++) {
            const t = (c === 1) ? 1.0 : i / (c - 1);
            res.push(cubicBezierPoint(t, p0, p1, p2, p3));
        }
        return res;
    }

    function quadToCubic(p0, p1, p2) {
        const c1 = U.add(p0, U.mul(U.sub(p1, p0), 2 / 3));
        const c2 = U.add(p2, U.mul(U.sub(p1, p2), 2 / 3));
        return { c1, c2 };
    }

    function distortionSafeNormalize(v) {
        const len = U.len(v);
        if (len < 1e-9) return { x: 0, y: 1, z: 0 };
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }

    function distortionAnyPerp(axis) {
        const ref = (Math.abs(axis.y) < 0.9)
            ? { x: 0, y: 1, z: 0 }
            : { x: 1, y: 0, z: 0 };
        const perp = U.cross(axis, ref);
        const len = U.len(perp);
        if (len < 1e-9) return { x: 0, y: 0, z: 1 };
        return { x: perp.x / len, y: perp.y / len, z: perp.z / len };
    }

    function distortionFade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    function distortionLerp(a, b, t) {
        return a + (b - a) * t;
    }

    function distortionHash3(ix, iy, iz, seed) {
        let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647) + Math.imul(seed, 374761);
        n = (n ^ (n >>> 13)) | 0;
        n = Math.imul(n, 1274126177);
        n = (n ^ (n >>> 16)) | 0;
        return ((n & 0x7fffffff) >>> 0) / 2147483647.0;
    }

    function distortionValueNoise3(p, seed) {
        const x0 = Math.floor(p.x);
        const y0 = Math.floor(p.y);
        const z0 = Math.floor(p.z);
        const fx = p.x - x0;
        const fy = p.y - y0;
        const fz = p.z - z0;

        const u = distortionFade(fx);
        const v = distortionFade(fy);
        const w = distortionFade(fz);

        const h = (dx, dy, dz) => distortionHash3(x0 + dx, y0 + dy, z0 + dz, seed);

        const n000 = h(0, 0, 0);
        const n100 = h(1, 0, 0);
        const n010 = h(0, 1, 0);
        const n110 = h(1, 1, 0);
        const n001 = h(0, 0, 1);
        const n101 = h(1, 0, 1);
        const n011 = h(0, 1, 1);
        const n111 = h(1, 1, 1);

        const nx00 = distortionLerp(n000, n100, u);
        const nx10 = distortionLerp(n010, n110, u);
        const nx01 = distortionLerp(n001, n101, u);
        const nx11 = distortionLerp(n011, n111, u);

        const nxy0 = distortionLerp(nx00, nx10, v);
        const nxy1 = distortionLerp(nx01, nx11, v);

        return distortionLerp(nxy0, nxy1, w);
    }

    function distortionNoise(p, seed) {
        return distortionValueNoise3(p, seed) * 2.0 - 1.0;
    }
    // -------------------------
    // KIND
    // -------------------------
    const KIND = {
        axis: {
            title: "axis(对称轴)",
            desc: "设置旋转轴（axis），不新增点",
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
            desc: "绕当前轴旋转已有点（不新增点）",
            defaultParams: {deg: 90, degUnit: "deg", useCustomAxis: false, ax: 0, ay: 1, az: 0},
            apply(ctx, node) {
                const rad = U.angleToRad(num(node.params.deg), node.params.degUnit);
                const axis = node.params.useCustomAxis
                    ? U.v(num(node.params.ax), num(node.params.ay), num(node.params.az))
                    : ctx.axis;
                ctx.points = ctx.points.map(p => U.rotateAroundAxis(p, axis, rad));
            },
            kotlin(node) {
                const radExpr = U.angleToKotlinRadExpr(num(node.params.deg), node.params.degUnit);
                if (node.params.useCustomAxis) {
                    return `.rotateAsAxis(${radExpr}, ${relExpr(node.params.ax, node.params.ay, node.params.az)})`;
                }
                return `.rotateAsAxis(${radExpr})`;
            }
        },

        rotate_to: {
            title: "rotateTo(指向目标)",
            desc: "把轴指向目标方向（不新增点）",
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
            desc: "缩放现有点集（不新增点）",
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
            desc: "添加一个点（addPoint）",
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
            desc: "添加线段采样点（addLine）",
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
            desc: "添加 XZ 圆周采样点（addCircle）",
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
            desc: "添加离散圆环点（addDiscreteCircleXZ）",
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
            desc: "添加半圆弧点（addHalfCircle）",
            defaultParams: {r: 2, count: 80, useRotate: false, rotateDeg: 0, rotateDegUnit: "deg"},
            apply(ctx, node) {
                const rot = node.params.useRotate ? U.angleToRad(num(node.params.rotateDeg), node.params.rotateDegUnit) : 0;
                ctx.points.push(...U.getHalfCircleXZ(num(node.params.r), int(node.params.count), rot));
            },
            kotlin(node) {
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.count);
                if (!node.params.useRotate) return `.addHalfCircle(${r}, ${c})`;
                const radExpr = U.angleToKotlinRadExpr(num(node.params.rotateDeg), node.params.rotateDegUnit);
                return `.addHalfCircle(${r}, ${c}, ${radExpr})`;
            }
        },

        add_radian_center: {
            title: "addRadianCenter(弧线中心XZ)",
            desc: "添加居中弧线点（addRadianCenter）",
            defaultParams: {r: 2, count: 80, radianDeg: 120, radianDegUnit: "deg", useRotate: false, rotateDeg: 0, rotateDegUnit: "deg"},
            apply(ctx, node) {
                const radian = U.angleToRad(num(node.params.radianDeg), node.params.radianDegUnit);
                const rot = node.params.useRotate ? U.angleToRad(num(node.params.rotateDeg), node.params.rotateDegUnit) : 0;
                ctx.points.push(...U.getRadianXZCenter(num(node.params.r), int(node.params.count), radian, rot));
            },
            kotlin(node) {
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.count);
                const radianExpr = U.angleToKotlinRadExpr(num(node.params.radianDeg), node.params.radianDegUnit);
                if (!node.params.useRotate) return `.addRadianCenter(${r}, ${c}, ${radianExpr})`;
                const rotExpr = U.angleToKotlinRadExpr(num(node.params.rotateDeg), node.params.rotateDegUnit);
                return `.addRadianCenter(${r}, ${c}, ${radianExpr}, ${rotExpr})`;
            }
        },

        add_radian: {
            title: "addRadian(弧线XZ)",
            desc: "添加起止角弧线点（addRadian）",
            defaultParams: {r: 2, count: 80, startDeg: 0, startDegUnit: "deg", endDeg: 120, endDegUnit: "deg", useRotate: false, rotateDeg: 0, rotateDegUnit: "deg"},
            apply(ctx, node) {
                const sr = U.angleToRad(num(node.params.startDeg), node.params.startDegUnit);
                const er = U.angleToRad(num(node.params.endDeg), node.params.endDegUnit);
                const rot = node.params.useRotate ? U.angleToRad(num(node.params.rotateDeg), node.params.rotateDegUnit) : 0;
                ctx.points.push(...U.getRadianXZ(num(node.params.r), int(node.params.count), sr, er, rot));
            },
            kotlin(node) {
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.count);
                const srExpr = U.angleToKotlinRadExpr(num(node.params.startDeg), node.params.startDegUnit);
                const erExpr = U.angleToKotlinRadExpr(num(node.params.endDeg), node.params.endDegUnit);
                if (!node.params.useRotate) return `.addRadian(${r}, ${c}, ${srExpr}, ${erExpr})`;
                const rotExpr = U.angleToKotlinRadExpr(num(node.params.rotateDeg), node.params.rotateDegUnit);
                return `.addRadian(${r}, ${c}, ${srExpr}, ${erExpr}, ${rotExpr})`;
            }
        },

        add_ball: {
            title: "addBall(球面点集)",
            desc: "添加球面点集（addBall / countPow）",
            defaultParams: {r: 2, countPow: 24},
            apply(ctx, node) {
                ctx.points.push(...U.getBallLocations(num(node.params.r), int(node.params.countPow)));
            },
            kotlin(node) {
                return `.addBall(${U.fmt(num(node.params.r))}, ${int(node.params.countPow)})`;
            }
        },

        add_polygon: {
            title: "addPolygon(正多边形边点)",
            desc: "添加正多边形边点（addPolygon）",
            defaultParams: {r: 2, sideCount: 5, count: 30},
            apply(ctx, node) {
                ctx.points.push(...U.getPolygonInCircleLocations(int(node.params.sideCount) || 3, int(node.params.count) || 1, num(node.params.r)));
            },
            kotlin(node) {
                return `.addPolygonInCircle(${int(node.params.sideCount)}, ${int(node.params.count)}, ${U.fmt(num(node.params.r))})`;
            }
        },

        add_polygon_in_circle: {
            title: "addPolygonInCircle(内接正多边形边点)",
            desc: "添加内接多边形边点（addPolygonInCircle）",
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
            desc: "添加 XZ 圆面填充点（addRoundShape）",
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

        add_bezier: {
            title: "addBezier(三点贝塞尔)",
            desc: "添加三点贝塞尔曲线点（addBezier）",
            defaultParams: {
                p1x: 0, p1y: 0, p1z: 0,
                p2x: 2, p2y: 2, p2z: 0,
                p3x: 4, p3y: 0, p3z: 0,
                count: 80
            },
            apply(ctx, node) {
                const p = node.params;
                const p0 = U.v(num(p.p1x), num(p.p1y), num(p.p1z));
                const p1 = U.v(num(p.p2x), num(p.p2y), num(p.p2z));
                const p2 = U.v(num(p.p3x), num(p.p3y), num(p.p3z));
                const cubic = quadToCubic(p0, p1, p2);
                ctx.points.push(...buildCubicBezier(p0, cubic.c1, cubic.c2, p2, int(p.count)));
            },
            kotlin(node) {
                const p = node.params;
                const p0 = U.v(num(p.p1x), num(p.p1y), num(p.p1z));
                const p1 = U.v(num(p.p2x), num(p.p2y), num(p.p2z));
                const p2 = U.v(num(p.p3x), num(p.p3y), num(p.p3z));
                const cubic = quadToCubic(p0, p1, p2);
                const target = U.sub(p2, p0);
                const startHandle = U.sub(cubic.c1, p0);
                const endHandle = U.sub(cubic.c2, p2);
                const startExpr = relExpr(p0.x, p0.y, p0.z);
                return `.addWith { generateBezierCurve(${relExpr(target.x, target.y, target.z)}, ${relExpr(startHandle.x, startHandle.y, startHandle.z)}, ${relExpr(endHandle.x, endHandle.y, endHandle.z)}, ${int(p.count)}).onEach { it.add(${startExpr}) } }`;
            }
        },

        add_bezier_4: {
            title: "addBezier4(四点贝塞尔)",
            desc: "添加四点贝塞尔曲线点（addBezier4）",
            defaultParams: {
                p1x: 0, p1y: 0, p1z: 0,
                p2x: 2, p2y: 2, p2z: 0,
                p3x: 4, p3y: -2, p3z: 0,
                p4x: 6, p4y: 0, p4z: 0,
                count: 80
            },
            apply(ctx, node) {
                const p = node.params;
                const p0 = U.v(num(p.p1x), num(p.p1y), num(p.p1z));
                const p1 = U.v(num(p.p2x), num(p.p2y), num(p.p2z));
                const p2 = U.v(num(p.p3x), num(p.p3y), num(p.p3z));
                const p3 = U.v(num(p.p4x), num(p.p4y), num(p.p4z));
                ctx.points.push(...buildCubicBezier(p0, p1, p2, p3, int(p.count)));
            },
            kotlin(node) {
                const p = node.params;
                const p0 = U.v(num(p.p1x), num(p.p1y), num(p.p1z));
                const c1 = U.v(num(p.p2x), num(p.p2y), num(p.p2z));
                const c2 = U.v(num(p.p3x), num(p.p3y), num(p.p3z));
                const p3 = U.v(num(p.p4x), num(p.p4y), num(p.p4z));
                const target = U.sub(p3, p0);
                const startHandle = U.sub(c1, p0);
                const endHandle = U.sub(c2, p3);
                const startExpr = relExpr(p0.x, p0.y, p0.z);
                return `.addWith { generateBezierCurve(${relExpr(target.x, target.y, target.z)}, ${relExpr(startHandle.x, startHandle.y, startHandle.z)}, ${relExpr(endHandle.x, endHandle.y, endHandle.z)}, ${int(p.count)}).onEach { it.add(${startExpr}) } }`;
            }
        },

        add_bezier_curve: {
            title: "addBezierCurve(三次贝塞尔)",
            desc: "添加三次贝塞尔曲线点（addBezierCurve）",
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
            desc: "添加闪电折线采样点（addLightningPoints）",
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
        add_lightning_nodes: {
            title: "addLightningNodes(闪电节点)",
            desc: "添加闪电节点（addLightningNodes）",
            defaultParams: {
                useStart: false,
                sx: 0, sy: 0, sz: 0,
                ex: 6, ey: 2, ez: 0,
                count: 6,
                useOffsetRange: false,
                offsetRange: 1.2
            },
            apply(ctx, node) {
                const p = node.params;
                const start = p.useStart ? U.v(num(p.sx), num(p.sy), num(p.sz)) : U.v(0, 0, 0);
                const end = U.v(num(p.ex), num(p.ey), num(p.ez));
                const count = int(p.count);
                if (p.useOffsetRange) {
                    ctx.points.push(...U.getLightningEffectNodes(start, end, count, num(p.offsetRange)));
                } else {
                    ctx.points.push(...U.getLightningEffectNodes(start, end, count));
                }
            },
            kotlin(node) {
                const p = node.params;
                const end = relExpr(p.ex, p.ey, p.ez);
                const count = int(p.count);
                if (!p.useStart) {
                    if (p.useOffsetRange) {
                        return `.addLightningNodes(${end}, ${count}, ${U.fmt(num(p.offsetRange))})`;
                    }
                    return `.addLightningNodes(${end}, ${count})`;
                }
                const start = relExpr(p.sx, p.sy, p.sz);
                if (p.useOffsetRange) {
                    return `.addLightningNodes(${start}, ${end}, ${count}, ${U.fmt(num(p.offsetRange))})`;
                }
                return `.addLightningNodes(${start}, ${end}, ${count})`;
            }
        },
        add_lightning_nodes_attenuation: {
            title: "addLightningNodesAttenuation(衰减闪电节点)",
            desc: "添加带衰减的闪电节点（addLightningNodesAttenuation）",
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
            desc: "对现有点做随机扰动（applyNoiseOffset）",
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
            desc: "对每个点追加偏移点（pointsOnEach）",
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

        add_with: {
            title: "addWith(旋转重复)",
            desc: "按旋转重复子 Builder（addWith）",
            defaultParams: {r: 3, c: 6, rotateToCenter: true, rotateReverse: false, rotateOffsetEnabled: false, rox: 0, roy: 0, roz: 0},
            apply(ctx, node) {
                const r = num(node.params.r);
                const c = int(node.params.c);
                const rotateToCenter = !!node.params.rotateToCenter;
                const rotateReverse = !!node.params.rotateReverse;
                const rotateOffsetEnabled = !!node.params.rotateOffsetEnabled;
                const rox = num(node.params.rox);
                const roy = num(node.params.roy);
                const roz = num(node.params.roz);
                const verts = U.getPolygonInCircleVertices(c, r);

                for (const it of verts) {
                    const childCtx = {points: [], axis: U.v(0, 1, 0)};
                    for (const ch of (node.children || [])) {
                        const def = KIND[ch.kind];
                        if (def && def.apply) def.apply(childCtx, ch);
                    }

                    const pts = (childCtx.points || []).map(p => U.clone(p));
                    const base = it;
                    if (rotateToCenter) {
                        const targetPoint = rotateOffsetEnabled ? U.v(rox, roy, roz) : U.v(0, 0, 0);
                        const rotateTarget = rotateReverse ? U.add(targetPoint, it) : U.sub(targetPoint, it);
                        rotatePointsToPointUpright(pts, rotateTarget, childCtx.axis);
                    }
                    for (const p of pts) {
                        ctx.points.push({x: p.x + base.x, y: p.y + base.y, z: p.z + base.z});
                    }
                }
            },
            kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.c);
                const rotateToCenter = !!node.params.rotateToCenter;
                const rotateReverse = !!node.params.rotateReverse;
                const rotateOffsetEnabled = !!node.params.rotateOffsetEnabled;
                const rox = U.fmt(num(node.params.rox));
                const roy = U.fmt(num(node.params.roy));
                const roz = U.fmt(num(node.params.roz));
                const lines = [];
                lines.push(`${indent}.addWith {`);
                lines.push(`${indent}  val res = arrayListOf<RelativeLocation>()`);
                lines.push(`${indent}  getPolygonInCircleVertices(${c}, ${r})`);
                lines.push(`${indent}        .forEach { it ->`);
                lines.push(`${indent}            val p = PointsBuilder()`);

                const childLines = emitNodesKotlinLines(node.children || [], indent + "              ", emitCtx);
                lines.push(...childLines);

                if (rotateToCenter) {
                    if (rotateOffsetEnabled) {
                        if (rotateReverse) {
                            lines.push(`${indent}            p.rotateTo(it.clone().add(${rox}, ${roy}, ${roz}))`);
                        } else {
                            lines.push(`${indent}            p.rotateTo((-it).add(${rox}, ${roy}, ${roz}))`);
                        }
                    } else {
                        lines.push(`${indent}            p.rotateTo(${rotateReverse ? "it" : "-it"})`);
                    }
                }
                lines.push(`${indent}            res.addAll(p`);
                lines.push(`${indent}                    .pointsOnEach { rel -> rel.add(it) }`);
                lines.push(`${indent}                    .createWithoutClone()`);
                lines.push(`${indent}            )`);
                lines.push(`${indent}        }`);
                lines.push(`${indent}  res`);
                lines.push(`${indent}}`);
                return lines;
            }
        },

        with_builder: {
            title: "withBuilder(子PointsBuilder)",
            desc: "拼接子 Builder 的点（withBuilder）",
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
            desc: "添加傅里叶级数曲线点（addFourierSeries）",
            defaultParams: {count: 360, scale: 1.0, folded: false},
            apply(ctx, node) {
                const terms = (node.terms || []).map(t => ({
                    r: num(t.r),
                    w: num(t.w),
                    startAngle: num(t.startAngle),
                    startAngleUnit: t.startAngleUnit
                }));
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
                    const startAngleDeg = U.angleToDeg(num(t.startAngle), t.startAngleUnit);
                    lines.push(`${indent}    .addFourier(${U.fmt(num(t.r))}, ${U.fmt(num(t.w))}, ${U.fmt(startAngleDeg)})`);
                }
                lines.push(`${indent}  )`);
                return lines;
            }
        },

        clear: {
            title: "clear()",
            desc: "清空当前点集（clear）",
            defaultParams: {},
            apply(ctx) {
                ctx.points = [];
            },
            kotlin() {
                return `.clear()`;
            }
        },
    };
    return KIND;
}

