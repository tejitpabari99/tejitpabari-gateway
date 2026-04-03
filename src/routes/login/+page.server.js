import { redirect, fail } from '@sveltejs/kit';
import { signRole } from '$lib/auth.js';

export const actions = {
  login: async ({ request, cookies }) => {
    const data = await request.formData();
    const password = data.get('password');

    if (password !== process.env.GATEWAY_PASSWORD) {
      return fail(400, { error: 'Incorrect password.' });
    }

    cookies.set('cc_session', signRole('admin'), {
      path: '/',
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60,
      sameSite: 'lax'
    });

    throw redirect(302, '/');
  }
};
