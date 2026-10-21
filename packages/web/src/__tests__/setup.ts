import { expect } from 'vitest';

expect.extend({
  toBeInTheDocument(received: any) {
    const pass = received !== null && received !== undefined && (typeof received.isConnected === 'boolean' ? received.isConnected : true);
    return {
      pass,
      message: () =>
        pass
          ? `expected element not to be in document`
          : `expected element to be in document, but it was ${received}`,
    };
  },
});
