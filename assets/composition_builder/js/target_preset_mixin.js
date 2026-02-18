export function installTargetPresetMethods(CompositionBuilderApp, deps = {}) {
    const {
        esc,
        sanitizeKotlinClassName,
        PARTICLE_INIT_TARGET_OPTIONS
    } = deps;

    if (!CompositionBuilderApp || !CompositionBuilderApp.prototype) {
        throw new Error("installTargetPresetMethods requires CompositionBuilderApp");
    }
    if (typeof esc !== "function") {
        throw new Error("installTargetPresetMethods requires esc dependency");
    }

    class TargetPresetMixin {
    getRelativeTargetPresetOptionsHtml(selectedExpr = "") {
        const presets = this.getRelativeTargetPresets();
        const pick = String(selectedExpr || "").trim();
        const hasPick = !!pick && presets.some((p) => p.expr === pick);
        const rows = [`<option value="" ${hasPick ? "" : "selected"}>选择预设或全局变量</option>`];
        for (const p of presets) {
            rows.push(`<option value="${esc(p.expr)}" ${p.expr === pick ? "selected" : ""}>${esc(p.label)}</option>`);
        }
        return rows.join("");
    }

    getRelativeTargetPresets() {
        const out = [
            { label: "RelativeLocation.yAxis()", expr: "RelativeLocation.yAxis()" },
            { label: "RelativeLocation(0,1,0)", expr: "RelativeLocation(0.0, 1.0, 0.0)" }
        ];
        for (const v of this.state.globalVars) {
            const name = String(v.name || "").trim();
            if (!name) continue;
            const type = String(v.type || "").trim();
            if (type === "Vec3") out.push({ label: `${name}.asRelative()`, expr: `${name}.asRelative()` });
            if (type === "RelativeLocation") out.push({ label: `${name}`, expr: `${name}` });
        }
        return out;
    }

    getAngleExprPresetOptionsHtml(selectedExpr = "") {
        const selected = String(selectedExpr || "").trim();
        const presets = ["speed / 180 * PI", "PI / 180", "0.01", "0.05", "PI * 0.1"];
        for (const g of this.state.globalVars) {
            const name = String(g.name || "").trim();
            const type = String(g.type || "").trim();
            if (!name) continue;
            if (["Int", "Long", "Float", "Double"].includes(type)) {
                presets.push(name);
                presets.push(`${name} / 180 * PI`);
            }
        }
        const uniq = Array.from(new Set(presets.filter(Boolean)));
        if (selected && !uniq.includes(selected)) uniq.unshift(selected);
        return uniq.map((expr) => `<option value="${esc(expr)}" ${expr === selected ? "selected" : ""}>${esc(expr)}</option>`).join("");
    }

    getParticleInitTargetOptionsHtml(selectedTarget = "") {
        const selected = String(selectedTarget || "").trim() || "size";
        const rows = [];
        const options = Array.isArray(PARTICLE_INIT_TARGET_OPTIONS) ? PARTICLE_INIT_TARGET_OPTIONS : [];
        if (!options.includes(selected)) {
            rows.push({ value: selected, label: `${selected} (自定义)` });
        }
        for (const target of options) {
            rows.push({ value: target, label: this.getParticleInitTargetLabel(target) });
        }
        return rows.map((row) => `<option value="${esc(row.value)}" ${row.value === selected ? "selected" : ""}>${esc(row.label)}</option>`).join("");
    }

    getParticleInitTargetLabel(targetRaw = "") {
        const target = String(targetRaw || "").trim();
        if (target === "size" || target === "particleSize") return `${target} (粒子大小)`;
        if (target === "particleAlpha" || target === "alpha") return `${target} (透明度)`;
        if (target === "currentAge" || target === "age") return `${target} (年龄)`;
        if (target === "textureSheet") return "textureSheet (贴图序号)";
        if (target === "color" || target === "particleColor") return `${target} (颜色 Vec3)`;
        return target;
    }

    isParticleInitVectorTarget(targetRaw = "") {
        const target = String(targetRaw || "").trim().toLowerCase();
        return target === "color" || target === "particlecolor" || target === "particle.particlecolor";
    }

    getParticleInitDefaultExprByTarget(targetRaw = "") {
        const target = String(targetRaw || "").trim().toLowerCase();
        if (target === "size" || target === "particlesize" || target === "particle.particlesize") return "0.2";
        if (target === "alpha" || target === "particlealpha" || target === "particle.particlealpha") return "1.0";
        if (target === "currentage" || target === "age") return "0";
        if (target === "texturesheet") return "0";
        if (target === "color" || target === "particlecolor" || target === "particle.particlecolor") return "Vec3(0.0, 0.0, 0.0)";
        return "0";
    }

    getParticleInitValuePresetOptionsHtml(selectedExpr = "", targetRaw = "") {
        const selected = String(selectedExpr || "").trim();
        const useVector = this.isParticleInitVectorTarget(targetRaw);
        const projectClass = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const rows = [{ value: "", label: "手动输入常量" }];

        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            const type = String(g?.type || "").trim();
            if (!name) continue;
            const isVector = type === "Vec3" || type === "RelativeLocation" || type === "Vector3f";
            const isNumeric = type === "Int" || type === "Long" || type === "Float" || type === "Double";
            if (useVector && !isVector) continue;
            if (!useVector && !isNumeric) continue;
            rows.push({
                value: `this@${projectClass}.${name}`,
                label: `${name}（全局变量 ${type}）`
            });
        }

        if (!useVector) {
            for (const c of (this.state.globalConsts || [])) {
                const name = String(c?.name || "").trim();
                if (!name) continue;
                rows.push({ value: name, label: `${name}（全局常量）` });
            }
        }

        const uniq = [];
        const used = new Set();
        for (const it of rows) {
            const key = String(it.value || "");
            if (used.has(key)) continue;
            used.add(key);
            uniq.push(it);
        }
        if (selected && !used.has(selected)) {
            uniq.unshift({ value: selected, label: `${selected}（当前值）` });
        }
        return uniq.map((it) => {
            const val = String(it.value || "");
            const active = selected ? (val === selected) : (!val);
            return `<option value="${esc(val)}" ${active ? "selected" : ""}>${esc(it.label)}</option>`;
        }).join("");
    }

    resolveParticleInitPresetExpr(exprRaw = "", targetRaw = "") {
        const expr = String(exprRaw || "").trim();
        if (!expr) return "";
        const useVector = this.isParticleInitVectorTarget(targetRaw);
        const projectClass = sanitizeKotlinClassName(this.state.projectName || "NewComposition");
        const classRef = expr.match(/^this@[A-Za-z_][A-Za-z0-9_]*\.([A-Za-z_][A-Za-z0-9_]*)$/);
        if (classRef) {
            const name = classRef[1];
            for (const g of (this.state.globalVars || [])) {
                if (String(g?.name || "").trim() !== name) continue;
                const type = String(g?.type || "").trim();
                const isVector = type === "Vec3" || type === "RelativeLocation" || type === "Vector3f";
                const isNumeric = type === "Int" || type === "Long" || type === "Float" || type === "Double";
                if (useVector ? isVector : isNumeric) {
                    return `this@${projectClass}.${name}`;
                }
                return "";
            }
            return "";
        }
        for (const g of (this.state.globalVars || [])) {
            const name = String(g?.name || "").trim();
            if (!name) continue;
            const type = String(g?.type || "").trim();
            const isVector = type === "Vec3" || type === "RelativeLocation" || type === "Vector3f";
            const isNumeric = type === "Int" || type === "Long" || type === "Float" || type === "Double";
            if (useVector ? !isVector : !isNumeric) continue;
            const expected = `this@${projectClass}.${name}`;
            if (expr === expected) return expected;
        }
        if (useVector) return "";
        for (const c of (this.state.globalConsts || [])) {
            const name = String(c?.name || "").trim();
            if (!name) continue;
            if (expr === name) return expr;
        }
        return "";
    }

    }

    for (const key of Object.getOwnPropertyNames(TargetPresetMixin.prototype)) {
        if (key === "constructor") continue;
        CompositionBuilderApp.prototype[key] = TargetPresetMixin.prototype[key];
    }
}
