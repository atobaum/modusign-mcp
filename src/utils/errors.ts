export class ModusignApiError extends Error {
  public readonly statusCode: number;
  public readonly errorBody: unknown;

  constructor(statusCode: number, errorBody: unknown) {
    const message = ModusignApiError.formatMessage(statusCode, errorBody);
    super(message);
    this.name = 'ModusignApiError';
    this.statusCode = statusCode;
    this.errorBody = errorBody;
  }

  private static formatMessage(statusCode: number, errorBody: unknown): string {
    const statusMessages: Record<number, string> = {
      400: 'Bad Request - Validation failed',
      401: 'Unauthorized - Invalid email or API key',
      403: 'Forbidden - Insufficient permissions or usage limit exceeded',
      404: 'Not Found - Resource does not exist',
      429: 'Rate Limit Exceeded',
    };

    const prefix = statusMessages[statusCode] || `HTTP ${statusCode}`;

    if (
      typeof errorBody === 'object' &&
      errorBody !== null &&
      'message' in errorBody
    ) {
      return `${prefix}: ${(errorBody as { message: string }).message}`;
    }

    return `${prefix}: ${JSON.stringify(errorBody)}`;
  }
}
