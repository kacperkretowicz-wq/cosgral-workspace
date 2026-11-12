import { OpenBotDatabase } from "../openbot-database";

const openDatabases: OpenBotDatabase[] = [];

/**
 * COSGRAL (test support): a database that {@link closeTestDatabases} closes again.
 * Windows cannot delete a folder while SQLite still holds `openbot.db` open (EBUSY).
 */
export function testDatabase(userDataPath: string): OpenBotDatabase {
  const database = new OpenBotDatabase(userDataPath);
  openDatabases.push(database);
  return database;
}

export function closeTestDatabases(): void {
  for (const database of openDatabases.splice(0)) database.close();
}
