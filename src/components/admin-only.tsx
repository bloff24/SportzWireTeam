import type { ReactNode } from 'react';

import { Empty, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** UI guard for admin screens. (The database enforces the real rules.) */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <Screen>
        <Empty title="Admins only" />
      </Screen>
    );
  }
  return <>{children}</>;
}
