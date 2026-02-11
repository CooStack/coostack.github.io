import { GRAPH_INPUT_ID, GRAPH_OUTPUT_ID } from "./store.js";
import { parseVec } from "./utils.js";
import { MC_COMPAT } from "./constants.js";

function safeName(name, fallback) {
    const n = String(name || "").replace(/[^a-zA-Z0-9_]/g, "_");
    if (!n) return fallback;
    if (/^[0-9]/.test(n)) return `_${n}`;
    return n;
}

function kotlinScalar(value, type) {
    if (type === "int") {
        const n = Number(value);
        return Number.isFinite(n) ? String(Math.round(n)) : "0";
    }
    if (type === "bool") {
        const t = String(value).trim().toLowerCase();
        return ["1", "true", "yes", "on"].includes(t) ? "true" : "false";
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return "0f";
    const text = String(n);
    return text.includes(".") ? `${text}f` : `${text}.0f`;
}

function sanitizeUniformExpr(raw, fallback = "") {
    const expr = String(raw || "")
        .replace(/\r\n/g, "\n")
        .replace(/\n+/g, " ")
        .trim();
    return expr || fallback;
}

function inferUniformExprFromValue(raw, type) {
    const value = String(raw ?? "").trim();
    if (!value) return "";

    const t = String(type || "float").toLowerCase();
    if (t === "bool" && /^(true|false)$/i.test(value)) return "";
    if (/^[+\-]?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?[fFlL]?$/.test(value)) return "";
    if (t === "vec2" && /^([+\-]?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?\s*,\s*){1}[+\-]?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?$/.test(value)) return "";
    if (t === "vec3" && /^([+\-]?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?\s*,\s*){2}[+\-]?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?$/.test(value)) return "";

    return /[A-Za-z_]/.test(value) ? sanitizeUniformExpr(value, "") : "";
}

function buildProgramSetter(param, target = "program") {
    const name = String(param?.name || "uParam");
    const type = String(param?.type || "float").toLowerCase();
    const value = param?.value ?? "";
    const useUniformExpr = String(param?.valueSource || "value").toLowerCase() === "uniform";
    const valueExpr = useUniformExpr
        ? sanitizeUniformExpr(param?.valueExpr, "")
        : inferUniformExprFromValue(value, type);

    if (type === "int") {
        const rhs = valueExpr || kotlinScalar(value, "int");
        return `${target}.setInt("${name}", ${rhs})`;
    }
    if (type === "bool") {
        const rhs = valueExpr || kotlinScalar(value, "bool");
        return `${target}.setBoolean("${name}", ${rhs})`;
    }

    if (type === "vec2") {
        if (valueExpr) {
            return `${target}.setFloat2("${name}", ${valueExpr})`;
        }
        const vec = parseVec(String(value), 2) || [0, 0];
        return `${target}.setFloat2("${name}", org.joml.Vector2f(${kotlinScalar(vec[0], "float")}, ${kotlinScalar(vec[1], "float")}))`;
    }

    if (type === "vec3") {
        if (valueExpr) {
            return `${target}.setFloat3("${name}", ${valueExpr})`;
        }
        const vec = parseVec(String(value), 3) || [1, 1, 1];
        return `${target}.setFloat3("${name}", org.joml.Vector3f(${kotlinScalar(vec[0], "float")}, ${kotlinScalar(vec[1], "float")}, ${kotlinScalar(vec[2], "float")}))`;
    }

    if (type === "texture") {
        const sampler = Number.parseInt(String(value || 0), 10);
        const safeSampler = Number.isFinite(sampler) ? sampler : 0;
        if (param?.sourceType === "connection" && param?.connection) {
            return `${target}.setInt("${name}", ${safeSampler}) // texture <- ${param.connection}`;
        }
        if (param?.sourceType === "upload" && param?.textureId) {
            return `${target}.setInt("${name}", ${safeSampler}) // texture <- uploaded:${param.textureId}`;
        }
        return `${target}.setInt("${name}", ${safeSampler})`;
    }

    if (valueExpr) {
        return `${target}.setFloat("${name}", ${valueExpr})`;
    }
    return `${target}.setFloat("${name}", ${kotlinScalar(value, "float")})`;
}

function parseSamplerSlot(raw, fallback = 0) {
    const slot = Number.parseInt(String(raw ?? fallback), 10);
    if (!Number.isFinite(slot)) return fallback;
    return Math.max(0, slot);
}

function sanitizeResourceFileName(name, fallback = "texture.png") {
    const raw = String(name || "").trim().replaceAll("\\", "/");
    const last = raw.split("/").filter(Boolean).pop() || fallback;
    const safe = last.replace(/[^a-zA-Z0-9_.-]/g, "_");
    if (!safe) return fallback;
    if (safe.includes(".")) return safe;
    return `${safe}.png`;
}

function buildUploadedTextureResourcePath(textureName) {
    const file = sanitizeResourceFileName(textureName, "texture.png");
    return `core/textures/${file}`;
}

function isTextureUploadParam(param) {
    if (!param || typeof param !== "object") return false;
    return String(param.type || "").toLowerCase() === "texture"
        && String(param.sourceType || "value").toLowerCase() === "upload";
}

function collectModelTextureBindings(state) {
    const params = Array.isArray(state?.model?.shader?.params) ? state.model.shader.params : [];
    const textures = Array.isArray(state?.textures) ? state.textures : [];
    const textureById = new Map();
    for (const tex of textures) {
        const id = String(tex?.id || "");
        if (!id) continue;
        textureById.set(id, tex);
    }

    const textureDefs = [];
    const bindings = [];
    const missing = [];
    const textureVarById = new Map();
    const textureChannelById = new Map();
    const usedVarNames = new Set();

    const allocTextureVar = (seed, fallback) => {
        const base = `modelTex_${safeName(seed, fallback)}`;
        if (!usedVarNames.has(base)) {
            usedVarNames.add(base);
            return base;
        }
        let idx = 2;
        while (usedVarNames.has(`${base}_${idx}`)) idx += 1;
        const name = `${base}_${idx}`;
        usedVarNames.add(name);
        return name;
    };

    for (let i = 0; i < params.length; i += 1) {
        const param = params[i] || {};
        if (!isTextureUploadParam(param)) continue;

        const textureId = String(param.textureId || "").trim();
        if (!textureId) continue;

        const tex = textureById.get(textureId);
        if (!tex) {
            missing.push({
                paramName: String(param.name || `uTex${i + 1}`),
                textureId
            });
            continue;
        }

        let textureVarName = textureVarById.get(textureId);
        if (!textureVarName) {
            textureVarName = allocTextureVar(tex.name || textureId, `texture_${textureDefs.length + 1}`);
            textureVarById.set(textureId, textureVarName);
            textureChannelById.set(textureId, textureDefs.length);
            textureDefs.push({
                textureId,
                textureVarName,
                textureName: String(tex.name || textureId),
                resourcePath: buildUploadedTextureResourcePath(tex.name || textureId),
                channel: textureDefs.length
            });
        }

        bindings.push({
            paramName: String(param.name || `uTex${i + 1}`),
            samplerSlot: Number(textureChannelById.get(textureId) || 0),
            textureVarName,
            textureId
        });
    }

    return { textureDefs, bindings, missing };
}

function nodeVarMap(nodes) {
    const map = new Map();
    nodes.forEach((node, i) => {
        const base = safeName(node.name || `Pipe${i + 1}`, `pipe_${i + 1}`);
        const varName = `pipe_${base}`;
        map.set(node.id, varName);
    });
    return map;
}

function resolveNodeExpression(node, variableName) {
    const fragmentPath = node.fragmentPath || "pipe/frags/screen.fsh";
    const baseIndent = "            ";

    if (node.type === "pingpong") {
        const body = [
            `${baseIndent}PingPongShaderPipe(`,
            `${baseIndent}    IdentifierShader(`,
            `${baseIndent}        ResourceLocation.fromNamespaceAndPath(CooParticlesConstants.MOD_ID, "${fragmentPath}"),`,
            `${baseIndent}        GlShaderType.FRAGMENT`,
            `${baseIndent}    ),`,
            `${baseIndent}    { minecraft.mainRenderTarget.depthTextureId },`,
            `${baseIndent}    ${Number(node.textureUnit || 1)},`,
            `${baseIndent}    ${Number(node.iterations || 1)},`,
            `${baseIndent}    ${node.filter || "GL33.GL_LINEAR"}`,
            `${baseIndent})`
        ];
        let suffix = ".addRenderHandlerPong { program ->\n";
        for (const param of node.params || []) suffix += `                ${buildProgramSetter(param)}\n`;
        suffix += "            }.addRenderHandler { program ->\n";
        for (const param of node.params || []) suffix += `                ${buildProgramSetter(param)}\n`;
        suffix += "            }";
        if (node.useMipmap) suffix += ".useMipmap()";

        return {
            header: body.join("\n"),
            suffix,
            variableName
        };
    }

    const body = [
        `${baseIndent}SimpleShaderPipe(`,
        `${baseIndent}    IdentifierShader(`,
        `${baseIndent}        ResourceLocation.fromNamespaceAndPath(CooParticlesConstants.MOD_ID, "${fragmentPath}"),`,
        `${baseIndent}        GlShaderType.FRAGMENT`,
        `${baseIndent}    ),`,
        `${baseIndent}    { minecraft.mainRenderTarget.depthTextureId },`,
        `${baseIndent}    ${Number(node.inputs || 1)},`,
        `${baseIndent}    ${node.filter || "GL33.GL_LINEAR"}`,
        `${baseIndent})`
    ];
    let suffix = ".addRenderHandler { program ->\n";
    for (const param of node.params || []) suffix += `                ${buildProgramSetter(param)}\n`;
    suffix += "            }";
    if (node.useMipmap) suffix += ".useMipmap()";

    return {
        header: body.join("\n"),
        suffix,
        variableName
    };
}

function resolveEndpointExpr(nodeId, map) {
    if (nodeId === GRAPH_INPUT_ID) return "valueInputPipe!!";
    if (nodeId === GRAPH_OUTPUT_ID) return "valueOutput!!";
    return map.get(nodeId) || "valueInputPipe!!";
}

function createTargetHeader() {
    const lines = [];
    lines.push(`// Target: Minecraft ${MC_COMPAT.mcVersion} (${MC_COMPAT.openGL}, ${MC_COMPAT.glsl})`);
    lines.push(`// Axis: ${MC_COMPAT.axis}`);
    lines.push("");
    return lines;
}

export function generateModelKotlin(state) {
    const primitive = String(state?.model?.primitive || "sphere");
    const modelVertexPath = String(state?.model?.shader?.vertexPath || "core/vertex/point.vsh");
    const modelFragmentPath = String(state?.model?.shader?.fragmentPath || "core/fragment/color.fsh");
    const modelParams = Array.isArray(state?.model?.shader?.params) ? state.model.shader.params : [];
    const modelTextureInfo = collectModelTextureBindings(state);
    const uploadedTextureParamKey = new Set(
        modelTextureInfo.bindings.map((b) => `${b.paramName}:${b.textureId}`)
    );
    const lines = createTargetHeader();
    lines.push("// ---- Model Shader ----");
    lines.push("companion object {");
    lines.push(`    private val modelPrimitive = "${primitive}"`);
    lines.push("");
    lines.push("    private fun buildFallbackRingVertexes(radiusOuter: Float, radiusInner: Float, z: Float): List<VertexData> {");
    lines.push("        val p1 = Vector3f(-radiusOuter, 0f, z)");
    lines.push("        val p2 = Vector3f(radiusOuter, 0f, z)");
    lines.push("        val p3 = Vector3f(radiusOuter, 0f, -z)");
    lines.push("        val p4 = Vector3f(-radiusOuter, 0f, -z)");
    lines.push("        val p5 = Vector3f(-radiusInner, 0f, z)");
    lines.push("        val p6 = Vector3f(radiusInner, 0f, z)");
    lines.push("        val p7 = Vector3f(radiusInner, 0f, -z)");
    lines.push("        val p8 = Vector3f(-radiusInner, 0f, -z)");
    lines.push("        val res = ArrayList<VertexData>()");
    lines.push("        res.addAll(ShaderUtil.genSquareUV(p1, p2, p6, p5))");
    lines.push("        res.addAll(ShaderUtil.genSquareUV(p2, p3, p7, p6))");
    lines.push("        res.addAll(ShaderUtil.genSquareUV(p3, p4, p8, p7))");
    lines.push("        res.addAll(ShaderUtil.genSquareUV(p4, p1, p5, p8))");
    lines.push("        return res");
    lines.push("    }");
    lines.push("");
    lines.push("    private fun buildModelVertexes(primitive: String): List<VertexData> = when (primitive) {");
    lines.push("        \"sphere\" -> ShaderUtil.genBall(5f, 64, 64)");
    lines.push("        \"box\" -> ShaderUtil.genBox()");
    lines.push("        \"plane\" -> ShaderUtil.genSquareUV(");
    lines.push("            Vector3f(-5f, 0f, 5f),");
    lines.push("            Vector3f(5f, 0f, 5f),");
    lines.push("            Vector3f(5f, 0f, -5f),");
    lines.push("            Vector3f(-5f, 0f, -5f)");
    lines.push("        )");
    lines.push("        \"torus\" -> buildFallbackRingVertexes(5.0f, 2.6f, 1.2f)");
    lines.push("        \"torusKnot\" -> buildFallbackRingVertexes(4.6f, 2.1f, 0.9f)");
    lines.push("        else -> ShaderUtil.genBall(5f, 64, 64)");
    lines.push("    }");
    lines.push("");
    lines.push("    private val modelBuffer = SimpleVertexBuffer().apply {");
    lines.push("        setVertexes(buildModelVertexes(modelPrimitive), CooVertexFormat.POINT_TEXTURE_UV_FORMAT)");
    lines.push("    }");
    lines.push("");
    lines.push("    private val modelShader = ShaderProgramBuilder()");
    lines.push(`        .vertex("${modelVertexPath}")`);
    lines.push(`        .fragment("${modelFragmentPath}")`);
    lines.push("        .build()");
    if (modelTextureInfo.textureDefs.length) {
        lines.push("");
        for (const tex of modelTextureInfo.textureDefs) {
            lines.push(`    private val ${tex.textureVarName} = IdentifierTexture(`);
            lines.push("        ResourceLocation.fromNamespaceAndPath(");
            lines.push("            CooParticlesConstants.MOD_ID,");
            lines.push(`            "${tex.resourcePath}"`);
            lines.push("        )");
            lines.push("    )");
            lines.push("");
        }
        lines.push("    private val modelTextures = SimpleTextures().apply {");
        for (const tex of modelTextureInfo.textureDefs) {
            lines.push(`        addTexture(${tex.textureVarName}) // channel ${Number(tex.channel || 0)}`);
        }
        lines.push("    }");
        lines.push("");
    }
    lines.push("");
    lines.push("    private var initialized = false");
    lines.push("");
    lines.push("    private fun initStatic() {");
    lines.push("        if (initialized) return");
    lines.push("        initialized = true");
    lines.push("        modelBuffer.init()");
    lines.push("        modelShader.init()");
    if (modelTextureInfo.textureDefs.length) {
        lines.push("        modelTextures.init()");
    }
    lines.push("    }");
    lines.push("}");
    lines.push("");
    lines.push("override fun initialize() {");
    lines.push("    initStatic()");
    lines.push("}");
    lines.push("");
    lines.push("override fun render(");
    lines.push("    matrices: Matrix4fStack, viewMatrix: Matrix4f,");
    lines.push("    projMatrix: Matrix4f, tickDelta: Float");
    lines.push(") {");
    lines.push("    RenderSystem.disableCull()");
    lines.push("    modelShader.useOnContext {");
    lines.push("        matrices.pushMatrix()");
    lines.push("        setMatrix4(\"projMat\", projMatrix)");
    lines.push("        setMatrix4(\"viewMat\", viewMatrix)");
    lines.push("        setMatrix4(\"transMat\", matrices)");
    for (const param of modelParams) {
        if (isTextureUploadParam(param) && uploadedTextureParamKey.has(`${String(param?.name || "uParam")}:${String(param?.textureId || "")}`)) {
            continue;
        }
        lines.push(`        ${buildProgramSetter(param, "this")}`);
    }
    if (modelTextureInfo.bindings.length) {
        for (const binding of modelTextureInfo.bindings) {
            lines.push(`        setInt("${binding.paramName}", ${binding.samplerSlot})`);
        }
        lines.push("        modelTextures.drawWith {");
        lines.push("            modelBuffer.draw()");
        lines.push("        }");
    } else {
        lines.push("        modelBuffer.draw()");
    }
    lines.push("        matrices.popMatrix()");
    lines.push("    }");
    lines.push("}");
    lines.push("");
    lines.push("// Notes:");
    lines.push("// 1) 将模型 shader 文本保存到资源目录后，把 vertexPath/fragmentPath 指向真实资源路径。");
    lines.push("// 2) 顶点构建优先使用 ShaderUtil；torus/torusKnot 以手动 VertexData 作为 fallback。");
    lines.push("// 3) 上传纹理会生成 IdentifierTexture + SimpleTextures 绑定代码；资源默认路径在 core/textures/ 下。");
    lines.push("// 4) 需要导入 VertexData / Vector3f（示例中由 companion object 内构建方法使用）。");
    if (modelTextureInfo.missing.length) {
        lines.push("// 5) 以下 texture 参数引用了缺失纹理（请先上传，或改为连接/数值）：");
        for (const miss of modelTextureInfo.missing) {
            lines.push(`//    - ${miss.paramName}: uploaded:${miss.textureId}`);
        }
    }

    return lines.join("\n");
}

export function generatePostKotlin(state) {
    const nodes = Array.isArray(state?.post?.nodes) ? state.post.nodes : [];
    const links = Array.isArray(state?.post?.links) ? state.post.links : [];
    const map = nodeVarMap(nodes);
    const lines = createTargetHeader();

    lines.push("// ---- Post Process Pipeline ----");
    lines.push("valueInput(");
    lines.push("    SimpleShaderPipe(");
    lines.push("        IdentifierShader(");
    lines.push("            ResourceLocation.fromNamespaceAndPath(CooParticlesConstants.MOD_ID, \"pipe/frags/screen.fsh\"),");
    lines.push("            GlShaderType.FRAGMENT");
    lines.push("        ),");
    lines.push("        { minecraft.mainRenderTarget.depthTextureId }, 1, GL33.GL_LINEAR");
    lines.push("    )");
    lines.push(")");
    lines.push("");

    for (const node of nodes) {
        const variableName = map.get(node.id) || "pipe_unknown";
        const expr = resolveNodeExpression(node, variableName);
        lines.push(`val ${variableName} = addPipe(`);
        lines.push(expr.header);
        lines.push(`            ${expr.suffix}`);
        lines.push(")");
        lines.push("");
    }

    lines.push("valueOutput(");
    lines.push("    SimpleShaderPipe(");
    lines.push("        IdentifierShader(");
    lines.push("            ResourceLocation.fromNamespaceAndPath(CooParticlesConstants.MOD_ID, \"pipe/frags/screen.fsh\"),");
    lines.push("            GlShaderType.FRAGMENT");
    lines.push("        ),");
    lines.push("        { minecraft.mainRenderTarget.depthTextureId }, 1, GL33.GL_LINEAR");
    lines.push("    )");
    lines.push(")");
    lines.push("");

    const printedLinks = links.filter((l) => l && l.fromNode && l.toNode);
    if (!printedLinks.length) {
        lines.push("// linker.from(valueInputPipe!!, 0).to(valueOutput!!, 0)");
    } else {
        for (const link of printedLinks) {
            const fromExpr = resolveEndpointExpr(link.fromNode, map);
            const toExpr = resolveEndpointExpr(link.toNode, map);
            lines.push(`linker.from(${fromExpr}, ${Number(link.fromSlot || 0)}).to(${toExpr}, ${Number(link.toSlot || 0)})`);
        }
    }

    lines.push("");
    lines.push("// Notes:");
    lines.push("// 1) 上传的后处理 shader 文本请保存到资源目录后，把 fragmentPath 指向真实资源路径。");
    lines.push("// 2) texture 参数支持 uploaded/connection；connection 会在注释里保留来源，按你的管线映射到 sampler slot。");

    return lines.join("\n");
}

export function generateKotlin(state) {
    return `${generateModelKotlin(state)}\n\n${generatePostKotlin(state)}`;
}
