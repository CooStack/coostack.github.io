export function createNodeHelpers(options = {}) {
    const { KIND, uid, getDefaultMirrorPlane } = options;
    const makeId = (typeof uid === "function")
        ? uid
        : () => (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);

    function makeNode(kind, init = {}) {
        const def = KIND ? KIND[kind] : null;
        const n = {
            id: makeId(),
            kind,
            folded: false,
            collapsed: false,
            bodyHeight: null,
            subWidth: null,
            subHeight: null,
            params: JSON.parse(JSON.stringify(def?.defaultParams || {})),
            children: [],
            terms: [],
            ...init
        };
        if (init.params) Object.assign(n.params, init.params);
        if (init.folded !== undefined) n.folded = !!init.folded;
        return n;
    }

    function cloneNodeDeep(node) {
        const raw = JSON.parse(JSON.stringify(node || {}));
        const reId = (n) => {
            n.id = makeId();
            if (Array.isArray(n.terms)) {
                for (const t of n.terms) {
                    if (t && typeof t === "object") t.id = makeId();
                }
            }
            if (Array.isArray(n.children)) {
                for (const c of n.children) reId(c);
            }
        };
        reId(raw);
        return raw;
    }

    function cloneNodeListDeep(list) {
        return (list || []).map(n => cloneNodeDeep(n));
    }

    function replaceListContents(listRef, newItems) {
        if (!Array.isArray(listRef)) return;
        listRef.splice(0, listRef.length, ...(newItems || []));
    }

    function mirrorPointByPlane(p, planeKey) {
        const fallbackPlane = (typeof getDefaultMirrorPlane === "function") ? getDefaultMirrorPlane() : "XZ";
        const plane = planeKey || fallbackPlane || "XZ";
        if (plane === "XY") return {x: p.x, y: p.y, z: -p.z};
        if (plane === "ZY") return {x: -p.x, y: p.y, z: p.z};
        return {x: p.x, y: -p.y, z: p.z};
    }

    function mirrorCopyNode(node, planeKey) {
        if (!node || !node.kind) return null;
        const cloned = cloneNodeDeep(node);
        if (node.kind === "add_line") {
            const s = mirrorPointByPlane({x: node.params.sx, y: node.params.sy, z: node.params.sz}, planeKey);
            const e = mirrorPointByPlane({x: node.params.ex, y: node.params.ey, z: node.params.ez}, planeKey);
            cloned.params.sx = s.x; cloned.params.sy = s.y; cloned.params.sz = s.z;
            cloned.params.ex = e.x; cloned.params.ey = e.y; cloned.params.ez = e.z;
            return cloned;
        }
        if (node.kind === "points_on_each_offset") {
            const v = mirrorPointByPlane({x: node.params.offX, y: node.params.offY, z: node.params.offZ}, planeKey);
            cloned.params.offX = v.x; cloned.params.offY = v.y; cloned.params.offZ = v.z;
            return cloned;
        }
        return null;
    }

    return {
        makeNode,
        cloneNodeDeep,
        cloneNodeListDeep,
        replaceListContents,
        mirrorPointByPlane,
        mirrorCopyNode
    };
}
