import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Plugin } from 'vite';
import { validateProfiles, type GlassProfiles, type GlassSettings } from '../src/content/glassSchema';

export function glassStudioServer(): Plugin {
  return {
    name: 'local-glass-studio', apply: 'serve',
    configureServer(server) {
      const path = resolve(server.config.root, 'src/content/glass-settings.json');
      const read = async () => JSON.parse(await readFile(path, 'utf8')) as GlassSettings;
      let pendingWrite = Promise.resolve();
      let preview: GlassProfiles | undefined;
      server.ws.on('glass:preview', data => {
        try { validateProfiles(data); preview = data; server.ws.send({ type: 'custom', event: 'glass:preview', data }); } catch { /* Invalid preview is ignored. */ }
      });
      server.ws.on('glass:ready', (_, client) => {
        if (preview) client.send({ type: 'custom', event: 'glass:preview', data: preview });
      });
      server.middlewares.use('/__glass/api/settings', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        const reply = (status: number, data: unknown) => { res.statusCode = status; res.end(JSON.stringify(data)); };
        const address = req.socket.remoteAddress;
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address || '')) return reply(403, { error: '仅限本机' });
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return reply(403, { error: '来源不允许' });
        try {
          if (req.method === 'GET') return reply(200, await read());
          if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) return reply(400, { error: '需要 JSON 请求' });
          let body = '';
          for await (const chunk of req) { body += chunk; if (body.length > 256_000) throw new Error('预设过大'); }
          const request = JSON.parse(body);
          const operation = async () => {
            const state = await read();
            if (request.action === 'saveDefault' || request.action === 'savePreset') {
              validateProfiles(request.profiles);
              if (request.action === 'saveDefault') state.profiles = request.profiles;
              else {
                const name = String(request.name || '').trim();
                if (!name || name.length > 60) throw new Error('预设名称需要 1–60 个字符');
                state.presets.push({ id: randomUUID(), name, profiles: request.profiles });
                state.profiles = request.profiles;
              }
            } else if (request.action === 'deletePreset') {
              const preset = state.presets.find(p => p.id === request.id);
              if (!preset || preset.locked) throw new Error('此预设不能删除');
              state.presets = state.presets.filter(p => p.id !== request.id);
            } else throw new Error('未知操作');
            await writeFile(path + '.tmp', JSON.stringify(state, null, 2) + '\n', 'utf8');
            await rename(path + '.tmp', path);
            preview = state.profiles;
            server.ws.send({ type: 'custom', event: 'glass:preview', data: preview });
            reply(200, state);
          };
          const current = pendingWrite.then(operation);
          pendingWrite = current.catch(() => {});
          await current;
        } catch (error) { reply(400, { error: error instanceof Error ? error.message : '保存失败' }); }
      });
    },
  };
}
