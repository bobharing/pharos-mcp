# Pharos MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)

A Model Context Protocol (MCP) server that provides comprehensive web performance auditing and analysis capabilities using Google Lighthouse. This server enables LLMs and AI agents to perform detailed website performance assessments, accessibility audits, SEO analysis, security checks, and Core Web Vitals monitoring.

## 🌟 Key Features

- **🚀 Performance Analysis**: Complete Lighthouse audits with Core Web Vitals, performance scores, and optimization recommendations
- **♿ Accessibility Audits**: WCAG compliance checking and accessibility score analysis
- **🔍 SEO Analysis**: Search engine optimization audits and best practice recommendations
- **🔒 Security Assessment**: HTTPS, CSP, and related security best-practice checks
- **📊 Resource Analysis**: JavaScript, CSS, image, and font optimization opportunities
- **📱 Mobile vs Desktop**: Comparative analysis across devices with throttling options
- **⚡ Core Web Vitals**: LCP, INP, CLS monitoring with threshold checking
- **🎯 Performance Budgets**: Custom performance thresholds and budget monitoring
- **🗂️ Result Caching**: In-memory LHR cache (5-minute TTL) eliminates redundant Lighthouse runs for repeated tool calls on the same URL/device/throttling combination
- **📚 Reference Resources**: Built-in guidelines and best practices for web performance, accessibility, SEO, and security

## 🛠️ Requirements

- [Bun](https://bun.sh) 1.1.0 or newer
- Chrome/Chromium browser (automatically managed by Lighthouse)
- VS Code, Cursor, Windsurf, Claude Desktop, or any other MCP client

## 🚀 Getting Started

Clone the repository and install dependencies:

```bash
git clone https://github.com/bobharing/pharos-mcp.git
cd pharos-mcp
bun install
```

Run the server:

```bash
bun run src/index.ts
```

### MCP Client Configuration

Add Pharos to your MCP client:

```json
{
  "mcpServers": {
    "pharos": {
      "command": "bun",
      "args": ["run", "/path/to/pharos-mcp/src/index.ts"]
    }
  }
}
```

### Persistent Chrome Profiles (Login Sessions)

If you need authenticated sessions, launch with a persistent Chrome profile and run headed:

```json
{
  "mcpServers": {
    "pharos": {
      "command": "bun",
      "args": [
        "run",
        "/path/to/pharos-mcp/src/index.ts",
        "--profile-path",
        "<profile-path>",
        "--no-headless"
      ]
    }
  }
}
```

You can pass extra Chrome flags with `--chrome-flag`, for example `--chrome-flag=--disable-gpu`.
If the flag value starts with `--` and matches a known option name, prefer `--chrome-flag=...` to avoid parsing it as a top-level option.
Profile mode disables Lighthouse's storage reset so cookies and local storage persist between runs.
If `--user-data-dir` points to a missing directory, it will be created and treated as a fresh profile.
Set `--profile-path` to the Profile Path shown in `chrome://version` (e.g. `.../Default`).
Note: Chrome's remote debugging requires a non-default user data directory, so reuse a dedicated profile directory instead of the system default.
You can also pass `--user-data-dir` + `--profile-directory` separately if you prefer.
Attaching with `--chrome-port` alone does not preserve storage; include a profile flag to keep sessions.

### CLI Options

Supported runtime flags for the MCP server:

- `--profile-path <path>`: use the Profile Path from `chrome://version` (auto-derives user data dir + profile name)
- `--user-data-dir <path>`: reuse a Chrome profile directory for persistent sessions
- `--profile-directory <name>`: select a profile within the user data dir
- `--chrome-path <path>`: explicit path to the Chrome/Chromium executable (overrides auto-detection; also respects the `CHROME_PATH` environment variable)
- `--chrome-flag <flag>` or `--chrome-flag=<flag>`: pass through extra Chrome flags (repeatable)
- `--chrome-port <port>` or `--remote-debugging-port <port>`: attach to an existing Chrome instance launched with remote debugging enabled
- `--headless`: force headless mode
- `--no-headless`: force headed mode

#### WSL2 / Custom Chrome Path

If the wrong Chrome binary is picked up (e.g. Windows Chrome instead of the Linux binary on WSL2), set the path explicitly:

```bash
# Via CLI flag
bun run src/index.ts --chrome-path /usr/bin/google-chrome

# Via environment variable
CHROME_PATH=/usr/bin/google-chrome bun run src/index.ts
```

In your MCP config:

```json
{
  "mcpServers": {
    "pharos": {
      "command": "bun",
      "args": [
        "run",
        "/path/to/pharos-mcp/src/index.ts",
        "--chrome-path",
        "/usr/bin/google-chrome"
      ]
    }
  }
}
```

### E2E Smoke Test (Profile)

Run a real audit with a persistent profile (use an existing profile directory and log in once if needed):

```bash
bun run src/index.ts --profile-path "<profile-path>" --no-headless
```

### E2E Smoke Test (Attach to Existing Chrome)

Start Chrome with remote debugging enabled:

```bash
/path/to/GoogleChromeExecutable \
  --remote-debugging-port=9222 \
  --user-data-dir /path/to/chrome-profile
```

Replace `/path/to/GoogleChromeExecutable` with your platform's Chrome/Chromium binary path.

Then attach Pharos to that instance:

```bash
bun run src/index.ts --chrome-port 9222
```

To preserve storage when attaching, pass the profile path so Lighthouse keeps cookies/local storage:

```bash
bun run src/index.ts --chrome-port 9222 --profile-path "<profile-path>"
```

### Install in VS Code

Add Pharos to your VS Code MCP configuration (`settings.json`):

```json
{
  "mcp": {
    "servers": {
      "pharos": {
        "type": "stdio",
        "command": "bun",
        "args": ["run", "/path/to/pharos-mcp/src/index.ts"]
      }
    }
  }
}
```

### Install in Claude Desktop

Follow the MCP install [guide](https://modelcontextprotocol.io/quickstart/user), use the following configuration:

```json
{
  "mcpServers": {
    "pharos": {
      "command": "bun",
      "args": ["run", "/path/to/pharos-mcp/src/index.ts"]
    }
  }
}
```

## 🗄️ Result Caching

Pharos caches full Lighthouse results in memory to avoid redundant Chrome launches. Any two tool calls for the same `url` + `device` + `throttling` combination within a 5-minute window reuse the cached result automatically.

- **Cache key**: `url :: device :: throttling`
- **TTL**: 5 minutes (lazy eviction on access)
- **Scope**: process-lifetime, cleared on server restart
- **Profile mode**: caching is disabled when a Chrome profile is configured, since authenticated sessions produce user-specific results
- **`forceFresh`**: pass `forceFresh: true` on any tool call to bypass the cache and store a fresh result for subsequent calls

## 🌐 Transport

By default, Pharos uses **stdio** transport (for VS Code, Claude Desktop, Cursor, etc.).

### HTTP Transport

For shared or remote access, Pharos can serve over HTTP using the MCP Streamable HTTP transport:

```bash
PHAROS_TRANSPORT=http PHAROS_PORT=3000 bun run src/index.ts
```

- `POST /mcp` — MCP Streamable HTTP endpoint
- `GET /health` — Health check (returns `ok`)

The HTTP transport is stateless — each request is independent, which is correct for Lighthouse audits.

## 🔧 Available Tools

Pharos exposes 9 tools with the `pharos_` prefix, all marked read-only:

### 🏁 Audit Tools

| Tool           | Description                                 | Parameters                                                                                         |
| -------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pharos_audit` | Full Lighthouse audit across all categories | `url`, `categories?`, `device?`, `throttling?`, `forceFresh?`, `includeDetails?`, `focusCategory?` |

### ⚡ Performance Tools

| Tool                     | Description                                  | Parameters                                                            |
| ------------------------ | -------------------------------------------- | --------------------------------------------------------------------- |
| `pharos_performance`     | Performance score with optional budget check | `url`, `device?`, `forceFresh?`, `budget?`                            |
| `pharos_core_web_vitals` | Core Web Vitals with threshold validation    | `url`, `device?`, `forceFresh?`, `includeDetails?`, `threshold?`      |
| `pharos_compare_devices` | Side-by-side mobile vs desktop comparison    | `url`, `categories?`, `throttling?`, `forceFresh?`, `includeDetails?` |
| `pharos_lcp`             | LCP value and improvement opportunities      | `url`, `device?`, `forceFresh?`, `includeDetails?`, `threshold?`      |

### 🔍 Analysis Tools

| Tool               | Description                              | Parameters                                                    |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------- |
| `pharos_unused_js` | Find removable JavaScript by byte count  | `url`, `device?`, `forceFresh?`, `minBytes?`                  |
| `pharos_resources` | Full resource breakdown by type and size | `url`, `device?`, `forceFresh?`, `resourceTypes?`, `minSize?` |

### 🔒 Security Tools

| Tool              | Description                                  | Parameters                      |
| ----------------- | -------------------------------------------- | ------------------------------- |
| `pharos_security` | HTTPS, mixed-content, HSTS, and CSP checks | `url`, `forceFresh?`, `checks?` |

## 💬 Available Prompts

Pharos includes reusable prompts that help LLMs provide structured analysis and recommendations:

### 📊 Analysis Prompts

| Prompt                     | Description                                      | Parameters                                                      |
| -------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `analyze-audit-results`    | Analyze Lighthouse audit results                 | `auditResults`, `focusArea?`                                    |
| `compare-audits`           | Compare before/after audit results               | `beforeAudit`, `afterAudit`, `changesImplemented?`              |
| `optimize-core-web-vitals` | Get Core Web Vitals optimization recommendations | `coreWebVitals`, `framework?`, `constraints?`                   |
| `optimize-resources`       | Get resource optimization recommendations        | `resourceAnalysis`, `loadingStrategy?`, `criticalUserJourneys?` |

### 📚 Available Resources

Pharos provides built-in reference resources with essential guidelines and best practices:

| Resource                     | Description                                       | URI                                                   |
| ---------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `core-web-vitals-thresholds` | Core Web Vitals performance thresholds            | `lighthouse://performance/core-web-vitals-thresholds` |
| `optimization-techniques`    | Performance optimization techniques and impact    | `lighthouse://performance/optimization-techniques`    |
| `wcag-guidelines`            | WCAG 2.1 accessibility guidelines and issues      | `lighthouse://accessibility/wcag-guidelines`          |
| `seo-best-practices`         | SEO best practices and optimization opportunities | `lighthouse://seo/best-practices`                     |
| `security-best-practices`    | Web security best practices and vulnerabilities   | `lighthouse://security/best-practices`                |
| `budget-guidelines`          | Performance budget recommendations by site type   | `lighthouse://performance/budget-guidelines`          |
| `categories-scoring`         | Lighthouse audit categories and scoring methods   | `lighthouse://audits/categories-scoring`              |
| `framework-guides`           | Framework-specific optimization guides            | `lighthouse://frameworks/optimization-guides`         |

### 🎯 Strategy Prompts

| Prompt                      | Description                                         | Parameters                                              |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| `create-performance-plan`   | Generate comprehensive performance improvement plan | `currentMetrics`, `targetGoals?`, `timeframe?`          |
| `create-performance-budget` | Create custom performance budget recommendations    | `currentMetrics`, `businessGoals?`, `userBase?`         |
| `seo-recommendations`       | Generate SEO improvement recommendations            | `seoAudit`, `websiteType?`, `targetAudience?`           |
| `accessibility-guide`       | Create accessibility improvement guide              | `accessibilityAudit`, `complianceLevel?`, `userGroups?` |

### 🔧 Prompt Parameter Details

- **`auditResults`**: JSON audit results from Lighthouse tools
- **`focusArea`**: Specific category to focus on (`"performance"`, `"accessibility"`, `"seo"`, `"best-practices"`, `"pwa"`)
- **`beforeAudit`** / **`afterAudit`**: Lighthouse audit results before and after changes
- **`changesImplemented`**: Description of changes made between audits
- **`currentMetrics`**: Current performance metrics from audits
- **`targetGoals`**: Specific performance targets or business goals
- **`timeframe`**: Timeline for implementing improvements
- **`framework`**: Frontend framework or technology stack
- **`constraints`**: Technical or business constraints
- **`websiteType`**: Type of website (e.g., e-commerce, blog, corporate)
- **`targetAudience`**: Target audience or market information
- **`complianceLevel`**: WCAG compliance level (`"AA"` or `"AAA"`)
- **`userGroups`**: Specific user groups to consider for accessibility

## 📋 Parameter Details

### Common Parameters

- **`url`** (required): The website URL to analyze
- **`device`**: Target device (`"desktop"` or `"mobile"`, default: `"desktop"`)
- **`includeDetails`**: Include detailed audit information (default: `false`)
- **`throttling`**: Enable network/CPU throttling (default: `false`)
- **`forceFresh`**: Bypass the in-memory cache and force a new Lighthouse run (default: `false`)

### Specific Parameters

- **`categories`**: Lighthouse categories to audit (`["performance", "accessibility", "best-practices", "seo", "agentic-browsing"]`)
- **`threshold`**: Custom thresholds for metrics (e.g., `{"lcp": 2.5, "inp": 200, "cls": 0.1}`)
- **`budget`**: Performance budget limits (e.g., `{"performanceScore": 90, "largestContentfulPaint": 2500}`)
- **`resourceTypes`**: Resource types to analyze (`["images", "javascript", "css", "fonts", "other"]`)
- **`minBytes`**: Minimum file size threshold for analysis (default: `2048`)
- **`checks`**: Security checks to perform (`["https", "mixed-content", "hsts", "csp"]`)

## 💡 Usage Examples

### Full Site Audit

```javascript
{
  "tool": "pharos_audit",
  "arguments": {
    "url": "https://example.com",
    "device": "mobile",
    "focusCategory": "performance"
  }
}
```

### Core Web Vitals with Thresholds

```javascript
{
  "tool": "pharos_core_web_vitals",
  "arguments": {
    "url": "https://example.com",
    "device": "mobile",
    "threshold": {
      "lcp": 2.5,
      "fid": 100,
      "cls": 0.1
    }
  }
}
```

### Security Assessment

```javascript
{
  "tool": "pharos_security",
  "arguments": {
    "url": "https://example.com",
    "checks": ["https", "csp", "hsts"]
  }
}
```

### Resource Optimization

```javascript
{
  "tool": "pharos_resources",
  "arguments": {
    "url": "https://example.com",
    "minSize": 1024
  }
}
```

### Performance Budget

```javascript
{
  "tool": "pharos_performance",
  "arguments": {
    "url": "https://example.com",
    "budget": {
      "performanceScore": 90,
      "largestContentfulPaint": 2500
    }
  }
}
```

## 🎯 Use Cases

- **Performance Monitoring**: Automated performance tracking and Core Web Vitals monitoring
- **Accessibility Compliance**: WCAG 2.1 compliance checking and remediation guidance
- **SEO Optimization**: Technical SEO audits and search engine optimization recommendations
- **Security Assessment**: Vulnerability scanning and security best practice validation
- **Resource Optimization**: Bundle analysis and optimization opportunity identification
- **Performance Budgets**: Automated performance budget monitoring and alerting
- **CI/CD Integration**: Automated quality gates and performance regression detection

## 🏗️ Architecture

The server is built using:

- **[Bun](https://bun.sh)**: Runtime, test runner, and HTTP server
- **[Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)**: For MCP server implementation
- **[Google Lighthouse](https://github.com/GoogleChrome/lighthouse)**: For web performance auditing
- **[Chrome Launcher](https://github.com/GoogleChrome/chrome-launcher)**: For browser automation
- **TypeScript**: For type safety and better developer experience
- **Zod**: For runtime schema validation

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🔒 Security

To report a security vulnerability, please open a [GitHub Security Advisory](https://github.com/bobharing/pharos-mcp/security/advisories/new) rather than a public issue.

## 📞 Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/bobharing/pharos-mcp/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/bobharing/pharos-mcp/discussions)

## 🙏 Acknowledgments

- Google Lighthouse team for the excellent auditing engine
- Anthropic for the Model Context Protocol specification
- The open source community for continuous inspiration and contributions

---

Built on [lighthouse-mcp-server](https://github.com/danielsogl/lighthouse-mcp-server) by [Daniel Sogl](https://github.com/danielsogl)
