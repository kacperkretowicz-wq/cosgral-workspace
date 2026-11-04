// Isolated acceptance fixture only. This actor injection is never mounted in production.
import express from 'express';
import { createDb, companies } from '@paperclipai/db';
import { startEmbeddedPostgresTestDatabase } from '../src/__tests__/helpers/embedded-postgres.js';
import { agentRoutes } from '../src/routes/agents.js';
import { projectRoutes } from '../src/routes/projects.js';
import { companyRoutes } from '../src/routes/companies.js';
import { errorHandler } from '../src/middleware/error-handler.js';
const database = await startEmbeddedPostgresTestDatabase('cosgral16-live-');
const db = createDb(database.connectionString);
const app = express(); app.use(express.json());
app.use(async (req, _res, next) => {
 const actor = req.header('x-cosgral-fixture-actor');
 const ids = (await db.select({ id: companies.id }).from(companies)).map(c => c.id);
 req.actor = actor === 'viewer' ? { type: 'board', source: 'session', userId: 'fixture-viewer', companyIds: ids, memberships: ids.map(companyId => ({ companyId, status: 'active', membershipRole: 'viewer' })) }
 : actor === 'outsider' ? { type: 'board', source: 'session', userId: 'fixture-outsider', companyIds: [], memberships: [] }
 : { type: 'board', source: 'local_implicit', isInstanceAdmin: true };
 next();
});
app.use('/api/companies', companyRoutes(db)); app.use('/api', projectRoutes(db)); app.use('/api', agentRoutes(db));
app.use(errorHandler);
const server = app.listen(3197, '127.0.0.1', () => console.log('COSGRAL16_READY'));
let closing = false;
async function close() { if (closing) return; closing = true; server.close(); await db.$client.end(); await database.cleanup(); process.exit(0); }
process.once('SIGTERM', () => void close()); process.once('SIGINT', () => void close());
