import { createApp } from './app.ts';

const port = Number(process.env['PORT'] ?? 3000);
const host = process.env['HOST'] ?? '127.0.0.1';

const app = createApp();

const bound = await app.listen(port, host);
console.log(`[troko-server] listening on http://${bound.host}:${bound.port}`);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[troko-server] received ${signal}, shutting down...`);
  await app.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
