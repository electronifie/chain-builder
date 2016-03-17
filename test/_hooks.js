var mockery = require('mockery');

before(function () { mockery.enable({ warnOnUnregistered: false }); });

after(function () {
  mockery.deregisterAll();
  mockery.disable();
});
