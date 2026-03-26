import { redirect } from '@sveltejs/kit';

export function GET({ cookies }) {
  cookies.delete('cc_session', { path: '/' });
  throw redirect(302, '/login');
}
