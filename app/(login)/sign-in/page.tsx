import { Suspense } from 'react';
import { Login } from '../login';
import { DemoAccounts } from '@/components/demo-accounts';

export default function SignInPage() {
  return (
    <Suspense>
      <Login mode="signin" />
      <div className="mx-auto -mt-8 w-full max-w-md px-4 pb-12 sm:px-6 lg:px-8">
        <DemoAccounts />
      </div>
    </Suspense>
  );
}
