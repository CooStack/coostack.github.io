# Blogs Vue + Node.js Rewrite

这是把 `D:/java/github` 中旧版静态工具站迁移到 `D:/java/blogs` 的 Vue + Node.js 新项目。

## 当前状态

当前仓库已完成本轮迁移主线：

- 中文 `PLAN.md`、迁移手册、SPEC 文档
- Vue 3 + Vite 前端骨架与页面路由
- Node.js + Express 后端骨架
- 部署模式解析与 GitHub Pages 兼容配置
- 项目仓库抽象层：服务端优先，本地回退；Pages 下自动本地模式
- `PointsBuilder` 高保真迁移
- `Composition 专用 Builder` 独立桥接页
- `Composition Builder` 旧版布局骨架、卡片工作台、动态预览、Builder / Bezier iframe 桥接、主题切换、分栏拖拽、JSON 导入导出、Kotlin 输出
- `Shader Builder` 作为着色器编辑器恢复模型着色器 / 后处理页签、纹理库、后处理图、设置 / 快捷键弹窗、渲染预览、JSON 导入导出、Kotlin 输出
- 首页恢复旧版卡片网格、主题切换、整卡点击与代码流展示；Generator、Bezier 页面入口补齐
- GitHub Actions Pages 自动部署工作流

## 已包含页面

- `index`：工具首页
- `pointsbuilder`：粒子样式生成器
- `composition`：Composition Builder
- `composition-pointsbuilder`：Composition 专用 Builder
- `shader-builder`：Shader Builder
- `generator`：粒子参数生成器
- `bezier`：Bezier 曲线工具

## 技术栈

- 前端：Vue 3 + Vue Router + Vite + Three.js
- 后端：Node.js + Express
- 数据：服务端 JSON 持久化 + 前端本地存储降级
- 部署：GitHub Pages + GitHub Actions

## 目录结构

- `apps/web`：前端 Vue 项目
- `apps/server`：后端 Node.js 项目
- `apps/web/src/pages`：页面层
- `apps/web/src/components`：可复用组件
- `apps/web/src/modules`：各工具的领域模块
- `apps/web/src/services`：API、仓库抽象、导出、部署模式适配
- `apps/server/src/routes`：接口路由
- `apps/server/src/services`：业务逻辑
- `.spec-workflow/specs/legacy-tools-vue-migration`：迁移 SPEC 文档

## 本地开发

1. 在 `D:/java/blogs` 执行 `npm install`
2. 启动后端：`npm run dev:server`
3. 启动前端：`npm run dev:web`

默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3001`

本地开发模式特性：

- 前端默认使用服务端仓库模式
- 若 API 不可用，会自动降级到本地仓库模式
- 导出优先尝试后端，失败时回退本地文件下载

## GitHub Pages 部署

GitHub Pages 不能运行 Node.js，因此前端构建后会自动切换为：

- Hash 路由
- 本地项目仓库模式
- 本地导出模式

工作流文件：

- `.github/workflows/deploy-pages.yml`

GitHub Actions 构建时会注入以下变量：

- `VITE_DEPLOY_TARGET=github-pages`
- `VITE_APP_BASE=/<仓库名>/`
- `VITE_ROUTER_MODE=hash`
- `VITE_PROJECT_REPOSITORY_MODE=local`

只要仓库默认分支是 `master` 或 `main`，并在仓库设置中启用 GitHub Pages + GitHub Actions，推送后就会自动发布前端静态产物。

## 构建校验

当前已执行：

- `npm.cmd run build:web`
- `npm.cmd run build:web:github`

结果：

- 本地模式前端构建通过
- GitHub Pages 模式前端构建通过
- 存在单 chunk 体积告警，但不阻塞发布

## 下次继续时先看

1. `D:/java/blogs/PLAN.md`
2. `D:/java/blogs/docs/migration-handbook.md`
3. `D:/java/blogs/.spec-workflow/specs/legacy-tools-vue-migration/requirements.md`
4. `D:/java/blogs/.spec-workflow/specs/legacy-tools-vue-migration/design.md`
5. `D:/java/blogs/.spec-workflow/specs/legacy-tools-vue-migration/tasks.md`
