export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = 'API_ERROR',
    public readonly requestId?: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isRetryable() {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500
      || this.code === 'IDEMPOTENCY_EM_PROCESSAMENTO';
  }
}

export const toUserMessage = (error: unknown) => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Não foi possível concluir a operação.';
};
