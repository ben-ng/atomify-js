var browserify = require('browserify')
  , path       = require('path')
  , fs         = require('fs')
  , events     = require('events')
  , mkdirp     = require('mkdirp')
  , watchify   = require('watchify')
  , ejsify     = require('ejsify')
  , hbsfy      = require('hbsfy')
  , jadeify    = require('jadeify')
  , envify     = require('envify')
  , partialify = require('partialify')
  , minifyify  = require('minifyify')
  , brfs       = require('brfs')
  , writer     = require('write-to-path')
  , emitter    = new events.EventEmitter()

var ctor = module.exports = function (opts, cb) {
  if (Array.isArray(opts)) opts = {entries: opts}
  if (typeof opts === 'string') opts = {entries: [opts]}
  if (opts.entry) opts.entries = [opts.entry]

  if (typeof cb === 'string') opts.output = cb // js('entry.js', 'bundle.js')

  if (opts.output) {
    // we definitely have to write the file
    var outputPath = path.resolve(process.cwd(), opts.output)
      , outputDir = path.dirname(outputPath)
      , writeFile = writer(outputPath, {debug: opts.debug})

    if (!fs.existsSync(outputDir)) mkdirp.sync(outputDir)

    // we might need to call a callback also
    if (typeof cb === 'function') {
      var _outputcb = cb
      cb = function (err, src, map) {
        writeFile(err, src)
        _outputcb(err, src, map)
      }
    } else {
      cb = writeFile
    }
  }

  var _buffercb = cb

  // Browserify 5 gives you a buffer instead of a string
  cb = function (err, buff, map) {
    _buffercb(err, Buffer.isBuffer(buff) ? buff.toString() : buff, map)
  }

  opts.debug  = opts.debug || false

  if(opts.minify === true) {
    opts.minify = {map: false}
  }
  // Debug mode must be on to get sourcemaps
  else if(typeof opts.minify == 'object') {
    opts.debug = true
  }

  var b = opts.watch ? watchify() : browserify({debug: opts.debug})

  opts.entries.forEach(function (entry) {
    b.add(path.resolve(process.cwd(), entry))
  })

  // Browserify modifies the transforms property once opts is passed in to bundle()
  // so we copy that prop here to ensure we only use what is passed in from config
  if (!opts._transforms) {
    opts._transforms = opts.transforms ? opts.transforms.slice(0) : []
  }

  // ensure brfs runs last because it requires valid js
  var transforms = [envify, ejsify, hbsfy, jadeify, partialify].concat(opts._transforms).concat([brfs])
  transforms.forEach(function (transform) {
    if (Array.isArray(transform)) {
      b.transform(transform[1], transform[0])
    } else {
      b.transform(transform)
    }
  })

  // reset list of global transforms every time
  opts._globalTransforms = opts.globalTransforms ? opts.globalTransforms.slice(0) : []

  if (opts.assets) {
    var assets = ['resrcify', {
      dest: opts.assets.dest || ''
      , prefix: opts.assets.prefix || ''
    }]

    opts._globalTransforms.push(assets)
  }

  opts._globalTransforms.forEach(function (gt) {
    if (Array.isArray(gt)) {
      var gto = gt[1]
      gto.global = true
      b.transform(gto, gt[0])
    } else {
      b.transform({global: true}, gt)
    }
  })

  if(typeof opts.minify == 'object') {
    b.plugin(minifyify, opts.minify)
  }

  if (opts.watch) {
    b.on('update', function (ids) {
      ids.forEach(function (id) {
        emitter.emit('changed', id)
      })

      b.bundle(cb)
    })

    b.on('time', function (time) {
      emitter.emit('bundle', time)
    })
  }

  return b.bundle(cb)
}

ctor.emitter = emitter
