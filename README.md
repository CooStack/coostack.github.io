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
- Express 可直接托管 `apps/web/dist`，支持单服务部署前端主页和 `/api`

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
- 部署：GitHub Pages + GitHub Actions，或单独部署 Node 服务

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

## 单服务部署（推荐）

如果你希望主页和后端接口走同一个域名，当前仓库已经支持由 Express 同时托管前端构建产物和 `/api`。

构建与启动：

1. 在仓库根目录执行 `npm run build`
2. 启动服务：`npm run start`
3. 将整个仓库内容一并部署，至少要包含：
   - `apps/server`
   - `apps/web/dist`
   - 根目录 `package.json` / `package-lock.json`

部署后的效果：

- `GET /` 返回前端主页
- `GET /api/social/bilibili/stat` 返回粉丝数据
- 前端会默认请求同域 `/api`
- 首页粉丝数可正常显示

这类部署适合 Render、Railway、Fly.io、云服务器 Docker、宝塔 Node 项目等可运行 Node.js 进程的平台。

## GitHub Pages 部署

**2026-03-08 当前情况：GitHub Pages 仍然只能托管静态文件，不能运行 Node.js / Express 进程。**

所以：

- `https://coostack.github.io` 这类 GitHub Pages 地址本身**不能直接变成后端服务**
- 仅把前端发布到 Pages 时，首页粉丝数依赖的 `/api/social/bilibili/stat` 不会在 Pages 上自动存在
- 想在 Pages 上继续显示粉丝数，只能额外部署一个后端，并把 `VITE_API_BASE_URL` 指向那个后端地址

GitHub Actions 工作流文件：

- `.github/workflows/jekyll-gh-pages.yml`

GitHub Actions 构建时会注入以下变量：

- `VITE_DEPLOY_TARGET=github-pages`
- `VITE_APP_BASE=/<仓库名>/`（若仓库名本身是 `<用户名>.github.io`，则自动使用 `/`）
- `VITE_ROUTER_MODE=hash`
- `VITE_PROJECT_REPOSITORY_MODE=local`
- `VITE_API_BASE_URL=${{ vars.VITE_API_BASE_URL }}`（可选；如配置为外部后端地址，Pages 页面也能拿到粉丝数）

如果你的目标是“同一个域名同时返回页面和接口”，请不要继续用 GitHub Pages 作为最终生产承载，而是改为部署 Node 服务，或者使用你自己的自定义域名反代到 Node 服务。

## 构建校验

建议执行：

- `npm run build`
- `npm run build:web:github`

预期结果：

- 单服务模式前端构建通过
- GitHub Pages 模式前端构建通过
- 存在单 chunk 体积告警时，一般不阻塞发布

## 下次继续时先看

1. `D:/java/blogs/PLAN.md`
2. `D:/java/blogs/docs/migration-handbook.md`
3. `D:/java/blogs/.spec-workflow/specs/legacy-tools-vue-migration/requirements.md`
4. `D:/java/blogs/.spec-workflow/specs/legacy-tools-vue-migration/design.md`
5. `D:/java/blogs/.spec-workflow/specs/legacy-tools-vue-migration/tasks.md`
