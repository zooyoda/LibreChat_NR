#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

class GitHubMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'github-api-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
      userAgent: 'LibreChat-GitHub-MCP/1.0.0',
    });

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Существующие инструменты
        {
          name: 'github_list_repos',
          description: 'List repositories for the authenticated user',
          inputSchema: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['all', 'owner', 'public', 'private', 'member'], default: 'all' },
              sort: { type: 'string', enum: ['created', 'updated', 'pushed', 'full_name'], default: 'updated' },
              per_page: { type: 'number', default: 30, maximum: 100 },
            },
          },
        },
        {
          name: 'github_create_repo',
          description: 'Create a new repository',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Repository name' },
              description: { type: 'string', description: 'Repository description' },
              private: { type: 'boolean', default: false },
              auto_init: { type: 'boolean', default: true },
            },
            required: ['name'],
          },
        },
        {
          name: 'github_list_issues',
          description: 'List issues for a repository',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
              per_page: { type: 'number', default: 30, maximum: 100 },
            },
            required: ['owner', 'repo'],
          },
        },
        {
          name: 'github_create_issue',
          description: 'Create a new issue in a repository',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              title: { type: 'string', description: 'Issue title' },
              body: { type: 'string', description: 'Issue body' },
            },
            required: ['owner', 'repo', 'title'],
          },
        },
        // НОВЫЕ инструменты для работы с файлами
        {
          name: 'github_get_file_content',
          description: 'Get the content of a file from a repository',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              path: { type: 'string', description: 'File path' },
              ref: { type: 'string', description: 'Branch, tag, or commit SHA (default: main branch)' },
            },
            required: ['owner', 'repo', 'path'],
          },
        },
        {
          name: 'github_list_directory',
          description: 'List contents of a directory in a repository',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              path: { type: 'string', description: 'Directory path (empty for root)', default: '' },
              ref: { type: 'string', description: 'Branch, tag, or commit SHA (default: main branch)' },
            },
            required: ['owner', 'repo'],
          },
        },
        {
          name: 'github_create_or_update_file',
          description: 'Create or update a file in a repository',
          inputSchema: {
            type: 'object',
            properties: {
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              path: { type: 'string', description: 'File path' },
              message: { type: 'string', description: 'Commit message' },
              content: { type: 'string', description: 'File content (will be base64 encoded)' },
              branch: { type: 'string', description: 'Branch name (default: main)' },
              sha: { type: 'string', description: 'SHA of file being replaced (for updates)' },
            },
            required: ['owner', 'repo', 'path', 'message', 'content'],
          },
        },
        {
          name: 'github_search_code',
          description: 'Search for code in a repository',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
              owner: { type: 'string', description: 'Repository owner' },
              repo: { type: 'string', description: 'Repository name' },
              per_page: { type: 'number', default: 30, maximum: 100 },
            },
            required: ['query', 'owner', 'repo'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          // Существующие обработчики
          case 'github_list_repos':
            return await this.listRepositories(args);
          case 'github_create_repo':
            return await this.createRepository(args);
          case 'github_list_issues':
            return await this.listIssues(args);
          case 'github_create_issue':
            return await this.createIssue(args);
          // НОВЫЕ обработчики для файлов
          case 'github_get_file_content':
            return await this.getFileContent(args);
          case 'github_list_directory':
            return await this.listDirectory(args);
          case 'github_create_or_update_file':
            return await this.createOrUpdateFile(args);
          case 'github_search_code':
            return await this.searchCode(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });
  }

  // Существующие методы остаются без изменений
  async listRepositories(args) {
    const { type = 'all', sort = 'updated', per_page = 30 } = args;
    const response = await this.octokit.rest.repos.listForAuthenticatedUser({ type, sort, per_page });
    const repos = response.data.map(repo => `- ${repo.full_name} (${repo.html_url})`).join('\n');
    return { content: [{ type: 'text', text: `Repositories:\n${repos}` }] };
  }

  async createRepository(args) {
    const { name, description, private: isPrivate = false, auto_init = true } = args;
    const response = await this.octokit.rest.repos.createForAuthenticatedUser({
      name, description, private: isPrivate, auto_init,
    });
    const repo = response.data;
    return { content: [{ type: 'text', text: `Created: ${repo.full_name} (${repo.html_url})` }] };
  }

  async listIssues(args) {
    const { owner, repo, state = 'open', per_page = 30 } = args;
    const response = await this.octokit.rest.issues.listForRepo({ owner, repo, state, per_page });
    const issues = response.data.map(issue => `#${issue.number} ${issue.title} (${issue.html_url})`).join('\n');
    return { content: [{ type: 'text', text: `Issues for ${owner}/${repo}:\n${issues}` }] };
  }

  async createIssue(args) {
    const { owner, repo, title, body } = args;
    const response = await this.octokit.rest.issues.create({ owner, repo, title, body });
    const issue = response.data;
    return { content: [{ type: 'text', text: `Created issue #${issue.number}: ${issue.title} (${issue.html_url})` }] };
  }

  // НОВЫЕ методы для работы с файлами
  async getFileContent(args) {
    const { owner, repo, path, ref } = args;
    const params = { owner, repo, path };
    if (ref) params.ref = ref;

    const response = await this.octokit.rest.repos.getContent(params);
    
    if (Array.isArray(response.data)) {
      return { content: [{ type: 'text', text: 'Error: Path is a directory, not a file' }], isError: true };
    }

    if (response.data.type !== 'file') {
      return { content: [{ type: 'text', text: 'Error: Path is not a file' }], isError: true };
    }

    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    return { 
      content: [{ 
        type: 'text', 
        text: `File: ${path}\nSize: ${response.data.size} bytes\nSHA: ${response.data.sha}\n\nContent:\n${content}` 
      }] 
    };
  }

  async listDirectory(args) {
    const { owner, repo, path = '', ref } = args;
    const params = { owner, repo, path };
    if (ref) params.ref = ref;

    const response = await this.octokit.rest.repos.getContent(params);
    
    if (!Array.isArray(response.data)) {
      return { content: [{ type: 'text', text: 'Error: Path is a file, not a directory' }], isError: true };
    }

    const items = response.data.map(item => {
      const type = item.type === 'dir' ? '📁' : '📄';
      return `${type} ${item.name} (${item.type})`;
    }).join('\n');

    return { 
      content: [{ 
        type: 'text', 
        text: `Directory contents for ${owner}/${repo}${path ? `/${path}` : ''}:\n${items}` 
      }] 
    };
  }

  async createOrUpdateFile(args) {
    const { owner, repo, path, message, content, branch, sha } = args;
    const params = {
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString('base64'),
    };

    if (branch) params.branch = branch;
    if (sha) params.sha = sha;

    const response = await this.octokit.rest.repos.createOrUpdateFileContents(params);
    const commit = response.data.commit;
    
    return { 
      content: [{ 
        type: 'text', 
        text: `File ${sha ? 'updated' : 'created'}: ${path}\nCommit: ${commit.sha}\nMessage: ${message}` 
      }] 
    };
  }

  async searchCode(args) {
    const { query, owner, repo, per_page = 30 } = args;
    const searchQuery = `${query} repo:${owner}/${repo}`;
    
    const response = await this.octokit.rest.search.code({
      q: searchQuery,
      per_page,
    });

    if (response.data.total_count === 0) {
      return { content: [{ type: 'text', text: `No code found for query: ${query}` }] };
    }

    const results = response.data.items.map(item => 
      `📄 ${item.name} (${item.path})\n   ${item.html_url}`
    ).join('\n\n');

    return { 
      content: [{ 
        type: 'text', 
        text: `Code search results for "${query}" in ${owner}/${repo}:\nTotal: ${response.data.total_count}\n\n${results}` 
      }] 
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('GitHub MCP Server running on stdio');
  }
}

const server = new GitHubMCPServer();
server.run().catch(console.error);
