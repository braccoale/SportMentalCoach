import { Suspense } from 'react';
import { SignupWizard } from '../signup-wizard';

export default function SignUpPage() {
  return (
    <Suspense>
      <SignupWizard />
    </Suspense>
  );
}
