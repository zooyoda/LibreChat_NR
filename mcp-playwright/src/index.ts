#!/usr/bin/env node

import { program } from 'commander';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// ИСПРАВЛЕННЫЕ импорты
import { createConnection } from './connection.js';
import { resolveCLIConfig, validateConfig } from './config.js';
import type { CLIOptions, FullConfig } from './config.js';

// Оптимизированный набор инструментов для Amvera
const AMVERA_OPTIMIZED_CAPABILITIES = [
  'core',      // Основные функции браузера
  'wait',      // Ожидание элементов
  'files',     // Базовая работа с файлами
  'network',   // Сетевые запросы
  'console'    // Логи консоли браузера
];

// Оптимизированная конфигурация для Amvera
const AMVERA_CONFIG_OVERRIDES = {
  browser: {
    browserName: 'chromium' as const,
    headless: true,
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
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
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
  private connection: any;

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
      if (this.connection) {
        await this.connection.close();
      }
      await this.server.close();
    } catch (error) {
      console.error('[Playwright MCP] Error during cleanup:', error);
    }
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
              properties: {}
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
        if (!this.connection) {
          this.connection = await createConnection(AMVERA_CONFIG_OVERRIDES, this._contextFactory);
        }

        const result = await this.connection.callTool(name, args);
        
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

  async run(): Promise<void> {
    console.log('[Playwright MCP] Starting Amvera-optimized Playwright MCP server...');
    console.log('[Playwright MCP] Enabled capabilities:', AMVERA_OPTIMIZED_CAPABILITIES.join(', '));
    
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
