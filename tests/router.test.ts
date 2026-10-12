import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRoute, parseRoute, routeHash } from '../web/router';

test('document routes preserve tabs and notification discussion targets', () => {
  for (const tab of ['document', 'history'] as const) {
    const route = { id: 'FEAT-interface-language', tab, thread: 'REVIEW-123' };
    assert.deepEqual(parseRoute(routeHash(route)), route);
  }
  assert.deepEqual(parseRoute('#/documents/FEAT-interface-language'), { id: 'FEAT-interface-language', tab: 'document' });
});

test('malformed routes and unsupported view parameters are safe', () => {
  for (const value of ['', '#unknown', '#/documents/%ZZ', '#/documents/../path']) assert.deepEqual(parseRoute(value), defaultRoute);
  assert.deepEqual(parseRoute('#/documents/FEATURE-123?tab=edit&thread=../bad'), { id: 'FEATURE-123', tab: 'document' });
});

test('legacy overview links open the unified work page and retain discussion targets',()=>{
  assert.deepEqual(parseRoute('#/documents/WORK-123?tab=overview&thread=REVIEW-123'),{id:'WORK-123',tab:'document',thread:'REVIEW-123'});
});
