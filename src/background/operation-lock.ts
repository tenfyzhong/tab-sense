export class OperationBusyError extends Error {
  constructor() {
    super('Another tab operation is already running');
    this.name = 'OperationBusyError';
  }
}

export class OperationLock {
  private running = false;

  get busy(): boolean {
    return this.running;
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.running) {
      throw new OperationBusyError();
    }

    this.running = true;
    try {
      return await operation();
    } finally {
      this.running = false;
    }
  }
}
