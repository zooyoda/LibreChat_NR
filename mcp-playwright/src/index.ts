#!/usr/bin/env node

/**
 * Copyright (c) Microsoft Corporation.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { program } from 'commander';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import debug from 'debug';

// Импорты для mime v4+
import { getType } from 'mime';

// Локальные импорты
import { contextFactory } from './browserContextFactory.js';
import { resolveCLIConfig, validateConfig } from './config.js';
import type { CLIOptions, FullConfig } from './config.js';
import type { BrowserContextFactory } from './browserContextFactory.js';

const debugLogger = debug('pw:mcp:amvera');

// Оптимизированный набор инструментов для Amvera
const AMVERA_OPTIMIZED_CAPABILITIES = [
  'core',      // Основные функции браузера
  'wait',      // Ожидание элементов
  'files',     // Базовая работа с файлами
  'network',   // Сетевые запросы
  'console'    // Логи консоли браузера
];

// Оптимизированная конфигурация для Amvera
const AMVERA_CONFIG_OVERRIDES: Partial<FullConfig> = {
  browser: {
    browserName: 'chromium' as const,
    headless: true,
    isolated: false,
    launchOptions: {
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--memory-pressure-off',
        '--max_old_space_size=512'
      ],
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      headless: true,
      chromiumSandbox: false
    },
    contextOptions: {
      javaScriptEnabled: true,
      acceptDownloads: false,
      viewport: { width: 1024, height: 768 }
    }
  },
  capabilities: AMVERA_OPTIMIZED_CAPABILITIES,
  vision: false,
  outputDir: '/tmp/playwright-mcp-output'
};

class AmveraOptimizedPlaywrightMCP {
  private server: Server;
  private browserContextFactory: BrowserContextFactory | null = null;
  private currentContext: { browserContext: any, close: () => Promise<void> } | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'playwright-mcp-amvera',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[Playwright MCP] Error:', error);
    };

    process.on('SIGINT', async () => {
      console.log('[Playwright MCP] Shutting down gracefully...');
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('[Playwright MCP] Received SIGTERM, shutting down...');
      await this.cleanup();
      process.exit(0);
    });
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.currentContext) {
        await this.currentContext.close();
        this.currentContext = null;
      }
      await this.server.close();
    } catch (error) {
      console.error('[Playwright MCP] Error during cleanup:', error);
    }
  }

  private async getBrowserContext() {
    if (!this.browserContextFactory) {
      // Создаем конфигурацию браузера
      const browserConfig = AMVERA_CONFIG_OVERRIDES.browser!;
      this.browserContextFactory = contextFactory(browserConfig as any);
    }

    if (!this.currentContext) {
      this.currentContext = await this.browserContextFactory.createContext();
    }

    return this.currentContext.browserContext;
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'browser_navigate',
            description: 'Navigate to a URL in the browser',
            inputSchema: {
              type: 'object',
              properties: {
                url: {
                  type: 'string',
                  description: 'The URL to navigate to'
                }
              },
              required: ['url']
            }
          },
          {
            name: 'browser_snapshot',
            description: 'Get accessibility snapshot of the current page',
            inputSchema: {
              type: 'object',
              properties: {
                interactiveOnly: {
                  type: 'boolean',
                  description: 'Only include interactive elements',
                  default: true
                }
              }
            }
          },
          {
            name: 'browser_click',
            description: 'Click an element on the page',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector or accessibility selector'
                }
              },
              required: ['selector']
            }
          },
          {
            name: 'browser_type',
            description: 'Type text into an element',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector or accessibility selector'
                },
                text: {
                  type: 'string',
                  description: 'Text to type'
                }
              },
              required: ['selector', 'text']
            }
          },
          {
            name: 'browser_wait_for',
            description: 'Wait for an element to appear',
            inputSchema: {
              type: 'object',
              properties: {
                selector: {
                  type: 'string',
                  description: 'CSS selector to wait for'
                },
                timeout: {
                  type: 'number',
                  description: 'Timeout in milliseconds',
                  default: 5000
                }
              },
              required: ['selector']
            }
          },
          {
            name: 'browser_close',
            description: 'Close the browser',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        debugLogger(`Executing tool: ${name}`, args);
        const result = await this.executeTool(name, args);
        
        return {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error(`[Playwright MCP] Tool "${name}" failed:`, error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`
            }
          ],
          isError: true
        };
      }
    });
  }

  private async executeTool(toolName: string, args: any): Promise<string> {
    const browserContext = await this.getBrowserContext();
    const page = browserContext.pages()[0] || await browserContext.newPage();

    switch (toolName) {
      case 'browser_navigate':
        await page.goto(args.url, { waitUntil: 'domcontentloaded' });
        return `Successfully navigated to ${args.url}`;

      case 'browser_snapshot':
        const snapshot = await page.locator('body').innerHTML();
        return `Page snapshot:\n${snapshot.substring(0, 2000)}${snapshot.length > 2000 ? '...' : ''}`;

      case 'browser_click':
        await page.locator(args.selector).click();
        return `Successfully clicked element: ${args.selector}`;

      case 'browser_type':
        await page.locator(args.selector).fill(args.text);
        return `Successfully typed "${args.text}" into element: ${args.selector}`;

      case 'browser_wait_for':
        await page.locator(args.selector).waitFor({ 
          timeout: args.timeout || 5000 
        });
        return `Element appeared: ${args.selector}`;

      case 'browser_close':
        if (this.currentContext) {
          await this.currentContext.close();
          this.currentContext = null;
        }
        return 'Browser closed successfully';

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  async run(): Promise<void> {
    console.log('[Playwright MCP] Starting Amvera-optimized Playwright MCP server...');
    console.log('[Playwright MCP] Enabled capabilities:', AMVERA_OPTIMIZED_CAPABILITIES.join(', '));
    console.log('[Playwright MCP] Using system Chromium:', process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser');
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.log('[Playwright MCP] Server running on stdio');
  }
}

// CLI программа
program
  .name('playwright-mcp-amvera')
  .description('Amvera-optimized Playwright MCP server')
  .version('0.1.0')
  .option('--headless', 'Run in headless mode (default: true)', true)
  .option('--browser <browser>', 'Browser to use', 'chromium')
  .action(async (options) => {
    try {
      const mcpServer = new AmveraOptimizedPlaywrightMCP();
      await mcpServer.run();
    } catch (error) {
      console.error('[Playwright MCP] Failed to start server:', error);
      process.exit(1);
    }
  });

// Запуск если вызывается напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}

export { AmveraOptimizedPlaywrightMCP };
