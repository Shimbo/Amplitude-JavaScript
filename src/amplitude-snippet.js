(function(window, document) {
  var amplitude = window.amplitude || {'_q':[],'_iq':{}};
  var as = document.createElement('script');
  as.type = 'text/javascript';
  as.integrity = 'sha384-oWs8hKmGqwXPvhJ3GQdxhA3ISupAlTmgnfh62DJBuL7xmwpVfUXX+0isD7ndGrY7';
  as.crossOrigin = 'anonymous';
  as.async = true;
  as.src = 'https://cdn.amplitude.com/libs/amplitude-6.1.0-min.gz.js';
  as.onload = function() {if(!window.amplitude.runQueuedFunctions) {console.log('[Amplitude] Error: could not load SDK');}};
  var s = document.getElementsByTagName('script')[0];
  s.parentNode.insertBefore(as, s);
  function proxy(obj, fn) {
    obj.prototype[fn] = function() {
      this._q.push([fn].concat(Array.prototype.slice.call(arguments, 0))); return this;
    };
  }
  var Identify = function() {this._q = []; return this;};
  var identifyFuncs = ['add', 'append', 'clearAll', 'prepend', 'set', 'setOnce', 'unset'];
  for (var i = 0; i < identifyFuncs.length; i++) {proxy(Identify,identifyFuncs[i]);}
  amplitude.Identify = Identify;
  var funcs = ['init', 'logEvent', 'setUserId', 'setUserProperties',
               'setOptOut', 'setVersionName', 'setDeviceId', 'enableTracking',
               'setGlobalUserProperties', 'identify', 'clearUserProperties',
               'setGroup', 'regenerateDeviceId', 'groupIdentify', 'onInit',
               'logEventWithTimestamp', 'logEventWithGroups', 'setSessionId', 'resetSessionId'];
  function setUpProxy(instance) {
    function proxyMain(fn) {
      instance[fn] = function() {
        instance._q.push([fn].concat(Array.prototype.slice.call(arguments, 0)));
      };
    }
    for (var k = 0; k < funcs.length; k++) {proxyMain(funcs[k]);}
  }
  setUpProxy(amplitude);
  amplitude.getInstance = function(instance) {
    instance = ((!instance || instance.length===0) ? '$default_instance' : instance).toLowerCase();
    if (!amplitude._iq.hasOwnProperty(instance)) {
      amplitude._iq[instance] = {'_q':[]}; setUpProxy(amplitude._iq[instance]);
    }
    return amplitude._iq[instance];
  };
  window.amplitude = amplitude;
})(window, document);
