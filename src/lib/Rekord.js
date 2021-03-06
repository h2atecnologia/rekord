
/**
 * Creates a Rekord object given a set of options. A Rekord object is also the
 * constructor for creating instances of the Rekord object defined.
 *
 * @namespace
 * @param {Object} options
 *        The options of
 */
function Rekord(options)
{
  var promise = Rekord.get( options.name );

  if ( promise.isComplete() )
  {
    return promise.results[0];
  }

  Rekord.trigger( Rekord.Events.Options, [options] );

  var database = new Database( options );

  var model = Class.dynamic(
    Model,
    new Model( database ),
    database.className,
    '(props, remoteData) { this.$init( props, remoteData ) }'
  );

  database.Model = model;
  model.Database = database;

  Rekord.classes[ database.name ] = model;

  Rekord.trigger( Rekord.Events.Plugins, [model, database, options] );

  if ( Rekord.autoload )
  {
    database.loadBegin(function onLoadFinish(success)
    {
      if ( success )
      {
        database.loadFinish();
      }
    });
  }
  else
  {
    Rekord.unloaded.push( database );
  }

  Rekord.get( database.name ).resolve( model );
  Rekord.get( database.className ).resolve( model );

  Rekord.debug( Rekord.Debugs.CREATION, database, options );

  return model;
}

Rekord.classes = {};

Rekord.autoload = false;

Rekord.unloaded = [];

Rekord.loadPromise = null;

Rekord.load = function(callback, context)
{
  var promise = Rekord.loadPromise = Rekord.loadPromise || new Promise( null, false );
  var loading = Rekord.unloaded.slice();
  var loaded = [];
  var loadedSuccess = [];

  promise.success( callback, context || this );

  Rekord.unloaded.length = 0;

  function onLoadFinish(success, db)
  {
    loadedSuccess.push( success );
    loaded.push( db );

    if ( loaded.length === loading.length )
    {
      for (var k = 0; k < loaded.length; k++)
      {
        var db = loaded[ k ];
        var success = loadedSuccess[ k ];

        if ( success )
        {
          db.loadFinish();
        }
      }

      promise.reset().resolve();
    }
  }

  // Load by priority defined in Database
  loading.sort(function(a, b)
  {
    return b.priority - a.priority;
  });

  // Begin the loading procedure for every unloaded Database
  for (var i = 0; i < loading.length; i++)
  {
    loading[ i ].loadBegin( onLoadFinish );
  }

  return promise;
};

Rekord.promises = {};

Rekord.get = function(name)
{
  var existing = Rekord.promises[ name ];

  if ( !existing )
  {
    existing = Rekord.promises[ name ] = new Promise( null, false );
  }

  return existing;
};

Rekord.export = function()
{
  var classes = Rekord.classes;

  for (var className in classes)
  {
    win[ className ] = classes[ className ];
  }
};

Rekord.clear = function(removeListeners)
{
  var classes = Rekord.classes;

  for (var className in classes)
  {
    classes[ className ].clear( removeListeners );
  }
};

Rekord.reset = function(failOnPendingChanges, removeListeners)
{
  var classes = Rekord.classes;

  if ( failOnPendingChanges )
  {
    for (var className in classes)
    {
      var db = classes[ className ].Database;

      if ( db.hasPending() )
      {
        return Promise.reject( db );
      }
    }
  }

  return Promise.singularity(this, function()
  {
    for (var className in classes)
    {
      var db = classes[ className ].Database;

      db.reset( false, removeListeners );
    }
  });
};

Rekord.unload = function(names, reset, failOnPendingChanges, removeListeners)
{
  var classes = Rekord.classes;
  var promises = Rekord.promises;

  if ( failOnPendingChanges )
  {
    for (var className in classes)
    {
      var db = classes[ className ].Database;
      var check = ( !isArray( names ) || indexOf( names, className ) !== false );

      if ( check && db.hasPending() )
      {
        return Promise.reject( db );
      }
    }
  }

  return Promise.singularity(this, function()
  {
    for (var className in classes)
    {
      var db = classes[ className ].Database;
      var check = ( !isArray( names ) || indexOf( names, className ) !== false );

      if ( check )
      {
        if ( reset )
        {
          db.reset( false, removeListeners );
        }

        delete classes[ className ];
        delete promises[ db.name ];
        delete promises[ db.className ];
      }
    }
  });
};

/**
 * A value which identifies a model instance. This can be the key of the model,
 * an array of values (if the model has composite keys), an object which at
 * least contains fields which identify the model, an instance of a model, the
 * reference to a Rekord instance, or a function.
 *
 * If a plain object is given and it shares the same key as an existing model -
 * the other fields on the object will be applied to the existing instance. If
 * a plain object is given and it's key doesn't map to an existing model - a new
 * one is created.
 *
 * If a reference to a Rekord instance is given - a new model instance is created
 * with default values.
 *
 * If a function is given - it's invoked and the returning value is used as the
 * value to identify the model instance.
 *
 * @typedef {String|Number|String[]|Number[]|Object|Rekord|Rekord.Model|Function} modelInput
 */

 /**
  * A key to a model instance.
  *
  * @typedef {String|Number} modelKey
  */

addEventful( Rekord );

Rekord.Events =
{
  Initialized:  'initialized',
  Plugins:      'plugins',
  Options:      'options',
  Online:       'online',
  Offline:      'offline',
  Error:        'error'
};
