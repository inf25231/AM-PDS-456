import {test, describe, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';

import {getServerConfig, assertConfig} from '../src/config.js';

// getServerConfig reads from process.env, so we save and restore the relevant
// variables around each test to keep them isolated.
const ENV_KEYS = ['PORT', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'CORS_ORIGIN'];

let savedEnv;

beforeEach(() => {
    savedEnv = {};
    for (const key of ENV_KEYS) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
    }
});

afterEach(() => {
    for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = savedEnv[key];
        }
    }
});

// A helper that fills in all required env vars, so individual tests can override
// just the one value they care about.
function setValidEnv() {
    process.env.PORT = '8080';
    process.env.LIVEKIT_URL = 'wss://example.test';
    process.env.LIVEKIT_API_KEY = 'key';
    process.env.LIVEKIT_API_SECRET = 'secret';
}

describe('getServerConfig - allowedOrigin parsing', () => {
    test('defaults to "*" when CORS_ORIGIN is unset', () => {
        setValidEnv();
        assert.equal(getServerConfig().allowedOrigin, '*');
    });

    test('returns "*" when CORS_ORIGIN is explicitly "*"', () => {
        setValidEnv();
        process.env.CORS_ORIGIN = '*';
        assert.equal(getServerConfig().allowedOrigin, '*');
    });

    test('splits a comma-separated list into trimmed origins', () => {
        setValidEnv();
        process.env.CORS_ORIGIN = 'https://a.com, https://b.com ,https://c.com';
        assert.deepEqual(getServerConfig().allowedOrigin, [
            'https://a.com',
            'https://b.com',
            'https://c.com'
        ]);
    });
});

describe('assertConfig', () => {
    test('passes when all required values are present', () => {
        setValidEnv();
        assert.doesNotThrow(() => assertConfig(getServerConfig()));
    });

    test('throws and names a missing PORT', () => {
        setValidEnv();
        delete process.env.PORT;
        assert.throws(() => assertConfig(getServerConfig()), /PORT/);
    });

    test('throws and lists every missing variable', () => {
        // Nothing is set at all.
        assert.throws(
            () => assertConfig(getServerConfig()),
            /LIVEKIT_URL.*LIVEKIT_API_KEY.*LIVEKIT_API_SECRET/
        );
    });

    test('rejects a non-numeric PORT', () => {
        setValidEnv();
        process.env.PORT = 'not-a-number';
        assert.throws(() => assertConfig(getServerConfig()), /PORT/);
    });
});
