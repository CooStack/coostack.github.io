import * as THREE from "three";
import { computeAngleAnimatorAngle } from "./preview_angle_animator.js";

export function installPreviewRuntimeMethods(CompositionBuilderApp, deps = {}) {
    const {
        U,
        num,
        int,
        clamp,
        normalizeAnimate,
        normalizeControllerAction,
        normalizeDisplayAction,
        normalizeScaleHelperConfig,
        normalizeShapeNestedLevel,
        ensureStatusHelperMethods,
        stripJsForLint,
        transpileKotlinThisQualifierToJs,
        rotatePointsToPointUpright,
        srgbRgbToLinearArray,
        CONTROLLER_SCOPE_RESERVED,
        normalizeAngleUnit,
        normalizeAngleOffsetEaseName
    } = deps;

    if (!CompositionBuilderApp || !CompositionBuilderApp.prototype) {
        throw new Error("installPreviewRuntimeMethods requires CompositionBuilderApp");
    }
    if (!U) throw new Error("installPreviewRuntimeMethods requires Utils dependency");

    class PreviewRuntimeMixin {
    rebuildPreview() {
        this.previewCycleCache = null;
        this.previewExprCountCache.clear();
        this.previewExprPrefixCache.clear();
        this.previewCondFnCache.clear();
        this.previewNumericFnCache.clear();
        this.previewControllerFnCache.clear();
        if (this.previewFoldSimpleActionCache && typeof this.previewFoldSimpleActionCache.clear === "function") {
            this.previewFoldSimpleActionCache.clear();
        }
        this.previewRuntimeGlobals = null;
        this.previewRuntimeAppliedTick = -1;
        this.compilePreviewScriptsFromState({ force: false });
        const points = [];
        const owners = [];
        const birthOffsets = [];
        const ownerLocalIndex = [];
        const ownerPointCount = [];
        const anchorBases = [];
        const localBases = [];
        const anchorRefs = [];
        const localRefs = [];
        const levelBases = [];
        const levelRefs = [];
        const levelOffsetRefs = [];
        const useLocalOpsList = [];
        const rootOffsetIndexList = [];
        const rootVirtualIndexList = [];
        const getRootRepeatCount = (card) => {
            if (!card || card.dataType === "single") return 1;
            const cfg = this.resolvePreviewAngleOffsetConfig(card);
            return cfg ? Math.max(1, int(cfg.count || 1)) : 1;
        };
        const rootVirtualStarts = new Map();
        let rootVirtualTotal = 0;
        for (const card of (Array.isArray(this.state.cards) ? this.state.cards : [])) {
            const repeatCount = getRootRepeatCount(card);
            rootVirtualStarts.set(card.id, rootVirtualTotal);
            rootVirtualTotal += repeatCount;
        }
        if (rootVirtualTotal <= 0) rootVirtualTotal = Math.max(1, this.state.cards.length || 1);
        const appendFlatPoints = (card, pointList) => {
            const src = Array.isArray(pointList) ? pointList : [];
            const len = Math.max(1, src.length);
            const rootStart = int(rootVirtualStarts.get(card?.id) || 0);
            for (let idx = 0; idx < src.length; idx++) {
                const p = src[idx];
                const v = U.v(num(p?.x), num(p?.y), num(p?.z));
                points.push(v);
                owners.push(card.id);
                birthOffsets.push(0);
                ownerLocalIndex.push(idx);
                ownerPointCount.push(len);
                anchorBases.push(v);
                localBases.push(U.v(0, 0, 0));
                anchorRefs.push(idx);
                localRefs.push(0);
                levelBases.push([]);
                levelRefs.push([]);
                levelOffsetRefs.push([]);
                useLocalOpsList.push(false);
                rootOffsetIndexList.push(0);
                rootVirtualIndexList.push(rootStart);
            }
        };
        const appendShapePoints = (card, anchors, locals) => {
            const anchorList = Array.isArray(anchors) ? anchors : [];
            const localList = Array.isArray(locals) ? locals : [];
            if (!anchorList.length || !localList.length) return;
            const rootOffsetCfg = this.resolvePreviewAngleOffsetConfig(card);
            const repeatCount = rootOffsetCfg ? Math.max(1, int(rootOffsetCfg.count || 1)) : 1;
            const rootStart = int(rootVirtualStarts.get(card?.id) || 0);
            const clonePointCount = Math.max(1, anchorList.length * localList.length);
            for (let ai = 0; ai < anchorList.length; ai++) {
                const a = U.v(num(anchorList[ai]?.x), num(anchorList[ai]?.y), num(anchorList[ai]?.z));
                for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex++) {
                    for (let li = 0; li < localList.length; li++) {
                        const tuple = localList[li] || {};
                        const tupleSum = tuple.sum || tuple.local || tuple;
                        const l = U.v(num(tupleSum?.x), num(tupleSum?.y), num(tupleSum?.z));
                        const tupleLevels = Array.isArray(tuple.levels) ? tuple.levels : [];
                        points.push(U.v(a.x + l.x, a.y + l.y, a.z + l.z));
                        owners.push(card.id);
                        birthOffsets.push(0);
                        ownerLocalIndex.push(ai * localList.length + li);
                        ownerPointCount.push(clonePointCount);
                        anchorBases.push(a);
                        localBases.push(l);
                        anchorRefs.push(ai);
                        localRefs.push(li + repeatIndex * localList.length);
                        levelBases.push(tupleLevels.map((it) => U.v(num(it?.vec?.x), num(it?.vec?.y), num(it?.vec?.z))));
                        levelRefs.push(tupleLevels.map((it) => int(it?.ref || 0)));
                        levelOffsetRefs.push(tupleLevels.map((it) => int(it?.offsetIndex ?? 0)));
                        useLocalOpsList.push(true);
                        rootOffsetIndexList.push(repeatIndex);
                        rootVirtualIndexList.push(rootStart + repeatIndex);
                    }
                }
            }
        };
        for (const card of this.state.cards) {
            const basePoints = [];
            if (card.bindMode === "point") {
                basePoints.push(U.v(card.point.x, card.point.y, card.point.z));
            } else {
                const built = this.evaluateBuilderPoints(card.builderState);
                for (const p of (built.points || [])) {
                    basePoints.push(U.v(p.x, p.y, p.z));
                }
            }

            if (card.dataType !== "single" && basePoints.length) {
                const locals = this.buildShapeLocalTuplesForPreview(card);
                if (locals.length) {
                    appendShapePoints(card, basePoints, locals);
                }
                continue;
            }

            if (basePoints.length) {
                appendFlatPoints(card, basePoints);
            }
        }
        this.previewBasePoints = points.map((p) => U.clone(p));
        this.previewPoints = points.map((p) => U.clone(p));
        this.previewOwners = owners;
        this.previewBirthOffsets = birthOffsets;
        this.previewOwnerLocalIndex = ownerLocalIndex;
        this.previewOwnerPointCount = ownerPointCount;
        this.previewAnchorBase = anchorBases;
        this.previewLocalBase = localBases;
        this.previewAnchorRef = anchorRefs;
        this.previewLocalRef = localRefs;
        this.previewLevelBases = levelBases;
        this.previewLevelRefs = levelRefs;
        this.previewLevelOffsetRefs = levelOffsetRefs;
        this.previewUseLocalOps = useLocalOpsList;
        this.previewRootOffsetIndex = rootOffsetIndexList;
        this.previewRootVirtualIndex = rootVirtualIndexList;
        this.previewRootVirtualTotal = rootVirtualTotal;
        this.rebuildPreviewRuntimeIndex();
        this.previewAnimStart = performance.now();
        this.updatePreviewGeometry(points, owners);
    }

    rebuildPreviewRuntimeIndex() {
        const cards = Array.isArray(this.state.cards) ? this.state.cards : [];
        const cardById = new Map();
        const cardIndexById = new Map();
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            if (!card || !card.id) continue;
            cardById.set(card.id, card);
            cardIndexById.set(card.id, i);
        }
        this.previewCardById = cardById;
        this.previewCardIndexById = cardIndexById;
        this.previewCardVisualAgeDependentCache = new Map();

        const count = Math.max(0, int(this.previewBasePoints?.length || 0));
        const pointGroupIndex = new Int32Array(count);
        pointGroupIndex.fill(-1);
        const groupOwner = [];
        const groupOwnerCount = [];
        const groupBirthOffset = [];
        const groupRootVirtualIndex = [];
        const groupCard = [];
        const groupCardIndex = [];
        const groupByOwnerKey = new Map();

        for (let i = 0; i < count; i++) {
            const owner = this.previewOwners?.[i];
            let byKey = groupByOwnerKey.get(owner);
            if (!byKey) {
                byKey = new Map();
                groupByOwnerKey.set(owner, byKey);
            }
            const birthKey = int(num(this.previewBirthOffsets?.[i] || 0) * 1000);
            const birthOffset = birthKey / 1000;
            const rootVirtualIndex = int(
                this.previewRootVirtualIndex?.[i]
                ?? cardIndexById.get(owner)
                ?? 0
            );
            const key = `${birthKey}:${rootVirtualIndex}`;
            let groupId = byKey.get(key);
            if (groupId === undefined) {
                groupId = groupOwner.length;
                byKey.set(key, groupId);
                groupOwner.push(owner);
                groupOwnerCount.push(Math.max(1, int(this.previewOwnerPointCount?.[i] || 1)));
                groupBirthOffset.push(birthOffset);
                groupRootVirtualIndex.push(rootVirtualIndex);
                const card = cardById.get(owner) || null;
                groupCard.push(card);
                groupCardIndex.push(Number.isFinite(Number(cardIndexById.get(owner))) ? int(cardIndexById.get(owner)) : -1);
            }
            pointGroupIndex[i] = groupId;
        }

        this.previewPointGroupIndex = pointGroupIndex;
        this.previewGroupOwner = groupOwner;
        this.previewGroupOwnerCount = groupOwnerCount;
        this.previewGroupBirthOffset = groupBirthOffset;
        this.previewGroupRootVirtualIndex = groupRootVirtualIndex;
        this.previewGroupCard = groupCard;
        this.previewGroupCardIndex = groupCardIndex;

        const groupCount = groupOwner.length;
        this.previewFrameGroupRuntimeCache = new Array(groupCount);
        this.previewFrameAnchorCache = new Array(groupCount);
        this.previewFrameLocalCache = new Array(groupCount);
        this.previewFrameGroupVisualCache = new Array(groupCount);
        this.previewFrameGroupPointVisualCache = new Array(groupCount);
    }

    makePreviewDisplayActionCompileKey(scope = "display", cardId = "", scopeLevel = -1, actionIndex = 0) {
        const s = String(scope || "display");
        const cid = String(cardId || "");
        const lv = Number.isFinite(Number(scopeLevel)) ? int(scopeLevel) : -1;
        const idx = Math.max(0, int(actionIndex || 0));
        return `display|${s}|${cid}|${lv}|${idx}`;
    }

    makePreviewControllerScriptCompileKey(cardId = "", actionIndex = 0) {
        const cid = String(cardId || "");
        const idx = Math.max(0, int(actionIndex || 0));
        return `controller|${cid}|${idx}`;
    }

    ensurePreviewCompiledScriptStores() {
        if (!(this.previewCompiledScriptStateMap instanceof Map)) {
            this.previewCompiledScriptStateMap = new Map();
        }
    }

    getPreviewCompiledScriptState(key) {
        this.ensurePreviewCompiledScriptStores();
        return this.previewCompiledScriptStateMap.get(String(key || "")) || null;
    }

    markPreviewCompiledScriptFailure(key, sourceRaw, message = "compile failed") {
        const compileKey = String(key || "");
        if (!compileKey) return { ok: false, usedFallback: false, message: String(message || "") };
        this.ensurePreviewCompiledScriptStores();
        const src = transpileKotlinThisQualifierToJs(String(sourceRaw || "").trim());
        let state = this.previewCompiledScriptStateMap.get(compileKey);
        if (!state) {
            state = {
                compiledSource: "",
                fn: null,
                lastAttemptSource: "",
                lastAttemptOk: true,
                lastError: ""
            };
            this.previewCompiledScriptStateMap.set(compileKey, state);
        }
        state.lastAttemptSource = src;
        state.lastAttemptOk = false;
        state.lastError = String(message || "compile failed");
        const usedFallback = typeof state.fn === "function" && String(state.compiledSource || "") !== src;
        return { ok: false, usedFallback, message: state.lastError };
    }

    compilePreviewCompiledScriptInternal(key, sourceRaw, kind = "display_expression", opts = {}) {
        const compileKey = String(key || "");
        if (!compileKey) return { ok: false, usedFallback: false, message: "missing compile key" };
        const src = transpileKotlinThisQualifierToJs(String(sourceRaw || "").trim());
        const force = opts.force === true;
        this.ensurePreviewCompiledScriptStores();
        let state = this.previewCompiledScriptStateMap.get(compileKey);
        if (!state) {
            state = {
                compiledSource: "",
                fn: null,
                lastAttemptSource: "",
                lastAttemptOk: true,
                lastError: ""
            };
            this.previewCompiledScriptStateMap.set(compileKey, state);
        }
        if (!force && state.lastAttemptSource === src) {
            const usedFallback = !state.lastAttemptOk && typeof state.fn === "function" && String(state.compiledSource || "") !== src;
            return {
                ok: !!state.lastAttemptOk,
                usedFallback,
                fn: (String(state.compiledSource || "") === src && typeof state.fn === "function") ? state.fn : null,
                message: String(state.lastError || "")
            };
        }
        state.lastAttemptSource = src;
        if (!src) {
            state.lastAttemptOk = true;
            state.lastError = "";
            state.compiledSource = "";
            state.fn = null;
            return { ok: true, usedFallback: false, fn: null };
        }
        try {
            let fn = null;
            if (kind === "controller_script") {
                fn = new Function(
                    "vars",
                    "point",
                    "particle",
                    "rotateToPoint",
                    "rotateAsAxis",
                    "rotateToWithAngle",
                    "addSingle",
                    "addMultiple",
                    "addPreTickAction",
                    "thisAt",
                    `with(vars){ try { ${src}\n } catch(_e) {} }; return vars;`
                );
                if (this.previewControllerFnCache.size > 1024) this.previewControllerFnCache.clear();
                this.previewControllerFnCache.set(src, fn);
            } else {
                fn = new Function(
                    "vars",
                    "point",
                    "rotateToPoint",
                    "rotateAsAxis",
                    "rotateToWithAngle",
                    "addSingle",
                    "addMultiple",
                    "thisAt",
                    `with(vars){ try { ${src}\n } catch(_e) {} }; return point;`
                );
                if (this.previewExprFnCache.size > 1024) this.previewExprFnCache.clear();
                this.previewExprFnCache.set(src, fn);
            }
            state.lastAttemptOk = true;
            state.lastError = "";
            state.compiledSource = src;
            state.fn = fn;
            return { ok: true, usedFallback: false, fn };
        } catch (e) {
            state.lastAttemptOk = false;
            state.lastError = String(e?.message || e || "compile failed");
            const usedFallback = typeof state.fn === "function" && String(state.compiledSource || "") !== src;
            return { ok: false, usedFallback, fn: usedFallback ? state.fn : null, message: state.lastError };
        }
    }

    compilePreviewDisplayExpression(key, sourceRaw, opts = {}) {
        return this.compilePreviewCompiledScriptInternal(key, sourceRaw, "display_expression", opts);
    }

    compilePreviewControllerScript(key, sourceRaw, opts = {}) {
        return this.compilePreviewCompiledScriptInternal(key, sourceRaw, "controller_script", opts);
    }

    markPreviewDisplayExpressionCompileFailure(key, sourceRaw, message = "compile failed") {
        return this.markPreviewCompiledScriptFailure(key, sourceRaw, message);
    }

    markPreviewControllerCompileFailure(key, sourceRaw, message = "compile failed") {
        return this.markPreviewCompiledScriptFailure(key, sourceRaw, message);
    }

    getPreviewCompiledScriptFn(key, sourceRaw) {
        const state = this.getPreviewCompiledScriptState(key);
        if (!state) return null;
        const src = transpileKotlinThisQualifierToJs(String(sourceRaw || "").trim());
        if (String(state.compiledSource || "") === src && typeof state.fn === "function") {
            return state.fn;
        }
        if (state.lastAttemptOk === false && String(state.lastAttemptSource || "") === src && typeof state.fn === "function") {
            return state.fn;
        }
        return null;
    }

    compilePreviewScriptsFromState(opts = {}) {
        const force = opts.force === true;
        const summary = { total: 0, compiled: 0, failed: 0, fallback: 0 };
        const eatDisplayActions = (list, scope, cardId = "", scopeLevel = -1) => {
            const arr = Array.isArray(list) ? list : [];
            for (let i = 0; i < arr.length; i++) {
                const action = normalizeDisplayAction(arr[i]);
                if (action.type !== "expression") continue;
                const key = this.makePreviewDisplayActionCompileKey(scope, cardId, scopeLevel, i);
                const res = this.compilePreviewDisplayExpression(key, String(action.expression || ""), { force });
                summary.total += 1;
                if (res.ok) summary.compiled += 1;
                else if (res.usedFallback) summary.fallback += 1;
                else summary.failed += 1;
            }
        };

        eatDisplayActions(this.state.displayActions || [], "display", "", -1);
        for (const card of (Array.isArray(this.state.cards) ? this.state.cards : [])) {
            if (!card || !card.id) continue;
            eatDisplayActions(card.shapeDisplayActions || [], "shape_display", card.id, 0);
            eatDisplayActions(card.shapeChildDisplayActions || [], "shape_level_display", card.id, 1);
            const nested = Array.isArray(card.shapeChildLevels) ? card.shapeChildLevels : [];
            for (let i = 0; i < nested.length; i++) {
                const lv = normalizeShapeNestedLevel(nested[i], i);
                eatDisplayActions(lv.displayActions || [], "shape_level_display", card.id, i + 2);
            }
            const controllerActions = Array.isArray(card.controllerActions) ? card.controllerActions : [];
            for (let i = 0; i < controllerActions.length; i++) {
                const key = this.makePreviewControllerScriptCompileKey(card.id, i);
                const res = this.compilePreviewControllerScript(key, String(controllerActions[i]?.script || ""), { force });
                summary.total += 1;
                if (res.ok) summary.compiled += 1;
                else if (res.usedFallback) summary.fallback += 1;
                else summary.failed += 1;
            }
        }
        return summary;
    }

    updatePreviewGeometry(points, owners) {
        if (!this.pointsGeom) return;
        const count = points.length;
        const posAttr = this.pointsGeom.getAttribute("position");
        const colAttr = this.pointsGeom.getAttribute("color");
        const sizeAttr = this.pointsGeom.getAttribute("aSize");
        const alphaAttr = this.pointsGeom.getAttribute("aAlpha");
        if (!posAttr || posAttr.array.length !== count * 3) {
            this.pointsGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        }
        if (!colAttr || colAttr.array.length !== count * 3) {
            this.pointsGeom.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        }
        if (!sizeAttr || sizeAttr.array.length !== count) {
            this.pointsGeom.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(count), 1));
        }
        if (!alphaAttr || alphaAttr.array.length !== count) {
            this.pointsGeom.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(count), 1));
        }
        const positions = this.pointsGeom.getAttribute("position").array;
        const colors = this.pointsGeom.getAttribute("color").array;
        const sizes = this.pointsGeom.getAttribute("aSize").array;
        const alphas = this.pointsGeom.getAttribute("aAlpha").array;
        this.previewVisibleMask = new Array(count).fill(true);
        this.previewSizeFactors = new Array(count).fill(1);
        this.previewAlphaFactors = new Array(count).fill(1);
        const visualCache = new Map();
        const linearColorCache = new Map();
        for (let i = 0; i < count; i++) {
            const p = points[i];
            positions[i * 3 + 0] = p.x;
            positions[i * 3 + 1] = p.y;
            positions[i * 3 + 2] = p.z;
            const owner = owners[i];
            let visual = visualCache.get(owner);
            if (!visual) {
                visual = this.resolveCardPreviewVisual(owner);
                visualCache.set(owner, visual);
            }
            let rgb = linearColorCache.get(owner);
            if (!rgb) {
                rgb = srgbRgbToLinearArray(visual.color);
                linearColorCache.set(owner, rgb);
            }
            colors[i * 3 + 0] = rgb[0];
            colors[i * 3 + 1] = rgb[1];
            colors[i * 3 + 2] = rgb[2];
            sizes[i] = Math.max(0.05, num(visual.size));
            alphas[i] = clamp(num(visual.alpha), 0, 1);
            this.previewSizeFactors[i] = Math.max(0.05, num(visual.size));
            this.previewAlphaFactors[i] = clamp(num(visual.alpha), 0, 1);
        }
        this.pointsGeom.attributes.position.needsUpdate = true;
        this.pointsGeom.attributes.color.needsUpdate = true;
        this.pointsGeom.attributes.aSize.needsUpdate = true;
        this.pointsGeom.attributes.aAlpha.needsUpdate = true;
        this.pointsGeom.computeBoundingSphere();
        if (this.pointsMat) this.pointsMat.size = this.state.settings.pointSize;
        const statusText = `点数: ${count}/${this.previewBasePoints.length || count}`;
        if (this.lastPointsStatusText !== statusText) {
            this.lastPointsStatusText = statusText;
            this.dom.statusPoints.textContent = statusText;
        }
        this.updateSelectionStatus();
    }

    updatePreviewAnimation() {
        if (!this.pointsGeom || !this.previewBasePoints.length) return;
        const now = performance.now();
        const totalCount = this.previewBasePoints.length;
        const minInterval = totalCount >= 50000 ? 16 : 0;
        if (minInterval > 0 && (now - this.previewPerfLastTs) < minInterval) return;
        this.previewPerfLastTs = now;
        const elapsedTick = (now - this.previewAnimStart) / 50;
        const cycleCfg = this.previewCycleCache || (this.previewCycleCache = this.getPreviewCycleConfig());
        const cycleAppear = cycleCfg.appear;
        const cycleLive = cycleCfg.live;
        const cycleFade = cycleCfg.fade;
        const cycleTotal = cycleCfg.total;
        const globalCycleAge = ((elapsedTick % cycleTotal) + cycleTotal) % cycleTotal;
        const positions = this.pointsGeom.getAttribute("position")?.array;
        const colors = this.pointsGeom.getAttribute("color")?.array;
        const sizes = this.pointsGeom.getAttribute("aSize")?.array;
        const alphas = this.pointsGeom.getAttribute("aAlpha")?.array;
        if (!positions || !colors || !sizes || !alphas) return;
        const skipExprPerPoint = totalCount >= 50000;
        const runtimeActions = this.buildPreviewRuntimeActions(elapsedTick, this.state.displayActions || [], {
            skipExpression: skipExprPerPoint,
            scope: "display"
        });
        const globalAxis = this.resolveCompositionAxisDirection();
        const tickStep = Math.max(0, Math.floor(elapsedTick));
        if (!this.previewRuntimeGlobals || tickStep < this.previewRuntimeAppliedTick) {
            this.previewRuntimeGlobals = this.buildPreviewRuntimeGlobals(0, 0, 0);
            this.previewRuntimeAppliedTick = -1;
        }
        const frameRuntimeGlobals = this.previewRuntimeGlobals;
        for (let t = this.previewRuntimeAppliedTick + 1; t <= tickStep; t++) {
            this.applyExpressionGlobalsOnce(runtimeActions, t, t, frameRuntimeGlobals, globalAxis);
        }
        if (tickStep > this.previewRuntimeAppliedTick) this.previewRuntimeAppliedTick = tickStep;
        this.syncPreviewStatusWithCycle(frameRuntimeGlobals, cycleCfg, globalCycleAge, elapsedTick);

        if (!this.previewPointGroupIndex || this.previewPointGroupIndex.length !== totalCount) {
            this.rebuildPreviewRuntimeIndex();
        }
        const pointGroupIndex = this.previewPointGroupIndex;
        const groupOwner = Array.isArray(this.previewGroupOwner) ? this.previewGroupOwner : [];
        const groupOwnerCount = Array.isArray(this.previewGroupOwnerCount) ? this.previewGroupOwnerCount : [];
        const groupBirthOffset = Array.isArray(this.previewGroupBirthOffset) ? this.previewGroupBirthOffset : [];
        const groupRootVirtualIndex = Array.isArray(this.previewGroupRootVirtualIndex) ? this.previewGroupRootVirtualIndex : [];
        const groupCard = Array.isArray(this.previewGroupCard) ? this.previewGroupCard : [];
        const groupCardIndex = Array.isArray(this.previewGroupCardIndex) ? this.previewGroupCardIndex : [];
        const groupCount = groupOwner.length;

        let groupRuntimeCache = this.previewFrameGroupRuntimeCache;
        if (!Array.isArray(groupRuntimeCache) || groupRuntimeCache.length !== groupCount) {
            groupRuntimeCache = new Array(groupCount);
            this.previewFrameGroupRuntimeCache = groupRuntimeCache;
        } else {
            groupRuntimeCache.fill(undefined);
        }
        let anchorCache = this.previewFrameAnchorCache;
        if (!Array.isArray(anchorCache) || anchorCache.length !== groupCount) {
            anchorCache = new Array(groupCount);
            this.previewFrameAnchorCache = anchorCache;
        } else {
            anchorCache.fill(undefined);
        }
        let localCache = this.previewFrameLocalCache;
        if (!Array.isArray(localCache) || localCache.length !== groupCount) {
            localCache = new Array(groupCount);
            this.previewFrameLocalCache = localCache;
        } else {
            localCache.fill(undefined);
        }
        let ownerVisualCache = this.previewFrameGroupVisualCache;
        if (!Array.isArray(ownerVisualCache) || ownerVisualCache.length !== groupCount) {
            ownerVisualCache = new Array(groupCount);
            this.previewFrameGroupVisualCache = ownerVisualCache;
        } else {
            ownerVisualCache.fill(undefined);
        }
        let pointVisualCache = this.previewFrameGroupPointVisualCache;
        if (!Array.isArray(pointVisualCache) || pointVisualCache.length !== groupCount) {
            pointVisualCache = new Array(groupCount);
            this.previewFrameGroupPointVisualCache = pointVisualCache;
        } else {
            pointVisualCache.fill(undefined);
        }
        const ownerVisualAgeDependentCache = (this.previewCardVisualAgeDependentCache instanceof Map)
            ? this.previewCardVisualAgeDependentCache
            : (this.previewCardVisualAgeDependentCache = new Map());
        const shapeRuntimeLevelsFrameCache = (this.previewFrameShapeRuntimeLevelsCache instanceof Map)
            ? this.previewFrameShapeRuntimeLevelsCache
            : (this.previewFrameShapeRuntimeLevelsCache = new Map());
        shapeRuntimeLevelsFrameCache.clear();
        const growthPlanFrameCache = (this.previewFrameGrowthPlanCache instanceof Map)
            ? this.previewFrameGrowthPlanCache
            : (this.previewFrameGrowthPlanCache = new Map());
        growthPlanFrameCache.clear();

        const ownerIds = this.previewOwners;
        const ownerLocalIndex = this.previewOwnerLocalIndex;
        const ownerPointCount = this.previewOwnerPointCount;
        const anchorBaseList = this.previewAnchorBase;
        const localBaseList = this.previewLocalBase;
        const anchorRefList = this.previewAnchorRef;
        const localRefList = this.previewLocalRef;
        const rootOffsetIndexList = this.previewRootOffsetIndex;
        const useLocalOpsList = this.previewUseLocalOps;
        const birthOffsetList = this.previewBirthOffsets;
        const basePoints = this.previewBasePoints;
        const levelBasesAll = this.previewLevelBases;
        const levelRefsAll = this.previewLevelRefs;
        const levelOffsetRefsAll = this.previewLevelOffsetRefs;

        const sequencedRoot = this.state.compositionType === "sequenced";
        const rootVirtualTotal = Math.max(1, int(this.previewRootVirtualTotal || this.state.cards.length || 1));
        const rootGrowthPlan = sequencedRoot
            ? this.buildSequencedRootGrowthPlan(runtimeActions, rootVirtualTotal, globalCycleAge, elapsedTick)
            : null;

        let frustum = null;
        let frustumPoint = null;
        if (this.camera && totalCount >= 12000) {
            if (!this.previewFrameFrustum) this.previewFrameFrustum = new THREE.Frustum();
            if (!this.previewFrameProjScreenMatrix) this.previewFrameProjScreenMatrix = new THREE.Matrix4();
            if (!this.previewFrameFrustumPoint) this.previewFrameFrustumPoint = new THREE.Vector3();
            this.previewFrameProjScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
            this.previewFrameFrustum.setFromProjectionMatrix(this.previewFrameProjScreenMatrix);
            frustum = this.previewFrameFrustum;
            frustumPoint = this.previewFrameFrustumPoint;
        }

        let visible = 0;
        for (let i = 0; i < totalCount; i++) {
            const base = basePoints[i];
            const groupId = (pointGroupIndex && i < pointGroupIndex.length) ? int(pointGroupIndex[i]) : -1;
            const owner = groupId >= 0 ? (groupOwner[groupId] || ownerIds[i]) : ownerIds[i];
            const localIndex = int(ownerLocalIndex[i] || 0);
            const ownerCountSafe = groupId >= 0
                ? Math.max(1, int(groupOwnerCount[groupId] || ownerPointCount[i] || 1))
                : Math.max(1, int(ownerPointCount[i] || 1));
            const anchorBase = anchorBaseList[i] || base;
            const localBase = localBaseList[i] || U.v(0, 0, 0);
            const anchorRef = int(anchorRefList[i] || 0);
            const localRef = int(localRefList[i] || 0);
            const rootOffsetIndex = int(rootOffsetIndexList?.[i] || 0);
            const rootVirtualIndex = groupId >= 0
                ? int(groupRootVirtualIndex[groupId] || 0)
                : int(this.previewRootVirtualIndex?.[i] || 0);
            const useLocalOps = !!useLocalOpsList[i];
            const birthOffset = groupId >= 0
                ? num(groupBirthOffset[groupId] || 0)
                : num(birthOffsetList[i] || 0);
            let rootDelayTick = sequencedRoot ? Math.max(0, rootVirtualIndex) : 0;
            if (rootGrowthPlan?.hasSource) {
                const unlockTick = Number(rootGrowthPlan.unlockTickByIndex?.[rootVirtualIndex]);
                if (Number.isFinite(unlockTick)) {
                    rootDelayTick = Math.max(0, num(unlockTick));
                } else {
                    rootDelayTick = Math.max(0, num(globalCycleAge) + 1);
                }
            }
            let cached = groupId >= 0 ? groupRuntimeCache[groupId] : null;
            if (!cached) {
                const ageBase = ((elapsedTick - birthOffset) % cycleTotal + cycleTotal) % cycleTotal;
                let globalAge = this.resolvePreviewAgeWithStatus(ageBase, elapsedTick, cycleCfg, frameRuntimeGlobals);
                const runtimeElapsedTick = Math.max(0, num(globalAge) - rootDelayTick);
                const runtimeAgeTick = runtimeElapsedTick;
                const card = groupId >= 0
                    ? (groupCard[groupId] || null)
                    : this.getCardById(owner);
                const cardIndex = groupId >= 0
                    ? int(groupCardIndex[groupId] ?? -1)
                    : this.getCardIndexById(owner);
                let shapeRuntimeLevels = [];
                const runtimeTickKey = int(Math.round(runtimeElapsedTick * 1000));
                if (card) {
                    if (card.dataType !== "single") {
                        const shapeCacheKey = `${card.id}|${runtimeTickKey}|${skipExprPerPoint ? 1 : 0}`;
                        let shapeRuntimePack = shapeRuntimeLevelsFrameCache.get(shapeCacheKey);
                        if (shapeRuntimePack && Array.isArray(shapeRuntimePack.levels)) {
                            shapeRuntimeLevels = shapeRuntimePack.levels;
                        } else {
                            shapeRuntimeLevels = this.getShapeRuntimeLevelsForPreview(card, runtimeElapsedTick, skipExprPerPoint);
                            shapeRuntimePack = {
                                levels: shapeRuntimeLevels,
                                hasExpression: shapeRuntimeLevels.some((lv) => !!lv.hasExpression),
                                globalsApplied: false
                            };
                            shapeRuntimeLevelsFrameCache.set(shapeCacheKey, shapeRuntimePack);
                        }
                        if (shapeRuntimePack.hasExpression || !shapeRuntimePack.globalsApplied) {
                            for (const lv of shapeRuntimeLevels) {
                                this.applyExpressionGlobalsOnce(lv.actions, runtimeElapsedTick, runtimeAgeTick, frameRuntimeGlobals, lv.axis || globalAxis);
                            }
                            shapeRuntimePack.globalsApplied = true;
                        }
                    }
                }
                let ageDependent = ownerVisualAgeDependentCache.get(owner);
                if (ageDependent === undefined) {
                    ageDependent = this.isCardVisualAgeDependent(card);
                    ownerVisualAgeDependentCache.set(owner, ageDependent);
                }
                this.syncPreviewStatusWithCycle(frameRuntimeGlobals, cycleCfg, globalCycleAge, elapsedTick);
                globalAge = this.resolvePreviewAgeWithStatus(ageBase, elapsedTick, cycleCfg, frameRuntimeGlobals);
                const globalCycleAgeNow = this.resolvePreviewAgeWithStatus(globalCycleAge, elapsedTick, cycleCfg, frameRuntimeGlobals);
                const growthAgeTick = Math.max(0, num(globalAge) - rootDelayTick);
                const canReuseGrowthPlan = !!card
                    && !runtimeActions.__hasExpression
                    && !shapeRuntimeLevels.some((lv) => !!lv.hasExpression);
                const growthPlanKey = canReuseGrowthPlan
                    ? [
                        card.id,
                        ownerCountSafe,
                        int(Math.round(growthAgeTick * 1000)),
                        runtimeTickKey,
                        sequencedRoot ? int(rootVirtualIndex) : 0,
                        int(Math.round(num(globalCycleAgeNow) * 1000))
                    ].join("|")
                    : "";
                let growthPlanCached = canReuseGrowthPlan ? growthPlanFrameCache.get(growthPlanKey) : null;
                let visibleLimit = 0;
                let localGrowthPlan = null;
                if (growthPlanCached && typeof growthPlanCached === "object") {
                    visibleLimit = int(growthPlanCached.visibleLimit || 0);
                    localGrowthPlan = growthPlanCached.localGrowthPlan || null;
                } else {
                    visibleLimit = this.evaluateGrowthVisibleLimit(
                        owner,
                        ownerCountSafe,
                        growthAgeTick,
                        globalCycleAgeNow,
                        runtimeElapsedTick,
                        runtimeActions,
                        shapeRuntimeLevels,
                        cycleCfg,
                        {
                            rootVirtualIndex,
                            rootVirtualTotal,
                            rootElapsedTick: elapsedTick,
                            rootPlan: rootGrowthPlan,
                            ownerCard: card,
                            ownerCardIndex: cardIndex
                        }
                    );
                    localGrowthPlan = this.buildLocalGrowthPlan(
                        card,
                        ownerCountSafe,
                        shapeRuntimeLevels,
                        growthAgeTick,
                        runtimeElapsedTick
                    );
                    if (canReuseGrowthPlan) {
                        growthPlanFrameCache.set(growthPlanKey, {
                            visibleLimit,
                            localGrowthPlan
                        });
                    }
                }
                const localUnlockTickByIndex = Array.isArray(localGrowthPlan?.unlockTickByIndex)
                    ? localGrowthPlan.unlockTickByIndex
                    : [];
                cached = {
                    owner,
                    ownerCount: ownerCountSafe,
                    age: growthAgeTick,
                    elapsedTick: runtimeElapsedTick,
                    shapeRuntimeLevels,
                    cardRuntimeHasExpression: shapeRuntimeLevels.some((lv) => !!lv.hasExpression),
                    cardRuntimeHasPointDependentExpression: shapeRuntimeLevels.some((lv) => !!lv.hasPointDependentExpression),
                    cardHasShapeOps: !!(card && card.dataType !== "single"),
                    cardVisualAgeDependent: !!ageDependent,
                    visibleLimit,
                    localUnlockTickByIndex
                };
                if (groupId >= 0) groupRuntimeCache[groupId] = cached;
            }

            const ownerCount = Math.max(1, int(cached.ownerCount || ownerCountSafe));
            const visibleLimit = clamp(int(cached.visibleLimit), 0, ownerCount);
            const isVisibleByGrowth = localIndex < visibleLimit;
            if (!isVisibleByGrowth) {
                this.previewVisibleMask[i] = false;
                positions[i * 3 + 0] = base.x;
                positions[i * 3 + 1] = base.y;
                positions[i * 3 + 2] = base.z;
                let hiddenRef = this.previewPoints[i];
                if (!hiddenRef) {
                    hiddenRef = U.v(base.x, base.y, base.z);
                    this.previewPoints[i] = hiddenRef;
                } else {
                    hiddenRef.x = base.x;
                    hiddenRef.y = base.y;
                    hiddenRef.z = base.z;
                }
                colors[i * 3 + 0] = 0;
                colors[i * 3 + 1] = 0;
                colors[i * 3 + 2] = 0;
                sizes[i] = 0.01;
                alphas[i] = 0;
                continue;
            }

            const localUnlockTick = Number(cached.localUnlockTickByIndex?.[localIndex]);
            const pointDelayTick = Number.isFinite(localUnlockTick) ? Math.max(0, num(localUnlockTick)) : 0;
            const pointElapsedTick = Math.max(0, num(cached.elapsedTick) - pointDelayTick);
            const pointAgeTick = Math.max(0, num(cached.age) - pointDelayTick);
            const localCacheRef = localRef;

            let anchorsByBirth = groupId >= 0 ? anchorCache[groupId] : null;
            if (!anchorsByBirth) {
                anchorsByBirth = [];
                if (groupId >= 0) anchorCache[groupId] = anchorsByBirth;
            }
            let anchor = anchorsByBirth[anchorRef];
            if (!anchor) {
                const globalScale = this.resolveScaleFactor(this.state.projectScale, cached.age, cycleCfg);
                anchor = this.applyScaleFactorToPoint(anchorBase, globalScale);
                anchor = this.applyRuntimeActionsToPoint(anchor, runtimeActions, cached.elapsedTick, cached.age, anchorRef, globalAxis, {
                    skipExpression: skipExprPerPoint,
                    runtimeVars: frameRuntimeGlobals,
                    persistExpressionVars: false
                });
                anchorsByBirth[anchorRef] = anchor;
            }

            let px = anchor.x;
            let py = anchor.y;
            let pz = anchor.z;
            if (useLocalOps && cached.cardHasShapeOps) {
                let local = null;
                const localCacheable = !cached.cardRuntimeHasPointDependentExpression;
                let localsByBirth = groupId >= 0 ? localCache[groupId] : null;
                if (!localsByBirth) {
                    localsByBirth = [];
                    if (groupId >= 0) localCache[groupId] = localsByBirth;
                }
                if (localCacheable) local = localsByBirth[localCacheRef];
                if (!local) {
                    const levelBaseList = Array.isArray(levelBasesAll[i]) && levelBasesAll[i].length
                        ? levelBasesAll[i]
                        : [localBase];
                    const levelRefList = Array.isArray(levelRefsAll[i]) && levelRefsAll[i].length
                        ? levelRefsAll[i]
                        : [localRef];
                    const levelOffsetRefList = Array.isArray(levelOffsetRefsAll?.[i]) && levelOffsetRefsAll[i].length
                        ? levelOffsetRefsAll[i]
                        : [];
                    const runtimeLevels = Array.isArray(cached.shapeRuntimeLevels) ? cached.shapeRuntimeLevels : [];
                    let localSum = U.v(0, 0, 0);
                    const transformedLevelRels = [];
                    const transformedLevelOrders = [];
                    for (let lvIdx = 0; lvIdx < levelBaseList.length; lvIdx++) {
                        const lvBase = levelBaseList[lvIdx] || U.v(0, 0, 0);
                        const lvPointRef = int(levelRefList[lvIdx] ?? localRef);
                        const lvOffsetRef = lvIdx === 0
                            ? rootOffsetIndex
                            : int(levelOffsetRefList[lvIdx] ?? lvPointRef);
                        const lvRuntime = runtimeLevels[lvIdx] || null;
                        let lvPoint = U.clone(lvBase);
                        if (lvRuntime) {
                            const lvActionElapsed = cached.elapsedTick;
                            const lvActionAge = cached.age;
                            const lvScaleAge = cached.age;
                            const cardScale = this.resolveScaleFactor(lvRuntime.scale, lvScaleAge, cycleCfg);
                            lvPoint = this.applyScaleFactorToPoint(lvPoint, cardScale);
                            if (lvRuntime.angleOffset) {
                                const levelOffsetIndex = lvOffsetRef;
                                const offsetAngle = this.resolvePreviewAngleOffsetRotation(
                                    lvRuntime.angleOffset,
                                    levelOffsetIndex,
                                    lvActionElapsed,
                                    lvActionAge,
                                    lvPointRef,
                                    frameRuntimeGlobals,
                                    elapsedTick
                                );
                                if (Math.abs(offsetAngle) > 1e-9) {
                                    lvPoint = U.rotateAroundAxis(lvPoint, lvRuntime.axis || globalAxis, offsetAngle);
                                }
                            }
                            if (lvRuntime.actions && lvRuntime.actions.length) {
                                const shapeScope = {
                                    rel: anchorBase,
                                    order: int(localIndex),
                                    // shapeRelN ????????????????????????????????????
                                    shapeRels: transformedLevelRels,
                                    shapeOrders: transformedLevelOrders
                                };
                                lvPoint = this.applyRuntimeActionsToPoint(
                                    lvPoint,
                                    lvRuntime.actions,
                                    lvActionElapsed,
                                    lvActionAge,
                                    lvPointRef,
                                    lvRuntime.axis || globalAxis,
                                    {
                                        skipExpression: skipExprPerPoint,
                                        runtimeVars: frameRuntimeGlobals,
                                        persistExpressionVars: false,
                                        shapeScope
                                    }
                                );
                            }
                        }
                        transformedLevelRels[lvIdx] = lvPoint;
                        transformedLevelOrders[lvIdx] = lvPointRef;
                        localSum.x += num(lvPoint.x);
                        localSum.y += num(lvPoint.y);
                        localSum.z += num(lvPoint.z);
                    }
                    local = localSum;
                    if (localCacheable) localsByBirth[localCacheRef] = local;
                }
                px = anchor.x + local.x;
                py = anchor.y + local.y;
                pz = anchor.z + local.z;
            }

            positions[i * 3 + 0] = px;
            positions[i * 3 + 1] = py;
            positions[i * 3 + 2] = pz;
            let pRef = this.previewPoints[i];
            if (!pRef) {
                pRef = U.v(px, py, pz);
                this.previewPoints[i] = pRef;
            } else {
                pRef.x = px;
                pRef.y = py;
                pRef.z = pz;
            }

            let inFrustum = true;
            if (frustum && frustumPoint) {
                frustumPoint.set(px, py, pz);
                inFrustum = frustum.containsPoint(frustumPoint);
            }
            if (!inFrustum) {
                this.previewVisibleMask[i] = false;
                colors[i * 3 + 0] = 0;
                colors[i * 3 + 1] = 0;
                colors[i * 3 + 2] = 0;
                sizes[i] = 0.01;
                alphas[i] = 0;
                continue;
            }

            let pointVisual = null;
            if (!skipExprPerPoint && cached.cardVisualAgeDependent) {
                let byLocal = groupId >= 0 ? pointVisualCache[groupId] : null;
                if (!byLocal) {
                    byLocal = [];
                    if (groupId >= 0) pointVisualCache[groupId] = byLocal;
                }
                pointVisual = byLocal[localIndex];
                if (!pointVisual) {
                    pointVisual = this.resolveCardPreviewVisual(owner, {
                        runtimeVars: frameRuntimeGlobals,
                        elapsedTick: pointElapsedTick,
                        ageTick: pointAgeTick,
                        pointIndex: localIndex
                    });
                    byLocal[localIndex] = pointVisual;
                }
            } else {
                pointVisual = groupId >= 0 ? ownerVisualCache[groupId] : null;
                if (!pointVisual) {
                    pointVisual = this.resolveCardPreviewVisual(owner, {
                        runtimeVars: frameRuntimeGlobals,
                        elapsedTick: cached.elapsedTick,
                        ageTick: cached.age,
                        pointIndex: 0
                    });
                    if (groupId >= 0) ownerVisualCache[groupId] = pointVisual;
                }
            }

            let rgb = pointVisual.__linearColor;
            if (!rgb) {
                rgb = srgbRgbToLinearArray(pointVisual.color);
                pointVisual.__linearColor = rgb;
            }
            colors[i * 3 + 0] = rgb[0];
            colors[i * 3 + 1] = rgb[1];
            colors[i * 3 + 2] = rgb[2];
            sizes[i] = Math.max(0.05, num(pointVisual.size));
            alphas[i] = clamp(num(pointVisual.alpha), 0, 1);
            this.previewVisibleMask[i] = true;
            visible++;
        }

        this.pointsGeom.attributes.position.needsUpdate = true;
        this.pointsGeom.attributes.color.needsUpdate = true;
        this.pointsGeom.attributes.aSize.needsUpdate = true;
        this.pointsGeom.attributes.aAlpha.needsUpdate = true;
        const statusText = `点数: ${visible}/${this.previewBasePoints.length}`;
        if (this.lastPointsStatusText !== statusText) {
            this.lastPointsStatusText = statusText;
            this.dom.statusPoints.textContent = statusText;
        }
    }

    getPreviewCycleConfig() {
        let appear = 16;
        const play = Math.max(1, int(this.state.previewPlayTicks || 70));
        const fade = Math.max(0, int(this.state.disabledInterval || 0));
        const maxOwner = Math.max(1, ...this.previewOwnerPointCount.map((x) => Math.max(1, int(x || 1))));
        const maxCards = Math.max(1, int(this.previewRootVirtualTotal || this.state.cards.length));
        let hasExprGrowth = false;
        let maxGrowthTarget = 1;

        const estimateGrowthStepFromScript = (scriptRaw) => {
            const src = String(scriptRaw || "");
            if (!src) return 0;
            let step = (src.match(/addSingle\s*\(/g) || []).length;
            for (const m of src.matchAll(/addMultiple\s*\(\s*([^)]+)\s*\)/g)) {
                step += Math.max(1, int(this.evaluateNumericExpression(m[1] || "1")));
            }
            return Math.max(0, step);
        };

        const eatExprGrowth = (actions, targetCount = maxOwner) => {
            const list = Array.isArray(actions) ? actions : [];
            let step = 0;
            for (const raw of list) {
                const act = normalizeDisplayAction(raw);
                if (act.type !== "expression") continue;
                const src = String(act.expression || "");
                const singleHits = (src.match(/addSingle\s*\(/g) || []).length;
                if (singleHits) {
                    step += singleHits;
                    hasExprGrowth = true;
                }
                for (const m of src.matchAll(/addMultiple\s*\(\s*([^)]+)\s*\)/g)) {
                    step += Math.max(1, int(this.evaluateNumericExpression(m[1] || "1")));
                    hasExprGrowth = true;
                }
            }
            const safeTarget = Math.max(1, int(targetCount || 1));
            if (step > 0) {
                appear = Math.max(appear, Math.ceil(safeTarget / step));
                maxGrowthTarget = Math.max(maxGrowthTarget, safeTarget);
            }
        };

        eatExprGrowth(this.state.displayActions || [], maxCards);
        for (const card of this.state.cards) {
            if (card.dataType !== "single") {
                eatExprGrowth(card.shapeDisplayActions || [], maxOwner);
            } else {
                let step = 0;
                for (const action of (card.controllerActions || [])) {
                    step += estimateGrowthStepFromScript(action?.script || "");
                }
                if (step > 0) {
                    appear = Math.max(appear, Math.ceil(maxOwner / step));
                    hasExprGrowth = true;
                    maxGrowthTarget = Math.max(maxGrowthTarget, maxOwner);
                }
            }
        }
        if (hasExprGrowth) {
            appear = Math.max(appear, maxGrowthTarget);
        }
        appear = clamp(int(Math.max(1, appear)), 1, play);
        const live = Math.max(0, play - appear);
        const total = Math.max(1, play + fade);
        return { appear, live, fade, play, total };
    }

    evaluateGrowthVisibleLimit(ownerCardId, ownerCount, ageTick, globalCycleAge, elapsedTick, globalRuntimeActions = [], shapeRuntimeLevels = [], cycleCfg = null, rootCtx = null) {
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const sequencedRoot = this.state.compositionType === "sequenced";
        let growthAge = num(ageTick);
        const rootGrowthAge = num(globalCycleAge);
        const rootInfo = (rootCtx && typeof rootCtx === "object") ? rootCtx : {};

        const totalCards = Math.max(1, int(rootInfo.rootVirtualTotal || this.previewRootVirtualTotal || this.state.cards.length));
        const cardIndexRaw = Number.isFinite(Number(rootInfo.ownerCardIndex))
            ? int(rootInfo.ownerCardIndex)
            : this.getCardIndexById(ownerCardId);
        const virtualIndex = Number.isFinite(Number(rootInfo.rootVirtualIndex))
            ? int(rootInfo.rootVirtualIndex)
            : (cardIndexRaw >= 0 ? cardIndexRaw : 0);
        const rootElapsedTick = Number.isFinite(Number(rootInfo.rootElapsedTick))
            ? num(rootInfo.rootElapsedTick)
            : num(elapsedTick);
        const rootPlan = (rootInfo.rootPlan && typeof rootInfo.rootPlan === "object")
            ? rootInfo.rootPlan
            : null;
        let rootVisibleCards = Number.POSITIVE_INFINITY;
        let hasRootGrowthSource = false;

        if (rootPlan) {
            hasRootGrowthSource = rootPlan.hasSource === true;
            rootVisibleCards = hasRootGrowthSource
                ? clamp(int(rootPlan.visibleCards || 0), 0, totalCards)
                : Number.POSITIVE_INFINITY;
        } else {
            if (sequencedRoot && this.state.compositionAnimates.length) {
                const n = this.computeAnimateVisibleCount(this.state.compositionAnimates, globalCycleAge, rootElapsedTick, 0);
                rootVisibleCards = Math.min(rootVisibleCards, n);
                hasRootGrowthSource = true;
            }
            const rootExprCount = this.computeExpressionVisibleCount(globalRuntimeActions, totalCards, rootGrowthAge, {
                scopeLevel: -1,
                allowOrder: this.state.compositionType === "sequenced",
                sequencedDepths: []
            });
            if (Number.isFinite(rootExprCount)) {
                rootVisibleCards = Math.min(rootVisibleCards, rootExprCount);
                hasRootGrowthSource = true;
            }
        }
        if (sequencedRoot && !hasRootGrowthSource) return 0;
        if (Number.isFinite(rootVisibleCards)) {
            const cardLimit = clamp(int(rootVisibleCards), 0, totalCards);
            if (virtualIndex >= cardLimit) return 0;
        }
        const card = rootInfo.ownerCard || this.getCardById(ownerCardId);
        const localLimit = this.evaluateLocalGrowthVisibleLimit(
            card,
            ownerCount,
            growthAge,
            elapsedTick,
            shapeRuntimeLevels
        );
        if (!Number.isFinite(localLimit)) return Math.max(1, ownerCount);
        return clamp(int(localLimit), 0, Math.max(1, ownerCount));
    }

    evaluateLocalGrowthVisibleLimit(card, ownerCount, growthAge, elapsedTick, shapeRuntimeLevels = []) {
        if (!card) return Math.max(1, ownerCount);
        let visibleLimit = Math.max(1, ownerCount);
        let hasLocalGrowthSource = false;
        const runtimeLevels = Array.isArray(shapeRuntimeLevels) ? shapeRuntimeLevels : [];
        const sequencedLevels = runtimeLevels.filter((lv) => !!lv?.sequenced);

        if (sequencedLevels.length) {
            for (const lv of sequencedLevels) {
                let levelLimit = Math.max(1, ownerCount);
                let hasLevelGrowthSource = false;
                if (Array.isArray(lv.growthAnimates) && lv.growthAnimates.length) {
                    const n = this.computeAnimateVisibleCount(lv.growthAnimates, growthAge, elapsedTick, 0);
                    levelLimit = Math.min(levelLimit, n);
                    hasLevelGrowthSource = true;
                }
                const exprCount = this.computeExpressionVisibleCount(lv.actions, ownerCount, growthAge, {
                    scopeLevel: int(lv.scopeLevel || 0),
                    allowOrder: this.state.compositionType === "sequenced",
                    sequencedDepths: Array.isArray(lv.ancestorSequencedDepths) ? lv.ancestorSequencedDepths : []
                });
                if (Number.isFinite(exprCount)) {
                    levelLimit = Math.min(levelLimit, exprCount);
                    hasLevelGrowthSource = true;
                }
                if (!hasLevelGrowthSource) return 0;
                visibleLimit = Math.min(visibleLimit, levelLimit);
                hasLocalGrowthSource = true;
            }
        } else if (card.dataType === "single" && Array.isArray(card.controllerActions) && card.controllerActions.length) {
            const controllerExprActions = card.controllerActions
                .map((it) => normalizeControllerAction(it))
                .map((it) => ({ type: "expression", expression: String(it.script || ""), fn: null }));
            const n = this.computeExpressionVisibleCount(controllerExprActions, ownerCount, growthAge, {
                scopeLevel: -1,
                allowOrder: false,
                sequencedDepths: []
            });
            if (Number.isFinite(n)) {
                visibleLimit = Math.min(visibleLimit, n);
                hasLocalGrowthSource = true;
            }
        } else {
            const cardExprCount = this.computeExpressionVisibleCount(runtimeLevels[0]?.actions || [], ownerCount, growthAge, {
                scopeLevel: int(runtimeLevels[0]?.scopeLevel || 0),
                allowOrder: this.state.compositionType === "sequenced",
                sequencedDepths: Array.isArray(runtimeLevels[0]?.ancestorSequencedDepths) ? runtimeLevels[0].ancestorSequencedDepths : []
            });
            if (Number.isFinite(cardExprCount)) {
                visibleLimit = Math.min(visibleLimit, cardExprCount);
                hasLocalGrowthSource = true;
            }
            if (card.dataType === "sequenced_shape" && !hasLocalGrowthSource) return 0;
        }

        if (!Number.isFinite(visibleLimit)) return Math.max(1, ownerCount);
        return clamp(int(visibleLimit), 0, Math.max(1, ownerCount));
    }

    buildLocalGrowthPlan(card, ownerCount, shapeRuntimeLevels = [], ageTick = 0, elapsedTick = 0) {
        const maxCount = Math.max(1, int(ownerCount || 1));
        const steps = Math.max(0, Math.floor(num(ageTick)));
        const unlockTickByIndex = new Array(maxCount).fill(Number.POSITIVE_INFINITY);
        let previousVisible = 0;

        for (let t = 0; t <= steps; t++) {
            let limit = this.evaluateLocalGrowthVisibleLimit(card, maxCount, t, t, shapeRuntimeLevels);
            if (!Number.isFinite(limit)) limit = maxCount;
            let visible = clamp(int(limit), 0, maxCount);
            if (visible < previousVisible) visible = previousVisible;
            for (let idx = previousVisible; idx < visible; idx++) {
                unlockTickByIndex[idx] = t;
            }
            previousVisible = visible;
        }

        return {
            steps,
            visibleLimit: previousVisible,
            unlockTickByIndex
        };
    }

    buildSequencedRootGrowthPlan(globalRuntimeActions, totalCards, globalCycleAge, elapsedTick) {
        const maxCards = Math.max(1, int(totalCards || 1));
        const steps = Math.max(0, Math.floor(num(globalCycleAge)));
        const counts = new Array(steps + 1).fill(0);
        const unlockTickByIndex = new Array(maxCards).fill(Number.POSITIVE_INFINITY);
        let hasSource = false;
        let previousVisible = 0;

        for (let t = 0; t <= steps; t++) {
            let visibleLimit = Number.POSITIVE_INFINITY;
            let hasTickSource = false;

            if (Array.isArray(this.state.compositionAnimates) && this.state.compositionAnimates.length) {
                const n = this.computeAnimateVisibleCount(this.state.compositionAnimates, t, t, 0);
                if (Number.isFinite(n)) {
                    visibleLimit = Math.min(visibleLimit, n);
                    hasTickSource = true;
                }
            }

            const exprCount = this.computeExpressionVisibleCount(globalRuntimeActions, maxCards, t, {
                scopeLevel: -1,
                allowOrder: this.state.compositionType === "sequenced",
                sequencedDepths: []
            });
            if (Number.isFinite(exprCount)) {
                visibleLimit = Math.min(visibleLimit, exprCount);
                hasTickSource = true;
            }

            if (hasTickSource) hasSource = true;
            let visible = hasTickSource ? clamp(int(visibleLimit), 0, maxCards) : 0;
            if (visible < previousVisible) visible = previousVisible;
            counts[t] = visible;
            for (let idx = previousVisible; idx < visible; idx++) {
                unlockTickByIndex[idx] = t;
            }
            previousVisible = visible;
        }

        return {
            hasSource,
            steps,
            counts,
            visibleCards: clamp(int(counts[steps] || 0), 0, maxCards),
            unlockTickByIndex
        };
    }

    computeExpressionVisibleCount(actionsOrScript, ownerCount, ageTick, opts = {}) {
        const steps = Math.max(0, Math.floor(num(ageTick)));
        const info = this.ensureExpressionVisiblePrefix(actionsOrScript, ownerCount, steps, opts);
        if (!info) return Number.POSITIVE_INFINITY;
        const result = Number(info.counts?.[steps]);
        if (Number.isFinite(result)) {
            return clamp(int(result), 0, info.safeOwnerCount);
        }
        return clamp(int(info.counts?.[info.counts.length - 1] || 0), 0, info.safeOwnerCount);
    }

    serializePreviewGrowthActions(actionsRaw = []) {
        const walk = (list) => {
            const src = Array.isArray(list) ? list : [];
            const parts = [];
            for (const act of src) {
                if (!act || typeof act !== "object") continue;
                if (act.type === "growth_add") {
                    parts.push(`a:${Math.max(1, int(act.count || 1))}`);
                    continue;
                }
                if (act.type === "conditional_growth") {
                    const cond = String(act.conditionExpr || "").trim();
                    const thenSig = walk(act.thenActions || []);
                    const elseSig = walk(act.elseActions || []);
                    parts.push(`c:${cond}?{${thenSig}}:{${elseSig}}`);
                }
            }
            return parts.join("|");
        };
        return walk(actionsRaw);
    }

    collectPreviewGrowthNativeActions(actionsRaw = []) {
        const src = Array.isArray(actionsRaw) ? actionsRaw : [];
        const out = [];
        for (const act of src) {
            if (!act || typeof act !== "object") continue;
            if (act.type === "growth_add") {
                out.push({
                    type: "growth_add",
                    count: Math.max(1, int(act.count || 1))
                });
                continue;
            }
            if (act.type === "conditional_native") {
                const thenActions = this.collectPreviewGrowthNativeActions(act.thenActions || []);
                const elseActions = this.collectPreviewGrowthNativeActions(act.elseActions || []);
                if (!thenActions.length && !elseActions.length) continue;
                const conditionExpr = String(act.conditionExpr || "").trim();
                const conditionFn = (typeof act.conditionFn === "function")
                    ? act.conditionFn
                    : this.getPreviewConditionFn(conditionExpr);
                out.push({
                    type: "conditional_growth",
                    conditionExpr,
                    conditionFn,
                    pointIndependent: act.pointIndependent === true,
                    compileKey: String(act.compileKey || ""),
                    thenActions,
                    elseActions
                });
            }
        }
        return out;
    }

    evaluatePreviewNativeGrowthDelta(actionsRaw = [], elapsedTick = 0, opts = {}) {
        const actions = Array.isArray(actionsRaw) ? actionsRaw : [];
        if (!actions.length) return 0;
        const scopeLevel = Math.max(-1, int(opts.scopeLevel ?? -1));
        const allowOrder = opts.allowOrder === true;
        const sequencedDepths = new Set(
            Array.isArray(opts.sequencedDepths)
                ? opts.sequencedDepths.map((it) => int(it))
                : []
        );
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : {};
        const ageTick = Number.isFinite(Number(opts.ageTick)) ? num(opts.ageTick) : num(elapsedTick);
        const pointIndex = int(opts.pointIndex || 0);
        let evalVars = null;
        const getEvalVars = () => {
            if (evalVars) return evalVars;
            const vars = this.createRuntimeExpressionScope(elapsedTick, ageTick, pointIndex, runtimeVars, true);
            vars.rel = U.v(0, 0, 0);
            if (allowOrder) vars.order = 0;
            for (let d = 0; d < scopeLevel; d++) {
                vars[`shapeRel${d}`] = U.v(0, 0, 0);
                if (sequencedDepths.has(d)) vars[`shapeOrder${d}`] = 0;
            }
            vars.thisAt = runtimeVars;
            evalVars = vars;
            return evalVars;
        };
        const walk = (list) => {
            const src = Array.isArray(list) ? list : [];
            let delta = 0;
            for (const act of src) {
                if (!act || typeof act !== "object") continue;
                if (act.type === "growth_add") {
                    delta += Math.max(1, int(act.count || 1));
                    continue;
                }
                if (act.type === "conditional_growth") {
                    const fn = (typeof act.conditionFn === "function")
                        ? act.conditionFn
                        : this.getPreviewConditionFn(act.conditionExpr);
                    let pass = false;
                    if (typeof fn === "function") {
                        try {
                            pass = !!fn(getEvalVars());
                        } catch {
                            pass = false;
                        }
                    }
                    const branch = pass
                        ? (Array.isArray(act.thenActions) ? act.thenActions : [])
                        : (Array.isArray(act.elseActions) ? act.elseActions : []);
                    delta += walk(branch);
                }
            }
            return delta;
        };
        return walk(actions);
    }

    ensureExpressionVisiblePrefix(actionsOrScript, ownerCount, steps, opts = {}) {
        const scopeLevel = Math.max(-1, int(opts.scopeLevel ?? -1));
        const allowOrder = opts.allowOrder === true;
        const sequencedDepthList = Array.isArray(opts.sequencedDepths)
            ? opts.sequencedDepths.map((it) => int(it))
            : [];
        const sequencedDepths = new Set(sequencedDepthList);
        const expressionActions = [];
        let nativeGrowthActions = [];
        let sourceSignature = "";
        if (typeof actionsOrScript === "string") {
            const src = String(actionsOrScript || "").trim();
            if (src) {
                expressionActions.push({
                    type: "expression",
                    expression: transpileKotlinThisQualifierToJs(src),
                    expressionRaw: src,
                    fn: null
                });
                sourceSignature = `s:${src}`;
            }
        } else {
            const actionList = Array.isArray(actionsOrScript) ? actionsOrScript : [];
            for (const act of actionList) {
                if (act?.type === "expression" && String(act.expression || "").trim()) expressionActions.push(act);
            }
            nativeGrowthActions = this.collectPreviewGrowthNativeActions(actionList);
            const exprSig = expressionActions.map((act) => String(act.expression || "").trim()).join("\n--\n");
            const nativeSig = this.serializePreviewGrowthActions(nativeGrowthActions);
            sourceSignature = `${exprSig}\n##native##\n${nativeSig}`;
        }
        const growthApiRe = /\baddSingle\s*\(|\baddMultiple\s*\(/;
        const hasExprGrowthApi = expressionActions.some((act) => growthApiRe.test(String(act.expression || "")));
        const hasNativeGrowth = nativeGrowthActions.length > 0;
        if (!hasExprGrowthApi && !hasNativeGrowth) return null;
        const safeOwnerCount = Math.max(1, int(ownerCount || 1));
        const scopeSig = `${scopeLevel}|${allowOrder ? 1 : 0}|${Array.from(sequencedDepths).sort((a, b) => a - b).join(",")}`;
        const prefixKey = `${safeOwnerCount}|${scopeSig}|${sourceSignature}`;
        let prefix = this.previewExprPrefixCache.get(prefixKey);
        if (!prefix) {
            const prepared = [];
            for (const act of expressionActions) {
                const srcRaw = String(act.expressionRaw || act.expression || "").trim();
                const src = transpileKotlinThisQualifierToJs(srcRaw);
                if (!src) continue;
                let fn = null;
                if (this.previewExprFnCache.has(src)) {
                    fn = this.previewExprFnCache.get(src) || null;
                } else {
                    try {
                        fn = new Function(
                            "vars",
                            "point",
                            "rotateToPoint",
                            "rotateAsAxis",
                            "rotateToWithAngle",
                            "addSingle",
                            "addMultiple",
                            "thisAt",
                            `with(vars){ ${src}\n }; return point;`
                        );
                    } catch {
                        fn = null;
                    }
                    if (this.previewExprFnCache.size > 1024) this.previewExprFnCache.clear();
                    this.previewExprFnCache.set(src, fn);
                }
                if (typeof fn === "function") prepared.push(fn);
            }
            prefix = { counts: [0], actions: prepared, nativeGrowthActions };
            if (this.previewExprPrefixCache.size > 256) this.previewExprPrefixCache.clear();
            this.previewExprPrefixCache.set(prefixKey, prefix);
        }
        const counts = Array.isArray(prefix.counts) ? prefix.counts : [0];
        let visible = Number(counts[counts.length - 1]) || 0;
        const actions = Array.isArray(prefix.actions) ? prefix.actions : [];
        const nativeActions = Array.isArray(prefix.nativeGrowthActions) ? prefix.nativeGrowthActions : [];
        for (let t = counts.length; t <= steps; t++) {
            if (visible < safeOwnerCount) {
                if (nativeActions.length) {
                    const thisAt = (this.previewRuntimeGlobals && typeof this.previewRuntimeGlobals === "object")
                        ? this.previewRuntimeGlobals
                        : {};
                    visible += this.evaluatePreviewNativeGrowthDelta(nativeActions, t, {
                        scopeLevel,
                        allowOrder,
                        sequencedDepths: sequencedDepthList,
                        runtimeVars: thisAt,
                        pointIndex: 0,
                        ageTick: t
                    });
                }
                if (visible >= safeOwnerCount) {
                    counts[t] = safeOwnerCount;
                    continue;
                }
                for (const fn of actions) {
                    const thisAt = (this.previewRuntimeGlobals && typeof this.previewRuntimeGlobals === "object")
                        ? this.previewRuntimeGlobals
                        : {};
                    const vars = this.createRuntimeExpressionScope(t, t, 0, thisAt, true);
                    vars.rel = U.v(0, 0, 0);
                    if (allowOrder) vars.order = 0;
                    for (let d = 0; d < scopeLevel; d++) {
                        vars[`shapeRel${d}`] = U.v(0, 0, 0);
                        if (sequencedDepths.has(d)) vars[`shapeOrder${d}`] = 0;
                    }
                    vars.thisAt = thisAt;
                    const noop = () => {};
                    const addSingle = () => {
                        visible += 1;
                    };
                    const addMultiple = (n) => {
                        visible += Math.max(1, int(n || 1));
                    };
                    vars.rotateToPoint = noop;
                    try {
                        fn(vars, U.v(0, 0, 0), noop, noop, noop, addSingle, addMultiple, thisAt);
                    } catch {
                    }
                    if (visible >= safeOwnerCount) break;
                }
            }
            counts[t] = clamp(visible, 0, safeOwnerCount);
        }
        prefix.counts = counts;
        return {
            safeOwnerCount,
            counts
        };
    }

    resolveScaleFactor(rawScaleCfg, ageTick, cycleCfg = null) {
        const cfg = normalizeScaleHelperConfig(rawScaleCfg, { type: "none" });
        if (cfg.type === "none") return 1;
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const age = num(ageTick);
        const fadeStart = cycle.play;
        const inFade = age >= fadeStart;
        const fadeAge = Math.max(0, age - fadeStart);
        const tickMax = Math.max(1, int(cfg.tick || 1));
        const growTick = Math.min(tickMax, Math.max(0, age));
        let curveTick = growTick;
        if (cfg.reversedOnDisable && inFade) {
            const fadeSpan = Math.max(0, num(cycle.fade || 0));
            const fadeProgress = fadeSpan > 1e-6 ? clamp(fadeAge / fadeSpan, 0, 1) : 1;
            curveTick = tickMax * (1 - fadeProgress);
        }
        return this.evalScaleCurve(cfg, curveTick, tickMax);
    }

    evalScaleCurve(cfg, tickRaw, tickMaxRaw = 1) {
        const tickMax = Math.max(1, num(tickMaxRaw));
        const tick = clamp(num(tickRaw), 0, tickMax);
        if (cfg.type === "bezier") {
            return this.evalScaleBezierValue(cfg, tick, tickMax);
        }
        const t = tick / tickMax;
        return num(cfg.min) + (num(cfg.max) - num(cfg.min)) * t;
    }

    evalScaleBezierValue(cfg, xTickRaw, tickMaxRaw) {
        const tickMax = Math.max(1, num(tickMaxRaw));
        const xTick = clamp(num(xTickRaw), 0, tickMax);
        const p0x = 0;
        const p0y = num(cfg.min);
        let p1xRaw = num(cfg.c1x);
        let p2xRaw = num(cfg.c2x);
        if (Math.abs(p1xRaw) <= 1 && Math.abs(p2xRaw) <= 1) {
            p1xRaw *= tickMax;
            p2xRaw *= tickMax;
        }
        const p1x = clamp(p1xRaw, 0, tickMax);
        const p1y = num(cfg.c1y);
        const p2x = clamp(p2xRaw, 0, tickMax);
        const p2y = num(cfg.c2y);
        const p3x = tickMax;
        const p3y = num(cfg.max);

        const cubic = (a, b, c, d, t) => {
            const inv = 1 - t;
            return inv * inv * inv * a + 3 * inv * inv * t * b + 3 * inv * t * t * c + t * t * t * d;
        };

        if (xTick <= 0) return p0y;
        if (xTick >= tickMax) return p3y;

        let lo = 0;
        let hi = 1;
        let mid = 0.5;
        for (let i = 0; i < 26; i++) {
            mid = (lo + hi) * 0.5;
            const x = cubic(p0x, p1x, p2x, p3x, mid);
            if (x < xTick) lo = mid;
            else hi = mid;
        }
        return cubic(p0y, p1y, p2y, p3y, mid);
    }

    applyScaleFactorToPoint(point, scaleFactor) {
        const s = num(scaleFactor);
        if (Math.abs(s - 1) <= 1e-9) return point;
        return U.v(point.x * s, point.y * s, point.z * s);
    }

    getShapeLeafType(card) {
        if (!card || card.dataType === "single") return "single";
        const chain = this.getShapeChildChain(card);
        if (!chain.length) return "single";
        for (const lv of chain) {
            const t = String(lv?.type || "single");
            if (t === "single") return "single";
        }
        return "single";
    }

    resolveShapeSourcePoints(bindMode, point, builderState) {
        if (bindMode === "builder") {
            const built = this.evaluateBuilderPoints(builderState);
            const pts = [];
            for (const p of (built?.points || [])) {
                pts.push(U.v(num(p?.x), num(p?.y), num(p?.z)));
            }
            return pts;
        }
        return [U.v(num(point?.x), num(point?.y), num(point?.z))];
    }

    combineLocalPointSets(base, extra) {
        const a = Array.isArray(base) ? base : [];
        const b = Array.isArray(extra) ? extra : [];
        if (!a.length || !b.length) return [];
        const out = [];
        for (const p of a) {
            for (const q of b) {
                out.push(U.v(num(p?.x) + num(q?.x), num(p?.y) + num(q?.y), num(p?.z) + num(q?.z)));
            }
        }
        return out;
    }

    buildShapeLocalTuplesForPreview(card) {
        if (!card || card.dataType === "single") return [];
        const rootPoints = this.resolveShapeSourcePoints(card.shapeBindMode, card.shapePoint, card.shapeBuilderState);
        let tuples = rootPoints.map((p, idx) => {
            const vec = U.v(num(p?.x), num(p?.y), num(p?.z));
            return {
                sum: U.clone(vec),
                levels: [{ vec, ref: idx, offsetIndex: 0 }]
            };
        });
        if (!tuples.length) return [];

        const chain = this.getShapeChildChain(card);
        for (const levelRaw of chain) {
            const level = normalizeShapeNestedLevel(levelRaw);
            if (String(level.type || "single") === "single") break;
            const src = this.resolveShapeSourcePoints(level.bindMode, level.point, level.builderState);
            if (!src.length) return [];
            const levelOffsetCfg = this.resolvePreviewAngleOffsetConfig(level);
            const levelRepeatCount = levelOffsetCfg ? Math.max(1, int(levelOffsetCfg.count || 1)) : 1;
            const next = [];
            for (const tuple of tuples) {
                const baseLevels = Array.isArray(tuple?.levels) ? tuple.levels : [];
                const sumBase = tuple?.sum || U.v(0, 0, 0);
                for (let repeatIndex = 0; repeatIndex < levelRepeatCount; repeatIndex++) {
                    for (let si = 0; si < src.length; si++) {
                        const sp = src[si];
                        const sv = U.v(num(sp?.x), num(sp?.y), num(sp?.z));
                        const levels = baseLevels.map((lv) => ({
                            vec: U.v(num(lv?.vec?.x), num(lv?.vec?.y), num(lv?.vec?.z)),
                            ref: int(lv?.ref || 0),
                            offsetIndex: int(lv?.offsetIndex ?? 0)
                        }));
                        levels.push({ vec: U.clone(sv), ref: si, offsetIndex: repeatIndex });
                        next.push({
                            sum: U.v(num(sumBase?.x) + sv.x, num(sumBase?.y) + sv.y, num(sumBase?.z) + sv.z),
                            levels
                        });
                    }
                }
            }
            tuples = next;
            if (!tuples.length) break;
        }
        return tuples;
    }

    buildShapeLocalPointsForPreview(card) {
        const tuples = this.buildShapeLocalTuplesForPreview(card);
        return tuples.map((it) => U.v(num(it?.sum?.x), num(it?.sum?.y), num(it?.sum?.z)));
    }

    getShapeCompositionTypeAtDepth(card, depth = 0) {
        if (!card) return "single";
        const d = Math.max(0, int(depth));
        if (d === 0) return String(card.dataType || "single");
        if (d === 1) return String(card.shapeChildType || "single");
        const lv = this.getNestedShapeLevel(card, d - 1, false);
        return String(lv?.type || "single");
    }

    getShapeScopeInfoByRuntimeLevel(card, runtimeLevel = 0) {
        const level = Math.max(0, int(runtimeLevel));
        const maxShapeDepth = Math.max(-1, level - 1);
        const sequencedDepths = [];
        for (let d = 0; d <= maxShapeDepth; d++) {
            if (this.getShapeCompositionTypeAtDepth(card, d) === "sequenced_shape") {
                sequencedDepths.push(d);
            }
        }
        return {
            allowRel: true,
            allowOrder: this.state.compositionType === "sequenced",
            maxShapeDepth,
            sequencedDepths
        };
    }

    getShapeRuntimeLevelsForPreview(card, elapsedTick, skipExpression = false) {
        if (!card || card.dataType === "single") return [];
        const levels = [];
        const rootScope = this.getShapeScopeInfoByRuntimeLevel(card, 0);
        const rootActions = this.buildPreviewRuntimeActions(elapsedTick, card.shapeDisplayActions || [], {
            skipExpression,
            scope: "shape_display",
            cardId: card.id,
            scopeLevel: 0
        });
        levels.push({
            scopeLevel: 0,
            ancestorSequencedDepths: rootScope.sequencedDepths,
            sequenced: card.dataType === "sequenced_shape",
            growthAnimates: card.dataType === "sequenced_shape" ? (card.growthAnimates || []) : [],
            axis: this.resolveRelativeDirection(card.shapeAxisExpr || card.shapeAxisPreset || "RelativeLocation.yAxis()"),
            scale: normalizeScaleHelperConfig(card.shapeScale, { type: "none" }),
            angleOffset: this.resolvePreviewAngleOffsetConfig(card),
            actions: rootActions,
            hasExpression: !!rootActions.__hasExpression,
            hasPointDependentExpression: this.isPreviewActionsPointDependent(rootActions)
        });
        const chain = this.getShapeChildChain(card);
        for (let i = 0; i < chain.length; i++) {
            const lv = normalizeShapeNestedLevel(chain[i], i);
            if (lv.type === "single") break;
            const scope = this.getShapeScopeInfoByRuntimeLevel(card, i + 1);
            const actions = this.buildPreviewRuntimeActions(elapsedTick, lv.displayActions || [], {
                skipExpression,
                scope: "shape_level_display",
                cardId: card.id,
                scopeLevel: i + 1
            });
            levels.push({
                scopeLevel: i + 1,
                ancestorSequencedDepths: scope.sequencedDepths,
                sequenced: lv.type === "sequenced_shape",
                growthAnimates: lv.type === "sequenced_shape" ? (lv.growthAnimates || []) : [],
                axis: this.resolveRelativeDirection(lv.axisExpr || lv.axisPreset || "RelativeLocation.yAxis()"),
                scale: normalizeScaleHelperConfig(lv.scale, { type: "none" }),
                angleOffset: this.resolvePreviewAngleOffsetConfig(lv),
                actions,
                hasExpression: !!actions.__hasExpression,
                hasPointDependentExpression: this.isPreviewActionsPointDependent(actions)
            });
        }
        return levels;
    }

    resolvePreviewAngleOffsetConfig(raw) {
        if (!raw || raw.angleOffsetEnabled !== true) return null;
        const count = Math.max(1, int(raw.angleOffsetCount || 1));
        if (count <= 1) return null;
        return {
            count,
            glowTick: Math.max(1, int(raw.angleOffsetGlowTick || 20)),
            easeName: normalizeAngleOffsetEaseName(raw.angleOffsetEase || "outCubic"),
            reverseOnDisable: raw.angleOffsetReverseOnDisable === true,
            angleMode: raw.angleOffsetAngleMode === "expr" ? "expr" : "numeric",
            angleValue: Number.isFinite(Number(raw.angleOffsetAngleValue)) ? num(raw.angleOffsetAngleValue) : 360,
            angleUnit: normalizeAngleUnit(raw.angleOffsetAngleUnit || "deg"),
            angleExpr: String(raw.angleOffsetAngleExpr || raw.angleOffsetAnglePreset || "PI * 2")
        };
    }

    resolvePreviewAngleOffsetTotalAngle(cfg, elapsedTick, ageTick, pointIndex, runtimeVars) {
        if (!cfg) return 0;
        if (cfg.angleMode === "expr") {
            return num(this.evaluateNumericExpressionWithRuntime(cfg.angleExpr || "PI * 2", runtimeVars, {
                elapsedTick,
                ageTick,
                pointIndex,
                thisAtVars: runtimeVars
            }));
        }
        return U.angleToRad(num(cfg.angleValue), normalizeAngleUnit(cfg.angleUnit));
    }

    resolvePreviewAngleOffsetRotation(cfg, repeatIndex, elapsedTick, ageTick, pointIndex, runtimeVars, statusElapsedTick = elapsedTick) {
        if (!cfg) return 0;
        const count = Math.max(1, int(cfg.count || 1));
        if (count <= 1) return 0;
        const index = clamp(int(repeatIndex || 0), 0, count - 1);
        const totalAngle = this.resolvePreviewAngleOffsetTotalAngle(cfg, elapsedTick, ageTick, pointIndex, runtimeVars);
        const targetAngle = totalAngle * index / count;
        const statusTick = Number.isFinite(Number(statusElapsedTick)) ? num(statusElapsedTick) : num(elapsedTick);
        return computeAngleAnimatorAngle({
            targetAngle,
            glowTick: Math.max(1, int(cfg.glowTick || 20)),
            easeName: normalizeAngleOffsetEaseName(cfg.easeName || "outCubic"),
            ageTick,
            elapsedTick,
            statusElapsedTick: statusTick,
            reverseOnDisable: cfg.reverseOnDisable === true,
            status: runtimeVars?.status || null
        });
    }

    isPreviewExpressionPointDependent(scriptRaw = "") {
        const src = stripJsForLint(transpileKotlinThisQualifierToJs(scriptRaw));
        if (!src) return false;
        if (/\b(?:index|order|rel|point)\b/.test(src)) return true;
        if (/\bshapeRel\d+\b/.test(src)) return true;
        if (/\bshapeOrder\d+\b/.test(src)) return true;
        return false;
    }

    isPreviewActionsPointDependent(actions = []) {
        for (const act of (Array.isArray(actions) ? actions : [])) {
            if (act?.type !== "expression") continue;
            const src = String(act.expressionRaw || act.expression || "").trim();
            if (!src) continue;
            if (this.isPreviewExpressionPointDependent(src)) return true;
        }
        return false;
    }

    extractLastAssignedExprInScript(scriptRaw, names = []) {
        const src = String(scriptRaw || "");
        if (!src || !Array.isArray(names) || !names.length) return "";
        let out = "";
        for (const rawName of names) {
            const name = String(rawName || "").trim();
            if (!name) continue;
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`(?:^|[;\\n])\\s*(?:let\\s+|var\\s+|const\\s+)?${escaped}\\s*=\\s*(?![=])([^;\\n]+)`, "g");
            let m = null;
            while ((m = re.exec(src)) !== null) {
                const expr = String(m[1] || "").trim();
                if (expr) out = expr;
            }
        }
        return out;
    }

    ensureControllerRuntimeProtos() {
        if (this.controllerScopeProto && this.controllerParticleProto) return;
        this.controllerScopeProto = {
            get color() { return this._ctx.color; },
            set color(v) { this._ctx.setColor(v); },
            get particleColor() { return this._ctx.particleColor; },
            set particleColor(v) { this._ctx.setColor(v); },
            get size() { return this._ctx.size; },
            set size(v) { this._ctx.setSize(v); },
            get particleSize() { return this._ctx.particleSize; },
            set particleSize(v) { this._ctx.setSize(v); },
            get alpha() { return this._ctx.alpha; },
            set alpha(v) { this._ctx.setAlpha(v); },
            get particleAlpha() { return this._ctx.particleAlpha; },
            set particleAlpha(v) { this._ctx.setAlpha(v); },
            get currentAge() { return this._ctx.currentAge; },
            set currentAge(v) { this._ctx.currentAge = int(v); },
            get textureSheet() { return this._ctx.textureSheet; },
            set textureSheet(v) { this._ctx.textureSheet = int(v); },
            get status() { return this._ctx.status; },
            set status(v) {
                const next = ensureStatusHelperMethods((v && typeof v === "object") ? v : { displayStatus: 1 });
                this._ctx.status = next;
                this._ctx.thisAt.status = next;
            }
        };
        this.controllerParticleProto = {
            get particleColor() { return this._ctx.particleColor; },
            set particleColor(v) { this._ctx.setColor(v); },
            get particleSize() { return this._ctx.particleSize; },
            set particleSize(v) { this._ctx.setSize(v); },
            get particleAlpha() { return this._ctx.particleAlpha; },
            set particleAlpha(v) { this._ctx.setAlpha(v); },
            get currentAge() { return this._ctx.currentAge; },
            set currentAge(v) { this._ctx.currentAge = int(v); },
            get textureSheet() { return this._ctx.textureSheet; },
            set textureSheet(v) { this._ctx.textureSheet = int(v); }
        };
    }

    applyControllerScriptVisual(visual, scriptRaw, opts = {}) {
        const srcRaw = String(scriptRaw || "").trim();
        if (!visual || !srcRaw) return;
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const runtimeCtx = Object.assign({}, runtimeVars || {});
        const thisAtVars = (runtimeVars && typeof runtimeVars === "object") ? runtimeVars : runtimeCtx;
        let statusRef = (thisAtVars.status && typeof thisAtVars.status === "object")
            ? thisAtVars.status
            : {};
        statusRef = ensureStatusHelperMethods(statusRef);
        thisAtVars.status = statusRef;
        runtimeCtx.status = statusRef;

        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const readVec = (expr) => this.parseVecLikeValueWithRuntime(expr, runtimeCtx, {
            elapsedTick,
            ageTick,
            pointIndex,
            thisAtVars
        });
        const toVec = (value, fallback = U.v(0, 0, 0)) => {
            if (value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)) {
                return U.v(num(value.x), num(value.y), num(value.z));
            }
            if (typeof value === "string") {
                return readVec(value);
            }
            return fallback;
        };
        const setColor = (value) => {
            const vec = toVec(value, U.v(0, 0, 0));
            runtimeCtx.color = vec;
            runtimeCtx.particleColor = vec;
        };
        const setSize = (value) => {
            const v = Math.max(0.05, num(value));
            runtimeCtx.size = v;
            runtimeCtx.particleSize = v;
        };
        const setAlpha = (value) => {
            const v = clamp(num(value), 0, 1);
            runtimeCtx.alpha = v;
            runtimeCtx.particleAlpha = v;
        };

        setColor(U.v(
            clamp(num(visual.color?.[0]), 0, 1),
            clamp(num(visual.color?.[1]), 0, 1),
            clamp(num(visual.color?.[2]), 0, 1)
        ));
        setSize(visual.size);
        setAlpha(visual.alpha);
        runtimeCtx.currentAge = num(runtimeCtx.currentAge || 0);
        runtimeCtx.textureSheet = num(runtimeCtx.textureSheet || 0);
        runtimeCtx.setColor = setColor;
        runtimeCtx.setSize = setSize;
        runtimeCtx.setAlpha = setAlpha;
        runtimeCtx.thisAt = thisAtVars;

        this.ensureControllerRuntimeProtos();
        const baseVars = this.getExpressionVars(elapsedTick, ageTick, pointIndex, { includeVectors: true });
        const vars = Object.create(this.controllerScopeProto);
        vars._ctx = runtimeCtx;
        const baseProto = Object.getPrototypeOf(baseVars) || {};
        for (const [k, v] of Object.entries(baseProto)) {
            if (CONTROLLER_SCOPE_RESERVED.has(k)) continue;
            vars[k] = v;
        }
        for (const [k, v] of Object.entries(baseVars)) {
            if (CONTROLLER_SCOPE_RESERVED.has(k)) continue;
            vars[k] = v;
        }
        vars.age = num(baseVars.age);
        vars.tick = num(baseVars.tick);
        vars.index = int(baseVars.index);
        vars.thisAt = thisAtVars;
        for (const [k, v] of Object.entries(runtimeCtx)) {
            if (CONTROLLER_SCOPE_RESERVED.has(k)) continue;
            vars[k] = v;
        }

        const particle = Object.create(this.controllerParticleProto);
        particle._ctx = runtimeCtx;
        vars.particle = particle;

        const src = transpileKotlinThisQualifierToJs(srcRaw);
        const compileKey = String(opts.compileKey || "");
        const fn = compileKey
            ? this.getPreviewCompiledScriptFn(compileKey, src)
            : this.previewControllerFnCache.get(src);
        if (typeof fn === "function") {
            const noop = () => {};
            try {
                fn(vars, U.v(0, 0, 0), particle, noop, noop, noop, noop, noop, noop, thisAtVars);
            } catch {
            }
        }

        setColor(runtimeCtx.color);
        setSize(runtimeCtx.size);
        setAlpha(runtimeCtx.alpha);
        let statusOut = (runtimeCtx.status && typeof runtimeCtx.status === "object") ? runtimeCtx.status : statusRef;
        const hasManualStatusAssign = /(^|[;\n])\s*(?:thisAt\.)?status\.(?:displayStatus\s*=(?!=)|disable\s*\(|enable\s*\()/.test(src);
        if (hasManualStatusAssign) statusOut.__manualDisplayStatus = true;
        else if (Object.prototype.hasOwnProperty.call(statusOut, "__manualDisplayStatus")) delete statusOut.__manualDisplayStatus;
        statusOut = ensureStatusHelperMethods(statusOut);
        if (statusOut.displayStatus !== 2 && Object.prototype.hasOwnProperty.call(statusOut, "__dissolveStartTick")) {
            delete statusOut.__dissolveStartTick;
        }
        runtimeCtx.status = statusOut;
        thisAtVars.status = statusOut;

        visual.color = [
            clamp(num(runtimeCtx.color?.x), 0, 1),
            clamp(num(runtimeCtx.color?.y), 0, 1),
            clamp(num(runtimeCtx.color?.z), 0, 1)
        ];
        visual.size = Math.max(0.05, num(runtimeCtx.size));
        visual.alpha = clamp(num(runtimeCtx.alpha), 0, 1);
    }

    resolveCardPreviewVisual(cardId, opts = {}) {
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const fallback = { color: this.getCardColorRgb(cardId), size: 0.2, alpha: 1 };
        const card = this.getCardById(cardId);
        if (!card) return fallback;
        const useSingleInit = card.dataType === "single"
            || (card.dataType !== "single" && this.getShapeLeafType(card) === "single");
        if (!useSingleInit) return fallback;
        const visual = { color: [...fallback.color], size: 0.2, alpha: 1 };
        for (const it of (card.particleInit || [])) {
            const target = String(it.target || "").trim().toLowerCase();
            const expr = String(it.expr || "").trim();
            if (!expr) continue;
            if (target === "color" || target === "particlecolor" || target === "particle.particlecolor") {
                const vec = this.parseVecLikeValueWithRuntime(expr, runtimeVars, { elapsedTick, ageTick, pointIndex });
                visual.color = [clamp(num(vec.x), 0, 1), clamp(num(vec.y), 0, 1), clamp(num(vec.z), 0, 1)];
            }
            if (target === "size" || target === "particlesize" || target === "particle.particlesize") {
                visual.size = Math.max(0.05, num(this.evaluateNumericExpressionWithRuntime(expr, runtimeVars, { elapsedTick, ageTick, pointIndex })));
            }
            if (target === "alpha" || target === "particlealpha" || target === "particle.particlealpha") {
                visual.alpha = clamp(num(this.evaluateNumericExpressionWithRuntime(expr, runtimeVars, { elapsedTick, ageTick, pointIndex })), 0, 1);
            }
        }
        const controllerActions = Array.isArray(card.controllerActions) ? card.controllerActions : [];
        for (let actionIdx = 0; actionIdx < controllerActions.length; actionIdx++) {
            const action = controllerActions[actionIdx];
            const compileKey = this.makePreviewControllerScriptCompileKey(card.id, actionIdx);
            this.applyControllerScriptVisual(visual, String(action?.script || ""), {
                runtimeVars,
                elapsedTick,
                ageTick,
                pointIndex,
                compileKey
            });
        }
        return visual;
    }

    isScriptAgeDependent(scriptRaw = "") {
        const src = stripJsForLint(transpileKotlinThisQualifierToJs(scriptRaw));
        return /\bage\b/.test(src);
    }

    isCardVisualAgeDependent(card) {
        if (!card) return false;
        for (const it of (card.particleInit || [])) {
            const target = String(it?.target || "").trim().toLowerCase();
            if (target !== "color" && target !== "particlecolor" && target !== "particle.particlecolor"
                && target !== "size" && target !== "particlesize" && target !== "particle.particlesize"
                && target !== "alpha" && target !== "particlealpha" && target !== "particle.particlealpha") {
                continue;
            }
            if (this.isScriptAgeDependent(String(it?.expr || ""))) return true;
        }
        for (const action of (card.controllerActions || [])) {
            if (this.isScriptAgeDependent(String(action?.script || ""))) return true;
        }
        return false;
    }

    computeAnimateVisibleCount(list, ageTick, tick, index) {
        const arr = Array.isArray(list) ? list.map((it) => normalizeAnimate(it)) : [];
        if (!arr.length) return Number.POSITIVE_INFINITY;
        let count = 0;
        for (const it of arr) {
            if (!this.evaluateAnimateCondition(it.condition, ageTick, tick, index)) continue;
            count += Math.max(1, int(it.count || 1));
        }
        return count;
    }

    evaluateAnimateCondition(exprRaw, ageTick, tick, index) {
        const expr = String(exprRaw || "").trim();
        if (!expr) return true;
        const vars = this.getExpressionVars(tick, ageTick, index);
        const fn = this.getPreviewConditionFn(expr);
        if (typeof fn !== "function") return false;
        try {
            return !!fn(vars);
        } catch {
            return false;
        }
    }

    buildPreviewRuntimeActions(elapsedTick, rawActions = null, opts = {}) {
        const skipExpression = !!opts.skipExpression;
        const cardId = String(opts.cardId || "");
        const scope = String(opts.scope || "display");
        const scopeLevel = Number.isFinite(Number(opts.scopeLevel))
            ? int(opts.scopeLevel)
            : (scope === "shape_display" ? 0 : (scope === "display" ? -1 : 1));
        const out = [];
        let hasExpression = false;
        let hasNonExpression = false;
        const source = Array.isArray(rawActions) ? rawActions : (this.state.displayActions || []);
        for (let actionIdx = 0; actionIdx < source.length; actionIdx++) {
            const action = source[actionIdx];
            const a = normalizeDisplayAction(action);
            if (a.type === "rotateToPoint") {
                out.push({ type: a.type, to: this.resolveRelativeDirection(a.toExpr || a.toPreset) });
                hasNonExpression = true;
                continue;
            }
            if (a.type === "rotateAsAxis") {
                const anglePerTick = this.resolveActionAnglePerTick(a, elapsedTick, elapsedTick, 0);
                out.push({ type: a.type, anglePerTick });
                hasNonExpression = true;
                continue;
            }
            if (a.type === "rotateToWithAngle") {
                const to = this.resolveRelativeDirection(a.toExpr || a.toPreset);
                const anglePerTick = this.resolveActionAnglePerTick(a, elapsedTick, elapsedTick, 0);
                out.push({ type: a.type, to, anglePerTick });
                hasNonExpression = true;
                continue;
            }
            if (a.type === "expression") {
                if (skipExpression) continue;
                const srcRaw = String(a.expression || "").trim();
                const src = transpileKotlinThisQualifierToJs(srcRaw);
                const compileKey = this.makePreviewDisplayActionCompileKey(scope, cardId, scopeLevel, actionIdx);
                const folded = this.tryFoldSimpleExpressionAction(srcRaw, elapsedTick, { compileKey });
                if (folded) {
                    if (folded.type === "conditional_native") {
                        out.push({
                            ...folded,
                            compileKey
                        });
                    } else if (folded.type === "folded_sequence" && Array.isArray(folded.actions) && folded.actions.length) {
                        for (const item of folded.actions) out.push(item);
                    } else {
                        out.push(folded);
                    }
                    hasNonExpression = true;
                    continue;
                }
                let fn = null;
                if (src) {
                    fn = this.getPreviewCompiledScriptFn(compileKey, src);
                    hasExpression = true;
                }
                out.push({ type: a.type, expression: src, expressionRaw: srcRaw, fn, compileKey });
            }
        }
        out.__hasExpression = hasExpression;
        out.__allExpression = out.length > 0 && !hasNonExpression;
        return out;
    }

    getPreviewConditionFn(exprRaw = "") {
        const expr = String(exprRaw || "").trim();
        if (!expr) return null;
        let fn = this.previewCondFnCache.get(expr);
        if (fn === undefined) {
            try {
                fn = new Function("vars", `with(vars){ return !!(${expr}\n); }`);
            } catch {
                fn = null;
            }
            if (this.previewCondFnCache.size > 1024) this.previewCondFnCache.clear();
            this.previewCondFnCache.set(expr, fn);
        }
        return (typeof fn === "function") ? fn : null;
    }

    splitTopLevelArgs(argsRaw) {
        const src = String(argsRaw || "");
        const out = [];
        let start = 0;
        let depthParen = 0;
        let depthBracket = 0;
        let depthBrace = 0;
        let inSingle = false;
        let inDouble = false;
        let escaped = false;
        for (let i = 0; i < src.length; i++) {
            const ch = src[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                escaped = true;
                continue;
            }
            if (inSingle) {
                if (ch === "'") inSingle = false;
                continue;
            }
            if (inDouble) {
                if (ch === "\"") inDouble = false;
                continue;
            }
            if (ch === "'") {
                inSingle = true;
                continue;
            }
            if (ch === "\"") {
                inDouble = true;
                continue;
            }
            if (ch === "(") depthParen++;
            else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
            else if (ch === "[") depthBracket++;
            else if (ch === "]") depthBracket = Math.max(0, depthBracket - 1);
            else if (ch === "{") depthBrace++;
            else if (ch === "}") depthBrace = Math.max(0, depthBrace - 1);
            else if (ch === "," && depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
                out.push(src.slice(start, i).trim());
                start = i + 1;
            }
        }
        out.push(src.slice(start).trim());
        return out.filter((x) => x.length > 0);
    }

    isFoldableStaticNumericExpr(exprRaw) {
        const src = String(exprRaw || "").trim().replace(/\bMath\.PI\b/g, "PI").replace(/\bMath\.E\b/g, "E");
        if (!src) return false;
        return /^[0-9eE+\-*/().\sPI]+$/.test(src);
    }

    splitTopLevelStatements(sourceRaw) {
        const src = String(sourceRaw || "");
        const out = [];
        let start = 0;
        let depthParen = 0;
        let depthBracket = 0;
        let depthBrace = 0;
        let inSingle = false;
        let inDouble = false;
        let escaped = false;
        for (let i = 0; i < src.length; i++) {
            const ch = src[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === "\\") {
                escaped = true;
                continue;
            }
            if (inSingle) {
                if (ch === "'") inSingle = false;
                continue;
            }
            if (inDouble) {
                if (ch === "\"") inDouble = false;
                continue;
            }
            if (ch === "'") {
                inSingle = true;
                continue;
            }
            if (ch === "\"") {
                inDouble = true;
                continue;
            }
            if (ch === "(") depthParen++;
            else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
            else if (ch === "[") depthBracket++;
            else if (ch === "]") depthBracket = Math.max(0, depthBracket - 1);
            else if (ch === "{") depthBrace++;
            else if (ch === "}") depthBrace = Math.max(0, depthBrace - 1);
            const atTop = depthParen === 0 && depthBracket === 0 && depthBrace === 0;
            const isLineBreak = ch === "\n" || ch === "\r";
            if (atTop && (ch === ";" || isLineBreak)) {
                const segment = src.slice(start, i).trim().replace(/;+$/g, "").trim();
                if (segment) out.push(segment);
                if (ch === "\r" && src[i + 1] === "\n") i += 1;
                start = i + 1;
            }
        }
        const tail = src.slice(start).trim().replace(/;+$/g, "").trim();
        if (tail) out.push(tail);
        return out;
    }

    foldStaticActionStatements(sourceRaw, elapsedTick = 0) {
        const dynamicTokenRe = /\b(?:tick|tickCount|age|index|order|rel|shapeRel\d*|shapeOrder\d*|thisAt|particle|status)\b/;
        const statements = this.splitTopLevelStatements(sourceRaw);
        if (!statements.length) return [];
        const list = [];
        for (const stmt of statements) {
            const folded = this.tryFoldSingleExpressionStatement(stmt, dynamicTokenRe, elapsedTick);
            if (!folded) return null;
            list.push(folded);
        }
        return this.compactFoldedStaticActions(list);
    }

    tryFoldSimpleConditionalExpression(cleanSource, elapsedTick = 0) {
        const src = String(cleanSource || "").trim();
        if (!src.startsWith("if")) return null;
        const m = src.match(/^if\s*\(\s*([\s\S]+?)\s*\)\s*\{([\s\S]*?)\}\s*(?:else\s*\{([\s\S]*?)\}\s*)?$/);
        if (!m) return null;
        const condExpr = String(m[1] || "").trim();
        if (!condExpr) return null;
        // Keep this fold only for condition expressions independent from per-point context.
        const pointDependentCondRe = /\b(?:age|index|rel|shapeRel\d*|order|shapeOrder\d*|particle)\b/;
        if (pointDependentCondRe.test(condExpr)) return null;
        const thenActions = this.foldStaticActionStatements(m[2], elapsedTick);
        if (!thenActions || !thenActions.length) return null;
        let elseActions = [];
        const elseRaw = String(m[3] || "").trim();
        if (elseRaw) {
            elseActions = this.foldStaticActionStatements(elseRaw, elapsedTick);
            if (!elseActions) return null;
        }
        const fn = this.getPreviewConditionFn(condExpr);
        if (typeof fn !== "function") return null;
        return {
            type: "conditional_native",
            conditionExpr: condExpr,
            conditionFn: fn,
            pointIndependent: true,
            thenActions,
            elseActions
        };
    }

    isSameFoldedDirection(a, b, eps = 1e-7) {
        if (!a || !b) return false;
        const ax = num(a.x);
        const ay = num(a.y);
        const az = num(a.z);
        const bx = num(b.x);
        const by = num(b.y);
        const bz = num(b.z);
        return Math.abs(ax - bx) <= eps
            && Math.abs(ay - by) <= eps
            && Math.abs(az - bz) <= eps;
    }

    compactFoldedStaticActions(actionsRaw) {
        const src = Array.isArray(actionsRaw) ? actionsRaw : [];
        if (!src.length) return [];
        const out = [];
        for (const item of src) {
            if (!item || typeof item !== "object") continue;
            const cur = item;
            const last = out.length ? out[out.length - 1] : null;
            if (last && last.type === "rotateAsAxis" && cur.type === "rotateAsAxis") {
                last.anglePerTick = num(last.anglePerTick) + num(cur.anglePerTick);
                continue;
            }
            if (last && last.type === "rotateToPoint" && cur.type === "rotateToPoint" && this.isSameFoldedDirection(last.to, cur.to)) {
                continue;
            }
            if (last && last.type === "rotateToWithAngle" && cur.type === "rotateToWithAngle" && this.isSameFoldedDirection(last.to, cur.to)) {
                last.anglePerTick = num(last.anglePerTick) + num(cur.anglePerTick);
                continue;
            }
            if (last && last.type === "growth_add" && cur.type === "growth_add") {
                last.count = Math.max(1, int(last.count || 1)) + Math.max(1, int(cur.count || 1));
                continue;
            }
            out.push({
                ...cur,
                to: (cur.to && typeof cur.to === "object")
                    ? { x: num(cur.to.x), y: num(cur.to.y), z: num(cur.to.z) }
                    : cur.to
            });
        }
        return out;
    }

    tryParseFoldableStaticVecExpr(exprRaw, elapsedTick = 0) {
        const src = String(exprRaw || "").trim();
        if (!src) return null;
        if (src === "Vec3.ZERO") return U.v(0, 0, 0);
        if (src === "RelativeLocation.yAxis()") return U.v(0, 1, 0);
        const m = src.match(/^(?:Vec3|RelativeLocation|Vector3f)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)(?:\s*\.asRelative\(\))?$/i);
        if (!m) return null;
        const xExpr = String(m[1] || "").trim();
        const yExpr = String(m[2] || "").trim();
        const zExpr = String(m[3] || "").trim();
        if (!this.isFoldableStaticNumericExpr(xExpr) || !this.isFoldableStaticNumericExpr(yExpr) || !this.isFoldableStaticNumericExpr(zExpr)) {
            return null;
        }
        const x = num(this.evaluateNumericExpression(xExpr, {
            elapsedTick: num(elapsedTick),
            ageTick: num(elapsedTick),
            pointIndex: 0,
            includeVectors: false
        }));
        const y = num(this.evaluateNumericExpression(yExpr, {
            elapsedTick: num(elapsedTick),
            ageTick: num(elapsedTick),
            pointIndex: 0,
            includeVectors: false
        }));
        const z = num(this.evaluateNumericExpression(zExpr, {
            elapsedTick: num(elapsedTick),
            ageTick: num(elapsedTick),
            pointIndex: 0,
            includeVectors: false
        }));
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        return U.v(x, y, z);
    }

    tryFoldSingleExpressionStatement(stmtRaw, dynamicTokenRe, elapsedTick = 0) {
        const stmt = String(stmtRaw || "").trim();
        if (!stmt) return null;
        const mAddSingle = stmt.match(/^addSingle\s*\(\s*([\s\S]*?)\s*\)$/);
        if (mAddSingle) {
            const argExpr = String(mAddSingle[1] || "").trim();
            if (argExpr && dynamicTokenRe.test(argExpr)) return null;
            return { type: "growth_add", count: 1 };
        }
        const mAddMultiple = stmt.match(/^addMultiple\s*\(\s*([\s\S]*?)\s*\)$/);
        if (mAddMultiple) {
            const countExpr = String(mAddMultiple[1] || "").trim();
            if (!countExpr) return { type: "growth_add", count: 1 };
            if (dynamicTokenRe.test(countExpr) || !this.isFoldableStaticNumericExpr(countExpr)) return null;
            const count = Math.max(1, int(this.evaluateNumericExpression(countExpr, {
                elapsedTick: num(elapsedTick),
                ageTick: num(elapsedTick),
                pointIndex: 0,
                includeVectors: false
            })));
            return { type: "growth_add", count };
        }
        const mRotateAsAxis = stmt.match(/^rotateAsAxis\s*\(\s*([\s\S]+?)\s*\)$/);
        if (mRotateAsAxis) {
            const angleExpr = String(mRotateAsAxis[1] || "").trim();
            if (!angleExpr || dynamicTokenRe.test(angleExpr) || !this.isFoldableStaticNumericExpr(angleExpr)) return null;
            const anglePerTick = num(this.evaluateNumericExpression(angleExpr, {
                elapsedTick: num(elapsedTick),
                ageTick: num(elapsedTick),
                pointIndex: 0,
                includeVectors: false
            }));
            if (!Number.isFinite(anglePerTick)) return null;
            return { type: "rotateAsAxis", anglePerTick };
        }
        const mRotateToPoint = stmt.match(/^rotateToPoint\s*\(\s*([\s\S]+?)\s*\)$/);
        if (mRotateToPoint) {
            const toExpr = String(mRotateToPoint[1] || "").trim();
            if (!toExpr || dynamicTokenRe.test(toExpr)) return null;
            const toVec = this.tryParseFoldableStaticVecExpr(toExpr, elapsedTick);
            if (!toVec) return null;
            return { type: "rotateToPoint", to: this.parseJsVec(toVec) };
        }
        const mRotateToWithAngle = stmt.match(/^rotateToWithAngle\s*\(\s*([\s\S]+)\s*\)$/);
        if (mRotateToWithAngle) {
            const args = this.splitTopLevelArgs(mRotateToWithAngle[1]);
            if (args.length !== 2) return null;
            const toExpr = String(args[0] || "").trim();
            const angleExpr = String(args[1] || "").trim();
            if (!toExpr || !angleExpr || dynamicTokenRe.test(toExpr) || dynamicTokenRe.test(angleExpr)) return null;
            const toVec = this.tryParseFoldableStaticVecExpr(toExpr, elapsedTick);
            if (!toVec || !this.isFoldableStaticNumericExpr(angleExpr)) return null;
            const anglePerTick = num(this.evaluateNumericExpression(angleExpr, {
                elapsedTick: num(elapsedTick),
                ageTick: num(elapsedTick),
                pointIndex: 0,
                includeVectors: false
            }));
            if (!Number.isFinite(anglePerTick)) return null;
            return { type: "rotateToWithAngle", to: this.parseJsVec(toVec), anglePerTick };
        }
        return null;
    }

    tryFoldSimpleExpressionAction(srcRaw, elapsedTick = 0, opts = {}) {
        const src = String(transpileKotlinThisQualifierToJs(srcRaw || "")).trim();
        if (!src) return null;
        const clean = src.replace(/^\s*;+|;+\s*$/g, "").trim();
        if (!clean) return null;
        const cache = (this.previewFoldSimpleActionCache instanceof Map)
            ? this.previewFoldSimpleActionCache
            : (this.previewFoldSimpleActionCache = new Map());
        if (cache.has(clean)) return cache.get(clean);
        const conditional = this.tryFoldSimpleConditionalExpression(clean, elapsedTick, opts);
        if (conditional) {
            cache.set(clean, conditional);
            return conditional;
        }
        const dynamicTokenRe = /\b(?:tick|tickCount|age|index|order|rel|shapeRel\d*|shapeOrder\d*|thisAt|particle|status)\b/;
        const statements = this.splitTopLevelStatements(clean);
        if (statements.length > 1) {
            const list = [];
            for (const stmt of statements) {
                const folded = this.tryFoldSingleExpressionStatement(stmt, dynamicTokenRe, elapsedTick);
                if (!folded) {
                    cache.set(clean, null);
                    return null;
                }
                list.push(folded);
            }
            const compacted = this.compactFoldedStaticActions(list);
            if (!compacted.length) {
                cache.set(clean, null);
                return null;
            }
            const folded = compacted.length === 1 ? compacted[0] : { type: "folded_sequence", actions: compacted };
            cache.set(clean, folded);
            return folded;
        }
        const single = this.tryFoldSingleExpressionStatement(clean, dynamicTokenRe, elapsedTick);
        cache.set(clean, single || null);
        return single || null;
    }

    applyRuntimeActionsToPoint(point, runtimeActions, elapsedTick, ageTick, pointIndex, startAxis = null, opts = {}) {
        const list = Array.isArray(runtimeActions) ? runtimeActions : [];
        if (!list.length) return point;
        const skipExpression = !!opts.skipExpression;
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const persistExpressionVars = !!opts.persistExpressionVars;
        const shapeScope = (opts.shapeScope && typeof opts.shapeScope === "object") ? opts.shapeScope : null;
        if (skipExpression && (list.__allExpression === true || list.every((a) => a?.type === "expression"))) return point;
        let p = U.clone(point);
        let axis = (startAxis && typeof startAxis === "object" && Number.isFinite(startAxis.x) && Number.isFinite(startAxis.y) && Number.isFinite(startAxis.z))
            ? startAxis
            : this.parseJsVec(startAxis || this.resolveCompositionAxisDirection());
        const accum = Math.max(0, num(elapsedTick));
        const applyNativeAction = (nativeAction) => {
            if (!nativeAction || typeof nativeAction !== "object") return false;
            if (nativeAction.type === "growth_add") {
                return true;
            }
            if (nativeAction.type === "rotateToPoint") {
                const dir = (nativeAction.to && typeof nativeAction.to === "object" && Number.isFinite(nativeAction.to.x) && Number.isFinite(nativeAction.to.y) && Number.isFinite(nativeAction.to.z))
                    ? nativeAction.to
                    : this.parseJsVec(nativeAction.to);
                p = this.rotatePointToDirection(p, dir, axis);
                axis = U.clone(dir);
                return true;
            }
            if (nativeAction.type === "rotateAsAxis") {
                const perTick = num(nativeAction.anglePerTick ?? nativeAction.angle ?? 0);
                const angle = ((perTick * accum) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                p = this.rotateAroundUnitAxis(p, axis, angle);
                return true;
            }
            if (nativeAction.type === "rotateToWithAngle") {
                const dir = (nativeAction.to && typeof nativeAction.to === "object" && Number.isFinite(nativeAction.to.x) && Number.isFinite(nativeAction.to.y) && Number.isFinite(nativeAction.to.z))
                    ? nativeAction.to
                    : this.parseJsVec(nativeAction.to);
                p = this.rotatePointToDirection(p, dir, axis);
                const perTick = num(nativeAction.anglePerTick ?? nativeAction.angle ?? 0);
                const angle = ((perTick * accum) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                p = this.rotateAroundUnitAxis(p, dir, angle);
                axis = U.clone(dir);
                return true;
            }
            return false;
        };
        const evaluateConditionalNative = (condAction) => {
            if (!condAction || condAction.type !== "conditional_native") return false;
            const fn = (typeof condAction.conditionFn === "function")
                ? condAction.conditionFn
                : this.getPreviewConditionFn(condAction.conditionExpr);
            if (typeof fn !== "function") return false;
            if (condAction.pointIndependent === true && runtimeVars && typeof runtimeVars === "object") {
                const cacheKey = String(condAction.compileKey || condAction.conditionExpr || "");
                if (cacheKey) {
                    let condCache = runtimeVars.__cpbCondCache;
                    if (!condCache || typeof condCache !== "object") {
                        condCache = {};
                        runtimeVars.__cpbCondCache = condCache;
                    }
                    const stamp = int(num(elapsedTick) * 1000);
                    const hit = condCache[cacheKey];
                    if (hit && int(hit.stamp) === stamp) return !!hit.value;
                    const vars = this.createRuntimeExpressionScope(elapsedTick, ageTick, pointIndex, runtimeVars, true);
                    vars.thisAt = runtimeVars;
                    let value = false;
                    try {
                        value = !!fn(vars);
                    } catch {
                        value = false;
                    }
                    condCache[cacheKey] = { stamp, value };
                    return value;
                }
            }
            const vars = this.createRuntimeExpressionScope(elapsedTick, ageTick, pointIndex, runtimeVars, true);
            vars.thisAt = runtimeVars || {};
            if (shapeScope) {
                if (shapeScope.rel && Number.isFinite(shapeScope.rel.x) && Number.isFinite(shapeScope.rel.y) && Number.isFinite(shapeScope.rel.z)) {
                    vars.rel = shapeScope.rel;
                }
                if (Number.isFinite(Number(shapeScope.order))) vars.order = int(shapeScope.order);
                const rels = Array.isArray(shapeScope.shapeRels) ? shapeScope.shapeRels : [];
                const orders = Array.isArray(shapeScope.shapeOrders) ? shapeScope.shapeOrders : [];
                for (let i = 0; i < rels.length; i++) {
                    const rv = rels[i];
                    if (rv && Number.isFinite(rv.x) && Number.isFinite(rv.y) && Number.isFinite(rv.z)) vars[`shapeRel${i}`] = rv;
                    if (Number.isFinite(Number(orders[i]))) vars[`shapeOrder${i}`] = int(orders[i]);
                }
            }
            try {
                return !!fn(vars);
            } catch {
                return false;
            }
        };
        for (const a of list) {
            if (applyNativeAction(a)) continue;
            if (a.type === "conditional_native") {
                const pass = evaluateConditionalNative(a);
                const branch = pass
                    ? (Array.isArray(a.thenActions) ? a.thenActions : [])
                    : (Array.isArray(a.elseActions) ? a.elseActions : []);
                for (const ba of branch) {
                    applyNativeAction(ba);
                }
                continue;
            }
            if (a.type === "expression") {
                if (skipExpression) continue;
                const res = this.applyExpressionActionToPoint(a, p, elapsedTick, ageTick, pointIndex, axis, {
                    runtimeVars,
                    persistExpressionVars,
                    shapeScope
                });
                p = res.point;
                axis = res.axis;
            }
        }
        return p;
    }

    resolveActionAnglePerTick(action, elapsedTick = 0, ageTick = 0, pointIndex = 0) {
        if (!action) return 0;
        if (action.angleMode === "expr") {
            return num(this.evaluateNumericExpression(action.angleExpr || "0", { elapsedTick, ageTick, pointIndex }));
        }
        return U.angleToRad(num(action.angleValue), normalizeAngleUnit(action.angleUnit));
    }

    resolveCompositionAxisDirection() {
        const expr = String(this.state.compositionAxisExpr || this.state.compositionAxisPreset || "RelativeLocation.yAxis()");
        return this.resolveRelativeDirection(expr);
    }

    resolveRelativeDirection(exprRaw) {
        return this.exprRuntime.resolveRelativeDirection(exprRaw);
    }

    parseVecLikeValue(rawExpr) {
        return this.exprRuntime.parseVecLikeValue(rawExpr);
    }

    buildPreviewRuntimeGlobals(elapsedTick = 0, ageTick = 0, pointIndex = 0) {
        const out = {};
        const assign = (nameRaw, value) => {
            const name = String(nameRaw || "").trim();
            if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return;
            out[name] = value;
        };
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            if (!name) continue;
            const type = String(g?.type || "").trim();
            const expr = String(g?.value || "");
            if (type === "Vec3" || type === "RelativeLocation" || type === "Vector3f") {
                assign(name, this.parseVecLikeValue(expr));
                continue;
            }
            if (type === "Boolean") {
                assign(name, /^true$/i.test(expr.trim()));
                continue;
            }
            if (type === "Int" || type === "Long" || type === "Float" || type === "Double") {
                assign(name, this.evaluateNumericExpression(expr, { elapsedTick, ageTick, pointIndex, includeVectors: false }));
                continue;
            }
            assign(name, expr);
        }
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (!name) continue;
            const type = String(c?.type || "").trim();
            const expr = String(c?.value || "0");
            if (type === "Boolean") {
                assign(name, /^true$/i.test(expr.trim()));
            } else {
                assign(name, this.evaluateNumericExpression(expr, { elapsedTick, ageTick, pointIndex, includeVectors: false }));
            }
        }
        let rawStatus = (out.status && typeof out.status === "object") ? out.status : {};
        rawStatus = ensureStatusHelperMethods(rawStatus);
        if (rawStatus.displayStatus !== 2 && Object.prototype.hasOwnProperty.call(rawStatus, "__dissolveStartTick")) {
            delete rawStatus.__dissolveStartTick;
        }
        out.status = rawStatus;
        return out;
    }

    ensurePreviewRuntimeStatus(runtimeVars, elapsedTick = 0) {
        if (!runtimeVars || typeof runtimeVars !== "object") {
            return ensureStatusHelperMethods({ displayStatus: 1 });
        }
        let rawStatus = (runtimeVars.status && typeof runtimeVars.status === "object")
            ? runtimeVars.status
            : {};
        rawStatus = ensureStatusHelperMethods(rawStatus);
        if (rawStatus.displayStatus === 2) {
            if (!Number.isFinite(Number(rawStatus.__dissolveStartTick))) {
                rawStatus.__dissolveStartTick = num(elapsedTick);
            }
        } else if (Object.prototype.hasOwnProperty.call(rawStatus, "__dissolveStartTick")) {
            delete rawStatus.__dissolveStartTick;
        }
        runtimeVars.status = rawStatus;
        return rawStatus;
    }

    syncPreviewStatusWithCycle(runtimeVars, cycleCfg, cycleAge = 0, elapsedTick = 0) {
        const status = this.ensurePreviewRuntimeStatus(runtimeVars, elapsedTick);
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const autoStatus = num(cycleAge) >= num(cycle.play || 0) ? 2 : 1;
        if (!status.__manualDisplayStatus) {
            status.displayStatus = autoStatus;
        }
        status.displayStatus = int(status.displayStatus || 1) === 2 ? 2 : 1;
        if (status.displayStatus === 2) {
            if (!Number.isFinite(Number(status.__dissolveStartTick))) {
                status.__dissolveStartTick = num(elapsedTick);
            }
        } else if (Object.prototype.hasOwnProperty.call(status, "__dissolveStartTick")) {
            delete status.__dissolveStartTick;
        }
        runtimeVars.status = status;
        return status;
    }

    resolvePreviewAgeWithStatus(baseAge, elapsedTick, cycleCfg, runtimeVars) {
        const cycle = cycleCfg || this.getPreviewCycleConfig();
        const status = this.ensurePreviewRuntimeStatus(runtimeVars, elapsedTick);
        if (int(status.displayStatus || 1) !== 2) return num(baseAge);
        const startTick = Number.isFinite(Number(status.__dissolveStartTick))
            ? num(status.__dissolveStartTick)
            : num(elapsedTick);
        const dissolveAge = Math.max(0, num(elapsedTick) - startTick);
        return cycle.play + dissolveAge;
    }

    createRuntimeExpressionScope(elapsedTick = 0, ageTick = 0, pointIndex = 0, runtimeVars = null, includeVectors = true) {
        const baseVars = this.getExpressionVars(elapsedTick, ageTick, pointIndex, { includeVectors: includeVectors === true });
        const localVars = (runtimeVars && typeof runtimeVars === "object") ? runtimeVars : null;
        if (!localVars) return baseVars;
        const baseProto = Object.getPrototypeOf(baseVars) || null;
        if (baseProto && Object.getPrototypeOf(localVars) !== baseProto) {
            try {
                Object.setPrototypeOf(localVars, baseProto);
            } catch {
            }
        }
        const vars = Object.create(localVars);
        const defineLocal = (key, value) => {
            try {
                Object.defineProperty(vars, key, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value
                });
            } catch {
                try {
                    vars[key] = value;
                } catch {
                }
            }
        };
        defineLocal("age", num(baseVars.age));
        defineLocal("tick", num(baseVars.tick));
        defineLocal("index", int(baseVars.index));
        return vars;
    }

    evaluateNumericExpressionWithRuntime(exprRaw, runtimeVars = null, opts = {}) {
        const srcRaw = String(exprRaw || "").trim();
        if (!srcRaw) return 0;
        const src = transpileKotlinThisQualifierToJs(srcRaw).replace(/(\d+(?:\.\d+)?)[fFdDlL]\b/g, "$1");
        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const localVars = (runtimeVars && typeof runtimeVars === "object") ? runtimeVars : {};
        const thisAt = (opts.thisAtVars && typeof opts.thisAtVars === "object") ? opts.thisAtVars : localVars;
        const vars = this.createRuntimeExpressionScope(elapsedTick, ageTick, pointIndex, localVars, true);
        vars.thisAt = thisAt;
        let fn = this.previewNumericFnCache.get(src);
        if (fn === undefined) {
            try {
                fn = new Function("vars", "thisAt", `with(vars){ return (${src}\n); }`);
            } catch {
                fn = null;
            }
            if (this.previewNumericFnCache.size > 2048) this.previewNumericFnCache.clear();
            this.previewNumericFnCache.set(src, fn);
        }
        if (typeof fn !== "function") return 0;
        try {
            const out = fn(vars, vars.thisAt);
            return Number.isFinite(Number(out)) ? Number(out) : 0;
        } catch {
            return 0;
        }
    }

    parseVecLikeValueWithRuntime(rawExpr, runtimeVars = null, opts = {}) {
        const srcRaw = String(rawExpr || "").trim();
        if (!srcRaw) return U.v(0, 0, 0);
        const src = transpileKotlinThisQualifierToJs(srcRaw);
        if (src === "Vec3.ZERO") return U.v(0, 0, 0);
        if (src === "RelativeLocation.yAxis()") return U.v(0, 1, 0);
        if (src.endsWith(".asRelative()")) {
            return this.parseVecLikeValueWithRuntime(src.slice(0, -".asRelative()".length), runtimeVars, opts);
        }
        const elapsedTick = num(opts.elapsedTick);
        const ageTick = num(opts.ageTick);
        const pointIndex = int(opts.pointIndex || 0);
        const localVars = (runtimeVars && typeof runtimeVars === "object") ? runtimeVars : null;
        const thisAtVars = (opts.thisAtVars && typeof opts.thisAtVars === "object")
            ? opts.thisAtVars
            : localVars;
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(src)) {
            if (localVars && localVars[src]) {
                const v = localVars[src];
                if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
                    return U.v(v.x, v.y, v.z);
                }
            }
        }
        const thisAtMatch = src.match(/^thisAt\.([A-Za-z_$][A-Za-z0-9_$]*)$/);
        if (thisAtMatch && thisAtVars) {
            const v = thisAtVars[thisAtMatch[1]];
            if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
                return U.v(v.x, v.y, v.z);
            }
        }
        const m = src.match(/(?:Vec3|RelativeLocation|Vector3f)\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)/i);
        if (m) {
            return U.v(
                this.evaluateNumericExpressionWithRuntime(m[1], localVars, { elapsedTick, ageTick, pointIndex, thisAtVars }),
                this.evaluateNumericExpressionWithRuntime(m[2], localVars, { elapsedTick, ageTick, pointIndex, thisAtVars }),
                this.evaluateNumericExpressionWithRuntime(m[3], localVars, { elapsedTick, ageTick, pointIndex, thisAtVars })
            );
        }
        return this.parseVecLikeValue(srcRaw);
    }

    applyExpressionGlobalsOnce(runtimeActions, elapsedTick, ageTick, runtimeVars, startAxis = null) {
        const actions = Array.isArray(runtimeActions) ? runtimeActions : [];
        if (!actions.length || !runtimeVars || typeof runtimeVars !== "object") return;
        let axis = this.parseJsVec(startAxis || this.resolveCompositionAxisDirection());
        for (const action of actions) {
            if (action?.type !== "expression") continue;
            const res = this.applyExpressionActionToPoint(
                action,
                U.v(0, 0, 0),
                elapsedTick,
                ageTick,
                0,
                axis,
                { runtimeVars, persistExpressionVars: true }
            );
            axis = res?.axis || axis;
        }
    }

    rotatePointToDirection(point, toDir, fromAxis = null) {
        const axis = (fromAxis && U.len(fromAxis) > 1e-6) ? U.norm(fromAxis) : this.resolveCompositionAxisDirection();
        const dir = this.parseJsVec(toDir);
        const dot = num(axis.x) * num(dir.x) + num(axis.y) * num(dir.y) + num(axis.z) * num(dir.z);
        if (dot >= 0.999999) return point;
        const points = [U.clone(point)];
        if (typeof U.rotatePointsToPoint === "function") {
            U.rotatePointsToPoint(points, dir, axis);
        } else {
            rotatePointsToPointUpright(points, dir, axis);
        }
        return points[0] || point;
    }

    rotateAroundUnitAxis(point, axisUnit, angleRad) {
        const p = point || U.v(0, 0, 0);
        const a = axisUnit || U.v(0, 1, 0);
        const x = num(p.x);
        const y = num(p.y);
        const z = num(p.z);
        const u = num(a.x);
        const v = num(a.y);
        const w = num(a.z);
        const cosA = Math.cos(num(angleRad));
        const sinA = Math.sin(num(angleRad));
        const dot = u * x + v * y + w * z;
        return {
            x: u * dot * (1 - cosA) + x * cosA + (-w * y + v * z) * sinA,
            y: v * dot * (1 - cosA) + y * cosA + (w * x - u * z) * sinA,
            z: w * dot * (1 - cosA) + z * cosA + (-v * x + u * y) * sinA
        };
    }

    applyExpressionActionToPoint(action, point, elapsedTick, ageTick, pointIndex, axisInput = null, opts = {}) {
        const srcRaw = String(action?.expressionRaw || action?.expression || "").trim();
        const src = transpileKotlinThisQualifierToJs(srcRaw);
        const startAxis = this.parseJsVec(axisInput || this.resolveCompositionAxisDirection());
        if (!src) return { point, axis: startAxis };
        const runtimeVars = (opts.runtimeVars && typeof opts.runtimeVars === "object") ? opts.runtimeVars : null;
        const persistExpressionVars = !!opts.persistExpressionVars;
        const thisAt = runtimeVars || {};
        const actionKeyBase = String(action?.compileKey || src || "").trim();
        const resolveActionAccum = (slot = "rot") => {
            const nowTick = Math.max(0, num(elapsedTick));
            if (!runtimeVars || !actionKeyBase) return nowTick;
            const key = `${actionKeyBase}|${slot}`;
            const startKey = `__cpbRotStart__${key}`;
            const lastKey = `__cpbRotLast__${key}`;
            let startTick = Number(runtimeVars[startKey]);
            let lastTick = Number(runtimeVars[lastKey]);
            if (!Number.isFinite(startTick)) startTick = nowTick;
            if (!Number.isFinite(lastTick)) lastTick = nowTick;
            const gap = nowTick - lastTick;
            // If this rotate call was skipped for a while (e.g. gated by condition),
            // shift start to avoid a sudden catch-up jump on re-entry.
            if (gap > 0.6) startTick += gap;
            runtimeVars[startKey] = startTick;
            runtimeVars[lastKey] = nowTick;
            return Math.max(0, nowTick - startTick);
        };
        const api = {
            point: U.clone(point),
            axis: U.clone(startAxis),
            rotateToPoint: (to) => {
                const dir = this.parseJsVec(to);
                api.point = this.rotatePointToDirection(api.point, dir, api.axis);
                api.axis = U.clone(dir);
            },
            rotateAsAxis: (angle) => {
                const accum = resolveActionAccum("rotateAsAxis");
                const rot = (((num(angle) * accum) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                api.point = this.rotateAroundUnitAxis(api.point, api.axis, rot);
            },
            rotateToWithAngle: (to, angle) => {
                const accum = resolveActionAccum("rotateToWithAngle");
                const dir = this.parseJsVec(to);
                api.point = this.rotatePointToDirection(api.point, dir, api.axis);
                const rot = (((num(angle) * accum) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                api.point = this.rotateAroundUnitAxis(api.point, dir, rot);
                api.axis = U.clone(dir);
            },
            // 预览 addSingle/addMultiple 不改变几何，仅保证表达式兼容
            addSingle: () => {},
            addMultiple: () => {}
        };
        const vars = this.createRuntimeExpressionScope(elapsedTick, ageTick, pointIndex, runtimeVars, true);
        const shapeScope = (opts.shapeScope && typeof opts.shapeScope === "object") ? opts.shapeScope : null;
        const relPoint = (shapeScope && shapeScope.rel && typeof shapeScope.rel === "object"
            && Number.isFinite(Number(shapeScope.rel.x))
            && Number.isFinite(Number(shapeScope.rel.y))
            && Number.isFinite(Number(shapeScope.rel.z)))
            ? shapeScope.rel
            : U.v(num(point?.x), num(point?.y), num(point?.z));
        const orderValue = (shapeScope && Number.isFinite(Number(shapeScope.order)))
            ? int(shapeScope.order)
            : int(pointIndex || 0);
        vars.rel = relPoint;
        vars.order = orderValue;
        if (shapeScope) {
            const rels = Array.isArray(shapeScope.shapeRels) ? shapeScope.shapeRels : [];
            const orders = Array.isArray(shapeScope.shapeOrders) ? shapeScope.shapeOrders : [];
            for (let i = 0; i < rels.length; i++) {
                const rv = rels[i];
                if (rv && Number.isFinite(rv.x) && Number.isFinite(rv.y) && Number.isFinite(rv.z)) {
                    vars[`shapeRel${i}`] = rv;
                }
                if (Number.isFinite(Number(orders[i]))) {
                    vars[`shapeOrder${i}`] = int(orders[i]);
                }
            }
        }
        vars.rotateToPoint = api.rotateToPoint;
        vars.thisAt = thisAt;
        try {
            const fn = (typeof action?.fn === "function") ? action.fn : null;
            if (!fn) return { point, axis: startAxis };
            fn(
                vars,
                api.point,
                api.rotateToPoint,
                api.rotateAsAxis,
                api.rotateToWithAngle,
                api.addSingle,
                api.addMultiple,
                thisAt
            );
            if (runtimeVars && persistExpressionVars) {
                for (const key of Object.keys(runtimeVars)) {
                    if (Object.prototype.hasOwnProperty.call(vars, key)) {
                        runtimeVars[key] = vars[key];
                    }
                }
            }
            return { point: api.point, axis: api.axis };
        } catch {
            return { point, axis: startAxis };
        }
    }

    parseJsVec(v) {
        if (!v) return U.v(0, 1, 0);
        if (typeof v === "object" && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) {
            const x = num(v.x);
            const y = num(v.y);
            const z = num(v.z);
            const lenSq = x * x + y * y + z * z;
            if (lenSq <= 1e-12) return U.v(0, 1, 0);
            if (Math.abs(lenSq - 1) <= 1e-6) return v;
            const inv = 1 / Math.sqrt(lenSq);
            return U.v(x * inv, y * inv, z * inv);
        }
        return this.resolveRelativeDirection(String(v));
    }

    evaluateNumericExpression(exprRaw, opts = {}) {
        return this.exprRuntime.evaluateNumericExpression(exprRaw, opts);
    }

    getExpressionVars(elapsedTick = 0, ageTick = 0, pointIndex = 0, opts = {}) {
        return this.exprRuntime.getExpressionVars(elapsedTick, ageTick, pointIndex, opts);
    }

    }

    for (const key of Object.getOwnPropertyNames(PreviewRuntimeMixin.prototype)) {
        if (key === "constructor") continue;
        CompositionBuilderApp.prototype[key] = PreviewRuntimeMixin.prototype[key];
    }
}
