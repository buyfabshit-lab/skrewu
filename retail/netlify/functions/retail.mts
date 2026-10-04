import { createApp } from '../../server/app.mjs';
import { production } from '../../server/production.mjs';

export default async (request: Request) => {
  const app = createApp(production((name: string) => Netlify.env.get(name)));
  return app(request);
};
export const config = { path: '/api/retail/*' };
