export class McpError extends Error {
  code: string;
  details?: Record<string, any>;

  constructor(code: string, message: string, details?: Record<string, any>) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'McpError';
  }
}

export enum ErrorCode {
  InternalError = 'INTERNAL_ERROR',
  InvalidRequest = 'INVALID_REQUEST',
  MethodNotFound = 'METHOD_NOT_FOUND',
  InvalidParams = 'INVALID_PARAMS',
  AuthenticationRequired = 'AUTHENTICATION_REQUIRED',
  AuthenticationFailed = 'AUTHENTICATION_FAILED',
  PermissionDenied = 'PERMISSION_DENIED',
  ResourceNotFound = 'RESOURCE_NOT_FOUND',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  ParseError = 'PARSE_ERROR'
}

export class Server {
  private config: any;
  public onerror: ((error: Error) => void) | undefined;

  constructor(config: any, options?: any) {
    this.config = config;
  }

  async connect(transport: any): Promise<void> {
    // Mock implementation
    return Promise.resolve();
  }

  async close(): Promise<void> {
    // Mock implementation
    return Promise.resolve();
  }

  setRequestHandler(schema: any, handler: any): void {
    // Mock implementation
  }
}
