# chainBuilder.js [![Build Status](https://travis-ci.org/electronifie/chain-builder.svg)](https://travis-ci.org/electronifie/chain-builder)

Make your collection of async functions chainable.

**To install:** `npm install chainbuilder --save`

#### Convert calls like
```javascript
  var findUser = function (userId, cb) { ... };
  var get = function (url, cb) { ... };

  findUser('user-bob', function (err, user) {
    if (err) return cb(err);
    get(user.dailyStatsUrl, function (err, dailyStats) {
      if (err) return cb(err);
      var highScores = _.pluck(dailyStats, 'highScore');
      cb(null, highScores);
    });
  });
```

#### into
```javascript
  users.find('user-bob').getDailyStats().pluck('highScore').end(cb);
```

#### by making your methods chainable with minimal effort, like
```javascript
  var chainBuilder = require('chainbuilder');
  var users = chainBuilder({
    methods: {
      // A method that doesn't depend on previous calls can be provided without 
      // modification. It just needs to take a callback as the final paramater
      // in the format `function (err, result) { ... }`
      find: findUser,

      // The result of the previous call can be accessed with this.previousResult();
      getDailyStats: function (cb) {
        var user = this.previousResult();
        get(user.dailyStatsUrl, cb);
      },

      // The chained methods don't need to be async.
      pluck: function (key, cb) { cb(null, _.pluck(this.previousResult(), key)); }
    }
  });
```

## Alternatively, use one file per function

You can keep things tidy with one file per function and requireDir (you'll need to `npm install require-dir --save`), like...
```
lib/
|- getHighScores.js
|- users/
   |- index.js
   |- find.js
   |- getDailyStats.js
   |- pluck.js
```
```javascript
// lib/users/index.js
var chainBuilder = require('chainbuilder');
var requireDir = require('require-dir');
module.exports = chainBuilder({ methods: requireDir('.') });

// lib/getHighScores.js
var users = require('./users');
module.exports = function (cb) {
  users.find('user-bob').getDailyStats().pluck('highScore').end(cb);
};
```

## Behavior

### Execution
 1. the chain starts executing immediately, i.e. it does not wait for end() to be called.
 2. each call merely returns the original instance, not a clone, so breaking a chain won't create a new one (like it does for lodash). This can result in some confusing behavior such as:  

     ```javascript
    var a = mathChain().initialNumber(1);
    var b = a.add(2);
    var c = a.add(3);
    c.end(function (err, result) { /* result === 6 */ });
     ```

### Errors
 1. errors can be provided as the first argument of the callback or thrown
 2. if an error occurs, subsequent calls will be skipped until `end(...)`, `transform(...)` or `recover(...)` are encountered.

# API
### `chainBuilder(options)`
Build a `Chain` class. The methods you provide will be present, along with some helpers detailed below. Returns a Chain factory function.  
_e.g._ 
```javascript
var request = chainBuilder({
  methods: {
    get: function (url, cb) { 
      http.get(url, function (response) {
        if (response.statusCode === 200) cb(null, response.body) else cb(response.statusMessage);
      }); 
    },
    asJson: function (cb) { 
      cb(null, JSON.stringify(this.previousResponse.body)); 
    },
    ...
  }
});
```
**@param options.methods Object<string, function(..., function(\*,\*))>** a dictionary of functions that take a callback as their final parameter. The callback takes an error as the first parameter, and a result as the second. Each function is run with the currently running `Chain` as `this`, so will have access to methods like `previousResult()`.  
**@return function(options):Chain**  

## `Chain`

### chaining methods
Methods you can use when constructing chains.

#### #yourMethod(...)
All methods you pass to `chainBuilder(...)` are available on the constructed chain, with the same signature except for the callback. Each method can make use of the _contextual methods_ described below.   
_e.g._ 
```javascript 
request().get('http://jsonip.com').asJson()...
```

#### #tap(fn)
Peek at the current value in the chain.  
_e.g._
```javascript 
request()
  .get('http://jsonip.com')
  .tap(function (err, result) { console.log('' + result); /* > {"ip":"123.123.101","about":"/about","Pro!":"http://getjsonip.com"} */ })
  .asJson()
  .tap(function (err, result) { console.log('' + result); /* > [object Object] */ })
```  
**@param fn function(\*,\*)** a callback that receives an error as the first parameter or the last call's result as the second.

#### #transform(fn)
Alter the current value in the chain. Called when the previous call returned successfully, or if one of the previous calls 
```javascript 
request()
  .get('http://jsonip.com')
  .asJson()
  .transform(function (err, result, cb) { cb(null, result.ip); })
  .tap(function (err, result) { console.log(result); /* > 123.123.101 */ })
``` 
**@param fn function(\*,\*, function(\*,\*))** a function that receives an error as the first parameter or the last call's result as the second, and a callback as the final parameter that takes the transformed error or result.

#### #recover(fn)
Recover from an error thrown by one of the previous calls in the chain. Similar to transform, but only called if one of the previous calls errored and is only passed the error and cb.
```javascript 
request()
  .get('INVALID')
  .asJson() // will not be called, as the above call threw an error
  .recover(function (err, cb) { cb(null, '0.0.0.0'); })
  .tap(function (err, result) { console.log(result); /* > 0.0.0.0 */ })
``` 
**@param fn function(\*,\*, function(\*,\*))** a function that receives an error as the first parameter or the last call's result as the second, and a callback as the final parameter that takes the transformed error or result.

#### #end(fn)
Get the final result in the chain (really just a more final sounding alias of `#tap`).

### contextual methods
Methods you can use from within your functions. They shouldn't be used when construction chains as they break the flow and will give you a world of async pain.

#### this.previousResult()
The result provided by the previous call in the chain.
**@return String**

