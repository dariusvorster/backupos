export * from './types'
export { PostgresHook }    from './postgres'
export { MySQLHook }       from './mysql'
export { RedisHook }       from './redis'
export { SQLiteHook }      from './sqlite'
export { MongoDBHook }     from './mongodb'
export { InfluxDBHook }    from './influxdb'
export { CustomShellHook } from './custom-shell'

import type { AppHook, AppType } from './types'
import { PostgresHook }    from './postgres'
import { MySQLHook }       from './mysql'
import { RedisHook }       from './redis'
import { SQLiteHook }      from './sqlite'
import { MongoDBHook }     from './mongodb'
import { InfluxDBHook }    from './influxdb'
import { CustomShellHook } from './custom-shell'

export const APP_HOOK_REGISTRY: Record<AppType, AppHook> = {
  postgres:     new PostgresHook(),
  mysql:        new MySQLHook(),
  mariadb:      new MySQLHook(),   // same implementation as MySQL
  mongodb:      new MongoDBHook(),
  redis:        new RedisHook(),
  sqlite:       new SQLiteHook(),
  influxdb:     new InfluxDBHook(),
  custom_shell: new CustomShellHook(),
}
