// !/usr/bin/env node

/**
 * Module dependencies.
 */

import debug from 'debug'
import http from 'http'
import app from '../app.js'

debug('Project_name:server')

/**
 * Create HTTP server.
 */

const server = http.createServer(app)

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  const p = parseInt(val, 10)

  if (typeof p === 'number') {
    // named pipe
    return val
  }

  if (p >= 0) {
    // port number
    return p
  }

  return false
}

/**
 * Get port from environment and store in Express.
 */

const port = normalizePort(process.env.PORT || '3000')
app.set('port', port)

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error
  }

  const bind = typeof port === 'string'
    ? `Pipe ${port}`
    : `Port ${port}`

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`)
      process.exit(1)
      break
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`)
      process.exit(1)
      break
    default:
      throw error
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  const addr = server.address()
  const bind = typeof addr === 'string'
    ? `pipe ${addr}`
    : `port ${addr.port}`
  debug(`Listening on ${bind}`)
}

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port, () => {
  console.log('\x1b[33m%s\x1b[0m', `api port: ${port}`) // yellow
})
server.on('error', onError)
server.on('listening', onListening)
