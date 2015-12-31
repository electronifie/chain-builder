var builtInMethods = require('./lib/methods/builtInMethods');
var chainFactory = require('./lib/chainFactory');

module.exports = function (baseOptions) {
  if (! (baseOptions.methods || baseOptions.mixins)) throw new Error('options.methods or options.mixins must be provided.');
  var passedMethods = baseOptions.methods;
  var passedMixins = baseOptions.mixins;

  var contextMethods = {};
  var contextMethodSources = {};
  var methods = {};
  var methodSources = {};

  var addMethod = function (name, method, source) {
    if (methods[name]) throw new Error('Method "' + name + '" was provided by "' + methodSources[name] + '" and "' + source + '".');
    methods[name] = method;
    methodSources[name] = source;
  };

  var addContextMethod = function (name, method, source) {
    if (contextMethods[name]) throw new Error('Method "' + name + '" was provided by "' + contextMethodSources[name] + '" and "' + source + '".');
    contextMethods[name] = method;
    contextMethodSources[name] = source;
  };

  var addMethods = function (methodMap, source, forceContextMethod) {
    var name, method;
    for (name in methodMap) {
      if (!methodMap.hasOwnProperty(name)) continue;
      method = methodMap[name];
      (method.$contextMethod || forceContextMethod ? addContextMethod : addMethod)(name, method, source);
    }
  };

  addMethods(builtInMethods, 'builtInMethods');
  addMethods(passedMethods, 'methods');
  for (var i = 0; i < (passedMixins || []).length; i++) addMethods(passedMixins[i], 'mixin #' + i);

  var Chain = chainFactory(methods, contextMethods);

  // Return a constructor for the chain
  return function (initialResult) {
    if (initialResult) {
      return new Chain({ initialResult: initialResult });
    } else {
      return new Chain();
    }
  };
};
