export const LANDING_PAGE = (url: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stock MCP Server</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&family=JetBrains+Mono&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #6366f1;
            --secondary: #a855f7;
            --bg: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --text: #f1f5f9;
            --text-muted: #94a3b8;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Outfit', sans-serif;
            background: radial-gradient(circle at top right, #1e1b4b, #0f172a);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            max-width: 600px;
            width: 100%;
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 40px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            animation: fadeIn 0.8s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .header { text-align: center; margin-bottom: 32px; }
        .badge {
            display: inline-block;
            padding: 6px 12px;
            background: rgba(34, 197, 94, 0.2);
            color: #4ade80;
            border-radius: 99px;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 16px;
        }
        h1 { font-size: 32px; font-weight: 600; margin-bottom: 8px; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p { color: var(--text-muted); line-height: 1.6; margin-bottom: 24px; }
        .config-box {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 16px;
            padding: 24px;
            margin-top: 32px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .config-title { font-size: 14px; font-weight: 600; color: var(--text-muted); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
        pre {
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
            color: #4ade80;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .footer { margin-top: 32px; text-align: center; font-size: 12px; color: var(--text-muted); }
        .footer a { color: var(--primary); text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="badge">● Online</div>
            <h1>Stock MCP Server</h1>
            <p>A high-performance Model Context Protocol server for real-time stock and ETF analysis.</p>
        </div>
        <div class="config-box">
            <div class="config-title">Connection URL</div>
            <pre>${url}</pre>
        </div>
        <div class="config-box">
            <div class="config-title">mcp_config.json snippet</div>
            <pre>{
  "stock-mcp": {
    "type": "streamable-http",
    "url": "${url}"
  }
}</pre>
        </div>
        <div class="footer">
            Powered by <a href="https://developers.cloudflare.com/workers/runtime-apis/mcp/">Cloudflare Workers</a>
        </div>
    </div>
</body>
</html>
`;
