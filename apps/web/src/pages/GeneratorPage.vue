<template>
  <div class="generator-page" :data-theme="project.settings.theme">
    <header class="generator-topbar">
      <div class="generator-brand">
        <RouterLink class="btn small" to="/">返回主页</RouterLink>
        <div>
          <h1>粒子发射器</h1>
          <p>生成 Kotlin：<code>class {{ project.kotlin.className }}(pos: Vec3, world: Level?) : {{ project.kotlin.baseClass }}(pos, world)</code></p>
        </div>
      </div>
      <div class="generator-actions">
        <button class="btn small" :class="{ primary: project.pageMode === 'editor' }" @click="project.pageMode = 'editor'">编辑</button>
        <button class="btn small" :class="{ primary: project.pageMode === 'code' }" @click="project.pageMode = 'code'">代码</button>
        <button class="btn small" @click="project.playing = !project.playing">{{ project.playing ? '暂停' : '预览' }}</button>
        <button class="btn small" @click="restartPreview">重播</button>
        <button class="btn small" @click="exportJson">导出 JSON</button>
        <button class="btn small" @click="fileInputRef?.click()">导入 JSON</button>
        <button class="btn small danger" @click="resetProject">重置</button>
        <input ref="fileInputRef" type="file" accept="application/json,.json" hidden @change="importJson" />
      </div>
    </header>

    <main v-if="project.pageMode === 'editor'" class="generator-workspace" :style="workspaceStyle">
      <aside class="generator-panel generator-left">
        <div class="panel-title-row">
          <strong>粒子发射器</strong>
          <button class="btn small primary" @click="addEmitter">+ 发射器</button>
        </div>

        <section class="left-block">
          <div class="block-title">预览</div>
          <label class="field">
            <span>Tick/秒</span>
            <input v-model.number="project.ticksPerSecond" class="input" type="number" min="1" max="200" step="1" />
          </label>
        </section>

        <nav class="left-tabs" aria-label="页面切换">
          <button v-for="tab in leftTabs" :key="tab.id" type="button" :class="{ active: project.leftTab === tab.id }" @click="project.leftTab = tab.id">
            {{ tab.label }}
          </button>
        </nav>

        <section v-if="project.leftTab === 'emitters'" class="left-block">
          <div class="emitter-list">
            <article
              v-for="(card, index) in project.emitters"
              :key="card.id"
              class="emitter-list-card"
              :class="{ selected: card.id === project.selectedEmitterId, disabled: !card.enabled }"
              @click="project.selectedEmitterId = card.id"
            >
              <div class="card-main">
                <button class="icon-btn" @click.stop="card.enabled = !card.enabled">{{ card.enabled ? '●' : '○' }}</button>
                <div>
                  <input v-model="card.name" class="plain-input" @click.stop />
                  <div class="sub">{{ emitterTypeLabel(card.emitter.type) }}</div>
                </div>
              </div>
              <div class="row-actions">
                <button class="icon-btn" :disabled="index === 0" @click.stop="moveEmitter(index, -1)">↑</button>
                <button class="icon-btn" :disabled="index === project.emitters.length - 1" @click.stop="moveEmitter(index, 1)">↓</button>
                <button class="icon-btn" @click.stop="cloneEmitter(card)">⧉</button>
                <button class="icon-btn" :disabled="project.emitters.length <= 1" @click.stop="removeEmitter(card.id)">×</button>
              </div>
            </article>
          </div>
        </section>

        <section v-else-if="project.leftTab === 'queues'" class="left-block">
          <div class="panel-title-row compact">
            <span class="block-title">命令队列</span>
            <button class="btn small" @click="addQueue">+ 队列</button>
          </div>
          <article
            v-for="queue in project.commandQueues"
            :key="queue.id"
            class="queue-card"
            :class="{ selected: queue.id === project.selectedQueueId }"
            @click="project.selectedQueueId = queue.id"
          >
            <input v-model="queue.name" class="plain-input" @click.stop />
            <div class="sub">标记：{{ queue.signs.length ? queue.signs.join(', ') : '全部' }}</div>
          </article>
        </section>

        <section v-else-if="project.leftTab === 'project'" class="left-block">
          <div class="block-title">项目设置</div>
          <label class="field"><span>类名</span><input v-model="project.kotlin.className" class="input" type="text" /></label>
          <label class="field"><span>包名</span><input v-model="project.kotlin.packageName" class="input" type="text" placeholder="cn.coostack.generated.emitters" /></label>
          <label class="field"><span>发射器运行模式</span><select v-model="project.rootLifecycle.mode" class="input"><option value="once">只运行一次</option><option value="interval">持续运行</option><option value="interval_n_tick">按总 Tick 运行</option></select></label>
          <div class="grid2">
            <label class="field"><span>间隔 tick</span><input v-model.number="project.rootLifecycle.intervalTick" class="input" type="number" min="1" step="1" /></label>
            <label class="field"><span>总 tick</span><input v-model.number="project.rootLifecycle.maxTick" class="input" type="number" min="1" step="1" /></label>
          </div>
        </section>

        <section v-else-if="project.leftTab === 'tick'" class="left-block">
          <div class="block-title">每 Tick 表达式</div>
          <textarea v-model="doTickText" class="input code-textarea" placeholder="在这里填写每 tick 执行的表达式"></textarea>
        </section>

        <section v-else-if="project.leftTab === 'death'" class="left-block">
          <div class="block-title">死亡行为</div>
          <label class="field"><span>启用</span><select v-model="project.deathBehavior.enabled" class="input"><option :value="true">开启</option><option :value="false">关闭</option></select></label>
          <label class="field"><span>模式</span><select v-model="project.deathBehavior.mode" class="input"><option value="dissipate">直接消散</option><option value="respawn">重生粒子</option></select></label>
        </section>

        <section v-else class="left-block">
          <div class="block-title">设置</div>
          <div class="settings-summary">
            <span>主题：{{ themeLabel(project.settings.theme) }}</span>
            <span>倍率：{{ formatScale(project.settings.particleRenderScale) }}</span>
          </div>
        </section>
      </aside>

      <div class="panel-resizer panel-resizer--left" role="separator" aria-label="调整左侧面板宽度" @pointerdown="startPanelResize('left', $event)"></div>

      <section class="generator-panel generator-preview">
        <div class="preview-title">
          <strong>预览</strong>
          <div class="preview-chips">
            <span class="chip">粒子数：{{ previewPoints.length }}</span>
            <span class="chip">帧率：{{ fpsText }}</span>
            <button class="btn small" title="R" @click="previewCanvasRef?.resetCamera()">重置镜头</button>
            <button class="btn small" title="C" @click="clearPreviewParticles">清理粒子</button>
            <button class="btn small" title="F" @click="previewCanvasRef?.toggleFullscreen()">全屏</button>
          </div>
        </div>
        <PreviewCanvas
          ref="previewCanvasRef"
          class="generator-canvas"
          :bare="true"
          :points="previewPoints"
          :show-grid="project.settings.showGrid"
          :show-axes="project.settings.showAxes"
          :point-size="project.settings.pointSize"
          :interpolation-ms="previewInterpolationMs"
          @fps="fpsText = formatFps($event)"
        />
      </section>

      <div class="panel-resizer panel-resizer--right" role="separator" aria-label="调整右侧面板宽度" @pointerdown="startPanelResize('right', $event)"></div>

      <aside class="generator-panel generator-right">
        <template v-if="project.leftTab === 'settings'">
          <div class="panel-title-row">
            <strong>设置</strong>
            <span class="chip">{{ themeLabel(project.settings.theme) }}</span>
          </div>

          <section class="editor-section">
            <div class="section-title">预览渲染</div>
            <div class="settings-grid">
              <label class="field"><span>粒子基本倍率</span><input v-model.number="project.settings.particleRenderScale" class="input" type="number" min="0.05" max="20" step="0.05" /></label>
              <label class="check-row"><input v-model="project.settings.showGrid" type="checkbox" />显示网格</label>
              <label class="check-row"><input v-model="project.settings.showAxes" type="checkbox" />显示坐标轴</label>
            </div>
          </section>

          <section class="editor-section">
            <div class="section-title">主题样式</div>
            <div class="theme-choice-grid">
              <button
                v-for="theme in generatorThemeOptions"
                :key="theme.id"
                type="button"
                class="theme-choice"
                :class="{ selected: project.settings.theme === theme.id }"
                :data-theme-option="theme.id"
                @click="project.settings.theme = theme.id"
              >
                <span class="theme-swatch"></span>
                <span>{{ theme.label }}</span>
              </button>
            </div>
          </section>

          <section class="editor-section">
            <div class="section-title">快捷键</div>
            <div class="hotkey-grid">
              <label v-for="item in hotkeyFields" :key="item.key" class="hotkey-row">
                <span>{{ item.label }}</span>
                <input
                  class="input hotkey-input"
                  type="text"
                  readonly
                  :value="formatHotkey(project.settings.hotkeys[item.key])"
                  @keydown.stop.prevent="recordHotkey(item.key, $event)"
                />
                <button class="btn small" type="button" @click="resetHotkey(item.key)">默认</button>
              </label>
            </div>
          </section>
        </template>

        <template v-else-if="project.leftTab === 'queues' && selectedQueue">
          <div class="panel-title-row">
            <strong>参数编辑</strong>
            <div class="inline-actions">
              <span class="chip">{{ selectedQueue.name }}</span>
              <button class="btn small danger" :disabled="project.commandQueues.length <= 1" @click="removeQueue(selectedQueue.id)">删除队列</button>
            </div>
          </div>
          <label class="field"><span>队列名称</span><input v-model="selectedQueue.name" class="input" type="text" /></label>
          <label class="field"><span>标记列表</span><input class="input" type="text" :value="selectedQueue.signs.join(', ')" placeholder="例如：0, 1, 2；留空表示全部" @input="updateQueueSigns($event.target.value)" /></label>
          <section class="editor-section">
            <div class="panel-title-row compact">
              <span class="section-title">命令</span>
              <button class="btn small primary" @click="addQueueCommandToSelected">+ 添加命令</button>
            </div>
            <div v-if="!selectedQueue.commands.length" class="empty-state">当前队列没有命令。</div>
            <article v-for="(command, index) in selectedQueue.commands" :key="command.id" class="command-card">
              <div class="panel-title-row compact">
                <label class="check-row"><input v-model="command.enabled" type="checkbox" />启用</label>
                <button class="icon-btn" @click="removeQueueCommand(selectedQueue, command.id)">×</button>
              </div>
              <div class="grid3">
                <label class="field"><span>名称</span><input v-model="command.label" class="input" type="text" /></label>
                <label class="field"><span>执行 Tick</span><input v-model.number="command.tick" class="input" type="number" min="0" step="1" /></label>
                <label class="field"><span>类型</span><select v-model="command.type" class="input" @change="syncCommandType(command)"><option v-for="item in commandTypeOptions" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
              </div>
              <div v-if="commandParamFields(command).length" class="command-param-grid">
                <label v-for="field in commandParamFields(command)" :key="field.key" class="mini-field">
                  <span>{{ field.label }}</span>
                  <select v-if="field.type === 'select'" v-model="command.params[field.key]" class="input">
                    <option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                  <select
                    v-else-if="field.type === 'boolean'"
                    class="input"
                    :value="String(command.params[field.key])"
                    @change="command.params[field.key] = $event.target.value === 'true'"
                  >
                    <option value="true">开启</option>
                    <option value="false">关闭</option>
                  </select>
                  <input
                    v-else
                    v-model.number="command.params[field.key]"
                    class="input"
                    type="number"
                    :step="field.step || '0.01'"
                    :min="field.min"
                    :max="field.max"
                  />
                </label>
              </div>
            </article>
          </section>
        </template>

        <template v-else-if="selectedEmitter">
          <div class="panel-title-row">
            <strong>参数编辑</strong>
            <span class="chip">{{ selectedEmitter.name }}</span>
          </div>

          <section class="editor-section">
            <div class="section-title">基础参数</div>
            <div class="grid3 base-param-grid">
              <label class="field"><span>发射器类型</span><select v-model="selectedEmitter.emitter.type" class="input"><option v-for="type in emitterTypes" :key="type.id" :value="type.id">{{ type.label }}</option></select></label>
              <label class="field"><span>Effect</span><select v-model="selectedEmitter.render.effectClass" class="input"><option v-for="item in effectOptions" :key="item.id" :value="item.className">{{ item.label }}</option></select></label>
              <label class="field"><span>RenderType</span><select v-model="selectedEmitter.render.textureSheet" class="input"><option v-for="item in textureSheetOptions" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
            </div>

            <div class="vector-row">
              <span>世界偏移</span>
              <input v-model.number="selectedEmitter.emitter.offset.x" class="input" type="number" step="0.1" />
              <input v-model.number="selectedEmitter.emitter.offset.y" class="input" type="number" step="0.1" />
              <input v-model.number="selectedEmitter.emitter.offset.z" class="input" type="number" step="0.1" />
            </div>

            <EmitterSpecificFields :card="selectedEmitter" />

            <div class="grid3">
              <label class="field"><span>开始 Tick</span><input v-model.number="selectedEmitter.emission.startTick" class="input" type="number" min="0" step="1" /></label>
              <label class="field"><span>结束 Tick</span><input v-model.number="selectedEmitter.emission.endTick" class="input" type="number" min="-1" step="1" /></label>
              <label class="field"><span>发射模式</span><select v-model="selectedEmitter.emission.mode" class="input"><option value="continuous">连续</option><option value="burst">脉冲</option><option value="once">单次</option></select></label>
            </div>
          </section>

          <section class="editor-section">
            <div class="section-title">粒子参数</div>
            <div class="grid4">
              <label class="field"><span>最少数量</span><input v-model.number="selectedEmitter.particle.countMin" class="input" type="number" min="1" step="1" /></label>
              <label class="field"><span>最多数量</span><input v-model.number="selectedEmitter.particle.countMax" class="input" type="number" min="1" step="1" /></label>
              <label class="field"><span>最短寿命 Tick</span><input v-model.number="selectedEmitter.particle.lifeMin" class="input" type="number" min="1" step="1" /></label>
              <label class="field"><span>最长寿命 Tick</span><input v-model.number="selectedEmitter.particle.lifeMax" class="input" type="number" min="1" step="1" /></label>
            </div>
            <div class="grid4">
              <label class="field"><span>最小大小</span><input v-model.number="selectedEmitter.particle.sizeMin" class="input" type="number" min="0" step="0.01" /></label>
              <label class="field"><span>最大大小</span><input v-model.number="selectedEmitter.particle.sizeMax" class="input" type="number" min="0" step="0.01" /></label>
              <label class="field"><span>颜色过渡</span><select v-model="selectedEmitter.particle.colorOverLifeEnabled" class="input"><option :value="true">开启</option><option :value="false">关闭</option></select></label>
              <label class="field"><span>可见距离</span><input v-model.number="selectedEmitter.particle.visibleRange" class="input" type="number" min="1" step="1" /></label>
            </div>
            <div class="grid2">
              <label class="field"><span>颜色 0%</span><input v-model="selectedEmitter.particle.colorStart" class="input color-input" type="color" /></label>
              <label class="field"><span>颜色 100%</span><input v-model="selectedEmitter.particle.colorEnd" class="input color-input" type="color" /></label>
            </div>
            <div class="vector-row">
              <span>速度方向</span>
              <input v-model.number="selectedEmitter.particle.velocity.x" class="input" type="number" step="0.01" />
              <input v-model.number="selectedEmitter.particle.velocity.y" class="input" type="number" step="0.01" />
              <input v-model.number="selectedEmitter.particle.velocity.z" class="input" type="number" step="0.01" />
            </div>
            <div class="vector-row">
              <span>速度随机量</span>
              <input v-model.number="selectedEmitter.particle.velocityRandom.x" class="input" type="number" min="0" step="0.01" />
              <input v-model.number="selectedEmitter.particle.velocityRandom.y" class="input" type="number" min="0" step="0.01" />
              <input v-model.number="selectedEmitter.particle.velocityRandom.z" class="input" type="number" min="0" step="0.01" />
            </div>
            <div class="grid3">
              <label class="field"><span>最小速度</span><input v-model.number="selectedEmitter.particle.speedMin" class="input" type="number" min="0" step="0.01" /></label>
              <label class="field"><span>最大速度</span><input v-model.number="selectedEmitter.particle.speedMax" class="input" type="number" min="0" step="0.01" /></label>
              <label class="field"><span>速度模式</span><select v-model="selectedEmitter.particle.velocityMode" class="input"><option value="fixed">固定方向</option><option value="spawn_relative">从发射点向外</option></select></label>
            </div>
          </section>

          <section class="editor-section">
            <div class="section-title">渲染与姿态</div>
            <div class="grid3">
              <label class="field"><span>相机模式</span><select v-model="selectedEmitter.render.billboardMode" class="input" @change="syncBillboardScaleMode(selectedEmitter)"><option v-for="mode in billboardModes" :key="mode.id" :value="mode.id">{{ mode.label }}</option></select></label>
              <label class="field"><span>不透明度 %</span><input v-model.number="selectedEmitter.render.alpha" class="input" type="number" min="0" max="100" step="1" /></label>
              <label class="field"><span>亮度</span><input v-model.number="selectedEmitter.render.light" class="input" type="number" min="-1" max="15" step="1" /></label>
            </div>
            <div class="grid3">
              <label class="field"><span>滚转角 °</span><input v-model.number="selectedEmitter.render.roll" class="input" type="number" step="1" /></label>
              <template v-if="selectedEmitter.render.billboardMode === 'axis_billboard'">
                <label class="field"><span>轴向偏航角 °</span><input class="input" type="number" step="1" :value="axisYaw(selectedEmitter)" @input="updateAxisAngle(selectedEmitter, 'yaw', $event.target.value)" /></label>
                <label class="field"><span>轴向俯仰角 °</span><input class="input" type="number" step="1" :value="axisPitch(selectedEmitter)" @input="updateAxisAngle(selectedEmitter, 'pitch', $event.target.value)" /></label>
              </template>
              <template v-else-if="selectedEmitter.render.billboardMode === 'none'">
                <label class="field"><span>偏航角 °</span><input v-model.number="selectedEmitter.render.yaw" class="input" type="number" step="1" /></label>
                <label class="field"><span>俯仰角 °</span><input v-model.number="selectedEmitter.render.pitch" class="input" type="number" step="1" /></label>
              </template>
            </div>
            <div class="grid3">
              <label class="field"><span>缩放模式</span><select v-model="selectedEmitter.render.scaleMode" class="input"><option v-for="mode in scaleModeOptions(selectedEmitter)" :key="mode.id" :value="mode.id">{{ mode.label }}</option></select></label>
              <label class="field"><span>宽度倍率</span><input v-model.number="selectedEmitter.render.baseScale.x" class="input" type="number" min="0" step="0.01" /></label>
              <label class="field"><span>高度倍率</span><input v-model.number="selectedEmitter.render.baseScale.y" class="input" type="number" min="0" step="0.01" /></label>
            </div>
            <div class="grid3">
              <label v-if="usesDepthScale(selectedEmitter)" class="field"><span>深度倍率</span><input v-model.number="selectedEmitter.render.baseScale.z" class="input" type="number" min="0" step="0.01" /></label>
              <label class="field"><span>标记值</span><input v-model.number="selectedEmitter.render.sign" class="input" type="number" step="1" /></label>
              <label class="field"><span>速度上限</span><input v-model.number="selectedEmitter.render.speedLimit" class="input" type="number" min="0" step="1" /></label>
            </div>
          </section>

          <section class="editor-section">
            <div class="section-title">生命周期曲线</div>
            <div class="curve-stack">
              <div class="curve-option-row">
                <label class="check-row"><input v-model="selectedEmitter.curves.size.syncAxes" type="checkbox" />大小同步</label>
              </div>
              <LifecycleCurveEditor v-if="selectedEmitter.curves.size.syncAxes" title="大小 / 缩放" :curve="selectedEmitter.curves.size.x" />
              <details v-else class="axis-curve-box" open>
                <summary>缩放轴向曲线</summary>
                <div class="axis-curve-content">
                  <LifecycleCurveEditor title="大小 X / 宽度" :curve="selectedEmitter.curves.size.x" />
                  <LifecycleCurveEditor title="大小 Y / 高度" :curve="selectedEmitter.curves.size.y" />
                  <LifecycleCurveEditor v-if="usesDepthScale(selectedEmitter)" title="大小 Z / 深度" :curve="selectedEmitter.curves.size.z" />
                </div>
              </details>
              <LifecycleCurveEditor title="亮度" :curve="selectedEmitter.curves.brightness" :hard-min="-1" :hard-max="15" />
              <div class="curve-option-row">
                <label class="check-row"><input v-model="selectedEmitter.curves.rotation.syncAxes" type="checkbox" />旋转同步</label>
              </div>
              <LifecycleCurveEditor v-if="selectedEmitter.curves.rotation.syncAxes || !showRotationAxisCurves(selectedEmitter)" title="滚转角" :curve="selectedEmitter.curves.rotation.roll" />
              <details v-else class="axis-curve-box" open>
                <summary>旋转轴向曲线</summary>
                <div class="axis-curve-content">
                  <LifecycleCurveEditor title="滚转角" :curve="selectedEmitter.curves.rotation.roll" />
                  <LifecycleCurveEditor title="偏航角" :curve="selectedEmitter.curves.rotation.yaw" />
                  <LifecycleCurveEditor title="俯仰角" :curve="selectedEmitter.curves.rotation.pitch" />
                </div>
              </details>
              <LifecycleCurveEditor title="不透明度" :curve="selectedEmitter.curves.opacity" :hard-min="0" :hard-max="100" value-suffix="%" />
            </div>
          </section>
        </template>

        <div v-else class="empty-state">在左侧选择发射器或命令队列。</div>
      </aside>
    </main>

    <section v-else class="generator-code-page">
      <div class="generator-panel code-panel-wide">
        <div class="panel-title-row">
          <strong>Kotlin 输出</strong>
          <button class="btn small primary" @click="copyKotlin">复制代码</button>
        </div>
        <pre class="kotlin-output">{{ kotlinOutput }}</pre>
      </div>
    </section>
  </div>
</template>

<script setup>
import { RouterLink } from 'vue-router';
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import PreviewCanvas from '../components/PreviewCanvas.vue';
import LifecycleCurveEditor from '../components/LifecycleCurveEditor.vue';
import {
  BILLBOARD_MODES,
  COMMAND_TYPE_OPTIONS,
  EFFECT_OPTIONS,
  EMITTER_TYPES,
  GENERATOR_HOTKEY_DEFAULTS,
  GENERATOR_THEME_OPTIONS,
  TEXTURE_SHEET_OPTIONS,
  createCommandQueue,
  createDefaultCommandParams,
  createEmitterCard,
  createGeneratorProject,
  createQueueCommand,
  normalizeGeneratorProject
} from '../modules/generator/defaults.js';
import { generateEmitterKotlin } from '../modules/generator/codegen.js';
import { createGeneratorPreviewRuntime } from '../modules/generator/preview-simulation.js';

const STORAGE_KEY = 'vue_emitter_generator_state_v2';
const MAX_PREVIEW_UPDATES_PER_SECOND = 60;
const fileInputRef = ref(null);
const previewCanvasRef = ref(null);
const fpsText = ref('--');
const previewTick = ref(0);
const previewPoints = shallowRef([]);
const doTickText = ref('');
const project = ref(createGeneratorProject(loadSavedProject()));
const previewRuntime = createGeneratorPreviewRuntime();
let tickTimer = 0;
let panelResize = null;
let historyTimer = 0;
let historyApplying = false;
const undoStack = [];
const redoStack = [];

const leftTabs = [
  { id: 'emitters', label: '发射器' },
  { id: 'queues', label: '命令队列' },
  { id: 'project', label: '项目设置' },
  { id: 'tick', label: '每 Tick' },
  { id: 'death', label: '死亡行为' },
  { id: 'settings', label: '设置' }
];

const emitterTypes = EMITTER_TYPES;
const billboardModes = BILLBOARD_MODES;
const effectOptions = EFFECT_OPTIONS;
const textureSheetOptions = TEXTURE_SHEET_OPTIONS;
const commandTypeOptions = COMMAND_TYPE_OPTIONS;
const generatorThemeOptions = GENERATOR_THEME_OPTIONS;
const hotkeyFields = [
  { key: 'playPause', label: '播放 / 暂停' },
  { key: 'clearParticles', label: '清理粒子' },
  { key: 'resetCamera', label: '重置镜头' },
  { key: 'fullscreen', label: '全屏预览' },
  { key: 'deleteEmitter', label: '删除发射器' },
  { key: 'undo', label: '撤销（Ctrl）' },
  { key: 'redo', label: '重做（Ctrl）' }
];

const selectedEmitter = computed(() => project.value.emitters.find((card) => card.id === project.value.selectedEmitterId) || project.value.emitters[0] || null);
const selectedQueue = computed(() => project.value.commandQueues.find((queue) => queue.id === project.value.selectedQueueId) || project.value.commandQueues[0] || null);
const kotlinOutput = computed(() => generateEmitterKotlin(project.value));
const previewInterpolationMs = computed(() => {
  const ticksPerSecond = Math.max(1, Number(project.value.ticksPerSecond || 20));
  const updateRate = Math.min(ticksPerSecond, MAX_PREVIEW_UPDATES_PER_SECOND);
  return Math.max(16, 1000 / updateRate);
});
const workspaceStyle = computed(() => ({
  '--left-panel-width': `${project.value.settings.leftPanelWidth || 340}px`,
  '--right-panel-width': `${project.value.settings.rightPanelWidth || 480}px`
}));

const EmitterSpecificFields = defineComponent({
  name: 'EmitterSpecificFields',
  props: { card: { type: Object, required: true } },
  setup(props) {
    const field = (label, path, attrs = {}) => h('label', { class: 'field' }, [
      h('span', label),
      h('input', {
        class: 'input',
        type: 'number',
        step: attrs.step || '0.1',
        min: attrs.min,
        value: getPath(props.card, path),
        onInput: (event) => setPath(props.card, path, Number(event.target.value))
      })
    ]);
    const vector = (label, base) => h('div', { class: 'vector-row' }, [
      h('span', label),
      fieldlessNumber(props.card, `${base}.x`),
      fieldlessNumber(props.card, `${base}.y`),
      fieldlessNumber(props.card, `${base}.z`)
    ]);
    return () => {
      const type = props.card.emitter.type;
      if (type === 'box') {
        return h('div', { class: 'field-pack' }, [
          h('div', { class: 'grid4' }, [
            field('盒体 X', 'emitter.box.x'),
            field('盒体 Y', 'emitter.box.y'),
            field('盒体 Z', 'emitter.box.z'),
            h('label', { class: 'field' }, [
              h('span', '仅表面'),
              h('select', {
                class: 'input',
                value: String(props.card.emitter.box.surface),
                onChange: (event) => { props.card.emitter.box.surface = event.target.value === 'true'; }
              }, [h('option', { value: 'false' }, '否'), h('option', { value: 'true' }, '是')])
            ])
          ])
        ]);
      }
      if (type === 'sphere') return h('div', { class: 'field-pack' }, [field('半径', 'emitter.sphere.r')]);
      if (type === 'sphere_surface') return h('div', { class: 'field-pack' }, [field('球面半径', 'emitter.sphereSurface.r')]);
      if (type === 'line') return h('div', { class: 'field-pack' }, [field('步长', 'emitter.line.step'), vector('方向', 'emitter.line.dir')]);
      if (type === 'circle') return h('div', { class: 'field-pack' }, [field('半径', 'emitter.circle.r'), vector('法线轴', 'emitter.circle.axis')]);
      if (type === 'ring') return h('div', { class: 'field-pack' }, [h('div', { class: 'grid2' }, [field('半径', 'emitter.ring.r'), field('厚度', 'emitter.ring.thickness')]), vector('法线轴', 'emitter.ring.axis')]);
      if (type === 'arc') return h('div', { class: 'field-pack' }, [h('div', { class: 'grid4' }, [field('半径', 'emitter.arc.r'), field('起始角', 'emitter.arc.start'), field('结束角', 'emitter.arc.end'), field('整体旋转', 'emitter.arc.rotate')]), vector('法线轴', 'emitter.arc.axis')]);
      if (type === 'spiral') return h('div', { class: 'field-pack' }, [h('div', { class: 'grid4' }, [field('起始半径', 'emitter.spiral.startR'), field('结束半径', 'emitter.spiral.endR'), field('高度', 'emitter.spiral.height'), field('旋转速度', 'emitter.spiral.rotateSpeed')]), h('div', { class: 'grid2' }, [field('半径偏置', 'emitter.spiral.rBias'), field('高度偏置', 'emitter.spiral.hBias')]), vector('轴', 'emitter.spiral.axis')]);
      return h('div', { class: 'field-pack empty-state' }, '点发射器只使用世界偏移。');
    };
  }
});

function fieldlessNumber(target, path) {
  return h('input', {
    class: 'input',
    type: 'number',
    step: '0.1',
    value: getPath(target, path),
    onInput: (event) => setPath(target, path, Number(event.target.value))
  });
}

function getPath(target, path) {
  return String(path).split('.').reduce((obj, key) => obj?.[key], target);
}

function setPath(target, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  const parent = parts.reduce((obj, key) => obj?.[key], target);
  if (parent && last) parent[last] = value;
}

function loadSavedProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

watch(project, (next) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  syncPreviewPoints();
  scheduleHistorySnapshot();
}, { deep: true });

onMounted(() => {
  previewRuntime.step(project.value, 1);
  syncPreviewPoints();
  pushHistorySnapshot();
  startTickTimer();
  window.addEventListener('keydown', handleGeneratorHotkey, true);
});

watch(() => project.value.ticksPerSecond, () => {
  startTickTimer();
});

function startTickTimer() {
  window.clearInterval(tickTimer);
  const ticksPerSecond = Math.max(1, Number(project.value.ticksPerSecond || 20));
  const updateRate = Math.min(ticksPerSecond, MAX_PREVIEW_UPDATES_PER_SECOND);
  const tickStep = Math.max(1, Math.round(ticksPerSecond / updateRate));
  tickTimer = window.setInterval(() => {
    if (!project.value.playing) return;
    previewRuntime.step(project.value, tickStep);
    previewTick.value += tickStep;
    syncPreviewPoints();
  }, Math.max(16, 1000 / updateRate));
}

onBeforeUnmount(() => {
  window.clearInterval(tickTimer);
  window.clearTimeout(historyTimer);
  window.removeEventListener('keydown', handleGeneratorHotkey, true);
  window.removeEventListener('pointermove', handlePanelResize);
  window.removeEventListener('pointerup', stopPanelResize);
});

function restartPreview() {
  previewRuntime.reset();
  previewTick.value = 0;
  project.value.playing = true;
  previewRuntime.step(project.value, 1);
  syncPreviewPoints();
}

function clearPreviewParticles() {
  previewRuntime.clearParticles();
  syncPreviewPoints();
}

function syncPreviewPoints() {
  previewPoints.value = applyPreviewRenderScale(
    previewRuntime.snapshotRenderData(project.value),
    project.value.settings.particleRenderScale
  );
}

function applyPreviewRenderScale(data, scale) {
  const factor = clampNumber(scale, 0.05, 20, 1);
  if (Math.abs(factor - 1) < 0.0001) return data;
  if (data?.kind === 'preview-buffers') {
    const sizes = new Float32Array(data.sizes);
    const count = Math.max(0, Math.trunc(Number(data.count || 0)));
    for (let index = 0; index < count; index += 1) sizes[index] *= factor;
    return { ...data, sizes };
  }
  if (!Array.isArray(data)) return data;
  const scaled = data.map((point) => ({
    ...point,
    scaleX: multiplyPositive(point.scaleX, factor),
    scaleY: multiplyPositive(point.scaleY, factor),
    scaleZ: multiplyPositive(point.scaleZ, factor),
    size: multiplyPositive(point.size, factor)
  }));
  if (Object.prototype.hasOwnProperty.call(data, 'effectSignature')) {
    Object.defineProperty(scaled, 'effectSignature', {
      value: data.effectSignature,
      configurable: true,
      writable: true,
      enumerable: false
    });
  }
  return scaled;
}

function multiplyPositive(value, factor) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric * factor : value;
}

function addEmitter() {
  const card = createEmitterCard({ name: `发射器 #${project.value.emitters.length + 1}` });
  project.value.emitters.push(card);
  project.value.selectedEmitterId = card.id;
  project.value.leftTab = 'emitters';
}

function cloneEmitter(card) {
  const clone = createEmitterCard(JSON.parse(JSON.stringify({
    ...card,
    id: undefined,
    name: `${card.name} 副本`
  })));
  project.value.emitters.push(clone);
  project.value.selectedEmitterId = clone.id;
}

function removeEmitter(id) {
  if (project.value.emitters.length <= 1) return;
  const index = project.value.emitters.findIndex((card) => card.id === id);
  if (index < 0) return;
  project.value.emitters.splice(index, 1);
  project.value.selectedEmitterId = project.value.emitters[Math.max(0, index - 1)]?.id || project.value.emitters[0]?.id || '';
}

function moveEmitter(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= project.value.emitters.length) return;
  const [item] = project.value.emitters.splice(index, 1);
  project.value.emitters.splice(next, 0, item);
}

function addQueue() {
  const queue = createCommandQueue({ name: `命令队列 ${project.value.commandQueues.length + 1}` });
  project.value.commandQueues.push(queue);
  project.value.selectedQueueId = queue.id;
}

function removeQueue(id) {
  if (project.value.commandQueues.length <= 1) return;
  const index = project.value.commandQueues.findIndex((queue) => queue.id === id);
  if (index < 0) return;
  project.value.commandQueues.splice(index, 1);
  project.value.selectedQueueId = project.value.commandQueues[Math.max(0, index - 1)]?.id || project.value.commandQueues[0]?.id || '';
}

function addQueueCommandToSelected() {
  if (!selectedQueue.value) return;
  selectedQueue.value.commands.push(createQueueCommand({ label: `命令 ${selectedQueue.value.commands.length + 1}` }));
}

function removeQueueCommand(queue, commandId) {
  const index = queue.commands.findIndex((command) => command.id === commandId);
  if (index >= 0) queue.commands.splice(index, 1);
}

function updateQueueSigns(text) {
  if (!selectedQueue.value) return;
  selectedQueue.value.signs = String(text || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.trunc(item));
}

function syncBillboardScaleMode(card) {
  if (!card?.render) return;
  if (card.render.billboardMode !== 'none') {
    card.curves.rotation.syncAxes = false;
    card.render.baseScale.z = card.render.baseScale.y || card.render.baseScale.x || 1;
  }
}

function scaleModeOptions(card) {
  return usesDepthScale(card)
    ? [
      { id: 'uniform_xy', label: 'XY 等比' },
      { id: 'xyz', label: 'XYZ 独立' }
    ]
    : [
      { id: 'uniform_xy', label: 'XY 等比' },
      { id: 'xyz', label: '宽高独立' }
    ];
}

function usesDepthScale(card) {
  return card?.render?.billboardMode === 'none';
}

function showRotationAxisCurves(card) {
  return card?.render?.billboardMode === 'none' && card.curves.rotation.syncAxes === false;
}

function axisYaw(card) {
  const axis = normalizeVector(card?.render?.axis || { x: 0, y: 1, z: 0 });
  return formatAngle(Math.atan2(axis.x, axis.z) * 180 / Math.PI);
}

function axisPitch(card) {
  const axis = normalizeVector(card?.render?.axis || { x: 0, y: 1, z: 0 });
  return formatAngle(Math.asin(clampNumber(axis.y, -1, 1, 1)) * 180 / Math.PI);
}

function updateAxisAngle(card, key, value) {
  if (!card?.render) return;
  const yaw = key === 'yaw' ? Number(value) : Number(axisYaw(card));
  const pitch = key === 'pitch' ? Number(value) : Number(axisPitch(card));
  const yawRad = (Number.isFinite(yaw) ? yaw : 0) * Math.PI / 180;
  const pitchRad = (Number.isFinite(pitch) ? pitch : 90) * Math.PI / 180;
  const horizontal = Math.cos(pitchRad);
  card.render.axis = {
    x: Number((Math.sin(yawRad) * horizontal).toFixed(6)),
    y: Number(Math.sin(pitchRad).toFixed(6)),
    z: Number((Math.cos(yawRad) * horizontal).toFixed(6))
  };
}

function formatAngle(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(3)).toString() : '0';
}

function emitterTypeLabel(type) {
  return emitterTypes.find((item) => item.id === type)?.label || type;
}

function themeLabel(theme) {
  return generatorThemeOptions.find((item) => item.id === theme)?.label || '夜岚';
}

function formatScale(scale) {
  const numeric = clampNumber(scale, 0.05, 20, 1);
  return `${Number(numeric.toFixed(2))}x`;
}

function formatFps(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.max(0, Math.round(numeric))) : '--';
}

function recordHotkey(key, event) {
  const code = event.code || event.key;
  if (!code || code === 'Tab') return;
  project.value.settings.hotkeys[key] = code;
}

function resetHotkey(key) {
  project.value.settings.hotkeys[key] = GENERATOR_HOTKEY_DEFAULTS[key];
}

function formatHotkey(code) {
  const labels = {
    Space: 'Space',
    Delete: 'Delete',
    Backspace: 'Backspace',
    Escape: 'Esc',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→'
  };
  const text = String(code || '');
  if (labels[text]) return labels[text];
  if (/^Key[A-Z]$/.test(text)) return text.slice(3);
  if (/^Digit[0-9]$/.test(text)) return text.slice(5);
  return text || '未设置';
}

function commandParamFields(command) {
  return commandTypeOptions.find((item) => item.id === command.type)?.params || [];
}

function syncCommandType(command) {
  const option = commandTypeOptions.find((item) => item.id === command.type);
  command.params = createDefaultCommandParams(command.type);
  if (option) command.label = option.label;
}

function startPanelResize(side, event) {
  if (event.button !== 0) return;
  panelResize = {
    side,
    startX: event.clientX,
    startWidth: side === 'left' ? project.value.settings.leftPanelWidth : project.value.settings.rightPanelWidth
  };
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', handlePanelResize);
  window.addEventListener('pointerup', stopPanelResize, { once: true });
}

function handlePanelResize(event) {
  if (!panelResize) return;
  const delta = event.clientX - panelResize.startX;
  if (panelResize.side === 'left') {
    project.value.settings.leftPanelWidth = clampNumber(panelResize.startWidth + delta, 280, 560, 340);
  } else {
    project.value.settings.rightPanelWidth = clampNumber(panelResize.startWidth - delta, 340, 760, 480);
  }
}

function stopPanelResize() {
  panelResize = null;
  window.removeEventListener('pointermove', handlePanelResize);
}

function exportJson() {
  const blob = new Blob([JSON.stringify(project.value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${project.value.name || 'EmitterGenerator'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importJson(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const text = await file.text();
  project.value = normalizeGeneratorProject(JSON.parse(text));
  previewRuntime.reset();
  previewTick.value = 0;
  previewRuntime.step(project.value, 1);
  syncPreviewPoints();
  pushHistorySnapshot();
}

function resetProject() {
  project.value = createGeneratorProject();
  previewRuntime.reset();
  previewTick.value = 0;
  previewRuntime.step(project.value, 1);
  syncPreviewPoints();
  pushHistorySnapshot();
}

async function copyKotlin() {
  await navigator.clipboard?.writeText(kotlinOutput.value);
}

function serializeProject() {
  return JSON.stringify(project.value);
}

function pushHistorySnapshot() {
  if (historyApplying) return;
  const snapshot = serializeProject();
  if (undoStack[undoStack.length - 1] === snapshot) return;
  undoStack.push(snapshot);
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
}

function scheduleHistorySnapshot() {
  if (historyApplying) return;
  window.clearTimeout(historyTimer);
  historyTimer = window.setTimeout(pushHistorySnapshot, 250);
}

function restoreProjectSnapshot(snapshot) {
  historyApplying = true;
  project.value = normalizeGeneratorProject(JSON.parse(snapshot));
  previewRuntime.reset();
  previewTick.value = 0;
  previewRuntime.step(project.value, 1);
  syncPreviewPoints();
  window.setTimeout(() => {
    historyApplying = false;
  }, 0);
}

function undoProject() {
  pushHistorySnapshot();
  if (undoStack.length <= 1) return;
  const current = undoStack.pop();
  redoStack.push(current);
  restoreProjectSnapshot(undoStack[undoStack.length - 1]);
}

function redoProject() {
  if (!redoStack.length) return;
  const snapshot = redoStack.pop();
  undoStack.push(snapshot);
  restoreProjectSnapshot(snapshot);
}

function removeSelectedEmitter() {
  if (!selectedEmitter.value || project.value.emitters.length <= 1) return;
  removeEmitter(selectedEmitter.value.id);
}

function handleGeneratorHotkey(event) {
  if (isEditableHotkeyTarget(event.target)) return;
  const isMod = event.ctrlKey || event.metaKey;
  if (isMod && matchesHotkey(event, 'undo')) {
    event.preventDefault();
    if (event.shiftKey) redoProject();
    else undoProject();
    return;
  }
  if (isMod && matchesHotkey(event, 'redo')) {
    event.preventDefault();
    redoProject();
    return;
  }
  if (isMod || event.altKey || event.shiftKey) return;
  if (matchesHotkey(event, 'playPause')) {
    event.preventDefault();
    project.value.playing = !project.value.playing;
    return;
  }
  if (matchesHotkey(event, 'clearParticles')) {
    event.preventDefault();
    clearPreviewParticles();
    return;
  }
  if (matchesHotkey(event, 'deleteEmitter')) {
    event.preventDefault();
    removeSelectedEmitter();
    return;
  }
  if (matchesHotkey(event, 'resetCamera')) {
    event.preventDefault();
    previewCanvasRef.value?.resetCamera();
    return;
  }
  if (matchesHotkey(event, 'fullscreen')) {
    event.preventDefault();
    previewCanvasRef.value?.toggleFullscreen();
  }
}

function matchesHotkey(event, key) {
  const code = project.value.settings.hotkeys?.[key] || GENERATOR_HOTKEY_DEFAULTS[key];
  return event.code === code;
}

function isEditableHotkeyTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function resolvePreviewCycle(rawProject) {
  const normalized = normalizeGeneratorProject(rawProject);
  const maxParticleLife = Math.max(1, ...normalized.emitters.map((card) => Number(card.particle.lifeMax || 1)));
  const configured = Number(normalized.previewTicks || 0);
  const rootMax = normalized.rootLifecycle.mode === 'interval_n_tick' ? Number(normalized.rootLifecycle.maxTick || 0) : 0;
  return Math.max(60, configured, rootMax, maxParticleLife + 40);
}

function buildPreviewPoints(rawProject, tick) {
  const normalized = rawProject;
  const points = [];
  const emitters = Array.isArray(normalized.emitters) ? normalized.emitters : [];
  const maxLife = Math.max(1, ...emitters.map((card) => Number(card.particle?.lifeMax || 1)));
  const fromTick = Math.max(0, tick - maxLife);
  const maxPreviewPoints = 2600;
  emitters.forEach((card, cardIndex) => {
    if (!card.enabled) return;
    for (let spawnTick = fromTick; spawnTick <= tick; spawnTick += 1) {
      if (points.length >= maxPreviewPoints) return;
      if (!isEmitterActive(card, spawnTick)) continue;
      const countRand = seededRandom(cardIndex * 173 + spawnTick * 101);
      const countMin = Math.max(1, Number(card.particle.countMin || 1));
      const countMax = Math.max(countMin, Number(card.particle.countMax || countMin));
      const count = Math.min(128, Math.max(1, Math.round(countMin + (countMax - countMin) * countRand())));
      for (let i = 0; i < count; i += 1) {
        if (points.length >= maxPreviewPoints) return;
        const rand = seededRandom(cardIndex * 100000 + i * 9176 + spawnTick * 37);
        const life = sampleParticleLife(card, rand);
        const age = tick - spawnTick;
        if (age < 0 || age >= life) continue;
        const agePercent = clampNumber((age / Math.max(1, life)) * 100, 0, 100, 0);
        points.push(buildPreviewParticle(card, cardIndex, i, age, agePercent, life, rand));
      }
    }
  });
  return points;
}

function buildPreviewParticle(card, cardIndex, particleIndex, age, agePercent, life, rand) {
  const lifeAlpha = clamp01(agePercent / 100);
  const sizeX = Math.max(0, samplePreviewCurve(card.curves.size.x, agePercent));
  const sizeY = card.render.scaleMode === 'xyz' && !card.curves.size.syncAxes
    ? Math.max(0, samplePreviewCurve(card.curves.size.y, agePercent))
    : sizeX;
  const sizeZ = card.render.scaleMode === 'xyz' && !card.curves.size.syncAxes
    ? Math.max(0, samplePreviewCurve(card.curves.size.z, agePercent))
    : sizeX;
  const baseScale = card.render.scaleMode === 'xyz'
    ? {
      x: Math.max(0, Number(card.render.baseScale.x || 0)),
      y: Math.max(0, Number(card.render.baseScale.y || card.render.baseScale.x || 0)),
      z: Math.max(0, Number(card.render.baseScale.z || card.render.baseScale.x || 0))
    }
    : {
      x: Math.max(0, Number(card.render.baseScale.x || 0)),
      y: Math.max(0, Number(card.render.baseScale.x || 0)),
      z: Math.max(0, Number(card.render.baseScale.x || 0))
    };
  const alpha = clamp01((Number(card.render.alpha ?? 100) / 100) * (samplePreviewCurve(card.curves.opacity, agePercent) / 100));
  const light = clampNumber(samplePreviewCurve(card.curves.brightness, agePercent), -1, 15, Number(card.render.light ?? 15));
  const color = interpolateHex(card.particle.colorStart, card.particle.colorOverLifeEnabled ? card.particle.colorEnd : card.particle.colorStart, lifeAlpha, light);
  const rotation = samplePreviewRotation(card, agePercent);
  const base = sampleEmitterPoint(card, rand);
  const velocity = sampleVelocity(card, rand);
  const scale = {
    x: baseScale.x * sizeX,
    y: baseScale.y * sizeY,
    z: baseScale.z * sizeZ
  };
  return {
    x: base.x + velocity.x * age * 0.18,
    y: base.y + velocity.y * age * 0.18,
    z: base.z + velocity.z * age * 0.18,
    color,
    alpha,
    light,
    effectClass: card.render.effectClass,
    textureSheet: card.render.textureSheet,
    billboardMode: card.render.billboardMode,
    axis: { ...card.render.axis },
    roll: rotation.roll,
    yaw: rotation.yaw,
    pitch: rotation.pitch,
    scaleX: scale.x,
    scaleY: scale.y,
    scaleZ: scale.z,
    size: Math.max(0.01, (scale.x + scale.y + scale.z) / 3),
    age,
    life,
    seed: cardIndex * 100000 + particleIndex
  };
}

function sampleParticleLife(card, rand) {
  const min = Math.max(1, Number(card.particle.lifeMin || 1));
  const max = Math.max(min, Number(card.particle.lifeMax || min));
  return Math.max(1, Math.round(min + (max - min) * rand()));
}

function isEmitterActive(card, tick) {
  const start = Number(card.emission.startTick || 0);
  const end = Number(card.emission.endTick ?? -1);
  if (tick < start) return false;
  if (end >= 0 && tick > end) return false;
  if (card.emission.mode === 'once') return tick === start;
  if (card.emission.mode === 'burst') return ((tick - start) % Math.max(1, Number(card.emission.burstInterval || 1))) === 0;
  return true;
}

function samplePreviewRotation(card, agePercent) {
  const rollCurve = samplePreviewCurve(card.curves.rotation.roll, agePercent);
  const yawCurve = card.curves.rotation.syncAxes
    ? rollCurve
    : samplePreviewCurve(card.curves.rotation.yaw, agePercent);
  const pitchCurve = card.curves.rotation.syncAxes
    ? rollCurve
    : samplePreviewCurve(card.curves.rotation.pitch, agePercent);
  return {
    roll: Number(card.render.roll || 0) + rollCurve,
    yaw: card.render.billboardMode === 'none' ? Number(card.render.yaw || 0) + yawCurve : 0,
    pitch: card.render.billboardMode === 'none' ? Number(card.render.pitch || 0) + pitchCurve : 0
  };
}

function samplePreviewCurve(curve, percent) {
  const frames = Array.isArray(curve?.keyframes) ? curve.keyframes : [];
  if (!frames.length) return Number(curve?.defaultValue || 0);
  if (frames.length === 1) return Number(frames[0].value || 0);
  const t = clampNumber(percent, 0, 100, 0);
  if (t <= Number(frames[0].time || 0)) return Number(frames[0].value || 0);
  const last = frames[frames.length - 1];
  if (t >= Number(last.time || 0)) return Number(last.value || 0);
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const next = frames[i];
    if (t <= Number(next.time || 0)) {
      if (curve?.mode === 'bezier') return samplePreviewBezier(prev, next, t);
      const start = Number(prev.time || 0);
      const span = Math.max(0.0001, Number(next.time || 0) - start);
      const alpha = (t - start) / span;
      return Number(prev.value || 0) + (Number(next.value || 0) - Number(prev.value || 0)) * alpha;
    }
  }
  return Number(last.value || 0);
}

function samplePreviewBezier(a, b, percent) {
  const x0 = Number(a.time || 0);
  const y0 = Number(a.value || 0);
  const x3 = Number(b.time || 0);
  const y3 = Number(b.value || 0);
  const x1 = clampNumber(x0 + Number(a.out?.x || 0), 0, 100, x0);
  const y1 = y0 + Number(a.out?.y || 0);
  const x2 = clampNumber(x3 + Number(b.in?.x || 0), 0, 100, x3);
  const y2 = y3 + Number(b.in?.y || 0);
  let bestDistance = Infinity;
  let bestValue = y0;
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const x = cubic1d(x0, x1, x2, x3, t);
    const distance = Math.abs(x - percent);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestValue = cubic1d(y0, y1, y2, y3, t);
    }
  }
  return bestValue;
}

function cubic1d(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function clamp01(value, fallback = 1) {
  return clampNumber(value, 0, 1, fallback);
}

function clampNumber(value, min, max, fallback = 0) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(min, Math.min(max, safe));
}

function interpolateHex(startHex, endHex, alpha, light = 15) {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  const factor = light < 0 ? 0.62 : 0.5 + clampNumber(light, 0, 15, 15) / 30;
  const r = clampNumber(start.r + (end.r - start.r) * alpha, 0, 255) * factor;
  const g = clampNumber(start.g + (end.g - start.g) * alpha, 0, 255) * factor;
  const b = clampNumber(start.b + (end.b - start.b) * alpha, 0, 255) * factor;
  return rgbToHex(r, g, b);
}

function hexToRgb(hex) {
  const text = /^#[0-9a-fA-F]{6}$/.test(String(hex || '')) ? String(hex).slice(1) : 'ffffff';
  const value = Number.parseInt(text, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function rgbToHex(r, g, b) {
  const toHex = (value) => Math.round(clampNumber(value, 0, 255)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function seededRandom(seed) {
  let value = (Math.imul(Math.trunc(seed) || 1, 1664525) + 1013904223) >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function sampleEmitterPoint(card, rand) {
  const type = card.emitter.type;
  const offset = card.emitter.offset;
  if (type === 'point') return { ...offset };
  if (type === 'box') {
    const box = card.emitter.box;
    return {
      x: offset.x + (rand() - 0.5) * box.x,
      y: offset.y + (rand() - 0.5) * box.y,
      z: offset.z + (rand() - 0.5) * box.z
    };
  }
  if (type === 'sphere' || type === 'sphere_surface') {
    const radius = type === 'sphere' ? card.emitter.sphere.r : card.emitter.sphereSurface.r;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const r = type === 'sphere' ? radius * Math.cbrt(rand()) : radius;
    return {
      x: offset.x + Math.sin(phi) * Math.cos(theta) * r,
      y: offset.y + Math.cos(phi) * r,
      z: offset.z + Math.sin(phi) * Math.sin(theta) * r
    };
  }
  if (type === 'line') {
    const dir = normalizeVector(card.emitter.line.dir);
    const t = (rand() - 0.5) * card.particle.countMax * card.emitter.line.step;
    return { x: offset.x + dir.x * t, y: offset.y + dir.y * t, z: offset.z + dir.z * t };
  }
  if (type === 'circle' || type === 'ring') {
    const radius = type === 'circle' ? card.emitter.circle.r : card.emitter.ring.r + (rand() - 0.5) * card.emitter.ring.thickness;
    const angle = rand() * Math.PI * 2;
    return { x: offset.x + Math.cos(angle) * radius, y: offset.y, z: offset.z + Math.sin(angle) * radius };
  }
  if (type === 'arc') {
    const arc = card.emitter.arc;
    const start = Math.min(arc.start, arc.end) * Math.PI / 180;
    const end = Math.max(arc.start, arc.end) * Math.PI / 180;
    const angle = start + (end - start) * rand() + arc.rotate * Math.PI / 180;
    return { x: offset.x + Math.cos(angle) * arc.r, y: offset.y, z: offset.z + Math.sin(angle) * arc.r };
  }
  if (type === 'spiral') {
    const spiral = card.emitter.spiral;
    const t = rand();
    const radius = spiral.startR + (spiral.endR - spiral.startR) * Math.pow(t, spiral.rBias);
    const angle = t * spiral.rotateSpeed * Math.PI * 8;
    return { x: offset.x + Math.cos(angle) * radius, y: offset.y + Math.pow(t, spiral.hBias) * spiral.height, z: offset.z + Math.sin(angle) * radius };
  }
  return { ...offset };
}

function sampleVelocity(card, rand) {
  const v = card.particle.velocity;
  const r = card.particle.velocityRandom;
  const speed = card.particle.speedMin + (card.particle.speedMax - card.particle.speedMin) * rand();
  return {
    x: (v.x + (rand() * 2 - 1) * r.x) * speed,
    y: (v.y + (rand() * 2 - 1) * r.y) * speed,
    z: (v.z + (rand() * 2 - 1) * r.z) * speed
  };
}

function normalizeVector(vector) {
  const length = Math.hypot(Number(vector.x || 0), Number(vector.y || 0), Number(vector.z || 0)) || 1;
  return { x: Number(vector.x || 0) / length, y: Number(vector.y || 0) / length, z: Number(vector.z || 0) / length };
}
</script>

<style scoped>
.generator-page {
  --generator-page-bg: rgba(2, 8, 23, 0.22);
  --generator-text: #e2e8f0;
  --input-bg: rgba(15, 23, 42, 0.7);
  min-height: calc(100vh - 48px);
  display: grid;
  gap: 14px;
  color: var(--generator-text);
  background: var(--generator-page-bg);
}

.generator-page[data-theme='dark-2'] {
  --bg-panel: rgba(10, 31, 29, 0.86);
  --bg-panel-strong: rgba(7, 24, 23, 0.96);
  --bg-soft: rgba(45, 212, 191, 0.08);
  --border: rgba(94, 234, 212, 0.2);
  --text-soft: #99f6e4;
  --brand: #2dd4bf;
  --brand-2: #38bdf8;
  --input-bg: rgba(8, 30, 29, 0.72);
}

.generator-page[data-theme='light-1'] {
  --bg-panel: rgba(248, 250, 252, 0.92);
  --bg-panel-strong: rgba(255, 255, 255, 0.98);
  --bg-soft: rgba(14, 116, 144, 0.08);
  --border: rgba(15, 23, 42, 0.16);
  --text-soft: #475569;
  --brand: #0891b2;
  --brand-2: #2563eb;
  --generator-page-bg: rgba(241, 245, 249, 0.65);
  --generator-text: #0f172a;
  --input-bg: rgba(255, 255, 255, 0.78);
  color-scheme: light;
}

.generator-page :deep(.input),
.generator-page .input,
.generator-page select,
.generator-page textarea {
  background: var(--input-bg);
  border-color: var(--border);
  color: inherit;
}

.generator-topbar,
.generator-workspace,
.generator-panel,
.panel-title-row,
.generator-actions,
.generator-brand,
.preview-title,
.preview-chips,
.row-actions,
.card-main {
  display: flex;
}

.generator-topbar {
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
}

.generator-brand {
  align-items: center;
  gap: 12px;
}

.generator-brand h1 {
  margin: 0;
  font-size: 18px;
}

.generator-brand p {
  margin: 3px 0 0;
  color: var(--text-soft);
  font-size: 12px;
}

.generator-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.generator-workspace {
  display: grid;
  grid-template-columns: var(--left-panel-width, 340px) 8px minmax(0, 1fr) 8px var(--right-panel-width, 480px);
  height: calc(100vh - 142px);
  min-height: 560px;
  gap: 0;
  align-items: stretch;
  overflow: hidden;
}

.generator-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
  min-height: 0;
}

.generator-left,
.generator-right {
  width: auto;
  flex: none;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding: 14px;
}

.generator-right {
  width: auto;
}

.generator-preview {
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  padding: 12px;
}

.panel-resizer {
  width: 8px;
  cursor: col-resize;
  position: relative;
}

.panel-resizer::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 3px;
  width: 2px;
  border-radius: 999px;
  background: var(--border);
}

.panel-resizer:hover::before {
  background: var(--brand);
}

.panel-title-row,
.preview-title {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.panel-title-row.compact {
  align-items: baseline;
}

.preview-chips {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.left-block,
.editor-section {
  display: grid;
  gap: 10px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.block-title,
.section-title {
  font-weight: 700;
}

.left-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.left-tabs button {
  min-height: 34px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: inherit;
}

.left-tabs button.active {
  border-color: rgba(56, 189, 248, 0.58);
  background: rgba(56, 189, 248, 0.14);
}

.emitter-list,
.curve-stack {
  display: grid;
  gap: 10px;
}

.emitter-list-card,
.queue-card,
.command-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-soft);
  padding: 10px;
  display: grid;
  gap: 8px;
}

.emitter-list-card,
.queue-card {
  cursor: pointer;
}

.emitter-list-card.selected,
.queue-card.selected {
  border-color: rgba(245, 158, 11, 0.66);
}

.emitter-list-card.disabled {
  opacity: 0.55;
}

.card-main {
  align-items: center;
  gap: 8px;
}

.plain-input {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font-weight: 700;
  padding: 0;
}

.sub,
.empty-state {
  color: var(--text-soft);
  font-size: 12px;
}

.row-actions {
  justify-content: flex-end;
  gap: 6px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: inherit;
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.field,
.field-pack,
.mini-field {
  display: grid;
  gap: 6px;
}

.field span,
.vector-row > span,
.mini-field span {
  color: var(--text-soft);
  font-size: 12px;
}

.grid2,
.grid3,
.grid4 {
  display: grid;
  gap: 8px;
}

.grid2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.grid3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.grid4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.base-param-grid {
  align-items: end;
}

.command-param-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.vector-row {
  display: grid;
  grid-template-columns: 86px repeat(3, minmax(0, 1fr));
  gap: 8px;
  align-items: end;
}

.color-input {
  min-height: 42px;
  padding: 4px;
}

.check-row,
.curve-option-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-summary,
.settings-grid,
.hotkey-grid,
.axis-curve-content {
  display: grid;
  gap: 10px;
}

.settings-summary {
  color: var(--text-soft);
  font-size: 12px;
}

.settings-grid {
  grid-template-columns: minmax(150px, 1fr) repeat(2, max-content);
  align-items: end;
}

.theme-choice-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.theme-choice {
  min-height: 42px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: inherit;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
}

.theme-choice.selected {
  border-color: var(--brand);
}

.theme-swatch {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: linear-gradient(135deg, var(--brand), var(--brand-2));
  flex: 0 0 auto;
}

.theme-choice[data-theme-option='light-1'] .theme-swatch {
  background: linear-gradient(135deg, #e0f2fe, #2563eb);
}

.theme-choice[data-theme-option='dark-2'] .theme-swatch {
  background: linear-gradient(135deg, #0f766e, #38bdf8);
}

.hotkey-row {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(100px, 150px) auto;
  gap: 8px;
  align-items: center;
}

.hotkey-row > span {
  color: var(--text-soft);
  font-size: 12px;
}

.hotkey-input {
  cursor: pointer;
}

.axis-curve-box {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-soft);
  padding: 8px;
}

.axis-curve-box > summary {
  cursor: pointer;
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 700;
}

.axis-curve-content {
  margin-top: 10px;
}

.chip {
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-soft);
  padding: 6px 10px;
  font-size: 12px;
}

.generator-canvas {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 10px;
}

.generator-canvas :deep(.preview-host),
.generator-canvas :deep(.preview-host--bare),
.generator-canvas :deep(.preview-canvas) {
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 8px;
}

.generator-code-page {
  min-height: calc(100vh - 142px);
}

.code-panel-wide {
  padding: 14px;
  flex-direction: column;
  gap: 12px;
}

.kotlin-output {
  min-height: calc(100vh - 220px);
  max-height: calc(100vh - 220px);
  overflow: auto;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-panel-strong);
  padding: 14px;
  font-size: 12px;
}

.code-textarea {
  min-height: 180px;
  resize: vertical;
}

.code-textarea.compact {
  min-height: 84px;
}

.danger {
  color: #fca5a5;
}

@media (max-width: 1100px) {
  .generator-workspace {
    display: flex;
    height: auto;
    flex-direction: column;
    min-height: auto;
    overflow: visible;
    gap: 12px;
  }

  .panel-resizer {
    display: none;
  }

  .generator-left,
  .generator-right {
    width: 100%;
    flex-basis: auto;
  }

  .generator-preview {
    min-height: 560px;
    flex: 0 0 auto;
  }

  .generator-canvas :deep(.preview-host),
  .generator-canvas :deep(.preview-host--bare),
  .generator-canvas :deep(.preview-canvas) {
    height: 500px;
    min-height: 500px;
  }
}

@media (max-width: 720px) {
  .generator-topbar,
  .generator-brand,
  .preview-title {
    align-items: flex-start;
    flex-direction: column;
  }

  .grid2,
  .grid3,
  .grid4,
  .command-param-grid,
  .settings-grid,
  .theme-choice-grid,
  .hotkey-row {
    grid-template-columns: 1fr;
  }

  .vector-row {
    grid-template-columns: 1fr;
  }

  .generator-canvas :deep(.preview-host),
  .generator-canvas :deep(.preview-host--bare),
  .generator-canvas :deep(.preview-canvas) {
    height: 420px;
    min-height: 420px;
  }
}
</style>
