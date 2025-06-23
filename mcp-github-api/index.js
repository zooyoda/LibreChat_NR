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
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          case 'github_list_repos':
            return await this.listRepositories(args);
          case 'github_create_repo':
            return await this.createRepository(args);
          case 'github_list_issues':
            return await this.listIssues(args);
          case 'github_create_issue':
            return await this.createIssue(args);
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('GitHub MCP Server running on stdio');
  }
}

const server = new GitHubMCPServer();
server.run().catch(console.error);
