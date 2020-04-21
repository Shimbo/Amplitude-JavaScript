/*
 * Persist SDK event metadata
 * Uses cookie if available, otherwise fallback to localstorage.
 */

import Base64 from './base64';
import baseCookie from './base-cookie';

class MetadataStorage {
  constructor({storageKey, secure, expirationDays, path}) {
    this.storageKey = storageKey;
    this.secure = secure;
    this.expirationDays = expirationDays;
    this.path = path;
  }

  getCookieStorageKey() {
    return `${this.storageKey}`;
  }

  save({ deviceId, userId, optOut, sessionId, lastEventTime, eventId, identifyId, sequenceNumber }) {
    // do not change the order of these items
    const value = [
      deviceId,
      Base64.encode(userId || ''),
      optOut ? '1' : '',
      sessionId ? sessionId.toString(32) : '0',
      lastEventTime ? lastEventTime.toString(32) : '0',
      eventId ? eventId.toString(32) : '0',
      identifyId ? identifyId.toString(32) : '0',
      sequenceNumber ? sequenceNumber.toString(32) : '0'
    ].join('.');

    baseCookie.set(
      this.getCookieStorageKey(),
      value,
      { secure: this.secure, expirationDays: this.expirationDays, path: this.path }
    );
  }

  load() {
    const str = baseCookie.get(this.getCookieStorageKey() + '=');

    if (!str) {
      return null;
    }

    const values = str.split('.');

    let userId = null;
    if (values[1]) {
      try {
        userId = Base64.decode(values[1]);
      } catch (e) {
        userId = null;
      }
    }

    return {
      deviceId: values[0],
      userId,
      optOut: values[2] === '1',
      sessionId: parseInt(values[3], 32),
      lastEventTime: parseInt(values[4], 32),
      eventId: parseInt(values[5], 32),
      identifyId: parseInt(values[6], 32),
      sequenceNumber: parseInt(values[7], 32)
    };
  }
}

export default MetadataStorage;