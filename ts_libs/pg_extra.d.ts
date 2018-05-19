/// <reference path="./pg.d.ts" />

// @ts-ignore
declare module pg {
  interface QueryArrayResult {
    time: number
  }

  class ClientExt extends Client {
    native: any
    _activeQuery: Query
    activeQuery: Query
    processID: number
  }
}

interface ConnectionOptions {
  host?: string
  port?: string
  database?: string
  user?: string
  password?: string
  query?: string
  auto_connect?: boolean
}

interface HistoryRecord {
  sql: string
  date: Date
  state: string
  time: number
  error?: Error
}
