# 运维说明：Per-Instance Distribution 架构（交接给 OpsAgent）

> **重要口径修正**：之前的指令说"两个 Anki 库"（Gao Tian / Gao Yi）。这是不完整的。
> 新架构需要 **三个 Anki 实例**：一个主库（source）+ 两个从库（receivers）。
> 请按本文档补齐主库并调整门户配置。

## 1. 目标架构

```
                       ┌─────────────────────────────┐
   Telegram / 门户 UI ──▶│  Portal (Next.js)           │
                       │  ANKI_CONNECT_URL ──────────┼──▶ anki-source   ← 唯一写入/创作库
                       │  DISTRIBUTION_TARGETS ──────┼──▶ anki-gaotian  ← 只接收分发
                       │   (Name=URL, Name=URL)      ┼──▶ anki-gaoyi    ← 只接收分发
                       └─────────────────────────────┘
```

- **所有创作操作**（添加、enrich、浏览、删除、Telegram 写入）只发生在 source。
- **分发是单向的** source → receivers：按 "Note ID" UUID upsert，幂等，不动学习进度。
- **删除不传播**：在 source 删卡不影响 receivers（有意为之——库之间不保证镜像）。
- **receivers 零铺底**：分发时如果 receiver 缺 notetype 或 deck，门户会从 source 拉取完整定义自动创建。新容器空 profile 开箱即用，**不需要**手工建 deck/notetype。

## 2. 需要 OpsAgent 做的事

### 2.1 补一个 source 容器（本地测试环境 + VPS 生产各一个）

- 镜像与现有 anki-gaotian / anki-gaoyi 相同（headless Anki + AnkiConnect + noVNC）。
- 本地测试环境建议：AnkiConnect `127.0.0.1:8772`、noVNC `6082`（8770/8771、6080/6081 已被两个 receiver 占用）。
- VPS 端口自定，但 AnkiConnect 端口**只允许内网/回环访问**，不得暴露公网。
- 定好后把最终 URL 告知（门户配置要用）。

### 2.2 主库数据灌入（一次性）

主库的数据来源是**旧架构的 home profile（"User 1"）**，不是两个孩子库的合并：

- **首选**：source 容器 noVNC 里登录 User 1 的 AnkiWeb 账号 → 同步拉取。此后主库持续有 AnkiWeb 备份。
- **备选**：从旧部署数据卷导出 User 1 的 `.colpkg`，noVNC 里导入。
- 主库只是创作缓冲区，复习进度无关紧要，只有 notes + media 重要。

### 2.3 receivers 的 AnkiWeb 登录（保持现状即可）

- anki-gaotian / anki-gaoyi 各自登录对应孩子的 AnkiWeb 账号（孩子 iPad/手机的同步链路）。
- 分发完成后门户会对每个 receiver 触发一次 best-effort `sync`，失败只告警不阻塞。

### 2.4 门户配置（新旧对照）

| 旧配置（已失效，可删） | 新配置 |
|---|---|
| `ACTIVE_PROFILE` | （删除，无对应物） |
| `DISTRIBUTION_PROFILES=Gao Tian, Gao Yi` | `DISTRIBUTION_TARGETS=Gao Tian=<gaotian实例URL>, Gao Yi=<gaoyi实例URL>` |
| `ANKI_CONNECT_URL`（指向多 profile 单实例） | `ANKI_CONNECT_URL=<source实例URL>`（env 或设置页均可） |

- `DISTRIBUTION_TARGETS` 格式：逗号分隔的 `名字=URL`，名字用于 UI 展示和结果上报。
- `/api/anki/profiles` 路由已删除；门户不再切换 profile，每个实例固定一个 profile。

## 3. 部署版本与时机

- 代码在分支 **`feat/per-instance-distribution`**（8 个提交），**尚未合并 master、尚未打 tag**。
- master 上最新 tag `v0.9.16` 仍是旧的 profile 切换架构 —— **不要**用 v0.9.16 配新的三实例架构，两者配置不兼容。
- 剩余配套（全量再分发入口、三库对账脚本）完成、合并打 tag 后会另行通知具体版本号。
- OpsAgent 现阶段可以先做 2.1–2.3（容器与数据准备），门户升级等 tag。

## 4. 上线步骤（tag 就绪后）

1. 拉新 tag 镜像部署门户。
2. 配置 `ANKI_CONNECT_URL`（source）与 `DISTRIBUTION_TARGETS`（两个 receiver）。
3. 验证 `/api/health` 返回 `ok:true` 且两种语言 deck/model 均为 true。
4. 门户 Quick Add 加一张测试卡（`__test_` 前缀），勾选分发到两个孩子实例。
5. 各 receiver 的 noVNC 里确认卡片出现在正确 deck（不在 "Default"）。
6. source 上删除该测试卡，确认 receivers 上的副本**仍在**（删除不传播），再到各 receiver 手工删掉测试卡。
7. 跑一次全量再分发（入口开发中；在此之前可用 API：`findNotes` 全量 → 分批 POST `/api/anki/distribute`），修复历史分发失败造成的缺卡。

## 5. 回滚

- 门户回滚到 `v0.9.16` 镜像 = 回到 profile 切换架构，需同时恢复旧配置（`ACTIVE_PROFILE`/`DISTRIBUTION_PROFILES`）并指回多 profile 单实例。三实例容器与 v0.9.16 不兼容。
- Anki 数据层无破坏性变更：新架构只做 addNote/updateNoteFields/createDeck/createModel，全部可人工撤销。

## 6. 已知注意事项

- AnkiConnect 容器偶发 HTTP 503（Anki 忙时），门户侧每个目标错误隔离、下次分发自愈；监控只需关注持续性失败。
- 分发结果按目标逐个上报（`{ profile: <目标名>, success, notesDistributed, error? }`），Telegram 管道会把摘要发回聊天。
- 集成测试 `npm run test:integration` 可在任何一台能访问两个测试容器（8770/8771）的机器上验证分发链路，容器不可达时自动跳过。
