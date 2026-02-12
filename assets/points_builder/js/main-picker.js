export function createPickerModule(ctx = {}) {
    const {
        settingsModal,
        settingsMask,
        modal,
        modalMask,
        btnCloseModal,
        btnCancelModal,
        cardPicker,
        cardSearch,
        KIND,
        getHotkeys,
        hotkeyToHuman,
        openHotkeysModal,
        beginHotkeyCapture,
        getState,
        makeNode,
        historyCapture,
        ensureAxisEverywhere,
        findNodeContextById,
        renderAll,
        focusCardById,
        isBuilderContainerKind,
        getFocusedNodeId,
        getCardSelectionIds,
        setSuppressFocusHistory
    } = ctx;

    let addTarget = { list: null, insertIndex: null, ownerLabel: "主Builder", ownerNodeId: null, keepFocusId: null };

    function showSettingsModal() {
        if (!settingsModal || !settingsMask) return;
        settingsModal.classList.remove("hidden");
        settingsMask.classList.remove("hidden");
    }

    function hideSettingsModal() {
        if (!settingsModal || !settingsMask) return;
        settingsModal.classList.add("hidden");
        settingsMask.classList.add("hidden");
        settingsModal.classList.remove("under");
        settingsMask.classList.remove("under");
    }

    function showModal() {
        if (!modal || !modalMask) return;
        // 任何时候打开「添加卡片」都必须是可交互的（不能遗留 under）
        modal.classList.remove("under");
        modalMask.classList.remove("under");
        modal.classList.remove("hidden");
        modalMask.classList.remove("hidden");
        if (cardSearch) {
            cardSearch.value = "";
            renderPicker("");
            cardSearch.focus();
        } else {
            renderPicker("");
        }
    }

    function hideModal() {
        if (!modal || !modalMask) return;
        modal.classList.add("hidden");
        modalMask.classList.add("hidden");
        // 清理 under 状态，避免下次打开还是模糊不可点
        modal.classList.remove("under");
        modalMask.classList.remove("under");
    }

    function openModal(targetList, insertIndex = null, ownerLabel = "主Builder", ownerNodeId = null) {
        // 记录插入目标 + 需要保持的焦点
        addTarget = {
            list: targetList || null,
            insertIndex,
            ownerLabel,
            ownerNodeId: ownerNodeId || null,
            keepFocusId: ownerNodeId || null,
        };
        showModal();
    }

    function toCompactSearchText(text) {
        return String(text || "")
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "");
    }

    function toAsciiAcronym(text) {
        const raw = String(text || "")
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/[_\-./()+[\]{}]+/g, " ")
            .toLowerCase();
        const words = raw.match(/[a-z0-9]+/g) || [];
        let out = "";
        for (const w of words) {
            if (w) out += w[0];
        }
        return out;
    }

    function findSubsequenceScore(query, target) {
        const q = String(query || "");
        const t = String(target || "");
        if (!q || !t) return Infinity;
        let qi = 0;
        let last = -1;
        let gap = 0;
        for (let i = 0; i < t.length && qi < q.length; i++) {
            if (t[i] !== q[qi]) continue;
            if (last >= 0) gap += (i - last - 1);
            last = i;
            qi++;
        }
        if (qi !== q.length || last < 0) return Infinity;
        // 越靠前、越紧凑，分数越低
        return last * 10 + gap;
    }

    function renderPicker(filterText) {
        if (!cardPicker) return;
        const f = (filterText || "").trim().toLowerCase();
        const fCompact = toCompactSearchText(filterText);
        cardPicker.innerHTML = "";
        const entries = Object.entries(KIND || {}).map(([kind, def], order) => ({ kind, def, order }));

        const shown = [];
        for (const it of entries) {
            const titleRaw = (it.def?.title || it.kind) + "";
            const kindRaw = (it.kind || "") + "";
            const descRaw = (it.def?.desc || "") + "";
            const title = titleRaw.toLowerCase();
            const kind = kindRaw.toLowerCase();
            const desc = descRaw.toLowerCase();
            if (!f) {
                shown.push({ it, group: 0, score: 0, order: it.order });
                continue;
            }

            let best = null;
            const keepBest = (group, score) => {
                if (!Number.isFinite(score)) return;
                if (!best || group < best.group || (group === best.group && score < best.score)) {
                    best = { group, score };
                }
            };

            // 1) 直接前缀/包含匹配（优先）
            if (title.startsWith(f) || kind.startsWith(f)) keepBest(0, 0);
            const tIdx = title.indexOf(f);
            const kIdx = kind.indexOf(f);
            const directIdx = Math.min(tIdx >= 0 ? tIdx : Infinity, kIdx >= 0 ? kIdx : Infinity);
            if (Number.isFinite(directIdx)) keepBest(1, directIdx);

            // 2) 缩写匹配（支持 af -> addFillTriangle / add_fill_triangle）
            if (fCompact) {
                const acrTitle = toAsciiAcronym(titleRaw);
                const acrKind = toAsciiAcronym(kindRaw);
                const acrPrefix = Math.min(
                    acrTitle.startsWith(fCompact) ? 0 : Infinity,
                    acrKind.startsWith(fCompact) ? 0 : Infinity
                );
                if (Number.isFinite(acrPrefix)) keepBest(2, acrPrefix);

                const acrContain = Math.min(
                    acrTitle.indexOf(fCompact) >= 0 ? acrTitle.indexOf(fCompact) : Infinity,
                    acrKind.indexOf(fCompact) >= 0 ? acrKind.indexOf(fCompact) : Infinity
                );
                if (Number.isFinite(acrContain)) keepBest(3, acrContain);

                // 3) 顺序字符匹配（模糊）
                const compactTitle = toCompactSearchText(titleRaw);
                const compactKind = toCompactSearchText(kindRaw);
                const subseqScore = Math.min(
                    findSubsequenceScore(fCompact, compactTitle),
                    findSubsequenceScore(fCompact, compactKind)
                );
                if (Number.isFinite(subseqScore)) keepBest(4, subseqScore);
            }

            // 4) 描述匹配放后
            const dIdx = desc.indexOf(f);
            if (dIdx >= 0) keepBest(5, dIdx);

            if (best) shown.push({ it, group: best.group, score: best.score, order: it.order });
        }

        if (f) {
            shown.sort((a, b) => {
                if (a.group !== b.group) return a.group - b.group;
                if (a.score !== b.score) return a.score - b.score;
                return a.order - b.order;
            });
        } else {
            shown.sort((a, b) => a.order - b.order);
        }

        for (const { it } of shown) {
            const div = document.createElement("div");
            div.className = "pickitem";
            const t = document.createElement("div");
            t.className = "t";
            t.textContent = it.def?.title || it.kind;
            const d = document.createElement("div");
            d.className = "d";
            d.textContent = it.def?.desc || it.kind;
            div.appendChild(t);
            div.appendChild(d);

            // 显示该卡片的快捷键（如果有）
            const hotkeys = typeof getHotkeys === "function" ? getHotkeys() : null;
            const hk = hotkeys && hotkeys.kinds ? (hotkeys.kinds[it.kind] || "") : "";
            if (hk) {
                const bad = document.createElement("div");
                bad.className = "hkbad";
                bad.textContent = hotkeyToHuman ? hotkeyToHuman(hk) : hk;
                div.appendChild(bad);
            }

            // 在“选择添加”里提供快速设置快捷键
            const setBtn = document.createElement("button");
            setBtn.className = "sethk";
            setBtn.textContent = "⌨";
            setBtn.title = "设置该卡片的快捷键";
            setBtn.addEventListener("click", (ev) => {
                ev.stopPropagation();
                if (typeof openHotkeysModal === "function") openHotkeysModal();
                if (typeof beginHotkeyCapture === "function") {
                    beginHotkeyCapture({ type: "kind", id: it.kind, title: it.def?.title || it.kind });
                }
            });
            div.appendChild(setBtn);

            div.addEventListener("click", () => {
                const stateObj = (typeof getState === "function") ? getState() : null;
                const rootList = stateObj && stateObj.root && Array.isArray(stateObj.root.children) ? stateObj.root.children : [];
                const list = addTarget.list || rootList;
                const atRaw = addTarget.insertIndex;
                if (typeof historyCapture === "function") historyCapture("add_" + it.kind);
                const nn = (typeof makeNode === "function") ? makeNode(it.kind) : null;
                if (!nn) return;
                if (atRaw === null || atRaw === undefined) {
                    list.push(nn);
                } else {
                    const at = Math.max(0, Math.min(atRaw, list.length));
                    list.splice(at, 0, nn);
                    // 连续添加时，保持插入点向后移动
                    addTarget.insertIndex = at + 1;
                }
                if (typeof ensureAxisEverywhere === "function") ensureAxisEverywhere();

                // 子 builder 内新增：默认保持聚焦在 addBuilder 上；否则聚焦到新卡片
                const focusAfter = (addTarget.keepFocusId && typeof findNodeContextById === "function" && findNodeContextById(addTarget.keepFocusId))
                    ? addTarget.keepFocusId
                    : nn.id;

                hideModal();
                if (typeof renderAll === "function") renderAll();

                requestAnimationFrame(() => {
                    if (typeof setSuppressFocusHistory === "function") setSuppressFocusHistory(true);
                    if (typeof focusCardById === "function") focusCardById(focusAfter, false, true);
                    if (typeof setSuppressFocusHistory === "function") setSuppressFocusHistory(false);
                });
            });
            cardPicker.appendChild(div);
        }
    }

    function getInsertContextFromFocus() {
        const stateObj = (typeof getState === "function") ? getState() : null;
        const rootList = stateObj && stateObj.root && Array.isArray(stateObj.root.children) ? stateObj.root.children : [];

        const resolveCtx = (nodeId) => {
            if (!nodeId || typeof findNodeContextById !== "function") return null;
            const nodeCtx = findNodeContextById(nodeId);
            if (nodeCtx && nodeCtx.node) {
                if (typeof isBuilderContainerKind === "function" && isBuilderContainerKind(nodeCtx.node.kind)) {
                    if (!Array.isArray(nodeCtx.node.children)) nodeCtx.node.children = [];
                    return { list: nodeCtx.node.children, insertIndex: nodeCtx.node.children.length, label: "子Builder", ownerNode: nodeCtx.node };
                }
                // 普通卡片：插到它后面（同一列表）
                const label = nodeCtx.parentNode ? "子Builder" : "主Builder";
                return { list: nodeCtx.parentList, insertIndex: nodeCtx.index + 1, label, ownerNode: nodeCtx.parentNode || null };
            }
            return null;
        };

        const focusedNodeId = (typeof getFocusedNodeId === "function") ? getFocusedNodeId() : null;
        if (focusedNodeId) {
            const resolved = resolveCtx(focusedNodeId);
            if (resolved) return resolved;
        }

        if (typeof getCardSelectionIds === "function") {
            const selected = getCardSelectionIds();
            if (selected && selected.size === 1) {
                const oneId = Array.from(selected)[0];
                const resolved = resolveCtx(oneId);
                if (resolved) return resolved;
            }
        }

        return { list: rootList, insertIndex: rootList.length, label: "主Builder", ownerNode: null };
    }

    function addKindInContext(kind, inCtx) {
        const stateObj = (typeof getState === "function") ? getState() : null;
        const rootList = stateObj && stateObj.root && Array.isArray(stateObj.root.children) ? stateObj.root.children : [];
        const list = inCtx?.list || rootList;
        const at = (inCtx && inCtx.insertIndex != null) ? inCtx.insertIndex : list.length;
        if (typeof historyCapture === "function") historyCapture("hotkey_add_" + kind);
        const nn = (typeof makeNode === "function") ? makeNode(kind) : null;
        if (!nn) return;
        const idx = Math.max(0, Math.min(at, list.length));
        list.splice(idx, 0, nn);
        if (typeof ensureAxisEverywhere === "function") ensureAxisEverywhere();
        if (typeof renderAll === "function") renderAll();

        // 若是在 addBuilder 内新增，则保持聚焦在 addBuilder；否则聚焦新卡片
        const focusAfter = (inCtx && inCtx.ownerNode && typeof isBuilderContainerKind === "function" && isBuilderContainerKind(inCtx.ownerNode.kind))
            ? inCtx.ownerNode.id
            : nn.id;
        requestAnimationFrame(() => {
            if (typeof setSuppressFocusHistory === "function") setSuppressFocusHistory(true);
            if (typeof focusCardById === "function") focusCardById(focusAfter, false, true);
            if (typeof setSuppressFocusHistory === "function") setSuppressFocusHistory(false);
        });
    }

    btnCloseModal?.addEventListener("click", hideModal);
    btnCancelModal?.addEventListener("click", hideModal);
    modalMask?.addEventListener("click", hideModal);
    cardSearch?.addEventListener("input", () => renderPicker(cardSearch.value));

    return {
        showSettingsModal,
        hideSettingsModal,
        showModal,
        hideModal,
        openModal,
        getInsertContextFromFocus,
        addKindInContext
    };
}

