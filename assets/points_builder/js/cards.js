export function createCardInputs(ctx) {
    const { num, armHistoryOnFocus, historyCapture, setActiveVecTarget } = ctx || {};

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
        armHistoryOnFocus && armHistoryOnFocus(i, "edit");
        i.addEventListener("input", () => onInput(num ? num(i.value) : Number(i.value)));
        return i;
    }

    function select(options, value, onChange) {
        const s = document.createElement("select");
        s.className = "input";
        armHistoryOnFocus && armHistoryOnFocus(s, "edit");
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
        armHistoryOnFocus && armHistoryOnFocus(c, "edit");
        c.addEventListener("pointerdown", () => historyCapture && historyCapture("checkbox"));
        c.addEventListener("change", () => onChange(c.checked));
        wrap.appendChild(c);
        const sp = document.createElement("span");
        sp.className = "pill";
        sp.textContent = c.checked ? "启用" : "禁用";
        wrap.appendChild(sp);
        c.addEventListener("change", () => sp.textContent = c.checked ? "启用" : "禁用");
        return wrap;
    }

    function makeVec3Editor(p, prefix, onChange, label = "") {
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
        const target = {
            obj: p,
            keys: {x: prefix + "x", y: prefix + "y", z: prefix + "z"},
            inputs: {x: ix, y: iy, z: iz},
            label: label || prefix || "vec3",
            onChange
        };
        ix.__vecTarget = target;
        iy.__vecTarget = target;
        iz.__vecTarget = target;
        const onFocus = () => {
            if (typeof setActiveVecTarget === "function") setActiveVecTarget(target);
        };
        ix.addEventListener("focus", onFocus);
        iy.addEventListener("focus", onFocus);
        iz.addEventListener("focus", onFocus);
        return box;
    }

    return { row, inputNum, select, checkbox, makeVec3Editor };
}

export function initCardSystem(ctx = {}) {
    const {
        KIND,
        elCardsRoot,
        row,
        inputNum,
        select,
        checkbox,
        makeVec3Editor,
        historyCapture,
        rebuildPreviewAndKotlin,
        openModal,
        mirrorCopyNode,
        cloneNodeDeep,
        cloneNodeListDeep,
        makeNode,
        ensureAxisEverywhere,
        ensureAxisInList,
        isBuilderContainerKind,
        showToast,
        pickReasonableFocusAfterDelete,
        bindCardBodyResizer,
        bindSubblockWidthResizer,
        bindSubblockHeightResizer,
        handleBuilderDrop,
        tryCopyWithBuilderIntoAddWith,
        moveNodeById,
        downloadText,
        deepClone,
        fileBuilderJson,
        stopLinePick,
        startLinePick,
        stopPointPick
    } = ctx;

    const getState = ctx.getState || (() => ctx.state);
    const getRenderAll = ctx.getRenderAll || (() => ctx.renderAll);
    const getFocusedNodeId = ctx.getFocusedNodeId || (() => ctx.focusedNodeId);
    const setFocusedNode = ctx.setFocusedNode || (() => {});
    const clearFocusedNodeIf = ctx.clearFocusedNodeIf || (() => {});
    const updateFocusCardUI = ctx.updateFocusCardUI || (() => {});
    const getIsRenderingCards = ctx.getIsRenderingCards || (() => false);
    const setIsRenderingCards = ctx.setIsRenderingCards || (() => {});
    const getSuppressCardFocusOutClear = ctx.getSuppressCardFocusOutClear || (() => false);
    const getMirrorPlaneInfo = ctx.getMirrorPlaneInfo || (() => ({ label: "XZ" }));
    const getMirrorPlane = ctx.getMirrorPlane || (() => "XZ");
    const getBuilderJsonTargetNode = ctx.getBuilderJsonTargetNode || (() => null);
    const setBuilderJsonTargetNode = ctx.setBuilderJsonTargetNode || (() => {});
    const getLinePickMode = ctx.getLinePickMode || (() => false);
    const getPointPickMode = ctx.getPointPickMode || (() => false);
    const makeUid = ctx.uid || (() => (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16));

    const renderAll = () => {
        const fn = getRenderAll();
        if (typeof fn === "function") fn();
    };

    const getVisibleEntries = (...args) => {
        const fn = ctx.getVisibleEntries ? ctx.getVisibleEntries() : ctx.getVisibleEntries;
        return typeof fn === "function" ? fn(...args) : null;
    };
    const cleanupFilterMenus = () => {
        const fn = ctx.getCleanupFilterMenus ? ctx.getCleanupFilterMenus() : ctx.cleanupFilterMenus;
        if (typeof fn === "function") fn();
    };
    const isFilterActive = (...args) => {
        const fn = ctx.getIsFilterActive ? ctx.getIsFilterActive() : ctx.isFilterActive;
        return typeof fn === "function" ? fn(...args) : false;
    };
    const findVisibleSwapIndex = (...args) => {
        const fn = ctx.getFindVisibleSwapIndex ? ctx.getFindVisibleSwapIndex() : ctx.findVisibleSwapIndex;
        return typeof fn === "function" ? fn(...args) : -1;
    };
    const swapInList = (...args) => {
        const fn = ctx.getSwapInList ? ctx.getSwapInList() : ctx.swapInList;
        if (typeof fn === "function") fn(...args);
    };
    const createFilterControls = (...args) => {
        const fn = ctx.getCreateFilterControls ? ctx.getCreateFilterControls() : ctx.createFilterControls;
        return typeof fn === "function" ? fn(...args) : null;
    };
    const createParamSyncControls = (...args) => {
        const fn = ctx.getCreateParamSyncControls ? ctx.getCreateParamSyncControls() : ctx.createParamSyncControls;
        return typeof fn === "function" ? fn(...args) : null;
    };
    const getParamSync = () => (ctx.getParamSync ? ctx.getParamSync() : ctx.paramSync);
    const isSyncSelectableEvent = (e) => {
        const fn = ctx.getIsSyncSelectableEvent ? ctx.getIsSyncSelectableEvent() : ctx.isSyncSelectableEvent;
        return typeof fn === "function" ? fn(e) : false;
    };
    const toggleSyncTarget = (node) => {
        const fn = ctx.getToggleSyncTarget ? ctx.getToggleSyncTarget() : ctx.toggleSyncTarget;
        if (typeof fn === "function") fn(node);
    };

    function iconBtn(text, onClick, danger = false) {
        const b = document.createElement("button");
        b.className = "iconbtn" + (danger ? " danger" : "");
        b.classList.add("action-item");
        b.textContent = text;
        b.addEventListener("click", onClick);
        return b;
    }

    function makeCollapseAllButtons(scopeId, listGetter, small = true) {
        const collapseBtn = document.createElement("button");
        collapseBtn.className = small ? "btn small" : "btn";
        collapseBtn.textContent = "折叠所有";
        collapseBtn.addEventListener("click", () => {
            const list = (typeof listGetter === "function") ? listGetter() : [];
            if (typeof ctx.collapseAllInScope === "function") ctx.collapseAllInScope(scopeId, list);
            renderAll();
        });

        const expandBtn = document.createElement("button");
        expandBtn.className = small ? "btn small" : "btn";
        expandBtn.textContent = "展开所有";
        expandBtn.addEventListener("click", () => {
            const list = (typeof listGetter === "function") ? listGetter() : [];
            if (typeof ctx.expandAllInScope === "function") ctx.expandAllInScope(scopeId, list);
            renderAll();
        });

        return { collapseBtn, expandBtn };
    }

    let moreMenuBound = false;
    function ensureMoreMenu(actionsEl) {
        let wrap = actionsEl.querySelector(".more-wrap");
        if (wrap) return wrap;
        wrap = document.createElement("div");
        wrap.className = "more-wrap hidden";
        const btn = document.createElement("button");
        btn.className = "iconbtn more-btn";
        btn.textContent = "⋯";
        const menu = document.createElement("div");
        menu.className = "more-menu";
        wrap.appendChild(btn);
        wrap.appendChild(menu);
        actionsEl.appendChild(wrap);
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            wrap.classList.toggle("open");
        });
        menu.addEventListener("click", (e) => e.stopPropagation());
        if (!moreMenuBound) {
            moreMenuBound = true;
            document.addEventListener("click", () => {
                document.querySelectorAll(".more-wrap.open").forEach((el) => el.classList.remove("open"));
            });
        }
        return wrap;
    }

    function layoutActionOverflow() {
        const cards = document.querySelectorAll(".card-actions");
        cards.forEach((actionsEl) => {
            const wrap = ensureMoreMenu(actionsEl);
            const menu = wrap.querySelector(".more-menu");
            wrap.classList.remove("open");

            // move all items back to main row
            Array.from(menu.children).forEach((item) => {
                actionsEl.insertBefore(item, wrap);
            });
            menu.innerHTML = "";
            wrap.classList.add("hidden");

            if (actionsEl.scrollWidth <= actionsEl.clientWidth) return;
            wrap.classList.remove("hidden");

            let items = Array.from(actionsEl.querySelectorAll(".action-item")).filter((el) => !wrap.contains(el));
            while (actionsEl.scrollWidth > actionsEl.clientWidth && items.length) {
                const item = items.pop();
                menu.insertBefore(item, menu.firstChild);
            }
            if (!menu.children.length) wrap.classList.add("hidden");
        });
    }

    function initCollapseAllControls() {
        const title = document.querySelector(".panel.left .panel-title");
        if (!title || !title.parentElement) return;
        if (title.parentElement.querySelector(".panel-tools")) return;
        const tools = document.createElement("div");
        tools.className = "panel-tools";
        const state = getState();
        const { collapseBtn, expandBtn } = makeCollapseAllButtons(null, () => state?.root?.children || [], true);
        tools.appendChild(collapseBtn);
        tools.appendChild(expandBtn);

        const filterUi = createFilterControls(null, renderCards, true);
        const syncUi = createParamSyncControls();
        if (filterUi && filterUi.wrap) tools.appendChild(filterUi.wrap);
        if (syncUi && syncUi.wrap) tools.appendChild(syncUi.wrap);

        title.insertAdjacentElement("afterend", tools);
    }

    let draggingId = null;
    const DRAG_TYPE_NODE = "application/x-pb-node";
    const DRAG_TYPE_BUILDER = "application/x-pb-builder";
    let draggingBuilder = null;

    function getDragNodeId(e) {
        try {
            if (e?.dataTransfer) {
                const byType = e.dataTransfer.getData(DRAG_TYPE_NODE);
                if (byType) return byType;
                const plain = e.dataTransfer.getData("text/plain");
                if (plain) return plain;
            }
        } catch {}
        return draggingId;
    }

    function getDragBuilderInfo(e) {
        try {
            const raw = e?.dataTransfer?.getData(DRAG_TYPE_BUILDER);
            if (raw) {
                try { return JSON.parse(raw); } catch { return { type: raw }; }
            }
        } catch {}
        return draggingBuilder;
    }

    function setupDnD(handleEl, cardEl, node, listRef, getIdx, ownerNode = null) {
        handleEl.setAttribute("draggable", "true");
        handleEl.addEventListener("dragstart", (e) => {
            draggingId = node?.id || cardEl.dataset.id;
            draggingBuilder = null;
            cardEl.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData(DRAG_TYPE_NODE, draggingId); } catch {}
            e.dataTransfer.setData("text/plain", draggingId);
        });
        handleEl.addEventListener("dragend", () => {
            draggingId = null;
            draggingBuilder = null;
            cardEl.classList.remove("dragging");
            cardEl.classList.remove("drag-over");
        });

        cardEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            const builderInfo = getDragBuilderInfo(e);
            e.dataTransfer.dropEffect = builderInfo ? "copy" : "move";
            cardEl.classList.add("drag-over");
        });
        cardEl.addEventListener("dragleave", () => cardEl.classList.remove("drag-over"));
        cardEl.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cardEl.classList.remove("drag-over");
            const builderInfo = getDragBuilderInfo(e);
            if (builderInfo) {
                if (handleBuilderDrop(builderInfo, listRef, getIdx(), ownerNode)) renderAll();
                return;
            }

            const id = getDragNodeId(e);
            if (!id) return;

            // drop 在卡片上：插入到该卡片之前（同列表=排序，跨列表=移动）
            if (tryCopyWithBuilderIntoAddWith(id, ownerNode)) {
                renderAll();
                return;
            }
            historyCapture("drag_drop");
            const ok = moveNodeById(id, listRef, getIdx(), ownerNode);
            if (ok) renderAll();
        });
    }

    // 用于 add_fourier_series 内部 term 卡片的拖拽排序
    function setupDrag(handleEl, cardEl, listRef, getIdx, onRender) {
        if (!handleEl || !cardEl || !Array.isArray(listRef)) return;
        handleEl.setAttribute("draggable", "true");
        handleEl.addEventListener("dragstart", (e) => {
            draggingId = cardEl.dataset.id;
            draggingBuilder = null;
            cardEl.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", draggingId);
        });
        handleEl.addEventListener("dragend", () => {
            draggingId = null;
            draggingBuilder = null;
            cardEl.classList.remove("dragging");
            cardEl.classList.remove("drag-over");
        });

        cardEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            cardEl.classList.add("drag-over");
        });
        cardEl.addEventListener("dragleave", () => cardEl.classList.remove("drag-over"));
        cardEl.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cardEl.classList.remove("drag-over");
            const id = e.dataTransfer.getData("text/plain") || draggingId;
            if (!id) return;
            const fromIdx = listRef.findIndex(it => it && it.id === id);
            const toIdx = getIdx();
            if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
            historyCapture("drag_term");
            const item = listRef.splice(fromIdx, 1)[0];
            const insertAt = (fromIdx < toIdx) ? Math.max(0, toIdx - 1) : toIdx;
            listRef.splice(insertAt, 0, item);
            if (typeof onRender === "function") onRender();
            else renderAll();
        });
    }

    function bindAddWithBuilderDrag(handleEl, ownerNode) {
        if (!handleEl || !ownerNode) return;
        handleEl.setAttribute("draggable", "true");
        handleEl.classList.add("drag-handle");
        handleEl.addEventListener("dragstart", (e) => {
            const payload = { type: "add_with_builder", ownerId: ownerNode.id };
            draggingId = null;
            draggingBuilder = payload;
            handleEl.classList.add("dragging");
            e.dataTransfer.effectAllowed = "copy";
            try { e.dataTransfer.setData(DRAG_TYPE_BUILDER, JSON.stringify(payload)); } catch {}
            try { e.dataTransfer.setData("text/plain", "pb_builder"); } catch {}
        });
        handleEl.addEventListener("dragend", () => {
            draggingBuilder = null;
            handleEl.classList.remove("dragging");
        });
    }

    function setupListDropZone(containerEl, getListRef, getOwnerNode) {
        if (!containerEl || containerEl.__pbDropZoneBound) return;
        containerEl.__pbDropZoneBound = true;

        containerEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            const builderInfo = getDragBuilderInfo(e);
            e.dataTransfer.dropEffect = builderInfo ? "copy" : "move";
            containerEl.classList.add("dropzone-active");
        });

        containerEl.addEventListener("dragleave", () => containerEl.classList.remove("dropzone-active"));

        containerEl.addEventListener("drop", (e) => {
            e.preventDefault();
            containerEl.classList.remove("dropzone-active");
            const listRef = getListRef();
            const owner = getOwnerNode ? getOwnerNode() : null;
            if (!Array.isArray(listRef)) return;
            const scopeId = owner ? owner.id : null;
            if (isFilterActive(scopeId)) {
                showToast("过滤中只能交换顺序", "info");
                return;
            }

            const builderInfo = getDragBuilderInfo(e);
            if (builderInfo) {
                if (handleBuilderDrop(builderInfo, listRef, listRef.length, owner)) renderAll();
                return;
            }

            const id = getDragNodeId(e);
            if (!id) return;

            if (tryCopyWithBuilderIntoAddWith(id, owner)) {
                renderAll();
                return;
            }
            historyCapture("drag_drop_end");
            const ok = moveNodeById(id, listRef, listRef.length, owner);
            if (ok) renderAll();
        });
    }

    function bindSubDropZone(zoneEl, listRef, ownerNode) {
        if (!zoneEl) return;
        zoneEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            const builderInfo = getDragBuilderInfo(e);
            e.dataTransfer.dropEffect = builderInfo ? "copy" : "move";
            zoneEl.classList.add("active");
        });
        zoneEl.addEventListener("dragleave", () => zoneEl.classList.remove("active"));
        zoneEl.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            zoneEl.classList.remove("active");
            const scopeId = ownerNode ? ownerNode.id : null;
            if (isFilterActive(scopeId)) {
                showToast("过滤中只能交换顺序", "info");
                return;
            }
            const builderInfo = getDragBuilderInfo(e);
            if (builderInfo) {
                if (handleBuilderDrop(builderInfo, listRef, listRef.length, ownerNode)) renderAll();
                return;
            }

            const id = getDragNodeId(e);
            if (!id) return;

            if (tryCopyWithBuilderIntoAddWith(id, ownerNode)) {
                renderAll();
                return;
            }
            historyCapture("drag_drop_sub");
            const ok = moveNodeById(id, listRef, listRef.length, ownerNode);
            if (ok) renderAll();
        });
    }

    function addQuickOffsetTo(list) {
        const state = getState();
        const target = (list || state?.root?.children || []);
        historyCapture("quick_offset");
        target.push(makeNode("points_on_each_offset", {params: {offX: 0.2, offY: 0, offZ: 0}}));
        renderAll();
    }

    function renderFourierTermCard(parentNode, idx) {
        const t = parentNode.terms[idx];
        if (!t) return document.createElement("div");
        const card = document.createElement("div");
        card.className = "card subcard";
        card.dataset.id = t.id;
        if (getFocusedNodeId() === t.id) card.classList.add("focused");
        if (t.collapsed) card.classList.add("collapsed");

        const head = document.createElement("div");
        head.className = "card-head";

        const title = document.createElement("div");
        title.className = "card-title";

        const handle = document.createElement("div");
        handle.className = "handle";
        handle.textContent = "≡";

        const ttext = document.createElement("div");
        ttext.className = "title-text";
        ttext.textContent = `term ${idx + 1}`;

        title.appendChild(handle);
        title.appendChild(ttext);

        const actions = document.createElement("div");
        actions.className = "card-actions";

        const collapseBtn = iconBtn(t.collapsed ? "▸" : "▾", (e) => {
            e.stopPropagation();
            historyCapture("toggle_term_collapse");
            t.collapsed = !t.collapsed;
            card.classList.toggle("collapsed", t.collapsed);
            collapseBtn.textContent = t.collapsed ? "▸" : "▾";
            collapseBtn.title = t.collapsed ? "展开" : "收起";
        });
        collapseBtn.title = t.collapsed ? "展开" : "收起";
        actions.appendChild(collapseBtn);

        actions.appendChild(iconBtn("↑", () => {
            if (idx > 0) {
                historyCapture("move_fourier_term_up");
                const tmp = parentNode.terms[idx - 1];
                parentNode.terms[idx - 1] = parentNode.terms[idx];
                parentNode.terms[idx] = tmp;
                renderAll();
            }
        }));
        actions.appendChild(iconBtn("↓", () => {
            if (idx < parentNode.terms.length - 1) {
                historyCapture("move_fourier_term_down");
                const tmp = parentNode.terms[idx + 1];
                parentNode.terms[idx + 1] = parentNode.terms[idx];
                parentNode.terms[idx] = tmp;
                renderAll();
            }
        }));
        actions.appendChild(iconBtn("🗑", () => {
            historyCapture("delete_fourier_term");
            const wasFocused = (getFocusedNodeId() === t.id);
            parentNode.terms.splice(idx, 1);
            if (wasFocused) {
                const next = pickReasonableFocusAfterDelete({ parentList: parentNode.terms, index: idx, parentNode });
                setFocusedNode(next, false);
            }
            renderAll();
        }, true));

        head.appendChild(title);
        head.appendChild(actions);

        const body = document.createElement("div");
        body.className = "card-body";
        if (Number.isFinite(t.bodyHeight)) {
            body.style.height = `${t.bodyHeight}px`;
            body.style.maxHeight = `${t.bodyHeight}px`;
        }
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
        const resizer = document.createElement("div");
        resizer.className = "card-resizer";
        bindCardBodyResizer(resizer, body, t);
        card.appendChild(resizer);

        // ✅ 同样处理焦点：避免焦点落在 Fourier 子卡片时仍残留上一张卡的高亮
        card.tabIndex = 0;
        card.addEventListener("pointerdown", (e) => {
            if (getIsRenderingCards()) return;
            if (e.button !== 0) return;
            // ✅ 避免父卡片接管子卡片的点击：只响应“事件发生在当前卡片自身区域”
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(t.id);
        });
        card.addEventListener("focusin", (e) => {
            if (getIsRenderingCards()) return;
            // ✅ focusin 会冒泡：子卡片获得焦点时，父卡片不应抢走高亮
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(t.id);
        });
        card.addEventListener("focusout", (e) => {
            if (getIsRenderingCards()) return;
            if (getSuppressCardFocusOutClear()) return;
            const next = e.relatedTarget;
            if (next && card.contains(next)) return;
            requestAnimationFrame(() => {
                const ae = document.activeElement;
                if (ae && card.contains(ae)) return;
                clearFocusedNodeIf(t.id);
            });
        });

        setupDrag(handle, card, parentNode.terms, () => idx, () => renderAll());
        return card;
    }

    function renderNodeCard(node, siblings, idx, ownerLabel, ownerNode = null) {
        const def = KIND[node.kind];
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.id = node.id;
        const scopeId = ownerNode ? ownerNode.id : null;
        const useFilterSwap = isFilterActive(scopeId);
        if (node.id === getFocusedNodeId()) card.classList.add("focused");
        const sync = getParamSync();
        if (sync && sync.selectedIds && sync.selectedIds.has(node.id)) card.classList.add("sync-target");
        if (node.collapsed) card.classList.add("collapsed");

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

        let collapsePrev = null;
        const rememberCollapsePrev = () => {
            if (collapsePrev !== null) return;
            collapsePrev = node.collapsed;
        };
        const collapseBtn = iconBtn(node.collapsed ? "▸" : "▾", (e) => {
            e.stopPropagation();
            historyCapture("toggle_card_collapse");
            const wasCollapsed = (collapsePrev !== null) ? collapsePrev : node.collapsed;
            collapsePrev = null;
            node.collapsed = !wasCollapsed;
            if (typeof ctx.isCollapseAllActive === "function" && ctx.isCollapseAllActive(scopeId)) {
                const scope = (typeof ctx.getCollapseScope === "function") ? ctx.getCollapseScope(scopeId) : null;
                if (scope && scope.manualOpen) {
                    if (node.collapsed) scope.manualOpen.delete(node.id);
                    else scope.manualOpen.add(node.id);
                }
            }
            card.classList.toggle("collapsed", node.collapsed);
            collapseBtn.textContent = node.collapsed ? "▸" : "▾";
            collapseBtn.title = node.collapsed ? "展开" : "收起";
        });
        collapseBtn.addEventListener("pointerdown", rememberCollapsePrev);
        collapseBtn.addEventListener("mousedown", rememberCollapsePrev);
        collapseBtn.addEventListener("touchstart", rememberCollapsePrev, { passive: true });
        collapseBtn.addEventListener("keydown", (ev) => {
            if (ev.key === " " || ev.key === "Enter") rememberCollapsePrev();
        });
        collapseBtn.dataset.collapseBtn = "1";
        collapseBtn.title = node.collapsed ? "展开" : "收起";
        actions.appendChild(collapseBtn);

        // ✅ 快捷添加：在当前卡片下方插入（若选中 withBuilder 卡片则插入到子Builder）
        const addBtn = iconBtn("＋", () => {
            if (isBuilderContainerKind(node.kind)) {
                openModal(node.children, (node.children || []).length, "子Builder", node.id);
            } else {
                openModal(siblings, idx + 1, ownerLabel);
            }
        });
        addBtn.title = "在下方新增";
        actions.appendChild(addBtn);

        const toTopBtn = iconBtn("⇡", () => {
            if (useFilterSwap) {
                const target = findVisibleSwapIndex(idx, "top", siblings, scopeId);
                if (target >= 0 && target !== idx) {
                    historyCapture("move_top");
                    swapInList(siblings, idx, target);
                    renderAll();
                }
                return;
            }
            if (idx > 0) {
                historyCapture("move_top");
                const n = siblings.splice(idx, 1)[0];
                siblings.unshift(n);
                renderAll();
            }
        });
        toTopBtn.title = "置顶";
        actions.appendChild(toTopBtn);

        const upBtn = iconBtn("↑", () => {
            if (useFilterSwap) {
                const target = findVisibleSwapIndex(idx, "prev", siblings, scopeId);
                if (target >= 0 && target !== idx) {
                    historyCapture("move_up");
                    swapInList(siblings, idx, target);
                    renderAll();
                }
                return;
            }
            if (idx > 0) {
                historyCapture("move_up");
                const t = siblings[idx - 1];
                siblings[idx - 1] = siblings[idx];
                siblings[idx] = t;
                renderAll();
            }
        });
        upBtn.title = "上移";
        actions.appendChild(upBtn);

        const downBtn = iconBtn("↓", () => {
            if (useFilterSwap) {
                const target = findVisibleSwapIndex(idx, "next", siblings, scopeId);
                if (target >= 0 && target !== idx) {
                    historyCapture("move_down");
                    swapInList(siblings, idx, target);
                    renderAll();
                }
                return;
            }
            if (idx < siblings.length - 1) {
                historyCapture("move_down");
                const t = siblings[idx + 1];
                siblings[idx + 1] = siblings[idx];
                siblings[idx] = t;
                renderAll();
            }
        });
        downBtn.title = "下移";
        actions.appendChild(downBtn);

        const toBottomBtn = iconBtn("⇣", () => {
            if (useFilterSwap) {
                const target = findVisibleSwapIndex(idx, "bottom", siblings, scopeId);
                if (target >= 0 && target !== idx) {
                    historyCapture("move_bottom");
                    swapInList(siblings, idx, target);
                    renderAll();
                }
                return;
            }
            if (idx < siblings.length - 1) {
                historyCapture("move_bottom");
                const n = siblings.splice(idx, 1)[0];
                siblings.push(n);
                renderAll();
            }
        });
        toBottomBtn.title = "置底";
        actions.appendChild(toBottomBtn);

        if (node.kind === "add_line" || node.kind === "points_on_each_offset") {
            const mirrorBtn = iconBtn("⇋", () => {
                const cloned = mirrorCopyNode(node, getMirrorPlane());
                if (!cloned) return;
                historyCapture("mirror_copy");
                siblings.splice(idx + 1, 0, cloned);
                renderAll();
                requestAnimationFrame(() => {
                    const el = elCardsRoot.querySelector(`.card[data-id="${cloned.id}"]`);
                    if (el) {
                        try { el.focus(); } catch {}
                        try { el.scrollIntoView({ block: "nearest" }); } catch {}
                        setFocusedNode(cloned.id, false);
                    }
                });
            });
            mirrorBtn.dataset.mirrorBtn = "1";
            mirrorBtn.title = `镜像复制（${getMirrorPlaneInfo().label}）`;
            actions.appendChild(mirrorBtn);
        }

        // ✅ 复制卡片：在当前卡片下方插入一张一模一样的（含子卡片/terms）
        const copyBtn = iconBtn("⧉", () => {
            historyCapture("copy_card");
            const cloned = cloneNodeDeep(node);
            siblings.splice(idx + 1, 0, cloned);
            renderAll();

            // 尝试把焦点放到新卡片，方便继续编辑
            requestAnimationFrame(() => {
                const el = elCardsRoot.querySelector(`.card[data-id="${cloned.id}"]`);
                if (el) {
                    el.focus();
                    try { el.scrollIntoView({ block: "nearest" }); } catch {}
                }
            });
        });
        copyBtn.title = "复制";
        actions.appendChild(copyBtn);

        const delBtn = iconBtn("🗑", () => {
            historyCapture("delete_card");
            siblings.splice(idx, 1);
            // 如果删的是当前聚焦卡片：把焦点挪到更合理的位置（不额外写历史）
            if (getFocusedNodeId() === node.id) {
                const next = pickReasonableFocusAfterDelete({ parentList: siblings, index: idx, parentNode: ownerNode });
                setFocusedNode(next, false);
            }
            ensureAxisEverywhere();
            renderAll();
        }, true);
        delBtn.title = "删除";
        actions.appendChild(delBtn);

        head.appendChild(title);
        head.appendChild(actions);

        const body = document.createElement("div");
        body.className = "card-body";
        if (Number.isFinite(node.bodyHeight)) {
            body.style.height = `${node.bodyHeight}px`;
            body.style.maxHeight = `${node.bodyHeight}px`;
        }

        if (def?.desc) {
            const d = document.createElement("div");
            d.className = "pill";
            d.textContent = def.desc;
            body.appendChild(d);
        }

        renderParamsEditors(body, node, ownerLabel);

        card.appendChild(head);
        card.appendChild(body);
        const resizer = document.createElement("div");
        resizer.className = "card-resizer";
        bindCardBodyResizer(resizer, body, node);
        card.appendChild(resizer);

        // ✅ 聚焦高亮：卡片获得焦点时，让对应新增的粒子变色
        card.tabIndex = 0; // 让卡片标题区也可获得焦点（点击空白处也算聚焦）
        card.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            // ✅ 避免 withBuilder 父卡片接管子卡片：只响应“事件发生在当前卡片自身区域”
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            if (isSyncSelectableEvent(e)) toggleSyncTarget(node);
            setFocusedNode(node.id);
        });
        card.addEventListener("focusin", (e) => {
            // ✅ focusin 会冒泡：子卡片获得焦点时，父卡片不应抢走高亮
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(node.id);
        });
        card.addEventListener("focusout", (e) => {
            if (getIsRenderingCards()) return;
            if (getSuppressCardFocusOutClear()) return;
            const next = e.relatedTarget;
            if (next && card.contains(next)) return;
            // 延迟一帧：避免同卡片内切换焦点时误清空
            requestAnimationFrame(() => {
                const ae = document.activeElement;
                if (ae && card.contains(ae)) return;
                clearFocusedNodeIf(node.id);
            });
        });

        setupDnD(handle, card, node, siblings, () => idx, ownerNode);
        return card;
    }

    function renderCards() {
        setIsRenderingCards(true);
        try {
            elCardsRoot.innerHTML = "";
            cleanupFilterMenus();
            const state = getState();
            const list = state?.root?.children || [];
            const entries = getVisibleEntries(list, null) || list.map((node, index) => ({ node, index }));
            for (const it of entries) {
                elCardsRoot.appendChild(renderNodeCard(it.node, list, it.index, "主Builder", null));
            }
        } finally {
            setIsRenderingCards(false);
        }
        // DOM 重建后重新标记聚焦高亮
        updateFocusCardUI();
        requestAnimationFrame(() => layoutActionOverflow());
    }
    function renderParamsEditors(body, node, ownerLabel, options = null) {
        const p = node.params;
        const opts = options || {};
        switch (node.kind) {
            case "axis":
                body.appendChild(row("axis", makeVec3Editor(p, "", rebuildPreviewAndKotlin, "axis")));
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
                    body.appendChild(row("origin", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "origin")));
                    body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                } else {
                    body.appendChild(row("to", makeVec3Editor(p, "to", rebuildPreviewAndKotlin, "to")));
                }
                break;

            case "add_point":
                body.appendChild(row("point", makeVec3Editor(p, "", rebuildPreviewAndKotlin, "point")));
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

            case "add_radian_center":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("radian(度)", inputNum(p.radianDeg, v => {
                    p.radianDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("rotate角度(度)", inputNum(p.rotateDeg, v => {
                    p.rotateDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_radian":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("start(度)", inputNum(p.startDeg, v => {
                    p.startDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("end(度)", inputNum(p.endDeg, v => {
                    p.endDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("rotate角度(度)", inputNum(p.rotateDeg, v => {
                    p.rotateDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_ball":
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
                break;

            case "add_ring":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("thickness", inputNum(p.thickness, v => {
                    p.thickness = v;
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
                break;

            case "add_line":
                body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
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
                body.appendChild(row("输出形式", select(
                    [["direct3", "it.add(x,y,z)"], ["newRel", "it.add(RelativeLocation)"], ["valRel", "val rel; it.add(rel)"]],
                    p.kotlinMode,
                    v => {
                        p.kotlinMode = v;
                        rebuildPreviewAndKotlin();
                    }
                )));
                break;

            case "add_bezier":
                body.appendChild(row("p1", makeVec3Editor(p, "p1", rebuildPreviewAndKotlin, "p1")));
                body.appendChild(row("p2", makeVec3Editor(p, "p2", rebuildPreviewAndKotlin, "p2")));
                body.appendChild(row("p3", makeVec3Editor(p, "p3", rebuildPreviewAndKotlin, "p3")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_bezier_4":
                body.appendChild(row("p1", makeVec3Editor(p, "p1", rebuildPreviewAndKotlin, "p1")));
                body.appendChild(row("p2", makeVec3Editor(p, "p2", rebuildPreviewAndKotlin, "p2")));
                body.appendChild(row("p3", makeVec3Editor(p, "p3", rebuildPreviewAndKotlin, "p3")));
                body.appendChild(row("p4", makeVec3Editor(p, "p4", rebuildPreviewAndKotlin, "p4")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_broken_line":
                body.appendChild(row("p1", makeVec3Editor(p, "p1", rebuildPreviewAndKotlin, "p1")));
                body.appendChild(row("p2", makeVec3Editor(p, "p2", rebuildPreviewAndKotlin, "p2")));
                body.appendChild(row("p3", makeVec3Editor(p, "p3", rebuildPreviewAndKotlin, "p3")));
                body.appendChild(row("count1", inputNum(p.count1, v => {
                    p.count1 = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count2", inputNum(p.count2, v => {
                    p.count2 = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_polygon":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("sideCount", inputNum(p.sideCount, v => {
                    p.sideCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_rect":
                body.appendChild(row("w", inputNum(p.w, v => {
                    p.w = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("h", inputNum(p.h, v => {
                    p.h = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("countW", inputNum(p.countW, v => {
                    p.countW = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("countH", inputNum(p.countH, v => {
                    p.countH = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_arc":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("center", makeVec3Editor(p, "c", rebuildPreviewAndKotlin, "center")));
                body.appendChild(row("startDeg", inputNum(p.startDeg, v => {
                    p.startDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("endDeg", inputNum(p.endDeg, v => {
                    p.endDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "apply_rotate":
                body.appendChild(row("angleDeg", inputNum(p.angleDeg, v => {
                    p.angleDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("axis", makeVec3Editor(p, "axis", rebuildPreviewAndKotlin, "axis")));
                body.appendChild(row("rotateAsAxis", checkbox(p.rotateAsAxis, v => {
                    p.rotateAsAxis = v;
                    renderAll();
                })));
                if (p.rotateAsAxis) body.appendChild(row("rotateAxis", makeVec3Editor(p, "rotAxis", rebuildPreviewAndKotlin, "rotateAxis")));
                break;

            case "apply_move":
                body.appendChild(row("offset", makeVec3Editor(p, "off", rebuildPreviewAndKotlin, "offset")));
                break;

            case "apply_rel_move":
                body.appendChild(row("offset", makeVec3Editor(p, "off", rebuildPreviewAndKotlin, "offset")));
                break;

            case "apply_scale":
                body.appendChild(row("scale", inputNum(p.scale, v => {
                    p.scale = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "apply_per_point_offset":
                body.appendChild(row("offset", makeVec3Editor(p, "off", rebuildPreviewAndKotlin, "offset")));
                break;

            case "apply_spiral_offset":
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("height", inputNum(p.h, v => {
                    p.h = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("rotate角度(度)", inputNum(p.rotateDeg, v => {
                    p.rotateDeg = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "apply_random_offset":
                body.appendChild(row("min", inputNum(p.offsetLenMin, v => {
                    p.offsetLenMin = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("max", inputNum(p.offsetLenMax, v => {
                    p.offsetLenMax = v;
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

            case "add_with":
                if (!Array.isArray(node.children)) node.children = [];
                body.appendChild(row("旋转半径 r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("置换个数 c", inputNum(p.c, v => {
                    p.c = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotateToCenter", checkbox(p.rotateToCenter, v => {
                    p.rotateToCenter = v;
                    renderAll();
                })));
                if (p.rotateToCenter) {
                    body.appendChild(row("反向", checkbox(p.rotateReverse, v => {
                        p.rotateReverse = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                body.appendChild(row("旋转偏移", checkbox(p.rotateOffsetEnabled, v => {
                    p.rotateOffsetEnabled = v;
                    renderAll();
                })));
                if (p.rotateOffsetEnabled) {
                    body.appendChild(row("偏移", makeVec3Editor(p, "ro", rebuildPreviewAndKotlin, "offset")));
                }
                if (!opts.paramsOnly) {
                    body.appendChild(row("折叠子卡片", checkbox(node.folded, v => {
                        node.folded = v;
                        renderAll();
                    })));
                }
                if (!opts.paramsOnly && !node.folded) {
                    const block = document.createElement("div");
                    block.className = "subblock";
                    if (Number.isFinite(node.subWidth)) {
                        const w = Math.max(240, node.subWidth);
                        node.subWidth = w;
                        block.style.width = `${w}px`;
                    }

                    const head = document.createElement("div");
                    head.className = "subblock-head";

                    const title = document.createElement("div");
                    title.className = "subblock-title";
                    const dragHandle = document.createElement("div");
                    dragHandle.className = "handle subblock-handle";
                    dragHandle.textContent = "≡";
                    dragHandle.title = "拖到外部生成 withBuilder";
                    bindAddWithBuilderDrag(dragHandle, node);
                    const titleText = document.createElement("div");
                    titleText.className = "subblock-title-text";
                    titleText.textContent = "子 PointsBuilder（addWith）";
                    title.appendChild(dragHandle);
                    title.appendChild(titleText);

                    const actions = document.createElement("div");
                    actions.className = "mini";

                    const addBtn = document.createElement("button");
                    addBtn.className = "btn small primary";
                    addBtn.textContent = "添加元素";
                    addBtn.addEventListener("click", () => openModal(node.children, (node.children || []).length, "子Builder", node.id));

                    const dragOutBtn = document.createElement("div");
                    dragOutBtn.className = "btn small drag-handle";
                    dragOutBtn.textContent = "拖出Builder";
                    dragOutBtn.setAttribute("role", "button");
                    dragOutBtn.tabIndex = 0;
                    dragOutBtn.title = "拖到外部生成 withBuilder";
                    bindAddWithBuilderDrag(dragOutBtn, node);

                    const { collapseBtn: collapseAllBtn, expandBtn: expandAllBtn } = makeCollapseAllButtons(node.id, () => node.children, true);
                    const filterUi = createFilterControls(node.id, renderCards, true);

                    const offBtn = document.createElement("button");
                    offBtn.className = "btn small";
                    offBtn.textContent = "快捷Offset";
                    offBtn.addEventListener("click", () => addQuickOffsetTo(node.children));

                    const pickBtn = document.createElement("button");
                    pickBtn.className = "btn small";
                    pickBtn.textContent = "XZ拾取直线";
                    pickBtn.dataset.pickLineBtn = "1";
                    pickBtn.addEventListener("click", () => {
                        if (getLinePickMode()) stopLinePick();
                        else {
                            if (getPointPickMode()) stopPointPick();
                            startLinePick(node.children, "子Builder", (node.children || []).length);
                        }
                    });

                    const exportBtn = document.createElement("button");
                    exportBtn.className = "btn small";
                    exportBtn.textContent = "导出JSON";
                    exportBtn.addEventListener("click", () => {
                        const out = {root: {id: "root", kind: "ROOT", children: deepClone(node.children || [])}};
                        downloadText("addWithBuilder.json", JSON.stringify(out, null, 2), "application/json");
                    });

                    const importBtn = document.createElement("button");
                    importBtn.className = "btn small";
                    importBtn.textContent = "导入JSON";
                    importBtn.addEventListener("click", () => {
                        if (!fileBuilderJson) return;
                        setBuilderJsonTargetNode(node);
                        fileBuilderJson.click();
                    });

                    const clearBtn = document.createElement("button");
                    clearBtn.className = "btn small danger";
                    clearBtn.textContent = "清空";
                    clearBtn.addEventListener("click", () => {
                        historyCapture("clear_add_with");
                        node.children.splice(0);
                        ensureAxisInList(node.children);
                        renderAll();
                    });

                    actions.appendChild(addBtn);
                    actions.appendChild(dragOutBtn);
                    actions.appendChild(collapseAllBtn);
                    actions.appendChild(expandAllBtn);
                    if (filterUi && filterUi.wrap) actions.appendChild(filterUi.wrap);
                    actions.appendChild(offBtn);
                    actions.appendChild(pickBtn);
                    actions.appendChild(exportBtn);
                    actions.appendChild(importBtn);
                    actions.appendChild(clearBtn);

                    head.appendChild(title);
                    head.appendChild(actions);

                    const sub = document.createElement("div");
                    sub.className = "subcards";
                    if (Number.isFinite(node.subHeight)) {
                        const h = Math.max(120, node.subHeight);
                        node.subHeight = h;
                        sub.style.height = `${h}px`;
                        sub.style.maxHeight = `${h}px`;
                    }
                    setupListDropZone(sub, () => node.children, () => node);

                    const list = node.children || [];
                    const entries = getVisibleEntries(list, node.id) || list.map((node, index) => ({ node, index }));
                    for (const it of entries) {
                        sub.appendChild(renderNodeCard(it.node, list, it.index, "子Builder", node));
                    }

                    block.appendChild(head);
                    block.appendChild(sub);

                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 addWith 子列表（可拖回主列表）";
                    bindSubDropZone(zone, node.children, node);
                    block.appendChild(zone);

                    const heightResizer = document.createElement("div");
                    heightResizer.className = "subblock-resizer-y";
                    bindSubblockHeightResizer(heightResizer, sub, node);
                    block.appendChild(heightResizer);

                    const widthResizer = document.createElement("div");
                    widthResizer.className = "subblock-resizer";
                    bindSubblockWidthResizer(widthResizer, block, node);
                    block.appendChild(widthResizer);

                    body.appendChild(block);
                } else if (!opts.paramsOnly) {
                    const mini = document.createElement("div");
                    mini.className = "mini";
                    const dragOutBtn = document.createElement("div");
                    dragOutBtn.className = "btn small drag-handle";
                    dragOutBtn.textContent = "拖出Builder";
                    dragOutBtn.setAttribute("role", "button");
                    dragOutBtn.tabIndex = 0;
                    dragOutBtn.title = "拖到外部生成 withBuilder";
                    bindAddWithBuilderDrag(dragOutBtn, node);
                    mini.appendChild(dragOutBtn);
                    body.appendChild(mini);

                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 addWith 子列表";
                    bindSubDropZone(zone, node.children, node);
                    body.appendChild(zone);
                }
                break;

            case "with_builder":
                if (opts.paramsOnly) {
                    const tip = document.createElement("div");
                    tip.className = "pill";
                    tip.textContent = "该类型只有子 Builder，没有可同步参数";
                    body.appendChild(tip);
                    break;
                }
                if (!node.folded) {
                    const block = document.createElement("div");
                    block.className = "subblock";
                    if (Number.isFinite(node.subWidth)) {
                        const w = Math.max(240, node.subWidth);
                        node.subWidth = w;
                        block.style.width = `${w}px`;
                    }

                    const head = document.createElement("div");
                    head.className = "subblock-head";

                    const title = document.createElement("div");
                    title.className = "subblock-title";
                    title.textContent = `子 PointsBuilder（${ownerLabel}）`;

                    const actions = document.createElement("div");
                    actions.className = "mini";

                    // ✅ 内部控制与外部一致：添加元素 / 快捷Offset / XZ拾取直线
                    const addBtn = document.createElement("button");
                    addBtn.className = "btn small primary";
                    addBtn.textContent = "添加元素";
                    addBtn.addEventListener("click", () => openModal(node.children, (node.children || []).length, "子Builder", node.id));

                    const { collapseBtn: collapseAllBtn, expandBtn: expandAllBtn } = makeCollapseAllButtons(node.id, () => node.children, true);
                    const filterUi = createFilterControls(node.id, renderCards, true);

                    const offBtn = document.createElement("button");
                    offBtn.className = "btn small";
                    offBtn.textContent = "快捷Offset";
                    offBtn.addEventListener("click", () => addQuickOffsetTo(node.children));

                    const pickBtn = document.createElement("button");
                    pickBtn.className = "btn small";
                    pickBtn.textContent = "XZ拾取直线";
                    pickBtn.dataset.pickLineBtn = "1";
                    pickBtn.addEventListener("click", () => {
                        if (getLinePickMode()) stopLinePick();
                        else {
                            if (getPointPickMode()) stopPointPick();
                            startLinePick(node.children, "子Builder", (node.children || []).length);
                        }
                    });

                    const exportBtn = document.createElement("button");
                    exportBtn.className = "btn small";
                    exportBtn.textContent = "导出JSON";
                    exportBtn.addEventListener("click", () => {
                        const out = {root: {id: "root", kind: "ROOT", children: deepClone(node.children || [])}};
                        downloadText("withBuilder.json", JSON.stringify(out, null, 2), "application/json");
                    });

                    const importBtn = document.createElement("button");
                    importBtn.className = "btn small";
                    importBtn.textContent = "导入JSON";
                    importBtn.addEventListener("click", () => {
                        if (!fileBuilderJson) return;
                        setBuilderJsonTargetNode(node);
                        fileBuilderJson.click();
                    });

                    const clearBtn = document.createElement("button");
                    clearBtn.className = "btn small danger";
                    clearBtn.textContent = "清空";
                    clearBtn.addEventListener("click", () => {
                        historyCapture("clear_withBuilder");
                        node.children.splice(0);
                        ensureAxisInList(node.children);
                        renderAll();
                    });

                    actions.appendChild(addBtn);
                    actions.appendChild(collapseAllBtn);
                    actions.appendChild(expandAllBtn);
                    if (filterUi && filterUi.wrap) actions.appendChild(filterUi.wrap);
                    actions.appendChild(offBtn);
                    actions.appendChild(pickBtn);
                    actions.appendChild(exportBtn);
                    actions.appendChild(importBtn);
                    actions.appendChild(clearBtn);

                    head.appendChild(title);
                    head.appendChild(actions);

                    const sub = document.createElement("div");
                    sub.className = "subcards";
                    if (Number.isFinite(node.subHeight)) {
                        const h = Math.max(120, node.subHeight);
                        node.subHeight = h;
                        sub.style.height = `${h}px`;
                        sub.style.maxHeight = `${h}px`;
                    }
                    setupListDropZone(sub, () => node.children, () => node);

                    const list = node.children || [];
                    const entries = getVisibleEntries(list, node.id) || list.map((node, index) => ({ node, index }));
                    for (const it of entries) {
                        sub.appendChild(renderNodeCard(it.node, list, it.index, "子Builder", node));
                    }

                    block.appendChild(head);
                    block.appendChild(sub);

                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 withBuilder 子列表（可拖回主列表）";
                    bindSubDropZone(zone, node.children, node);
                    block.appendChild(zone);

                    const heightResizer = document.createElement("div");
                    heightResizer.className = "subblock-resizer-y";
                    bindSubblockHeightResizer(heightResizer, sub, node);
                    block.appendChild(heightResizer);

                    const widthResizer = document.createElement("div");
                    widthResizer.className = "subblock-resizer";
                    bindSubblockWidthResizer(widthResizer, block, node);
                    block.appendChild(widthResizer);

                    body.appendChild(block);
                } else {
                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 withBuilder 子列表";
                    bindSubDropZone(zone, node.children, node);
                    body.appendChild(zone);
                }
                break;

            case "add_fourier_series":
                if (!opts.paramsOnly) {
                    body.appendChild(row("折叠", checkbox(node.folded, v => {
                        node.folded = v;
                        renderAll();
                    })));
                }
                body.appendChild(row("angle(度)", inputNum(p.angle, v => {
                    p.angle = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("xOffset", inputNum(p.xOffset, v => {
                    p.xOffset = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("zOffset", inputNum(p.zOffset, v => {
                    p.zOffset = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                if (!opts.paramsOnly && !node.folded) {
                    const sub = document.createElement("div");
                    sub.className = "subcards";
                    const list = node.terms || [];
                    for (let i = 0; i < list.length; i++) {
                        sub.appendChild(renderFourierTermCard(node, i));
                    }
                    body.appendChild(sub);

                    const btn = document.createElement("button");
                    btn.className = "btn small";
                    btn.textContent = "添加 term";
                    btn.addEventListener("click", () => {
                        historyCapture("add_fourier_term");
                        node.terms.push({id: makeUid(), r: 1, w: 1, startAngle: 0, collapsed: false, bodyHeight: null});
                        renderAll();
                    });
                    body.appendChild(btn);
                }
                break;
            default:
                break;
        }
    }

    return {
        renderCards,
        renderParamsEditors,
        layoutActionOverflow,
        initCollapseAllControls,
        setupListDropZone,
        addQuickOffsetTo
    };
}
