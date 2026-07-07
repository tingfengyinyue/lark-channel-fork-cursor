# 多 CLI 支持功能

本 fork 为 `lark-channel-fork-cursor` 添加了对多个 AI CLI 工具的支持，允许在 Claude Code 和 Cursor Agent 之间切换。

## 新增功能

### 1. 支持的 CLI

- **Claude Code** (`claude`) - Anthropic 官方 CLI
- **Cursor Agent** (`agent`) - Cursor 的命令行 AI 工具

### 2. 配置方式

在 `~/.lark-channel/config.json` 中添加 `cli` 配置：

```json
{
  "preferences": {
    "cli": {
      "provider": "claude",  // "claude" 或 "cursor"
      "claude": {
        "binary": "claude"   // 可选，自定义 claude 命令路径
      },
      "cursor": {
        "binary": "agent",   // 可选，自定义 agent 命令路径
        "mode": "agent"      // "agent" | "plan" | "ask"
      }
    }
  }
}
```

### 3. 飞书命令

新增 `/cli` 命令用于管理 CLI 切换：

- `/cli` 或 `/cli status` - 查看当前使用的 CLI
- `/cli use <claude|cursor>` - 切换 CLI（需要重启生效）
- `/cli mode <agent|plan|ask>` - 设置 Cursor 模式（仅 Cursor 可用）

### 4. Cursor 模式说明

Cursor Agent 支持三种工作模式：

- **agent** (默认) - 完整工具访问，处理复杂编码任务
- **plan** - 通过提问设计实现方案后再编码
- **ask** - 只读探索，不修改代码

## 使用示例

### 切换到 Cursor Agent

```
/cli use cursor
```

### 设置 Cursor 为 Plan 模式

```
/cli mode plan
```

### 切换回 Claude Code

```
/cli use claude
```

### 重启 bridge 使配置生效

```
/reconnect
```

## 技术实现

### 核心文件

- `src/agent/cursor/adapter.ts` - Cursor Agent 适配器
- `src/agent/cursor/stream-json.ts` - Cursor 输出流解析
- `src/agent/factory.ts` - Agent 工厂函数
- `src/config/schema.ts` - 配置类型定义（新增 `CliConfig`）
- `src/commands/index.ts` - 命令处理（新增 `/cli` 命令）
- `src/cli/commands/start.ts` - 启动逻辑（使用工厂创建 agent）

### 架构设计

1. **统一接口** - 所有 CLI 适配器实现 `AgentAdapter` 接口
2. **工厂模式** - 通过 `createAgent()` 根据配置创建对应的适配器
3. **配置驱动** - CLI 选择和参数通过配置文件管理
4. **热切换** - 通过 `/reconnect` 命令重启 bridge 应用新配置

## 安装和测试

### 本地安装

```bash
cd /path/to/lark-channel-fork-cursor
pnpm install
pnpm build
npm link
```

### 测试

1. 确保已安装 Cursor CLI：
   ```bash
   curl https://cursor.com/install -fsS | bash
   ```

2. 启动 bridge：
   ```bash
   lark-channel-fork-cursor start
   ```

3. 在飞书中测试：
   ```
   /cli status
   /cli use cursor
   /reconnect
   ```

## 兼容性

- 向后兼容：未配置 `cli` 时默认使用 Claude Code
- Node.js >= 20
- 需要安装对应的 CLI 工具（`claude` 或 `agent`）

## 贡献

本功能基于 [zarazhangrui/feishu-claude-code-bridge](https://github.com/zarazhangrui/feishu-claude-code-bridge) 开发。

## 待办事项

- [ ] 添加更多 CLI 支持（Aider、Continue 等）
- [ ] 支持运行时切换（无需重启）
- [ ] 添加 CLI 可用性检测和错误提示优化
- [ ] 完善 Cursor 特有功能的支持（Cloud Agent 等）
