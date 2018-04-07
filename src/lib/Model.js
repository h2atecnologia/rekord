
/**
 * An instance
 *
 * @constructor
 * @memberof Rekord
 * @augments Rekord.Eventful$
 * @param {Rekord.Database} db
 *        The database instance used in model instances.
 */
function Model(db)
{
  Class.prop( this, '$db', db );

  /**
   * @property {Database} $db
   *           The reference to the database this model is stored in.
   */

  /**
   * @property {Object} [$saved]
   *           An object of encoded data representing the values saved remotely.
   *           If this object does not exist - the model hasn't been created
   *           yet.
   */

  /**
   * @property {Object} [$local]
   *           The object of encoded data that is stored locally. It's $saved
   *           property is the same object as this $saved property.
   */

  /**
   * @property {Boolean} $status
   *           Whether there is a pending save for this model.
   */
}

Model.Events =
{
  Created:              'created',
  Saved:                'saved',
  PreSave:              'pre-save',
  PostSave:             'post-save',
  PreRemove:            'pre-remove',
  PostRemove:           'post-remove',
  PartialUpdate:        'partial-update',
  FullUpdate:           'full-update',
  Updated:              'updated',
  Detach:               'detach',
  Change:               'change',
  CreateAndSave:        'created saved',
  UpdateAndSave:        'updated saved',
  KeyUpdate:            'key-update',
  RelationUpdate:       'relation-update',
  Removed:              'removed',
  RemoteUpdate:         'remote-update',
  LocalSave:            'local-save',
  LocalSaveFailure:     'local-save-failure',
  LocalSaves:           'local-save local-save-failure',
  RemoteSave:           'remote-save',
  RemoteSaveFailure:    'remote-save-failure',
  RemoteSaveOffline:    'remote-save-offline',
  RemoteSaves:          'remote-save remote-save-failure remote-save-offline',
  LocalRemove:          'local-remove',
  LocalRemoveFailure:   'local-remove-failure',
  LocalRemoves:         'local-remove local-remove-failure',
  RemoteRemove:         'remote-remove',
  RemoteRemoveFailure:  'remote-remove-failure',
  RemoteRemoveOffline:  'remote-remove-offline',
  RemoteRemoves:        'remote-remove remote-remove-failure remote-remove-offline',
  LocalGet:             'local-get',
  LocalGetFailure:      'local-get-failure',
  LocalGets:            'local-get local-get-failure',
  RemoteGet:            'remote-get',
  RemoteGetFailure:     'remote-get-failure',
  RemoteGetOffline:     'remote-get-offline',
  RemoteGets:           'remote-get remote-get-failure remote-get-offline',
  RemoteAndRemove:      'remote-remove removed',
  SavedRemoteUpdate:    'saved remote-update',
  OperationsStarted:    'operations-started',
  OperationsFinished:   'operations-finished',
  KeyChange:            'key-change',
  Changes:              'saved remote-update key-update relation-update removed key-change change'
};

Model.Status =
{
  Synced:         0,
  SavePending:    1,
  RemovePending:  2,
  Removed:        3
};

Model.Blocked =
{
  toString: true,
  valueOf: true
};

Class.create( Model,
{

  $init: function(props, remoteData)
  {
    this.$status = Model.Status.Synced;

    Class.props(this, {
      $operation: null,
      $relations: {},
      $dependents: new Dependents( this ),
      $savedState: false,
      $saved: false,
      $local: false,
      $touched: now()
    });

    if ( remoteData )
    {
      var key = this.$db.keyHandler.getKey( props, true );

      if ( !isValue( key ) )
      {
        Class.prop( this, '$invalid', true );

        return;
      }

      this.$db.addReference( this, key );
      this.$set( props, undefined, remoteData );
    }
    else
    {
      this.$reset( props );
    }

    this.$initRelations( remoteData );
  },

  $initRelations: function(remoteData)
  {
    if ( this.$db.loadRelations )
    {
      var databaseRelations = this.$db.relations;

      for (var name in databaseRelations)
      {
        var relation = databaseRelations[ name ];

        if ( !relation.lazy )
        {
          this.$getRelation( name, undefined, remoteData );
        }
      }
    }
  },

  $load: function(relations)
  {
    if ( isArray( relations ) )
    {
      for (var i = 0; i < relations.length; i++)
      {
        this.$getRelation( relations[ i ] );
      }
    }
    else if ( isString( relations ) )
    {
      this.$getRelation( relations );
    }
    else
    {
      var databaseRelations = this.$db.relations;

      for (var name in databaseRelations)
      {
        this.$getRelation( name );
      }
    }
  },

  $reset: function(props)
  {
    var def = this.$db.defaults;
    var fields = this.$db.fields;
    var relations = this.$db.relations;
    var keyHandler = this.$db.keyHandler;
    var keyFields = this.$db.key;

    if ( !isEmpty( def ) )
    {
      for (var i = 0; i < fields.length; i++)
      {
        var prop = fields[ i ];
        var defaultValue = def[ prop ];
        var evaluatedValue = evaluate( defaultValue );

        this[ prop ] = evaluatedValue;
      }
    }
    else
    {
      for (var i = 0; i < fields.length; i++)
      {
        var prop = fields[ i ];

        this[ prop ] = undefined;
      }
    }

    var key = null;

    // First try pulling key from properties (only if it hasn't been
    // initialized through defaults)
    if ( props )
    {
      key = keyHandler.getKey( props, true );
    }

    // If the key wasn't specified, try generating it on this model
    if ( !isValue( key ) )
    {
      key = keyHandler.getKey( this );
    }
    // The key was specified in the properties, apply it to this model
    else
    {
      updateFieldsReturnChanges( this, keyFields, props, keyFields );
    }

    // The key exists on this model - place the reference of this model
    // in the all map and set the cached key.
    if ( isValue( key ) )
    {
      this.$db.addReference( this, key );
      this.$$key = key;
    }

    // Apply the default relation values now that this key is most likely populated
    if ( !isEmpty( def ) )
    {
      for (var prop in relations)
      {
        if ( prop in def )
        {
          var defaultValue = def[ prop ];
          var evaluatedValue = evaluate( defaultValue );
          var hasRelation = !!this.$relations[ prop ];
          var relation = this.$getRelation( prop, evaluatedValue );

          if ( hasRelation )
          {
            relation.set( this, evaluatedValue );
          }
        }
      }
    }

    // Set the remaing properties
    this.$set( props );
  },

  $set: function(props, value, remoteData, avoidChange)
  {
    if ( isObject( props ) )
    {
      for (var prop in props)
      {
        this.$set( prop, props[ prop ], remoteData, true );
      }
    }
    else if ( isString( props ) )
    {
      if ( Model.Blocked[ props ] )
      {
        return;
      }

      var exists = this.$hasRelation( props );
      var relation = this.$getRelation( props, value, remoteData );

      if ( relation )
      {
        if ( exists )
        {
          relation.set( this, value, remoteData );
        }
      }
      else
      {
        this[ props ] = value;
      }
    }

    if ( !avoidChange && isValue( props ) )
    {
      this.$trigger( Model.Events.Change, [props, value] );
    }
  },

  $get: function(props, copyValues)
  {
    if ( isArray( props ) )
    {
      return grab( this, props, copyValues );
    }
    else if ( isObject( props ) )
    {
      for (var p in props)
      {
        props[ p ] = copyValues ? copy( this[ p ] ) : this[ p ];
      }

      return props;
    }
    else if ( isString( props ) )
    {
      if ( Model.Blocked[ props ] )
      {
        return;
      }

      var relation = this.$getRelation( props );

      if ( relation )
      {
        var values = relation.get( this );

        return copyValues ? copy( values ) : values;
      }
      else
      {
        return copyValues ? copy( this[ props ] ) : this[ props ];
      }
    }
  },

  $decode: function()
  {
    this.$db.decode( this );
  },

  $sync: function(prop, removeUnrelated)
  {
    var relation = this.$getRelation( prop );

    if ( relation )
    {
      relation.sync( this, removeUnrelated );
    }
  },

  $relate: function(prop, relate, remoteData)
  {
    var relation = this.$getRelation( prop );

    if ( relation )
    {
      relation.relate( this, relate, remoteData );
    }
  },

  $unrelate: function(prop, unrelated, remoteData)
  {
    var relation = this.$getRelation( prop );

    if ( relation )
    {
      relation.unrelate( this, unrelated, remoteData );
    }
  },

  $isRelated: function(prop, related)
  {
    var relation = this.$getRelation( prop );

    return relation && relation.isRelated( this, related );
  },

  $hasRelation: function(prop)
  {
    return prop in this.$relations;
  },

  $getRelation: function(prop, initialValue, remoteData)
  {
    var databaseRelations = this.$db.relations;
    var relation = databaseRelations[ prop ];

    if ( relation )
    {
      if ( !(prop in this.$relations) )
      {
        relation.load( this, initialValue, remoteData );
      }

      return relation;
    }

    return false;
  },

  $save: function(setProperties, setValue, cascade, options)
  {
    if ( isObject( setProperties ) )
    {
      options = cascade;
      cascade = setValue;
      setValue = undefined;
    }
    else if ( isNumber( setProperties ) )
    {
      options = setValue;
      cascade = setProperties;
      setValue = undefined;
      setProperties = undefined;
    }

    if ( !isNumber( cascade ) )
    {
      cascade = this.$db.cascade;
    }

    if ( this.$isDeleted() )
    {
      Rekord.debug( Rekord.Debugs.SAVE_DELETED, this.$db, this );

      return Promise.resolve( this );
    }

    if ( !this.$hasKey() )
    {
      throw 'Key missing from model';
    }

    var promise = createModelPromise( this, cascade,
      Model.Events.RemoteSave,
      Model.Events.RemoteSaveFailure,
      Model.Events.RemoteSaveOffline,
      Model.Events.LocalSave,
      Model.Events.LocalSaveFailure
    );

    return Promise.singularity( promise, this, function(singularity)
    {
      batchExecute(function()
      {
        this.$touch();

        this.$db.addReference( this );

        if ( setProperties !== undefined )
        {
          this.$set( setProperties, setValue );
        }

        this.$trigger( Model.Events.PreSave, [this] );

        this.$db.save( this, cascade, options );

        this.$db.pruneModels();

        this.$trigger( Model.Events.PostSave, [this] );

      }, this );
    });
  },

  $remove: function(cascade, options)
  {
    var cascade = isNumber( cascade ) ? cascade : this.$db.cascade;

    if ( !this.$exists() )
    {
      return Promise.resolve( this );
    }

    var promise = createModelPromise( this, cascade,
      Model.Events.RemoteRemove,
      Model.Events.RemoteRemoveFailure,
      Model.Events.RemoteRemoveOffline,
      Model.Events.LocalRemove,
      Model.Events.LocalRemoveFailure
    );

    return Promise.singularity( promise, this, function(singularity)
    {
      batchExecute(function()
      {
        this.$trigger( Model.Events.PreRemove, [this] );

        this.$db.remove( this, cascade, options );

        this.$trigger( Model.Events.PostRemove, [this] );

      }, this );
    });
  },

  $refresh: function(cascade, options)
  {
    var promise = createModelPromise( this, cascade,
      Model.Events.RemoteGet,
      Model.Events.RemoteGetFailure,
      Model.Events.RemoteGetOffline,
      Model.Events.LocalGet,
      Model.Events.LocalGetFailure
    );

    if ( canCascade( cascade, Cascade.Rest ) )
    {
      this.$addOperation( GetRemote, cascade, options );
    }
    else if ( canCascade( cascade, Cascade.Local ) )
    {
      this.$addOperation( GetLocal, cascade, options );
    }
    else
    {
      promise.resolve( this );
    }

    return promise;
  },

  $autoRefresh: function(cascade, options)
  {
    var callRefresh = function()
    {
      this.$refresh( cascade, options );
    };

    Rekord.on( Rekord.Events.Online, callRefresh, this );

    return this;
  },

  $cancel: function(reset, options)
  {
    if ( this.$saved )
    {
      this.$save( this.$saved, this.$db.cascade, options );
    }
    else if ( reset )
    {
      this.$reset();
    }
  },

  $clone: function(properties)
  {
    // If field is given, evaluate the value and use it instead of value on this object
    // If relation is given, call clone on relation

    var db = this.$db;
    var key = db.key;
    var fields = db.fields;
    var relations = db.relations;
    var values = {};

    for (var i = 0; i < fields.length; i++)
    {
      var f = fields[ i ];

      if ( properties && f in properties )
      {
        values[ f ] = evaluate( properties[ f ] );
      }
      else if ( f in this )
      {
        values[ f ] = copy( this[ f ] );
      }
    }

    if ( isString( key ) )
    {
      delete values[ key ];
    }

    var cloneKey = db.keyHandler.getKey( values );
    var modelKey = this.$key();

    if ( cloneKey === modelKey )
    {
      throw 'A clone cannot have the same key as the original model.';
    }

    for (var relationName in relations)
    {
      if ( properties && relationName in properties )
      {
        relations[ relationName ].preClone( this, values, properties[ relationName ] );
      }
    }

    var clone = db.instantiate( values );
    var relationValues = {};

    for (var relationName in relations)
    {
      if ( properties && relationName in properties )
      {
        relations[ relationName ].postClone( this, relationValues, properties[ relationName ] );
      }
    }

    clone.$set( relationValues );

    return clone;
  },

  $push: function(fields)
  {
    this.$savedState = this.$db.encode( this, grab( this, fields || this.$db.fields, true ), false );
  },

  $pop: function(dontDiscard)
  {
    if ( isObject( this.$savedState ) )
    {
      this.$set( this.$savedState );

      if ( !dontDiscard )
      {
        this.$discard();
      }
    }
  },

  $discard: function()
  {
    this.$savedState = false;
  },

  $exists: function()
  {
    return !this.$isDeleted() && this.$db.models.has( this.$key() );
  },

  $addOperation: function(OperationType, cascade, options)
  {
    var operation = new OperationType( this, cascade, options );

    if ( !this.$operation )
    {
      this.$operation = operation;
      this.$operation.execute();
    }
    else
    {
      this.$operation.queue( operation );
    }
  },

  $toJSON: function( forSaving )
  {
    var encoded = this.$db.encode( this, grab( this, this.$db.fields, true ), forSaving );

    var databaseRelations = this.$db.relations;
    var relations = this.$relations;

    for (var name in relations)
    {
      databaseRelations[ name ].encode( this, encoded, forSaving );
    }

    return encoded;
  },

  $changed: function()
  {
    this.$trigger( Model.Events.Change );
  },

  $updated: function()
  {
    this.$changed();
    this.$db.trigger( Database.Events.ModelUpdated, [this] );
  },

  $key: function(quietly)
  {
    if ( !this.$$key )
    {
      this.$$key = this.$db.keyHandler.getKey( this, quietly );
    }

    return this.$$key;
  },

  $keys: function()
  {
    return this.$db.keyHandler.getKeys( this );
  },

  $uid: function()
  {
    return this.$db.name + '$' + this.$key();
  },

  $hasKey: function()
  {
    return hasFields( this, this.$db.key, isValue );
  },

  $setKey: function(key, skipApplication)
  {
    var db = this.$db;
    var newKey = db.keyHandler.buildKeyFromInput(key);
    var oldKey = this.$$key;

    if (newKey !== oldKey)
    {
      if (!db.keyChanges)
      {
        throw 'Key changes are not supported, see the documentation on how to enable key changes.';
      }

      db.removeReference( oldKey );
      db.addReference( this, newKey );

      this.$$key = newKey;

      if ( !skipApplication )
      {
        db.keyHandler.applyKey( newKey, this );
      }

      this.$trigger( Model.Events.KeyChange, [this, oldKey, newKey] );
    }

    return newKey;
  },

  $remote: function(encoded, overwrite)
  {
    this.$db.putRemoteData( encoded, this.$key(), this, overwrite );
  },

  $isSynced: function()
  {
    return this.$status === Model.Status.Synced;
  },

  $isSaving: function()
  {
    return this.$status === Model.Status.SavePending;
  },

  $isPending: function()
  {
    return this.$status === Model.Status.SavePending || this.$status === Model.Status.RemovePending;
  },

  $isDeleted: function()
  {
    return this.$status >= Model.Status.RemovePending;
  },

  $isSaved: function()
  {
    return !!this.$saved;
  },

  $isSavedLocally: function()
  {
    return !!this.$local;
  },

  $isNew: function()
  {
    return !(this.$saved || this.$local);
  },

  $touch: function()
  {
    if ( this.$db.hasPruning() )
    {
      this.$touched = now();
    }
  },

  $project: function(projectionInput)
  {
    var projection = Projection.parse( this.$db, projectionInput );

    return projection.project( this );
  },

  $getChanges: function(alreadyDecoded)
  {
    var db = this.$db;
    var saved = db.decode( this.$saved, {} );
    var encoded = alreadyDecoded || this;
    var fields = db.saveFields;

    return saved ? diff( encoded, saved, fields, equals ) : encoded;
  },

  $hasChanges: function(local)
  {
    var compareTo = local ? this.$local : this.$saved;

    if (!compareTo)
    {
      return true;
    }

    var db = this.$db;
    var ignore = db.ignoredFields;
    var saved = db.decode( compareTo, {} );
    var fields = db.saveFields;

    for (var i = 0; i < fields.length; i++)
    {
      var prop = fields[ i ];
      var currentValue = this[ prop ];
      var savedValue = saved[ prop ];

      if ( ignore[ prop ] )
      {
        continue;
      }

      if ( !equals( currentValue, savedValue ) )
      {
        return true;
      }
    }

    return false;
  },

  $hasChange: function(prop, local)
  {
    var compareTo = local ? this.$local : this.$saved;

    if (!compareTo)
    {
      return true;
    }

    var db = this.$db;
    var decoder = db.decodings[ prop ];
    var currentValue = this[ prop ];
    var savedValue = decoder ? decoder( compareTo[ prop ], compareTo, prop ) : compareTo[ prop ];

    return !equals( currentValue, savedValue );
  },

  $listenForOnline: function(cascade, options)
  {
    if (!this.$offline)
    {
      this.$offline = true;

      Rekord.once( Rekord.Events.Online, this.$resume, this );
    }

    Class.props(this,
    {
      $resumeCascade: cascade,
      $resumeOptions: options
    });
  },

  $resume: function()
  {
    if (this.$status === Model.Status.RemovePending)
    {
      Rekord.debug( Rekord.Debugs.REMOVE_RESUME, this );

      this.$addOperation( RemoveRemote, this.$resumeCascade, this.$resumeOptions );
    }
    else if (this.$status === Model.Status.SavePending)
    {
      Rekord.debug( Rekord.Debugs.SAVE_RESUME, this );

      this.$addOperation( SaveRemote, this.$resumeCascade, this.$resumeOptions );
    }

    this.$offline = false;
  },

  toString: function()
  {
    return this.$db.className + ' ' + JSON.stringify( this.$toJSON() );
  }

});

addEventful( Model, true );

addEventFunction( Model, '$change', Model.Events.Changes, true );

function createModelPromise(model, cascade, restSuccess, restFailure, restOffline, localSuccess, localFailure)
{
  var promise = new Promise( null, false );

  if ( canCascade( cascade, Cascade.Rest ) )
  {
    var off1 = model.$once( restSuccess, function(data) {
      off2();
      off3();
      promise.resolve( model, data );
    });
    var off2 = model.$once( restFailure, function(data, status) {
      off1();
      off3();
      promise.reject( model, status, data );
    });
    var off3 = model.$once( restOffline, function() {
      off1();
      off2();
      promise.noline( model );
    });
  }
  else if ( canCascade( cascade, Cascade.Local ) )
  {
    var off1 = model.$once( localSuccess, function(data)
    {
      off2();
      promise.resolve( model, data );
    });
    var off2 = model.$once( localFailure, function(data, status)
    {
      off1();
      promise.reject( model, data );
    });
  }
  else
  {
    promise.resolve( model );
  }

  return promise;
}
