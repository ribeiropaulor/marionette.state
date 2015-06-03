// Marionette.State v0.2.3
/* global define */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([
      'backbone',
      'backbone.marionette',
      'underscore'
    ], function (Backbone, Marionette, _) {
      return factory(Backbone, Marionette, _);
    });
  }
  else if (typeof exports !== 'undefined') {
    var Backbone = require('backbone');
    var Marionette = require('backbone.marionette');
    var _ = require('underscore');
    module.exports = factory(Backbone, Marionette, _);
  }
  else {
    factory(root.Backbone, root.Backbone.Marionette, root._);
  }
}(this, function (Bb, Mn, _) {
  'use strict';

  // Manage state for a component.
  Mn.State = Mn.Object.extend({
  
    // State model class to instantiate
    modelClass: undefined,
  
    // Default state attributes hash
    defaultState: undefined,
  
    // Events from my component
    componentEvents: undefined,
  
    // State model instance
    _model: undefined,
  
    // My component, facilitating lifecycle management and event bindings
    _component: undefined,
  
    // Initial state attributes hash after 'initialState' option and defaults are applied
    _initialState: undefined,
  
    // options {
    //   component:    {Marionette object} An arbitrary object for lifetime and event binding.
    //     May be any Marionette object, so long as it has a destroy() method.
    //   initialState: {attrs} Optional initial state (defaultState will still be applied)
    constructor: function (options) {
      options = options || {};
      // Bind to component
      if (options.component) this.setComponent(options.component);
  
      // State model class is either passed in, on the class, or a standard Backbone model
      this.modelClass = options.modelClass || this.modelClass || Bb.Model;
  
      this.resetState(options.initialState);
  
      Mn.State.__super__.constructor.apply(this, arguments);
    },
  
    // Initialize model with attrs or reset it, destructively, to conform to attrs.
    resetState: function (attrs, options) {
      this._initialState = _.extend({}, this.defaultState, attrs);
  
      // If model is set, reset it. Otherwise, create it.
      if (this._model) {
        this.reset(null, options);
      } else {
        this._model = new this.modelClass(this._initialState);
      }
    },
  
    // Return the state model.
    getModel: function () {
      return this._model;
    },
  
    // Returns the initiate state, which is reverted to by reset()
    getInitialState: function () {
      return _.clone(this._initialState);
    },
  
    // Return state to its initial value.
    // If `attrs` is provided, they will override initial values for a "partial" reset.
    reset: function (attrs, options) {
      var resetAttrs = _.extend({}, this._initialState, attrs);
      this._model.set(resetAttrs, options);
    },
  
    // Proxy to model set().
    set: function () {
      if (!this._model) throw new Mn.Error('Initialize state first.');
      this._model.set.apply(this._model, arguments);
    },
  
    // Proxy to model get().
    get: function () {
      if (!this._model) throw new Mn.Error('Initialize state first.');
      return this._model.get.apply(this._model, arguments);
    },
  
    // Bind lifetime and component events to an object initialized with Backbone.Events, such as
    // a Backbone model or a Marionette object.
    setComponent: function (eventedObj) {
      this.stopListening(this._component, 'destroy');
      if (this.componentEvents) {
        this.unbindEntityEvents(this._component, this.componentEvents);
      }
      this._component = eventedObj;
      this.listenToOnce(this._component, 'destroy', this.destroy);
      if (this.componentEvents) {
        this.bindEntityEvents(this._component, this.componentEvents);
      }
    },
  
    // Marionette object bound to
    getComponent: function () {
      return this._component;
    },
  
    // Proxy to StateFunctions#syncEntityEvents.
    syncEntityEvents: function (entity, entityEvents) {
      return Mn.State.syncEntityEvents(this, entity, entityEvents);
    }
  });
  
  // Augment a view with state.
  // - view.state is the model managed by Marionette.State
  // - view.stateEvents hash defines state change handlers. onRender, change handlers are called
  //     in order to initialize state on the fresh DOM tree. See Marionette.State#syncEntityEvents.
  // - Marionette.State is created behind the scenes with options 'stateOptions' and 'mapOptions'
  // - State attributes are optionally serialized to the view template
  Mn.State.Behavior = Mn.Behavior.extend({
  
    // options {
    //   stateClass:   {Marionette.StateService class} Type of Marionette.State to instantiate
    //   syncEvent:    {String} View event on which to call state handlers, keeping the DOM in
    //                   sync with state. Defaults to 'render'.
    //   initialState: {object} Optional initial state attrs
    //   stateOptions: {object} Options to pass to Marionette.State
    //   mapOptions:   {object} Map view options to Marionette.State options
    //     - { stateOption: 'viewOption' }          viewOption will be passed as stateOption
    //     - { stateOption: 'viewOption.property' } viewOption.property will be passed
    //     - { stateOption: true }                  viewOption named 'stateOption' will be passed
    //     - { stateOption: function(viewOptions) } return value of function will be passed
    //   serialize:    {boolean} Whether to serialize state into template (default false)
    // }
    initialize: function (options) {
      options = options || {};
      if (!options.stateClass) throw new Mn.Error('Must provide \'stateClass\'.');
      var StateClass = options.stateClass;
      var syncEvent = options.syncEvent || 'render';
  
      // Compose State options and create State object
      var stateOptions = _.extend({
        initialState: options.initialState,
        component: this.view
      }, options.stateOptions, this._mapOptions(options.mapOptions));
      var state = new StateClass(stateOptions);
  
      // Give view access to the state model, but not the state object directly in order to
      // encourage decoupling; i.e., using view event triggers -> Marionette.State componentEvents.
      if (this.view.stateModel) throw new Error('View already contains a stateModel attribute.');
      this.view.stateModel = state.getModel();
  
      // Bind state events as well as call change handlers onRender to keep DOM in sync with state.
      if (this.view.stateEvents) {
        Mn.State.syncEntityEvents(this.view, this.view.stateModel, this.view.stateEvents)
          .when(syncEvent);
      }
  
      // Optionally set up serialization of state attributes to view template as 'state.attribute'
      if (options.serialize) this._wrapSerializeData();
    },
  
    // Convert view options into Marionette.State options
    _mapOptions: function (mappings) {
      if (!mappings) {
        return {};
      }
      return _.object(_.map(mappings, this._mapOption, this));
    },
  
    _mapOption: function (viewOptionKey, stateOptionKey) {
      var stateOptionValue;
  
      // Boolean true is an identity transformation; e.g., { stateOption: 'stateOption' }
      if (viewOptionKey === true) {
        stateOptionValue = this.view.options[stateOptionKey];
      }
      // Unwind nested keys; e.g., 'value.property.subproperty'
      else if (_.isString(viewOptionKey)) {
        stateOptionValue = _.reduce(viewOptionKey.split('.'), function (memo, key) {
          return memo[key];
        }, this.view.options);
      }
      // Functions are evaluated in the view context and passed the view options
      else if (_.isFunction(viewOptionKey)) {
        stateOptionValue = viewOptionKey.call(this.view, this.view.options);
      }
      else {
        throw new Mn.Error('Invalid mapOption value. Expecting true, String, or Function.');
      }
  
      return [stateOptionKey, stateOptionValue];
    },
  
    // Safe wrapping of serialize data. Calls existing serializeData method then merges in state
    // attributes.
    _wrapSerializeData: function () {
      var serializeData = this.view.serializeData;
      var state = this.view.state;
  
      this.view.serializeData = function () {
        var data = serializeData.call(this); // 'this' is the view
        var stateAttrs = _.clone(state.attributes);
  
        // If existing attributes do not contain 'state', drop stateAttribute right in.
        if (_.isUndefined(data.state)) {
          data.state = stateAttrs;
        }
        // If existing attribute DO contain 'state', attempt a safe merge.
        else if (_.isObject(data.state)) {
          this._mergeAttrs(data.state, stateAttrs);
        }
        else {
          throw new Mn.Error('\'state\' already defined and not extensible.');
        }
  
        return data;
      };
    },
  
    // Assign attributes into target, throwing Error rather than overwriting any existing.
    _mergeAttrs: function (target, attrs) {
      for (var attr in attrs) {
        if (_.isUndefined(target[attr])) {
          target[attr] = attrs[attr];
        } else {
          throw new Mn.Error('Attribute \'' + attr + '\' already defined.');
        }
      }
    }
  });
  
  ;(function (Bb, Mn, _) {
    var changeMatcher = /^change:(.+)/;
    var spaceMatcher = /\s+/;
  
    // Call all handlers optionally with a value (given a named attribute 'attr')
    function callHandlers(target, entity, handlers, attr) {
      var value = attr ? entity.get(attr) : undefined;
  
      if (_.isFunction(handlers)) {
        handlers.call(target, entity, value);
      }
      else {
        var handlerKeys = handlers.split(spaceMatcher);
        _.each(handlerKeys, function (handlerKey) {
          target[handlerKey](entity, value);
        });
      }
    }
  
    // Sync 'target' with event 'event1' and its handlers 'handler1 handler2', depending on event
    // and entity type.  Call value handlers for Backbone.Model 'change:attr' events, and call generic
    // handlers for Backbone.Model 'change', 'all' or Backbone.Collection 'change', 'all', or 'reset'.
    function syncBinding(target, entity, event, handlers) {
      var changeMatch;
      if (event === 'change' || event === 'all'
          || (entity instanceof Bb.Collection && event === 'reset')) {
        callHandlers(target, entity, handlers);
      }
      else if (entity instanceof Bb.Model && (changeMatch = event.match(changeMatcher))) {
        var attr = changeMatch[1];
        callHandlers(target, entity, handlers, attr);
      }
    }
  
    // Sync 'target' with an array of events ['event1', 'event2'] and their handlers
    // 'handler1 handler2'.
    function syncBindings(target, entity, events, handlers) {
      _.each(events, function (event) {
        syncBinding(target, entity, event, handlers);
      });
    }
  
    // Sync 'target' with the bindings hash { 'event1 event 2': 'handler1 handler2' }.
    function syncBindingsHash(target, entity, bindings) {
      _.each(bindings, function (handlers, eventStr) {
        var events = eventStr.split(spaceMatcher);
        syncBindings(target, entity, events, handlers);
      });
    }
  
    function Syncing (target, entity, bindings) {
      this.target = target;
      this.entity = entity;
      this.bindings = bindings;
    }
  
    Syncing.prototype.when = function (eventObj, event) {
      if (!event) {
        event = eventObj;
        eventObj = this.target;
      }
      this.event = event;
      this.eventObj = eventObj;
      this.handler = _.partial(syncBindingsHash, this.target, this.entity, this.bindings);
      this.when = true;
  
      this.target.__syncingEntityEvents = this.target.__syncingEntityEvents || [];
      this.target.__syncingEntityEvents.push(this);
      this.target.listenTo(this.eventObj, this.event, this.handler);
      return this;
    };
  
    Syncing.prototype.now = function () {
      syncBindingsHash(this.target, this.entity, this.bindings);
      return this;
    };
  
    _.extend(Mn.State, {
  
      // Binds 'bindings' handlers located on 'target' to 'entity' using
      // Marionette.bindEntityEvents, but then initializes state by calling handlers:
      //   Backbone.Model
      //     'all'          (model)
      //     'change'       (model)
      //     'change:value' (model, value)
      //   Backbone.Collection
      //     'all'          (collection)
      //     'reset'        (collection)
      //     'change'       (collection)
      //
      // Handlers are called immediately unless 'event' is supplied, in which case handlers will be
      // called every time 'target' triggers 'event'. Views will automatically sync on 'render'
      // unless this argument is supplied.
      //
      // For event mappings with multiple matching events, all handlers are called for each event.
      // For example, the following mapping:
      //   { 'change:foo change:bar': 'doSomething doSomethingElse' }
      // will call:
      //   doSomething(model, model.get('foo'))
      //   doSomethingElse(model, model.get('foo'))
      //   doSomething(model, model.get('bar'))
      //   doSomethingElse(model, model.get('bar'))
      syncEntityEvents: function (target, entity, bindings) {
        Mn.bindEntityEvents(target, entity, bindings);
        return new Syncing(target, entity, bindings);
      },
  
      // Ceases syncing entity events.
      stopSyncingEntityEvents: function (target, entity, bindings) {
        Mn.unbindEntityEvents(target, entity, bindings);
        if (!target.__syncingEntityEvents) {
          return;
        }
        _.each(target.__syncingEntityEvents, function (syncing) {
          if (syncing.when) {
            target.stopListening(syncing.eventObj, syncing.event, syncing.handler);
          }
        });
      }
    });
  })(Bb, Mn, _);
  

  return Mn.State;
}));
