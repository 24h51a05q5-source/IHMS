'use client';

import { useEffect } from 'react';
import { CashfreePaymentSettings } from '@/components/settings/cashfree-payment-settings';
import { useAuth } from '@/lib/auth/auth-context';

export default function PaymentGatewaySettingsPage() {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role === 'WARDEN') {
      window.location.href = '/warden/settings';
    }
  }, [user]);

  if (user?.role === 'WARDEN') return null;

  return <CashfreePaymentSettings showHeader={true} />;
}
