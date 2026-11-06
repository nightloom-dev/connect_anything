import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { siteAddress } from './site.ts';

const OPENED_AT = 'http://localhost:5180';

describe('siteAddress', () => {
  test('is the origin the page is opened at when nothing is configured', () => {
    for (const configured of [undefined, '', '   ']) assert.equal(siteAddress(configured, OPENED_AT), OPENED_AT);
  });

  test('is the configured address without its trailing slash, as the watcher takes PUBLIC_URL', () => {
    assert.equal(siteAddress('https://connect.example.org/', OPENED_AT), 'https://connect.example.org');
    assert.equal(siteAddress(' https://connect.example.org ', OPENED_AT), 'https://connect.example.org');
    assert.equal(siteAddress('https://example.org/connect//', OPENED_AT), 'https://example.org/connect');
    assert.equal(siteAddress('http://192.168.1.20:4173', OPENED_AT), 'http://192.168.1.20:4173');
  });

  test('drops a query and a hash, which the alert link would carry before its own', () => {
    assert.equal(siteAddress('https://connect.example.org/?ref=x#top', OPENED_AT), 'https://connect.example.org');
  });

  test('writes the scheme and the host in lower case, as a browser does', () => {
    assert.equal(siteAddress('HTTPS://Connect.Example.ORG', OPENED_AT), 'https://connect.example.org');
  });

  test('falls back on what is not an http(s) address', () => {
    for (const configured of ['connect.example.org', '/kamino', 'javascript:alert(1)', 'ftp://connect.example.org', 'https://', 7, true])
      assert.equal(siteAddress(configured, OPENED_AT), OPENED_AT, String(configured));
  });
});
