import { IPaymentProviderAdapter } from './payment-provider.interface';
import { MockProviderAdapter } from './adapters/mock-provider.adapter';
import { StandardProviderAdapter } from './adapters/standard-provider.adapter';

export class PaymentProviderFactory {
  private static mockInstance = new MockProviderAdapter();

  public static getProvider(providerName?: string): IPaymentProviderAdapter {
    const activeProvider = (providerName || process.env.PAYMENT_PROVIDER || 'mock').toLowerCase().trim();

    if (activeProvider === 'mock' || activeProvider === 'test' || activeProvider === '') {
      return PaymentProviderFactory.mockInstance;
    }

    return new StandardProviderAdapter(activeProvider);
  }
}
