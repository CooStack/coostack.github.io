export function installKotlinCodegenMethods(CompositionBuilderApp, deps = {}) {
    const {
        U,
        num,
        int,
        normalizeAnimate,
        normalizeControllerAction,
        normalizeDisplayAction,
        normalizeScaleHelperConfig,
        normalizeShapeNestedLevel,
        sanitizeKotlinClassName,
        sanitizeKotlinIdentifier,
        defaultLiteralForKotlinType,
        rewriteClassQualifier,
        rewriteControllerStatusQualifier,
        normalizeKotlinFloatLiteralText,
        isPlainNumericLiteralText,
        normalizeKotlinDoubleLiteralText,
        formatKotlinDoubleLiteral,
        relExpr,
        indentText,
        normalizeAngleOffsetEaseName,
        normalizeAngleUnit,
        translateJsBlockToKotlin,
        normalizeParticleFloatAssignmentExpr,
        DEFAULT_EFFECT_CLASS
    } = deps;

    if (!CompositionBuilderApp || !CompositionBuilderApp.prototype) {
        throw new Error("installKotlinCodegenMethods requires CompositionBuilderApp");
    }

    class KotlinCodegenMixin {
    generateKotlin() {
        const className = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const sequencedRoot = this.state.compositionType === "sequenced";
        const baseClass = sequencedRoot ? "AutoSequencedParticleComposition" : "AutoParticleComposition";
        const imports = [
            "import cn.coostack.cooparticlesapi.annotations.CodecField",
            "import cn.coostack.cooparticlesapi.annotations.CooAutoRegister",
            "import cn.coostack.cooparticlesapi.animation.timeline.*",
            "import cn.coostack.cooparticlesapi.network.particle.composition.*",
            "import cn.coostack.cooparticlesapi.particles.ParticleDisplayer",
            "import cn.coostack.cooparticlesapi.particles.impl.*",
            "import cn.coostack.cooparticlesapi.utils.RelativeLocation",
            "import cn.coostack.cooparticlesapi.utils.builder.PointsBuilder",
            "import net.minecraft.world.level.Level",
            "import net.minecraft.world.phys.Vec3",
            "import kotlin.math.PI",
            "import kotlin.random.Random",
            "import java.util.SortedMap",
            "import java.util.TreeMap",
            "import org.joml.Vector3f"
        ];

        const body = [];
        body.push("@CooAutoRegister");
        body.push(`class ${className}(position: Vec3, world: Level? = null) : ${baseClass}(position, world) {`);
        const fields = this.buildClassFields(className);
        if (fields) body.push(fields);
        const initBlock = this.buildInitBlock(className, sequencedRoot);
        if (initBlock) body.push(initBlock);
        body.push(this.buildParticlesMethod(className, sequencedRoot));
        body.push(this.buildOnDisplayMethod(className));
        body.push("}");

        return [...imports, "", ...body].join("\n").replace(/\n{3,}/g, "\n\n");
    }

    buildClassFields(className) {
        const lines = [];
        const used = new Set();
        const uniqueName = (raw, fallback) => {
            let base = sanitizeKotlinIdentifier(raw, fallback);
            if (!base) base = fallback;
            let out = base;
            let i = 2;
            while (used.has(out)) out = `${base}${i++}`;
            used.add(out);
            return out;
        };

        for (const v of this.state.globalVars) {
            const name = uniqueName(v.name, "value");
            const type = String(v.type || "Double").trim() || "Double";
            const rawValue = String(v.value || "").trim();
            let value = rewriteClassQualifier(rawValue || defaultLiteralForKotlinType(type), className);
            if (/^float$/i.test(type)) {
                if (isPlainNumericLiteralText(value)) value = normalizeKotlinFloatLiteralText(value);
                else if (!/\.toFloat\(\)\s*$/.test(value)) value = `(${value}).toFloat()`;
            } else if (/^double$/i.test(type) && isPlainNumericLiteralText(value)) {
                value = normalizeKotlinDoubleLiteralText(value);
            }
            if (v.codec) lines.push("    @CodecField");
            lines.push(`    ${v.mutable ? "var" : "val"} ${name}: ${type} = ${value}`);
            lines.push("");
        }
        for (const c of this.state.globalConsts) {
            const name = uniqueName(c.name, "constant");
            const type = String(c.type || "Int").trim() || "Int";
            const rawValue = String(c.value || "").trim();
            let value = rewriteClassQualifier(rawValue || defaultLiteralForKotlinType(type), className);
            if (/^float$/i.test(type)) {
                if (isPlainNumericLiteralText(value)) value = normalizeKotlinFloatLiteralText(value);
                else if (!/\.toFloat\(\)\s*$/.test(value)) value = `(${value}).toFloat()`;
            } else if (/^double$/i.test(type) && isPlainNumericLiteralText(value)) {
                value = normalizeKotlinDoubleLiteralText(value);
            }
            lines.push(`    val ${name}: ${type} = ${value}`);
            lines.push("");
        }

        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        if (projectScale.type !== "none") {
            if (projectScale.type === "bezier") {
                lines.push(
                    `    private val scaleHelper = CompositionBezierScaleHelper(${Math.max(1, int(projectScale.tick))}, ${formatKotlinDoubleLiteral(projectScale.min)}, ${formatKotlinDoubleLiteral(projectScale.max)}, ` +
                    `RelativeLocation(${formatKotlinDoubleLiteral(projectScale.c1x)}, ${formatKotlinDoubleLiteral(projectScale.c1y)}, ${formatKotlinDoubleLiteral(projectScale.c1z)}), ` +
                    `RelativeLocation(${formatKotlinDoubleLiteral(projectScale.c2x)}, ${formatKotlinDoubleLiteral(projectScale.c2y)}, ${formatKotlinDoubleLiteral(projectScale.c2z)}))`
                );
            } else {
                lines.push(`    private val scaleHelper = CompositionScaleHelper(${formatKotlinDoubleLiteral(projectScale.min)}, ${formatKotlinDoubleLiteral(projectScale.max)}, ${Math.max(1, int(projectScale.tick))})`);
            }
            lines.push("");
        }

        while (lines.length && lines[lines.length - 1] === "") lines.pop();
        return lines.join("\n");
    }

    buildInitBlock(className, sequencedRoot) {
        const lines = [];
        const axisExpr = rewriteClassQualifier(
            String(this.state.compositionAxisExpr || this.state.compositionAxisPreset || "RelativeLocation.yAxis()"),
            className
        );
        if (axisExpr) lines.push(`        axis = ${axisExpr}`);
        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        if (projectScale.type !== "none") {
            lines.push("        scaleHelper.loadControler(this)");
        }
        const disabled = Math.max(0, int(this.state.disabledInterval || 0));
        if (disabled > 0) lines.push(`        setDisabledInterval(${disabled})`);
        if (sequencedRoot && this.state.compositionAnimates.length) {
            const animates = this.state.compositionAnimates.map((a) => normalizeAnimate(a));
            if (animates.length) {
                const first = animates[0];
                lines.push(`        animate.addAnimate(${Math.max(1, int(first.count))}) { ${rewriteClassQualifier(first.condition || "true", className)} }`);
                for (let i = 1; i < animates.length; i++) {
                    const it = animates[i];
                    lines.push(`            .addAnimate(${Math.max(1, int(it.count))}) { ${rewriteClassQualifier(it.condition || "true", className)} }`);
                }
            }
        }
        if (!lines.length) return "";
        return ["    init {", ...lines, "    }"].join("\n");
    }

    buildParticlesMethod(className, sequencedRoot) {
        const lines = [];
        if (sequencedRoot) {
            lines.push("    override fun getParticleSequenced(): SortedMap<CompositionData, RelativeLocation> {");
            lines.push("        val result: SortedMap<CompositionData, RelativeLocation> = TreeMap()");
            lines.push("        var orderCounter = 0");
        } else {
            lines.push("    override fun getParticles(): Map<CompositionData, RelativeLocation> {");
            lines.push("        val result = LinkedHashMap<CompositionData, RelativeLocation>()");
        }

        for (let i = 0; i < this.state.cards.length; i++) {
            const card = this.state.cards[i];
            lines.push("");
            lines.push(this.emitCardPut(card, className, sequencedRoot, i));
        }

        lines.push("");
        lines.push("        return result");
        lines.push("    }");
        return lines.join("\n");
    }

    emitCardPut(card, className, sequencedRoot, cardIndex = 0) {
        if (card.bindMode === "point") return this.emitCardPutPoint(card, className, sequencedRoot);
        return this.emitCardPutAll(card, className, sequencedRoot);
    }

    resolveAngleOffsetConfig(raw, className) {
        if (!raw || raw.angleOffsetEnabled !== true) return null;
        const count = Math.max(1, int(raw.angleOffsetCount || 1));
        if (count <= 1) return null;
        const glowTick = Math.max(1, int(raw.angleOffsetGlowTick || 20));
        const easeName = normalizeAngleOffsetEaseName(raw.angleOffsetEase || "outCubic");
        const reverseOnDisable = raw.angleOffsetReverseOnDisable === true;
        const totalAngleRaw = raw.angleOffsetAngleMode === "expr"
            ? String(raw.angleOffsetAngleExpr || raw.angleOffsetAnglePreset || "PI * 2")
            : U.angleToKotlinRadExpr(num(raw.angleOffsetAngleValue || 0), normalizeAngleUnit(raw.angleOffsetAngleUnit || "deg"));
        const totalAngleExpr = rewriteClassQualifier(totalAngleRaw || "0.0", className) || "0.0";
        return { count, glowTick, easeName, reverseOnDisable, totalAngleExpr };
    }

    resolveCardAngleOffsetConfig(card, className) {
        if (!card || card.dataType === "single") return null;
        return this.resolveAngleOffsetConfig(card, className);
    }

    resolveShapeLevelAngleOffsetConfig(level, className) {
        if (!level || level.type === "single") return null;
        return this.resolveAngleOffsetConfig(level, className);
    }

    emitCardPutAll(card, className, sequencedRoot) {
        const builderExpr = this.emitBuilderExpr(card);
        const offsetCfg = this.resolveCardAngleOffsetConfig(card, className);
        if (offsetCfg) {
            const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                        ", {
                angleOffsetExpr: "finalAngle",
                angleOffsetConfig: offsetCfg
            });
            return [
                `        val angleOffsetCount = ${Math.max(1, int(offsetCfg.count))}`,
                "        repeat(angleOffsetCount) { index ->",
                `            val finalAngle = (${offsetCfg.totalAngleExpr}) * index.toDouble() / angleOffsetCount.toDouble()`,
                "            result.putAll(",
                `${indentText(builderExpr, "                ")}`,
                "                    .createWithCompositionData { rel ->",
                dataExpr,
                "                    }",
                "            )",
                "        }"
            ].join("\n");
        }
        const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                ");
        return [
            "        result.putAll(",
            `${indentText(builderExpr, "            ")}`,
            "                .createWithCompositionData { rel ->",
            dataExpr,
            "                }",
            "        )"
        ].join("\n");
    }

    emitCardPutPoint(card, className, sequencedRoot) {
        const rel = relExpr(card.point?.x, card.point?.y, card.point?.z);
        const offsetCfg = this.resolveCardAngleOffsetConfig(card, className);
        if (offsetCfg) {
            const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                    ", {
                angleOffsetExpr: "finalAngle",
                angleOffsetConfig: offsetCfg
            });
            return [
                `        val angleOffsetCount = ${Math.max(1, int(offsetCfg.count))}`,
                "        repeat(angleOffsetCount) { index ->",
                `            val finalAngle = (${offsetCfg.totalAngleExpr}) * index.toDouble() / angleOffsetCount.toDouble()`,
                "            result[",
                dataExpr,
                `            ] = ${rel}`,
                "        }"
            ].join("\n");
        }
        const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                ");
        return [
            "        result[",
            dataExpr,
            `        ] = ${rel}`
        ].join("\n");
    }


    emitCompositionDataExpr(card, className, sequencedRoot, indentBase = "                ", opts = {}) {
        const lines = [];
        const actionCtx = (opts && typeof opts === "object" && String(opts.angleOffsetExpr || "").trim())
            ? {
                angleOffsetExpr: String(opts.angleOffsetExpr || "").trim(),
                angleOffsetConfig: (opts.angleOffsetConfig && typeof opts.angleOffsetConfig === "object")
                    ? opts.angleOffsetConfig
                    : null
            }
            : null;
        if (sequencedRoot) {
            lines.push(`${indentBase}CompositionData().apply { order = orderCounter++ }`);
        } else {
            lines.push(`${indentBase}CompositionData()`);
        }
        lines.push(`${indentBase}    .setDisplayerSupplier {`);
        if (card.dataType === "single") {
            lines.push(`${indentBase}        ParticleDisplayer.withSingle(${sanitizeKotlinIdentifier(card.singleEffectClass || DEFAULT_EFFECT_CLASS, DEFAULT_EFFECT_CLASS)}(it))`);
        } else if (card.dataType === "particle_shape") {
            lines.push(indentText(this.buildShapeDisplayerExpr(card, className, "particle_shape", actionCtx), `${indentBase}        `));
        } else {
            lines.push(indentText(this.buildShapeDisplayerExpr(card, className, "sequenced_shape", actionCtx), `${indentBase}        `));
        }
        lines.push(`${indentBase}    }`);

        if (card.dataType === "single") {
            lines.push(this.buildSingleDataChain(card, className, `${indentBase}    `));
        }
        return lines.join("\n");
    }

    buildSingleDataChain(card, className, indentBase = "                    ") {
        const lines = [];
        const normalizeParticleExpr = typeof normalizeParticleFloatAssignmentExpr === "function"
            ? normalizeParticleFloatAssignmentExpr
            : ((targetName, exprRaw) => String(exprRaw || "").trim());
        const rewriteStatus = typeof rewriteControllerStatusQualifier === "function"
            ? rewriteControllerStatusQualifier
            : ((exprRaw) => String(exprRaw || ""));
        if (Array.isArray(card.particleInit) && card.particleInit.length) {
            lines.push(`${indentBase}.addParticleInstanceInit {`);
            for (const it of card.particleInit) {
                const target = sanitizeKotlinIdentifier(it.target || "size", "size");
                let expr = rewriteClassQualifier(String(it.expr || "").trim(), className);
                expr = normalizeParticleExpr(target, expr);
                if (!expr) continue;
                lines.push(`${indentBase}    ${target} = ${expr}`);
            }
            lines.push(`${indentBase}}`);
        }

        const normalizeController = typeof normalizeControllerAction === "function"
            ? normalizeControllerAction
            : ((raw) => Object.assign({ type: "tick_js", script: "" }, raw || {}));
        const hasTick = Array.isArray(card.controllerVars) && card.controllerVars.length;
        const actions = Array.isArray(card.controllerActions) ? card.controllerActions.map((it) => normalizeController(it)) : [];
        if (hasTick || actions.length) {
            lines.push(`${indentBase}.addParticleControlerInstanceInit {`);
            for (const v of (card.controllerVars || [])) {
                const vName = sanitizeKotlinIdentifier(v.name || "v", "v");
                const vType = sanitizeKotlinIdentifier(v.type || "Boolean", "Boolean");
                let expr = rewriteClassQualifier(String(v.expr || "").trim(), className);
                expr = rewriteStatus(expr, className);
                if (!expr) expr = defaultLiteralForKotlinType(vType);
                lines.push(`${indentBase}    var ${vName}: ${vType} = ${expr}`);
            }
            for (const action of actions) {
                const script = rewriteClassQualifier(String(action.script || "").trim(), className);
                const patched = rewriteStatus(script, className);
                if (!patched) continue;
                lines.push(`${indentBase}    addPreTickAction {`);
                lines.push(translateJsBlockToKotlin(patched, `${indentBase}        `));
                lines.push(`${indentBase}    }`);
            }
            lines.push(`${indentBase}}`);
        }
        return lines.join("\n");
    }

    createShapeDataLambdaContext(depth = 0, sequenced = false, parentCtx = null) {
        const d = Math.max(0, int(depth));
        return {
            depth: d,
            relName: `shapeRel${d}`,
            orderName: sequenced ? `shapeOrder${d}` : "",
            parent: parentCtx && typeof parentCtx === "object" ? parentCtx : null
        };
    }

    formatShapeDataLambdaParams(ctx) {
        if (!ctx) return "shapeRel0";
        if (ctx.orderName) return `${ctx.relName}, ${ctx.orderName}`;
        return ctx.relName;
    }

    emitShapeCompositionDataBase(ctx, indent = "            ") {
        if (ctx?.orderName) return `${indent}CompositionData().apply { order = ${ctx.orderName} }`;
        return `${indent}CompositionData()`;
    }

    buildShapeDisplayerExpr(card, className, type = "particle_shape", actionCtx = null) {
        const isSequenced = type === "sequenced_shape";
        const cls = isSequenced ? "SequencedParticleShapeComposition" : "ParticleShapeComposition";
        const applyFn = "applyPoint";
        const childType = ["single", "particle_shape", "sequenced_shape"].includes(String(card.shapeChildType || "")) ? String(card.shapeChildType) : "single";
        const axisExpr = rewriteClassQualifier(String(card.shapeAxisExpr || card.shapeAxisPreset || "RelativeLocation.yAxis()"), className);
        const scale = normalizeScaleHelperConfig(card.shapeScale, { type: "none" });
        const shapeBindMode = card.shapeBindMode === "builder" ? "builder" : "point";
        const shapePointExpr = relExpr(card.shapePoint?.x, card.shapePoint?.y, card.shapePoint?.z);
        const shapeBuilderExpr = this.emitBuilderExprFromState(card.shapeBuilderState);
        const rootCtx = this.createShapeDataLambdaContext(0, isSequenced, null);
        const rootScopeInfo = this.getShapeScopeInfoByRuntimeLevel(card, 0);
        const rootShapeLevel = this.getRootShapeChildLevel(card);
        const rootChildOffsetCfg = this.resolveShapeLevelAngleOffsetConfig(rootShapeLevel, className);
        const rootChildActionCtx = rootChildOffsetCfg
            ? {
                angleOffsetExpr: "finalAngle",
                angleOffsetConfig: rootChildOffsetCfg
            }
            : null;
        const childDisplayerExpr = this.buildShapeChildDisplayerExpr(card, className, rootCtx, rootChildActionCtx);
        const dataLambdaHead = this.formatShapeDataLambdaParams(rootCtx);
        const emitChildSourceBinding = (callIndent = "        ") => {
            const out = [];
            if (shapeBindMode === "builder") {
                out.push(`${callIndent}applyBuilder(`);
                out.push(indentText(shapeBuilderExpr, `${callIndent}    `));
                out.push(`${callIndent}) { ${dataLambdaHead} ->`);
            } else {
                out.push(`${callIndent}${applyFn}(${shapePointExpr}) { ${dataLambdaHead} ->`);
            }
            out.push(this.emitShapeCompositionDataBase(rootCtx, `${callIndent}    `));
            out.push(`${callIndent}        .setDisplayerSupplier {`);
            out.push(indentText(childDisplayerExpr, `${callIndent}            `));
            out.push(`${callIndent}        }`);
            if (childType === "single") {
                const singleChain = this.buildSingleDataChain(card, className, `${callIndent}        `);
                if (singleChain) out.push(singleChain);
            }
            out.push(`${callIndent}}`);
            return out;
        };
        const lines = [];
        lines.push("ParticleDisplayer.withComposition(");
        lines.push(`    ${cls}(it).apply {`);
        if (axisExpr) lines.push(`        axis = ${axisExpr}`);
        if (scale.type === "bezier") {
            lines.push(
                `        loadScaleHelperBezierValue(${formatKotlinDoubleLiteral(scale.min)}, ${formatKotlinDoubleLiteral(scale.max)}, ${Math.max(1, int(scale.tick))}, ` +
                `RelativeLocation(${formatKotlinDoubleLiteral(scale.c1x)}, ${formatKotlinDoubleLiteral(scale.c1y)}, ${formatKotlinDoubleLiteral(scale.c1z)}), ` +
                `RelativeLocation(${formatKotlinDoubleLiteral(scale.c2x)}, ${formatKotlinDoubleLiteral(scale.c2y)}, ${formatKotlinDoubleLiteral(scale.c2z)}))`
            );
        } else if (scale.type === "linear") {
            lines.push(`        loadScaleValue(${formatKotlinDoubleLiteral(scale.min)}, ${formatKotlinDoubleLiteral(scale.max)}, ${Math.max(1, int(scale.tick))})`);
        }
        if (rootChildOffsetCfg) {
            lines.push(`        val angleOffsetCount = ${Math.max(1, int(rootChildOffsetCfg.count))}`);
            lines.push("        repeat(angleOffsetCount) { index ->");
            lines.push(`            val finalAngle = (${rootChildOffsetCfg.totalAngleExpr}) * index.toDouble() / angleOffsetCount.toDouble()`);
            lines.push(...emitChildSourceBinding("            "));
            lines.push("        }");
        } else {
            lines.push(...emitChildSourceBinding("        "));
        }
        lines.push(this.applyCardCompositionActions(card, className, "        ", type === "sequenced_shape", rootScopeInfo, actionCtx));
        lines.push("    }");
        lines.push(")");
        return lines.join("\n");
    }

    buildShapeChildDisplayerExpr(card, className, parentCtx = null, rootActionCtx = null) {
        const chain = this.getShapeChildChain(card);
        const baseDepth = parentCtx && Number.isFinite(Number(parentCtx.depth)) ? int(parentCtx.depth) + 1 : 0;
        const buildLevel = (levelIdx = 0, outerCtx = parentCtx, incomingActionCtx = null) => {
            const level = chain[levelIdx] ? normalizeShapeNestedLevel(chain[levelIdx], levelIdx) : normalizeShapeNestedLevel({});
            if (level.type === "single") {
                const fx = sanitizeKotlinIdentifier(level.effectClass || card.singleEffectClass || DEFAULT_EFFECT_CLASS, DEFAULT_EFFECT_CLASS);
                return `ParticleDisplayer.withSingle(${fx}(it))`;
            }
            const isSequenced = level.type === "sequenced_shape";
            const cls = isSequenced ? "SequencedParticleShapeComposition" : "ParticleShapeComposition";
            const applyFn = "applyPoint";
            const axisExpr = rewriteClassQualifier(String(level.axisExpr || level.axisPreset || "RelativeLocation.yAxis()"), className);
            const scale = normalizeScaleHelperConfig(level.scale, { type: "none" });
            const bindMode = level.bindMode === "builder" ? "builder" : "point";
            const pointExpr = relExpr(level.point?.x, level.point?.y, level.point?.z);
            const builderExpr = this.emitBuilderExprFromState(level.builderState);
            const depth = baseDepth + Math.max(0, int(levelIdx));
            const ctx = this.createShapeDataLambdaContext(depth, isSequenced, outerCtx);
            const dataLambdaHead = this.formatShapeDataLambdaParams(ctx);
            const nextLevel = chain[levelIdx + 1] ? normalizeShapeNestedLevel(chain[levelIdx + 1], levelIdx + 1) : normalizeShapeNestedLevel({});
            const nextOffsetCfg = this.resolveShapeLevelAngleOffsetConfig(nextLevel, className);
            const nextActionCtx = nextOffsetCfg
                ? {
                    angleOffsetExpr: "finalAngle",
                    angleOffsetConfig: nextOffsetCfg
                }
                : null;
            const nextDisplayerExpr = buildLevel(levelIdx + 1, ctx, nextActionCtx);
            const scopeInfo = this.getShapeScopeInfoByRuntimeLevel(card, levelIdx + 1);
            const pseudo = {
                id: card.id,
                shapeDisplayActions: level.displayActions || [],
                shapeScale: scale,
                growthAnimates: level.growthAnimates || []
            };
            const emitNextSourceBinding = (callIndent = "        ") => {
                const out = [];
                if (bindMode === "builder") {
                    out.push(`${callIndent}applyBuilder(`);
                    out.push(indentText(builderExpr, `${callIndent}    `));
                    out.push(`${callIndent}) { ${dataLambdaHead} ->`);
                } else {
                    out.push(`${callIndent}${applyFn}(${pointExpr}) { ${dataLambdaHead} ->`);
                }
                out.push(this.emitShapeCompositionDataBase(ctx, `${callIndent}    `));
                out.push(`${callIndent}        .setDisplayerSupplier {`);
                out.push(indentText(nextDisplayerExpr, `${callIndent}            `));
                out.push(`${callIndent}        }`);
                if (nextLevel.type === "single") {
                    const singleChain = this.buildSingleDataChain(card, className, `${callIndent}        `);
                    if (singleChain) out.push(singleChain);
                }
                out.push(`${callIndent}}`);
                return out;
            };
            const lines = [];
            lines.push("ParticleDisplayer.withComposition(");
            lines.push(`    ${cls}(it).apply {`);
            if (axisExpr) lines.push(`        axis = ${axisExpr}`);
            if (scale.type === "bezier") {
                lines.push(
                    `        loadScaleHelperBezierValue(${formatKotlinDoubleLiteral(scale.min)}, ${formatKotlinDoubleLiteral(scale.max)}, ${Math.max(1, int(scale.tick))}, ` +
                    `RelativeLocation(${formatKotlinDoubleLiteral(scale.c1x)}, ${formatKotlinDoubleLiteral(scale.c1y)}, ${formatKotlinDoubleLiteral(scale.c1z)}), ` +
                    `RelativeLocation(${formatKotlinDoubleLiteral(scale.c2x)}, ${formatKotlinDoubleLiteral(scale.c2y)}, ${formatKotlinDoubleLiteral(scale.c2z)}))`
                );
            } else if (scale.type === "linear") {
                lines.push(`        loadScaleValue(${formatKotlinDoubleLiteral(scale.min)}, ${formatKotlinDoubleLiteral(scale.max)}, ${Math.max(1, int(scale.tick))})`);
            }
            if (nextOffsetCfg) {
                lines.push(`        val angleOffsetCount = ${Math.max(1, int(nextOffsetCfg.count))}`);
                lines.push("        repeat(angleOffsetCount) { index ->");
                lines.push(`            val finalAngle = (${nextOffsetCfg.totalAngleExpr}) * index.toDouble() / angleOffsetCount.toDouble()`);
                lines.push(...emitNextSourceBinding("            "));
                lines.push("        }");
            } else {
                lines.push(...emitNextSourceBinding("        "));
            }
            const actions = this.applyCardCompositionActions(pseudo, className, "        ", level.type === "sequenced_shape", scopeInfo, incomingActionCtx);
            if (String(actions || "").trim()) lines.push(actions);
            lines.push("    }");
            lines.push(")");
            return lines.join("\n");
        };
        return buildLevel(0, parentCtx, rootActionCtx);
    }

    applyCardCompositionActions(card, className, innerIndent = "        ", supportsAnimate = false, scopeInfo = null, actionCtx = null) {
        const lines = [];
        const displayActions = Array.isArray(card.shapeDisplayActions) && card.shapeDisplayActions.length
            ? card.shapeDisplayActions.map((a) => normalizeDisplayAction(a))
            : [];
        const offsetAngleExpr = String(actionCtx?.angleOffsetExpr || "").trim();
        const offsetCfg = (actionCtx?.angleOffsetConfig && typeof actionCtx.angleOffsetConfig === "object")
            ? actionCtx.angleOffsetConfig
            : null;
        const useAngleOffsetAnimator = !!offsetAngleExpr && !!offsetCfg;
        const shapeScale = normalizeScaleHelperConfig(card.shapeScale, { type: "none" });
        const needReverseScale = shapeScale.type !== "none" && shapeScale.reversedOnDisable;
        const appendOffsetAnimator = (targetLines, callIndent = `${innerIndent}    `) => {
            if (!useAngleOffsetAnimator) return;
            const glowTick = Math.max(1, int(offsetCfg.glowTick || 20));
            const easeName = normalizeAngleOffsetEaseName(offsetCfg.easeName || "outCubic");
            const reverseOnDisable = offsetCfg.reverseOnDisable === true;
            const cls = sanitizeKotlinClassName(className);
            targetLines.push(`${callIndent}val animator = AngleAnimator(${glowTick}, ${offsetAngleExpr}, Eases.${easeName})`);
            targetLines.push(`${callIndent}animator.reset()`);
            targetLines.push(`${callIndent}val timeline = Timeline()`);
            targetLines.push(`${callIndent}    .step {`);
            targetLines.push(`${callIndent}        rotateAsAxis(animator.glowDelta())`);
            targetLines.push(`${callIndent}        animator.finished`);
            targetLines.push(`${callIndent}    }`);
            if (reverseOnDisable) {
                targetLines.push(`${callIndent}    .step {`);
                targetLines.push(`${callIndent}        if (!this@${cls}.status.isDisable()) return@step false`);
                targetLines.push(`${callIndent}        rotateAsAxis(animator.fadeDelta())`);
                targetLines.push(`${callIndent}        animator.finished`);
                targetLines.push(`${callIndent}    }`);
            }
            targetLines.push(`${callIndent}addPreTickAction {`);
            targetLines.push(`${callIndent}    timeline.doTick()`);
            targetLines.push(`${callIndent}}`);
        };
        if (displayActions.length) {
            for (let i = 0; i < displayActions.length; i++) {
                const act = displayActions[i];
                const toExpr = rewriteClassQualifier(String(act.toExpr || act.toPreset || "RelativeLocation.yAxis()"), className);
                const angleExpr = act.angleMode === "expr"
                    ? rewriteClassQualifier(String(act.angleExpr || "0.0"), className)
                    : U.angleToKotlinRadExpr(num(act.angleValue), normalizeAngleUnit(act.angleUnit));
                const blockLines = [];
                if (useAngleOffsetAnimator && i === 0) appendOffsetAnimator(blockLines);
                const usePreTickWrapper = act.type === "expression"
                    || ((act.type === "rotateAsAxis" || act.type === "rotateToWithAngle") && act.angleMode === "expr");
                if (act.type === "rotateToPoint") {
                    blockLines.push(`${innerIndent}    rotateToPoint(${toExpr})`);
                } else if (act.type === "rotateAsAxis") {
                    if (usePreTickWrapper) {
                        blockLines.push(`${innerIndent}    addPreTickAction {`);
                        blockLines.push(`${innerIndent}        rotateAsAxis(${angleExpr})`);
                        blockLines.push(`${innerIndent}    }`);
                    } else {
                        blockLines.push(`${innerIndent}    rotateAsAxis(${angleExpr})`);
                    }
                } else if (act.type === "rotateToWithAngle") {
                    if (usePreTickWrapper) {
                        blockLines.push(`${innerIndent}    addPreTickAction {`);
                        blockLines.push(`${innerIndent}        rotateToWithAngle(${toExpr}, ${angleExpr})`);
                        blockLines.push(`${innerIndent}    }`);
                    } else {
                        blockLines.push(`${innerIndent}    rotateToWithAngle(${toExpr}, ${angleExpr})`);
                    }
                } else if (act.type === "expression") {
                    const rawExpr = String(act.expression || "").trim();
                    const check = this.validateJsExpressionSource(rawExpr, { cardId: card.id, scope: scopeInfo || undefined });
                    const expr = rewriteClassQualifier(rawExpr, className);
                    if (expr && check.valid) {
                        blockLines.push(`${innerIndent}    addPreTickAction {`);
                        blockLines.push(translateJsBlockToKotlin(expr, `${innerIndent}        `));
                        blockLines.push(`${innerIndent}    }`);
                    }
                }
                if (needReverseScale && i === displayActions.length - 1) {
                    const cls = sanitizeKotlinClassName(className);
                    blockLines.push(`${innerIndent}    setReversedScaleOnCompositionStatus(this@${cls})`);
                }
                if (!blockLines.length) continue;
                lines.push(`${innerIndent}applyDisplayAction {`);
                lines.push(...blockLines);
                lines.push(`${innerIndent}}`);
            }
        } else if (useAngleOffsetAnimator || needReverseScale) {
            lines.push(`${innerIndent}applyDisplayAction {`);
            if (useAngleOffsetAnimator) appendOffsetAnimator(lines);
            if (needReverseScale) {
                const cls = sanitizeKotlinClassName(className);
                lines.push(`${innerIndent}    setReversedScaleOnCompositionStatus(this@${cls})`);
            }
            lines.push(`${innerIndent}}`);
        }
        if (supportsAnimate && card.growthAnimates?.length) {
            const arr = card.growthAnimates.map((a) => normalizeAnimate(a));
            if (arr.length) {
                lines.push(`${innerIndent}animate.addAnimate(${arr[0].count}) { ${rewriteClassQualifier(arr[0].condition, className)} }`);
                for (let i = 1; i < arr.length; i++) {
                    lines.push(`${innerIndent}    .addAnimate(${arr[i].count}) { ${rewriteClassQualifier(arr[i].condition, className)} }`);
                }
            }
        }
        return lines.join("\n");
    }

    buildOnDisplayMethod(className) {
        const actions = this.state.displayActions || [];
        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        const hasProjectScale = projectScale.type !== "none";
        const needReverseScale = hasProjectScale && projectScale.reversedOnDisable;
        if (!actions.length && !hasProjectScale) {
            return [
                "    override fun onDisplay() {",
                "    }"
            ].join("\n");
        }
        const lines = [];
        lines.push("    override fun onDisplay() {");
        lines.push("        addPreTickAction {");
        if (hasProjectScale) {
            if (needReverseScale) {
                lines.push("            if (status.isEnable()) {");
                lines.push("                scaleHelper.doScale()");
                lines.push("            } else {");
                lines.push("                scaleHelper.doScaleReversed()");
                lines.push("            }");
            } else {
                lines.push("            scaleHelper.doScale()");
            }
        }
        for (const raw of actions) {
            const act = normalizeDisplayAction(raw);
            const toExpr = rewriteClassQualifier(String(act.toExpr || act.toPreset || "RelativeLocation.yAxis()"), className);
            const angleExpr = act.angleMode === "expr"
                ? rewriteClassQualifier(String(act.angleExpr || "0.0"), className)
                : U.angleToKotlinRadExpr(num(act.angleValue), normalizeAngleUnit(act.angleUnit));
            if (act.type === "rotateToPoint") {
                lines.push(`            rotateToPoint(${toExpr})`);
            } else if (act.type === "rotateAsAxis") {
                lines.push(`            rotateAsAxis(${angleExpr})`);
            } else if (act.type === "rotateToWithAngle") {
                lines.push(`            rotateToWithAngle(${toExpr}, ${angleExpr})`);
            } else if (act.type === "expression") {
                const rawExpr = String(act.expression || "").trim();
                const check = this.validateJsExpressionSource(rawExpr, { cardId: "" });
                const expr = rewriteClassQualifier(rawExpr, className);
                if (expr && check.valid) lines.push(translateJsBlockToKotlin(expr, "            "));
            }
        }
        lines.push("        }");
        lines.push("    }");
        return lines.join("\n");
    }    }

    for (const key of Object.getOwnPropertyNames(KotlinCodegenMixin.prototype)) {
        if (key === "constructor") continue;
        CompositionBuilderApp.prototype[key] = KotlinCodegenMixin.prototype[key];
    }
}
