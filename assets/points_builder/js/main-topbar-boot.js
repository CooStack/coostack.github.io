export function initTopbarAndBoot(ctx = {}) {
    const {
        btnExportKotlin,
        btnExportKotlin2,
        btnToggleKotlin,
        btnCopyKotlin,
        btnCopyKotlin2,
        selKotlinEnd,
        inpProjectName,
        inpParamStep,
        inpSnapStep,
        inpSnapParticleRange,
        inpOffsetPreviewLimit,
        btnHotkeys,
        btnCloseSettings,
        settingsMask,
        btnAddCard,
        btnQuickOffset,
        btnPickLine,
        btnPickTriangle,
        btnPickPoint,
        btnFullscreen,
        btnSaveJson,
        btnLoadJson,
        fileJson,
        fileBuilderJson,
        btnReset,
        elCardsRoot,
        chkRealtimeKotlin,
        chkPointPickPreview,
        showSettingsModal,
        hideSettingsModal,
        getInsertContextFromFocus,
        isBuilderContainerKind,
        openModal,
        addQuickOffsetTo,
        getState,
        getFocusedNodeId,
        findNodeContextById,
        getLinePickMode,
        getLinePickType,
        stopLinePick,
        getRotateMode,
        stopRotateMode,
        getPointPickMode,
        stopPointPick,
        startLinePick,
        startTrianglePick,
        startPointPick,
        toggleFullscreen,
        flushKotlinOut,
        emitKotlin,
        getKotlinRaw,
        setKotlinOut,
        setKotlinHidden,
        isKotlinHidden,
        makeExportFileName,
        setKotlinEndMode,
        saveKotlinEndMode,
        getKotlinEndMode,
        getProjectName,
        setProjectName,
        sanitizeFileBase,
        saveProjectName,
        paramStepRef,
        setParamStep,
        applyParamStepToInputs,
        saveSettingsToStorage,
        snapStepRef,
        setSnapStep,
        particleSnapRangeRef,
        setParticleSnapRange,
        offsetPreviewLimitRef,
        setOffsetPreviewLimit,
        historyCapture,
        setState,
        normalizeNodeTree,
        ensureAxisEverywhere,
        ensureAxisInList,
        resetCollapseScopes,
        collapseAllNodes,
        renderAll,
        showToast,
        downloadText,
        loadSettingsFromStorage,
        setRealtimeKotlin,
        setPointPickPreviewEnabled,
        initTheme,
        bindThemeHotkeys,
        bindDragCopyGuards,
        bindActionMenuDismiss,
        bindPointPickMenuAnchorTracking,
        applyLayoutState,
        bindResizers,
        updateKotlinToggleText,
        safeStringifyState,
        getLastSavedStateJson,
        saveAutoState,
        initThree,
        setupListDropZone,
        onCardsContextMenu,
        initCollapseAllControls,
        bindParamSyncListeners,
        refreshHotkeyHints,
        triggerImportJson,
        setBuilderJsonTargetNode,
        getBuilderJsonTargetNode
    } = ctx;

    function doExportKotlin() {
        flushKotlinOut();
    }

    function doCopyKotlin() {
        const text = getKotlinRaw() || emitKotlin();
        if (!getKotlinRaw()) setKotlinOut(text);
        navigator.clipboard?.writeText(text);
    }

    function doDownloadKotlin() {
        const text = getKotlinRaw() || emitKotlin();
        if (!getKotlinRaw()) setKotlinOut(text);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = makeExportFileName("kt", "PointsBuilder_Generated");
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 200);
    }

    btnExportKotlin?.addEventListener("click", doExportKotlin);
    btnExportKotlin2?.addEventListener("click", doExportKotlin);
    btnToggleKotlin?.addEventListener("click", () => setKotlinHidden(!isKotlinHidden()));
    btnCopyKotlin?.addEventListener("click", doCopyKotlin);
    btnCopyKotlin2?.addEventListener("click", doCopyKotlin);

    if (selKotlinEnd) {
        selKotlinEnd.value = getKotlinEndMode();
        selKotlinEnd.addEventListener("change", () => {
            const mode = selKotlinEnd.value || "builder";
            setKotlinEndMode(mode);
            saveKotlinEndMode(mode);
            flushKotlinOut();
        });
    }

    if (inpProjectName) {
        inpProjectName.value = getProjectName() || "";
        inpProjectName.addEventListener("input", () => {
            const next = sanitizeFileBase(inpProjectName.value || "");
            setProjectName(next);
            saveProjectName(next);
            if (inpProjectName.value !== next) inpProjectName.value = next;
        });
    }

    if (inpParamStep) {
        if (inpParamStep.value === "") inpParamStep.value = String(paramStepRef.value);
        setParamStep(inpParamStep.value, { skipSave: true });
        inpParamStep.addEventListener("input", () => {
            const n = parseFloat(inpParamStep.value);
            if (!Number.isFinite(n) || n <= 0) return;
            paramStepRef.value = n;
            applyParamStepToInputs();
            saveSettingsToStorage();
        });
        inpParamStep.addEventListener("blur", () => {
            setParamStep(inpParamStep.value);
        });
    }

    if (inpSnapStep) {
        if (inpSnapStep.value === "") inpSnapStep.value = String(snapStepRef.value);
        setSnapStep(inpSnapStep.value, { skipSave: true });
        inpSnapStep.addEventListener("input", () => {
            const n = parseFloat(inpSnapStep.value);
            if (!Number.isFinite(n) || n <= 0) return;
            snapStepRef.value = n;
            saveSettingsToStorage();
        });
        inpSnapStep.addEventListener("blur", () => {
            setSnapStep(inpSnapStep.value);
        });
    }

    if (inpSnapParticleRange) {
        if (inpSnapParticleRange.value === "") inpSnapParticleRange.value = String(particleSnapRangeRef.value);
        setParticleSnapRange(inpSnapParticleRange.value, { skipSave: true });
        inpSnapParticleRange.addEventListener("input", () => {
            const n = parseFloat(inpSnapParticleRange.value);
            if (!Number.isFinite(n) || n <= 0) return;
            particleSnapRangeRef.value = n;
            saveSettingsToStorage();
        });
        inpSnapParticleRange.addEventListener("blur", () => {
            setParticleSnapRange(inpSnapParticleRange.value);
        });
    }

    if (inpOffsetPreviewLimit) {
        if (inpOffsetPreviewLimit.value === "") inpOffsetPreviewLimit.value = String(offsetPreviewLimitRef.value);
        setOffsetPreviewLimit(inpOffsetPreviewLimit.value, { skipSave: true });
        inpOffsetPreviewLimit.addEventListener("keydown", (ev) => {
            if (ev.key !== "-" && ev.code !== "NumpadSubtract") return;
            ev.preventDefault();
            setOffsetPreviewLimit(-1);
        });
        inpOffsetPreviewLimit.addEventListener("input", () => {
            setOffsetPreviewLimit(inpOffsetPreviewLimit.value);
        });
    }

    btnHotkeys?.addEventListener("click", showSettingsModal);
    btnCloseSettings?.addEventListener("click", hideSettingsModal);
    settingsMask?.addEventListener("click", hideSettingsModal);

    btnAddCard?.addEventListener("click", () => {
        const pickCtx = getInsertContextFromFocus();
        const ownerNodeId = (pickCtx && pickCtx.ownerNode && isBuilderContainerKind(pickCtx.ownerNode.kind)) ? pickCtx.ownerNode.id : null;
        openModal(pickCtx.list, pickCtx.insertIndex, pickCtx.label, ownerNodeId);
    });

    btnQuickOffset?.addEventListener("click", () => {
        const stateObj = getState();
        addQuickOffsetTo(stateObj.root.children);
    });

    btnPickLine?.addEventListener("click", () => {
        if (getLinePickMode() && getLinePickType() === "line") stopLinePick();
        else {
            if (getRotateMode()) stopRotateMode({ silent: true });
            if (getLinePickMode()) stopLinePick();
            if (getPointPickMode()) stopPointPick();
            const pickCtx = getInsertContextFromFocus();
            startLinePick(pickCtx.list, pickCtx.label, pickCtx.insertIndex);
        }
    });

    btnPickTriangle?.addEventListener("click", () => {
        if (getLinePickMode() && getLinePickType() === "triangle") stopLinePick();
        else {
            if (getRotateMode()) stopRotateMode({ silent: true });
            if (getLinePickMode()) stopLinePick();
            if (getPointPickMode()) stopPointPick();
            const pickCtx = getInsertContextFromFocus();
            startTrianglePick(pickCtx.list, pickCtx.label, pickCtx.insertIndex);
        }
    });

    btnPickPoint?.addEventListener("click", () => {
        if (getPointPickMode()) {
            stopPointPick();
        } else {
            if (getRotateMode()) stopRotateMode({ silent: true });
            if (getLinePickMode()) stopLinePick();
            startPointPick();
        }
    });

    btnFullscreen?.addEventListener("click", toggleFullscreen);

    btnSaveJson?.addEventListener("click", async () => {
        const text = JSON.stringify(getState(), null, 2);
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: makeExportFileName("json", "shape"),
                    types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(text);
                await writable.close();
                showToast("保存成功", "success");
                return;
            } catch (e) {
                if (e && e.name === "AbortError") {
                    showToast("取消保存", "error");
                    return;
                }
                console.warn("showSaveFilePicker failed:", e);
                showToast(`保存失败：${e.message || e}`, "error");
                return;
            }
        }
        try {
            downloadText(makeExportFileName("json", "shape"), text, "application/json");
            showToast("保存成功", "success");
        } catch (e) {
            showToast(`保存失败：${e.message || e}`, "error");
        }
    });

    btnLoadJson?.addEventListener("click", () => fileJson?.click());
    fileJson?.addEventListener("change", async () => {
        const f = fileJson.files && fileJson.files[0];
        if (!f) return;
        const text = await f.text();
        try {
            const obj = JSON.parse(text);
            if (!obj || !obj.root || !Array.isArray(obj.root.children)) throw new Error("invalid json");
            historyCapture("import_json");
            setState(obj);
            normalizeNodeTree(getState().root);
            ensureAxisEverywhere();
            resetCollapseScopes();
            collapseAllNodes(getState().root.children);
            const rawName = (f.name || "").replace(/\.[^/.]+$/, "");
            const nextName = sanitizeFileBase(rawName || "");
            if (nextName) {
                setProjectName(nextName);
                saveProjectName(nextName);
                if (inpProjectName) inpProjectName.value = nextName;
            }
            renderAll();
            showToast("导入成功", "success");
        } catch (e) {
            showToast(`导入失败-格式错误(${e.message || e})`, "error");
        } finally {
            fileJson.value = "";
        }
    });

    fileBuilderJson?.addEventListener("change", async () => {
        const f = fileBuilderJson.files && fileBuilderJson.files[0];
        if (!f) return;
        const target = getBuilderJsonTargetNode();
        try {
            const text = await f.text();
            const obj = JSON.parse(text);
            if (!obj || !obj.root || !Array.isArray(obj.root.children)) throw new Error("invalid json");
            if (!target) throw new Error("no target");
            historyCapture("import_add_builder_json");
            target.children = obj.root.children;
            normalizeNodeTree(target.children);
            ensureAxisInList(target.children);
            resetCollapseScopes();
            collapseAllNodes(target.children);
            renderAll();
            showToast("导入成功", "success");
        } catch (e) {
            showToast(`导入失败-格式错误(${e.message || e})`, "error");
        } finally {
            setBuilderJsonTargetNode(null);
            fileBuilderJson.value = "";
        }
    });

    btnReset?.addEventListener("click", () => {
        if (!confirm("确定重置全部卡片？")) return;
        historyCapture("reset");
        setState({ root: { id: "root", kind: "ROOT", children: [] } });
        renderAll();
    });

    // -------------------------
    // Boot
    // -------------------------
    loadSettingsFromStorage();
    if (chkRealtimeKotlin) setRealtimeKotlin(chkRealtimeKotlin.checked, { skipSave: true });
    if (chkPointPickPreview) setPointPickPreviewEnabled(chkPointPickPreview.checked, { skipSave: true });
    initTheme();
    bindThemeHotkeys();
    bindDragCopyGuards();
    bindActionMenuDismiss();
    bindPointPickMenuAnchorTracking();
    applyLayoutState(false);
    bindResizers();
    updateKotlinToggleText();
    window.addEventListener("resize", () => applyLayoutState(true));
    window.addEventListener("beforeunload", () => {
        const json = safeStringifyState(getState());
        if (json && json !== getLastSavedStateJson()) saveAutoState(getState());
    });
    initThree();
    setupListDropZone(elCardsRoot, () => getState().root.children, () => null);
    if (elCardsRoot && !elCardsRoot.__pbActionMenuBound) {
        elCardsRoot.__pbActionMenuBound = true;
        elCardsRoot.addEventListener("contextmenu", onCardsContextMenu);
    }
    initCollapseAllControls();
    if (typeof bindParamSyncListeners === "function") bindParamSyncListeners();
    if (typeof refreshHotkeyHints === "function") refreshHotkeyHints();
    renderAll();

    // 给快捷键模块调用（Ctrl/Cmd+O）
    if (typeof triggerImportJson === "function") {
        // keep
    }
}

