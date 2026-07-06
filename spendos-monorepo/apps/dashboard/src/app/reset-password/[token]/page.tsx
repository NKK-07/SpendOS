import { redirect } from 'next/navigation';

export default function ResetPasswordTokenPage({ params }: { params: { token: string } }) {
  redirect(`/reset-password?token=${params.token}`);
}
