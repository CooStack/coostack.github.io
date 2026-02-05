
import { COMMAND_META, newCommand, normalizeCommand, humanFieldName, cloneDefaultCommands } from "./command_meta.js";
import { initPreview } from "./preview.js";
import { genCommandKotlin, genEmitterKotlin } from "./kotlin_gen.js";
import { initSettingsSystem } from "./settings.js";
import { initHotkeysSystem } from "./hotkeys.js";
import { initLayoutSystem } from "./layout.js";
import { clamp, safeNum, escapeHtml, deepCopy, deepAssign } from "./utils.js";

(() => {
    const state = {
        commands: [],
        playing: true,
        autoPaused: false,
        ticksPerSecond: 20,
        fullscreen: false,
        emission: {
            mode: "continuous",
            burstInterval: 0.5,
        },
        emitter: {
            type: "point",
            offset: {x: 0, y: 0, z: 0},
            box: {x: 2, y: 1, z: 2, density: 0.0, surface: false},
            sphere: {r: 2},
            sphereSurface: {r: 2},
            ring: {r: 2.5, thickness: 0.15, axis: {x: 0, y: 1, z: 0}},
            line: {step: 0.2, dir: {x: 1, y: 0, z: 0}},
            circle: {r: 2.5, axis: {x: 0, y: 1, z: 0}},
            arc: {r: 2.5, start: 0, end: 180, rotate: 0, axis: {x: 0, y: 1, z: 0}},
            arcUnit: "deg",
            spiral: {startR: 0.5, endR: 2.5, height: 2.0, rotateSpeed: 0.35, rBias: 1.0, hBias: 1.0, axis: {x: 0, y: 1, z: 0}},
        },
        particle: {
            lifeMin: 40,
            lifeMax: 120,
            sizeMin: 0.08,
            sizeMax: 0.18,
            countMin: 2,
            countMax: 6,
            vel: {x: 0, y: 0.15, z: 0},
            velSpeedMin: 1.0,
            velSpeedMax: 1.2,
            visibleRange: 128,
            colorStart: "#4df3ff",
            colorEnd: "#d04dff",
        },
        kotlin: {
            varName: "command",
            kRefName: "emitter",
            templateName: "template",
            emitterDataName: "emitterData",
        }
    };

    const STORAGE_KEY = "pe_state_v2";
    const HISTORY_MAX = 80;
    const RAD_TO_DEG = 180 / Math.PI;

    const DEFAULT_BASE_STATE = deepCopy(state);

    function makeDefaultCommands() {
        return cloneDefaultCommands();
    }

    function buildPersistPayload() {
        return {
            version: 3,
            savedAt: new Date().toISOString(),
            state: {
                commands: deepCopy(state.commands),
                ticksPerSecond: state.ticksPerSecond,
                emission: deepCopy(state.emission),
                emitter: deepCopy(state.emitter),
                particle: deepCopy(state.particle),
                kotlin: deepCopy(state.kotlin),
            }
        };
    }

    let saveTimer = 0;
    function saveNow() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPersistPayload()));
        } catch (_) {
        }
    }

    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 200);
    }

    function applyLoadedState(s) {
        if (!s || typeof s !== "object") return false;

        if (typeof s.ticksPerSecond === "number") state.ticksPerSecond = s.ticksPerSecond;
        if (s.emission) deepAssign(state.emission, s.emission);
        if (s.emitter) {
            deepAssign(state.emitter, s.emitter);
            if (s.emitter.arcUnit !== "deg" && state.emitter.arc) {
                state.emitter.arc.start = safeNum(state.emitter.arc.start, 0) * RAD_TO_DEG;
                state.emitter.arc.end = safeNum(state.emitter.arc.end, 0) * RAD_TO_DEG;
                state.emitter.arc.rotate = safeNum(state.emitter.arc.rotate, 0) * RAD_TO_DEG;
            }
        }
        if (state.emitter && state.emitter.arcUnit !== "deg") {
            state.emitter.arcUnit = "deg";
        }
        if (s.particle) deepAssign(state.particle, s.particle);
        if (s.kotlin) deepAssign(state.kotlin, s.kotlin);

        if (state.particle.velSpeedMin === undefined && state.particle.velSpeed !== undefined) {
            const v = Number(state.particle.velSpeed) || 0;
            state.particle.velSpeedMin = v;
            state.particle.velSpeedMax = v;
        }

        const cmds = Array.isArray(s.commands) ? s.commands : [];
        const norm = cmds.map(normalizeCommand).filter(Boolean);
        state.commands = norm;

        if (!state.commands.length) {
            state.commands = makeDefaultCommands();
        }
        return true;
    }

    function loadPersisted() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            const obj = JSON.parse(raw);
            if (obj && typeof obj === "object") {
                if (obj.state) return applyLoadedState(obj.state);
                return applyLoadedState(obj);
            }
        } catch (_) {
        }
        return false;
    }

    function setEmitterSection() {
        const t = $("#emitterType").val();
        $(".emitSection").removeClass("active");
        if (t === "point") $("#emitPoint").addClass("active");
        if (t === "box") $("#emitBox").addClass("active");
        if (t === "sphere") $("#emitSphere").addClass("active");
        if (t === "sphere_surface") $("#emitSphereSurface").addClass("active");
        if (t === "ring") $("#emitRing").addClass("active");
        if (t === "line") $("#emitLine").addClass("active");
        if (t === "circle") $("#emitCircle").addClass("active");
        if (t === "arc") $("#emitArc").addClass("active");
        if (t === "spiral") $("#emitSpiral").addClass("active");
    }

    function setEmissionSection() {
        const mode = $("#emissionMode").val();
        $(".emission-field").removeClass("active");
        $(".emission-field[data-emission='" + mode + "']").addClass("active");
    }

    function applyStateToForm() {
        $("#emitterType").val(state.emitter.type);
        setEmitterSection();
        $("#emissionMode").val(state.emission.mode);
        setEmissionSection();
        $("#burstInterval").val(state.emission.burstInterval);
        $("#ticksPerSecond").val(state.ticksPerSecond);

        $("#emitOffX").val(state.emitter.offset.x);
        $("#emitOffY").val(state.emitter.offset.y);
        $("#emitOffZ").val(state.emitter.offset.z);

        $("#lifeMin").val(state.particle.lifeMin);
        $("#lifeMax").val(state.particle.lifeMax);
        $("#sizeMin").val(state.particle.sizeMin);
        $("#sizeMax").val(state.particle.sizeMax);
        $("#countMin").val(state.particle.countMin);
        $("#countMax").val(state.particle.countMax);
        $("#velX").val(state.particle.vel.x);
        $("#velY").val(state.particle.vel.y);
        $("#velZ").val(state.particle.vel.z);
        $("#velSpeedMin").val(state.particle.velSpeedMin);
        $("#velSpeedMax").val(state.particle.velSpeedMax);
        $("#visibleRange").val(state.particle.visibleRange);
        $("#colStart").val(state.particle.colorStart);
        $("#colEnd").val(state.particle.colorEnd);

        $("#boxX").val(state.emitter.box.x);
        $("#boxY").val(state.emitter.box.y);
        $("#boxZ").val(state.emitter.box.z);
        $("#boxDensity").val(state.emitter.box.density);
        $("#boxSurface").val(state.emitter.box.surface ? "1" : "0");

        $("#sphereR").val(state.emitter.sphere.r);
        $("#sphereSurfR").val(state.emitter.sphereSurface.r);

        $("#ringR").val(state.emitter.ring.r);
        $("#ringThickness").val(state.emitter.ring.thickness);
        $("#ringAx").val(state.emitter.ring.axis.x);
        $("#ringAy").val(state.emitter.ring.axis.y);
        $("#ringAz").val(state.emitter.ring.axis.z);

        $("#lineStep").val(state.emitter.line.step);
        $("#lineDirX").val(state.emitter.line.dir.x);
        $("#lineDirY").val(state.emitter.line.dir.y);
        $("#lineDirZ").val(state.emitter.line.dir.z);

        $("#circleR").val(state.emitter.circle.r);
        $("#circleAx").val(state.emitter.circle.axis.x);
        $("#circleAy").val(state.emitter.circle.axis.y);
        $("#circleAz").val(state.emitter.circle.axis.z);

        $("#arcR").val(state.emitter.arc.r);
        $("#arcStart").val(state.emitter.arc.start);
        $("#arcEnd").val(state.emitter.arc.end);
        $("#arcRotate").val(state.emitter.arc.rotate);
        $("#arcAx").val(state.emitter.arc.axis.x);
        $("#arcAy").val(state.emitter.arc.axis.y);
        $("#arcAz").val(state.emitter.arc.axis.z);

        $("#spiralStartR").val(state.emitter.spiral.startR);
        $("#spiralEndR").val(state.emitter.spiral.endR);
        $("#spiralH").val(state.emitter.spiral.height);
        $("#spiralSpeed").val(state.emitter.spiral.rotateSpeed);
        $("#spiralRBias").val(state.emitter.spiral.rBias);
        $("#spiralHBias").val(state.emitter.spiral.hBias);
        $("#spiralAx").val(state.emitter.spiral.axis.x);
        $("#spiralAy").val(state.emitter.spiral.axis.y);
        $("#spiralAz").val(state.emitter.spiral.axis.z);

        $("#kVarName").val(state.kotlin.varName);
        $("#kRefName").val(state.kotlin.kRefName);
        $("#kTemplateName").val(state.kotlin.templateName);
        $("#kEmitterDataName").val(state.kotlin.emitterDataName);
    }

    function readBaseForm() {
        state.emitter.type = $("#emitterType").val();
        state.emission.mode = $("#emissionMode").val() || "continuous";
        state.emission.burstInterval = Math.max(0.01, safeNum($("#burstInterval").val(), 0.5));
        state.emitter.offset.x = safeNum($("#emitOffX").val(), 0);
        state.emitter.offset.y = safeNum($("#emitOffY").val(), 0);
        state.emitter.offset.z = safeNum($("#emitOffZ").val(), 0);
        state.ticksPerSecond = Math.max(1, safeNum($("#ticksPerSecond").val(), 20));

        state.particle.lifeMin = Math.max(1, safeNum($("#lifeMin").val(), 40));
        state.particle.lifeMax = Math.max(state.particle.lifeMin, safeNum($("#lifeMax").val(), 120));
        state.particle.sizeMin = Math.max(0.001, safeNum($("#sizeMin").val(), 0.08));
        state.particle.sizeMax = Math.max(state.particle.sizeMin, safeNum($("#sizeMax").val(), 0.18));
        state.particle.countMin = Math.max(0, safeNum($("#countMin").val(), 2));
        state.particle.countMax = Math.max(state.particle.countMin, safeNum($("#countMax").val(), 6));
        state.particle.vel.x = safeNum($("#velX").val(), 0);
        state.particle.vel.y = safeNum($("#velY").val(), 0.15);
        state.particle.vel.z = safeNum($("#velZ").val(), 0);
        const vMin = Math.max(0, safeNum($("#velSpeedMin").val(), 1.0));
        const vMax = Math.max(vMin, safeNum($("#velSpeedMax").val(), 1.2));
        state.particle.velSpeedMin = vMin;
        state.particle.velSpeedMax = vMax;
        state.particle.visibleRange = Math.max(1, safeNum($("#visibleRange").val(), 128));

        state.emitter.box.x = Math.max(0.001, safeNum($("#boxX").val(), 2.0));
        state.emitter.box.y = Math.max(0.001, safeNum($("#boxY").val(), 1.0));
        state.emitter.box.z = Math.max(0.001, safeNum($("#boxZ").val(), 2.0));
        state.emitter.box.density = clamp(safeNum($("#boxDensity").val(), 0.0), 0, 1);
        state.emitter.box.surface = $("#boxSurface").val() === "1";

        state.emitter.sphere.r = Math.max(0.001, safeNum($("#sphereR").val(), 2.0));
        state.emitter.sphereSurface.r = Math.max(0.001, safeNum($("#sphereSurfR").val(), 2.0));

        state.emitter.ring.r = Math.max(0.001, safeNum($("#ringR").val(), 2.5));
        state.emitter.ring.thickness = Math.max(0, safeNum($("#ringThickness").val(), 0.15));
        state.emitter.ring.axis.x = safeNum($("#ringAx").val(), 0);
        state.emitter.ring.axis.y = safeNum($("#ringAy").val(), 1);
        state.emitter.ring.axis.z = safeNum($("#ringAz").val(), 0);

        state.emitter.line.step = Math.max(0.0001, safeNum($("#lineStep").val(), 0.2));
        state.emitter.line.dir.x = safeNum($("#lineDirX").val(), 1);
        state.emitter.line.dir.y = safeNum($("#lineDirY").val(), 0);
        state.emitter.line.dir.z = safeNum($("#lineDirZ").val(), 0);

        state.emitter.circle.r = Math.max(0.001, safeNum($("#circleR").val(), 2.5));
        state.emitter.circle.axis.x = safeNum($("#circleAx").val(), 0);
        state.emitter.circle.axis.y = safeNum($("#circleAy").val(), 1);
        state.emitter.circle.axis.z = safeNum($("#circleAz").val(), 0);

        state.emitter.arc.r = Math.max(0.001, safeNum($("#arcR").val(), 2.5));
        state.emitter.arc.start = safeNum($("#arcStart").val(), 0);
        state.emitter.arc.end = safeNum($("#arcEnd").val(), 180);
        state.emitter.arc.rotate = safeNum($("#arcRotate").val(), 0);
        state.emitter.arc.axis.x = safeNum($("#arcAx").val(), 0);
        state.emitter.arc.axis.y = safeNum($("#arcAy").val(), 1);
        state.emitter.arc.axis.z = safeNum($("#arcAz").val(), 0);

        state.emitter.spiral.startR = Math.max(0.001, safeNum($("#spiralStartR").val(), 0.5));
        state.emitter.spiral.endR = Math.max(0.001, safeNum($("#spiralEndR").val(), 2.5));
        state.emitter.spiral.height = safeNum($("#spiralH").val(), 2.0);
        state.emitter.spiral.rotateSpeed = safeNum($("#spiralSpeed").val(), 0.35);
        state.emitter.spiral.rBias = Math.max(0.01, safeNum($("#spiralRBias").val(), 1.0));
        state.emitter.spiral.hBias = Math.max(0.01, safeNum($("#spiralHBias").val(), 1.0));
        state.emitter.spiral.axis.x = safeNum($("#spiralAx").val(), 0);
        state.emitter.spiral.axis.y = safeNum($("#spiralAy").val(), 1);
        state.emitter.spiral.axis.z = safeNum($("#spiralAz").val(), 0);

        state.kotlin.varName = ($("#kVarName").val() || "command").trim() || "command";
        state.kotlin.kRefName = ($("#kRefName").val() || "emitter").trim() || "emitter";
        state.kotlin.templateName = ($("#kTemplateName").val() || "template").trim() || "template";
        state.kotlin.emitterDataName = ($("#kEmitterDataName").val() || "emitterData").trim() || "emitterData";
        state.particle.colorStart = ($("#colStart").val() || "#4df3ff").trim();
        state.particle.colorEnd = ($("#colEnd").val() || "#d04dff").trim();
    }
    const cardHistory = {
        undo: [],
        redo: [],
        init() {
            this.undo = [deepCopy(state.commands)];
            this.redo = [];
        },
        push() {
            const snap = deepCopy(state.commands);
            const last = this.undo[this.undo.length - 1];
            if (JSON.stringify(last) === JSON.stringify(snap)) return;
            this.undo.push(snap);
            if (this.undo.length > HISTORY_MAX) this.undo.shift();
            this.redo = [];
        },
        undoOnce() {
            if (this.undo.length <= 1) return false;
            const cur = this.undo.pop();
            this.redo.push(cur);
            state.commands = deepCopy(this.undo[this.undo.length - 1]);
            renderCommandList();
            autoGenKotlin();
            scheduleSave();
            toast("已撤回");
            return true;
        },
        redoOnce() {
            if (!this.redo.length) return false;
            const next = this.redo.pop();
            this.undo.push(deepCopy(next));
            state.commands = deepCopy(next);
            renderCommandList();
            autoGenKotlin();
            scheduleSave();
            toast("已重做");
            return true;
        }
    };

    let histTimer = 0;
    function scheduleHistoryPush() {
        clearTimeout(histTimer);
        histTimer = setTimeout(() => cardHistory.push(), 250);
    }

    function renderCommandList() {
        const $list = $("#cmdList");
        $list.empty();

        for (const c of state.commands) {
            const meta = COMMAND_META[c.type];
            const $card = $(`
        <div class="cmdCard" data-id="${c.id}">
          <div class="cmdHead">
            <div class="dragHandle">≡</div>
            <div class="cmdTitle">${meta.title}</div>
            <div class="cmdToggles">
              <label class="switch"><input type="checkbox" class="cmdEnabled" ${c.enabled ? "checked" : ""}/> 启用</label>
            </div>
            <div class="cmdBtns">
              <button class="iconBtn btnDup" title="复制">⎘</button>
              <button class="iconBtn btnDel" title="删除">🗑</button>
            </div>
          </div>
          <div class="cmdBody">
            <div class="cmdGrid"></div>
          </div>
        </div>
      `);

            const $grid = $card.find(".cmdGrid");
            meta.fields.forEach(f => {
                const val = c.params[f.k];

                if (f.t === "bool") {
                    const $f = $(`
            <div class="field">
              <label>${humanFieldName(f.k)}</label>
              <select class="cmdInput" data-key="${f.k}">
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </div>
          `);
                    $f.find("select").val(val ? "true" : "false");
                    $grid.append($f);
                } else if (f.t === "select") {
                    const opts = (f.opts || []).map(o => "<option value=\"" + o[0] + "\">" + o[1] + "</option>").join("");
                    const $f = $(`
            <div class="field">
              <label>${humanFieldName(f.k)}</label>
              <select class="cmdInput" data-key="${f.k}">${opts}</select>
            </div>
          `);
                    $f.find("select").val(val);
                    $grid.append($f);
                } else if (f.t === "text") {
                    const $f = $(`
            <div class="field">
              <label>${humanFieldName(f.k)}</label>
              <input class="cmdInput" data-key="${f.k}" type="text" value="${escapeHtml(String(val ?? ""))}"/>
            </div>
          `);
                    $grid.append($f);
                } else {
                    const step = (f.step != null) ? "step=\"" + f.step + "\"" : "";
                    const $f = $(`
            <div class="field">
              <label>${humanFieldName(f.k)}</label>
              <input class="cmdInput" data-key="${f.k}" type="number" ${step} value="${val}"/>
            </div>
          `);
                    $grid.append($f);
                }
            });

            const $help = $("<div class=\"small\">Kotlin 会生成：<code>.add( " + c.type + "() ... )</code></div>");
            $card.append($help);

            $list.append($card);
        }

        $(".cmdEnabled").off("change").on("change", function () {
            const id = $(this).closest(".cmdCard").data("id");
            const cmd = state.commands.find(x => x.id === id);
            cmd.enabled = $(this).is(":checked");
            scheduleHistoryPush();
            scheduleSave();
            autoGenKotlin();
        });

        $(".cmdInput").off("input change").on("input change", function () {
            const $card = $(this).closest(".cmdCard");
            const id = $card.data("id");
            const key = $(this).data("key");
            const cmd = state.commands.find(x => x.id === id);
            const meta = COMMAND_META[cmd.type];
            const field = meta.fields.find(f => f.k === key);

            let v;
            if (field.t === "bool") v = ($(this).val() === "true");
            else if (field.t === "select") v = $(this).val();
            else if (field.t === "text") v = $(this).val();
            else v = safeNum($(this).val(), field.def);

            cmd.params[key] = v;
            scheduleHistoryPush();
            scheduleSave();
            autoGenKotlin();
        });

        $(".btnDel").off("click").on("click", function () {
            const id = $(this).closest(".cmdCard").data("id");
            state.commands = state.commands.filter(x => x.id !== id);
            cardHistory.push();
            scheduleSave();
            renderCommandList();
            autoGenKotlin();
        });

        $(".btnDup").off("click").on("click", function () {
            const id = $(this).closest(".cmdCard").data("id");
            const cmd = state.commands.find(x => x.id === id);
            const copy = JSON.parse(JSON.stringify(cmd));
            copy.id = newCommand(cmd.type).id;
            state.commands.push(copy);
            cardHistory.push();
            scheduleSave();
            renderCommandList();
            autoGenKotlin();
        });

        if (!renderCommandList._sortable) {
            renderCommandList._sortable = new Sortable(document.getElementById("cmdList"), {
                handle: ".dragHandle",
                animation: 150,
                onEnd: () => {
                    const ids = $("#cmdList .cmdCard").map((_, el) => $(el).data("id")).get();
                    state.commands = ids.map(id => state.commands.find(x => x.id === id)).filter(Boolean);
                    cardHistory.push();
                    scheduleSave();
                    autoGenKotlin();
                }
            });
        }

        if (settingsSystem) settingsSystem.applyParamStepToInputs();
    }

    let kotlinRawCmd = "";
    let kotlinRawEmitter = "";
    function setKotlinOut(el, text) {
        if (!el) return;
        const highlighter = globalThis.CodeHighlighter && globalThis.CodeHighlighter.highlightKotlin;
        if (typeof highlighter === "function") {
            el.innerHTML = highlighter(text || "");
        } else {
            el.textContent = text || "";
        }
    }

    function autoGenKotlin() {
        readBaseForm();
        const settingsPayload = settingsSystem ? settingsSystem.getSettingsPayload() : {};
        kotlinRawCmd = genCommandKotlin(state);
        kotlinRawEmitter = genEmitterKotlin(state, settingsPayload || {});
        setKotlinOut(document.getElementById("kotlinOutCmd"), kotlinRawCmd);
        setKotlinOut(document.getElementById("kotlinOutEmitter"), kotlinRawEmitter);
    }

    async function copyKotlin() {
        const text = (activeKotlinTab === "emitter") ? kotlinRawEmitter : kotlinRawCmd;
        try {
            await navigator.clipboard.writeText(text);
            toast("已复制到剪贴板");
            return;
        } catch (_) {
        }
        const temp = document.createElement("textarea");
        temp.value = text;
        temp.style.position = "fixed";
        temp.style.opacity = "0";
        temp.style.pointerEvents = "none";
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        try {
            document.execCommand("copy");
            toast("已复制到剪贴板");
        } catch (e) {
            toast("复制失败（file:// 可能限制），请手动复制");
        } finally {
            temp.remove();
        }
    }
    let toastTimer = null;
    function toast(msg, type = "info") {
        let $t = $("#_toast");
        if (!$t.length) {
            $t = $("<div id=\"_toast\" style=\"\n        position:fixed; left:50%; bottom:18px; transform:translateX(-50%);\n        padding:10px 14px; border-radius:999px;\n        border:1px solid rgba(28,42,63,.95);\n        background:rgba(8,12,18,.85); color:rgba(230,238,252,.95);\n        box-shadow:0 12px 26px rgba(0,0,0,.35); z-index:99999;\n        font-size:12px; backdrop-filter: blur(8px);\n      \"></div>");
            $("body").append($t);
        }

        const colors = {
            info: {
                bg: "rgba(8,12,18,.85)",
                border: "rgba(28,42,63,.95)",
                color: "rgba(230,238,252,.95)",
            },
            success: {
                bg: "rgba(60,190,120,.75)",
                border: "rgba(60,190,120,.95)",
                color: "#f4fff8",
            },
            error: {
                bg: "rgba(255,92,92,.75)",
                border: "rgba(255,92,92,.95)",
                color: "#fff1f1",
            },
        };
        const c = colors[type] || colors.info;
        $t.text(msg).css({
            opacity: "1",
            background: c.bg,
            borderColor: c.border,
            color: c.color,
        });
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => $t.css("opacity", "0"), 1400);
    }

    function downloadText(filename, text, mime = "text/plain") {
        const blob = new Blob([text], {type: mime});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    function shouldIgnoreArrowPan() {
        const settingsModal = document.getElementById("settingsModal");
        const hkModal = document.getElementById("hkModal");
        if (settingsModal && !settingsModal.classList.contains("hidden")) return true;
        if (hkModal && !hkModal.classList.contains("hidden")) return true;
        const ae = document.activeElement;
        if (!ae) return false;
        const tag = (ae.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
        return !!ae.isContentEditable;
    }

    function confirmBox({
        title = "确认",
        message = "确定要继续吗？",
        okText = "确定",
        cancelText = "取消",
        okDanger = true,
    } = {}) {
        return new Promise((resolve) => {
            const $mask = $(
                "<div id=\"_confirmMask\" style=\"\n                    position:fixed; inset:0; z-index:100000;\n                    background:rgba(0,0,0,.55);\n                    display:flex; align-items:center; justify-content:center;\n                    backdrop-filter: blur(10px);\n                \"></div>"
            );

            const okCls = okDanger ? "danger" : "primary";
            const $card = $(
                "<div style=\"\n                    width:min(520px, calc(100vw - 24px));\n                    border-radius:16px;\n                    border:1px solid rgba(255,255,255,.12);\n                    background: linear-gradient(180deg, rgba(16,24,38,.98), rgba(16,24,38,.86));\n                    box-shadow: 0 20px 60px rgba(0,0,0,.55);\n                    padding:14px;\n                \">\n                    <div style=\"font-weight:900; margin-bottom:8px;\">" + escapeHtml(title) + "</div>\n                    <div style=\"color:var(--muted); line-height:1.6; white-space:pre-wrap;\">" + escapeHtml(message) + "</div>\n                    <div style=\"display:flex; gap:10px; justify-content:flex-end; margin-top:14px;\">\n                        <button class=\"btn\" id=\"_confirmCancel\">" + escapeHtml(cancelText) + "</button>\n                        <button class=\"btn " + okCls + "\" id=\"_confirmOk\">" + escapeHtml(okText) + "</button>\n                    </div>\n                </div>"
            );

            function close(ret) {
                $(document).off("keydown._confirm");
                $mask.remove();
                resolve(ret);
            }

            $mask.on("click", (e) => {
                if (e.target === $mask[0]) close(false);
            });
            $card.find("#_confirmCancel").on("click", () => close(false));
            $card.find("#_confirmOk").on("click", () => close(true));
            $(document).on("keydown._confirm", (e) => {
                if (e.key === "Escape") close(false);
            });

            $mask.append($card);
            $("body").append($mask);
        });
    }

    function setFullscreen(on) {
        state.fullscreen = !!on;
        const $wrap = $("#viewportWrap");
        const wrapEl = $wrap && $wrap.length ? $wrap.get(0) : null;
        if (state.fullscreen) {
            $wrap.addClass("isFull");
            $("#btnExitFull").show();
            document.body.classList.add("fullscreen-lock");
            if (wrapEl) {
                wrapEl.dataset.prevHeight = wrapEl.style.height || "";
                wrapEl.style.height = "";
            }
            if (wrapEl && wrapEl.requestFullscreen && !document.fullscreenElement) {
                wrapEl.requestFullscreen().catch(() => {});
            }
        } else {
            $wrap.removeClass("isFull");
            $("#btnExitFull").hide();
            document.body.classList.remove("fullscreen-lock");
            if (wrapEl && wrapEl.dataset.prevHeight !== undefined) {
                wrapEl.style.height = wrapEl.dataset.prevHeight;
                delete wrapEl.dataset.prevHeight;
            }
            if (document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            }
        }
        requestAnimationFrame(() => preview && preview.resizeRenderer());
    }

    async function exportStateJson() {
        try {
            readBaseForm();
            const payload = buildPersistPayload();
            const json = JSON.stringify(payload, null, 2);
            const suggestedName = "particle_emitter_" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";

            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({
                    suggestedName,
                    types: [{
                        description: "JSON",
                        accept: {"application/json": [".json"]}
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(json);
                await writable.close();
                toast("保存成功", "success");
                return;
            }

            const blob = new Blob([json], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = suggestedName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast("保存成功", "success");
        } catch (e) {
            if (e && e.name === "AbortError") {
                toast("取消保存", "error");
                return;
            }
            console.error(e);
            toast("保存失败：" + (e.message || e), "error");
        }
    }

    function importStateFromText(text) {
        let obj;
        try {
            obj = JSON.parse(text);
        } catch (e) {
            toast("导入失败-格式错误(" + (e.message || e) + ")", "error");
            return;
        }

        const s = (obj && typeof obj === "object" && obj.state) ? obj.state : obj;
        const ok = applyLoadedState(s);
        if (!ok) {
            toast("导入失败-格式错误(内容不支持)", "error");
            return;
        }

        applyStateToForm();
        renderCommandList();
        autoGenKotlin();
        cardHistory.init();
        scheduleSave();
        if (preview) preview.resetEmission();
        toast("导入成功", "success");
    }

    async function importStateJson() {
        try {
            if (window.showOpenFilePicker) {
                const [handle] = await window.showOpenFilePicker({
                    multiple: false,
                    types: [{
                        description: "JSON",
                        accept: {"application/json": [".json"]}
                    }]
                });
                const file = await handle.getFile();
                const text = await file.text();
                importStateFromText(text);
                return;
            }

            const input = document.getElementById("importJsonFile");
            if (!input) return;
            input.value = "";
            input.click();
        } catch (e) {
            if (e && e.name === "AbortError") {
                toast("取消导入", "error");
                return;
            }
            console.error(e);
            toast("导入失败-格式错误(" + (e.message || e) + ")", "error");
        }
    }

    async function resetAllToDefault() {
        const ok = await confirmBox({
            title: "恢复默认设置",
            message: "这将把默认卡片（命令列表）和默认发射器/粒子参数全部恢复为初始值，并覆盖浏览器保存的上一次编辑结果。\n\n确认继续？",
            okText: "恢复默认",
            cancelText: "取消",
            okDanger: true,
        });
        if (!ok) return;

        if (state.fullscreen) setFullscreen(false);

        state.playing = DEFAULT_BASE_STATE.playing;
        state.ticksPerSecond = DEFAULT_BASE_STATE.ticksPerSecond;
        state.fullscreen = false;
        state.emission = deepCopy(DEFAULT_BASE_STATE.emission);
        state.emitter = deepCopy(DEFAULT_BASE_STATE.emitter);
        state.particle = deepCopy(DEFAULT_BASE_STATE.particle);
        state.kotlin = deepCopy(DEFAULT_BASE_STATE.kotlin);
        state.commands = makeDefaultCommands();

        applyStateToForm();
        setEmitterSection();
        setEmissionSection();
        renderCommandList();
        autoGenKotlin();
        if (preview) preview.clearParticles(true);

        cardHistory.init();
        scheduleSave();
        toast("已恢复默认", "success");
    }

    let activeKotlinTab = "command";
    function setKotlinTab(tab) {
        const next = (tab === "emitter") ? "emitter" : "command";
        activeKotlinTab = next;
        const btns = document.querySelectorAll(".kotlin-tab");
        btns.forEach((btn) => {
            const t = btn.dataset.tab;
            btn.classList.toggle("active", t === next);
        });
        const cmd = document.getElementById("kotlinOutCmd");
        const em = document.getElementById("kotlinOutEmitter");
        if (cmd) cmd.classList.toggle("hidden", next !== "command");
        if (em) em.classList.toggle("hidden", next !== "emitter");
        try { localStorage.setItem("pe_kotlin_tab", next); } catch {}
    }

    function initKotlinTabs() {
        const btns = document.querySelectorAll(".kotlin-tab");
        btns.forEach((btn) => {
            btn.addEventListener("click", () => setKotlinTab(btn.dataset.tab));
        });
        try {
            const saved = localStorage.getItem("pe_kotlin_tab");
            if (saved === "emitter") setKotlinTab("emitter");
            else setKotlinTab("command");
        } catch {
            setKotlinTab("command");
        }
    }

    const KOTLIN_HEIGHT_KEY = "pe_kotlin_height_v2";
    function initKotlinResizer() {
        const body = document.getElementById("kotlinBody");
        const resizer = document.getElementById("kotlinResizer");
        const panel = document.querySelector(".panel.center");
        if (!body || !resizer) return;

        const saved = parseFloat(localStorage.getItem(KOTLIN_HEIGHT_KEY) || "");
        if (Number.isFinite(saved)) {
            body.style.height = `${clamp(saved, 160, 720)}px`;
            body.style.flex = "0 0 auto";
        }

        resizer.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const startY = e.clientY;
            const startH = body.getBoundingClientRect().height;
            const panelH = panel ? panel.getBoundingClientRect().height : 0;
            const maxH = panelH ? Math.max(200, panelH - 160) : 720;

            const onMove = (ev) => {
                const dy = ev.clientY - startY;
                const next = clamp(startH + dy, 160, maxH);
                body.style.height = `${next}px`;
                body.style.flex = "0 0 auto";
                if (preview) preview.resizeRenderer();
            };
            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-code");
                try {
                    const finalH = body.getBoundingClientRect().height;
                    localStorage.setItem(KOTLIN_HEIGHT_KEY, String(finalH));
                } catch (_) {
                }
            };
            document.body.classList.add("resizing-code");
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }

    const PREVIEW_HEIGHT_KEY = "pe_preview_height";
    function initPreviewResizer() {
        const wrap = document.getElementById("viewportWrap");
        const resizer = document.getElementById("previewResizer");
        const panel = document.querySelector(".panel.center");
        if (!wrap || !resizer || !panel) return;

        const saved = parseFloat(localStorage.getItem(PREVIEW_HEIGHT_KEY) || "");
        if (Number.isFinite(saved)) {
            wrap.style.height = `${clamp(saved, 240, 1200)}px`;
            if (preview) preview.resizeRenderer();
        }

        const calcMaxHeight = () => {
            const panelH = panel.getBoundingClientRect().height || 0;
            const minKotlin = 260;
            return panelH ? Math.max(240, panelH - minKotlin) : 720;
        };

        resizer.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const startY = e.clientY;
            const startH = wrap.getBoundingClientRect().height;
            const maxH = calcMaxHeight();

            const onMove = (ev) => {
                const dy = ev.clientY - startY;
                const next = clamp(startH + dy, 240, maxH);
                wrap.style.height = `${next}px`;
                if (preview) preview.resizeRenderer();
            };
            const onUp = () => {
                document.removeEventListener("pointermove", onMove);
                document.removeEventListener("pointerup", onUp);
                document.body.classList.remove("resizing-preview");
                try {
                    const finalH = wrap.getBoundingClientRect().height;
                    localStorage.setItem(PREVIEW_HEIGHT_KEY, String(finalH));
                } catch (_) {
                }
            };
            document.body.classList.add("resizing-preview");
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
        });
    }
    function bindEvents() {
        $("#emitterType").on("change", () => {
            setEmitterSection();
            readBaseForm();
            scheduleSave();
            autoGenKotlin();
            if (preview) preview.resetEmission();
        });
        $("#emissionMode").on("change", () => {
            setEmissionSection();
            readBaseForm();
            scheduleSave();
            autoGenKotlin();
            if (preview) preview.resetEmission();
        });
        $("#burstInterval").on("input change", () => {
            readBaseForm();
            scheduleSave();
            if (preview) preview.resetEmission();
        });
        $("#ticksPerSecond,#lifeMin,#lifeMax,#sizeMin,#sizeMax,#countMin,#countMax,#velX,#velY,#velZ,#velSpeedMin,#velSpeedMax,#visibleRange,#colStart,#colEnd,#emitOffX,#emitOffY,#emitOffZ")
            .on("input change", () => {
                readBaseForm();
                scheduleSave();
                if (preview) preview.resetEmission();
            });
        $("#kVarName,#kRefName,#kTemplateName,#kEmitterDataName")
            .on("input change", () => {
                readBaseForm();
                scheduleSave();
                autoGenKotlin();
            });
        $("#boxX,#boxY,#boxZ,#boxDensity,#boxSurface,#sphereR,#sphereSurfR,#ringR,#ringThickness,#ringAx,#ringAy,#ringAz,#lineStep,#lineDirX,#lineDirY,#lineDirZ,#circleR,#circleAx,#circleAy,#circleAz,#arcR,#arcStart,#arcEnd,#arcRotate,#arcAx,#arcAy,#arcAz,#spiralStartR,#spiralEndR,#spiralH,#spiralSpeed,#spiralRBias,#spiralHBias,#spiralAx,#spiralAy,#spiralAz")
            .on("input change", () => {
                readBaseForm();
                scheduleSave();
                if (preview) preview.resetEmission();
            });

        $("#btnPlay").on("click", () => {
            state.playing = true;
            state.autoPaused = false;
            toast("预览：播放");
        });
        $("#btnPause").on("click", () => {
            state.playing = false;
            state.autoPaused = false;
            toast("预览：暂停");
        });
        $("#btnClear").on("click", () => {
            if (preview) preview.clearParticles(true);
            toast("已清空");
        });

        $("#btnAddCmd").on("click", () => {
            const type = $("#addCommandType").val();
            state.commands.push(newCommand(type));
            cardHistory.push();
            scheduleSave();
            renderCommandList();
            autoGenKotlin();
        });

        $("#btnGenKotlin").on("click", () => {
            autoGenKotlin();
            toast("已生成 Kotlin");
        });
        $("#btnCopyKotlin").on("click", () => {
            autoGenKotlin();
            copyKotlin();
        });

        $("#btnUndo").on("click", () => cardHistory.undoOnce());
        $("#btnRedo").on("click", () => cardHistory.redoOnce());

        $("#btnExportJson").on("click", () => exportStateJson());
        $("#btnImportJson").on("click", () => importStateJson());
        $("#btnResetAll").on("click", () => resetAllToDefault());

        const importInput = document.getElementById("importJsonFile");
        if (importInput) {
            importInput.addEventListener("change", async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    importStateFromText(text);
                } catch (err) {
                    console.error(err);
                    toast("导入失败-格式错误(" + (err.message || err) + ")", "error");
                } finally {
                    importInput.value = "";
                }
            });
        }

        $("#btnFull").on("click", () => setFullscreen(true));
        $("#btnExitFull").on("click", () => setFullscreen(false));
        document.addEventListener("fullscreenchange", () => {
            if (!document.fullscreenElement && state.fullscreen) {
                setFullscreen(false);
            }
        });

        window.addEventListener("keydown", (e) => {
            if (hotkeysSystem && hotkeysSystem.handleHotkeyCaptureKeydown(e)) return;

            if (e.key === "Escape" && state.fullscreen) {
                setFullscreen(false);
                return;
            }
            if (e.key === "Escape") {
                if (hotkeysSystem) hotkeysSystem.hideHotkeysModal();
                if (settingsSystem) settingsSystem.hideSettingsModal();
                return;
            }

            const isEditable = hotkeysSystem ? hotkeysSystem.shouldIgnorePlainHotkeys() : false;
            if (isEditable && !e.ctrlKey && !e.metaKey && !e.altKey) return;

            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.togglePlay)) {
                e.preventDefault();
                state.playing = !state.playing;
                state.autoPaused = false;
                toast(state.playing ? "预览：播放" : "预览：暂停");
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.clearParticles)) {
                e.preventDefault();
                if (preview) preview.clearParticles(true);
                toast("已清空");
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.generateKotlin)) {
                e.preventDefault();
                autoGenKotlin();
                toast("已生成 Kotlin");
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.copyKotlin)) {
                e.preventDefault();
                autoGenKotlin();
                copyKotlin();
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.importJson)) {
                e.preventDefault();
                importStateJson();
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.exportJson)) {
                e.preventDefault();
                exportStateJson();
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.toggleFullscreen)) {
                e.preventDefault();
                setFullscreen(!state.fullscreen);
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.undo)) {
                e.preventDefault();
                cardHistory.undoOnce();
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.redo)) {
                e.preventDefault();
                cardHistory.redoOnce();
                return;
            }
            if (hotkeysSystem && hotkeysSystem.hotkeyMatchEvent(e, hotkeysSystem.hotkeys.actions.openSettings)) {
                e.preventDefault();
                if (settingsSystem) settingsSystem.showSettingsModal();
            }
        });

        const autoPause = () => {
            if (state.playing) {
                state.playing = false;
                state.autoPaused = true;
            }
        };
        const autoResume = () => {
            if (state.autoPaused) {
                state.playing = true;
                state.autoPaused = false;
                if (preview) preview.resetTime();
            }
        };
        window.addEventListener("blur", autoPause);
        window.addEventListener("focus", autoResume);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") autoPause();
            if (document.visibilityState === "visible") autoResume();
        });
    }

    let preview = null;
    let settingsSystem = null;
    let hotkeysSystem = null;
    let layoutSystem = null;

    function boot() {
        const loaded = loadPersisted();
        if (!loaded) state.commands = makeDefaultCommands();

        applyStateToForm();
        setEmitterSection();
        setEmissionSection();
        renderCommandList();
        autoGenKotlin();
        cardHistory.init();
        scheduleSave();

        preview = initPreview({
            getState: () => state,
            viewportEl: document.getElementById("viewport"),
            statEl: document.getElementById("statChip"),
            shouldIgnoreArrowPan,
        });

        settingsSystem = initSettingsSystem({
            settingsModal: document.getElementById("settingsModal"),
            settingsMask: document.getElementById("settingsMask"),
            btnSettings: document.getElementById("btnSettings"),
            btnCloseSettings: document.getElementById("btnCloseSettings"),
            themeSelect: document.getElementById("themeSelect"),
            chkAxes: document.getElementById("chkAxes"),
            chkGrid: document.getElementById("chkGrid"),
            inpPointSize: document.getElementById("inpPointSize"),
            inpParamStep: document.getElementById("inpParamStep"),
            onShowAxes: (on) => preview && preview.setShowAxes(on),
            onShowGrid: (on) => preview && preview.setShowGrid(on),
            onPointSize: (val) => preview && preview.setPointScale(val),
        });
        settingsSystem.loadSettingsFromStorage();
        settingsSystem.bindThemeHotkeys();
        settingsSystem.applyParamStepToInputs();
        autoGenKotlin();

        hotkeysSystem = initHotkeysSystem({
            hkModal: document.getElementById("hkModal"),
            hkMask: document.getElementById("hkMask"),
            hkSearch: document.getElementById("hkSearch"),
            hkList: document.getElementById("hkList"),
            hkHint: document.getElementById("hkHint"),
            btnSettings: document.getElementById("btnSettings"),
            btnOpenHotkeys: document.getElementById("btnOpenHotkeys"),
            btnCloseHotkeys: document.getElementById("btnCloseHotkeys"),
            btnCloseHotkeys2: document.getElementById("btnCloseHotkeys2"),
            btnHotkeysReset: document.getElementById("btnHotkeysReset"),
            btnHotkeysExport: document.getElementById("btnHotkeysExport"),
            btnHotkeysImport: document.getElementById("btnHotkeysImport"),
            fileHotkeys: document.getElementById("fileHotkeys"),
            settingsModal: document.getElementById("settingsModal"),
            settingsMask: document.getElementById("settingsMask"),
            showToast: toast,
            downloadText: downloadText,
            getSettingsPayload: settingsSystem.getSettingsPayload,
            applySettingsPayload: (payload) => {
                settingsSystem.applySettingsPayload(payload);
                autoGenKotlin();
            },
            btnPlay: document.getElementById("btnPlay"),
            btnPause: document.getElementById("btnPause"),
            btnClear: document.getElementById("btnClear"),
            btnGen: document.getElementById("btnGenKotlin"),
            btnCopy: document.getElementById("btnCopyKotlin"),
            btnImportJson: document.getElementById("btnImportJson"),
            btnExportJson: document.getElementById("btnExportJson"),
            btnUndo: document.getElementById("btnUndo"),
            btnRedo: document.getElementById("btnRedo"),
            btnFullscreen: document.getElementById("btnFull"),
        });
        hotkeysSystem.refreshHotkeyHints();

        layoutSystem = initLayoutSystem({
            layoutEl: document.querySelector(".main"),
            panelLeft: document.querySelector(".panel.left"),
            panelRight: document.querySelector(".panel.right"),
            resizerLeft: document.querySelector(".resizer-left"),
            resizerRight: document.querySelector(".resizer-right"),
            onResize: () => preview && preview.resizeRenderer(),
        });
        layoutSystem.applyLayoutState();
        layoutSystem.bindResizers();

        window.addEventListener("resize", () => layoutSystem.applyLayoutState(true));

        initKotlinTabs();
        initKotlinResizer();
        initPreviewResizer();
    }

    $(document).ready(() => {
        bindEvents();
        boot();
    });
})();
