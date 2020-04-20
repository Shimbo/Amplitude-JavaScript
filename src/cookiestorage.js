/* jshint -W020, unused: false, noempty: false, boss: true */

/*
 * Abstraction layer for cookie storage.
 * Uses cookie if available, otherwise fallback to localstorage.
 */

import Cookie from './cookie';

var cookieStorage = function() {
  this.storage = null;
};

cookieStorage.prototype.getStorage = function() {
  if (this.storage !== null) {
    return this.storage;
  }

  // Whatever cookies enabled or not use cookie storage as default
  this.storage = Cookie;

  return this.storage;
};

export default cookieStorage;
