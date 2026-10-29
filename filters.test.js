import test from 'node:test';
import assert from 'node:assert/strict';
import { category, parsePost } from '../src/worker.js';

const now = () => new Date(Date.now() - 5 * 60_000).toISOString();
const post = (text, overrides = {}) => ({
  text,
  url: 'https://www.threads.com/@example/post/ABC123',
  published_at: now(),
  is_reply: false,
  is_paid_partnership: false,
  author_username: 'example',
  ...overrides
});

test('a direct search for a psychologist is accepted', () => {
  assert.equal(category('Посоветуйте хорошего психолога онлайн, пожалуйста'), 'Прямой запрос');
  assert.ok(parsePost(post('Ищу психолога для онлайн-сессий')));
});

test('a potential problem statement is accepted', () => {
  assert.equal(category('Не справляюсь с ежедневными нагрузками'), 'Потенциальный запрос');
});

test('bare abbreviations and topic discussion are not a lead', () => {
  assert.equal(category('Как вы относитесь к психологам с ПРЛ?'), null);
  assert.equal(category('Что такое ПТСР?'), null);
});

test('an abbreviation with a first-person problem is potential', () => {
  assert.equal(category('У меня ПТСР, как справиться?'), 'Потенциальный запрос');
});

test('explicit marketing, recruitment, and peer events are filtered', () => {
  assert.equal(category('Ищем психолога в нашу команду на работу'), null);
  assert.equal(category('Ищу психологов для платной интервизии'), null);
  assert.equal(category('Ищу психолога для рекламы и продвижения аккаунта'), null);
});

test('reply and paid partnership flags are rejected', () => {
  assert.equal(parsePost(post('Нужен психолог', { is_reply: true })), null);
  assert.equal(parsePost(post('Нужен психолог', { is_paid_partnership: true })), null);
  assert.equal(parsePost(post('Нужен психолог', { is_reply: undefined })), null);
});

test('malformed URL and stale posts are rejected', () => {
  assert.equal(parsePost(post('Нужен психолог', { url: 'https://example.com/post/ABC' })), null);
  assert.equal(parsePost(post('Нужен психолог', {
    published_at: new Date(Date.now() - 4 * 60 * 60_000).toISOString()
  })), null);
});

test('deduplication key is a canonical Threads URL', () => {
  const result = parsePost(post('Нужен психолог', {
    url: 'https://www.threads.com/@example/post/ABC123?utm_source=demo#fragment'
  }));
  assert.equal(result?.id, 'https://www.threads.com/@example/post/ABC123');
});
