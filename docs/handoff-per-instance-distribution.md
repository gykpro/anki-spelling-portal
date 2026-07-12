# 交接说明：Per-Instance Distribution（换机继续）

> 目的：在另一台机器上无缝接续这项工作。本文档是入口，读完照做即可。

## 1. 分支位置

| | |
|---|---|
| **仓库** | `git@github.com:gykpro/anki-spelling-portal.git` |
| **分支** | `feat/per-instance-distribution`（已推送到 origin） |
| **最新提交** | `5336ff4`（本文件提交后会更新，以 `git log` 为准） |
| **基线** | 从 `master` 的 `v0.9.16`（`3db2bde`）切出 |
| **落后/领先** | 领先 master 12 个提交，**尚未合并、尚未打 tag** |

master 上的 `v0.9.16` 是**旧的** profile 切换架构，与本分支配置不兼容 —— 新机器上继续工作请 checkout 本分支，不要用 master。

## 2. 新机器上的启动步骤

```bash
git clone git@github.com:gykpro/anki-spelling-portal.git
cd anki-spelling-portal
git checkout feat/per-instance-distribution
npm install          # Node 23.x / npm 11.x（开发机上验证过的版本）
```

**没有跟随分支走的本地文件**（新机器需自行准备，不在 git 里）：
- `data/secrets.json` — 所有密钥与配置（`ANTHROPIC_API_KEY` 或 `CLAUDE_CODE_OAUTH_TOKEN`、`AZURE_TTS_KEY`、`NANO_BANANA_API_KEY`、`TELEGRAM_BOT_TOKEN`、`ANKI_CONNECT_URL`、`DISTRIBUTION_TARGETS`）。通过门户设置页填，或手工创建。**切勿把生产 Telegram token 填到开发机**（会和 VPS bot 抢 long-polling）。
- `.claude/settings.local.json` — 本地 Claude Code 权限白名单，机器相关，无需迁移。
- `~/services/anki/` — 测试用的 Podman 容器（见第 4 节）。

## 3. 本分支已完成的工作（12 个提交）

分发架构从「单实例切 profile」重构为「每 profile 一个独立 Anki 实例，固定 URL 直连」。

1. **核心改造**（`feat/per-instance-distribution` 的 T1–T8）
   - `createAnkiClient(url)` 工厂（`src/lib/anki-connect.ts`）；默认 `ankiConnect` 仍跟随 `ANKI_CONNECT_URL`（= 源实例）
   - 共享分发流程 `src/lib/distribution.ts`：`distributeToTargets()` 自动在从库建 notetype（从源拉完整定义）+ deck，按 UUID upsert，分发后 best-effort sync
   - 配置 `DISTRIBUTION_TARGETS`（`Name=URL, ...`）替代旧的 `DISTRIBUTION_PROFILES`/`ACTIVE_PROFILE`
   - **删除只作用于源实例，不再传播**（库之间不保证镜像，传播会误删从库唯一副本）
   - 移除全部 profile 切换机制：`ProfileLock`、`loadProfileAndWait`、`/api/anki/profiles`、`ProfileIndicator`、设置页 ProfilesSection
2. **全量再分发** `POST /api/anki/redistribute` — 两 deck 全量分批推给目标，补卡时连同音频/图片从源复制过去（`copyMediaOnAdd`）。上线用于修复历史缺卡。
3. **对账报告** `GET /api/anki/reconcile` — 只读，按 UUID 逐 deck 输出从库缺卡/多卡/词不一致/重复 UUID。

关键设计取舍记录在各 spec 里（`docs/superpowers/specs/2026-07-04-*.md`）。**"为什么不做删除传播"** 的完整论证在 per-instance spec 的 Decisions 段 —— 换机后如果对这个决定有疑问，先读那里。

## 4. 测试环境（Podman 容器）

测试环境是本机 `~/services/anki/` 下的 Podman 容器，**不随 git 迁移**，新机器需重建。搭建参考 `docs/local-anki-containers.md`。当前形态：

| 容器 | profile | AnkiConnect | noVNC |
|---|---|---|---|
| anki-gaotian | Gao Tian | localhost:8770 | localhost:6080 |
| anki-gaoyi | Gao Yi | localhost:8771 | localhost:6081 |

集成测试把 **8770 当源、8771 当目标**。生产（VPS）是独立的三实例架构（source + 两个 receiver），归 OpsAgent 管，见 `docs/ops-per-instance-distribution.md`。

## 5. 验证命令（新机器上确认一切正常）

```bash
npm test                  # 96 Vitest + 1 Playwright，应全绿
npm run test:integration  # 真实容器 8770→8771；容器没起时自动跳过、退出 0
npm run build             # Next.js 生产构建
```

Playwright e2e 需要一个有 `Gao English Spelling` + `Gao Chinese` 两个 deck 的 Anki 实例可达（`localhost:8765` 或容器）。

**dev server**：`PORT=<自选端口> ANKI_CONNECT_URL=http://localhost:8770 npm run dev`（默认端口 3001，被占用就用 PORT 覆盖）。

## 6. 剩余待办（`docs/todo.md` 有完整列表）

**上线阻塞项已全部完成**（再分发 + 对账）。剩下的都不阻塞：

- **Browse 页实例切换器**（Pending）— 在 Browse 页加实例下拉，可浏览/删除任一实例的库（只维护用途，不从非源实例创作）。这是原计划里唯一没做的配套 feature。
- 合并 master + 打 tag（建议 v0.9.17）：**等 OpsAgent 在 VPS 备好 source 容器 + 主库数据、你在测试环境验收之后再做**。当前刻意保持分支未合。
- 其他历史技术债见 todo.md（cloze 正则去重、Quick Add 分类器对齐等），与本 feature 无关。

## 7. 上线依赖（给 OpsAgent 的部分）

见 `docs/ops-per-instance-distribution.md`（已发给你）。要点：VPS 需补一个 source 容器；主库从旧 home profile（"User 1"）经 AnkiWeb/colpkg 灌入，**不是**两个从库的合并；门户配 `ANKI_CONNECT_URL`（源）+ `DISTRIBUTION_TARGETS`（两个孩子实例）；上线前后各跑一次对账，上线时跑一次全量再分发。
