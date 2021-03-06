const { Transform } = require('stream')
const { inherits } = require('util')
const { launch } = require('puppeteer')
const finished = require('tap-finished')
const pump = require('pump')

const noSandboxOnTravis = opts => {
  if ('CI' in process.env && 'TRAVIS' in process.env) {
    opts = Object.assign({}, opts)
    const chromium_flags = [ '--no-sandbox', '--disable-setuid-sandbox' ]
    if (Array.isArray(opts.args)) opts.args = opts.args.concat(chromium_flags)
    else opts.args = chromium_flags
  }
  return opts
}

function TapePuppetStream (opts) {
  if (!(this instanceof TapePuppetStream)) return new TapePuppetStream(opts)
  Transform.call(this)
  this._opts = Object.assign({}, noSandboxOnTravis(opts || {}))
  this._accu = Buffer.alloc(0)
}

inherits(TapePuppetStream, Transform)

TapePuppetStream.prototype._transform = function transform (chunk, _, next) {
  this._accu = Buffer.concat([ this._accu, chunk ])
  next()
}

TapePuppetStream.prototype._flush = async function flush (end) {
  const self = this

  const shutdown = async err => {
    try {
      await browser.close()
    } catch (error) {
      if (!err) err = error
    }
    end(err)
  }

  const finisher = finished(this._opts, results => {
    self.emit('results', results)
    shutdown()
  })

  var browser, page
  try {
    browser = await launch(this._opts)
    page = await browser.newPage()
  } catch (err) {
    return shutdown(err)
  }

  page.on('error', shutdown)
  page.on('pageerror', shutdown)
  page.on('console', msg => self.push(`${msg._text}\n`))

  pump(self, finisher, err => {
    if (err) return shutdown(err)
  })

  try {
    await page.evaluate(String(this._accu))
  } catch (err) {
    return shutdown(err)
  }
}

module.exports = TapePuppetStream
