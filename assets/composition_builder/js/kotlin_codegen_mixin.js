export function installKotlinCodegenMethods(CompositionBuilderApp, deps = {}) {
    const {
        U,
        num,
        int,
        normalizeAnimate,
        normalizeControllerAction,
        normalizeDisplayAction,
        normalizeScaleHelperConfig,
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
        normalizeAngleOffsetEaseSpecialParams,
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
            "import cn.coostack.cooparticlesapi.extend.asRelative",
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
            let value = this.rewriteCodeExpr(rawValue || defaultLiteralForKotlinType(type), className);
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
            let value = this.rewriteCodeExpr(rawValue || defaultLiteralForKotlinType(type), className);
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
        const axisExpr = this.rewriteRelativeTargetExpr(
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
                lines.push(`        animate.addAnimate(${Math.max(1, int(first.count))}) { ${this.rewriteAnimateConditionExpr(first.condition || "true", className)} }`);
                for (let i = 1; i < animates.length; i++) {
                    const it = animates[i];
                    lines.push(`            .addAnimate(${Math.max(1, int(it.count))}) { ${this.rewriteAnimateConditionExpr(it.condition || "true", className)} }`);
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
        if (card.bindMode === "point") return this.emitCardPutPoint(card, className, sequencedRoot, cardIndex);
        return this.emitCardPutAll(card, className, sequencedRoot, cardIndex);
    }

    buildAngleOffsetEaseExpr(easeName, rawParams) {
        const ease = normalizeAngleOffsetEaseName(easeName || "outCubic");
        const params = normalizeAngleOffsetEaseSpecialParams(rawParams || {});
        if (ease === "outBack") {
            return `Eases.outBack(${formatKotlinDoubleLiteral(params.angleOffsetEaseOvershoot)})`;
        }
        if (ease === "outElastic") {
            const period = formatKotlinDoubleLiteral(params.angleOffsetEasePeriod);
            const decay = formatKotlinDoubleLiteral(params.angleOffsetEaseDecay);
            const shift = formatKotlinDoubleLiteral(params.angleOffsetEaseShift);
            return `Eases.outElastic(${period}, ${decay}, ${shift})`;
        }
        if (ease === "outBounce") {
            const n1 = formatKotlinDoubleLiteral(params.angleOffsetEaseN1);
            const d1 = formatKotlinDoubleLiteral(params.angleOffsetEaseD1);
            return `Eases.outBounce(${n1}, ${d1})`;
        }
        if (ease === "bezierEase") {
            const startX = formatKotlinDoubleLiteral(params.angleOffsetEaseBezierStartX);
            const startY = formatKotlinDoubleLiteral(params.angleOffsetEaseBezierStartY);
            const endX = formatKotlinDoubleLiteral(params.angleOffsetEaseBezierEndX);
            const endY = formatKotlinDoubleLiteral(params.angleOffsetEaseBezierEndY);
            return `Eases.bezierEase(RelativeLocation(${startX}, ${startY}, 0.0), RelativeLocation(${endX}, ${endY}, 0.0))`;
        }
        return `Eases.${ease}`;
    }

    resolveAngleOffsetConfig(raw, className) {
        if (!raw || raw.angleOffsetEnabled !== true) return null;
        const count = Math.max(1, int(raw.angleOffsetCount || 1));
        if (count <= 1) return null;
        const glowTick = Math.max(1, int(raw.angleOffsetGlowTick || 20));
        const easeName = normalizeAngleOffsetEaseName(raw.angleOffsetEase || "outCubic");
        const easeExpr = this.buildAngleOffsetEaseExpr(easeName, raw);
        const reverseOnDisable = raw.angleOffsetReverseOnDisable === true;
        const totalAngleRaw = raw.angleOffsetAngleMode === "expr"
            ? String(raw.angleOffsetAngleExpr || raw.angleOffsetAnglePreset || "PI * 2")
            : U.angleToKotlinRadExpr(num(raw.angleOffsetAngleValue || 0), normalizeAngleUnit(raw.angleOffsetAngleUnit || "deg"));
        const totalAngleExpr = this.rewriteCodeExpr(totalAngleRaw || "0.0", className) || "0.0";
        return { count, glowTick, easeName, easeExpr, reverseOnDisable, totalAngleExpr };
    }

    resolveCardAngleOffsetConfig(card, className) {
        if (!card || card.dataType === "single") return null;
        return this.resolveAngleOffsetConfig(card, className);
    }

    resolveShapeLevelAngleOffsetConfig(level, className) {
        if (!level) return null;
        return this.resolveAngleOffsetConfig(level, className);
    }

    normalizeVectorCtorNumericLiteral(rawArg, mode = "double") {
        const raw = String(rawArg || "").trim();
        if (!/^-?(?:\d+\.?\d*|\.\d+)(?:[fFdDlL])?$/.test(raw)) return raw;
        let core = raw;
        if (/[fFdDlL]$/.test(core)) core = core.slice(0, -1);
        if (!core) return raw;
        if (mode === "float") {
            if (!core.includes(".")) return `${core}F`;
            if (core.endsWith(".")) core = `${core}0`;
            return `${core}F`;
        }
        if (!core.includes(".")) return `${core}.0`;
        if (core.endsWith(".")) return `${core}0`;
        return core;
    }

    rewriteVectorCtorNumericLiterals(exprRaw) {
        const src = String(exprRaw || "");
        const rewrite = (ctor, a, b, c) => {
            const mode = ctor === "Vector3f" ? "float" : "double";
            const x = this.normalizeVectorCtorNumericLiteral(a, mode);
            const y = this.normalizeVectorCtorNumericLiteral(b, mode);
            const z = this.normalizeVectorCtorNumericLiteral(c, mode);
            return `${ctor}(${x}, ${y}, ${z})`;
        };
        let out = src.replace(
            /\bVector3f\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
            (m, a, b, c) => rewrite("Vector3f", a, b, c)
        );
        out = out.replace(
            /\bVec3\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
            (m, a, b, c) => rewrite("Vec3", a, b, c)
        );
        out = out.replace(
            /\bRelativeLocation\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/g,
            (m, a, b, c) => rewrite("RelativeLocation", a, b, c)
        );
        return out;
    }

    rewriteCodeExpr(exprRaw, className) {
        const qualified = rewriteClassQualifier(String(exprRaw || ""), className);
        return this.rewriteVectorCtorNumericLiterals(qualified);
    }

    rewriteAnimateConditionExpr(exprRaw, className) {
        return this.rewriteCodeExpr(exprRaw, className);
    }

    shouldAutoAsRelative(exprRaw, className) {
        const expr = String(exprRaw || "").trim();
        if (!expr || /\.asRelative\(\)\s*$/.test(expr)) return false;
        if (/^(Vec3|Vector3f)\s*\(/.test(expr)) return true;
        const cls = sanitizeKotlinClassName(className || "NewComposition");
        for (const v of (this.state.globalVars || [])) {
            const rawName = String(v?.name || "").trim();
            const name = sanitizeKotlinIdentifier(rawName, "");
            const type = String(v?.type || "").trim();
            if (!name || (type !== "Vec3" && type !== "Vector3f")) continue;
            if (expr === name || expr === `this@${cls}.${name}`) return true;
        }
        return false;
    }

    rewriteRelativeTargetExpr(exprRaw, className) {
        const expr = this.rewriteCodeExpr(exprRaw, className).trim();
        if (!expr) return "RelativeLocation.yAxis()";
        if (this.shouldAutoAsRelative(expr, className)) {
            if (/^(Vec3|Vector3f)\s*\(/.test(expr)) return `(${expr}).asRelative()`;
            return `${expr}.asRelative()`;
        }
        return expr;
    }

    emitCardPutAll(card, className, sequencedRoot, cardIndex = 0) {
        const builderExpr = this.emitBuilderExpr(card);
        const offsetCfg = this.resolveCardAngleOffsetConfig(card, className);
        if (offsetCfg) {
            const suffix = Math.max(0, int(cardIndex)) + 1;
            const countVar = `angleOffsetCount${suffix}`;
            const angleVar = `finalAngle${suffix}`;
            const countLiteral = formatKotlinDoubleLiteral(Math.max(1, int(offsetCfg.count)));
            const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                        ", {
                angleOffsetExpr: angleVar,
                angleOffsetConfig: offsetCfg
            });
            return [
                `        val ${countVar} = ${Math.max(1, int(offsetCfg.count))}`,
                `        repeat(${countVar}) { index ->`,
                `            val ${angleVar} = (${offsetCfg.totalAngleExpr}) * (index / ${countLiteral})`,
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

    emitCardPutPoint(card, className, sequencedRoot, cardIndex = 0) {
        const rel = relExpr(card.point?.x, card.point?.y, card.point?.z);
        const offsetCfg = this.resolveCardAngleOffsetConfig(card, className);
        if (offsetCfg) {
            const suffix = Math.max(0, int(cardIndex)) + 1;
            const countVar = `angleOffsetCount${suffix}`;
            const angleVar = `finalAngle${suffix}`;
            const countLiteral = formatKotlinDoubleLiteral(Math.max(1, int(offsetCfg.count)));
            const dataExpr = this.emitCompositionDataExpr(card, className, sequencedRoot, "                    ", {
                angleOffsetExpr: angleVar,
                angleOffsetConfig: offsetCfg
            });
            return [
                `        val ${countVar} = ${Math.max(1, int(offsetCfg.count))}`,
                `        repeat(${countVar}) { index ->`,
                `            val ${angleVar} = (${offsetCfg.totalAngleExpr}) * (index / ${countLiteral})`,
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
                let expr = this.rewriteCodeExpr(String(it.expr || "").trim(), className);
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
                let expr = this.rewriteCodeExpr(String(v.expr || "").trim(), className);
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
        const axisExpr = this.rewriteRelativeTargetExpr(String(card.shapeAxisExpr || card.shapeAxisPreset || "RelativeLocation.yAxis()"), className);
        const scale = normalizeScaleHelperConfig(card.shapeScale, { type: "none" });
        const rootCtx = this.createShapeDataLambdaContext(0, isSequenced, null);
        const rootScopeInfo = this.getShapeScopeInfoByRuntimeLevel(card, 0);
        const lines = [];
        lines.push("ParticleDisplayer.withComposition(");
        lines.push(`    ${cls}(it).apply {`);
        if (axisExpr) lines.push(`        axis = ${axisExpr}`);
        this._emitScaleHelperCodegen(lines, scale, "        ");
        const children = card.shapeChildren || [];
        for (const child of children) {
            this._emitTreeNodeApplyBlockCodegen(lines, child, card, className, rootCtx, "        ", actionCtx);
        }
        lines.push(this.applyCardCompositionActions(card, className, "        ", isSequenced, rootScopeInfo, actionCtx));
        lines.push("    }");
        lines.push(")");
        return lines.join("\n");
    }

    _emitScaleHelperCodegen(lines, scale, indent) {
        if (scale.type === "bezier") {
            lines.push(
                `${indent}loadScaleHelperBezierValue(${formatKotlinDoubleLiteral(scale.min)}, ${formatKotlinDoubleLiteral(scale.max)}, ${Math.max(1, int(scale.tick))}, ` +
                `RelativeLocation(${formatKotlinDoubleLiteral(scale.c1x)}, ${formatKotlinDoubleLiteral(scale.c1y)}, ${formatKotlinDoubleLiteral(scale.c1z)}), ` +
                `RelativeLocation(${formatKotlinDoubleLiteral(scale.c2x)}, ${formatKotlinDoubleLiteral(scale.c2y)}, ${formatKotlinDoubleLiteral(scale.c2z)}))`
            );
        } else if (scale.type === "linear") {
            lines.push(`${indent}loadScaleValue(${formatKotlinDoubleLiteral(scale.min)}, ${formatKotlinDoubleLiteral(scale.max)}, ${Math.max(1, int(scale.tick))})`);
        }
    }

    _emitTreeNodeApplyBlockCodegen(lines, node, card, className, parentCtx, indent, actionCtx) {
        if (!node) return;
        const nodeType = node.type || "single";
        const bindMode = node.bindMode === "builder" ? "builder" : "point";
        const pointExpr = relExpr(node.point?.x, node.point?.y, node.point?.z);
        const builderExpr = this.emitBuilderExprFromState(node.builderState);
        const isSequenced = nodeType === "sequenced_shape";
        const depth = parentCtx ? int(parentCtx.depth) + 1 : 1;
        const ctx = this.createShapeDataLambdaContext(depth, isSequenced, parentCtx);
        const dataLambdaHead = this.formatShapeDataLambdaParams(ctx);
        const offsetCfg = this.resolveShapeLevelAngleOffsetConfig(node, className);
        if (offsetCfg) {
            const angleOffsetCount = Math.max(1, int(offsetCfg.count));
            const angleOffsetCountLiteral = formatKotlinDoubleLiteral(angleOffsetCount);
            lines.push(`${indent}repeat(${angleOffsetCount}) { index ->`);
            lines.push(`${indent}    val finalAngle = (${offsetCfg.totalAngleExpr}) * (index / ${angleOffsetCountLiteral})`);
            const innerActionCtx = { angleOffsetExpr: "finalAngle", angleOffsetConfig: offsetCfg };
            if (nodeType === "single") {
                this._emitTreeNodeSingleApplyCodegen(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, `${indent}    `, innerActionCtx);
            } else {
                this._emitTreeNodeShapeApplyCodegen(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, `${indent}    `, isSequenced, depth, innerActionCtx);
            }
            lines.push(`${indent}}`);
        } else if (nodeType === "single") {
            this._emitTreeNodeSingleApplyCodegen(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, indent, actionCtx);
        } else {
            this._emitTreeNodeShapeApplyCodegen(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, indent, isSequenced, depth, actionCtx);
        }
    }

    _emitTreeNodeSingleApplyCodegen(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, indent, actionCtx) {
        const fx = sanitizeKotlinIdentifier(node.effectClass || card.singleEffectClass || DEFAULT_EFFECT_CLASS, DEFAULT_EFFECT_CLASS);
        const scale = normalizeScaleHelperConfig(node.scale, { type: "none" });
        if (bindMode === "builder") {
            lines.push(`${indent}applyBuilder(`);
            lines.push(indentText(builderExpr, `${indent}    `));
            lines.push(`${indent}) { ${dataLambdaHead} ->`);
        } else {
            lines.push(`${indent}applyPoint(${pointExpr}) { ${dataLambdaHead} ->`);
        }
        lines.push(this.emitShapeCompositionDataBase(ctx, `${indent}    `));
        this._emitScaleHelperCodegen(lines, scale, `${indent}        `);
        lines.push(`${indent}        .setDisplayerSupplier {`);
        lines.push(`${indent}            ParticleDisplayer.withSingle(${fx}(it))`);
        lines.push(`${indent}        }`);
        const singlePseudo = {
            id: card.id,
            shapeDisplayActions: node.displayActions || [],
            shapeScale: scale,
            growthAnimates: []
        };
        const scopeInfo = this.getShapeScopeInfoByRuntimeLevel(card, int(ctx?.depth || 1));
        const singleActions = this.applyCardCompositionActions(singlePseudo, className, `${indent}        `, false, scopeInfo, actionCtx);
        if (String(singleActions || "").trim()) lines.push(singleActions);
        const singleChain = this._buildTreeNodeSingleDataChainCodegen(node, card, className, `${indent}        `);
        if (singleChain) lines.push(singleChain);
        lines.push(`${indent}}`);
    }

    _emitTreeNodeShapeApplyCodegen(lines, node, card, className, ctx, bindMode, pointExpr, builderExpr, dataLambdaHead, indent, isSequenced, depth, actionCtx) {
        const cls = isSequenced ? "SequencedParticleShapeComposition" : "ParticleShapeComposition";
        const axisExpr = this.rewriteRelativeTargetExpr(String(node.axisExpr || node.axisPreset || "RelativeLocation.yAxis()"), className);
        const scale = normalizeScaleHelperConfig(node.scale, { type: "none" });
        if (bindMode === "builder") {
            lines.push(`${indent}applyBuilder(`);
            lines.push(indentText(builderExpr, `${indent}    `));
            lines.push(`${indent}) { ${dataLambdaHead} ->`);
        } else {
            lines.push(`${indent}applyPoint(${pointExpr}) { ${dataLambdaHead} ->`);
        }
        lines.push(this.emitShapeCompositionDataBase(ctx, `${indent}    `));
        lines.push(`${indent}        .setDisplayerSupplier {`);
        lines.push(`${indent}            ParticleDisplayer.withComposition(`);
        lines.push(`${indent}                ${cls}(it).apply {`);
        if (axisExpr) lines.push(`${indent}                    axis = ${axisExpr}`);
        this._emitScaleHelperCodegen(lines, scale, `${indent}                    `);
        const children = node.children || [];
        for (const child of children) {
            this._emitTreeNodeApplyBlockCodegen(lines, child, card, className, ctx, `${indent}                    `, actionCtx);
        }
        const pseudo = { id: card.id, shapeDisplayActions: node.displayActions || [], shapeScale: scale, growthAnimates: node.growthAnimates || [] };
        const scopeInfo = this.getShapeScopeInfoByRuntimeLevel(card, depth);
        const actions = this.applyCardCompositionActions(pseudo, className, `${indent}                    `, isSequenced, scopeInfo, actionCtx);
        if (String(actions || "").trim()) lines.push(actions);
        lines.push(`${indent}                }`);
        lines.push(`${indent}            )`);
        lines.push(`${indent}        }`);
        lines.push(`${indent}}`);
    }

    _buildTreeNodeSingleDataChainCodegen(node, card, className, indentBase) {
        const lines = [];
        const pinitList = Array.isArray(node.particleInit) ? node.particleInit : [];
        if (pinitList.length) {
            lines.push(`${indentBase}.addParticleInstanceInit {`);
            for (const it of pinitList) {
                const target = sanitizeKotlinIdentifier(it.target || "size", "size");
                const expr = rewriteClassQualifier(String(it.expr || "0.0"), className);
                lines.push(`${indentBase}    ${target} = ${expr}`);
            }
            lines.push(`${indentBase}}`);
        }
        const cvars = Array.isArray(node.controllerVars) ? node.controllerVars : [];
        const cactions = Array.isArray(node.controllerActions) ? node.controllerActions : [];
        if (cvars.length || cactions.length) {
            lines.push(`${indentBase}.addController {`);
            for (const v of cvars) {
                const vName = sanitizeKotlinIdentifier(v.name || "v", "v");
                const vType = v.type || "Double";
                const vExpr = rewriteClassQualifier(String(v.expr || "0.0"), className);
                lines.push(`${indentBase}    var ${vName}: ${vType} = ${vExpr}`);
            }
            for (const a of cactions) {
                const na = normalizeControllerAction(a);
                const aExpr = rewriteClassQualifier(String(na.expr || ""), className);
                if (aExpr.trim()) lines.push(`${indentBase}    ${aExpr}`);
            }
            lines.push(`${indentBase}}`);
        }
        return lines.length ? lines.join("\n") : null;
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
            const easeExpr = String(offsetCfg.easeExpr || this.buildAngleOffsetEaseExpr(offsetCfg.easeName || "outCubic", offsetCfg));
            const reverseOnDisable = offsetCfg.reverseOnDisable === true;
            const cls = sanitizeKotlinClassName(className);
            targetLines.push(`${callIndent}val animator = AngleAnimator(${glowTick}, ${offsetAngleExpr}, ${easeExpr})`);
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
        if (displayActions.length || useAngleOffsetAnimator || needReverseScale) {
            const blockLines = [];
            if (useAngleOffsetAnimator) appendOffsetAnimator(blockLines);
            for (let i = 0; i < displayActions.length; i++) {
                const act = displayActions[i];
                const toExpr = this.rewriteRelativeTargetExpr(String(act.toExpr || act.toPreset || "RelativeLocation.yAxis()"), className);
                const angleExpr = act.angleMode === "expr"
                    ? this.rewriteCodeExpr(String(act.angleExpr || "0.0"), className)
                    : U.angleToKotlinRadExpr(num(act.angleValue), normalizeAngleUnit(act.angleUnit));
                if (act.type === "rotateToPoint") {
                    blockLines.push(`${innerIndent}    addPreTickAction {`);
                    blockLines.push(`${innerIndent}        rotateToPoint(${toExpr})`);
                    blockLines.push(`${innerIndent}    }`);
                } else if (act.type === "rotateAsAxis") {
                    blockLines.push(`${innerIndent}    addPreTickAction {`);
                    blockLines.push(`${innerIndent}        rotateAsAxis(${angleExpr})`);
                    blockLines.push(`${innerIndent}    }`);
                } else if (act.type === "rotateToWithAngle") {
                    blockLines.push(`${innerIndent}    addPreTickAction {`);
                    blockLines.push(`${innerIndent}        rotateToWithAngle(${toExpr}, ${angleExpr})`);
                    blockLines.push(`${innerIndent}    }`);
                } else if (act.type === "expression") {
                    const rawExpr = String(act.expression || "").trim();
                    const check = this.validateJsExpressionSource(rawExpr, { cardId: card.id, scope: scopeInfo || undefined });
                    const expr = this.rewriteCodeExpr(rawExpr, className);
                    if (expr && check.valid) {
                        blockLines.push(`${innerIndent}    addPreTickAction {`);
                        blockLines.push(translateJsBlockToKotlin(expr, `${innerIndent}        `));
                        blockLines.push(`${innerIndent}    }`);
                    }
                }
            }
            if (needReverseScale) {
                const cls = sanitizeKotlinClassName(className);
                blockLines.push(`${innerIndent}    setReversedScaleOnCompositionStatus(this@${cls})`);
            }
            if (blockLines.length) {
                lines.push(`${innerIndent}applyDisplayAction {`);
                lines.push(...blockLines);
                lines.push(`${innerIndent}}`);
            }
        }
        if (supportsAnimate && card.growthAnimates?.length) {
            const arr = card.growthAnimates.map((a) => normalizeAnimate(a));
            if (arr.length) {
                lines.push(`${innerIndent}animate.addAnimate(${arr[0].count}) { ${this.rewriteAnimateConditionExpr(arr[0].condition || "true", className)} }`);
                for (let i = 1; i < arr.length; i++) {
                    lines.push(`${innerIndent}    .addAnimate(${arr[i].count}) { ${this.rewriteAnimateConditionExpr(arr[i].condition || "true", className)} }`);
                }
            }
        }
        return lines.join("\n");
    }

    buildOnDisplayMethod(className) {
        const actions = this.state.displayActions || [];
        const projectScale = normalizeScaleHelperConfig(this.state.projectScale, { type: "none" });
        const hasProjectScaleHelper = projectScale.type !== "none";
        const projectScaleAuto = hasProjectScaleHelper && projectScale.runMode !== "manual";
        const needReverseScale = projectScaleAuto && projectScale.reversedOnDisable;
        if (!actions.length && !projectScaleAuto) {
            return [
                "    override fun onDisplay() {",
                "    }"
            ].join("\n");
        }
        const lines = [];
        lines.push("    override fun onDisplay() {");
        lines.push("        addPreTickAction {");
        if (projectScaleAuto) {
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
            const toExpr = this.rewriteRelativeTargetExpr(String(act.toExpr || act.toPreset || "RelativeLocation.yAxis()"), className);
            const angleExpr = act.angleMode === "expr"
                ? this.rewriteCodeExpr(String(act.angleExpr || "0.0"), className)
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
                const expr = this.rewriteCodeExpr(rawExpr, className);
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
