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
import { createConnection } from './lib/index.js';
import { resolveCLIConfig, validateConfig } from './lib/config.js';
import type { CLIOptions, FullConfig } from './lib/config.js';

// Оптимизированный набор инструментов для Amvera
const AMVERA_OPTIMIZED_CAPABILITIES = [
  'core',      // Основные функции браузера (navigate, click, type)
  'wait',      // Ожидание элементов
  'files',     // Базовая работа с файлами
  'network',   // Сетевые запросы (для отладки)
  'console'    // Логи консоли браузера
  // ИСКЛЮЧЕНЫ для экономии ресурсов:
  // 'tabs' - управление вкладками
  // 'pdf' - генерация PDF (ресурсоемко)
  // 'vision' - скриншоты и визуальное взаимодействие
  // 'testing' - инструменты тестирования
  // 'screenshot' - создание скриншотов
];

// Оптимизированная конфигурация для Amvera
const AMVERA_CONFIG_OVERRIDES = {
  browser: {
    browserName: 'chromium' as const,
    headless: true,
    launchOptions: {
      // Оптимизация для ограниченных ресурсов
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--memory-pressure-off',
        '--max_old_space_size=512' // Ограничение памяти Node.js
      ],
      // Использование системного Chromium
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
    },
    contextOptions: {
      // Отключаем тяжелые функции
      javaScriptEnabled: true,
      acceptDownloads: false,
      // Минимальный viewport для экономии памяти
      viewport: { width: 1024, height: 768 }
    }
  },
  // Ограниченный набор возможностей
  capabilities: AMVERA_OPTIMIZED_CAPABILITIES,
  // Принудительно используем snapshot mode (легче чем vision)
  vision: false,
  // Ограничиваем размер output директории
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
    // Graceful shutdown для Amvera
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
    // Список доступных инструментов (оптимизированный)
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

    // Обработчик вызовов инструментов
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (!this.connection) {
          // Создаем подключение с оптимизированной конфигурацией
          this.connection = await createConnection(AMVERA_CONFIG_OVERRIDES);
        }

        // Проксируем вызовы к реальному Playwright MCP
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
