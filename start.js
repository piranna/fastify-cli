#! /usr/bin/env node

'use strict'

const path = require('path')
const fs = require('fs')
const assert = require('assert')

const updateNotifier = require('update-notifier')
const minimist = require('minimist')
const PinoColada = require('pino-colada')
const pump = require('pump')
const resolveFrom = require('resolve-from')
let Fastify = null
let fastifyPackageJSON = null

function loadModules (opts) {
  try {
    const basedir = path.resolve(process.cwd(), opts._[0])

    Fastify = require(resolveFrom.silent(basedir, 'fastify') || 'fastify')
    fastifyPackageJSON = require(resolveFrom.silent(basedir, 'fastify/package.json') || 'fastify/package.json')
  } catch (e) {
    module.exports.stop(e)
  }
}

function showHelp () {
  console.log(fs.readFileSync(path.join(__dirname, 'help', 'start.txt'), 'utf8'))
  return module.exports.stop()
}

function start (opts) {
  if (opts.help) {
    return showHelp()
  }

  if (opts._.length !== 1) {
    console.error('Error: Missing the required file parameter\n')
    return showHelp()
  }

  loadModules(opts)

  const notifier = updateNotifier({
    pkg: {
      name: 'fastify',
      version: fastifyPackageJSON.version
    },
    updateCheckInterval: 1000 * 60 * 60 * 24 * 7 // 1 week
  })

  notifier.notify({
    isGlobal: false,
    defer: false
  })

  return runFastify(opts)
}

function stop (error) {
  if (error) {
    console.log(error)
    process.exit(1)
  }
  process.exit()
}

function runFastify (opts) {
  opts = Object.assign(readEnv(), opts)
  loadModules(opts)

  var file = null
  try {
    file = require(path.resolve(process.cwd(), opts._[0]))
  } catch (e) {
    return module.exports.stop(e)
  }

  if (file.length !== 3 && file.constructor.name === 'Function') {
    return module.exports.stop(new Error('Plugin function should contain 3 arguments. Refer to ' +
                    'documentation for more information.'))
  }
  if (file.length !== 2 && file.constructor.name === 'AsyncFunction') {
    return module.exports.stop(new Error('Async/Await plugin function should contain 2 arguments.' +
    'Refer to documentation for more information.'))
  }

  const options = {
    logger: {
      level: opts['log-level']
    }
  }

  if (opts['body-limit']) {
    options.bodyLimit = opts['body-limit']
  }

  if (opts['pretty-logs']) {
    const pinoColada = PinoColada()
    options.logger.stream = pinoColada
    pump(pinoColada, process.stdout, assert.ifError)
  }

  const fastify = Fastify(opts.options ? Object.assign(options, file.options) : options)

  const pluginOptions = {}
  if (opts.prefix) {
    pluginOptions.prefix = opts.prefix
  }

  fastify.register(file, pluginOptions, assert.ifError)

  if (opts.address) {
    fastify.listen(opts.port, opts.address, assert.ifError)
  } else if (opts.socket) {
    fastify.listen(opts.socket, assert.ifError)
  } else {
    fastify.listen(opts.port, assert.ifError)
  }

  return fastify
}

function cli (args) {
  start(minimist(args, {
    integer: ['port', 'body-limit'],
    boolean: ['pretty-logs', 'options'],
    string: ['log-level', 'address'],
    alias: {
      port: 'p',
      socket: 's',
      help: 'h',
      options: 'o',
      address: 'a',
      prefix: 'r',
      'log-level': 'l',
      'pretty-logs': 'P'
    },
    default: {
      port: 3000,
      'log-level': 'fatal'
    }
  }))
}

function readEnv () {
  return {
    port: process.env.FASTIFY_PORT,
    socket: process.env.FASTIFY_SOCKET,
    options: process.env.FASTIFY_OPTIONS,
    address: process.env.FASTIFY_ADDRESS,
    prefix: process.env.FASTIFY_PREFIX,
    'log-level': process.env.FASTIFY_LOG_LEVEL,
    'pretty-logs': process.env.FASTIFY_PRETTY_LOGS,
    'body-limit': process.env.FASTIFT_BODY_LIMIT
  }
}

module.exports = { start, stop, runFastify, cli }

if (require.main === module) {
  cli(process.argv.slice(2))
}
