#!/usr/bin/env node

var path = require('path')
var archiver = require('hypercore-archiver')
var swarm = require('hypercore-archiver/swarm')
var mkdirp = require('mkdirp')
var minimist = require('minimist')
var pump = require('pump')
var prettyBytes = require('pretty-bytes')
var prettyTime = require('pretty-time')
var extend = require('xtend')
var version = require('./package').version
var archiverVersion = require('hypercore-archiver/package').version
var wire = require('wire-bot-sdk-node')
  
var argv = minimist(process.argv.slice(2), {
  alias: {
    cwd: 'd'
  },
  default: {
    cwd: 'hypercore-archiver',
    auth: process.env.WIREBOTAUTH
  }
})

mkdirp.sync(argv.cwd)

var started = process.hrtime()
var ar = archiver(argv.cwd)
var server = swarm(ar)
var client = null
var pending = {}

ar.on('sync', archiveSync)
ar.on('changes', function () {
  console.log('Changes feed available at', ar.changes.key.toString('hex'))
})
ar.on('remove', function (feed) {
  console.log('Removing', feed.key.toString('hex'))
})
ar.on('add', function (feed) {
  console.log('Adding', feed.key.toString('hex'))
})

var bot

wire.createService({
  key: argv.key,
  cert: argv.cert,
  storePath: path.join(__dirname, 'store'),
  auth: argv.auth,
}, (newBot) => {
  bot = newBot
  console.log(`Bot instance created ${bot.botID}`)
  bot.on('message', (from, message) => {
    var msg = message.text.content
    processMessage(msg)
  })
  bot.on('join', (members, conversation) => {
    console.log(`New members ${members} joined conversation ${conversation.id}`)
  })
  bot.on('leave', (members, conversation) => {
    console.log(`Members ${members} have left conversation ${conversation.id}`)
  })
  bot.on('rename', (name, conversation) => {
    console.log(`Conversation ${conversation.id} renamed to ${name}`)
  })
})

function processMessage (message) {
  var op = parse(message)
  if (!op) return
  var key = op.key
  switch (op.command) {
    case 'track':
      sendMessage(new Error('TODO: Not implemented in hypercore-archiver yet. PR please =).'))
      return
    case 'add':
      pending[key] = true
      ar.add(new Buffer(key, 'hex'), function (err) {
        if (err) return sendMessage(err)
        sendMessage(null, 'Adding ' + key)
      })
      return
    case 'rm':
    case 'remove':
      if (pending[key]) delete pending[key]
      ar.remove(new Buffer(key, 'hex'), function (err) {
        if (err) return sendMessage(err)
        sendMessage(null, 'Removing ' + key)
      })
      return
    case 'status':
      if (key) {
        return statusKey(key, function (err, status) {
          if (err) return sendMessage(err)
          var need = status.need
          var have = status.have
          var progress = (have / need) * 100
          sendMessage(null, `Status ${key}: ${progress.toFixed(2)}% archived (${have} of ${need} blocks)`)
        })
      }
      return status(function (err, msg) {
        sendMessage(err, msg)
      })
  }
}

function sendMessage (err, msg) {
  if (err) return bot.sendMessage('Error: ' + err.message, (sendStatus) => {})
  bot.sendMessage(msg, (sendStatus) => {})
}

function archiveSync (feed) {
  var key = feed.key.toString('hex')
  delete pending[key]

  console.log('Feed archived', key)
  if (client) {
    var size = feed.content ? content.byteLength : feed.byteLength
    var msg = key + ' has been fully archived (' + prettyBytes(size) + ')'
    sendMessage(null, msg)
  }
}

function status (cb) {
  ar.list(function (err, keys) {
    if (err) return cb(err)
    var msg = `Archiving ${keys.length} hypercores. `
    msg += `Uptime: ${prettyTime(process.hrtime(started))}. `
    msg += `bot version: ${version}, hypercore-archiver version: ${archiverVersion}.`
    cb(null, msg)
  })
}

function statusKey (key, cb) {
  ar.get(key, function (err, feed, content) {
    if (err) return cb(err)
    if (content && content.length === 0 && feed.length > 1) {
      return content.update(function () {
        statusKey(key, cb)
      })
    }
    if (!content) content = {length: 0}
    var need = feed.length + content.length
    var have = need - blocksRemain(feed) - blocksRemain(content)
    return cb(null, { key: key, need: need, have: have })
  })

  function blocksRemain (feed) {
    if (!feed.length) return 0
    var remaining = 0
    for (var i = 0; i < feed.length; i++) {
      if (!feed.has(i)) remaining++
    }
    return remaining
  }
}

function parse (message) {
  message = message.trim()

  if (message[0] === '!') {
    message = message.slice(1)
  } else {
    var name = (message.indexOf(':') > -1 ? message.split(':')[0] : '').trim().replace(/\d+$/, '')
    if (name !== argv.name) return null
  }

  message = message.split(':').pop().trim()
  if (message.indexOf(' ') === -1) return {command: message, key: null}
  var parts = message.split(' ')
  if (!/^[0-9a-f]{64}$/.test(parts[1])) return null
  return {
    command: parts[0],
    key: parts[1]
  }
}
