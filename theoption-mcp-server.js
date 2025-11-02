#!/usr/bin/env node

/**
 * TheOption MCP Server
 *
 * MCPサーバーとしてTheOption APIへのアクセスを提供します
 * Claude Code等のMCPクライアントから利用可能
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ========================================
// 設定
// ========================================

const CONFIG = {
  apiBase: process.env.THEOPTION_API_BASE || 'https://platformapi.theoption.com/Client.svc',
  sessionStoragePath: process.env.THEOPTION_SESSION_STORAGE || path.join(__dirname, '.session'),
  tradingUrl: 'https://jp.theoption.com/trading',
};

// ========================================
// セッション管理
// ========================================

class SessionManager {
  constructor() {
    this.sessionId = null;
    this.cookies = {};
    this.isLoggedIn = false;
  }

  async loadSession() {
    try {
      const data = await fs.readFile(CONFIG.sessionStoragePath, 'utf-8');
      const session = JSON.parse(data);
      this.sessionId = session.sessionId;
      this.cookies = session.cookies || {};
      this.isLoggedIn = session.isLoggedIn || false;
      return true;
    } catch (error) {
      console.error('セッション読み込み失敗:', error.message);
      return false;
    }
  }

  async saveSession() {
    try {
      const session = {
        sessionId: this.sessionId,
        cookies: this.cookies,
        isLoggedIn: this.isLoggedIn,
        updatedAt: new Date().toISOString(),
      };
      await fs.writeFile(CONFIG.sessionStoragePath, JSON.stringify(session, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('セッション保存失敗:', error.message);
      return false;
    }
  }

  setSession(sessionId, cookies = {}) {
    this.sessionId = sessionId;
    this.cookies = cookies;
    this.isLoggedIn = true;
  }

  clearSession() {
    this.sessionId = null;
    this.cookies = {};
    this.isLoggedIn = false;
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    };

    if (this.sessionId) {
      headers['X-Session-Id'] = this.sessionId;
    }

    if (Object.keys(this.cookies).length > 0) {
      headers['Cookie'] = Object.entries(this.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
    }

    return headers;
  }
}

const sessionManager = new SessionManager();

// ========================================
// API クライアント
// ========================================

class TheOptionAPIClient {
  constructor() {
    this.baseUrl = CONFIG.apiBase;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      ...sessionManager.getHeaders(),
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      return {
        success: response.ok,
        status: response.status,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getCandles(assetId, from, to, detalization = '1m') {
    const params = new URLSearchParams({
      assetId: assetId.toString(),
      from: from.toString(),
      to: to.toString(),
      detalization,
    });

    return this.request(`/GetCandles?${params}`, {
      method: 'GET',
    });
  }

  async getAssets() {
    return this.request('/GetAssets', {
      method: 'GET',
    });
  }

  async getTraderBalance() {
    return this.request('/GetTraderBalance', {
      method: 'GET',
    });
  }
}

const apiClient = new TheOptionAPIClient();

// ========================================
// MCP サーバー
// ========================================

const server = new Server(
  {
    name: 'theoption',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ツール一覧
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_api_info',
        description: 'TheOption APIの基本情報を取得します（エンドポイント、認証状態など）',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_candles',
        description: 'ローソク足データを取得します',
        inputSchema: {
          type: 'object',
          properties: {
            assetId: {
              type: 'number',
              description: 'アセットID (例: 1 = EUR/USD)',
            },
            from: {
              type: 'number',
              description: '開始時刻 (Unix timestamp)',
            },
            to: {
              type: 'number',
              description: '終了時刻 (Unix timestamp)',
            },
            detalization: {
              type: 'string',
              description: '時間足 (1m, 5m, 15m, 30m, 1h, 4h, 1d)',
              enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'],
              default: '1m',
            },
          },
          required: ['assetId', 'from', 'to'],
        },
      },
      {
        name: 'get_assets',
        description: '利用可能な全アセット（通貨ペア）一覧を取得します',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_trader_balance',
        description: 'トレーダーの残高情報を取得します',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'set_session',
        description: 'セッション情報を手動で設定します（ブラウザから取得したセッションIDを使用）',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'セッションID',
            },
            cookies: {
              type: 'object',
              description: 'Cookie情報（オプション）',
              additionalProperties: {
                type: 'string',
              },
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'load_session',
        description: '保存されたセッション情報を読み込みます',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'save_session',
        description: '現在のセッション情報を保存します',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_session_status',
        description: '現在のセッション状態を確認します',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// ツール実行
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_api_info': {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                apiBase: CONFIG.apiBase,
                tradingUrl: CONFIG.tradingUrl,
                isLoggedIn: sessionManager.isLoggedIn,
                hasSession: !!sessionManager.sessionId,
                endpoints: {
                  candles: '/GetCandles',
                  assets: '/GetAssets',
                  balance: '/GetTraderBalance',
                },
                usage: {
                  description: 'まず set_session でセッションIDを設定してから API を利用してください',
                  sessionIdLocation: 'ブラウザのDevTools → Console → localStorage.getItem("sessionId") または MP.sessionId',
                },
              }, null, 2),
            },
          ],
        };
      }

      case 'get_candles': {
        const { assetId, from, to, detalization = '1m' } = args;
        const result = await apiClient.getCandles(assetId, from, to, detalization);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_assets': {
        const result = await apiClient.getAssets();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_trader_balance': {
        const result = await apiClient.getTraderBalance();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'set_session': {
        const { sessionId, cookies = {} } = args;
        sessionManager.setSession(sessionId, cookies);
        await sessionManager.saveSession();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'セッション情報を設定しました',
                sessionId,
                isLoggedIn: sessionManager.isLoggedIn,
              }, null, 2),
            },
          ],
        };
      }

      case 'load_session': {
        const loaded = await sessionManager.loadSession();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: loaded,
                message: loaded ? 'セッション情報を読み込みました' : 'セッションファイルが見つかりません',
                isLoggedIn: sessionManager.isLoggedIn,
                hasSession: !!sessionManager.sessionId,
              }, null, 2),
            },
          ],
        };
      }

      case 'save_session': {
        const saved = await sessionManager.saveSession();

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: saved,
                message: saved ? 'セッション情報を保存しました' : 'セッション保存に失敗しました',
                sessionStoragePath: CONFIG.sessionStoragePath,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_session_status': {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                isLoggedIn: sessionManager.isLoggedIn,
                hasSessionId: !!sessionManager.sessionId,
                sessionId: sessionManager.sessionId ? `${sessionManager.sessionId.substring(0, 10)}...` : null,
                hasCookies: Object.keys(sessionManager.cookies).length > 0,
                cookieCount: Object.keys(sessionManager.cookies).length,
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            tool: name,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// ========================================
// サーバー起動
// ========================================

async function main() {
  // セッション読み込み試行
  await sessionManager.loadSession();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('TheOption MCP Server started');
  console.error(`API Base: ${CONFIG.apiBase}`);
  console.error(`Session Status: ${sessionManager.isLoggedIn ? 'Logged in' : 'Not logged in'}`);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
